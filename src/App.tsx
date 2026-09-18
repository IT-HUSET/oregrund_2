import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Board } from './domain/boards/board.ts'
import type { ElementInfo } from './domain/ifc/elementInfo.ts'
import { BoardsPanel } from './features/board-list/BoardsPanel.tsx'
import { CuttingPanel } from './features/cutting-plan/CuttingPanel.tsx'
import { createBrowserIfcApi } from './features/ifc-viewer/createIfcApi.ts'
import { ElementInfoPanel } from './features/ifc-viewer/ElementInfoPanel.tsx'
import { IfcLoadError, loadIfcModel, type IfcLoadErrorKind, type LoadedIfcModel } from './features/ifc-viewer/ifcLoader.ts'
import { IfcViewport } from './features/ifc-viewer/IfcViewport.tsx'
import lindbacksLogo from './assets/lindbacks-logo.svg'
import './App.css'

const ERROR_MESSAGES: Record<IfcLoadErrorKind, string> = {
  parse: 'The file could not be read as an IFC model.',
  'no-geometry': 'The file contains no 3D geometry to display.',
  'too-large': 'The model could not be displayed (the file may be too large).',
  unexpected: 'Something went wrong while loading the model.',
}

interface ShownModel {
  fileName: string
  loaded: LoadedIfcModel
  // Load sequence number: identifies this model load.
  seq: number
}

type Tab = 'model' | 'boards' | 'cutting'

const TABS: { id: Tab; label: string }[] = [
  { id: 'model', label: '3D-modell' },
  { id: 'boards', label: 'Brädor' },
  { id: 'cutting', label: 'Kapning' },
]

// The board list of one model load (ShownModel.seq), or the failure to build it. Keyed by seq
// rather than the model object so a replaced model is not kept alive.
type BoardResult = { seq: number; boards: Board[] } | { seq: number; error: true }

function App() {
  const [shown, setShown] = useState<ShownModel | null>(null)
  const [loadingFile, setLoadingFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [info, setInfo] = useState<ElementInfo | null>(null)
  const [tab, setTab] = useState<Tab>('model')
  const [boardResult, setBoardResult] = useState<BoardResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  // Only the most recent file load and the most recent pick may update the UI.
  const loadSeq = useRef(0)
  const pickSeq = useRef(0)
  // The model load whose boards were last requested; results for any other load are ignored.
  const boardsRequestedFor = useRef<number | null>(null)

  // Free the previous model once it has been replaced (or on unmount).
  useEffect(() => () => shown?.loaded.dispose(), [shown])

  // Build the board list once per loaded model, the first time Boards or Cutting is shown.
  useEffect(() => {
    if (tab === 'model' || !shown) return
    const { seq } = shown
    if (boardsRequestedFor.current === seq) return
    boardsRequestedFor.current = seq
    shown.loaded.getBoards().then(
      (boards) => {
        if (boardsRequestedFor.current === seq) setBoardResult({ seq, boards })
      },
      (e: unknown) => {
        if (boardsRequestedFor.current !== seq) return
        console.error('Failed to build the board list', e)
        setBoardResult({ seq, error: true })
      },
    )
  }, [tab, shown])

  const currentBoards = boardResult && boardResult.seq === shown?.seq ? boardResult : null
  const boards = currentBoards && 'boards' in currentBoards ? currentBoards.boards : null
  const boardsError = currentBoards !== null && 'error' in currentBoards

  async function handleFile(file: File) {
    const seq = ++loadSeq.current
    setLoadingFile(file.name)
    setError(null)
    try {
      await nextPaint() // parsing blocks the main thread; let "Loading …" render first
      const bytes = new Uint8Array(await file.arrayBuffer())
      const loaded = await loadIfcModel(bytes, createBrowserIfcApi)
      if (seq !== loadSeq.current) {
        loaded.dispose()
        return
      }
      pickSeq.current++
      setSelectedId(null)
      setInfo(null)
      setShown({ fileName: file.name, loaded, seq })
    } catch (e) {
      if (seq !== loadSeq.current) return
      console.error('Failed to load IFC file', e)
      setError(ERROR_MESSAGES[e instanceof IfcLoadError ? e.kind : 'unexpected'])
    } finally {
      if (seq === loadSeq.current) setLoadingFile(null)
    }
  }

  const handlePick = useCallback(
    (expressId: number | null) => {
      const seq = ++pickSeq.current
      setSelectedId(expressId)
      setInfo(null)
      if (expressId === null || !shown) return
      shown.loaded
        .getElementInfo(expressId)
        .then((result) => {
          if (seq === pickSeq.current) setInfo(result)
        })
        .catch((e: unknown) => console.error('Failed to read element properties', e))
    },
    [shown],
  )

  function handleTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === tab)
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    const target = TABS[(next + TABS.length) % TABS.length].id
    setTab(target)
    tabRefs.current[target]?.focus()
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <img className="app__logo" src={lindbacksLogo} alt="Lindbäcks" />
          <h1>Labbithuset</h1>
        </div>
        <div className="app__file">
          {shown && <span className="app__file-name">{shown.fileName}</span>}
          <button type="button" onClick={() => inputRef.current?.click()}>
            Choose IFC file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".ifc"
            aria-label="IFC file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = '' // allow choosing the same file again
              if (file) void handleFile(file)
            }}
          />
        </div>
      </header>

      {error && (
        <p className="app__error" role="alert">
          {error}
        </p>
      )}

      {shown && (
        <div className="app__tabs" role="tablist" aria-label="Vyer">
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-controls={`panel-${t.id}`}
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              className="app__tab"
              onClick={() => setTab(t.id)}
              onKeyDown={handleTabKey}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <main className="app__main">
        {/* Hidden rather than unmounted while another tab is shown, so the WebGL view keeps its camera. */}
        <div
          className="app__viewer"
          id="panel-model"
          role={shown ? 'tabpanel' : undefined}
          aria-labelledby={shown ? 'tab-model' : undefined}
          hidden={shown !== null && tab !== 'model'}
        >
          <div className="app__stage">
            <IfcViewport model={shown?.loaded.root ?? null} selectedExpressId={selectedId} onPick={handlePick} />
            {loadingFile ? (
              <div className="app__overlay" role="status">
                Loading {loadingFile}…
              </div>
            ) : (
              !shown && <div className="app__overlay">Choose an IFC file to view it in 3D.</div>
            )}
          </div>
          <ElementInfoPanel info={info} loading={selectedId !== null && info === null} />
        </div>
        {shown && (
          <div
            className="app__boards"
            id="panel-boards"
            role="tabpanel"
            aria-labelledby="tab-boards"
            hidden={tab !== 'boards'}
          >
            {loadingFile && (
              <p className="app__loading" role="status">
                Loading {loadingFile}…
              </p>
            )}
            {/* Keyed by model so a new file resets the sort and filter. */}
            <BoardsPanel key={shown.seq} boards={boards} error={boardsError} />
          </div>
        )}
        {shown && (
          <div
            className="app__boards"
            id="panel-cutting"
            role="tabpanel"
            aria-labelledby="tab-cutting"
            hidden={tab !== 'cutting'}
          >
            <CuttingPanel key={shown.seq} boards={boards} error={boardsError} />
          </div>
        )}
      </main>
    </div>
  )
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
}

export default App
