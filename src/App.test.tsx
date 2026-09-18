import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ElementInfo } from './domain/ifc/elementInfo.ts'
import { IfcLoadError, loadIfcModel, type LoadedIfcModel } from './features/ifc-viewer/ifcLoader.ts'
import App from './App.tsx'

// WebGL is unavailable in jsdom: the viewport is replaced by a stub that shows which model is
// mounted and lets tests simulate picks. The loader is mocked; its behaviour is covered by
// src/features/ifc-viewer/ifcLoader.test.ts.
vi.mock('./features/ifc-viewer/IfcViewport.tsx', () => ({
  IfcViewport: (props: { model: THREE.Object3D | null; selectedExpressId: number | null; onPick(id: number | null): void }) => (
    <div data-testid="viewport" data-model={props.model?.name ?? ''} data-selected={props.selectedExpressId ?? ''}>
      <button onClick={() => props.onPick(38)}>pick 38</button>
      <button onClick={() => props.onPick(null)}>pick empty</button>
    </div>
  ),
}))
vi.mock('./features/ifc-viewer/createIfcApi.ts', () => ({ createBrowserIfcApi: vi.fn() }))
vi.mock('./features/ifc-viewer/ifcLoader.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./features/ifc-viewer/ifcLoader.ts')>()),
  loadIfcModel: vi.fn(),
}))

const loadMock = vi.mocked(loadIfcModel)

const beamInfo: ElementInfo = {
  expressId: 38,
  name: '16mm Rörutlopp',
  ifcType: 'IFCBEAM',
  globalId: '0GO7ParmT1Tv4$2Iz4gRMP',
  tag: '589830',
  propertySets: [{ name: 'Pset_BeamCommon', properties: [{ name: 'Reference', value: 'FD5' }] }],
  quantitySets: [{ name: 'Qto_BeamBaseQuantities', quantities: [{ name: 'Length', value: '255', unit: 'mm' }] }],
}

function fakeModel(name: string, info: ElementInfo = beamInfo): LoadedIfcModel {
  const root = new THREE.Group()
  root.name = name
  return { root, meshCount: 1, getElementInfo: vi.fn(async () => info), dispose: vi.fn() }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const ifcFile = (name: string) => new File(['ISO-10303-21;'], name)

async function choose(name: string) {
  await userEvent.upload(screen.getByLabelText('IFC file'), ifcFile(name))
}

async function expectModel(name: string) {
  await vi.waitFor(() => expect(screen.getByTestId('viewport')).toHaveAttribute('data-model', name))
}

async function loadAndPick() {
  await choose('a.ifc')
  await expectModel('model-a')
  await userEvent.click(screen.getByRole('button', { name: 'pick 38' }))
}

beforeEach(() => {
  loadMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('App', () => {
  it('renders the app', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Labbithuset' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose IFC file' })).toBeInTheDocument()
    expect(screen.getByLabelText('IFC file')).toHaveAttribute('accept', '.ifc')
  })

  // S01
  it('shows a loading state naming the file, then the model', async () => {
    const pending = deferred<LoadedIfcModel>()
    loadMock.mockReturnValueOnce(pending.promise)
    render(<App />)

    await choose('772_H811_new.ifc')
    expect(await screen.findByRole('status')).toHaveTextContent('Loading 772_H811_new.ifc…')

    await act(async () => pending.resolve(fakeModel('model-a')))
    await expectModel('model-a')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('772_H811_new.ifc')).toBeInTheDocument()
  })

  // S02 + S03
  it('shows identity, properties and quantities of the picked element', async () => {
    loadMock.mockResolvedValueOnce(fakeModel('model-a'))
    render(<App />)
    await loadAndPick()

    const panel = screen.getByRole('complementary', { name: 'Element details' })
    expect(await within(panel).findByRole('heading', { name: '16mm Rörutlopp' })).toBeInTheDocument()
    expect(panel).toHaveTextContent('IFCBEAM')
    expect(panel).toHaveTextContent('589830')
    expect(panel).toHaveTextContent('0GO7ParmT1Tv4$2Iz4gRMP')
    expect(within(panel).getByRole('table', { name: 'Pset_BeamCommon' })).toHaveTextContent('ReferenceFD5')
    expect(within(panel).getByRole('table', { name: 'Qto_BeamBaseQuantities' })).toHaveTextContent('Length255 mm')
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-selected', '38')
  })

  // S04
  it('clears the selection when empty space is picked', async () => {
    loadMock.mockResolvedValueOnce(fakeModel('model-a'))
    render(<App />)
    await loadAndPick()
    await screen.findByRole('heading', { name: '16mm Rörutlopp' })

    await userEvent.click(screen.getByRole('button', { name: 'pick empty' }))
    expect(screen.queryByRole('heading', { name: '16mm Rörutlopp' })).not.toBeInTheDocument()
    expect(screen.getByText('Click a part of the model to see its details.')).toBeInTheDocument()
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-selected', '')
  })

  // S04
  it('shows explicit empty states for an element without properties or quantities', async () => {
    loadMock.mockResolvedValueOnce(fakeModel('model-a', { ...beamInfo, propertySets: [], quantitySets: [] }))
    render(<App />)
    await loadAndPick()

    expect(await screen.findByText('No properties')).toBeInTheDocument()
    expect(screen.getByText('No quantities')).toBeInTheDocument()
  })

  // S05
  it('replaces the model and clears the selection when a new file is chosen', async () => {
    const first = fakeModel('model-a')
    loadMock.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeModel('model-b'))
    render(<App />)
    await loadAndPick()
    await screen.findByRole('heading', { name: '16mm Rörutlopp' })

    await choose('b.ifc')
    await expectModel('model-b')
    expect(screen.getByText('b.ifc')).toBeInTheDocument()
    expect(screen.queryByText('a.ifc')).not.toBeInTheDocument()
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-selected', '')
    expect(screen.queryByRole('heading', { name: '16mm Rörutlopp' })).not.toBeInTheDocument()
    expect(first.dispose).toHaveBeenCalled()
  })

  // S05: overlapping loads – the last chosen file wins even if it resolves first
  it('shows only the most recently chosen file when loads overlap', async () => {
    const slow = deferred<LoadedIfcModel>()
    const stale = fakeModel('model-a')
    loadMock.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(fakeModel('model-b'))
    render(<App />)

    await choose('a.ifc')
    await choose('b.ifc')
    await expectModel('model-b')

    await act(async () => slow.resolve(stale))
    await vi.waitFor(() => expect(stale.dispose).toHaveBeenCalled())
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-model', 'model-b')
    expect(screen.getByText('b.ifc')).toBeInTheDocument()
    expect(stale.dispose).toHaveBeenCalled()
  })

  // S06
  it('shows a parse error, keeps the previous model and stays usable', async () => {
    loadMock
      .mockResolvedValueOnce(fakeModel('model-a'))
      .mockRejectedValueOnce(new IfcLoadError('parse', 'bad'))
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')

    await choose('broken.ifc')
    expect(await screen.findByRole('alert')).toHaveTextContent('The file could not be read as an IFC model.')
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-model', 'model-a')
    expect(screen.getByText('a.ifc')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose IFC file' })).toBeEnabled()
  })

  // S07
  it('explains a model without geometry', async () => {
    loadMock.mockRejectedValueOnce(new IfcLoadError('no-geometry', 'empty'))
    render(<App />)
    await choose('empty.ifc')
    expect(await screen.findByRole('alert')).toHaveTextContent('The file contains no 3D geometry to display.')
    expect(screen.getByRole('button', { name: 'Choose IFC file' })).toBeEnabled()
  })
})
