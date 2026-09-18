# Feature Implementation Specification: Board List

## Feature Overview and Goal

**Intent**: Give buyers a trustworthy count of all the timber boards a house needs, and give the planned cutting optimizer a typed, tested board list to work from. That means the IFC model is parsed for boards once and never again for each new feature.

**Expected Outcomes**:

- [OC01] After loading an `.ifc` file, the user can switch to a **Boards** tab and back to **3D model** without losing the 3D camera or selection.
- [OC02] The Boards tab lists every framing and siding board (`IFCBEAM`, `IFCCOLUMN`, `IFCCOVERING`) with OID, role/description, prefab element, profile, grade and length. The list can be sorted by any column. For the sample file that is 1,060 boards.
- [OC03] A summary groups the boards by profile (including any suffix) + grade, with count and total length. Clicking a group filters the piece list to that group.
- [OC04] Boards whose names can't be fully read, or that have no length, are still listed, visibly flagged and counted. Nothing is silently dropped, and a failure to build the list never breaks the 3D view.


## Required Context

- `docs/specs/board-list/requirements-clarification.md#scope`: in/out of scope and the MVP boundary. This FIS must not grow beyond it (no optimizer, no row → 3D, no sheets, no `components.xml`).
- `docs/specs/board-list/requirements-clarification.md#board-data-model-requirements-level`: the fields every board must carry, and where each comes from in IFC.
- `docs/specs/board-list/requirements-clarification.md#ui-wireframes`: the tab bar, the summary above the piece table, and the filter indicator with "Clear filter".
- `docs/specs/board-list/requirements-clarification.md#edge-cases`: required behaviour for unparsed names, decimal dimensions, suffixes, the variant `*`, a missing Length, a missing parent assembly, and zero boards.
- `docs/specs/board-list/requirements-clarification.md#error-handling`: the exact message when board extraction fails, and that the 3D tab keeps working.
- `docs/specs/000-project-foundation.md#42-source-layout`: `src/domain/` stays pure (no React, three, web-ifc or DOM), and the feature UI lives in `src/features/<feature>/`.
- `docs/specs/000-project-foundation.md#8-security-and-data-assumptions`: file-derived text is rendered only as React text, and fixtures are hand-authored with no personal data.
- `CLAUDE.md#linking-the-two-files`: IFC `Tag` = Vertex OID, and the IFC `Name` format (piece code + description, trailing `*` = variant).


## Deeper Context

- `docs/specs/ifc-3d-viewer/ifc-3d-viewer.md#constraints--gotchas`: web-ifc runs as the node build in tests (`// @vitest-environment node`), and WebGL isn't available in jsdom.
- `base_case.txt`: how the future optimizer will consume boards (matched on material, width × height, grade, and length ≥ required cut length). Read it to understand why the raw length and the nominal dimensions must be kept.


## Acceptance Scenarios

- [x] **S01 [OC02] [TI01] Board names are parsed into piece code, role, profile and grade**
  - **Given** the IFC names `FD5 Opening header beam 45x182 C24`, `36 Siding board 22x145_sta_Z C16`, `100 Sill plate 45x220_S C24`, `155 Stud GL 90x220 GL`, `185  GL 42x270 GL`, `92  PAR 9.762523x95 C14` and `210 Vertical batten 28x70 C24*`
  - **When** each name is parsed
  - **Then** they give, in order:
    - `FD5` / `Opening header beam` / 45 × 182 / `C24`
    - `36` / `Siding board` / 22 × 145 with suffix `_sta_Z` / `C16`
    - `100` / `Sill plate` / 45 × 220 with suffix `_S` / `C24`
    - `155` / `Stud GL` / 90 × 220 / `GL`
    - `185` / `GL` / 42 × 270 / `GL`
    - `92` / `PAR` / 9.762523 × 95 / `C14`
    - `210` / `Vertical batten` / 28 × 70 / `C24`, with the `*` ignored for parsing and kept in the full name.

    Each profile label reads exactly as written in the name (`45x220_S`, `9.762523x95`).

