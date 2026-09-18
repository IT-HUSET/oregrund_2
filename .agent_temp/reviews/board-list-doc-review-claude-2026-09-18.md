# Doc Review: board-list FIS

- **Target**: `docs/specs/board-list/board-list.md`
- **Review mode used**: doc
- **Intent Context**: the FIS's own Intent + OC01–OC04. Baseline: `docs/specs/board-list/requirements-clarification.md`
- **Source Trust**: trusted-local
- **Reconciliation Ledger**: none (pre-implementation FIS)
- **Location**: tier 1, `--output-dir .agent_temp/reviews/`

## Executive Summary

The FIS is small (5 tasks, 8 scenarios) and traceable, and its data claims hold up against the sample file. Six findings: two MEDIUM and four LOW. All are localised clarity gaps where the FIS leaves out a decision the clarification or its wireframe already made. None of them changes the document's shape. The full Findings Filter was applied inline (more than 5 findings, none critical): 6 validated, 0 withdrawn.

## Coverage Matrix

| Surface | Evidence read | Positive proof | Falsifier attempted | Result |
|---|---|---|---|---|
| Intent / OC01–OC04 | FIS §Overview | Every OC is tagged by ≥1 scenario (OC01: S04, S05; OC02: S01, S02, S04, S06, S08; OC03: S03, S04; OC04: S06, S07) | Looked for an OC with no scenario, or a scenario with no OC | covered |
| Required/Deeper Context anchors | Headings in clarification, 000 spec, CLAUDE.md, ifc-3d-viewer FIS | All slugs resolve (`#board-data-model-requirements-level`, `#42-source-layout`, `#constraints--gotchas`, …) | Heading renamed or punctuation-slug mismatch | covered |
| Code-pattern refs | `ifcLoader.ts`, `elementInfo.ts`, `App.test.tsx#fakeModel`, `ifc-schema.d.ts`, `helpers/properties.d.ts#Properties`, `IfcViewport.tsx` resize | All exist. The resize handler returns early on 0×0 | Hidden viewport collapsing to 0×0 breaks the renderer | covered |
| Sample-data claims (1,060 / 731 / 329, 0 unparsed, every board has an element, CrossSectionArea ≠ WxH) | Python scan of `772_H811_new.ifc` | 422 + 309 + 329; the parse regex handles all names; 0 boards without an `IFCELEMENTASSEMBLY` ancestor; siding 0.0027 vs 0.00319 m² | A board with no assembly, or a name the parse rule rejects | covered |
| S01 name parsing | Scenario vs name rules in Constraints | Piece code / role / profile / grade are consistent for all 7 names | A name with no leading piece code | finding F5 |
| S03/S04 summary + display | TI03, TI04, clarification wireframe | Grouping and totals are concrete | Unit and format of totals | finding F1 |
| S05 default sort | S05, TI04, clarification Core Flow 3 | The reset behaviour is stated | What "default sort" means | finding F2 |
| Tabs a11y | TI05 vs clarification NFR Accessibility | `role="tablist"` is stated | Keyboard switching, `aria-selected`, tabpanel | finding F3 |
| Sorting semantics | TI04 | Both directions, `aria-sort` | Numeric vs lexical order, empty cells | finding F4 |
| S06 unparsed group filter | S06, TI04 | The group exists and is counted | Clicking the Unparsed group | finding F6 |
| S07 error containment / stale results | TI05 | The stale guard and console.error are stated | A lookup for a replaced/disposed model | covered |
| Work Areas → tasks | Work Areas list | domain → TI01, TI03; loader → TI02; board-list → TI04; App → TI05; fixture → TI02 | A Work Area with no task | covered |
| Structural Criteria → Verify | Structural list | lint/type/test/build and domain purity (TI01 Verify), no new deps, sample totals (manual) | A criterion with no proof path | covered |

Guardrails Coverage: 5 checked, 0 findings (domain purity, no `dangerouslySetInnerHTML`, fixture anonymity, no new runtime dependency without a spec, tests next to their subject).

## Findings

### F1 · MEDIUM · Summary total unit left as "one fixed unit"
- Reviewer: doc · Confidence: 75 · Location: TI04 context line · Scope relation: primary
- Finding: TI04 says "totals use one fixed unit" without naming it, while S03 gives mm and the clarification wireframe shows metres with one decimal.
- Threatened invariant: the executor builds what the wireframe shows.
- Evidence: `requirements-clarification.md#ui-wireframes` (`612.4 m`), versus S03 (`3,608 mm`).
- Impact: the executor has to guess, and tests get written against whichever unit they pick.
- Suggested fix: summary totals in metres with one decimal (per the wireframe), and piece lengths in whole mm. S03 stays in mm because it asserts the domain values.
- Verification needed: none.
- Class: code-defect · Routing: Fix (the wireframe already made the decision, so the fix is mechanical)

