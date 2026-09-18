# Feature Implementation Specification: IFC 3D Viewer

## Feature Overview and Goal

**Intent**: Give the 18:00 demo a trustworthy first step. A drafter or buyer opens the actual Vertex BD model and clicks any part to see the identity and quantities behind it. This is the start of the "visual traceability" must-have in `docs/Kravbild.docx`.

**Expected Outcomes**:

- [OC01] In desktop Chrome or Edge, a user opens a local `.ifc` file with one button and sees the whole model in 3D, which they can navigate. The file never leaves the browser.
- [OC02] Clicking a part highlights it and shows its name, IFC type, GlobalId, Tag (Vertex OID), property sets and quantities. Swedish characters show correctly.
- [OC03] Bad files and repeated loads leave the page usable. An invalid file gives a clear message, and a new file replaces the current model.


## Required Context

- `docs/specs/ifc-3d-viewer/requirements-clarification.md#scope`: what's in and out of scope, and the MVP boundary. This FIS must not grow beyond it.
- `docs/specs/ifc-3d-viewer/requirements-clarification.md#ui-wireframes`: the layout (a header with the button and file name, the 3D view on the left, the info panel on the right) and the empty and loading states.
- `docs/specs/ifc-3d-viewer/requirements-clarification.md#edge-cases`: required behaviour for STEP-escaped names, missing geometry, elements without property sets or quantities, and missing WebGL.
- `docs/specs/ifc-3d-viewer/requirements-clarification.md#error-handling`: the exact user-facing error messages and how the user recovers from each.
- `docs/specs/000-project-foundation.md#42-source-layout`: `src/domain/` stays pure, and features live in `src/features/<feature>/`.
- `docs/specs/000-project-foundation.md#8-security-and-data-assumptions`: files stay local, file-derived text is rendered only as text, WASM is served from the app's own origin, and the confidential sample is never bundled or used as a fixture.
- `CLAUDE.md#772_h811_newifc-notes`: the sample's IFC types, its `Pset_*` and quantity sets, and its STEP string escapes.


## Acceptance Scenarios

- [x] **S01 [OC01] [TI01,TI03,TI04,TI05] The sample model loads and is framed in navigable 3D**
  - **Given** the app is open in desktop Chrome with an empty view and the "Choose IFC file" button showing
  - **When** the user chooses `772_H811_new.ifc`
  - **Then** a loading state naming "772_H811_new.ifc" appears. Then the whole model is shown framed in the view and can be rotated, zoomed and panned with the mouse. "Reset view" frames the whole model again. DevTools shows no network request carrying the file's contents.

- [x] **S02 [OC02] [TI02,TI03,TI04,TI05] Clicking a beam shows its identity, property sets and quantities**
  - **Given** the sample model is loaded
  - **When** the user clicks the beam named "FD5 Opening header beam 45x182 C24"
  - **Then** that beam is visibly highlighted, and the info panel shows type `IFCBEAM`, Tag `589830`, GlobalId `0GO7ParmT1Tv4$2Iz4gRMP`, a `Pset_BeamCommon` section and a quantities section that includes Length.

