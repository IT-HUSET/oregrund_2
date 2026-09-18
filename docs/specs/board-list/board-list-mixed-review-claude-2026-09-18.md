# Board List – Mixed Review (code, gap)

- **Scope**: uncommitted working-tree implementation of `docs/specs/board-list/board-list.md` (standalone FIS). Files: `src/domain/boards/*`, `src/domain/ifc/elementInfo.ts`, `src/features/ifc-viewer/ifcLoader.ts` (+ test, `__fixtures__/boards.ifc`), `src/features/board-list/*`, `src/App.tsx|css|test.tsx`, `src/index.css`.
- **Implementation root**: `/Users/kristoffersmedlund/slask/labbithuset`
- **Review mode used**: mixed
- **Resolved chain**: code, gap (explicit `--mode code,gap`; security auto-add suppressed by explicit chain)
- **Intent Context**: FIS Intent + Expected Outcomes OC01–OC04; Non-Goals (no optimizer, no row→3D, no sheets, no components.xml, no Web Worker).
- **Source Trust**: trusted-local
- **Reconciliation Ledger**: none present
- **SOURCE_RUN**: exec-spec-board-list-2026-09-18T1515
- **Report location**: tier 2 spec-directory match (`docs/specs/board-list/`)

## Verification Evidence

| Check | Result |
|---|---|
| `npm run lint` (oxlint) | pass, no output |
| `npm run typecheck` | pass |
| `npm run test:run` | 8 files, 85 tests pass |
| `npm run build` | pass (pre-existing >500 kB chunk warning only) |
| `package.json` diff | unchanged – no new runtime dependency |
| `grep react|three|web-ifc|document.|window.` in `src/domain/` | no hits |
| `grep dangerouslySetInnerHTML` / `fetch|XMLHttpRequest|WebSocket|sendBeacon` in `src/` | no hits |
| Sample cross-check (local python, grep-level) | 422 IFCBEAM + 309 IFCCOLUMN + 329 IFCCOVERING = 1,060; every board has exactly one `Length` quantity (no first-match ambiguity in `lengthOf`); 0 `*STANDARDCASE` entities |
| `NAME_PATTERN` pathological-input timing (48k-char inputs) | ≤1 ms – no ReDoS |
| Executor claim (node): 1,060 boards, 0 unparsed, all with element, ~72 ms | accepted; browser-side "no noticeable delay" not re-verified here |

## Coverage Matrix

| Surface | Evidence read | Positive proof | Falsifier attempted | Result |
|---|---|---|---|---|
| S01 name parsing | board.ts:71-88, board.test.ts:24-51 | all 7 S01 names + `75 Stud` + empty role tested with exact `toEqual` | `45 x 70`, `C24-T`, `45x70_`, `.5x70`, trailing ` *`, no piece code, double spaces run in node | covered |
| S02 extraction | ifcLoader.ts:95-98,170-248; boards.ifc; ifcLoader.test.ts | beam/column/covering with Tag, kind, raw length, `GOLV-999*`; proxy+plate excluded; memo test spies `GetLineIDsWithType` | two-level aggregation, pset (non-qto) on beam ignored, qto on proxy/plate ignored, IFC4 subtypes, units | covered (+L2, L3) |
| S03 summary | boardSummary.ts; boardSummary.test.ts | exact groups/totals; group totals sum to grand total | suffix-as-own-group, decimal profile ordering, empty list | covered |
| S04 tab/sort/filter UI | BoardsPanel.tsx; BoardsPanel.test.tsx; App.test.tsx | all 6 columns both directions, `aria-sort`, 255 before 1,200, filter + Clear filter, keyboard filter, rounding | empty cells last in both directions, stale filter across models (keyed by seq) | covered |
| S05 tab switch keeps 3D / new file resets | App.tsx:52-72,181-214; App.test.tsx | same viewport element + `data-selected`; one lookup across switches; model B unfiltered, default sort; stale model-A result ignored | load new file while on Boards (loading state), memory of replaced model | finding (M1, M2) |
| S06 unparsed / no-length | board.ts:90-123; BoardsPanel.tsx:79-83,164,170-174 | markers, "2 boards could not be fully read", Unparsed group filterable, no-length counts but not totals | board both unparsed and length-less counted once (flaggedCount per board) | covered |
| S07 extraction failure | App.tsx:60-68; BoardsPanel.tsx:47 | message, `console.error`, 3D still pickable | sync throw vs rejection (real impl wraps in `.then`, so rejection) | covered |
| S08 empty model | BoardsPanel.tsx:49 | message, no table | – | covered |
| Structural criteria | commands above | lint/typecheck/test/build pass; domain pure; no new dep; no innerHTML | browser sample check | covered (browser timing not re-run) |
| Tabs a11y (TI05) | App.tsx:115-177 | tablist/tab/tabpanel, aria-selected, roving tabindex, arrows/Home/End | panel `hidden` vs CSS `display` override (App.css `[hidden]` rule present) | covered |
| Fixtures / confidentiality | boards.ifc, `__fixtures__/boards.ts` | placeholder `Author`/`Organisation`, hand-authored | personal names, sample excerpts | covered |
| Security awareness (thin) | all changed files | file text rendered as React text only; test for `<b>` text; no network; regex linear in practice | ReDoS inputs, innerHTML, network sinks | covered – no issue |

## Guardrails

Guardrails Coverage: 7 checked, 0 findings

Checked against `CLAUDE.md` / FIS: domain purity (no React/DOM/three/web-ifc), dependency direction (features → domain only), tests co-located, hand-authored anonymised fixtures, no `dangerouslySetInnerHTML`, no network calls with file contents, no new runtime dependency.

## Code Lens Findings

### MEDIUM

