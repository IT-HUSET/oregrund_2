# Feature Implementation Specification: 1D Cutting (`src/domain/1dcutting` + Cutting tab)

## Feature Overview and Goal

**Intent**: Implement the "Algorithmic waste optimisation (1D Cutting Stock)" must-have in `docs/Kravbild.docx`. Take a list of timber pieces needed by the model, each carrying its IFC Tag (the Vertex OID), plus the standard timber assortment (Svenskt Trä cross-sections and strength classes, with trade lengths). Work out which boards to buy and how to cut each one, so that every cut piece traces back to its IFC element. Then show the result in the web app: a **Cutting** tab, next to **3D model** and **Boards**, that lists the boards to order and draws each one as a bar split into its cuts and waste. The input is the `Board[]` list the Boards tab already builds (`docs/specs/board-list/board-list.md`), so the IFC model is not parsed again.

**Expected Outcomes**:

- [OC01] Given a list of piece demands and a stock list, the domain returns a cutting plan. The plan lists each board to buy (profile, grade, length) and the ordered cuts on it, and each cut names its IFC Tag.
- [OC02] The plan wastes clearly less than buying one board per piece (the `base_case.txt` baseline), and its totals (required, purchased and waste length, waste %) are consistent and ready for a waste report.
- [OC03] A piece that can't be cut from any stock article is never dropped silently. It shows up in the plan as unplaced, with a reason.
- [OC04] The stock list ships with the app as static data built from the Svenskt Trä timber assortment, so no file or network access is needed.
- [OC05] Every board from the loaded model's board list becomes a cut demand or is reported as skipped (unparsed name or no length). Nothing is dropped between the Boards tab and the Cutting tab.
- [OC06] After loading an `.ifc` file, the user can open a **Cutting** tab that shows the order list (article × quantity), the waste report totals, and every purchased board drawn to a common scale, with its cuts in saw order and its waste at the end.
- [OC07] Every drawn cut can be traced to its IFC element: it shows or reveals its OID, role, prefab element and length.
- [OC08] Unplaced and skipped pieces are listed in the Cutting tab with a readable reason, and a failure to plan never breaks the other tabs.
- [OC09] The plan accounts for the saw blade: every saw cut removes 4.5 mm (kerf). Pieces on a board never overlap a kerf, a board never holds more than its length allows once kerf is counted, and the waste report shows kerf loss as its own figure inside total waste.


## Required Context

- `docs/Kravbild.docx` §3 (must-have "Algoritmisk spilloptimering (1D Cutting Stock)") and §5 (demo: cutting list and waste report).
- `base_case.txt`: the baseline, one new board per piece with the shortest compatible length. The matching rules there (same material, exact dimensions, same strength class, purchased length ≥ required length) apply here as well.
- `docs/specs/000-project-foundation.md#42-source-layout`: `src/domain/` is pure TS with no React, DOM or library imports.
- `docs/specs/000-project-foundation.md#8-security-and-data-assumptions`: fixtures are hand-made and contain no data from the confidential sample files.
- `CLAUDE.md#linking-the-two-files`: IFC `Tag` = XML `OID`. This is the id that each demand carries.
- `docs/specs/board-list/board-list.md`: the `Board` type (`src/domain/boards/board.ts#Board`), the memoized `getBoards()` lookup on the loaded model, and the tab bar in `src/App.tsx`. The Cutting tab reuses all three.
- `docs/specs/000-project-foundation.md#8-security-and-data-assumptions`: file-derived text (OIDs, roles, element names) renders only as React text.


## Decisions (from clarification, 2026-09-18)

