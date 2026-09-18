# Feature Implementation Specification: 1D Cutting (`src/domain/1dcutting`)

## Feature Overview and Goal

**Intent**: Implement the "Algorithmic waste optimisation (1D Cutting Stock)" must-have in `docs/Kravbild.docx`. Take a list of timber pieces needed by the model, each carrying its IFC Tag (the Vertex OID), plus the standard timber assortment (Svenskt Trä cross-sections and strength classes, with trade lengths). Work out which boards to buy and how to cut each one, so that every cut piece traces back to its IFC element. This spec covers only the pure domain module. Building the input from IFC/XML and showing the result in the UI get their own specs.

**Expected Outcomes**:

- [OC01] Given a list of piece demands and a stock list, the domain returns a cutting plan. The plan lists each board to buy (profile, grade, length) and the ordered cuts on it, and each cut names its IFC Tag.
- [OC02] The plan wastes clearly less than buying one board per piece (the `base_case.txt` baseline), and its totals (required, purchased and waste length, waste %) are consistent and ready for a waste report.
- [OC03] A piece that can't be cut from any stock article is never dropped silently. It shows up in the plan as unplaced, with a reason.
- [OC04] The stock list ships with the app as static data built from the Svenskt Trä timber assortment, so no file or network access is needed.


## Required Context

- `docs/Kravbild.docx` §3 (must-have "Algoritmisk spilloptimering (1D Cutting Stock)") and §5 (demo: cutting list and waste report).
- `base_case.txt`: the baseline, one new board per piece with the shortest compatible length. The matching rules there (same material, exact dimensions, same strength class, purchased length ≥ required length) apply here as well.
- `docs/specs/000-project-foundation.md#42-source-layout`: `src/domain/` is pure TS with no React, DOM or library imports.
- `docs/specs/000-project-foundation.md#8-security-and-data-assumptions`: fixtures are hand-made and contain no data from the confidential sample files.
- `CLAUDE.md#linking-the-two-files`: IFC `Tag` = XML `OID`. This is the id that each demand carries.


## Decisions (from clarification, 2026-09-18)

| Topic | Decision |
|---|---|
| Input | A generic `CutDemand[]`. Adapters from IFC (`IFCBEAM`/`IFCCOLUMN`) or `components.xml` (`FRAMEPIECE`) are **out of scope** and belong to a later spec. |
| Stock list | `svenskt_tra_virkessortiment.csv` (see Stock Table), bundled in `src/domain/1dcutting/`, with no prices and unlimited quantity per article. It replaces the earlier `svensk_trastandard_matt_tradslag.csv`, which is not used. |
| Objective | Minimise total waste length, using a deterministic heuristic (First Fit Decreasing plus choice of stock length). Proven optimality isn't required. |
| Cutting parameters | **None for now.** Kerf = 0, no end trim, and no reusable offcuts: everything left on a board counts as waste. |


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
  cuts: PlannedCut[]      // in cutting order, offsets from 0, kerf 0
  usedMm: number
  wasteMm: number         // article.lengthMm - usedMm
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
    requiredMm: number; purchasedMm: number; wasteMm: number
    wastePct: number      // wasteMm / purchasedMm * 100, 0 when nothing is purchased
  }
}

