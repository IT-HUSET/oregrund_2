import { useCallback, useEffect, useRef, useState } from 'react'
import type { ElementInfo } from './domain/ifc/elementInfo.ts'
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
}

function App() {
  const [shown, setShown] = useState<ShownModel | null>(null)
  const [loadingFile, setLoadingFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [info, setInfo] = useState<ElementInfo | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Only the most recent file load and the most recent pick may update the UI.
  const loadSeq = useRef(0)
  const pickSeq = useRef(0)

  // Free the previous model once it has been replaced (or on unmount).
  useEffect(() => () => shown?.loaded.dispose(), [shown])

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
      setShown({ fileName: file.name, loaded })
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

      <main className="app__main">
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
      </main>
    </div>
  )
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
}

export default App
