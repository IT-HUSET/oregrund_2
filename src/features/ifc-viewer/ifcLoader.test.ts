// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { IfcAPI } from 'web-ifc'
import { describe, expect, it, vi } from 'vitest'
import { IfcLoadError, loadIfcModel } from './ifcLoader.ts'

// Runs the real web-ifc (node build) against hand-authored, anonymised fixtures.
const fixture = (name: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))))

const bytes = (text: string) => new TextEncoder().encode(text)

async function createNodeIfcApi(): Promise<IfcAPI> {
  const api = new IfcAPI()
  await api.Init(undefined, true)
  return api
}

async function loadError(input: Uint8Array): Promise<IfcLoadError> {
  const error = await loadIfcModel(input, createNodeIfcApi).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(IfcLoadError)
  return error as IfcLoadError
}

describe('loadIfcModel', () => {
  // S01: a valid model becomes meshes tagged with their IFC expressID
  it('builds meshes tagged with expressID', async () => {
    const model = await loadIfcModel(fixture('beam.ifc'), createNodeIfcApi)
    const ids = model.root.children.map((m) => m.userData.expressID)
    expect(ids).toContain(38)
    expect(ids).toContain(47)
    expect(model.root.children.every((m) => m instanceof THREE.Mesh)).toBe(true)
    model.dispose()
  })

  // S02 + S03: clicked element info with decoded name, pset and quantities
  it('looks up element info by expressID', async () => {
    const model = await loadIfcModel(fixture('beam.ifc'), createNodeIfcApi)
    const info = await model.getElementInfo(38)
    expect(info).toMatchObject({ name: 'FX1 Rörbalk 45x182 C24', ifcType: 'IFCBEAM', tag: '900001' })
    expect(info.propertySets.map((p) => p.name)).toEqual(['Pset_BeamCommon'])
    expect(info.quantitySets[0].quantities).toContainEqual({ name: 'Length', value: '1200', unit: 'mm' })
    expect((await model.getElementInfo(47)).name).toBe('Dosa hög')
    model.dispose()
  })

  // Board list S02: framing and siding boards with Tag, kind, Length and prefab element
  it('extracts the boards of a model with their length and prefab element', async () => {
    const model = await loadIfcModel(fixture('boards.ifc'), createNodeIfcApi)
    const boards = await model.getBoards()

    expect(boards.map((b) => [b.oid, b.ifcType, b.kind, b.length, b.element])).toEqual([
      ['900101', 'IFCBEAM', 'framing', 2408, 'GOLV-999*'],
      ['900102', 'IFCCOLUMN', 'framing', 2399.9999999, 'GOLV-999*'],
      ['900103', 'IFCCOVERING', 'siding', 3000, 'GOLV-999*'],
    ])
    expect(boards[2]).toMatchObject({
      name: '36 Siding board 22x145_sta_Z C16*',
      role: 'Siding board',
      profile: { label: '22x145_sta_Z' },
      grade: 'C16',
      issues: [],
    })
    expect(boards.map((b) => b.oid)).not.toContain('900104') // IFCBUILDINGELEMENTPROXY
    expect(boards.map((b) => b.oid)).not.toContain('900105') // IFCPLATE
    model.dispose()
  })

  it('extracts the boards only once per model', async () => {
    let api: IfcAPI | undefined
    const model = await loadIfcModel(fixture('boards.ifc'), async () => (api = await createNodeIfcApi()))
    const lineIdsWithType = vi.spyOn(api!, 'GetLineIDsWithType')

    const first = await model.getBoards()
    const calls = lineIdsWithType.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    expect(await model.getBoards()).toBe(first)
    expect(lineIdsWithType).toHaveBeenCalledTimes(calls)
    model.dispose()
  })

  it('lists a board without a parent assembly with an empty element', async () => {
    const model = await loadIfcModel(fixture('beam.ifc'), createNodeIfcApi)
    const boards = await model.getBoards()
    expect(boards).toHaveLength(1) // the proxy is not a board
    expect(boards[0]).toMatchObject({ oid: '900001', element: '', length: 1200, grade: 'C24' })
    model.dispose()
  })

  // S06: non-IFC content is rejected as a parse error
  it('rejects non-IFC bytes with a parse error', async () => {
    const error = await loadError(bytes('hello, this is not an IFC file'))
    expect(error.kind).toBe('parse')
  })

  it('rejects a STEP header followed by garbage', async () => {
    const error = await loadError(bytes('ISO-10303-21;\n#1=garbage((;'))
    expect(['parse', 'no-geometry']).toContain(error.kind)
  })

  // S07: a valid IFC without geometry
  it('rejects a model without geometry', async () => {
    const error = await loadError(fixture('no-geometry.ifc'))
    expect(error.kind).toBe('no-geometry')
  })

  // S06: a failed load does not break a model that is already loaded
  it('keeps a previously loaded model usable after a failed load', async () => {
    const model = await loadIfcModel(fixture('beam.ifc'), createNodeIfcApi)
    await loadError(bytes('not ifc'))
    await loadError(bytes('ISO-10303-21;\n#1=garbage((;'))
    await loadError(fixture('no-geometry.ifc'))
    expect((await model.getElementInfo(38)).tag).toBe('900001')
    model.dispose()
  })
})