function planCuts(demands: readonly CutDemand[], stock: readonly StockArticle[]): CuttingPlan
function parseStockCsv(csv: string): StockArticle[]   // pure; throws on malformed rows
export const SVENSKT_TRA_SORTIMENT: readonly StockArticle[]  // parseStockCsv(bundled CSV)
```

Names can change during implementation. The shape (Tag on every cut, reasons on unplaced pieces, and totals) can't.


## Stock Table

`docs/specs/1d-cutting/svenskt_tra_virkessortiment.csv` is UTF-8 and semicolon-separated, with the columns `typ;utförande;tjocklek_mm;bredd_mm;hållfasthetsklass;sorteringsklass;längd_mm;källa`. There are three kinds of rows:

| `typ` | Content | Source |
|---|---|---|
| `tvärsnitt` | 78 cross-sections: 20 `hyvlat` (22×70 to 95×95, including 45×45 to 45×245) and 58 `sågat` (12×48 to 150×150). Stored normalised, thickness ≤ width. | Svenskt Trä, *Virkessortiment* (the "Hyvlat virke" and "Sågat virke" tables) |
| `hållfasthetsklass` | C14/T0, C18/T1, C24/T2, C30/T3, C35 (machine-graded only, no T class) | Svenskt Trä, *Kvalitet och sortiment* (SS-EN 338, SS 230120, SS-EN 14081-1) |
| `längd` | 3000–5400 mm in 300 mm steps (9 lengths) | **Assumption** from `docs/Kravbild.docx` ("3,0 m till 5,4 m"). Svenskt Trä publishes no trade lengths. |

The articles are the cross product **tvärsnitt × hållfasthetsklass × längd**, which gives 78 × 5 × 9 = 3510 articles. No cross-section appears as both `hyvlat` and `sågat`, so a demand's profile alone decides the finish, and demands don't carry a finish. The CSV is moved into `src/domain/1dcutting/` and loaded with Vite's `?raw` import (already typed through `vite/client`), so it stays the single source of truth. Changing the assortment means editing the CSV, not code.


## Acceptance Scenarios

Unless a scenario says otherwise, stock is `SVENSKT_TRA_SORTIMENT`.

- [ ] **S01 [OC01,OC02] [TI02] Pieces share boards and the least-waste plan is picked**
  - **Given** four 45x95 C24 demands: `A` 2000, `B` 2000, `C` 1500 and `D` 1000 mm
  - **When** `planCuts` runs
  - **Then** it returns two boards: a 3600 board cutting `A` 2000 then `C` 1500 (waste 100), and a 3000 board cutting `B` 2000 then `D` 1000 (waste 0). Totals: required 6500, purchased 6600, waste 100, wastePct ≈ 1.52. Order lines are 1 × 45x95-C24-3600 and 1 × 45x95-C24-3000. (The one-board-per-piece baseline would buy 4 × 3000 = 12000 mm.)

- [ ] **S02 [OC01] [TI02] Cut offsets describe the saw sequence**
  - **Given** the S01 plan
  - **When** the 3600 board's cuts are read
  - **Then** they are `{A, 2000, offset 0}` and `{C, 1500, offset 2000}`. On every board, each offset equals the sum of the preceding cut lengths.

- [ ] **S03 [OC03] [TI02] Non-standard dimensions are unplaced, not guessed**
  - **Given** a 45x182 C24 demand (the sample's "FD5 Opening header beam 45x182 C24" is like this)
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
  - **Then** every input `ifcTag` appears exactly once, either in a board or in `unplaced`. On every board, `usedMm ≤ article.lengthMm`, and the board's profile and grade equal those of each of its cuts. No board could be swapped for a shorter stock length of the same profile and grade that still fits `usedMm`. Totals equal the sums over boards. The call completes in under 1 s in Vitest.

- [ ] **S10 [OC04] [TI01] The bundled stock table is complete and well-formed**
  - **Given** `SVENSKT_TRA_SORTIMENT`
  - **When** it is inspected
  - **Then** it has 3510 articles with unique ids. Every profile is normalised and every length is a positive integer in mm. It contains `hyvlat` 45x95 C24 and `sågat` 47x100 C24 at 3000–5400 mm in 300 mm steps, and it contains no 45x182.

- [ ] **S11 [OC01] [TI01,TI02] Sorting classes are accepted as strength-class aliases**
  - **Given** a 45x95 demand with grade `T2`
  - **When** `planCuts` runs
  - **Then** it is planned on a 45x95 **C24** board, and it can share a board with a 45x95 C24 demand. An unknown grade such as `X9` is unplaced with `no-matching-stock`.

- [ ] **S12 [OC04] [TI01] A malformed stock CSV is rejected**
  - **Given** CSV text with an unknown `typ`, a non-numeric `tjocklek_mm`, or a `längd` row without `längd_mm`
  - **When** `parseStockCsv` runs
  - **Then** it throws an error that names the offending line number, instead of returning a partial table.


## Structural Criteria

- [ ] `npm run lint`, `npm run typecheck`, `npm run test:run` and `npm run build` pass.
- [ ] `src/domain/1dcutting/` imports nothing from `react`, `three`, `web-ifc`, other feature folders or DOM APIs, and adds no new dependencies.
- [ ] `planCuts` does not mutate its inputs.
- [ ] The fixtures are hand-written. Tags are made-up ids, and nothing is copied from `772_H811_new.ifc` or `components.xml`.


## Scope & Boundaries

### Work Areas
- `src/domain/1dcutting/`: types, the stock CSV (moved from `docs/specs/1d-cutting/`), `parseStockCsv`, `SVENSKT_TRA_SORTIMENT`, `planCuts`, and tests alongside them.

### What We're NOT Doing
- Building `CutDemand[]` from IFC or `components.xml`, including parsing dimensions and grades from names such as `'FD5 Opening header beam 45x182 C24'`. That's a later adapter spec.
- UI: cutting list, waste report, click-through to the 3D view. Those are later feature specs.
- Kerf, end trim, minimum usable offcut, remnant reuse, and finger-jointing or splicing of pieces that are too long.
- Prices, cost minimisation, supplier catalogues and stock quantities (stock is unlimited).
- Sheet materials (`SHEET`, 2D cutting) and non-timber materials.
- Exact or ILP solvers.
- A one-board-per-piece baseline function. The baseline figure in S01 is only for comparison in this document.


## Architecture Decision

**Approach**: Group demands by (profile, grade) and match each group against the stock articles with the same profile and grade. For each group, and for each available stock length *L*, run **First Fit Decreasing** (pieces sorted by length descending, ties broken by `ifcTag` ascending; a new board of length *L* is opened when no open board fits). Then **downsize** each board to the shortest article that still fits its `usedMm`. Keep the candidate with the least waste, breaking ties by fewest boards and then by smallest *L*.
**Why this over alternatives**: This is deterministic, needs no dependencies, and takes milliseconds for about 750 pieces (9 lengths × FFD per group). Trying each opening length and then downsizing fixes FFD's main weakness with mixed stock lengths. An exact column-generation/ILP solver would need a WASM solver dependency, which the demo doesn't justify. The `planCuts` signature lets a better solver replace this one later.


## Constraints & Gotchas

- **Constraint**: Lengths from IFC/XML may be non-integer (e.g. 2399.5). Don't round. Compare "fits" with a tolerance of 1e-6 mm so that float sums don't reject exact fits.
- **Constraint**: Output order is part of the contract (S08). Boards are sorted by thickness, width and grade (ascending), then board length (descending), then the first cut's `ifcTag`. Unplaced demands are sorted by `ifcTag`. Order lines follow board order.
- **Assumption**: The trade lengths (3000–5400 mm in 300 mm steps) come from Kravbild, not from Svenskt Trä. Every cross-section is assumed to be available in every strength class and length. See Open Questions.
- **Constraint**: Grade matching is exact after alias normalisation (T0→C14, T1→C18, T2→C24, T3→C30). A higher class is **not** used in place of a lower one, e.g. C30 stock for a C24 demand. That rule is the same as in `base_case.txt`.
- **Avoid**: coupling the module to the viewer's `ElementInfo`. The only link to IFC is the `ifcTag` string.


## Implementation Plan

### Implementation Tasks

- [ ] **TI01** `src/domain/1dcutting/` contains the domain types, `normaliseProfile` and `normaliseGrade` helpers, the stock CSV (moved with `git mv` from `docs/specs/1d-cutting/svenskt_tra_virkessortiment.csv`), a pure `parseStockCsv`, and `SVENSKT_TRA_SORTIMENT` built from the CSV through a `?raw` import.
  - **Verify**: The S10–S12 unit tests pass, and typecheck and build pass.

- [ ] **TI02** `planCuts(demands, stock)` implements grouping, validation (reasons for unplaced demands, an error on duplicate tags), FFD per candidate length with downsizing, least-waste selection, deterministic ordering and totals.
  - **Verify**: Unit tests for S01–S09 pass. The S09 test uses a small seeded PRNG written in the test, with no dependency.

### Testing Strategy
- Pure Vitest unit tests in the node environment, next to the code (`planCuts.test.ts`, `svenskTrastandard.test.ts`).
- Small stock lists are written inline in tests, so that scenarios don't depend on the bundled table, except for S01, S03, S10 and S11.

### Validation
- Manual one-off check (not committed): feed the timber pieces from the sample model into `planCuts` and compare its waste % with the baseline's 49.24 % in `base_case.txt` for the same pieces.


## Open Questions

1. **Trade lengths.** Svenskt Trä publishes no lengths, so 3000–5400 mm in 300 mm steps is taken from Kravbild. Should the supplier's actual lengths (for example 2400–6000 mm) replace it? That only means editing the `längd` rows.
2. **Availability per class.** In practice C18/C30 are rarely stocked and C14 mostly in small dimensions (Svenskt Trä). Should the table restrict classes per cross-section instead of using the full cross product?
3. **Non-standard profiles** such as 45×182. Should a later spec allow ripping them from a wider standard profile, or do they stay unplaced and get bought as special orders?
4. **Baseline function.** Should the domain also provide the one-board-per-piece baseline, so that the waste report can show % saving (Kravbild §5)? It's cheap to add, but it isn't in this spec.


## Implementation Observations

> _Managed by exec-spec post-implementation – append-only. Spec authors: leave this section empty._
