import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Board } from './domain/boards/board.ts'
import type { ElementInfo } from './domain/ifc/elementInfo.ts'
import { BoardsPanel } from './features/board-list/BoardsPanel.tsx'
import { createBrowserIfcApi } from './features/ifc-viewer/createIfcApi.ts'
import { ElementInfoPanel } from './features/ifc-viewer/ElementInfoPanel.tsx'
import { IfcLoadError, loadIfcModel, type IfcLoadErrorKind, type LoadedIfcModel } from './features/ifc-viewer/ifcLoader.ts'
import { IfcViewport } from './features/ifc-viewer/IfcViewport.tsx'
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

type Tab = 'model' | 'boards'

const TABS: { id: Tab; label: string }[] = [
  { id: 'model', label: '3D model' },
  { id: 'boards', label: 'Boards' },
]

// The board list of one loaded model, or the failure to build it.
type BoardResult = { source: LoadedIfcModel; boards: Board[] } | { source: LoadedIfcModel; error: true }

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
  // The model whose boards were last requested; results for any other model are ignored.
  const boardsRequestedFor = useRef<LoadedIfcModel | null>(null)

  // Free the previous model once it has been replaced (or on unmount).
  useEffect(() => () => shown?.loaded.dispose(), [shown])

  // Build the board list once per loaded model, the first time the Boards tab is shown.
  useEffect(() => {
    if (tab !== 'boards' || !shown) return
    const loaded = shown.loaded
    if (boardsRequestedFor.current === loaded) return
    boardsRequestedFor.current = loaded
    loaded.getBoards().then(
      (boards) => {
        if (boardsRequestedFor.current === loaded) setBoardResult({ source: loaded, boards })
      },
      (e: unknown) => {
        if (boardsRequestedFor.current !== loaded) return
        console.error('Failed to build the board list', e)
        setBoardResult({ source: loaded, error: true })
      },
    )
  }, [tab, shown])

  const currentBoards = boardResult && boardResult.source === shown?.loaded ? boardResult : null

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
        <h1>Labbithuset</h1>
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
        <div className="app__tabs" role="tablist" aria-label="Views">
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
        {/* Hidden rather than unmounted while Boards is shown, so the WebGL view keeps its camera. */}
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
            {/* Keyed by model so a new file resets the sort and filter. */}
            <BoardsPanel
              key={shown.seq}
              boards={currentBoards && 'boards' in currentBoards ? currentBoards.boards : null}
              error={currentBoards !== null && 'error' in currentBoards}
            />
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