- [x] **S02 [OC02] [TI02] Boards are extracted from a loaded IFC model with length and prefab element**
  - **Given** a hand-authored IFC4 fixture containing an `IFCBEAM`, an `IFCCOLUMN` and an `IFCCOVERING`, each with a Tag and a `Length` quantity, aggregated board → `IFCBUILDINGELEMENTPART` → `IFCELEMENTASSEMBLY 'GOLV-999*'`, plus one `IFCBUILDINGELEMENTPROXY` and one `IFCPLATE`
  - **When** the model is loaded and its boards are requested
  - **Then** exactly the beam, column and covering are returned. Each has its Tag as OID, the correct kind (`framing` or `siding`), the raw Length in mm, and prefab element `GOLV-999*`. The proxy and plate are not returned.

- [x] **S03 [OC03] [TI03] The summary groups by profile + grade and its totals add up**
  - **Given** the boards 45x220 C24 (2,408 mm), 45x220 C24 (1,200 mm), 45x220_S C24 (3,000 mm) and 45x220 C16 (900 mm)
  - **When** the summary is built
  - **Then** there are three groups: `45x220 C24` (count 2, total 3,608 mm), `45x220_S C24` (1, 3,000 mm) and `45x220 C16` (1, 900 mm). The grand total is 4 boards and 7,508 mm.

- [x] **S04 [OC01,OC02,OC03] [TI04,TI05] The user browses, sorts and filters boards in the Boards tab**
  - **Given** a model has loaded and the tab bar shows **3D model** (selected) and **Boards**
  - **When** the user selects **Boards**, clicks the **Length** column header twice, then clicks the summary group `45x220 C24`
  - **Then**:
    - The summary and the piece table are shown, with the columns OID, Role / description, Element, Profile, Grade and Length (mm).
    - The table first sorts ascending by length, then descending, and the header shows the sort state.
    - After the group click, only `45x220 C24` boards remain, "filtered: 45x220 C24" is shown with a **Clear filter** button, and **Clear filter** restores all rows.
    - Lengths show as whole mm (254.99999… → `255`).

- [x] **S05 [OC01] [TI05] Switching tabs keeps the 3D view state, and a new file resets the board list**
  - **Given** a model is loaded and an element is selected in **3D model**
  - **When** the user switches to **Boards** and back, and then chooses a different file while **Boards** is selected
  - **Then** after switching back, the viewport is still mounted with the same model and selection (it was not recreated). After the new file loads, the Boards tab shows the new model's boards with no filter and the default sort.

- [x] **S06 [OC04] [TI01,TI02,TI04] Unreadable names and missing lengths are listed, flagged and counted**
  - **Given** the boards include one named `Mystery piece` (no `WxH grade` part) and one board with no `Length` quantity
  - **When** the Boards tab is shown
  - **Then** both boards appear in the piece table with a visible "unparsed" / "no length" marker and empty cells for the missing data. The summary shows "2 boards could not be fully read" and has an **Unparsed** group containing `Mystery piece`. The board without a length counts toward its group's count but not its total length.

- [x] **S07 [OC04] [TI04,TI05] A board-extraction failure is contained in the Boards tab**
  - **Given** a model whose 3D view loaded, but whose board extraction rejects with an error
  - **When** the user opens **Boards**
  - **Then** the tab shows "The board list could not be built from this model." and the error goes to `console.error`. Switching back to **3D model** shows the model, and it can still be picked.

- [x] **S08 [OC02] [TI04] A model without boards shows an empty state**
  - **Given** a loaded model whose board list is empty
  - **When** the user opens **Boards**
  - **Then** the tab shows "No boards found in this model." instead of an empty table.


## Structural Criteria

