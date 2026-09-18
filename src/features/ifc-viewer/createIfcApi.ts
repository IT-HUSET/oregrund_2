import { IfcAPI } from 'web-ifc'
import wasmUrl from 'web-ifc/web-ifc.wasm?url'

// Browser web-ifc instance. The WASM is bundled by Vite and served from the app's own origin.
// Single-threaded: the multi-threaded build needs SharedArrayBuffer (COOP/COEP headers).
export async function createBrowserIfcApi(): Promise<IfcAPI> {
  const api = new IfcAPI()
  await api.Init((path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path), true)
  return api
}