| Topic | Decision |
|---|---|
| Input | `planCuts` takes a generic `CutDemand[]`. The app builds it from the Boards tab's `Board[]` (`IFCBEAM`, `IFCCOLUMN`, `IFCCOVERING`) with a pure adapter, `boardsToDemands`. A `components.xml` (`FRAMEPIECE`) adapter is still out of scope. |
| Board → demand | `ifcTag` = `board.oid`, profile = the nominal `thickness` × `width` (normalised), grade = `board.grade`, `lengthMm` = `board.length`. The profile **suffix** (`_S`, `_sta_Z`) is ignored for matching and kept for display. Boards flagged `unparsed` or `no-length` are skipped with that reason and never reach `planCuts`. Siding (`IFCCOVERING`) is included like framing. |
| UI | A third tab, **Cutting**, after **Boards**. It shows the waste report totals, the order list, the unplaced/skipped pieces, and one bar per purchased board, grouped by profile + grade. The plan is computed once per loaded model, the first time Boards or Cutting needs the board list. |
| Model profiles in stock (2026-09-18, revised) | The stock table is extended with grade **C16** and the cross-sections the sample model uses that Svenskt Trä doesn't list: 12×45, 22×145 (siding), 45×182, 90×95, 90×145 and 90×220, all `hyvlat`. This supersedes the earlier decision to leave siding and C16 unplanned, which left 602 of 1,060 sample boards "Not planned". Glulam (`GL`) and decimal widths stay unplanned. |
| Suffixes (2026-09-18) | Profile suffixes (`_S`, `_sta_Z`) are ignored when matching stock, so cuts with and without a suffix can share a board. |
| 3D link (2026-09-18) | Clicking a cut to select its element in 3D is deferred to the traceability spec. |
| Rendering | Plain DOM (`div`s with percentage widths, drawn to one common scale where 100 % = the longest purchased article), styled in `src/features/cutting-plan/CuttingPanel.css`. No canvas, SVG library or new dependency. |
| Stock list | `svenskt_tra_virkessortiment.csv` (see Stock Table), bundled in `src/domain/1dcutting/`, with no prices and unlimited quantity per article. It replaces the earlier `svensk_trastandard_matt_tradslag.csv`, which is not used. |
| Objective | Minimise total waste length, using a deterministic heuristic (First Fit Decreasing plus choice of stock length). Proven optimality isn't required. |
| Cutting parameters (2026-09-18, revised) | **Kerf = 4.5 mm per saw cut** (`DEFAULT_KERF_MM`), passed to `planCuts` as an option so tests can use other values. Still no end trim and no reusable offcuts: everything left on a board counts as waste. This supersedes "kerf = 0". See Kerf Model. |


## Domain Model

```ts
/** Cross-section in mm, normalised so thicknessMm <= widthMm (95x45 → 45x95). */
interface Profile { thicknessMm: number; widthMm: number }

/** One physical piece that has to be cut. */
interface CutDemand {
  ifcTag: string          // IFC Tag = Vertex OID, unique within one call
  profile: Profile
  grade: string           // strength class "C24", or sorting class "T2" (normalised to C24)
  lengthMm: number        // required cut length
}

/** One purchasable article from the stock list. */
interface StockArticle {
  id: string              // stable id, e.g. "45x95-C24-3600"
  finish: 'hyvlat' | 'sågat'
  profile: Profile
  grade: string           // always a C class
  lengthMm: number
}

interface PlannedCut { ifcTag: string; lengthMm: number; offsetMm: number }

interface BoardPlan {
  article: StockArticle
  cuts: PlannedCut[]      // in cutting order; offset = previous offset + previous length + kerf
  usedMm: number          // sum of cut lengths (pieces only, no kerf)
  kerfMm: number          // material lost to saw cuts on this board (see Kerf Model)
  offcutMm: number        // what is left after the last saw cut
  wasteMm: number         // kerfMm + offcutMm = article.lengthMm - usedMm
}

type UnplacedReason = 'no-matching-stock' | 'too-long' | 'invalid-length'
interface UnplacedDemand { demand: CutDemand; reason: UnplacedReason }

interface OrderLine { article: StockArticle; quantity: number }

interface CuttingPlan {
  boards: BoardPlan[]
  orderLines: OrderLine[] // boards aggregated per article
  unplaced: UnplacedDemand[]
  totals: {
    placedPieces: number; unplacedPieces: number
    requiredMm: number; purchasedMm: number
    kerfMm: number; offcutMm: number
    wasteMm: number       // kerfMm + offcutMm = purchasedMm - requiredMm
    wastePct: number      // wasteMm / purchasedMm * 100, 0 when nothing is purchased
  }
  kerfPerCutMm: number    // the kerf the plan was made with, for display
}

interface PlanOptions { kerfMm?: number }   // default DEFAULT_KERF_MM; must be finite and >= 0, else throws
export const DEFAULT_KERF_MM = 4.5

function planCuts(demands: readonly CutDemand[], stock: readonly StockArticle[], options?: PlanOptions): CuttingPlan
function parseStockCsv(csv: string): StockArticle[]   // pure; throws on malformed rows
export const SVENSKT_TRA_SORTIMENT: readonly StockArticle[]  // parseStockCsv(bundled CSV)

// --- Board adapter (src/domain/1dcutting/boardDemands.ts) ---

type SkipReason = 'unparsed' | 'no-length'
interface SkippedBoard { board: Board; reason: SkipReason }

interface BoardDemands {
  demands: CutDemand[]    // one per usable board, in input order
  skipped: SkippedBoard[] // boards that can't become a demand
}

function boardsToDemands(boards: readonly Board[]): BoardDemands
```

The UI looks up a cut's `Board` (role, element, profile label with suffix) by `ifcTag` → `board.oid`. `CutDemand` itself stays IFC-agnostic.

Names can change during implementation. The shape (Tag on every cut, reasons on unplaced pieces, and totals) can't.


## Kerf Model

Let *k* be the kerf (4.5 mm by default), *L* the article length, and *n* ≥ 1 the pieces on a board, with lengths summing to `usedMm`.