- [x] `npm run lint`, `npm run typecheck`, `npm run test:run` and `npm run build` all pass, and the existing `App.test.tsx` and `ifcLoader.test.ts` scenarios still pass.
- [x] Board parsing and grouping live in `src/domain/` and import nothing from `react`, `three`, `web-ifc` or DOM APIs.
- [x] No file-derived string is rendered through `dangerouslySetInnerHTML`. New fixtures are hand-authored and contain no personal names.
- [x] With `772_H811_new.ifc` in `npm run dev`: 1,060 boards (731 framing + 329 siding), 0 unparsed, and every board has a prefab element. Extraction runs once per loaded model (not on every tab switch), and opening the tab has no noticeable delay.
- [x] No new runtime dependency is added to `package.json`.


## Scope & Boundaries

### Work Areas
- `src/domain/boards/`: the pure board type, name parser, raw → board mapping, and summary/grouping.
- `src/features/ifc-viewer/ifcLoader.ts`: the loaded model exposes a board lookup built from web-ifc lines (products, quantities, aggregation).
- `src/features/board-list/`: the Boards tab UI (summary, piece table, sort, group filter, empty/error/unparsed states).
- `src/App.tsx` / `src/App.css`: the tab bar after load, with the viewport kept mounted while hidden.
- Test fixtures: a small hand-authored `boards.ifc` under `src/features/ifc-viewer/__fixtures__/`.

### What We're NOT Doing
- Cutting optimization, standard stock lengths, prices and waste. These belong to the next feature, and this one only prepares its input.
- Clicking a board row to select it in 3D. It's deferred to a traceability spec. The board keeps its `expressId` so this stays possible.
- Sheets (`IFCPLATE`) and insulation. They're 2D stock with a different optimization model.
- `components.xml` joining, search, export (CSV/Excel) and printing. The clarification ruled them out of scope.
- Moving parsing to a Web Worker. Spec 000 §4.1 still expects this eventually, and nothing here makes it harder.


## Architecture Decision

**Approach**: The loader gathers raw board data (name, Tag, GlobalId, entity type, `Length` quantity, and the parent assembly name through `IFCRELAGGREGATES`) with web-ifc, lazily and memoized per model. Pure `src/domain/boards/` code turns that raw data into typed `Board`s and summary groups. The UI only renders.
**Why this over alternatives**: This follows the existing `getElementInfo` → `toElementInfo` split. The domain stays testable without WASM, and memoizing keeps the tab instant without slowing the initial model load.


## Code Patterns & External References

```
# type | path#anchor or url                                          | why needed (intent)
file   | src/features/ifc-viewer/ifcLoader.ts#loadIfcModel            | Where the board lookup attaches; copy the getElementInfo raw → domain mapping split
file   | src/domain/ifc/elementInfo.ts#toElementInfo                  | Raw web-ifc line shapes ({ value }, _representationValue) and the text()/scalar() unwrapping to mirror
file   | src/domain/ifc/decodeIfcString.ts#decodeIfcString            | Apply to names (STEP-escape safety net, as in elementInfo)
file   | src/features/ifc-viewer/ifcLoader.test.ts                    | Node-environment integration test pattern with real web-ifc + fixtures
file   | src/features/ifc-viewer/__fixtures__/beam.ifc                | Hand-authored IFC4 fixture shape to extend for boards.ifc (needs ≥1 geometry, or the load fails with no-geometry)
file   | src/App.test.tsx#fakeModel                                   | Mocked LoadedIfcModel used by shell tests; must gain the board lookup
file   | node_modules/web-ifc/ifc-schema.d.ts#IFCBEAM                 | Type codes IFCBEAM, IFCCOLUMN, IFCCOVERING, IFCRELAGGREGATES, IFCELEMENTASSEMBLY, IFCRELDEFINESBYPROPERTIES
file   | node_modules/web-ifc/helpers/properties.d.ts#Properties      | getPropertySets / GetLine(..., inverse) for quantities and Decomposes
```


## Constraints & Gotchas

