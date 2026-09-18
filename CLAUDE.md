# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Labbithuset** is a client-only React SPA for exploring Vertex BD Pro exports of building project `772_H811`. The foundation spec is in `docs/specs/000-project-foundation.md`. Read it before adding features or dependencies.

- Stack: Vite 8, React 19, TypeScript 6 (strict by default), Oxlint, Vitest with jsdom and React Testing Library. Needs Node 22.12+ (or 20.19+) and npm.
- Specs: `docs/specs/NNN-kebab-title.md`. New features and new runtime dependencies get a spec first.

## Commands

```bash
npm run dev                        # dev server, http://localhost:5173
npm run build                      # tsc -b + vite build → dist/
npm run lint                       # oxlint
npm run typecheck                  # tsc -b
npm run test:run                   # vitest, single run (`npm test` = watch)
npx vitest run src/App.test.tsx    # one file
npx vitest run -t "renders the app" # by test name
```

## Code layout and rules

- `src/domain/`: pure TS (types, parsers, OID linking, BOM logic). No React or DOM imports, so it stays unit-testable in node.
- `src/features/<feature>/`: feature UI and hooks. `src/components/`: shared presentational components.
- Dependency direction: `features → components` and `features → domain`, never the reverse. These folders are created when first needed.
- Tests go next to their subject as `*.test.ts(x)`. Vitest config is in `vite.config.ts`, and the global setup (jest-dom matchers, cleanup) is in `src/test/setup.ts`.
- Test fixtures are small, hand-trimmed excerpts in `__fixtures__/`, with personal data replaced by placeholders. Never use the full sample files.
- Model files are confidential and untrusted:
  - Parse them in the browser only. No network calls with their contents.
  - Never use `dangerouslySetInnerHTML` on file-derived data.
  - Use `DOMParser` for XML and surface `<parsererror>`.
  - `*.ifc` and `components.xml` are gitignored.

## Sample data files (repo root)

The repo root holds two exports of the same project (modules 130/131/132), both from **Vertex BD Pro 32.0.8**:

- `772_H811_new.ifc`: IFC4 STEP file (ReferenceView_V1.2), about 18 MB. It contains geometry and property sets for one storey ("1. Floor").
- `components.xml`: Vertex BD component/BOM export, about 2 MB, UTF-8. It lists every part of the model with its attributes and a parent–child structure.

Both files are large. Don't `Read` them whole. Use `grep`, `head`, or a short Python script (`xml.etree.ElementTree` handles the XML fine).

## Linking the two files

- **IFC `Tag` = XML `OID`.** The last string attribute of an IFC product (for example `IFCBEAM(...,'589830',$)`) is the Vertex object ID, and it matches `OID="589830"` in the XML. Use this key to join the two files.
- **The GUIDs don't match.** XML `GUID` values (UUIDs) do not correspond to IFC `GlobalId`s, even after converting them to IFC's 22-character base64 form.
- IFC `Name` fields combine a Vertex piece code with a description (`'FD5 Opening header beam 45x182 C24'`, `'U3_1 GOLVG-13'`). `IFCELEMENTASSEMBLY` names match the XML `ITEM_ID` of top-level elements (for example `GOLV-131`). A trailing `*` in the IFC name marks a variant.

## components.xml structure

Root is `<COMPONENTS>`. It starts with the header sections `FILE_INFO`, `SYSTEM_INFO` and `PROJECT_INFO`, followed by these sections:

- `ELEMENTS`: prefab elements. `FLOORELEMENT`, `AREAELEMENT` (ceilings) and `WALLELEMENT` nest `PLANE_STRUCTURES` → `FLOOR`/`CEILING`/`LAYERSTRUCTURE` → `STRUCTLAYERS` → `FRAME`/`SHEATHING`/`COVERING`/`SIDING`/`SUBFRAME`/`FOIL`. Under those are the leaf parts: `FRAMEPIECES/FRAMEPIECE`, `SHEETS/SHEET`, `INSULATIONS/INSULATION_MAT`, `SIDINGBOARD` and `MISCCOMPONENT`. Walls also carry `OPENINGS` (`DOOR_INT`, `WINDOW_EXT`), `SIDINGPIECES/OPENINGTRIM` and `TECHNICALPARTS` (`ELECTRICAL`, `MOUNTINGBOX`).
- The top-level sections `WALLS`, `WALLJOINTS` (`CORNER`, `TJOINT`), `PLANE_STRUCTURES`, `MISCINTCOMPONENTS/MODULE`, `MACHININGS`, `FIXTURES` and `OPENINGS`, plus many loose top-level `MISCCOMPONENT` entries.
- Every node has `OID`, `GUID` and `SUB_TYPE` attributes, and child nodes add `PARENT_OID`. The data sits in a child `<ATTRIBUTES>` block. Common keys are `CODE`, `ITEM_ID`/`COMP_ID`, `MODULE_NAME` (130/131/132), `MODULE_FLAT` (room: FRD/TVÄTT/BASTU), `BOM_PHASE`, `USE`, `LENGTH`/`WIDTH`/`HEIGHT`/`THICK`, `MAT_CODE`/`MATCODE`, `VOLUME`, `NET_AREA` and `WEIGHT`.
- Lengths are in mm.

## 772_H811_new.ifc notes

- IFC4. Units: mm, m², m³, kg, radians.
- Spatial tree: `IFCPROJECT '772_H811'` → `IFCSITE` → `IFCBUILDING` → `IFCBUILDINGSTOREY '1. Floor'`.
- Main product types: `IFCPLATE` (sheets), `IFCBEAM`/`IFCCOLUMN` (frame pieces), `IFCCOVERING` (siding), `IFCBUILDINGELEMENTPROXY` (misc and insulation), `IFCBUILDINGELEMENTPART` (wall layers), `IFCJUNCTIONBOX`, `IFCELECTRICAPPLIANCE`, `IFCFURNITURE` and `IFCELEMENTASSEMBLY` (prefab elements, grouped with `IFCRELAGGREGATES`).
- Properties come from the standard `Pset_*Common` sets plus the Vertex sets `Pset_Sheet` and `Pset_Insulation`. Quantities are in `IFCELEMENTQUANTITY`.
- Strings use STEP escapes such as `\X\F6` = `ö`, so the file isn't plain UTF-8. Read it as latin-1 and decode the escapes, or use a STEP-aware library such as `ifcopenshell`.
