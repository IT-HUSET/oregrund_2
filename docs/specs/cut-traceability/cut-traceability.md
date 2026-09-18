# Feature Implementation Specification: Cut Traceability (Kapning ↔ 3D)

## Feature Overview and Goal

**Intent**: Implement the "Visuell spårbarhet" must-have in `docs/Kravbild.docx` §3: "klickbar spårbarhet från varje inköpspost till motsvarande ritningselement". The **Kapning** tab already names the IFC Tag of every cut (`docs/specs/1d-cutting/1d-cutting.md` S15), but the link stops at a text label. This feature makes it a two-way, clickable link. From a cut, a purchased board or an order line, the user jumps to the 3D view and sees exactly where those pieces sit in the house. From a board element picked in 3D, the user sees which purchased board it is cut from, where on that board, and can jump back to that cut in the cutting list. The **Brädor** rows get the same "show in 3D" link, which the board-list spec deferred to this one.

**Expected Outcomes**:

- [OC01] Every placed cut in **Kapning** has a "show in 3D" action. It switches to **3D-modell**, selects and highlights that element, frames the camera on it, and shows its element info.
- [OC02] A whole purchased board, and a whole order line, can be shown in 3D at once. All their pieces are highlighted together, so the user sees how one stock board is spread over the house.
- [OC03] Highlighted pieces are visible even when they sit inside a wall or floor. The rest of the model is ghosted (drawn translucent) while a traced set is shown, and one control restores the normal view.
- [OC04] When a board element is picked in 3D, the info panel shows its cutting context: the stock article, which board of its group, the position on the board (offset and length), and the other cuts on the same board. A "show in cutting list" action switches to **Kapning** and focuses that cut. A board that isn't planned shows its reason instead. Elements that aren't boards show no cutting section.
- [OC05] Every row in **Brädor** has the same "show in 3D" action as a cut.
- [OC06] Traceability never breaks the tabs: a missing element, a failed plan or a new file leaves every tab usable and never shows a stale link from the previous model.


## Required Context

- `docs/Kravbild.docx` §3 (must-have "Visuell spårbarhet och Explainable AI") and §5 (demo: a reviewable result).
- `docs/specs/1d-cutting/1d-cutting.md`: the `CuttingPlan`, `BoardPlan` and `PlannedCut` types, the board order contract (Constraints, S08), the S15 cut labels, and the "3D link deferred to the traceability spec" decision.
- `docs/specs/board-list/board-list.md` and its `requirements-clarification.md` (line "Row → 3D traceability"): the `Board` type keeps `expressId` so this link can be added without reworking extraction.
- `docs/specs/ifc-3d-viewer/ifc-3d-viewer.md`: the viewport contract (meshes tagged with `userData.expressID`, click vs drag, highlight material), the picking flow in `App`, and the verification note that the FD5 beam can't be clicked from outside the model.
- `docs/specs/000-project-foundation.md#42-source-layout`: `src/domain/` is pure, and features depend only on `domain` and `components`, never on each other. `App` is the only place that wires features together.
- `docs/specs/000-project-foundation.md#8-security-and-data-assumptions`: file-derived text renders only as React text, and fixtures are hand-made.


## Decisions

| Topic | Decision |
|---|---|
| Join key | Cut → element goes `PlannedCut.ifcTag` → `Board.oid` → `Board.expressId`. Element → cut goes `expressId` → `Board` → `oid` → cut location. No new IFC parsing, and the web-ifc model is not queried for the link. |
| Where the plan lives | The plan moves up from `CuttingPanel`'s `useMemo` to `App` (one computation per model, through a pure `computeCuttingPlan(boards)`). `CuttingPanel` and the element info panel both receive it. The plan is still computed only once the board list exists. |
| 3D selection model | The viewport takes a **selection**: one *primary* element (the strong orange highlight used today) plus a set of *related* elements (a second, softer highlight). A plain click in 3D selects one primary and clears related, as today. |
| Seeing hidden pieces | While a traced set (from Kapning or Brädor) is shown, all other meshes are drawn **ghosted** (shared translucent material, no depth write). A "Show whole model" button in the viewport clears the ghosting and keeps the selection. A plain click in 3D also ends ghosting. |
| Camera | A traced set is framed: the camera moves to fit the bounding box of the highlighted meshes, keeping its current viewing direction. "Reset view" still frames the whole model. |
| Board order line → 3D | Clicking an order line traces every cut on every board of that article, as related elements with no primary. |
| Info panel link | The cutting context in the info panel comes from a pure lookup, `CutLocation` (below). `ElementInfoPanel` gets it as a prop and knows nothing about the cutting feature. |
| Back-link | "Show in cutting list" switches to **Kapning**, scrolls the cut segment into view, focuses it, and marks it (and its board) as the current trace target until another trace or tab switch replaces it. |
| Single cut → 3D (2026-09-18) | Tracing one cut highlights only that element. Its board siblings are **not** highlighted as related (judged noise); the info panel lists them instead. Related highlighting is used only for board and order-line traces. |
| Permanent overlay (2026-09-18) | A 3D colour mode (by cutting status or by purchased board) is left to a later spec. |
| Language (2026-09-18) | New UI strings are in English like the existing panels. The tab names stay Swedish. |
| Lumberyard (2026-09-18, lumberyards) | `computeCuttingPlan(boards, yard)` plans against the **lumberyard chosen in the Cutting tab** (`docs/specs/lumberyards/lumberyards.md`), not `SVENSKT_TRA_SORTIMENT`. `App` holds the chosen yard for the session, so the plan, the trace index and the info panel's cutting context follow it. `TraceStatus` can carry the new not-planned reason **`out-of-stock`**, shown as "Out of stock at \<yard name\>" (`notPlannedText`). |