**M1 – Loading state is invisible when a new file is chosen from the Boards tab**
- Reviewer: code/critic · Severity: MEDIUM · Confidence: 90 · Scope relation: primary
- Location: `src/App.tsx:181-196` (overlay `role="status"` rendered inside the `hidden` 3D tabpanel)
- Finding: the "Loading <file>…" overlay lives inside `.app__viewer`, which is `hidden` whenever `tab === 'boards'`. The FIS S05 flow (choose a different file while Boards is selected) therefore shows no loading state; the old model's board list stays on screen and looks interactive while the main thread is blocked parsing.
- Threatened invariant: ifc-3d-viewer spec S01 ("a loading state naming the file appears") now holds only on the 3D tab.
- Failure scenario: user on Boards picks `772_H811_new.ifc`; for the whole multi-second parse nothing changes on screen and nothing is announced, then the list silently swaps.
- Suggested fix: render the loading status outside the tab panels (e.g. next to the file name / above the tablist), or show it in the Boards panel too; add an App test for loading while on Boards.
- Class: code-defect · Routing: Note – several valid placements; not uniquely determined.

**M2 – A replaced model stays referenced (and its geometry in memory) via `boardResult` / `boardsRequestedFor`**
- Reviewer: code · Severity: MEDIUM · Confidence: 80 · Scope relation: primary
- Location: `src/App.tsx:33,42,49,62,67`
- Finding: `BoardResult.source` and the `boardsRequestedFor` ref hold the `LoadedIfcModel` object. After a new file loads, `shown` drops model A but these keep it reachable until Boards is opened for model B. `disposeScene` only frees GPU buffers; the `THREE.Group` still references every mesh's CPU-side `BufferAttribute` arrays, plus the disposed `IfcAPI` and the `Board[]`.
- Failure scenario: open Boards on model A, return to 3D, load model B and stay on 3D – model A's full mesh arrays remain in the JS heap alongside B's (before this change, `shown` was the only reference and A was collectable).
- Suggested fix: key the board request/result by `shown.seq` (a number) instead of the model object, e.g. `boardsRequestedFor = useRef<number | null>(null)` and `BoardResult = { seq, boards } | { seq, error }`, comparing against `shown.seq`.
- Class: code-defect · Routing: Fix – bounded, mechanical, stays within Intent.

### LOW

**L1 – "Reading boards…" is not announced**
- Location: `src/features/board-list/BoardsPanel.tsx:48`
- Plain `<p>`; screen-reader users get no status while extraction runs (≈72 ms in the sample, longer on bigger models). Suggested: `role="status"`.
- Failure scenario: SR user activates Boards on a large model and hears nothing until the tables appear.
- Class: code-defect · Routing: Note (polish, not in FIS).

**L2 – Board lengths assume the model's length unit is mm**
- Location: `src/domain/boards/board.ts:39,116-123`; `src/features/ifc-viewer/ifcLoader.ts:78,176` (`units` resolved but not used for boards)
- An IFC with `LENGTHUNIT` in metres yields `length: 2.408`, displayed as `2` mm and "0.0 m" totals. FIS says "raw Length in mm", which holds only for Vertex mm exports.
- Failure scenario: a metre-unit export shows every board as 0–6 mm long.
- Class: ambiguous-intent (non-blocking; spec says keep the raw value, only Vertex/mm in scope) · Routing: Note – decide in the optimizer spec whether to normalise to mm.

**L3 – IFC4 `IFCBEAMSTANDARDCASE` / `IFCCOLUMNSTANDARDCASE` are not collected**
- Location: `src/features/ifc-viewer/ifcLoader.ts:170,177,236-240` (`GetLineIDsWithType` without `includeInherited`)
- The sample has none, and the FIS names exactly three types, but a non-Vertex IFC4 export would silently omit those boards – contrary to the OC04 "nothing silently dropped" spirit.
- Failure scenario: an IFC4 file with `IFCBEAMSTANDARDCASE` members shows fewer boards than it contains, with no flag.
- Class: ambiguous-intent (non-blocking; out of Vertex scope) · Routing: Note.

### Security awareness
No findings. File-derived text is rendered only as React text (covered by a test), there are no network sinks, and `NAME_PATTERN` ran in linear time on adversarial inputs. Process note: this surface (parsing a user-chosen file) matches the security lens's "file-upload parsing" trigger, but the explicit `--mode code,gap` suppressed that lens. The app is client-only with no exfiltration path, so I don't count this toward readiness. Run `--mode security` if you want a formal pass.

## Gap Lens Findings

No gap findings. Every Acceptance Scenario S01–S08 and TI01–TI05 Verify clause has matching implementation and tests (see Coverage Matrix). The Structural Criteria are met, except that the browser-side "no noticeable delay" check was only proxied by the executor's node timing (~72 ms). Non-Goals are respected: no optimizer, no row→3D, no sheets, no components.xml. The FIS Acceptance-Scenario and Structural-Criteria checkboxes are still unticked, but ticking them is exec-spec bookkeeping and not a gap.

## Verdict

| Dimension     | Score | Threshold | Status |
|---------------|-------|-----------|--------|
| Functionality | 9/10  | >= 7      | PASS |
| Completeness  | 9/10  | >= 9      | PASS |
| Wiring        | 9/10  | >= 8      | PASS |

**Overall: PASS**

Code readiness: **Ready** (0 CRITICAL, 0 HIGH, 2 MEDIUM, 3 LOW)
Overall mixed readiness: **Ready**

Auto-Remediation: PENDING

NOT CONVERGED – new MEDIUM code-defects in this pass (M1, M2).

Counts: CRITICAL 0 · HIGH 0 · MEDIUM 2 · LOW 3 · Fix-routed 1 (M2) · Note-routed 4