- **Critical**: Profile and grade exist **only** in the IFC `Name`. The quantity `CrossSectionArea` is not WxH (siding 22×145 reports 0.0027 m², not 0.00319). Must handle by: parsing the trailing `<T>x<W>[suffix] <grade>[*]` from the name, with decimals allowed in T and W. The piece code is the first token, and the role is whatever sits between the piece code and the profile. It may be empty or contain double spaces (`185  GL 42x270 GL`), so trim it.
- **Constraint**: In the sample, the prefab element is **two** levels up (board → `IFCBUILDINGELEMENTPART` layer → `IFCELEMENTASSEMBLY`). Workaround: walk `Decomposes`/`IFCRELAGGREGATES` upward until an `IFCELEMENTASSEMBLY` is found, and stop at the spatial structure. If none is found, the element is empty.
- **Avoid**: calling per-element property helpers in a way that re-scans every relation for each of the ~1,060 boards. Instead: build the quantity and aggregation lookups in one pass over `IFCRELDEFINESBYPROPERTIES` / `IFCRELAGGREGATES`, or use inverse `GetLine` lookups. Then check the sample in the browser against the "no noticeable delay" criterion.
- **Avoid**: unmounting `IfcViewport` when **Boards** is selected. That recreates the WebGL renderer and loses the camera. Instead: keep it mounted and hide its panel (the `hidden` attribute). Its resize handler already ignores zero-size layouts (`src/features/ifc-viewer/IfcViewport.tsx#resize`).
- **Constraint**: `LoadedIfcModel` gains a member, so every fake in `src/App.test.tsx` must implement it, or typecheck fails.
- **Assumption**: The first token of a name is always taken as the piece code. That holds for all 1,060 sample names. Handling names with no code (for example `Stud 45x70 C24`) is left until another export needs it.
- **Assumption**: The **Unparsed** summary group can be filtered like any other group. No dedicated scenario covers it, and the executor may add a case to the TI04 tests.


## Implementation Plan

### Implementation Tasks

- [x] **TI01** `src/domain/boards/` defines a `Board` type holding the fields in the clarification's Board Data Model. It also has a pure mapper from raw board data to `Board`, with name parsing that covers piece code, role, profile (nominal T and W, suffix, label) and grade, plus parse status (`unparsed` and `no-length` flags).
  - Names are decoded with `decodeIfcString`. Unparsable names keep the full name, with empty profile and grade and the unparsed flag. A missing or non-finite Length gives an empty length and the no-length flag. `IFCBEAM`/`IFCCOLUMN` map to `framing` and `IFCCOVERING` maps to `siding`.
  - **Verify**: Unit tests cover all S01 names, `Mystery piece` (unparsed), and a raw board without Length (no-length). A search of `src/domain/` finds no import of `react`, `three`, `web-ifc`, `document` or `window`.