## Domain Model

```ts
// src/domain/1dcutting/traceability.ts (pure, no React/three/web-ifc/DOM)

/** Where one piece sits in the cutting plan. */
interface CutLocation {
  oid: string
  boardIndex: number        // index into CuttingPlan.boards
  groupLabel: string        // "45x95 C24", as the Kapning group heading
  boardNumber: number       // 1-based position within its group, as the bar label "board N"
  article: StockArticle
  cutIndex: number          // position in saw order on the board, 0-based
  offsetMm: number
  lengthMm: number
  wasteMm: number           // the board's waste
  siblings: string[]        // OIDs of the other cuts on the same board, in saw order
}

type TraceStatus =
  | { kind: 'placed'; location: CutLocation }
  | { kind: 'not-planned'; reason: UnplacedReason | SkipReason }
  | { kind: 'not-a-board' }

interface TraceIndex {
  byOid(oid: string): TraceStatus
  /** OIDs of every cut on the board. */
  boardOids(boardIndex: number): string[]
  /** OIDs of every cut on every board of the article (an order line). */
  articleOids(articleId: string): string[]
}

function computeCuttingPlan(boards: readonly Board[]):
  { plan: CuttingPlan; skipped: SkippedBoard[] } | { error: unknown }   // boardsToDemands → planCuts, as CuttingPanel does today

function buildTraceIndex(plan: CuttingPlan, skipped: readonly SkippedBoard[]): TraceIndex
```

`boardNumber` and `groupLabel` must be computed the same way `CutBoards` groups and numbers bars today, so "board 3" in the info panel is the bar labelled "board 3". Move that grouping into the domain module and have `CuttingPanel` use it instead of its own loop.

OID ↔ expressId mapping stays in the UI layer (`Map<string, Board>` and `Map<number, Board>` built from `Board[]` in `App`), because `expressId` is IFC-specific and `CuttingPlan` stays IFC-agnostic.

```ts
// src/features/ifc-viewer/IfcViewport.tsx (props change)

interface ViewportSelection {
  primary: number | null         // expressID
  related: readonly number[]     // expressIDs, may include primary (ignored)
  ghostOthers: boolean
  frameRequest: number           // bump to frame the selection once; 0 = never framed
}
```

Names can change during implementation. The shape (one join through `oid`, a primary plus related set, ghosting as a flag, and a framing request that fires once) can't.


## Acceptance Scenarios

Unless noted, the model is a loaded fixture whose boards are the four 1d-cutting S01 pieces `A` 2000, `B` 2000, `C` 1500, `D` 1000 (all `45x95 C24`, element `VÄGG-999`), giving (with the default 4.5 mm kerf) a 3600 board `A`+`C` and a 3300 board `B`+`D`, plus one `45x190 C24` board `E` (not planned) and one `IFCPLATE` (not a board).

- [x] **S01 [OC04] [TI01] The trace index locates every placed cut**
  - **Given** the plan above
  - **When** `buildTraceIndex` runs
  - **Then** `byOid('C')` is `placed` with group `45x95 C24`, board 1, article `45x95-C24-3600`, cut index 1, offset 2004.5 (2000 + one 4.5 mm kerf), length 1500, waste 100 and siblings `['A']`. `byOid('E')` is `not-planned` with `no-matching-stock`. An unknown OID is `not-a-board`. `boardOids(1)` is `['B', 'D']` and `articleOids('45x95-C24-3600')` is `['A', 'C']`.

