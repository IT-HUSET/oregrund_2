import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from './domain/boards/board.ts'
import { makeBoard } from './domain/boards/__fixtures__/boards.ts'
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

function fakeModel(name: string, info: ElementInfo = beamInfo, boards: Board[] = []): LoadedIfcModel {
  const root = new THREE.Group()
  root.name = name
  return {
    root,
    meshCount: 1,
    getElementInfo: vi.fn(async () => info),
    getBoards: vi.fn(async () => boards),
    dispose: vi.fn(),
  }
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
    expect(within(screen.getByRole('banner')).getByRole('img', { name: 'Lindbäcks' })).toBeInTheDocument()
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
    expect(within(panel).getByRole('table', { name: 'Gemensamma egenskaper – balk' })).toHaveTextContent('BeteckningFD5')
    expect(within(panel).getByRole('table', { name: 'Mängder – balk' })).toHaveTextContent('Längd255 mm')
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

const boardsA = [
  makeBoard('1 Stud 45x220 C24', 2408, { oid: '589830' }),
  makeBoard('2 Stud 45x220 C24', 1200, { oid: '589831' }),
  makeBoard('U9 Glulam beam 42x270 GL', 3000, { oid: '589997' }),
]
const boardsB = [makeBoard('9 Joist 45x195 C24', 4200, { oid: '700001' })]

const tab = (name: string) => screen.getByRole('tab', { name })
const pieceOids = () =>
  within(screen.getByRole('table', { name: 'Pieces' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent)

// Board list: the tab bar and the Boards tab in the app shell
describe('App tabs', () => {
  it('shows the tab bar only once a model has loaded, with 3D model selected', async () => {
    loadMock.mockResolvedValueOnce(fakeModel('model-a'))
    render(<App />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()

    await choose('a.ifc')
    await expectModel('model-a')
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(tab('3D-modell')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Brädor')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel', { name: '3D-modell' })).toContainElement(screen.getByTestId('viewport'))
  })

  it('does not show the tab bar when the first load fails', async () => {
    loadMock.mockRejectedValueOnce(new IfcLoadError('parse', 'bad'))
    render(<App />)
    await choose('broken.ifc')
    await screen.findByRole('alert')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  // S04 + S05: switching tabs keeps the viewport mounted with its selection
  it('switches to Boards and back without recreating the 3D view', async () => {
    const model = fakeModel('model-a', beamInfo, boardsA)
    loadMock.mockResolvedValueOnce(model)
    render(<App />)
    await loadAndPick()
    const viewport = screen.getByTestId('viewport')

    await userEvent.click(tab('Brädor'))
    expect(tab('Brädor')).toHaveAttribute('aria-selected', 'true')
    expect(tab('3D-modell')).toHaveAttribute('aria-selected', 'false')
    const panel = screen.getByRole('tabpanel', { name: 'Brädor' })
    expect(await within(panel).findByRole('table', { name: 'Pieces' })).toBeInTheDocument()
    expect(pieceOids()).toEqual(['589997', '589831', '589830'])
    expect(screen.queryByRole('tabpanel', { name: '3D-modell' })).not.toBeInTheDocument() // hidden

    await userEvent.click(tab('3D-modell'))
    expect(screen.getByTestId('viewport')).toBe(viewport)
    expect(viewport).toHaveAttribute('data-model', 'model-a')
    expect(viewport).toHaveAttribute('data-selected', '38')
    expect(screen.queryByRole('tabpanel', { name: 'Brädor' })).not.toBeInTheDocument()

    await userEvent.click(tab('Brädor'))
    await userEvent.click(tab('3D-modell'))
    await userEvent.click(tab('Brädor'))
    expect(model.getBoards).toHaveBeenCalledTimes(1)
  })

  it('switches tabs with the arrow keys', async () => {
    loadMock.mockResolvedValueOnce(fakeModel('model-a', beamInfo, boardsA))
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')

    tab('3D-modell').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tab('Brädor')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Brädor')).toHaveFocus()
    expect(tab('3D-modell')).toHaveAttribute('tabindex', '-1')

    await userEvent.keyboard('{ArrowRight}')
    expect(tab('Kapning')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Kapning')).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')
    expect(tab('3D-modell')).toHaveAttribute('aria-selected', 'true')
    expect(tab('3D-modell')).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}')
    expect(tab('Kapning')).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Home}')
    expect(tab('3D-modell')).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{End}')
    expect(tab('Kapning')).toHaveAttribute('aria-selected', 'true')
  })

  // S05: a new file resets the board list (filter and sort)
  it('shows the new model’s boards unfiltered when a new file is loaded on the Boards tab', async () => {
    loadMock
      .mockResolvedValueOnce(fakeModel('model-a', beamInfo, boardsA))
      .mockResolvedValueOnce(fakeModel('model-b', beamInfo, boardsB))
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(tab('Brädor'))
    await userEvent.click(await screen.findByRole('button', { name: '45x220 C24' }))
    await userEvent.click(screen.getByRole('button', { name: 'OID' }))
    expect(screen.getByText('filtered: 45x220 C24')).toBeInTheDocument()

    await choose('b.ifc')
    await expectModel('model-b')
    expect(tab('Brädor')).toHaveAttribute('aria-selected', 'true')
    await vi.waitFor(() => expect(pieceOids()).toEqual(['700001']))
    expect(screen.queryByText(/filtered:/)).not.toBeInTheDocument()
    const pieces = screen.getByRole('table', { name: 'Pieces' })
    expect(within(pieces).getByRole('columnheader', { name: /Profil/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('shows the loading state when a new file is chosen on the Boards tab', async () => {
    const pending = deferred<LoadedIfcModel>()
    loadMock.mockResolvedValueOnce(fakeModel('model-a', beamInfo, boardsA)).mockReturnValueOnce(pending.promise)
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(tab('Brädor'))
    await screen.findByRole('table', { name: 'Pieces' })

    await choose('b.ifc')
    expect(await screen.findByRole('status')).toHaveTextContent('Loading b.ifc…')
    await act(async () => pending.resolve(fakeModel('model-b', beamInfo, boardsB)))
    await vi.waitFor(() => expect(pieceOids()).toEqual(['700001']))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('ignores the board list of a model that has since been replaced', async () => {
    const slowBoards = deferred<Board[]>()
    const first = fakeModel('model-a', beamInfo, boardsA)
    vi.mocked(first.getBoards).mockReturnValueOnce(slowBoards.promise)
    loadMock.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeModel('model-b', beamInfo, boardsB))
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(tab('Brädor'))
    expect(screen.getByText('Reading boards…')).toBeInTheDocument()

    await choose('b.ifc')
    await expectModel('model-b')
    await vi.waitFor(() => expect(pieceOids()).toEqual(['700001']))
    await act(async () => slowBoards.resolve(boardsA))
    expect(pieceOids()).toEqual(['700001'])
  })

  // S07: a failed board extraction stays inside the Boards tab
  it('shows an error in the Boards tab when the board list cannot be built', async () => {
    const model = fakeModel('model-a')
    const failure = new Error('boom')
    vi.mocked(model.getBoards).mockRejectedValueOnce(failure)
    loadMock.mockResolvedValueOnce(model)
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')

    await userEvent.click(tab('Brädor'))
    expect(await within(screen.getByRole('tabpanel')).findByText('The board list could not be built from this model.')).toBeInTheDocument()
    expect(console.error).toHaveBeenCalledWith('Failed to build the board list', failure)

    await userEvent.click(tab('3D-modell'))
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-model', 'model-a')
    await userEvent.click(screen.getByRole('button', { name: 'pick 38' }))
    expect(await screen.findByRole('heading', { name: '16mm Rörutlopp' })).toBeInTheDocument()
  })

  // S08
  it('shows an empty state for a model without boards', async () => {
    loadMock.mockResolvedValueOnce(fakeModel('model-a', beamInfo, []))
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(tab('Brädor'))
    expect(await within(screen.getByRole('tabpanel')).findByText('No boards found in this model.')).toBeInTheDocument()
  })
})

const cutOids = () =>
  screen.getAllByRole('list', { name: /board \d+:/ }).flatMap((bar) =>
    within(bar)
      .getAllByRole('listitem')
      .map((cut) => cut.textContent),
  )

// 1D cutting: the Cutting tab in the app shell
describe('App Cutting tab', () => {
  // S18
  it('shows three tabs and shares one board lookup between Boards and Cutting', async () => {
    const model = fakeModel('model-a', beamInfo, boardsA)
    loadMock.mockResolvedValueOnce(model)
    render(<App />)
    await loadAndPick()
    const viewport = screen.getByTestId('viewport')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['3D-modell', 'Brädor', 'Kapning'])

    await userEvent.click(tab('Kapning'))
    const panel = screen.getByRole('tabpanel', { name: 'Kapning' })
    expect(await within(panel).findByRole('heading', { name: 'Waste report' })).toBeInTheDocument()
    expect(cutOids()).toEqual(['589830', '589831', 'waste'])
    expect(within(panel).getByRole('heading', { name: 'Not planned (1)' })).toBeInTheDocument()

    await userEvent.click(tab('Brädor'))
    expect(await screen.findByRole('table', { name: 'Pieces' })).toBeInTheDocument()
    await userEvent.click(tab('Kapning'))
    await userEvent.click(tab('3D-modell'))
    expect(screen.getByTestId('viewport')).toBe(viewport)
    expect(viewport).toHaveAttribute('data-selected', '38')
    expect(model.getBoards).toHaveBeenCalledTimes(1)
  })

  // S18: a new file replaces the plan
  it('shows the new model’s plan when a new file is loaded on the Cutting tab', async () => {
    loadMock
      .mockResolvedValueOnce(fakeModel('model-a', beamInfo, boardsA))
      .mockResolvedValueOnce(fakeModel('model-b', beamInfo, boardsB))
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(tab('Kapning'))
    await vi.waitFor(() => expect(cutOids()).toEqual(['589830', '589831', 'waste']))

    await choose('b.ifc')
    await expectModel('model-b')
    expect(tab('Kapning')).toHaveAttribute('aria-selected', 'true')
    await vi.waitFor(() => expect(cutOids()).toEqual(['700001']))
  })

  // S17 (c): a failed board lookup stays inside the tab
  it('shows the board-list error in the Cutting tab and keeps the 3D view', async () => {
    const model = fakeModel('model-a')
    vi.mocked(model.getBoards).mockRejectedValueOnce(new Error('boom'))
    loadMock.mockResolvedValueOnce(model)
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')

    await userEvent.click(tab('Kapning'))
    const panel = screen.getByRole('tabpanel', { name: 'Kapning' })
    expect(await within(panel).findByText('The board list could not be built from this model.')).toBeInTheDocument()
    await userEvent.click(tab('3D-modell'))
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-model', 'model-a')
  })
})
