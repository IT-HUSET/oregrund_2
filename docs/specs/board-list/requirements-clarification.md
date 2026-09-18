# Requirements Clarification: Board List

> **Source Trust**: trusted-local

## Summary

After an `.ifc` file has been loaded, a new **Boards** tab lists every board in the model. A board is a piece of linear sawn or glued timber, bought in standard lengths. The tab shows a summary per cross-section and grade, and a sortable table with one row per piece. Behind the view is a pure-TypeScript **board data model**. It is the input for a planned cutting optimizer, which will compare required lengths with standard stock lengths to reduce waste (see `base_case.txt`). This feature delivers only the data model and the list. It does not include the optimizer.

## Scope

### In Scope
- A pure domain data type (`src/domain/`) that represents one board, plus a function that builds the list of boards from a loaded IFC model.
- Board sources: `IFCBEAM` and `IFCCOLUMN` (framing) and `IFCCOVERING` (siding). In the sample file that's 422 + 309 + 329 = **1,060 boards**.
- Parsing the product `Name` into piece code, role/description, profile (nominal thickness × width plus an optional suffix such as `_S` or `_sta_Z`), and grade (`C14`, `C16`, `C24`, `GL`). Decimal dimensions are supported, for example `PAR 9.775682x95 C14`.
- Resolving each board's prefab element, the `IFCELEMENTASSEMBLY` reached through `IFCRELAGGREGATES` (board → layer → element, for example `GOLV-131*`).
- A tab bar that appears once a model has loaded, with the tabs **3D model** (the existing view, which is the default) and **Boards**.
- The Boards tab contains:
  - A **summary** with one row per group (profile including suffix + grade), showing count and total length, plus a grand total.
  - A **piece table** with one row per board: OID (Tag), role/description, prefab element, profile, grade and length. It can be sorted by any column.
  - Clicking a summary group filters the piece table to that group, and the filter can be cleared.
  - A visible count of boards whose name couldn't be fully parsed. Those boards are still listed.

### Out of Scope
- Sheet material (`IFCPLATE`: plywood, gypsum, wind board) and insulation. Sheets are 2D stock and need a different optimization model.
- The cutting optimizer, standard stock lengths, the price catalogue and cost or waste calculations.
- Loading or joining `components.xml`.
- Clicking a board row to select or highlight the element in 3D.
- Free-text search, export (CSV/Excel) and printing.
- Editing board data.

### MVP Boundary
Load `772_H811_new.ifc`, switch to **Boards**, and see all 1,060 boards. The summary is grouped by profile + grade with counts and total lengths. The piece table is sortable and can be filtered by clicking a group. The domain function that produces the boards is unit-tested and has no React or DOM imports.

### Not Doing (for now)
- **Row → 3D traceability**: this is the next step toward the Kravbild "visual traceability" goal. It's kept out so this feature stays a pure data-and-list delivery. The data model stores the element identity so the step can be added later without reworking it.
- **Cutting optimization against standard lengths**: explicitly planned as a later feature. This feature only prepares the input.
- **Glulam special handling**: glulam pieces are included with grade `GL` and are not treated differently. Whether the optimizer skips them, since glulam is usually ordered to length, is decided in the optimizer spec.

## Functional Requirements

### User Stories
- As a **buyer**, I want to see every board in the model grouped by cross-section and grade with counts and total length, so that I know what timber the house needs.
- As a **buyer or drafter**, I want to see each individual board with its length and prefab element, so that I can check where a summary figure comes from.
- As a **developer of the future optimizer**, I want a typed, tested list of boards (identity, profile, grade, required length), so that I can build cutting optimization on top of it without re-parsing IFC.

### Core Flows
1. The user loads an `.ifc` file through the existing **Choose IFC file** flow.
2. Once the model has loaded, a tab bar appears with **3D model** (selected) and **Boards**.
3. The user selects **Boards**. The summary and piece table are shown, and the table is sorted by profile, then grade, then length.
4. The user clicks a column header. The table sorts by that column, and clicking again reverses the order.
5. The user clicks a summary group, for example `45x220 C24`. The table shows only that group's boards, and the active filter is visible.
6. The user clears the filter, and all boards are shown again.
7. The user switches back to **3D model**. The 3D view, camera and selection are as they were left.

### Alternate Flows
- **A new file is loaded while Boards is open.** The board list is replaced by the new model's boards, and the sort and filter are reset.
- **The model contains no boards.** The Boards tab still appears and shows an empty-state message ("No boards found in this model.").
- **Some names can't be parsed.** Those boards appear with empty profile/grade cells and an "unparsed" marker. The summary shows "N boards could not be fully read" and groups them under an "Unparsed" group.

### UI Wireframes