- **Fit rule.** Pieces are cut one after another from the board's start, with one saw cut between neighbouring pieces. A board fits when `usedMm + (n − 1)·k ≤ L` (with the 1e-6 mm tolerance). The first piece starts at offset 0, because there is still no end trim.
- **Offsets.** `offset[0] = 0` and `offset[i] = offset[i−1] + length[i−1] + k`.
- **Last cut.** Let *r* = `L − usedMm − (n − 1)·k` be what is left after the last piece. When *r* > 0, one more saw cut frees the last piece from the offcut, and it removes `min(k, r)`. So a piece that ends 2 mm short of the board end loses those 2 mm to kerf and leaves no offcut.
- **Per board.** `kerfMm = (n − 1)·k + min(k, r)` and `offcutMm = r − min(k, r)`, so `usedMm + kerfMm + offcutMm = L`.
- **Single pieces.** A piece as long as the article (for example 5400 on 5400) needs no cut and has kerf 0. So the `too-long` limit stays "longer than the longest article". Kerf never makes a single piece unplaceable.
- **Downsizing and candidate choice** use the same fit rule. "Least waste" still means least `wasteMm`, which now includes kerf. Because *r* depends on *L*, a board's kerf can change when it is downsized, and it is recomputed from the final article.
- With `kerfMm: 0` the plan is exactly the one the kerf-free algorithm would produce. The domain tests that don't cover kerf pass `{ kerfMm: 0 }`, so their numbers stay simple.


## Stock Table

`docs/specs/1d-cutting/svenskt_tra_virkessortiment.csv` is UTF-8 and semicolon-separated, with the columns `typ;utförande;tjocklek_mm;bredd_mm;hållfasthetsklass;sorteringsklass;längd_mm;källa`. There are three kinds of rows:

| `typ` | Content | Source |
|---|---|---|
| `tvärsnitt` | 84 cross-sections: 20 `hyvlat` (22×70 to 95×95, including 45×45 to 45×245) and 58 `sågat` (12×48 to 150×150) from Svenskt Trä, plus 6 `hyvlat` used by the Vertex model (12×45, 22×145, 45×182, 90×95, 90×145, 90×220). Stored normalised, thickness ≤ width. | Svenskt Trä, *Virkessortiment* (the "Hyvlat virke" and "Sågat virke" tables); the model rows cite `772_H811` |
| `hållfasthetsklass` | C14/T0, C16, C18/T1, C24/T2, C30/T3, C35 (C16 and C35 have no T class) | Svenskt Trä, *Kvalitet och sortiment* (SS-EN 338, SS 230120, SS-EN 14081-1); C16 from SS-EN 338, as used in the model |
| `längd` | 3000–5400 mm in 300 mm steps (9 lengths) | **Assumption** from `docs/Kravbild.docx` ("3,0 m till 5,4 m"). Svenskt Trä publishes no trade lengths. |

The articles are the cross product **tvärsnitt × hållfasthetsklass × längd**, which gives 84 × 6 × 9 = 4536 articles. No cross-section appears as both `hyvlat` and `sågat`, so a demand's profile alone decides the finish, and demands don't carry a finish. The CSV is moved into `src/domain/1dcutting/` and loaded with Vite's `?raw` import (already typed through `vite/client`), so it stays the single source of truth. Changing the assortment means editing the CSV, not code.


## Acceptance Scenarios

Unless a scenario says otherwise, stock is `SVENSKT_TRA_SORTIMENT`.

- [ ] **S01 [OC01,OC02] [TI02] Pieces share boards and the least-waste plan is picked**
  - **Given** four 45x95 C24 demands: `A` 2000, `B` 2000, `C` 1500 and `D` 1000 mm
  - **When** `planCuts` runs with the default kerf (4.5 mm)
  - **Then** it returns two boards: a 3600 board cutting `A` 2000 then `C` 1500 (kerf 9, offcut 91, waste 100), and a 3300 board cutting `B` 2000 then `D` 1000 (kerf 9, offcut 291, waste 300). `B` + `D` no longer fit a 3000 board, because 2000 + 4.5 + 1000 = 3004.5. Totals: required 6500, purchased 6900, kerf 18, offcut 382, waste 400, wastePct ≈ 5.80. Order lines are 1 × 45x95-C24-3600 and 1 × 45x95-C24-3300. (The one-board-per-piece baseline would buy 4 × 3000 = 12000 mm.)
  - **And** with `{ kerfMm: 0 }` the same demands give the kerf-free plan: 3600 {`A`, `C`} (waste 100) and 3000 {`B`, `D`} (waste 0), purchased 6600.

- [ ] **S02 [OC01] [TI02] Cut offsets describe the saw sequence**
  - **Given** the S01 plan
  - **When** the 3600 board's cuts are read
  - **Then** they are `{A, 2000, offset 0}` and `{C, 1500, offset 2004.5}`. On every board, each offset equals the sum of the preceding cut lengths plus one kerf per preceding cut.