- [x] **TI02** The loaded model from `loadIfcModel` exposes a memoized async board lookup that returns `Board[]` (built with TI01's mapper) for every `IFCBEAM`, `IFCCOLUMN` and `IFCCOVERING`, with the raw `Length` quantity and the nearest ancestor `IFCELEMENTASSEMBLY` name.
  - A new hand-authored `boards.ifc` fixture holds the elements described in S02. At least one element has geometry, and the fixture uses placeholder person and org names.
  - **Verify**: The node-environment integration test (like `ifcLoader.test.ts`) loads `boards.ifc` and gets exactly the three boards with their Tags, kinds, lengths and `GOLV-999*`. It gets neither the proxy nor the plate. Calling the lookup twice returns the same result without re-extracting.

- [x] **TI03** `src/domain/boards/` provides a pure summary function. It groups boards by profile label + grade, puts unparsed boards in an **Unparsed** group, and returns per-group count and total length plus grand totals and the count of flagged boards.
  - Total length sums only boards that have a length. Groups are ordered by profile, then grade.
  - **Verify**: A unit test with the S03 boards gives exactly those three groups and totals. A test with S06-style boards gives an Unparsed group and a flagged count of 2, and the group totals sum to the grand total.

- [x] **TI04** `src/features/board-list/` has a Boards panel that renders the summary and the piece table from `Board[]`, following the wireframe. It supports sorting by every column both ways (`aria-sort`), a keyboard-operable summary-group filter with a "filtered: …" indicator and **Clear filter**, flagged-row markers, the "N boards could not be fully read" count, the empty state and the extraction-error message.
  - Uses TI03 for the summary. Piece lengths display as whole mm, and summary totals display in metres with one decimal (as in the wireframe). The default sort is profile, then grade, then length, ascending. Length sorts numerically and OID sorts numeric-aware. Empty cells sort last in both directions. All values render as React text.
  - **Verify**: RTL tests given a `Board[]` prop: the default order is profile → grade → length. Header clicks toggle the order and `aria-sort`, and Length sorts `255` before `1200`. A group click filters to that group and **Clear filter** restores all rows. S06 markers and the count are shown. An empty list shows "No boards found in this model." An error state shows "The board list could not be built from this model."

- [x] **TI05** Once a model has loaded, the app shell shows a tab bar (`role="tablist"`) with the tabs **3D model** (default) and **Boards**. Each is a `role="tab"` with `aria-selected`, controls its own `role="tabpanel"`, and can be activated from the keyboard. Boards shows the TI04 panel fed by the TI02 lookup. The viewport stays mounted while hidden, and a new file resets the tab contents (filter and sort).
  - The shell requests the boards once per loaded model and ignores results from a model that has since been replaced (as the existing `loadSeq` guard does). A rejected lookup is logged with `console.error` and shown as the TI04 error state. Before any model has loaded, no tab bar is shown.
  - **Verify**: RTL tests in `App.test.tsx` with the mocked loader and viewport: there's no tablist before loading and a tablist after. `getByRole('tab', { name: 'Boards' })` switches views, and `aria-selected` follows. Switching to Boards and back leaves the same viewport stub element with the same `data-selected`. The lookup is called once across repeated tab switches. Loading a second file shows the second model's boards unfiltered. A rejected lookup shows the S07 message and leaves the 3D tab intact.

### Testing Strategy
- [TI02] Real web-ifc runs only in the node-environment loader integration test against `boards.ifc`. [TI04, TI05] use `Board[]` literals and the mocked loader, and never WASM.
- Checking the sample-file totals (1,060 / 731 / 329 / 0 unparsed) is a manual browser check. The sample is confidential and must never become a fixture.


## Implementation Observations

> _Managed by exec-spec post-implementation – append-only. Tag semantics: see [`data-contract.md`](${CLAUDE_PLUGIN_ROOT}/references/data-contract.md) (FIS Mutability Contract, tag definitions). AUTO_MODE assumption-recording: see [`automation-mode.md`](${CLAUDE_PLUGIN_ROOT}/references/automation-mode.md). Spec authors: leave this section empty._

### Run: 2026-09-18 13:22 UTC – observations

#### NOTICED BUT NOT TOUCHING
- src/domain/boards/board.ts:39 – Board lengths are taken as raw model length units (mm per spec); resolved project units are not applied, so an IFC in metres would show 0–6 mm lengths. Revisit if non-mm exports appear.
- src/features/ifc-viewer/ifcLoader.ts (readBoards) – GetLineIDsWithType is called without includeInherited, so IFCBEAMSTANDARDCASE / IFCCOLUMNSTANDARDCASE are not boards. The sample has none; revisit for non-Vertex IFC4 exports.
- src/App.test.tsx:31 and src/features/ifc-viewer/__fixtures__/beam.ifc – pre-existing test data reuses a GlobalId from the confidential sample (0GO7ParmT1Tv4$2Iz4gRMP); the new boards.ifc fixture uses freshly generated GUIDs.
- vite build – pre-existing >500 kB chunk warning (three + web-ifc), unrelated to this feature.
#### ASSUMPTIONS
- The loading status for a new file is also shown in the Boards panel (review finding), since the 3D panel holding the original overlay is hidden on that tab.
- Summary lengths and piece lengths use en-US grouping (1,200 / 2,482.6 m), matching the English UI; the spec leaves Swedish formatting as an open question.
- Unparsed boards show their full name in the Role / description column, so the Unparsed group rows stay identifiable.
- Board extraction is requested lazily on the first Boards-tab open per model (measured ~250 ms to open in the dev build with the sample, ~72 ms of it extraction).