```
┌ Labbithuset ─────────────────────────────── 772_H811_new.ifc [Choose IFC file] ┐
│ [ 3D model ] [ Boards ]                                                        │
├────────────────────────────────────────────────────────────────────────────────┤
│ Summary                                         1,060 boards · 2,345.6 m total │
│  Profile        Grade   Count   Total length                                   │
│  22x145_sta_Z   C16       329      612.4 m                                     │
│  45x220         C24       121      210.8 m   ◀ selected (filter active)        │
│  45x220_S       C24         4        9.1 m                                     │
│  90x220         GL          2        …                                         │
│  …                                                                             │
├────────────────────────────────────────────────────────────────────────────────┤
│ Pieces — filtered: 45x220 C24  [Clear filter]                                  │
│  OID ▲    Role / description   Element     Profile   Grade   Length (mm)       │
│  589830   Stud                 GOLV-131*   45x220    C24     2 408             │
│  …                                                                             │
└────────────────────────────────────────────────────────────────────────────────┘
```
(The figures are illustrative.)

## Design Decisions

### Design Space Decomposition
```
Board List
├── Board scope:    framing + siding ← chosen · framing only · + sheets ✗ (2D, different problem)
├── List shape:     per piece + grouped summary ← chosen · flat per piece · grouped only
├── Group key:      profile incl. suffix + grade ← chosen · nominal WxH + grade
├── Unparsed names: include and flag ← chosen · exclude silently · exclude but count
├── Glulam:         include as grade GL ← chosen · exclude
├── Filtering:      click a summary group ← chosen · sort only · group + text search
└── Row → 3D:       none (deferred) ← chosen · switch tab + highlight
```

### Cross-Consistency Notes
- "Include and flag" + "click a group to filter": unparsed boards need their own summary group ("Unparsed") so they can be filtered to, and the group totals still add up to the grand total.
- "Separate groups by suffix" + the future optimizer: the nominal thickness and width are stored separately from the suffix, so the optimizer can still match on nominal dimensions if the suffix turns out not to matter for purchasing.

### Resolved Decisions
| Dimension | Choice | Rationale |
|---|---|---|
| Board scope | `IFCBEAM`, `IFCCOLUMN`, `IFCCOVERING` | All are 1D stock bought in standard lengths. The framing set (731) matches `base_case.txt`. |
| List shape | Grouped summary + per-piece table | The summary serves purchasing, and the pieces show where the numbers come from. |
| Group key | Profile including suffix + grade | A suffix (`_S`, `_sta_Z`) probably means a different product, so merging could buy the wrong stock. |
| Unparsed names | Include, flag and count | Nothing is silently dropped, and the optimizer decides what to do with them. |
| Glulam | Included, grade `GL` | It's linear timber. Special handling is left to the optimizer spec. |
| Row fields | OID, role/description, prefab element, profile, grade, length | OID is the join key to XML and purchase lines, and element tells you the module. |
| Filtering | Click a summary group | Cheap to build and fits the purchasing workflow. |
| Row → 3D | Not in this feature | Keeps the scope to the data model and list. |
| Default tab | 3D model | The existing behaviour is unchanged. Boards is one click away. |
| UI language | English | Matches the existing UI. |

### Open Design Questions
- None at requirements level.

## Board Data Model (requirements-level)

Each board must carry at least the following. The exact TypeScript shape is decided in the spec.

| Field | Source | Notes |
|---|---|---|
| OID | IFC `Tag` | Join key to `components.xml` and future purchase lines. |
| IFC identity | express ID, `GlobalId`, entity type | Keeps a later row → 3D link possible. |
| Kind | entity type | `framing` (`IFCBEAM`/`IFCCOLUMN`) or `siding` (`IFCCOVERING`). |
| Full name | IFC `Name` | STEP escapes decoded (existing `decodeIfcString`). |
| Piece code | leading token of `Name` | For example `FD5` or `75`. It may be missing. |
| Role / description | `Name` minus piece code, profile and grade | For example `Opening header beam`, `Stud`, `Siding board`. |
| Profile | `Name` | Nominal thickness and width in mm (decimals allowed), optional suffix, and a display label such as `45x220_S`. |
| Grade | `Name` | For example `C14`, `C16`, `C24`, `GL`. |
| Length (mm) | quantity `Length` | The raw value is kept. It is displayed rounded to whole mm (254.99999… → 255). This is the required cut length for the optimizer. |
| Prefab element | `IFCELEMENTASSEMBLY` name via `IFCRELAGGREGATES` | For example `GOLV-131*`. The trailing `*` is kept as shown in IFC. |
| Parse status | – | Marks boards whose profile or grade could not be read. |

A grouping function (also pure domain code) produces the summary rows: group key, count, and total length.

## Edge Cases
| Scenario | Expected Behavior |
|---|---|
| Name has no recognisable `WxH Grade` part | The board is listed with an unparsed marker and empty profile/grade, counted in the "Unparsed" group and the warning count. |
| Name has a decimal dimension (`9.775682x95`) | Parsed as a number. Displayed as in the name. |
| Name has a suffix (`45x220_S`, `22x145_sta_Z`) | The suffix is kept in the profile and forms its own group. |
| Name ends with a variant `*` | The `*` is ignored for parsing and kept in the full name. |
| Board has no `Length` quantity | Length is empty and the board is flagged. It is excluded from the length total but included in the count. |
| Board has no parent element assembly | The element cell is empty. The board is still listed. |
| Same OID appears more than once | Every IFC product is listed. The data isn't deduplicated. |
| Model has zero boards | Empty-state message in the Boards tab. |
| New file loaded | The board list, sort and filter are reset to the new model. |