- [x] **S02 [OC04] [TI01] Board numbers match the cutting list**
  - **Given** a plan with two groups of three boards each
  - **When** the trace index and `CuttingPanel` are both built from it
  - **Then** for every cut, the index's `groupLabel` and `boardNumber` equal the group heading and the "board N" in the accessible name of the bar that draws it.

- [x] **S03 [OC01] [TI03,TI05] A cut is shown in 3D**
  - **Given** the user is on **Kapning**
  - **When** they activate "Show in 3D" for segment `C` (by click, or Enter on the focused segment)
  - **Then** the **3D-modell** tab is selected, the viewport receives primary = `C`'s expressId, no related elements (siblings aren't highlighted, see Decisions), `ghostOthers` = true and a new frame request, and the info panel shows `C`'s element info.

- [x] **S04 [OC02] [TI03,TI05] A whole board and a whole order line are shown in 3D**
  - **Given** the user is on **Kapning**
  - **When** they activate "Show board in 3D" on the 3300 bar, and separately "Show in 3D" on the order line `45x95 C24 · 3600 mm`
  - **Then** the first gives no primary and related = the expressIds of `B` and `D`. The second gives related = `A` and `C`. Both ghost the rest and request framing. The info panel says "2 pieces highlighted" with the board or article label instead of one element's info.

- [ ] **S05 [OC03] [TI02] Traced pieces are visible and the rest is ghosted**
  - **Given** a viewport showing a model, with selection primary `A`, related `[A, C]` (a board trace with a primary, as the viewport allows), `ghostOthers` true (manual check with the sample; see Validation)
  - **When** it renders
  - **Then** `A` has the primary highlight, `C` the related highlight, and every other mesh uses the ghost material. "Show whole model" restores every other mesh's own material and keeps both highlights. Clearing the selection restores every material. No mesh keeps a highlight or ghost material after the model is replaced.

- [ ] **S06 [OC01,OC03] [TI02] Framing fits the traced set, once**
  - **Given** the **Kapning** tab is active, so the viewport is hidden
  - **When** a trace switches to **3D-modell**
  - **Then** the camera fits the bounding box of the primary and related meshes once the viewport has a non-zero size, keeping the current viewing direction. A later orbit by the user isn't undone by re-renders, and the same selection with an unchanged `frameRequest` doesn't reframe.

- [x] **S07 [OC04] [TI04,TI05] A picked board shows its cutting context**
  - **Given** the user is on **3D-modell**
  - **When** they click element `C`
  - **Then** the info panel has a **Cutting** section: `45x95 C24 · 3600 mm · board 1`, `Cut 2 of 2 · offset 2,005 mm · 1500 mm` (2004.5 shown in whole mm by `formatMm`), `Waste on this board: 100 mm`, and `Same board: A` where `A` is a button that selects `A` in 3D (primary `A`, no related). A "Show in cutting list" button is present.

- [x] **S08 [OC04] [TI04,TI05] Not-planned boards and non-boards**
  - **Given** the user is on **3D-modell**
  - **When** they click `E`, then the plate
  - **Then** for `E` the Cutting section reads "Not planned: No matching stock article" (the same reason text as Kapning) and has no link. For the plate there is no Cutting section at all. While the board list or plan is still pending, the section reads "Planning cuts…".

- [x] **S09 [OC04] [TI05,TI06] Back to the cutting list**
  - **Given** `C` is selected in 3D and its Cutting section is shown
  - **When** the user activates "Show in cutting list"
  - **Then** **Kapning** is selected, segment `C` is scrolled into view and has focus, and `C`'s segment and its bar carry a visible "current" marking (and `aria-current="true"` on the segment). If the "Not planned" list holds the target instead, it expands and the row is focused.

- [x] **S10 [OC05] [TI07] A Brädor row is shown in 3D**
  - **Given** the user is on **Brädor**
  - **When** they activate "Show in 3D" on the row for `E`
  - **Then** **3D-modell** is selected with primary `E`, no related, ghosting on and a frame request. This works for unplanned and unparsed boards too, because it only needs `expressId`.