- [x] **S03 [OC02] [TI02,TI03] STEP-escaped Swedish names are decoded**
  - **Given** an IFC element named `16mm R\X\F6rutlopp` in the file (the sample has several such junction boxes)
  - **When** the element's info is shown
  - **Then** the name reads "16mm Rörutlopp", with no backslash sequences. The same applies to `\X2\…\X0\` sequences.

- [x] **S04 [OC02] [TI02,TI04,TI05] Clicking empty space clears the selection, and empty sections are explicit**
  - **Given** an element is selected and the info panel is showing
  - **When** the user clicks an area of the view with no geometry
  - **Then** the highlight is removed and the panel returns to its "nothing selected" state. For a selected element that has no property sets or no quantities, the panel shows "No properties" or "No quantities" instead of leaving the section out.

- [x] **S05 [OC03] [TI03,TI04,TI05] A new file replaces the current model**
  - **Given** a model is loaded and one of its elements is selected
  - **When** the user chooses a different valid `.ifc` file, or chooses a second file before the first has finished loading
  - **Then** only the file chosen last is shown, the previous model and selection are gone, and the file name in the header matches the model on screen.

- [x] **S06 [OC03] [TI03,TI05] An invalid file is rejected and the page stays usable**
  - **Given** a model is loaded
  - **When** the user chooses a file with a `.ifc` extension that contains non-IFC text
  - **Then** the message "The file could not be read as an IFC model." appears, the previously loaded model stays visible, and the button can be used again.

- [x] **S07 [OC03] [TI03,TI05] A valid IFC file with no geometry is explained, not shown as an empty view**
  - **Given** the app is open
  - **When** the user chooses a valid IFC4 file that has no displayable geometry (for example one containing only a project, site and storey)
  - **Then** the message "The file contains no 3D geometry to display." appears, and the button can be used again.


## Structural Criteria

- [x] `npm run lint`, `npm run typecheck`, `npm run test:run` and `npm run build` all pass.
- [x] `src/domain/` imports nothing from `react`, `three`, `web-ifc` or DOM APIs.
- [x] The web-ifc WASM is served from the app's own origin in both `npm run dev` and `npm run build`, and the app makes no requests to third-party origins.
- [x] No file-derived string is rendered through `dangerouslySetInnerHTML`.
- [x] No model export (`*.ifc` sample, `components.xml`) is in `public/`, `dist/` or the test fixtures. Test fixtures are hand-authored and contain no personal names.


## Scope & Boundaries

### Work Areas
- Dependencies and build config: `package.json` and `vite.config.ts` (`three`, `web-ifc`, `@types/three`, WASM asset handling).
- `src/domain/ifc/`: pure STEP-string decoding, and mapping raw element data into a view model of element info.
- `src/features/ifc-viewer/`: the IFC loading service (web-ifc), the 3D viewport (three.js), the info panel and the file-picker controls.
- `src/App.tsx` and `src/index.css`: the app shell layout from the wireframe, which replaces the placeholder text.
- Test fixtures: a tiny hand-authored IFC4 file and raw-data JSON under `__fixtures__/`.

### What We're NOT Doing
- Drag-and-drop, a bundled sample, and several models at once. The clarification excluded them, and the sample is confidential.
- Show/hide by type, filters, section planes, measuring, a model tree or search. They're deferred until after the demo.
- Selecting an element from outside the 3D view (BOM or purchase line → element). The next traceability spec will cover it once those lists exist.
- Parsing in a Web Worker. Spec 000 §4.1 expects this once parsers exist, but the demo has no load-time requirement, so it's deferred. Parsing must still give the loading state a chance to paint (see Constraints).
- `components.xml` loading and BOM linking. Those belong to later specs.


## Architecture Decision

**Approach**: Use `web-ifc` (WASM, single-threaded) for parsing, geometry, property sets and quantities, and plain `three` with `OrbitControls` for rendering and raycast picking. Keep each mesh's IFC `expressID` so a pick maps to element info on demand.
**Why this over alternatives**: `@thatopen/components` adds `@thatopen/fragments`, `camera-controls` and a model-conversion step, which is more surface area and API churn than a click-to-inspect demo needs. The two direct libraries are its own foundations.


## Technical Overview

Choosing a file: the app shell reads the `File` into bytes and hands them to the loading service. The service closes any previous web-ifc model, opens the new one, and streams its meshes into three.js geometry, with each mesh tagged with its `expressID` and a colour from the IFC. It returns a model handle, or a typed error (`parse`, `no-geometry` or `unexpected`). The viewport mounts the meshes, frames the bounding box, and on click reports the picked `expressID`, or `null` for empty space. The shell asks the loading service for that element's raw attributes, property sets and quantity sets. It passes them through the pure `src/domain/ifc` mapper (decoding and unit formatting) and renders the resulting `ElementInfo` in the info panel. Every load gets a sequence token, so a result for a file that's no longer the latest is thrown away.


## Code Patterns & External References

```
# type | path#anchor or url                                          | why needed (intent)
file   | node_modules/web-ifc/web-ifc-api.d.ts#IfcAPI.Init            | Init(locateFile, forceSingleThread): point locateFile at the bundled WASM URL; pass forceSingleThread=true
file   | node_modules/web-ifc/web-ifc-api.d.ts#IfcAPI.StreamAllMeshes | Geometry stream: FlatMesh → PlacedGeometry (flatTransformation, color) → GetGeometry vertex/index arrays
file   | node_modules/web-ifc/web-ifc-api.d.ts#IfcAPI.DecodeText      | Library decoder, a cross-check for the pure domain decoder
file   | node_modules/web-ifc/helpers/properties.d.ts#Properties      | getItemProperties / getPropertySets: raw attributes, psets and element quantities per expressID
file   | src/App.test.tsx                                             | RTL test style (accessible queries) for the shell tests
url    | https://github.com/ThatOpen/engine_web-ifc                   | Official examples of web-ifc + three.js mesh construction
url    | https://threejs.org/docs/#examples/en/controls/OrbitControls | Rotate/zoom/pan, and framing the target for "Reset view"
```

The `node_modules/web-ifc` paths exist once TI01 has installed the dependency (`web-ifc@0.0.77` at authoring time).


## Constraints & Gotchas

- **Critical**: web-ifc ships `web-ifc.wasm` and `web-ifc-mt.wasm`. The multi-threaded build needs `SharedArrayBuffer`, and that requires COOP/COEP headers the app doesn't set. Must handle by: `Init(locateFile, true)` (single-threaded), with `locateFile` returning the URL from `import wasmUrl from 'web-ifc/web-ifc.wasm?url'`. That URL works in dev and after hashing in the build.
- **Constraint**: web-ifc's package `exports` resolves to the **node** build under the `node` condition and to the browser build under `import`. Workaround: the integration test that loads a real IFC through web-ifc runs with `// @vitest-environment node`, not jsdom.
- **Avoid**: starting a parse in the same tick the loading state is set. The page then freezes before "Loading …" paints. Instead: let the browser render (for example, await a `requestAnimationFrame` or macrotask) before `OpenModel`.
- **Avoid**: leaking GPU and WASM memory when a model is replaced. Instead: dispose the previous meshes, geometries and materials, and `CloseModel` the previous web-ifc model, before or as the new one is shown.
- **Constraint**: WebGL can't be tested in jsdom. Workaround: shell and panel tests mock the viewport and loading-service modules. Real rendering and picking are proved manually in the browser (see Validation).
- **Assumption** (resolves clarification open question 1): quantities are shown as stored, rounded to at most 3 decimals for display, with the unit of the model's `IFCUNITASSIGNMENT` for that quantity kind (mm, m², m³, kg for the sample). If no unit resolves, the value is shown without a unit.