- [ ] **S03 [OC03] [TI02] Non-standard dimensions are unplaced, not guessed**
  - **Given** a 45x190 C24 demand (a cross-section that is not in the stock table)
  - **When** `planCuts` runs
  - **Then** the piece is in `unplaced` with reason `no-matching-stock`, no board is bought for it, and it isn't rounded up to 45x195.

- [ ] **S04 [OC03] [TI02] Pieces longer than the longest stock length are unplaced**
  - **Given** a 45x95 C24 demand of 6000 mm, and 45x95 C24 stock no longer than 5400 mm
  - **When** `planCuts` runs
  - **Then** the piece is in `unplaced` with reason `too-long`. Other 45x95 C24 pieces in the same call are still planned.

- [ ] **S05 [OC01,OC03] [TI02] Grades and profiles never mix**
  - **Given** a 45x95 C24 demand of 1000 mm, a 45x95 C14 demand of 1000 mm and a 45x70 C24 demand of 1000 mm, with stock that has only C24
  - **When** `planCuts` runs
  - **Then** the C24 pieces are on separate boards (one 45x95, one 45x70), and the C14 piece is unplaced with `no-matching-stock`.

- [ ] **S06 [OC01] [TI02] Profile orientation is normalised**
  - **Given** a demand given as 95x45 C24
  - **When** `planCuts` runs
  - **Then** it is planned on a 45x95 C24 board.

- [ ] **S07 [OC03] [TI02] Invalid input is reported or rejected**
  - **Given** demands with `lengthMm` of `0`, `-5` and `NaN`, and separately two demands with the same `ifcTag`
  - **When** `planCuts` runs
  - **Then** the three invalid lengths are unplaced with `invalid-length`. The duplicate-tag call throws an error that names the tag, because an ambiguous Tag would break traceability.

- [ ] **S08 [OC01] [TI02] The plan is deterministic**
  - **Given** the same demands in two different input orders
  - **When** `planCuts` runs on each
  - **Then** the two results are deep-equal.

- [ ] **S09 [OC01,OC02,OC03] [TI02] Invariants hold on a large random input**
  - **Given** 750 random demands with a fixed seed (mixed standard profiles, some non-standard, some too long, lengths 200–5400 mm)
  - **When** `planCuts` runs
  - **Then** every input `ifcTag` appears exactly once, either in a board or in `unplaced`. On every board, `usedMm + (n − 1)·kerf ≤ article.lengthMm`, `usedMm + kerfMm + offcutMm = article.lengthMm`, consecutive cuts are exactly one kerf apart (no overlap), and the board's profile and grade equal those of each of its cuts. No board could be swapped for a shorter stock length of the same profile and grade that still fits under the Kerf Model's fit rule. Totals equal the sums over boards, and total waste = total kerf + total offcut. The test runs with the default kerf. The call completes in under 1 s in Vitest.

- [ ] **S10 [OC04] [TI01] The bundled stock table is complete and well-formed**
  - **Given** `SVENSKT_TRA_SORTIMENT`
  - **When** it is inspected
  - **Then** it has 4536 articles with unique ids. Every profile is normalised and every length is a positive integer in mm. It contains `hyvlat` 45x95 C24, `sågat` 47x100 C24, `hyvlat` 45x182 C24 and 22x145 C16 at 3000–5400 mm in 300 mm steps, and it contains no 45x190.

- [ ] **S11 [OC01] [TI01,TI02] Sorting classes are accepted as strength-class aliases**
  - **Given** a 45x95 demand with grade `T2`
  - **When** `planCuts` runs
  - **Then** it is planned on a 45x95 **C24** board, and it can share a board with a 45x95 C24 demand. An unknown grade such as `X9` is unplaced with `no-matching-stock`.

- [ ] **S12 [OC04] [TI01] A malformed stock CSV is rejected**
  - **Given** CSV text with an unknown `typ`, a non-numeric `tjocklek_mm`, or a `längd` row without `längd_mm`
  - **When** `parseStockCsv` runs
  - **Then** it throws an error that names the offending line number, instead of returning a partial table.

- [ ] **S13 [OC05] [TI03] Boards become demands, and unusable boards are skipped with a reason**
  - **Given** the boards `1` `45x95 C24` 2000 mm, `2` `45x220_S C24` 1200 mm, `3` `Mystery piece` (unparsed, 900 mm), and `4` `45x95 C24` with no length
  - **When** `boardsToDemands` runs
  - **Then** the demands are `{1, 45x95, C24, 2000}` and `{2, 45x220, C24, 1200}` (suffix dropped for matching), and `skipped` is `3` with `unparsed` and `4` with `no-length`. Demands plus skipped equals the input count.