### F2 · MEDIUM · "Default sort" is referenced but not defined
- Reviewer: doc · Confidence: 100 · Location: S05, TI04 · Scope relation: primary
- Finding: S05 asserts a reset to "the default sort", but no task defines it. The clarification defines it only in Core Flows (profile → grade → length), which is not in Required Context.
- Evidence: `requirements-clarification.md#core-flows` step 3.
- Impact: S05 can't be verified as written.
- Suggested fix: state the default sort (profile, then grade, then length, ascending) in TI04.
- Class: code-defect · Routing: Fix

### F3 · LOW · Tab keyboard/ARIA semantics are thinner than the clarification NFR
- Reviewer: Critic · Confidence: 75 · Location: TI05 · Scope relation: primary
- Finding: TI05 names only `role="tablist"`. The clarification requires `tab`/`tabpanel` semantics and keyboard switching.
- Evidence: `requirements-clarification.md#non-functional-requirements` (Accessibility).
- Suggested fix: TI05 names `role="tab"` with `aria-selected`, a `tabpanel` for each view, and keyboard activation. The Verify uses `getByRole('tab', …)`.
- Class: code-defect · Routing: Fix

### F4 · LOW · Sort order semantics for numeric and empty cells aren't stated
- Reviewer: Critic · Confidence: 75 · Location: TI04 · Scope relation: primary
- Finding: If Length is sorted lexically, `1200` comes before `255`. Where empty cells (unparsed, no length) go is also undefined.
- Suggested fix: TI04 says Length sorts numerically, OID sorts numeric-aware, and empty cells sort last in both directions.
- Class: code-defect · Routing: Fix

### F5 · LOW · The piece-code rule "first token" conflicts with "may be missing"
- Reviewer: Critic · Confidence: 50 · Location: Constraints (Critical bullet) · Scope relation: primary
- Finding: The FIS says the piece code is the first token, but the clarification says the piece code may be missing. A name like `Stud 45x70 C24` would get code `Stud` and an empty role.
- Evidence: all 1,060 sample names start with a code token (verified), so this doesn't affect the sample.
- Suggested fix: record it as an assumption: the first token is always taken as the piece code (true for every sample name), and code-less names are handled if they ever appear in other exports.
- Class: ambiguous-intent (low impact) · Routing: Note

### F6 · LOW · Filtering by the Unparsed group isn't exercised
- Reviewer: Critic · Confidence: 50 · Location: S06 · Scope relation: primary
- Finding: The clarification's cross-consistency note says the Unparsed group exists so it can be filtered to. No scenario clicks it.
- Suggested fix: TI04 Verify also covers clicking the Unparsed group.
- Class: code-defect · Routing: Note (it adds test scope rather than fixing a defect, so the executor can decide)

## Critic Coverage
The Critic ran inline (no sub-agent). What it attacked:
- **Assumptions**: that the sample names always parse; the two-level aggregation; that a hidden viewport survives; the CrossSectionArea shortcut.
- **Unhappy paths**: extraction rejecting; a new file loaded mid-extraction; a disposed model; empty board list; missing Length; empty-cell sorting.
- **Hidden coupling**: `LoadedIfcModel` fakes in App tests; the memoized lookup outliving `dispose()`; the viewport's zero-size resize guard.

## Readiness Assessment
**Needs Minor Updates**

CONVERGED
Auto-Remediation: PENDING

## Recommended Next Action
`andthen:remediate-findings` on this report (defect cluster: F1–F4 Fix-routed). F5 and F6 carry over into the FIS as assumptions.

## Remediation Status

- F1 (MEDIUM, Fix): RESOLVED. TI04 now shows summary totals in metres with one decimal, as in the wireframe. Piece lengths stay in whole mm.
- F2 (MEDIUM, Fix): RESOLVED. TI04 defines the default sort (profile → grade → length, ascending), and its Verify asserts it.
- F3 (LOW, Fix): RESOLVED. TI05 names `role="tab"`, `aria-selected`, `role="tabpanel"` and keyboard activation, and its Verify uses `getByRole('tab')`.
- F4 (LOW, Fix): RESOLVED. TI04 now requires numeric Length sorting, numeric-aware OID sorting and empty cells last, and its Verify checks `255` before `1200`.
- F5 (LOW, Note): SURFACED. Upstream routing was Note. It's recorded as an FIS Constraints assumption.
- F6 (LOW, Note): SURFACED. Upstream routing was Note. It's recorded as an FIS Constraints assumption.

Verification: doc-only hunks, re-read against the clarification wireframe, Core Flows and NFR. `andthen:quick-review` was skipped because the touched scope is 5 small edits to one spec document. No tech-debt entries (nothing deferred).
