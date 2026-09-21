# Code review: Brädgårdar stock view

## Report details
- **Review mode used:** code, with an always-on critic pass run by a fresh-context `review-critic` sub-agent.
- **Scope:** the new read-only Brädgårdar tab.
  - `stockSummary.ts` and its test.
  - `LumberyardsPanel.tsx`, its CSS and its test.
  - `LumberyardPicker.tsx` and its CSS, moved out of `CuttingPanel`.
  - In `App.tsx`: the new tab and the new board-build condition.
  - In `App.test.tsx`: the tab tests.
  - The run note appended to `lumberyards.md`.
  - The other uncommitted lumberyard work in the tree is out of scope.
- **Intent context:** the user asked to "add a view to show the stock of each lumberyard". The baseline is the `lumberyards.md` run note "Run: 2026-09-18 (quick-implement): stock view".
- **Source trust:** trusted-local. There is no reconciliation ledger.
- **Report location:** tier 2, a spec-directory match (`docs/specs/lumberyards/`).

## Summary
The feature works and follows the project rules. Tests, typecheck, lint and build all pass, and screenshots were taken at desktop and phone width.

There are no CRITICAL or HIGH findings. Four findings are routed to Fix:
- two test gaps (F1, F3);
- a table accessibility issue (F7);
- needless re-rendering of a hidden panel (F8).

Two findings are UX decisions to put to the user (F2, F4).

## Guardrails
Guardrails Coverage: 5 checked, 0 findings.
- **Pure domain:** `src/domain` has no React or DOM imports.
- **No cross-feature imports:** features don't import each other. The picker moved to `components` for this reason.
- **Safe rendering:** there is no `dangerouslySetInnerHTML`, and all file-derived text is rendered as React text.
- **No storage:** nothing is written to browser storage.
- **Tests:** they sit next to their subject.

## Findings

### MEDIUM

**F1 – The board-build trigger change has no test**
- **Details:** Reviewer: critic. Confidence: 75. Location: `src/App.tsx:80`. Scope: primary. Class: code-defect. Routing: **Fix**.
- **Finding:** The spec note says "Opening Brädgårdar doesn't build the board list". If the old condition came back, every test would still pass.
- **Fix:** Add an App test. Open Brädgårdar and check that `getBoards` was not called. Then open Kapning and check that it was called once.

**F2 – Changing yard in the stock view also changes the plan and clears 3D traces**
- **Details:** Reviewer: critic. Confidence: 50. Location: `src/App.tsx` (`selectLumberyard`). Class: design-changed. Routing: **Note**.
- **Finding:** This follows from the chosen design: one yard choice, shared with Kapning. It is a UX decision for the user, for example whether the stock view should have its own independent picker.

**F4 – The stock view needs a loaded model**
- **Details:** Reviewer: critic. Confidence: 50. Location: `src/App.tsx` (the `shown &&` gates). Class: ambiguous-intent. Routing: **Note**.
- **Finding:** The whole tab bar is gated on a loaded model. Showing the tabs without a model would change the app shell, which is outside this change. The user decides.

### LOW
- **F3 – The shared-yard App test is weak.** It passes even if the picker is wired to `setLumberyardId`. Extend it to check that Kapning's plan changed and that traces were cleared. Routing: **Fix**.
- **F7 – Two accessibility issues in the stock table.** Routing: **Fix**.
  - The `scope="rowgroup"` header cell also holds the group totals, so screen readers repeat the totals for every cell. Keep only "profile grade" in the `<th>` and move the totals to a `<td>`.
  - The section and the table have the same accessible name. Drop the section's `aria-labelledby`.
- **F8 – The hidden panel re-renders its whole table on every App update.** Har allt has 640 rows. The panel keeps no state, so render it only while its tab is open. Routing: **Fix**.
- **F5 – An unreadable yard's parse error is not shown or logged when only the stock view is opened.** The message matches Kapning's generic text. Routing: Note.
- **F6 – The unlimited-quantity path is unreachable for parsed yards.** Where it can be reached, its totals read as "0 boards". It is kept because `StockArticle.quantity` is optional in the type. Routing: Note.
- **F9 – Printing issues.**
  - A printed page of the stock tab has no print palette in dark mode.
  - The Kapning print view hides the yard. That second issue predates this change and is already listed in the spec. Routing: Note.