- [ ] **S14 [OC06] [TI04,TI05] The user sees the order list, totals and cut boards**
  - **Given** a loaded model whose boards are the four S01 pieces (`A` 2000, `B` 2000, `C` 1500, `D` 1000, all `45x95 C24`)
  - **When** the user selects the **Cutting** tab
  - **Then**:
    - The totals read: 4 pieces placed, 2 boards to buy, 6.9 m purchased, 6.5 m required, 0.4 m waste (5.8 %), incl. 18 mm saw kerf (4.5 mm per cut).
    - The order list has two rows, `45x95 C24 · 3600 mm · 1` and `45x95 C24 · 3300 mm · 1`, each with its finish (`hyvlat`).
    - Under the heading `45x95 C24` there are two board bars. The 3600 bar shows segment `A` (2000), a kerf gap, `C` (1500), a kerf gap and an offcut segment of 91 mm, and its right-hand label reads `waste 100`. The 3300 bar shows `B`, a gap, `D`, a gap and an offcut of 291 mm, labelled `waste 300`.
    - Segment widths are proportional: on the common scale (100 % = 3600 mm), `A` is 55.6 %, a kerf gap is 0.125 %, and the whole 3300 bar is 91.7 %.

- [ ] **S15 [OC07] [TI05] Each cut is traceable to its IFC element**
  - **Given** the S14 plan, and board `A` has role `Stud` and element `VÄGG-999`
  - **When** the user focuses or hovers the `A` segment
  - **Then** it exposes (as its accessible name and a tooltip) `OID A · Stud · VÄGG-999 · 2000 mm · offset 0`. Every segment shows its OID as a visible label when it is wide enough, and its accessible name always carries the OID and length.

- [ ] **S16 [OC08] [TI04,TI05] Unplaced and skipped pieces are listed with reasons**
  - **Given** boards that include `45x190 C24` (no matching stock), `45x95 C24` 6000 mm (too long), a `42x270 GL` glulam beam (no matching stock), and one unparsed board
  - **When** the user opens **Cutting**
  - **Then** a "Not planned" section lists each of them with OID, name, profile and length, and a reason in plain words: "No matching stock article", "Longer than the longest stock length", "Name could not be read" or "Missing length". Its heading shows the count. The totals count them as unplaced and exclude them from required length.

- [ ] **S17 [OC06,OC08] [TI04,TI06] Loading, empty and error states**
  - **Given** (a) the board lookup is still pending, (b) the model has no boards, (c) the board lookup rejects, (d) `planCuts` throws (e.g. duplicate OIDs)
  - **When** the user opens **Cutting**
  - **Then** it shows (a) "Planning cuts…", (b) "No boards found in this model.", (c) "The board list could not be built from this model.", (d) "The cutting plan could not be computed for this model." and the error goes to `console.error`. In every case the **3D model** and **Boards** tabs keep working.

- [ ] **S19 [OC09] [TI07] Kerf edge cases**
  - **Given** 45x95 C24 stock, default kerf, and these separate calls: (a) one 5400 piece, (b) one 2998 piece, (c) two 2700 pieces, (d) two 1497.75 pieces
  - **When** `planCuts` runs on each
  - **Then** (a) is one 5400 board with kerf 0 and offcut 0, not `too-long`. (b) is one 3000 board with kerf 2 and offcut 0. (c) is two boards, because 2700 + 4.5 + 2700 > 5400. (d) is one 3000 board with the two pieces at offsets 0 and 1502.25, kerf 4.5 and offcut 0, so an exact fit with kerf is accepted within the tolerance.

- [ ] **S20 [OC09] [TI07] The kerf option is validated**
  - **Given** `planCuts` called with `kerfMm` of `-1`, `NaN` and `Infinity`
  - **When** it runs
  - **Then** each call throws an error that names the kerf value. `kerfMm: 0` is allowed and gives a plan in which every board has `kerfMm` 0 and `offcutMm` = `wasteMm`.

- [ ] **S18 [OC06] [TI06] The Cutting tab fits the existing shell**
  - **Given** a model is loaded
  - **When** the user uses the tab bar
  - **Then** it has three tabs, **3D model**, **Boards** and **Cutting**, in that order, with arrow/Home/End keyboard navigation over all three. The board lookup is called once per model no matter which of Boards/Cutting is opened first or how often the user switches. Loading a new file replaces the plan with the new model's plan.


## Structural Criteria

- [ ] `npm run lint`, `npm run typecheck`, `npm run test:run` and `npm run build` pass.
- [ ] `src/domain/1dcutting/` imports nothing from `react`, `three`, `web-ifc`, feature folders or DOM APIs, and adds no new dependencies. Its only import from another domain module is the `Board` type in `boardDemands.ts`.
- [ ] `src/features/cutting-plan/` depends only on `src/domain/` and `src/components/`. No file-derived string is rendered through `dangerouslySetInnerHTML`.
- [ ] The existing `App.test.tsx` and `BoardsPanel.test.tsx` scenarios still pass.
- [ ] With `772_H811_new.ifc` in `npm run dev` (manual check): opening **Cutting** shows the plan without a noticeable freeze, every one of the 1,060 boards is either on a drawn board or in "Not planned", and the 3D camera is kept when switching back.
- [ ] `planCuts` does not mutate its inputs.
- [ ] The fixtures are hand-written. Tags are made-up ids, and nothing is copied from `772_H811_new.ifc` or `components.xml`.


