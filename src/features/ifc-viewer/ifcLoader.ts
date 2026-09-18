import * as THREE from 'three'
import { IFCUNITASSIGNMENT, type IfcAPI } from 'web-ifc'
import {
  resolveProjectUnits,
  toElementInfo,
  type ElementInfo,
  type ProjectUnits,
} from '../../domain/ifc/elementInfo.ts'

export type IfcLoadErrorKind = 'parse' | 'no-geometry' | 'too-large' | 'unexpected'

export class IfcLoadError extends Error {
  readonly kind: IfcLoadErrorKind

  constructor(kind: IfcLoadErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'IfcLoadError'
    this.kind = kind
  }
}

export interface LoadedIfcModel {
  // Root of the scene graph (Y-up). Every mesh has `userData.expressID`.
  root: THREE.Group
  meshCount: number
  getElementInfo(expressId: number): Promise<ElementInfo>
  // Frees GPU resources and the web-ifc model. The model must not be used afterwards.
  dispose(): void
}

// Each load gets its own web-ifc instance: a failed parse can leave the WASM heap corrupt,
// and the previously shown model must stay usable.
export async function loadIfcModel(
  bytes: Uint8Array,
  createApi: () => Promise<IfcAPI>,
): Promise<LoadedIfcModel> {
  if (!hasStepHeader(bytes)) {
    throw new IfcLoadError('parse', 'File does not start with an ISO-10303-21 header')
  }

  const api = await createApi()
  let modelId: number
  try {
    modelId = api.OpenModel(bytes)
    if (modelId < 0 || !api.GetModelSchema(modelId)) throw new Error('No IFC schema')
  } catch (error) {
    safeDispose(api)
    throw classify(error, 'parse')
  }

  try {
    const root = buildScene(api, modelId)
    const meshCount = root.children.length
    if (meshCount === 0) {
      disposeScene(root)
      throw new IfcLoadError('no-geometry', 'The model contains no displayable geometry')
    }
    const units = readProjectUnits(api, modelId)

    return {
      root,
      meshCount,
      async getElementInfo(expressId) {
        const attributes = await api.properties.getItemProperties(modelId, expressId, false)
        const propertyDefinitions = await api.properties.getPropertySets(modelId, expressId, true)
        return toElementInfo({
          expressId,
          ifcTypeName: api.GetNameFromTypeCode(attributes.type) ?? '',
          attributes,
          propertyDefinitions,
          units,
        })
      },
      dispose() {
        disposeScene(root)
        safeDispose(api)
      },
    }
  } catch (error) {
    safeDispose(api)
    throw classify(error, 'unexpected')
  }
}

function buildScene(api: IfcAPI, modelId: number): THREE.Group {
  const root = new THREE.Group()
  root.name = 'ifc-model'
  // IFC is Z-up; three.js is Y-up.
  root.rotation.x = -Math.PI / 2
  const materials = new Map<string, THREE.Material>()
  const matrix = new THREE.Matrix4()

  api.StreamAllMeshes(modelId, (flatMesh) => {
    const placed = flatMesh.geometries
    for (let i = 0; i < placed.size(); i++) {
      const pg = placed.get(i)
      const ifcGeometry = api.GetGeometry(modelId, pg.geometryExpressID)
      const vertexData = api.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize())
      const indexData = api.GetIndexArray(ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize())
      ifcGeometry.delete()
      if (indexData.length === 0) continue

      const mesh = new THREE.Mesh(toBufferGeometry(vertexData, indexData), material(materials, pg.color))
      matrix.fromArray(pg.flatTransformation)
      mesh.applyMatrix4(matrix)
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      mesh.userData.expressID = flatMesh.expressID
      root.add(mesh)
    }
  })
  root.updateMatrixWorld(true)
  return root
}

// web-ifc vertex data is interleaved: position (x, y, z) then normal (x, y, z).
function toBufferGeometry(vertexData: Float32Array, indexData: Uint32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const interleaved = new THREE.InterleavedBuffer(vertexData.slice(), 6)
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0))
  geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleaved, 3, 3))
  geometry.setIndex(new THREE.BufferAttribute(indexData.slice(), 1))
  return geometry
}

function material(
  cache: Map<string, THREE.Material>,
  color: { x: number; y: number; z: number; w: number },
): THREE.Material {
  const key = `${color.x},${color.y},${color.z},${color.w}`
  let m = cache.get(key)
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color.x, color.y, color.z),
      transparent: color.w < 1,
      opacity: color.w,
      side: THREE.DoubleSide,
      depthWrite: color.w >= 1,
    })
    cache.set(key, m)
  }
  return m
}

function readProjectUnits(api: IfcAPI, modelId: number): ProjectUnits {
  const ids = api.GetLineIDsWithType(modelId, IFCUNITASSIGNMENT)
  if (ids.size() === 0) return {}
  return resolveProjectUnits(api.GetLine(modelId, ids.get(0), true))
}

export function disposeScene(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>()
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      for (const m of [obj.material].flat()) materials.add(m)
    }
  })
  materials.forEach((m) => m.dispose())
  root.removeFromParent()
}

function hasStepHeader(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 64)).replace(/^﻿/, '').trimStart()
  return head.startsWith('ISO-10303-21')
}

function classify(error: unknown, fallback: IfcLoadErrorKind): IfcLoadError {
  if (error instanceof IfcLoadError) return error
  const message = error instanceof Error ? error.message : String(error)
  const kind =
    error instanceof RangeError || /out of memory|allocation failed|could not allocate/i.test(message)
      ? 'too-large'
      : fallback
  return new IfcLoadError(kind, message, { cause: error })
}

function safeDispose(api: IfcAPI): void {
  try {
    api.Dispose()
  } catch {
    // The WASM instance may already be unusable after a failed parse.
  }
}