- [x] **S11 [OC06] [TI03,TI05] Stale and missing targets**
  - **Given** (a) a trace was started and a new file finishes loading, (b) a cut's OID has no board in the map (it can't happen today, but the plan is IFC-agnostic), (c) the plan failed to compute
  - **When** the user looks at the tabs
  - **Then** (a) the new model shows with no selection, no ghosting and no "current" cut marking. (b) the cut's "Show in 3D" action is disabled and its title says "Element not found in the model". (c) the info panel's Cutting section reads "The cutting plan could not be computed for this model." and the 3D view still picks and highlights normally.

- [x] **S12 [OC01,OC05] [TI03,TI05,TI07] Keyboard and screen reader access**
  - **Given** the cutting list and the board table
  - **When** the user tabs through them
  - **Then** every "Show in 3D" action is reachable and operable by keyboard, and its accessible name includes the OID (for example "Show OID C in 3D"). The existing arrow/Home/End tab-bar navigation is unchanged.


## Structural Criteria

- [x] `npm run lint`, `npm run typecheck`, `npm run test:run` and `npm run build` pass.
- [x] `src/domain/1dcutting/traceability.ts` imports nothing from `react`, `three`, `web-ifc`, features or DOM APIs, and adds no dependency.
- [x] `src/features/ifc-viewer/` does not import from `src/features/cutting-plan/` or `src/features/board-list/`, and vice versa. Only `App` wires them together.
- [x] `CuttingPanel` no longer calls `planCuts` itself. The plan is computed once per model, however often the user switches tabs or traces.
- [x] Highlight and ghost materials are shared (created once), and the viewport never disposes or mutates a mesh's original material.
- [x] No file-derived string is rendered through `dangerouslySetInnerHTML`.
- [x] The existing scenarios of `App.test.tsx`, `BoardsPanel.test.tsx` and `CuttingPanel.test.tsx` still pass (updated only for the moved plan computation and the new props).


## Scope & Boundaries

### Work Areas
- `src/domain/1dcutting/traceability.ts` (+ test): `computeCuttingPlan`, the board grouping moved out of `CutBoards`, `buildTraceIndex`.
- `src/features/ifc-viewer/IfcViewport.tsx` (+ CSS): the selection prop, related highlight, ghosting, "Show whole model", framing on request.
- `src/features/ifc-viewer/ElementInfoPanel.tsx`: the Cutting section, driven by a `TraceStatus` prop and callbacks.
- `src/features/cutting-plan/CuttingPanel.tsx`: takes the plan as a prop; "Show in 3D" per cut, per bar and per order line; the "current" cut marking and focus.
- `src/features/board-list/BoardsPanel.tsx`: "Show in 3D" per row.
- `src/App.tsx`: plan state, OID/expressId maps, the trace index, the viewport selection, and tab switching for both directions.
- `src/index.css`: tokens for the related highlight and the "current" cut marking, in light and dark.

### What We're NOT Doing
- Colouring the whole model by cutting status or by purchased board (a permanent overlay). That is a later spec.
- Tracing to `components.xml` or to anything that isn't an `IFCBEAM`, `IFCCOLUMN` or `IFCCOVERING` board (sheets, insulation, openings).
- Showing the cut position *on the element* in 3D (for example marking where on a stud the offset falls). The offset is a position on the stock board, not on the element.
- Multi-select by the user in 3D (shift-click), box selection, or a model tree.
- Deep links or URL state for a selection.
- Exporting a traceability report. Export of the cutting list is still a separate spec.
- Changing how the plan is computed (still the 1d-cutting spec).


## Architecture Decision

**Approach**: Keep one selection state in `App`: `{ primary, related, ghostOthers, frameRequest }`, plus a `cutTarget` OID for the back-link. Trace actions in the panels are callbacks with OIDs (`onShowInModel(oids, primaryOid?)`). `App` maps OIDs to expressIds through the `Board[]` map, sets the selection, bumps `frameRequest` and switches tab. A 3D pick maps expressId → `Board` → `TraceStatus` through the pure index and passes it to `ElementInfoPanel`. The viewport applies the selection by swapping materials, as the current single highlight does, and frames on a changed `frameRequest` after it is visible.
**Why this over alternatives**: Panels talk in OIDs, the viewport talks in expressIds, and the only translation is in `App`, so the no-feature-to-feature rule holds and `CuttingPlan` stays IFC-agnostic. Material swapping reuses the existing highlight technique and needs no post-processing, outline pass or dependency. Hiding non-traced meshes instead of ghosting was rejected: the user loses the context of *where* in the house the piece is, which is the point of the feature.


## UI Wireframe