## Scope & Boundaries

### Work Areas
- `src/domain/1dcutting/`: types, the stock CSV (moved from `docs/specs/1d-cutting/`), `parseStockCsv`, `SVENSKT_TRA_SORTIMENT`, `planCuts`, `boardsToDemands`, and tests alongside them.
- `src/features/cutting-plan/`: `CuttingPanel.tsx` (totals, order list, board bars, "Not planned"), `CuttingPanel.css`, and `CuttingPanel.test.tsx`.
- `src/App.tsx` / `src/App.css` / `src/App.test.tsx`: the third tab, and the board lookup shared by Boards and Cutting.

### What We're NOT Doing
- A `components.xml` (`FRAMEPIECE`) adapter. Board names are already parsed by `src/domain/boards/`, and this spec doesn't parse them again.
- Clicking a cut segment to select the element in 3D. That's still deferred to the traceability spec (the `Board` keeps its `expressId`, so it stays possible).
- Editing the plan in the UI: choosing stock lengths, changing the kerf, or moving cuts between boards. The kerf is a code-level option only.
- Export (CSV/PDF) and printing of the cutting list.
- Moving `planCuts` to a Web Worker. It runs synchronously in a `useMemo`, which S09's < 1 s budget allows.
- End trim, minimum usable offcut, remnant reuse, and finger-jointing or splicing of pieces that are too long. Kerf is in scope (see Kerf Model).
- Prices, cost minimisation, supplier catalogues and stock quantities (stock is unlimited).
- Sheet materials (`SHEET`, 2D cutting) and non-timber materials.
- Exact or ILP solvers.
- A one-board-per-piece baseline function. The baseline figure in S01 is only for comparison in this document.


## Architecture Decision

**Approach**: Group demands by (profile, grade) and match each group against the stock articles with the same profile and grade. For each group, and for each available stock length *L*, run **First Fit Decreasing** (pieces sorted by length descending, ties broken by `ifcTag` ascending; a new board of length *L* is opened when no open board fits). Then **downsize** each board to the shortest article that still fits its pieces plus the kerf between them (Kerf Model). Keep the candidate with the least waste, breaking ties by fewest boards and then by smallest *L*.
**Why this over alternatives**: This is deterministic, needs no dependencies, and takes milliseconds for about 750 pieces (9 lengths × FFD per group). Trying each opening length and then downsizing fixes FFD's main weakness with mixed stock lengths. An exact column-generation/ILP solver would need a WASM solver dependency, which the demo doesn't justify. The `planCuts` signature lets a better solver replace this one later.

**UI approach**: `App` fetches the board list once per model when **Boards** or **Cutting** is first shown (the existing `boardsRequestedFor` guard, widened to both tabs), and passes the same `Board[] | null` and error flag to both panels. `CuttingPanel` computes `boardsToDemands` → `planCuts(demands, SVENSKT_TRA_SORTIMENT)` in one `useMemo` and catches a thrown error into the S17 (d) state. The panel is keyed by the model's `seq`, like `BoardsPanel`.
**Why this over alternatives**: Sharing the lookup keeps the "extract once per model" guarantee of the board-list spec. Plain `div` bars with percentage widths are testable in jsdom (widths are readable from `style`) and need no charting dependency, whereas canvas would hide the cuts from tests and screen readers.


## UI Wireframe

The numbers below are illustrative, not from the sample.

```
[ 3D model ] [ Boards ] [ Cutting ]
───────────────────────────────────────────────────────────────────────
Waste report   612 pieces placed · 214 boards to buy
               1,012.4 m purchased · 948.1 m required · 64.3 m waste (6.4 %)
               incl. 3.1 m saw kerf (4.5 mm per cut)

Order list
  Profile     Grade  Finish   Length (mm)  Qty   Total (m)
  45x95       C24    hyvlat   3600          12    43.2
  45x95       C24    hyvlat   3000           4    12.0
  …

45x95 C24 · 16 boards                       scale: |─── 1 m ───|
  3600  [ A 2000          ¦ C 1500      ¦▨]  waste 100
  3300  [ B 2000          ¦ D 1000   ¦▨▨▨ ]  waste 300
  …

Not planned (57)                                         [ show ▾ ]
  OID     Name                            Profile        Length  Reason
  589830  U9 Glulam beam 42x270 GL        42x270 GL      1180    No matching stock article
  …
```

