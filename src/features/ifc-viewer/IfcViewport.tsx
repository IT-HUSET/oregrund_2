import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { ViewportSelection } from './selection.ts'
import './IfcViewport.css'

interface IfcViewportProps {
  // Root of the model to show (meshes carry `userData.expressID`), or null for an empty view.
  model: THREE.Object3D | null
  selection: ViewportSelection
  // Called with the expressID of the clicked element, or null when empty space is clicked.
  onPick(expressId: number | null): void
  // Called by "Show whole model" to turn ghosting off.
  onShowWholeModel?(): void
}

interface Stage {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  render(): void
  // A framing that waits for the (hidden) container to get a size.
  pendingFrame: (() => void) | null
}

// Clicks that move the pointer further than this are drags (rotate/pan), not picks.
const CLICK_TOLERANCE_PX = 4

const highlightMaterial = new THREE.MeshLambertMaterial({
  color: 0xff7a00,
  emissive: 0x662200,
  side: THREE.DoubleSide,
})

const relatedMaterial = new THREE.MeshLambertMaterial({
  color: 0xffb870,
  emissive: 0x4d2600,
  side: THREE.DoubleSide,
})

// Translucent and without depth writes, so the opaque highlighted meshes show through it.
const ghostMaterial = new THREE.MeshLambertMaterial({
  color: 0xaab4be,
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
  side: THREE.DoubleSide,
})

export function IfcViewport({ model, selection, onPick, onShowWholeModel }: IfcViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const onPickRef = useRef(onPick)
  const selectionRef = useRef(selection)
  const [unsupported] = useState(() => !isWebGLAvailable())
  const { primary, related, ghostOthers, frameRequest } = selection

  useEffect(() => {
    onPickRef.current = onPick
    selectionRef.current = selection
  }, [onPick, selection])

  // Renderer, camera, controls and picking live for the lifetime of the component.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch (error) {
      console.error('Could not create a WebGL renderer', error)
      return
    }
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef1f4)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(1, 2, 1.5)
    scene.add(sun)

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 100_000)
    camera.position.set(10, 10, 10)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false

    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)
    const stage: Stage = { renderer, scene, camera, controls, render, pendingFrame: null }
    stageRef.current = stage

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
      const pending = stage.pendingFrame
      stage.pendingFrame = null
      pending?.()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let down: { x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!down || e.button !== 0) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved > CLICK_TOLERANCE_PX) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const root = scene.getObjectByName('ifc-model')
      const hit = root ? raycaster.intersectObject(root, true)[0] : undefined
      const id = hit?.object.userData.expressID
      onPickRef.current(typeof id === 'number' ? id : null)
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    return () => {
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      stageRef.current = null
    }
  }, [])

  // Swap the shown model and frame it. Disposing model resources is the owner's job.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !model) return
    stage.scene.add(model)
    frame(stage, model)
    return () => {
      stage.scene.remove(model)
      stage.render()
    }
  }, [model])

  // Highlight every mesh of the primary and related elements, and ghost the rest if asked.
  // Materials are swapped, never mutated, and restored from the originals kept here.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !model || (primary === null && related.length === 0 && !ghostOthers)) return
    const relatedIds = new Set(related)
    const originals = new Map<THREE.Mesh, THREE.Mesh['material']>()
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const id = obj.userData.expressID
      const material =
        id === primary ? highlightMaterial : relatedIds.has(id) ? relatedMaterial : ghostOthers ? ghostMaterial : null
      if (!material) return
      originals.set(obj, obj.material)
      obj.material = material
    })
    stage.render()
    return () => {
      for (const [mesh, material] of originals) mesh.material = material
      stage.render()
    }
  }, [model, primary, related, ghostOthers])

  // Frame the selected elements once per frame request, keeping the viewing direction. A hidden
  // viewport has no size yet, so the framing waits for the next resize.
  useEffect(() => {
    const stage = stageRef.current
    const container = containerRef.current
    if (!stage || !container || !model || frameRequest === 0) return
    const { primary: p, related: r } = selectionRef.current
    const ids = new Set([...r, ...(p === null ? [] : [p])])
    const run = () => frameElements(stage, model, ids)
    if (container.clientWidth > 0 && container.clientHeight > 0) run()
    else stage.pendingFrame = run
    return () => {
      if (stage.pendingFrame === run) stage.pendingFrame = null
    }
  }, [model, frameRequest])

  if (unsupported) {
    return (
      <div className="viewport viewport--message" role="alert">
        Your browser does not support 3D rendering. Use Chrome or Edge.
      </div>
    )
  }

  return (
    <div className="viewport" ref={containerRef}>
      {model && (
        <div className="viewport__controls">
          {ghostOthers && onShowWholeModel && (
            <button type="button" onClick={onShowWholeModel}>
              Show whole model
            </button>
          )}
          <button type="button" onClick={() => stageRef.current && frame(stageRef.current, model)}>
            Reset view
          </button>
        </div>
      )}
    </div>
  )
}

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

// Point the camera at the model's bounding box from a fixed isometric-ish direction.
function frame(stage: Stage, model: THREE.Object3D) {
  fitBox(stage, new THREE.Box3().setFromObject(model), new THREE.Vector3(1, 0.8, 1))
}

// Fit the meshes of the given elements, looking from the current direction.
function frameElements(stage: Stage, model: THREE.Object3D, ids: ReadonlySet<number>) {
  const box = new THREE.Box3()
  model.updateWorldMatrix(true, true)
  model.traverse((obj) => {
    if (obj instanceof THREE.Mesh && ids.has(obj.userData.expressID)) box.expandByObject(obj)
  })
  fitBox(stage, box, stage.camera.position.clone().sub(stage.controls.target))
}

function fitBox(stage: Stage, box: THREE.Box3, direction: THREE.Vector3) {
  if (box.isEmpty()) return
  const center = box.getCenter(new THREE.Vector3())
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius || 1
  const { camera, controls } = stage
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))
  camera.near = distance / 1000
  camera.far = distance * 100
  if (direction.lengthSq() === 0) direction.set(1, 0.8, 1)
  camera.position.copy(center).add(direction.normalize().multiplyScalar(distance))
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()
  stage.render()
}
