# Requirements Clarification: Mock Lumberyards (Brädgårdar)

> **Source Trust**: trusted-local

## Summary

Today the cutting planner buys from one unlimited catalogue: the Svenskt Trä assortment (`svenskt_tra_virkessortiment.csv`), where every cross-section comes in every grade and every length from 3.0 to 5.4 m. This feature replaces that catalogue with three **mock lumberyards**. Each has its own bundled stock file with a **finite quantity per article**. The user picks a yard in the **Cutting** tab, and the planner may only use what that yard has in stock. This covers the Kravbild must-have "Anpassning till artikelregister och handelslängder" ("matcha materialbehovet mot leverantörernas tillgängliga sortiment och fasta virkeslängder"). It also lets the demo show how the choice of yard changes waste and coverage.

The three yards:

- **Har allt brädgård**: everything the model needs, in a wide range of lengths, with plenty of stock.
- **Standard brädgård**: a realistic everyday yard. It carries Svenskt Trä cross-sections only, in the common grades and lengths, and its quantities run a little short.
- **Bara märkliga mått brädgård**: mostly the right cross-sections, but only in odd lengths, and some profiles are missing or come in non-standard sizes.

## Scope

### In Scope
- Three bundled stock files, one CSV per yard, in `src/domain/1dcutting/`. They use the column vocabulary of `svenskt_tra_virkessortiment.csv` (`utförande`, `tjocklek_mm`, `bredd_mm`, `hållfasthetsklass`, `sorteringsklass`, `längd_mm`, `källa`), with **one row per article** and an added **`antal`** (quantity on hand) column.
- A parser for the yard stock format. It rejects malformed rows with their line number, as `parseStockCsv` does today.
- A check (unit test) that every row in **Har allt** and **Standard** uses a cross-section and grade from the Svenskt Trä reference CSV. **Har allt** may also use the model-specific rows the 1D cutting spec already accepted. **Märkliga** is exempt: it deviates on purpose, and its `källa` column says so.
- A **quantity-aware planner**. It never uses more boards of an article than the chosen yard has. When stock is scarce, the **longest pieces claim stock first**. When the best-fitting length is sold out, it may switch to another in-stock length of the **same profile and grade**. Among the plans that respect stock, it still minimises waste (First Fit Decreasing plus a choice of stock length, as today). It stays deterministic.
- A new not-planned reason, **out of stock**. The yard carries the article (profile, grade and a length long enough), but every board has already been used. This is separate from "No matching stock article" (the yard doesn't carry the profile or grade) and from "Longer than the longest stock length" (measured against the lengths *this yard* carries for that profile and grade).
- A **lumberyard selector** at the top of the Cutting tab, defaulting to **Standard brädgård**. Changing it re-plans. The waste report, order list, cut bars, cutting report, "Not planned" list and 3D traceability (Cutting ↔ 3D and the element info panel's cutting context) all follow the chosen yard.
- Order list stock columns: **In stock** and **Left after order** per order line. An article the order uses up completely is marked **sold out**.
- The waste report gets an **Out of stock** count, next to the existing "Not planned" figures.
- The cutting report names the chosen yard.
- The unlimited `SVENSKT_TRA_SORTIMENT` is **no longer an input to the planner**. The Svenskt Trä CSV stays as the reference the yard files are validated against.

### Out of Scope
- Prices, cost minimisation or choosing a yard by cost.
- Splitting one order across several yards, or planning a fallback yard for pieces one yard can't supply.
- Substitution: no higher grade (C30 for C24) and no larger cross-section cut down. Grade matching stays exact after the T-class aliases (T0→C14, T1→C18, T2→C24, T3→C30).
- Editing stock in the UI, uploading a custom stock file, or a real supplier integration (Kravbild §4: no automatic ordering).
- Stock that persists or depletes across sessions or models. Every plan starts from the yard's full mock stock.
- A browser for the yard's full stock list (only order-line stock columns).
- Sheet material and insulation (unchanged, not part of the 1D planner).

### MVP Boundary
- The three yard CSVs, the quantity-aware planner with the `out-of-stock` reason, the selector with session memory, the order-list stock columns and the Out of stock count. Nothing else.

### Not Doing (for now)
- **Side-by-side comparison of the three yards** (boards, waste %, not planned). A cheap follow-up, since each plan is a pure function call, but not requested.
- **Allocation by prefab element or module**, so an element is either fully covered or flagged. More useful for the factory, but it uses stock less efficiently and is harder to build. Longest pieces first was chosen instead.
- **Keeping the unlimited Svenskt Trä catalogue as a fourth option.** It was replaced, so the demo only shows stock-constrained plans.
- **Grade or profile substitution.** It changes the traceability and order semantics, so it needs its own decision.

## Functional Requirements

### User Stories
- As a **buyer**, I want to plan cuts against a specific lumberyard's actual stock, so that the order I review can really be delivered.
- As a **buyer**, I want to see how much of each article the order uses and what's left, so that I can spot articles that run out.
- As a **buyer**, I want pieces the yard can't supply to be listed with a clear reason (not carried, too long, out of stock), so that I know what still has to be sourced elsewhere.
- As a **demo presenter**, I want to switch between an ideal, a normal and an awkward yard, so that the audience sees how assortment and lengths drive waste.
- As a **cutting operator**, I want the cutting list to come only from boards that are actually in stock, so that the sawing plan matches the delivery.

### Core Flows
1. The user loads an `.ifc` file and opens **Cutting**.
2. The Cutting tab shows the selector with **Standard brädgård** preselected (or the yard chosen earlier in this session), and a plan against that yard's stock.
3. The user picks **Har allt brädgård** in the selector.
4. The plan is recomputed against that yard. The totals, order list (including the In stock and Left after order columns), cut bars and Not planned list update. Any open cut trace or 3D highlight refers to the new plan.
5. The user opens the **Cutting report**. Its header names the chosen yard.

### Alternate Flows
- **Article sold out**: the planner switches to another in-stock length of the same profile and grade. If none is long enough, the piece is listed under Not planned as "Out of stock at \<yard\>". The order line for the article is marked sold out, and Left after order shows 0.
- **Yard doesn't carry the profile or grade**: the piece is listed as "No matching stock article" (existing reason, now judged per yard).
- **Piece longer than every length the yard carries for that profile and grade**: listed as "Longer than the longest stock length" (existing reason, per yard).
- **A new model is loaded**: the chosen yard stays selected, and the plan is computed for the new model against the full mock stock.
- **Page reload**: the selector goes back to Standard brädgård.
- **A 3D element is picked**: the info panel's cutting context (board, offset, siblings, or the not-planned reason) comes from the plan for the chosen yard.

### UI Wireframes

```
Cutting
┌──────────────────────────────────────────────────────────────────────┐
│ Lumberyard: [ Standard brädgård        ▾ ]                           │
├──────────────────────────────────────────────────────────────────────┤
│ Waste report                                       [Cutting report]  │
│ Pieces placed · Not planned · Out of stock · Boards to buy ·         │
│ Purchased · Required · Waste (%) · Saw kerf                          │
├──────────────────────────────────────────────────────────────────────┤
│ Order list                                                           │
│ Profile  Grade Finish Length Qty  Total   In stock  Left after order │
│ 45x95    C24   hyvlat  4800   12  57.6 m      40         28          │
│ 45x220   C24   hyvlat  5400   30 162.0 m      30          0 sold out │
├──────────────────────────────────────────────────────────────────────┤
│ Boards (cut bars) …                                                  │
│ Not planned (N) … reason: "Out of stock at Standard brädgård"        │
└──────────────────────────────────────────────────────────────────────┘
```

## Design Decisions

### Design Space Decomposition
```
Mock lumberyards
├── Stock semantics:      finite quantity per article ← chosen · assortment only, unlimited · quantities shown but not enforced
├── Stock file format:    one CSV per yard, one row per article + antal ← chosen · cross-product + one quantity per yard · base on old trästandard CSV ✗
├── Har allt:             every model profile/grade, 2.4–10.2 m, ample qty ← chosen · cut-to-length boards · today's sortiment unlimited
├── Standard:             Svenskt Trä profiles only, common grades, 3.0–5.4 m, slightly short qty ← chosen · also carries model-specific profiles · enough qty for the model · full sortiment
├── Märkliga mått:        odd lengths + some odd/missing profiles ← chosen · odd lengths only · odd cross-sections only
├── Scarcity priority:    longest pieces first ← chosen · whole prefab elements first · module order
├── Substitution:         none, other lengths of the same profile and grade only ← chosen · higher grade · higher grade + larger profile
├── Yard selection UI:    selector in Cutting tab ← chosen · selector + comparison table (deferred) · comparison only
├── Stock visibility:     In stock + Left after order per order line ← chosen · plus stock browser · yard name only
├── Selection memory:     session (survives tab switches and model loads) ← chosen · localStorage · reset per model
└── Old catalogue:        replaced, kept as validation reference ← chosen · kept as 4th option
```

### Cross-Consistency Notes
- *Finite quantities* + *no substitution* means a sold-out article can only fall back to another length of the same profile and grade. Anything else becomes `out-of-stock`, so that reason must be first-class in the domain, the waste report, the Not planned list and the traceability `TraceStatus`.
- *Standard carries Svenskt Trä profiles only* + the sample model means about 485 of the 1,060 sample boards are "No matching stock article" at Standard. These are the 329 pieces of 22x145 C16 siding, plus 45x182, 12x45, 90x95, 90x145 and 90x220. This is intended: it shows why a yard's assortment matters. But Standard's "Pieces placed" drops well below today's 1,003.
- *Märkliga has mostly the right cross-sections*, including model-specific ones, while Standard has only Svenskt Trä profiles. So Märkliga may plan **more pieces** than Standard while still wasting the most. The acceptance criteria compare waste % and reasons, not piece counts, between those two.
- *Har allt up to 10.2 m* goes beyond the Kravbild "3,0 m till 5,4 m" assumption on purpose. Svenskt Trä publishes no trade lengths, and this is a mock yard.
- *Longest pieces first* fits the existing First Fit Decreasing order (pieces sorted by length, descending), so the scarce stock goes where short offcuts can't serve.

### Resolved Decisions
| Dimension | Choice | Rationale |
|---|---|---|
| Stock semantics | Finite `antal` per article, enforced by the planner | "Available stock" means what the yard has on hand, and an order that can't be delivered is not a valid plan |
| File format | One CSV per yard, the Svenskt Trä column vocabulary, one row per article + `antal` | Follows the existing svensk trästandard CSV, and quantities can differ per article |
| Har allt | Every profile and grade the sample model uses (except glulam and decimal widths), 2.4–10.2 m (300 mm steps up to 6.0 m, coarser above), ample quantities | "Har allt" has to cover the 50 sample pieces over 5.4 m (longest 9,725 mm) |
| Standard | Svenskt Trä cross-sections only; mainly C24, plus C16 (studs, siding) and C14 (small dimensions); 3.0–5.4 m in 300 mm steps; quantities that leave 1–2 articles short on the sample model | A realistic yard that shows out-of-stock in a normal case |
| Märkliga mått | Mostly the model's cross-sections, only in odd lengths (e.g. 2370, 3130, 4470, 6110 mm); a few profiles missing or non-standard | Shows higher waste and some unplanned pieces |
| Scarcity priority | Longest pieces claim stock first | Deterministic, consistent with FFD, and places the most metres |
| Substitution | None; only another length of the same profile and grade | Keeps the existing exact-match rule from `base_case.txt` and the 1D cutting spec |
| UI | Selector at the top of the Cutting tab, default Standard | One active plan keeps traceability simple |
| Stock visibility | In stock and Left after order per order line, sold-out marker, and an Out of stock count in the waste report | Enough to review deliverability without a stock browser |
| Selection memory | For the session: kept across tab switches and new models, reset on reload | No storage, and nothing about the confidential model is written anywhere |
| Old catalogue | No longer a planner input; kept as the validation reference | The yards are the only stock sources |

### Open Design Questions
- None. Algorithm internals (how to extend FFD plus the choice of stock length with quantity limits) belong in the `andthen:spec` skill.

## Edge Cases
| Scenario | Expected Behavior |
|---|---|
| The article's best length is sold out, and a longer length of the same profile and grade is in stock | The piece is cut from the longer in-stock length. More waste, but it's planned. |
| Every length of the profile and grade that's long enough is sold out, but shorter lengths remain | Out of stock at \<yard\>. Pieces are never joined, and a shorter board is never used for a longer piece. |
| The yard carries the profile but not the grade (e.g. C16 at a yard with only C24) | No matching stock article. There's no grade substitution. |
| A piece is longer than every length this yard carries for its profile and grade, but another yard has longer ones | Longer than the longest stock length, judged per yard. The same piece may be planned at Har allt. |
| A yard article has `antal` 0 | Treated as not in stock: it's never used, and pieces that only fit it are out of stock. The row stays valid. |
| An article is used exactly up | Left after order is 0, and the line is marked sold out. This isn't an error. |
| Two pieces compete for the last board of an article | The longer piece gets it, with a deterministic tie-break on `ifcTag` (as in today's sort). |
| The same article appears on two rows of a yard CSV | Rejected by the parser (duplicate article), naming the line number. |
| A glulam (`GL`) or decimal-width board | No matching stock article at every yard (unchanged). |
| The yard is switched while a cut is traced in 3D | The trace and highlight refer to the new plan. A piece that isn't planned in the new plan shows its not-planned reason, never a stale board from the previous yard. |
| A new model is loaded | The same yard is used with its full mock stock. There's no carry-over depletion. |
| A plan fits entirely within stock (e.g. Har allt) | Out of stock count is 0, and no line is marked sold out. |

## Error Handling
| Error | User Message | Recovery |
|---|---|---|
| A bundled yard CSV is malformed (unknown column, non-numeric value, negative or non-integer `antal`, duplicate article) | Caught in tests. If it still happens at runtime: "The stock list for \<yard\> could not be read." in the Cutting tab | Pick another yard. The other yards and the other tabs keep working. |
| Planning throws for the chosen yard | The existing "The cutting plan could not be computed for this model." state | Pick another yard, or load another model |
| No pieces can be planned at the chosen yard | The waste report shows 0 placed. Every piece is under Not planned with its reason. | Pick another yard |

## Non-Functional Requirements
- **Performance**: Switching yards re-plans the sample model (about 1,000 pieces) in under 1 s in the browser, like today's plan (S09 bound). No worker is needed.
- **Determinism**: The same model and the same yard always give the same plan, order list and traceability.
- **Security**: Yard stock is static bundled data. There are no network calls, and nothing derived from the model is stored (the selection is kept in memory only). File-derived text is still rendered only as React text.
- **Accessibility**: The selector is a labelled native `<select>` (or equivalent), reachable by keyboard. "Sold out" is text, not colour alone. The stock columns have header cells like the existing order-list columns.
- **Language**: The yard names are Swedish proper names ("Har allt brädgård", "Standard brädgård", "Bara märkliga mått brädgård"). New UI strings are in English, like the existing panels.
- **Architecture**: Yard data, parsing and quantity-aware planning live in `src/domain/1dcutting/` (pure TS, no React). The selector and stock columns live in `src/features/cutting-plan/`, and `App` owns the chosen yard so that the Cutting tab and the 3D info panel share one plan.

## Success Criteria
- [ ] Three yards are bundled, each as its own CSV with an `antal` column, one row per article, and the Svenskt Trä column vocabulary. The parser rejects malformed rows with a line number.
- [ ] A test proves that every **Har allt** and **Standard** row uses a Svenskt Trä cross-section and grade (Har allt may also use the accepted model-specific rows), and that **Standard** uses Svenskt Trä cross-sections only, grades C14/C16/C24, and lengths of 3000–5400 mm.
- [ ] For any model and yard, no article is used more times than its `antal` (property test over the plan's order lines).
- [ ] With limited stock, a longer piece is never out of stock while a shorter piece of the same profile and grade got a board it could have used (longest-first priority).
- [ ] A piece is `out-of-stock` only if the yard carries its profile and grade in a length long enough for it. Otherwise the reason is `no-matching-stock` or `too-long`, judged against that yard.
- [ ] Every input piece still appears exactly once, either on a board or under Not planned (no silent drops), for every yard.
- [ ] Sample model, **Har allt brädgård**: every piece except the glulam and decimal-width ones (7 boards) is planned, including all 50 over 5.4 m. The Out of stock count is 0, and waste % is the lowest of the three yards.
- [ ] Sample model, **Standard brädgård**: all pieces with a Svenskt Trä profile are planned except at least one that is out of stock and those over 5.4 m. The model-specific profiles (22x145, 45x182, 12x45, 90x…) are "No matching stock article". At least one order line is marked sold out.
- [ ] Sample model, **Bara märkliga mått brädgård**: waste % is the highest of the three yards, and at least one piece is not planned for a missing profile and/or out of stock.
- [ ] The selector defaults to Standard, keeps its choice across tab switches and model loads, and resets on reload. Changing it updates the totals, order list, cut bars, Not planned list, cutting report header and the 3D info panel's cutting context.
- [ ] The order list shows In stock and Left after order per line, with a text "sold out" marker when Left after order is 0. The waste report shows an Out of stock count.

## Dependencies
| Dependency | Purpose | Risk |
|---|---|---|
| `docs/specs/1d-cutting/1d-cutting.md` (`planCuts`, the Kerf Model, `UnplacedReason`, board ordering) | The planner and plan types that get extended | Adding quantities changes the algorithm's contract and the S09 property test. Existing scenarios must be re-based on a yard, or on an unlimited test stock. |
| `docs/specs/cut-traceability/cut-traceability.md` (`computeCuttingPlan`, `TraceStatus`, `CutLocation`) | The plan is shared by the Cutting tab and the 3D info panel | `computeCuttingPlan` gets a yard parameter, and `TraceStatus` gets the `out-of-stock` reason |
| `src/domain/1dcutting/svenskt_tra_virkessortiment.csv` | The validation reference for Har allt and Standard | Its role changes from planner input to reference, so its spec text needs updating |
| `components.xml` / `772_H811_new.ifc` sample | Sizing the yard quantities and checking the acceptance outcomes | The quantities are tuned to this one sample, and other models will behave differently (acceptable for mocks) |

## Open Questions
- Which 1–2 Standard articles should run short on the sample model, e.g. 45x220 C24 5400 (125 pieces in the model)? The spec should pick them so the out-of-stock demo is visible without hiding the rest of the plan.
- Which profiles should Märkliga miss or offer only in non-standard sizes, e.g. no 45x182 and a 44x96 in place of 45x95? The spec should pick them so that at least one piece is not planned and the waste % ends up highest.
- Should the order-list total and the waste report also show "metres out of stock", or only the piece count? Default: piece count only.

## Decisions Log
| Decision | Rationale | Date |
|---|---|---|
| Stock is a finite quantity per article, enforced by the planner | The user asked for the cutting to be "based on the lumberyard's available stock" | 2026-09-18 |
| Har allt: everything the model uses, 2.4–10.2 m, ample quantities | "Optimal boards"; the sample has pieces up to 9,725 mm | 2026-09-18 |
| Märkliga: odd lengths plus some odd or missing profiles | Contrasts with the other yards on both waste and coverage | 2026-09-18 |
| Standard: Svenskt Trä profiles only, common grades, 3.0–5.4 m, slightly short quantities | A realistic yard; the user accepted that the model-specific profiles go unplanned there | 2026-09-18 |
| One CSV per yard, the svensk trästandard column vocabulary + `antal` | "Follow the csv svensk trästandard" with quantities per article | 2026-09-18 |
| No grade or profile substitution | Keeps the existing exact-match rule | 2026-09-18 |
| Longest pieces get scarce stock first | Deterministic, consistent with FFD | 2026-09-18 |
| Selector in the Cutting tab, default Standard, remembered for the session | One active plan; no storage of anything | 2026-09-18 |
| Order list gets In stock and Left after order; waste report gets an Out of stock count | Makes deliverability reviewable | 2026-09-18 |
| The unlimited Svenskt Trä catalogue is replaced as planner input and kept as the validation reference | The yards are the only stock sources | 2026-09-18 |
