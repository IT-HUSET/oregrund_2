import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLumberyards } from './domain/1dcutting/lumberyards/lumberyards.ts'
import type { Board } from './domain/boards/board.ts'
import { makeBoard } from './domain/boards/__fixtures__/boards.ts'
import type { ElementInfo } from './domain/ifc/elementInfo.ts'
import { IfcLoadError, loadIfcModel, type LoadedIfcModel } from './features/ifc-viewer/ifcLoader.ts'
import type { ViewportSelection } from './features/ifc-viewer/selection.ts'
import App from './App.tsx'

// WebGL is unavailable in jsdom: the viewport is replaced by a stub that shows which model is
// mounted and lets tests simulate picks. The loader is mocked; its behaviour is covered by
// src/features/ifc-viewer/ifcLoader.test.ts.
vi.mock('./features/ifc-viewer/IfcViewport.tsx', () => {
  return {
    IfcViewport: (props: {
      model: THREE.Object3D | null
      selection: ViewportSelection
      onPick(id: number | null): void
      onShowWholeModel?(): void
    }) => (
      <div
        data-testid="viewport"
        data-model={props.model?.name ?? ''}
        data-selected={props.selection.primary ?? ''}
        data-related={props.selection.related.join(',')}
        data-ghost={String(props.selection.ghostOthers)}
        data-frame={props.selection.frameRequest}
      >
        <button onClick={() => props.onPick(38)}>pick 38</button>
        <button onClick={() => props.onPick(null)}>pick empty</button>
        {props.model?.children.map((child) => (
          <button key={child.id} onClick={() => props.onPick(child.userData.expressID)}>
            pick {child.name}
          </button>
        ))}
        {props.selection.ghostOthers && <button onClick={props.onShowWholeModel}>Show whole model</button>}
      </div>
    ),
  }
})
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
    expect(screen.getByRole('heading', { level: 1, name: 'Spilloptimeringsmotor' })).toBeInTheDocument()
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
    expect(tab('Brädgårdar')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Brädgårdar')).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')
    expect(tab('3D-modell')).toHaveAttribute('aria-selected', 'true')
    expect(tab('3D-modell')).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}')
    expect(tab('Brädgårdar')).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Home}')
    expect(tab('3D-modell')).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{End}')
    expect(tab('Brädgårdar')).toHaveAttribute('aria-selected', 'true')
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
  it('shows four tabs and shares one board lookup between Boards and Cutting', async () => {
    const model = fakeModel('model-a', beamInfo, boardsA)
    loadMock.mockResolvedValueOnce(model)
    render(<App />)
    await loadAndPick()
    const viewport = screen.getByTestId('viewport')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['3D-modell', 'Brädor', 'Kapning', 'Brädgårdar'])

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

// Cut traceability: the four S01 pieces plus one unplannable board
const traced = [
  makeBoard('1 Stud 45x95 C24', 2000, { oid: 'A' }),
  makeBoard('2 Stud 45x95 C24', 2000, { oid: 'B' }),
  makeBoard('3 Nogging 45x95 C24', 1500, { oid: 'C' }),
  makeBoard('4 Nogging 45x95 C24', 1000, { oid: 'D' }),
  makeBoard('5 Header 45x190 C24', 1200, { oid: 'E' }),
]
const idOf = (oid: string) => String(traced.find((b) => b.oid === oid)!.expressId)

// A model whose root has one pickable child per board, and whose element info follows the pick.
function tracedModel(name = 'model-a', boards: Board[] = traced): LoadedIfcModel {
  const model = fakeModel(name, beamInfo, boards)
  for (const board of boards) {
    const child = new THREE.Object3D()
    child.name = board.oid
    child.userData.expressID = board.expressId
    model.root.add(child)
  }
  vi.mocked(model.getElementInfo).mockImplementation(async (id) => {
    const board = boards.find((b) => b.expressId === id)!
    return { ...beamInfo, expressId: id, name: board.name, tag: board.oid }
  })
  return model
}

const viewport = () => screen.getByTestId('viewport')
const kapning = () => screen.getByRole('tabpanel', { name: 'Kapning' })
const cutting = () => screen.getByRole('region', { name: 'Cutting' })

async function openCutting() {
  loadMock.mockResolvedValueOnce(tracedModel())
  render(<App />)
  await choose('a.ifc')
  await expectModel('model-a')
  await userEvent.click(tab('Kapning'))
  await within(kapning()).findByRole('heading', { name: 'Waste report' })
}

describe('App cut traceability', () => {
  // S03
  it('shows a cut in 3D: switches tab, selects, ghosts and frames it', async () => {
    await openCutting()
    await userEvent.click(within(kapning()).getByRole('button', { name: 'Show OID C in 3D' }))

    expect(tab('3D-modell')).toHaveAttribute('aria-selected', 'true')
    expect(viewport()).toHaveAttribute('data-selected', idOf('C'))
    expect(viewport()).toHaveAttribute('data-related', '')
    expect(viewport()).toHaveAttribute('data-ghost', 'true')
    expect(viewport()).toHaveAttribute('data-frame', '1')
    expect(await screen.findByRole('heading', { name: '3 Nogging 45x95 C24' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show whole model' }))
    expect(viewport()).toHaveAttribute('data-ghost', 'false')
    expect(viewport()).toHaveAttribute('data-selected', idOf('C'))
  })

  // S04
  it('shows a whole board and a whole order line in 3D', async () => {
    await openCutting()
    await userEvent.click(within(kapning()).getByRole('button', { name: 'Show 45x95 C24 board 2: 3,300 mm in 3D' }))
    expect(viewport()).toHaveAttribute('data-selected', '')
    expect(viewport()).toHaveAttribute('data-related', `${idOf('B')},${idOf('D')}`)
    expect(viewport()).toHaveAttribute('data-ghost', 'true')
    expect(screen.getByRole('heading', { name: '2 pieces highlighted' })).toBeInTheDocument()
    expect(screen.getByText('45x95 C24 board 2: 3,300 mm')).toBeInTheDocument()

    await userEvent.click(tab('Kapning'))
    await userEvent.click(within(kapning()).getByRole('button', { name: 'Show 45x95 C24 · 3,600 mm in 3D' }))
    expect(viewport()).toHaveAttribute('data-related', `${idOf('A')},${idOf('C')}`)
    expect(viewport()).toHaveAttribute('data-frame', '2')
  })

  // S07 + S09
  it('shows the cutting context of a picked board and links back to the cut', async () => {
    loadMock.mockResolvedValueOnce(tracedModel())
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(screen.getByRole('button', { name: 'pick C' }))

    await vi.waitFor(() => expect(cutting()).toHaveTextContent('45x95 C24 · 3,600 mm · board 1'))
    expect(cutting()).toHaveTextContent('Cut 2 of 2 · offset 2,005 mm · 1,500 mm')
    expect(viewport()).toHaveAttribute('data-ghost', 'false')

    await userEvent.click(within(cutting()).getByRole('button', { name: 'Select OID A in 3D' }))
    expect(viewport()).toHaveAttribute('data-selected', idOf('A'))
    expect(viewport()).toHaveAttribute('data-related', '')
    await vi.waitFor(() => expect(cutting()).toHaveTextContent('Cut 1 of 2 · offset 0 mm · 2,000 mm'))

    await userEvent.click(within(cutting()).getByRole('button', { name: 'Show in cutting list' }))
    expect(tab('Kapning')).toHaveAttribute('aria-selected', 'true')
    const segment = within(kapning()).getByRole('listitem', { name: /^OID A ·/ })
    expect(segment).toHaveAttribute('aria-current', 'true')
    expect(within(segment).getByRole('button')).toHaveFocus()

    // A plain click in 3D after a trace ends ghosting and is a plain selection.
    await userEvent.click(tab('3D-modell'))
    await userEvent.click(screen.getByRole('button', { name: 'pick E' }))
    expect(viewport()).toHaveAttribute('data-ghost', 'false')
    await vi.waitFor(() => expect(cutting()).toHaveTextContent('Not planned: No matching stock article'))
  })

  // S10
  it('shows a Brädor row in 3D', async () => {
    loadMock.mockResolvedValueOnce(tracedModel())
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(tab('Brädor'))
    await userEvent.click(await screen.findByRole('button', { name: 'Show OID E in 3D' }))
    expect(tab('3D-modell')).toHaveAttribute('aria-selected', 'true')
    expect(viewport()).toHaveAttribute('data-selected', idOf('E'))
    expect(viewport()).toHaveAttribute('data-ghost', 'true')
  })

  // S11 (a)
  it('drops the trace when a new file is loaded', async () => {
    await openCutting()
    await userEvent.click(within(kapning()).getByRole('button', { name: 'Show OID C in 3D' }))
    loadMock.mockResolvedValueOnce(tracedModel('model-b'))
    await choose('b.ifc')
    await expectModel('model-b')
    expect(viewport()).toHaveAttribute('data-selected', '')
    expect(viewport()).toHaveAttribute('data-related', '')
    expect(viewport()).toHaveAttribute('data-ghost', 'false')
  })

  // S11 (c)
  it('explains a failed plan in the info panel and keeps picking', async () => {
    const dup = [makeBoard('1 Stud 45x95 C24', 1000, { oid: 'X' }), makeBoard('2 Stud 45x95 C24', 900, { oid: 'X' })]
    const model = fakeModel('model-a', beamInfo, dup)
    vi.mocked(model.getElementInfo).mockResolvedValue({ ...beamInfo, expressId: dup[0].expressId })
    const child = new THREE.Object3D()
    child.name = 'X'
    child.userData.expressID = dup[0].expressId
    model.root.add(child)
    loadMock.mockResolvedValueOnce(model)
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(screen.getByRole('button', { name: 'pick X' }))
    await vi.waitFor(() => expect(cutting()).toHaveTextContent('The cutting plan could not be computed for this model.'))
    expect(viewport()).toHaveAttribute('data-selected', String(dup[0].expressId))
    expect(console.error).toHaveBeenCalledWith('Failed to compute the cutting plan', expect.any(Error))
  })
})

// Lumberyards: the yard chosen in Kapning drives the plan and the info panel
const yardSelect = () => within(kapning()).getByRole('combobox', { name: 'Lumberyard' })
const kapningStat = (label: string) => within(kapning()).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
const orderLengths = () =>
  within(within(kapning()).getByRole('table', { name: 'Order list' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[3].textContent)

describe('App lumberyards', () => {
  // S07
  it('plans against the chosen yard and remembers it for the session, without storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    // 6000 and 7000 mm are longer than anything Standard stocks; Har allt has 6000 and 7200.
    const longA = [makeBoard('1 Stud 45x95 C24', 6000, { oid: 'L1' }), makeBoard('2 Stud 45x95 C24', 2000, { oid: 'L2' })]
    const longB = [makeBoard('9 Joist 45x195 C24', 7000, { oid: 'L3' })]
    loadMock.mockResolvedValueOnce(fakeModel('model-a', beamInfo, longA)).mockResolvedValueOnce(fakeModel('model-b', beamInfo, longB))
    const { unmount } = render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(tab('Kapning'))
    await within(kapning()).findByRole('heading', { name: 'Waste report' })

    expect(yardSelect()).toHaveDisplayValue('Standard brädgård')
    expect(kapningStat('Pieces placed')).toBe('1')
    expect(orderLengths()).toEqual(['3,000'])

    await userEvent.selectOptions(yardSelect(), 'Har allt brädgård')
    expect(kapningStat('Pieces placed')).toBe('2')
    expect(kapningStat('Not planned')).toBe('0')
    expect(orderLengths()).toEqual(['8,400'])

    await userEvent.click(tab('3D-modell'))
    await userEvent.click(tab('Kapning'))
    expect(yardSelect()).toHaveDisplayValue('Har allt brädgård')

    await choose('b.ifc')
    await expectModel('model-b')
    await vi.waitFor(() => expect(cutOids()).toEqual(['L3', 'waste']))
    expect(yardSelect()).toHaveDisplayValue('Har allt brädgård')
    expect(orderLengths()).toEqual(['7,200'])

    // A reload starts from the default again; nothing was stored.
    unmount()
    loadMock.mockResolvedValueOnce(fakeModel('model-a', beamInfo, longA))
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(tab('Kapning'))
    await within(kapning()).findByRole('heading', { name: 'Waste report' })
    expect(yardSelect()).toHaveDisplayValue('Standard brädgård')
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })

  // S09
  it('updates the info panel and the cutting report when the yard is switched', async () => {
    // Standard has one 45x45 C24 5400 board: the second 5147 mm piece is out of stock there.
    const scarce = [makeBoard('1 Stud 45x45 C24', 5147, { oid: 'P' }), makeBoard('2 Stud 45x45 C24', 5147, { oid: 'Q' })]
    loadMock.mockResolvedValueOnce(tracedModel('model-a', scarce))
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(tab('Kapning'))
    await userEvent.selectOptions(await within(kapning()).findByRole('combobox', { name: 'Lumberyard' }), 'Har allt brädgård')
    await userEvent.click(tab('3D-modell'))
    await userEvent.click(screen.getByRole('button', { name: 'pick Q' }))
    await vi.waitFor(() => expect(cutting()).toHaveTextContent('45x45 C24 · 5,400 mm · board'))

    await userEvent.click(tab('Kapning'))
    await userEvent.selectOptions(yardSelect(), 'Standard brädgård')
    await userEvent.click(tab('3D-modell'))
    expect(cutting()).toHaveTextContent('Not planned: Out of stock at Standard brädgård')
    expect(within(cutting()).queryByRole('button', { name: 'Show in cutting list' })).not.toBeInTheDocument()

    await userEvent.click(tab('Kapning'))
    await userEvent.click(within(kapning()).getByRole('button', { name: 'Cutting report' }))
    expect(within(kapning()).getByText('Lumberyard: Standard brädgård')).toBeInTheDocument()
  })

  // Edge case: a trace made before a yard switch never shows the old plan's pieces
  it('drops a traced board or order line when the yard is switched', async () => {
    await openCutting()
    await userEvent.click(within(kapning()).getByRole('button', { name: 'Show 45x95 C24 · 3,600 mm in 3D' }))
    expect(screen.getByRole('heading', { name: '2 pieces highlighted' })).toBeInTheDocument()
    expect(viewport()).toHaveAttribute('data-related', `${idOf('A')},${idOf('C')}`)

    await userEvent.click(tab('Kapning'))
    await userEvent.selectOptions(yardSelect(), 'Har allt brädgård')
    await userEvent.click(tab('3D-modell'))
    expect(screen.queryByRole('heading', { name: '2 pieces highlighted' })).not.toBeInTheDocument()
    expect(viewport()).toHaveAttribute('data-related', '')
    expect(viewport()).toHaveAttribute('data-ghost', 'false')
  })

  // Stock view: Brädgårdar lists the chosen yard's stock and shares the choice with Kapning
  it('shows the chosen yard’s stock in Brädgårdar, sharing the yard with Kapning', async () => {
    await openCutting()
    expect(orderLengths()).toEqual(['3,600', '3,300'])
    await userEvent.click(within(kapning()).getByRole('button', { name: 'Show 45x95 C24 · 3,600 mm in 3D' }))
    expect(viewport()).toHaveAttribute('data-related', `${idOf('A')},${idOf('C')}`)

    await userEvent.click(tab('Brädgårdar'))
    const yards = () => screen.getByRole('tabpanel', { name: 'Brädgårdar' })
    const yardsSelect = () => within(yards()).getByRole('combobox', { name: 'Lumberyard' })
    expect(yardsSelect()).toHaveDisplayValue('Standard brädgård')
    expect(within(yards()).getByRole('table', { name: 'Stock at Standard brädgård' })).toBeInTheDocument()

    await userEvent.selectOptions(yardsSelect(), 'Har allt brädgård')
    expect(within(yards()).getByRole('table', { name: 'Stock at Har allt brädgård' })).toBeInTheDocument()
    // The same yard change as in Kapning: the trace of the old plan is dropped.
    expect(viewport()).toHaveAttribute('data-related', '')
    expect(viewport()).toHaveAttribute('data-ghost', 'false')

    await userEvent.click(tab('Kapning'))
    expect(yardSelect()).toHaveDisplayValue('Har allt brädgård')
    expect(orderLengths()).toEqual(['6,600'])

    await userEvent.selectOptions(yardSelect(), 'Standard brädgård')
    await userEvent.click(tab('Brädgårdar'))
    expect(yardsSelect()).toHaveDisplayValue('Standard brädgård')
  })

  // Stock view: the stock does not depend on the model, so Brädgårdar does not build the board list
  it('does not build the board list when only Brädgårdar is opened', async () => {
    const model = fakeModel('model-a', beamInfo, boardsA)
    loadMock.mockResolvedValueOnce(model)
    render(<App />)
    await choose('a.ifc')
    await expectModel('model-a')

    await userEvent.click(tab('Brädgårdar'))
    expect(await screen.findByRole('table', { name: 'Stock at Standard brädgård' })).toBeInTheDocument()
    expect(model.getBoards).not.toHaveBeenCalled()

    await userEvent.click(tab('Kapning'))
    await within(kapning()).findByRole('heading', { name: 'Waste report' })
    expect(model.getBoards).toHaveBeenCalledTimes(1)
  })

  // S10
  it('keeps the tabs working when a yard’s stock list cannot be read', async () => {
    const header = 'typ;utförande;tjocklek_mm;bredd_mm;hållfasthetsklass;sorteringsklass;längd_mm;antal;källa'
    const yards = buildLumberyards([
      { id: 'standard', name: 'Standard brädgård', csv: `${header}\nartikel;hyvlat;45;95;C24;T2;3600;5;x` },
      { id: 'bad', name: 'Trasiga gården', csv: 'not a stock list' },
      { id: 'other', name: 'Andra gården', csv: `${header}\nartikel;hyvlat;45;95;C24;T2;4200;5;x` },
    ])
    loadMock.mockResolvedValueOnce(tracedModel())
    render(<App lumberyards={yards} />)
    await choose('a.ifc')
    await expectModel('model-a')
    await userEvent.click(tab('Kapning'))
    await userEvent.selectOptions(await within(kapning()).findByRole('combobox', { name: 'Lumberyard' }), 'Trasiga gården')
    expect(within(kapning()).getByText('The stock list for Trasiga gården could not be read.')).toBeInTheDocument()
    expect(within(kapning()).queryByRole('heading', { name: 'Waste report' })).not.toBeInTheDocument()

    await userEvent.click(tab('Brädor'))
    expect(await screen.findByRole('table', { name: 'Pieces' })).toBeInTheDocument()
    await userEvent.click(tab('3D-modell'))
    await userEvent.click(screen.getByRole('button', { name: 'pick C' }))
    expect(await screen.findByRole('heading', { name: '3 Nogging 45x95 C24' })).toBeInTheDocument()

    await userEvent.click(tab('Kapning'))
    await userEvent.selectOptions(yardSelect(), 'Andra gården')
    expect(within(kapning()).queryByText(/could not be read/)).not.toBeInTheDocument()
    expect(orderLengths()).toEqual(['4,200'])
  })
})