- One section per profile + grade, in board order (the S08 contract), with the article length at the left of each bar and the waste amount at the right.
- Cut segments alternate between two fill tones so that neighbouring cuts are distinct. The waste segment is hatched and labelled "waste". Colours come from CSS tokens in `src/index.css`, so they work in light and dark themes.
- A segment's label is its OID, and the label is hidden (the accessible name stays) when the segment is narrower than the text.
- The "Not planned" list starts collapsed when it has more than 20 rows.
- `¦` is a kerf gap: an `aria-hidden` element whose width is the kerf on the common scale (about 0.1 %), drawn at a minimum of 1 px in a darker tone, so every saw cut is visible even though 4.5 mm is too thin to show to scale. The final gap (last cut) is drawn only when the board has one. The waste label shows the board's `wasteMm` (kerf + offcut). The offcut segment's tooltip splits it into `offcut 91 mm · kerf 9 mm`. A board without offcut shows no hatched segment.
- Totals show kerf with the whole-mm formatter under 1 m (`18 mm`), and in metres with one decimal from 1 m up (`3.1 m`).


## Constraints & Gotchas

- **Constraint**: Lengths from IFC/XML may be non-integer (e.g. 2399.5), and offsets with kerf are too (2004.5). Don't round in the domain. Compare "fits" with a tolerance of 1e-6 mm so that float sums don't reject exact fits. Offsets display with `formatMm` (whole mm), so the saw list may be up to 0.5 mm off the domain value.
- **Gotcha**: Kerf moves pieces off their kerf-free boards. Two pieces that sum to exactly a stock length no longer share it, so waste % goes up compared with the kerf-free plan. This is expected and more realistic. Don't "fix" it by ignoring kerf on the last piece.
- **Constraint**: Output order is part of the contract (S08). Boards are sorted by thickness, width and grade (ascending), then board length (descending), then the first cut's `ifcTag`. Unplaced demands are sorted by `ifcTag`. Order lines follow board order.
- **Assumption**: The trade lengths (3000–5400 mm in 300 mm steps) come from Kravbild, not from Svenskt Trä. Every cross-section is assumed to be available in every strength class and length. See Open Questions.
- **Constraint**: Grade matching is exact after alias normalisation (T0→C14, T1→C18, T2→C24, T3→C30). A higher class is **not** used in place of a lower one, e.g. C30 stock for a C24 demand. That rule is the same as in `base_case.txt`.
- **Avoid**: coupling the module to the viewer's `ElementInfo`. The only link to IFC is the `ifcTag` string.
- **Critical**: `planCuts` throws on duplicate `ifcTag`s. An IFC export could in theory repeat a Tag, so the panel must catch this and show S17 (d) rather than crash the app. Check the sample for duplicate Tags during the manual validation.
- **Gotcha**: In the sample, all siding is `22x145_sta_Z C16`, and many framing pieces are C16 or use sizes Svenskt Trä doesn't list (45×182, 12×45, 90×…). Those rows were added to the stock table for this reason (see Decisions). With them, 1,003 of the 1,060 sample boards are planned; 50 are longer than 5,400 mm (see Open Question 1) and 7 are glulam or decimal widths.
- **Gotcha**: Profiles with decimals (`9.762523x95`) and glulam (`GL`) never match stock and are also listed as not planned.
- **Constraint**: Lengths display as whole mm and totals in metres with one decimal, as in the Boards tab. Use the same formatting helpers (move them to `src/components/` or a shared module if both panels need them, instead of copying).
- **Avoid**: unmounting the 3D viewport when **Cutting** is shown. It stays hidden, as for **Boards**.


## Implementation Plan

### Implementation Tasks

- [x] **TI01** `src/domain/1dcutting/` contains the domain types, `normaliseProfile` and `normaliseGrade` helpers, the stock CSV (moved with `git mv` from `docs/specs/1d-cutting/svenskt_tra_virkessortiment.csv`), a pure `parseStockCsv`, and `SVENSKT_TRA_SORTIMENT` built from the CSV through a `?raw` import.
  - **Verify**: The S10–S12 unit tests pass, and typecheck and build pass.

- [x] **TI02** `planCuts(demands, stock)` implements grouping, validation (reasons for unplaced demands, an error on duplicate tags), FFD per candidate length with downsizing, least-waste selection, deterministic ordering and totals.
  - **Verify**: Unit tests for S01–S09 pass. The S09 test uses a small seeded PRNG written in the test, with no dependency.

- [x] **TI03** `boardsToDemands(boards)` in `src/domain/1dcutting/boardDemands.ts` maps each `Board` to a `CutDemand` or a `SkippedBoard`, as in the Decisions table.
  - **Verify**: The S13 unit test passes, with `Board` literals from `src/domain/boards/__fixtures__/boards.ts` or inline.