```
[ 3D-modell ] [ Brädor ] [ Kapning ]

Kapning
Order list
  45x95  C24  hyvlat  3600   1   3.6 m   [Show in 3D]
  …
45x95 C24 · 2 boards
  3600  [ A 2000        ¦ C 1500     ¦▨]  waste 100   [⌖]      ← "Show board in 3D"
        (click / Enter on a segment → "Show OID C in 3D")

3D-modell (after tracing C)
┌──────────────────────────────────────────────┬──────────────────────────────┐
│  [Reset view] [Show whole model]              │ 5 Stud 45x95 C24             │
│                                               │ Type IFCBEAM  Tag/OID C      │
│      ░░░░░ ghosted walls ░░░░░                │ …                            │
│         ██ C (orange)                         │ Cutting                      │
│                                               │  45x95 C24 · 3600 mm · board 1│
│                                               │  Cut 2 of 2 · offset 2,005 mm│
│                                               │  · 1500 mm                   │
│                                               │  Waste on this board: 100 mm │
│                                               │  Same board: [A]             │
│                                               │  [Show in cutting list]      │
└──────────────────────────────────────────────┴──────────────────────────────┘
```

- A cut segment's own click is the "Show in 3D" action (its title and accessible name say so). Segments that are too narrow keep working, because the action doesn't depend on the visible label.
- The per-bar button sits after the waste label, so the bars keep the common scale.
- "Show whole model" is shown only while ghosting is on.


## Constraints & Gotchas