## Implementation Plan

### Implementation Tasks

- [x] **TI01** The project has `three` and `web-ifc` as runtime dependencies and `@types/three` as a dev dependency, and the web-ifc WASM is served from the app's own origin.
  - The WASM is loaded through a Vite `?url` asset import with single-threaded init (see Constraints). Nothing is loaded from a CDN.
  - **Verify**: `npm run build` emits a `.wasm` asset in `dist/assets/`, and `npm run lint`, `typecheck` and `build` pass. When the sample is loaded under `npm run dev`, the DevTools network tab shows the WASM coming from localhost and no requests to third-party origins.

- [x] **TI02** `src/domain/ifc/` provides a pure STEP-string decoder and a mapper from raw web-ifc attribute, property-set and quantity-set objects to an `ElementInfo` view model. `ElementInfo` holds the name, IFC type name, GlobalId, Tag, a property-set list and a quantity list, with display-formatted values and units.
  - The decoder handles `\X\hh` (ISO-8859-1), `\X2\…\X0\` (UTF-16) and `\S\`, and returns plain text unchanged. Sets that are missing become empty lists. The module imports nothing from React, three, web-ifc or the DOM.
  - **Verify**: Unit tests pass for `R\X\F6rutlopp` → "Rörutlopp", `B\X\C4RLINA` → "BÄRLINA" and `\X2\00F6\X0\` → "ö". A raw-data fixture maps to the expected name, type, Tag, pset entries and quantities with units. An element with no psets or quantities yields empty lists. A search of `src/domain/` finds no imports of `react`, `three`, `web-ifc` or `document`/`window`.

- [x] **TI03** `src/features/ifc-viewer/` has a loading service that turns a `File` into three.js meshes tagged with their `expressID`, plus an on-demand `ElementInfo` lookup by `expressID` (using the TI02 mapper). It also resolves project units for quantities.
  - The service rejects files it can't parse with a typed `parse` error and geometry-free models with a `no-geometry` error. It closes the previous model when a new one opens.
  - Fixtures: a tiny hand-authored IFC4 file (one `IFCBEAM` with an extruded rectangle, a `Pset_BeamCommon`, an `IFCELEMENTQUANTITY` with Length, a Tag and a name containing `\X\F6`, and placeholder person and org names), plus a geometry-free IFC4 file. Never the sample.
  - **Verify**: A node-environment integration test loads the fixture and gets at least one mesh with the beam's `expressID`. Looking up that `expressID` returns the decoded name, `IFCBEAM`, the fixture's Tag, the pset and the Length quantity. Garbage bytes produce a `parse` error, and the geometry-free fixture produces `no-geometry`. `git ls-files` and `dist/` contain no `*.ifc` besides the `__fixtures__/` files.

- [x] **TI04** A viewport component shows the meshes from TI03 and frames the whole model on load. It supports mouse rotate, zoom and pan, and a "Reset view" control. A click highlights the nearest picked element and reports its `expressID`, and a click on empty space clears the highlight and reports `null`.
  - The component disposes its three.js resources when the model is replaced and when it unmounts. It shows "Your browser does not support 3D rendering. Use Chrome or Edge." if a WebGL context can't be created. Picking must tell a click from a drag, so a rotate isn't treated as a selection.
  - **Verify**: With `npm run dev` in Chrome and the sample: the model is framed, the controls work, and clicking the FD5 beam highlights it and reports `expressID` → Tag 589830 in the panel. Clicking empty space clears the highlight, and ending a drag-rotate doesn't change the selection. After loading the sample twice, the page does not keep both models (the scene holds one model's meshes).

- [x] **TI05** The app shell matches the wireframe: a header with the heading, a "Choose IFC file" button limited to `.ifc` and the current file name; the viewport; and an info panel that renders `ElementInfo` with "No properties" and "No quantities" empty states. It shows the loading and error states with the messages from the clarification's Error Handling table, and only the most recent file's result is applied.
  - Consumes the TI03 service and the TI04 viewport. File-derived text is rendered only as React text. The placeholder paragraph from spec 000 is retired.
  - **Verify**: RTL tests with the service and viewport mocked. Choosing a file shows "Loading <file name>…". A `parse` rejection shows "The file could not be read as an IFC model.", keeps the previous model and leaves the button enabled. A `no-geometry` rejection shows "The file contains no 3D geometry to display." Given an `ElementInfo` with no psets, the panel shows "No properties". When the first of two overlapping loads resolves last, the second file's model and name remain. A search of `src/` finds no `dangerouslySetInnerHTML`. All four npm checks pass.

### Testing Strategy
- [TI02] Pure unit tests in the default Vitest environment, using JSON fixtures of raw web-ifc shapes. Capture those shapes once from the TI03 integration fixture so the mapper is tested against real library output, not guessed shapes.
- [TI03] One integration test runs real web-ifc (node build) against the hand-authored fixtures. This is the only place WASM runs in tests.
- [TI04] Rendering and picking are verified manually (WebGL isn't available in jsdom). The shell tests (TI05) mock the viewport.

### Validation
- Before handing off to the demo: a manual run through S01–S06 with `772_H811_new.ifc` in **both** Chrome and Edge on the demo laptop, using `npm run build && npm run preview` (the production build) as well as `npm run dev`.


## Implementation Observations

> _Managed by exec-spec post-implementation – append-only. Tag semantics: see [`data-contract.md`](${CLAUDE_PLUGIN_ROOT}/references/data-contract.md) (FIS Mutability Contract, tag definitions). AUTO_MODE assumption-recording: see [`automation-mode.md`](${CLAUDE_PLUGIN_ROOT}/references/automation-mode.md). Spec authors: leave this section empty._

### Run: 2026-09-18 (exec-spec)

#### NOTICED BUT NOT TOUCHING
- `docs/specs/000-project-foundation.md` §3 says the directory is not a git repository. It now is (origin `IT-HUSET/oregrund_2`).
- `CLAUDE.md` says `*.ifc` is gitignored. `.gitignore` now makes an exception for `src/**/__fixtures__/*.ifc`, so the hand-authored fixtures can be committed.
- The ≤3-decimal display rule (Constraints assumption) shows small volumes coarsely, for example 0.009828 m³ as "0.01 m³" and 0.00209 m³ as "0.002 m³". Consider significant-digit formatting for m³ in a follow-up.
- The production bundle is one 4.3 MB JS chunk (web-ifc), and Vite warns about chunk size. Lazy-loading the viewer would shrink the first load.
- Parsing still runs on the main thread (deferred per What We're NOT Doing). The sample loads in about 1.2 s in Chrome, and the page freezes for that time after "Loading …" has painted.

#### DISCOVERED REQUIREMENTS
- **Title**: Isolate each load in its own web-ifc instance
- **Description**: `OpenModel` on non-IFC bytes throws "memory access out of bounds" and can leave the WASM heap unusable. The loader creates one `IfcAPI` per load and disposes it on failure, and it rejects files without an `ISO-10303-21` header before touching WASM.
- **Rationale**: This wasn't knowable without running web-ifc. It is needed for S06 ("the previously loaded model stays visible" and stays clickable).
- **Traced from**: TI03
- **Date**: 2026-09-18

- **Title**: STEP decoding is a safety net
- **Description**: web-ifc 0.0.77 already decodes `\X\` and `\X2\` escapes in string attributes. The domain decoder is still applied (idempotent on decoded text), so S03 doesn't depend on library behaviour.
- **Rationale**: Library behaviour wasn't verified at spec time.
- **Traced from**: TI02
- **Date**: 2026-09-18

#### VERIFICATION NOTES
- Browser checks ran in headless Google Chrome (SwiftShader WebGL) against both `npm run dev` and `npm run build && vite preview`, using the real `772_H811_new.ifc`: load and framing, pick and highlight, drag vs click, empty click, invalid file, no-geometry file, replacing the model, and same-origin requests only with no request bodies.
- **Not verified in Microsoft Edge** (not installed on this machine). The FIS Validation step asks for Chrome **and** Edge on the demo laptop, so that is still open.
- The FD5 beam (expressID 1554) sits inside the wall frame and can't be clicked from outside the model. Its S02 identity data (IFCBEAM, Tag 589830, GlobalId, Pset_BeamCommon, Length) was verified through the same loader against the real sample in a one-off test that wasn't committed. Browser picking was verified on a visible plate (IFCPLATE, Tag 596400).