- **F10 – `App` crashes if the `lumberyards` prop is an empty list.** This is only reachable through the prop, and the crash predates this change. Routing: Note.
- **F11 – The stock view's message has no live region.** This matches the Kapning message. Routing: Note.
- **F12 – Groups ignore the finish.** A profile and grade stocked in both finishes would share one group. The bundled CSVs don't do this. Routing: Note.

## Coverage Matrix
| Surface | Evidence read | Proof it works | Falsifier tried | Result |
|---|---|---|---|---|
| `summarizeStock` grouping, sorting and totals | source and test | 5 unit tests | numeric grade sort, empty stock, unlimited quantity, quantity 0 | covered (F6, F12 noted) |
| LumberyardsPanel states | source and test | 5 tests: stock, switching yard, unreadable yard, empty yard, bundled yards | wrong row grouping, error state keeping the picker usable | covered (F7) |
| Picker move | CuttingPanel diff, grep | CuttingPanel suite green | leftover `.cutting__yard` references, lost print rule | covered |
| App tab wiring and keyboard navigation | `App.tsx` diff, `App.test.tsx` | tab-count test, arrow-key, Home and End tests | wrap-around with 4 tabs | covered |
| Board-build trigger | `App.tsx:80` | none | reverting the condition | finding F1 |
| Yard shared with Kapning | `App.tsx` `selectLumberyard` | App test | wiring the picker to the wrong setter | finding F3 |
| Layout and responsiveness | Playwright screenshots at 1280 and 390 px | no horizontal scroll at 390 px | metre values wrapping | covered (fixed during implementation) |
| Spec note | `lumberyards.md` | states the scope change | contradiction with "What We're NOT Doing" | covered: the note states the replacement explicitly |

## Critic Coverage
The sub-agent attacked:
- **Assumptions:** the effect's tab allowlist, whether quantity is optional, finish grouping, an empty yard list, and model-free access.
- **Unhappy paths:** an unreadable yard, an empty yard, unlimited stock, and quantity 0.
- **Hidden coupling:** the shared yard state, plan recomputation, hidden-panel renders, print rules, and removed CSS.
- **Accessibility and tests:** accessibility issues, and weak test assertions.

## Verification Evidence
- `npm run test:run`: 19 files, 187 tests passing.
- `npm run typecheck`: exit 0.
- `npm run lint` (oxlint): exit 0 with no diagnostics.
- `npm run build`: exit 0. The only warning is the existing chunk-size warning.
- **Runtime:** checked with Playwright and the sample IFC on the dev server, with no console errors.

## Readiness
**Needs Fixes**: 0 CRITICAL, 0 HIGH, 3 MEDIUM (1 Fix, 2 Note), 9 LOW (3 Fix, 6 Note).

CONVERGED: no. F1 is a new MEDIUM code-defect.
Auto-Remediation: PENDING. F1, F3, F7 and F8 will be applied in the quick-implement loop.

## Remediation (applied in the quick-implement loop)
- **F1 fixed:** new App test "does not build the board list when only Brädgårdar is opened". It fails when the old effect condition is restored.
- **F3 fixed:** the shared-yard test now checks that the trace is cleared and that Kapning's order lengths change (Standard `3,600, 3,300` → Har allt `6,600`). It also checks the other direction. It fails when the picker is wired to `setLumberyardId`.
- **F7 fixed:**
  - The rowgroup `<th>` now holds only "profile grade", and the totals are in a sibling `<td>`.
  - The section's `aria-labelledby` was removed.
- **F8 fixed:** the panel is rendered only while its tab is open.
- **After the fixes:**
  - `test:run` has 19 files and 188 tests, all passing.
  - lint, typecheck and build exit 0.
  - Playwright screenshots at 1280 and 390 px show no horizontal scroll and no console errors.

CONVERGED: yes. No Fix-routed code-defect is left. Auto-Remediation: CLEAR.