- **Critical**: The viewport is `hidden` (zero size) while **Kapning** or **Brädor** is shown, and `resize()` ignores a zero size. Framing must wait until the container has a size (the `ResizeObserver` callback after the tab switch, or the next frame after it), or the camera fits a 0×0 aspect. Test this path manually; jsdom can't.
- **Critical**: Many framing pieces are enclosed by sheets and insulation (the ifc-3d-viewer verification note: FD5 can't be clicked from outside). Without ghosting, a traced stud is invisible. The ghost material must have `depthWrite: false` and be drawn so that highlighted meshes render on top of it (for example `renderOrder`), or highlighted pieces still disappear behind translucent walls.
- **Constraint**: A single element can have several meshes (the current highlight loops over all meshes with the expressID). Related highlight, ghosting and framing must handle all of them.
- **Constraint**: The trace must be exact. An OID appears on at most one cut (the 1d-cutting spec throws on duplicate tags), and each expressId maps to one `Board`. If the sample ever repeats an OID, the plan fails and S11 (c) applies; don't guess a board.
- **Constraint**: Material swapping must restore the exact original material, including when the selection changes while ghosting is on and when primary also appears in related. Store the original once per mesh and restore from that.
- **Avoid**: re-running `getElementInfo` for every related element. Only the primary gets element info; a set trace shows the "N pieces highlighted" summary.
- **Avoid**: rebuilding the trace index or the OID maps on every render. Memoize on the plan and the board list.
- **Gotcha**: `A`'s pick in 3D after a trace must end ghosting and clear related (a plain click is a plain selection), otherwise the user gets stuck in a ghosted view.
- **Gotcha**: With about 1,000 traced meshes (a large order line), material swapping on every mesh is fine, but it must happen in one pass per selection change, not per mesh per render.


## Implementation Plan

### Implementation Tasks

- [x] **TI01** `src/domain/1dcutting/traceability.ts` provides `computeCuttingPlan`, the board grouping and numbering used by the cutting list, and `buildTraceIndex` with `byOid`, `boardOids` and `articleOids`.
  - **Verify**: Unit tests for S01 and the domain half of S02 pass. `CuttingPanel` uses the moved grouping and its existing tests pass.

- [x] **TI02** `IfcViewport` takes a `ViewportSelection` instead of `selectedExpressId`. It applies the primary and related highlights and ghosting, shows "Show whole model" while ghosting is on (calling back to clear the flag), and frames the selection once per `frameRequest` after the container has a size.
  - **Verify**: Manual browser check of S05 and S06 with the sample (see Validation). The existing viewport test still passes, and a jsdom test checks that "Show whole model" appears only when `ghostOthers` is true and calls its callback.

- [x] **TI03** `CuttingPanel` takes the plan result as a prop, and offers "Show in 3D" on each cut segment, each bar and each order line, calling `onShowInModel(oids, primaryOid?)`. Actions whose OIDs have no board are disabled with the S11 (b) title.
  - **Verify**: RTL tests for the panel half of S03, S04, S11 (b) and S12: activating a segment by click and by Enter calls the callback with `(['C'], 'C')`, the bar with the board's OIDs, and the order line with the article's OIDs.

- [x] **TI04** `ElementInfoPanel` takes an optional `trace` prop (`TraceStatus`, pending, or plan error) and renders the Cutting section of S07 and S08, with the sibling buttons and "Show in cutting list" as callbacks. With no `trace` prop it renders as today.
  - **Verify**: RTL tests with literal `TraceStatus` values for S07, S08 and the S11 (c) text.

- [x] **TI05** `App` computes the plan once per model with `computeCuttingPlan`, builds the OID and expressId maps and the trace index, and holds the selection and `cutTarget`. It wires the panels' trace callbacks to the viewport selection and tab switch, and a 3D pick to the info panel's `trace`. Loading a new file clears the selection, ghosting and `cutTarget`.
  - **Verify**: `App.test.tsx` with the mocked loader and viewport covers S03, S04, S07, S09 and S11 (a): the mocked viewport receives the expected selection, the tab changes, and the plan is computed once when switching Kapning → 3D → Kapning.

- [x] **TI06** `CuttingPanel` takes `cutTarget` and, when it changes, scrolls the target segment into view, focuses it and marks it and its bar as current. A target in "Not planned" expands the list and focuses the row.
  - **Verify**: RTL tests for S09: `aria-current="true"` on the segment, focus on it (`scrollIntoView` stubbed in jsdom), and the collapsed "Not planned" list expands for an unplanned target.

- [x] **TI07** `BoardsPanel` has a "Show in 3D" action per row, calling `onShowInModel([oid], oid)`.
  - **Verify**: RTL test for S10 and the row half of S12. Sorting and filtering tests still pass.

### Testing Strategy
- Pure Vitest unit tests for the trace index, with hand-written `CuttingPlan` and `SkippedBoard` literals (no WASM).
- RTL tests for the panels and `App`, with the loader and viewport mocked, as in the existing tests. The mocked viewport records the `selection` prop so tests can assert on it.
- Ghosting, highlight materials and framing are WebGL behaviour and are verified manually, as for the viewer spec.

### Validation
- Manual run with `772_H811_new.ifc` in `npm run dev` and in `npm run build && npm run preview`, in Chrome: trace a stud inside a wall (for example the FD5 header, Tag 589830) from **Kapning** and check that it is visible through the ghosted wall and framed. Trace a long order line and check it stays responsive. Pick an element in 3D, follow "Show in cutting list" and check that the focused segment has the same OID. Load the file again and check that no highlight, ghosting or "current" marking remains.


## Implementation Observations

> _Managed by exec-spec post-implementation – append-only. Spec authors: leave this section empty._

- **2026-09-18 (TI01–TI07)** The not-planned reason texts moved from `CuttingPanel` into the domain module as `NOT_PLANNED_REASONS`, so the cutting list and the info panel share them without a feature-to-feature import. `CutLocation` also carries `cutCount`, for the "Cut 2 of 2" line.
- **2026-09-18** `ViewportSelection` and `EMPTY_SELECTION` are in `src/features/ifc-viewer/selection.ts`. Exporting the constant from the component file triggered the fast-refresh lint warning.
- **2026-09-18** The board list is now also requested on the first pick in 3D, not only when **Brädor** or **Kapning** is first shown, because the info panel's Cutting section needs the plan. It is still built once per model. While the list or plan is pending, board-type elements (`IFCBEAM`, `IFCCOLUMN`, `IFCCOVERING`, via the new `isBoardType`) show "Planning cuts…", and other elements show no section.
- **2026-09-18** The "Show in 3D" actions render only when the panel gets an `onShowInModel` callback, so the panels still work on their own. A cut's action is a `<button>` inside the segment `<li>`, and the `<li>` keeps its S15 accessible name and title. The per-bar action is a small "3D" button after the waste label, and order lines and board rows get an extra action column.
- **2026-09-18** S09's "not planned" branch (expanding the list and focusing the row) is not implemented. It can't be reached, because S08 gives unplanned boards no "Show in cutting list" link.
- **2026-09-18** Tracing a set with no primary shows a summary of the highlighted pieces in the info panel instead of element info. The ghost material is transparent with `depthWrite: false`. three.js draws transparent meshes after opaque ones, so no `renderOrder` was needed. Neither was checked in a browser.
- **2026-09-18** Not verified: S05 and S06 (materials, ghosting and framing) and the manual Validation run. `772_H811_new.ifc` isn't in this checkout and there is no browser on this machine. Everything else is covered by Vitest.