## Error Handling
| Error | User Message | Recovery |
|---|---|---|
| IFC file fails to load | Existing load errors (no tab bar is shown) | Choose another file. |
| Board extraction throws, but the model loaded | "The board list could not be built from this model." shown in the Boards tab, and details go to the console | The 3D tab keeps working. Choose another file. |

## Non-Functional Requirements
- **Performance**: With the sample file, opening the Boards tab and sorting or filtering feels instant. About 1,000 rows are rendered without virtualisation, and no new runtime dependency is added. Extraction runs once per loaded model, not on every tab switch.
- **Security**: File-derived text is rendered only through normal React escaping (no `dangerouslySetInnerHTML`). There are no network calls, and parsing stays in the browser (foundation spec §8).
- **Accessibility**: Tabs use proper tab semantics (`role="tablist"`/`tab`/`tabpanel`, keyboard switchable). The tables are real `<table>` elements with header cells, the sort state is exposed (`aria-sort`), and summary groups can be activated with the keyboard.
- **Architecture**: Board parsing and grouping live in `src/domain/` (no React or DOM). The tab and table UI live in `src/features/`. Unit tests use small hand-trimmed fixtures, never the full sample file.

## Success Criteria
- [ ] Loading `772_H811_new.ifc` yields **1,060 boards**: 731 framing (422 `IFCBEAM` + 309 `IFCCOLUMN`) and 329 siding.
- [ ] With the sample file, **0 boards are unparsed**. That covers glulam (`GL`), suffixes (`_S`, `_sta_Z`) and decimal dimensions (`PAR 9.775682x95 C14`).
- [ ] The name parser is unit-tested on at least: `FD5 Opening header beam 45x182 C24`, `75 Stud 45x70 C24`, `36 Siding board 22x145_sta_Z C16`, `100 Sill plate 45x220_S C24`, `155 Stud GL 90x220 GL`, `185  GL 42x270 GL`, `92  PAR 9.762523x95 C14`, a name ending in `*`, and an unparseable name.
- [ ] Each board's prefab element is resolved (for example a board in layer `STOMME-182` → `GOLV-131*`), and this is covered by a test.
- [ ] Grouping is unit-tested: the counts and total lengths per profile + grade add up to the grand totals.
- [ ] The tab bar appears only after a successful load. **3D model** is selected by default, and switching tabs keeps the 3D camera and selection.
- [ ] The Boards tab shows the summary and piece table with the columns OID, role/description, prefab element, profile, grade and length. Every column sorts both ways.
- [ ] Clicking a summary group filters the table, and the filter can be cleared. This is covered by a component test.
- [ ] Unparsed boards are listed, marked and counted (component test with a fixture containing one).
- [ ] The domain code has no React or DOM imports. `npm run lint`, `npm run typecheck` and `npm run test:run` pass.

## Dependencies
| Dependency | Purpose | Risk |
|---|---|---|
| Existing IFC loader (`web-ifc`, `ifcLoader.ts`) | Access to products, quantities, `IFCRELAGGREGATES` | Low. Extraction reuses the loaded model, and the loader may need a new method that exposes board data. |
| `decodeIfcString` | Decoding STEP-escaped names | Low. It already exists and is tested. |
| Vertex BD naming convention `<code> <description> <T>x<W>[suffix] <grade>[*]` | The only source of profile and grade | Medium. Other Vertex versions or templates may name pieces differently. This is mitigated by "include and flag". |

## Open Questions
- What does the `_S` suffix on `45x220_S` mean (planed, special stock)? This decides whether the optimizer may match it against plain `45x220` stock. It's resolved in the optimizer spec, or by checking `components.xml` / the Vertex material library.
- Area to revisit: the unit for summary totals (m vs mm) and number formatting (Swedish `2 408` vs `2,408`) – sharpened once the UI language question in foundation spec §10.4 is settled.

## Decisions Log
| Decision | Rationale | Date |
|---|---|---|
| Boards = `IFCBEAM` + `IFCCOLUMN` + `IFCCOVERING` | Linear stock bought in standard lengths. Sheets are 2D. | 2026-09-18 |
| Per-piece table + grouped summary | Purchasing overview plus where the numbers come from | 2026-09-18 |
| No row → 3D interaction in this feature | Keep the scope to the data model and list. Traceability comes later. | 2026-09-18 |
| Unparsed names: include and flag | Never silently drop parts | 2026-09-18 |
| Glulam included as grade `GL` | It's linear timber, and the optimizer decides how to handle it | 2026-09-18 |
| Profile suffixes form separate groups | A suffix probably means a different product | 2026-09-18 |
| Row fields: OID, role/description, prefab element (+ profile, grade, length) | OID is the join key, and element tells you the module | 2026-09-18 |
| Filtering: click a summary group | Cheap to build and fits purchasing | 2026-09-18 |
| Default tab 3D, UI in English | Existing behaviour and language unchanged | 2026-09-18 |