- [x] **TI04** `src/features/cutting-plan/CuttingPanel.tsx` takes `boards: readonly Board[] | null` and `error?: boolean`, and renders the loading, empty, board-error and plan-error states, the waste report totals, the order list and the "Not planned" list (unplaced + skipped, with the reason texts from S16).
  - **Verify**: RTL tests with `Board[]` literals cover S14 (totals and order list), S16 and S17 (a)–(d). For (d), pass boards with a duplicate OID.

- [x] **TI05** The panel draws one bar per `BoardPlan`, grouped by profile + grade, with cut segments in saw order, a hatched waste segment, the common scale, and the S15 labels, tooltips and accessible names. Each segment is focusable (`tabIndex={0}`) so its details can be reached by keyboard.
  - **Verify**: RTL tests read the segments of each bar in order (OID and length), check the waste segment, check `style.width` percentages from S14, and check the S15 accessible name.

- [x] **TI06** `App.tsx` adds the **Cutting** tab and panel (`id="panel-cutting"`, kept mounted and `hidden` like Boards). It requests the board list the first time either Boards or Cutting is shown, and passes the same result to both panels.
  - **Verify**: `App.test.tsx` covers S18: three tabs in order, keyboard navigation wraps over three, `getBoards` is called once when opening Cutting then Boards then Cutting, and a second file shows the second model's plan. The existing tab tests still pass.

- [ ] **TI07** Kerf: add `DEFAULT_KERF_MM` and `PlanOptions` to `cutting.ts`, apply the Kerf Model in `planCuts` (fit rule in FFD and downsizing, offsets, per-board `kerfMm`/`offcutMm`, totals, `kerfPerCutMm`, option validation), and draw kerf gaps and the kerf total in `CuttingPanel`. Update the `cut-traceability` numbers that depend on S01 (offset of `C`, the `B`/`D` board's article and waste).
  - **Verify**: S01, S02, S09, S14, S19 and S20 pass. The other `planCuts` tests pass unchanged with `{ kerfMm: 0 }`. The waste report total equals the sum of the bars' waste labels.

### Testing Strategy
- Pure Vitest unit tests in the node environment, next to the code (`planCuts.test.ts`, `stock.test.ts`, `boardDemands.test.ts`).
- Small stock lists are written inline in tests, so that scenarios don't depend on the bundled table, except for S01, S03, S10 and S11.
- UI tests (`CuttingPanel.test.tsx`, `App.test.tsx`) use `Board[]` literals and the mocked loader, and never WASM. They use the bundled stock table, so the S14 numbers match S01.

### Validation
- Manual one-off check (not committed): load the sample model in `npm run dev`, open **Cutting**, and compare its waste % with the baseline's 49.24 % in `base_case.txt` for the same pieces. Check that placed + not planned = 1,060 and that no Tag is duplicated.


## Open Questions

1. **Trade lengths.** Svenskt Trä publishes no lengths, so 3000–5400 mm in 300 mm steps is taken from Kravbild. Should the supplier's actual lengths (for example 2400–6000 mm) replace it? That only means editing the `längd` rows.
2. **Availability per class.** In practice C18/C30 are rarely stocked and C14 mostly in small dimensions (Svenskt Trä). Should the table restrict classes per cross-section instead of using the full cross product?
3. **Non-standard profiles** such as 45×182 are now stock rows of their own (bought as special orders). Should a later spec rip them from a wider standard profile (45×195) instead?
4. **Kerf value.** 4.5 mm fits a typical thin-kerf circular or crosscut saw blade. Should it depend on the machine or profile (a wider blade for 90×… or sawn timber), or become a UI setting later?
5. **Baseline function.** Should the domain also provide the one-board-per-piece baseline, so that the waste report can show % saving (Kravbild §5)? It's cheap to add, but it isn't in this spec.


## Implementation Observations

> _Managed by exec-spec post-implementation – append-only. Spec authors: leave this section empty._

- **2026-09-18 (TI01–TI06)** File names: types and the normalise helpers are in `cutting.ts`, and the stock parser and `SVENSKT_TRA_SORTIMENT` are in `stock.ts`. `parseStockCsv` also checks the header row (a bad header fails on line 1).
- **2026-09-18** When a piece is longer than the candidate opening length, FFD opens a board of the shortest article that fits that piece, so every opening length gives a complete candidate.
- **2026-09-18** `formatCount` and `formatMetres` moved from `BoardsPanel.tsx` to `src/components/format.ts` (plus `formatMm`), and both panels use them.
- **2026-09-18** The Cutting panel is mounted (hidden) alongside Boards, so the plan is computed as soon as the board list arrives, even if only Boards was opened. The cost is milliseconds. Shared messages ("No boards found…", "The board list could not be built…") now appear in both tab panels, so the App tests scope those assertions to the visible `tabpanel`.
- **2026-09-18** New colour tokens `--cut-a`, `--cut-b`, `--cut-text` and `--waste` in `src/index.css`, for light and dark. The Structural Criteria check against the sample file is still manual, because `772_H811_new.ifc` isn't in this checkout.
