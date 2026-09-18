# Requirements Clarification: IFC 3D Viewer

> **Source Trust**: trusted-local

## Summary

A button on the Labbithuset start page lets the user choose an `.ifc` file from their computer. The page then shows the model in 3D and can be navigated. Clicking an element highlights it and shows its name, type, Tag/OID, properties and quantities. This feature is built for the **18:00 demo on 2026-09-18** described in `docs/Kravbild.docx`. It is the first building block toward that document's must-have "Visual traceability": every purchase line clickable back to its drawing element. The Tag/OID shown here is the key that will later link purchase lines to elements.

## Scope

### In Scope
- One file-picker button ("Choose IFC file") on the start page. It accepts `.ifc` files.
- Parsing and 3D rendering in the browser. The file is never uploaded anywhere.
- Navigating the scene: rotate, zoom, pan and reset the view.
- Clicking an element highlights it and opens an info panel with:
  - name, IFC type, GlobalId and Tag (Vertex OID)
  - property sets (`Pset_*`) and their values
  - quantities (`IFCELEMENTQUANTITY`: Length, Width, GrossVolume, NetVolume, CrossSectionArea, GrossWeight and so on).
- Clicking empty space clears the selection.
- A loading state while the file is parsed, and an error message on failure.
- Choosing a new file replaces the model currently shown.

### Out of Scope
- Drag-and-drop and a preloaded or bundled sample file. The sample file is confidential and must not be bundled with the app.
- Several models in the same scene.
- Show/hide by type, filters, section planes, measuring tools, a model tree or search.
- Loading `components.xml`, or linking to the BOM, article register, cutting list or purchase lines.
- Editing or saving IFC files. The Kravbild PRD also puts this out of scope: the app only reads.
- Guaranteed support for IFC files from tools other than Vertex BD.
- Tablet and mobile, touch navigation, Firefox and Safari.

### MVP Boundary
Chrome or Edge on a desktop computer can load `772_H811_new.ifc` using the button. The model is shown in 3D and can be navigated. Clicking any visible element shows its name, type, Tag/OID, properties and quantities.

### Not Doing (for now)
- Selecting or highlighting an element **from outside** the 3D view, for example from a purchase line or BOM row identified by OID. This is the next traceability step, but it needs data sources that don't exist in the app yet.
- A load-time target and performance optimisation. The user set no explicit requirement for the demo.
- The "any IFC2x3/IFC4" level of support. The demo only uses Vertex BD exports.

## Functional Requirements

### User Stories
- As a **drafter**, I want to open an IFC export and see it in 3D, so that I can check that the model looks right before the purchasing basis is generated.
- As a **drafter or buyer**, I want to click a part and see its dimensions, material code and quantities, so that I can verify where a figure in the purchasing basis comes from.
- As the **demo presenter**, I want to go from an empty page to a navigable model with a few clicks, so that the 18:00 demo has a clear, reliable first step.

### Core Flows
1. The user opens the app. The page shows the heading and a **Choose IFC file** button.
2. The user clicks the button, and the operating system's file dialog opens, filtered to `.ifc`.
3. The user chooses a file. The page shows a loading state that includes the file name.
4. The model is shown in a 3D view that fills the available area. The camera frames the whole model.
5. The user rotates, zooms and pans with the mouse. **Reset view** frames the whole model again.
6. The user clicks an element. It is highlighted and the info panel shows its details.
7. The user clicks another element, and the selection and panel update. Clicking empty space clears the selection and closes or empties the panel.

### Alternate Flows
- **The user cancels the file dialog.** Nothing changes. Any model already shown stays.
- **The user chooses a new file while a model is shown.** The old model and selection are cleared and the new model loads (flow steps 3–7).
- **The user chooses a new file while the previous one is still loading.** Only the file chosen last is shown. The earlier load is discarded.
- **Loading fails.** An error message is shown and the button can be used again (see Error Handling).

### UI Wireframes

```
┌──────────────────────────────────────────────────────────────────────┐
│ Labbithuset                         [ Choose IFC file ]  772_H811.ifc │
├──────────────────────────────────────────────┬───────────────────────┤
│                                              │ FD5 Opening header    │
│                                              │ beam 45x182 C24       │
│             3D view (rotate/zoom/pan)        │ Type: IFCBEAM         │
│                                              │ Tag/OID: 589830       │
│                 ▓▓ selected part             │ GlobalId: 0GO7Par…    │
│                                              │ ─ Pset_BeamCommon ─   │
│                                              │ Reference   …         │
│                                   [Reset]    │ ─ Quantities ─        │
│                                              │ Length   … mm         │
│                                              │ GrossWeight … kg      │
└──────────────────────────────────────────────┴───────────────────────┘
 Before a file is chosen: only the header with the button, plus a short hint in the view area.
 While loading: "Loading 772_H811_new.ifc…" in the view area.
```

## Design Decisions

### Design Space Decomposition

```
IFC 3D Viewer
├── File input:        Button only ← chosen · Button + drag-and-drop · Button + preloaded sample ✗ (pruned: confidential data in the bundle)
├── Interaction:       View + navigate · + click, name/type/OID · + click, properties & quantities ← chosen · + show/hide by type (deferred)
├── Model count:       Replace ← chosen · Several side by side
├── File support:      Vertex BD IFC4 (sample) ← chosen · Any IFC2x3/IFC4
├── Platform:          Desktop Chrome/Edge ← chosen · All desktop browsers · + tablet/mobile
└── Performance:       No explicit requirement ← chosen · < 10 s with progress · < 3 s
```

### Cross-Consistency Notes
- "Properties & quantities" together with "the 18:00 demo today" is the combination with the most schedule risk. If time runs short, the lowest level still acceptable is name, type and Tag/OID, with properties and quantities added afterwards.
- "No explicit performance requirement" still needs a visible loading state. Without one, the page looks frozen while the 18 MB sample loads, which works against the demo purpose.

### Resolved Decisions
| Dimension | Choice | Rationale |
|---|---|---|
| Timeline | The 18:00 demo on 2026-09-18 | The user confirmed it. Scope is kept small and is validated against the sample file. |
| Interaction | Click shows name, type, GlobalId, Tag/OID, properties and quantities | The user wants the purchasing-relevant data (dimensions, volume, weight) visible in the demo. |
| File input | Button only | Matches the request. The file never leaves the browser, which follows spec 000 §8. |
| File support | Vertex BD IFC4 (sample) | Low risk for the demo. Other files are best effort. |
| Platform | Desktop Chrome/Edge | This is the demo environment. |
| Performance | No explicit time requirement | The user's choice. Only a loading state is required. |
| New file | Replaces the model | Simplest option, and enough for the demo. |

### Open Design Questions
- None at requirements level. Choosing the IFC parser and 3D library is an implementation question for the `andthen:spec` skill, and it must follow spec 000 §5 and §8.5 (the dependency is named in a spec, and WASM is served from the app's own origin).

## Edge Cases
| Scenario | Expected Behavior |
|---|---|
| Names containing Swedish characters are stored with STEP escapes (for example `R\X\F6rutlopp`, `B\X\C4RLINA`, 59 occurrences in the sample) | Decoded and shown correctly: "Rörutlopp", "BÄRLINA". |
| A file with an `.ifc` extension that isn't a valid IFC or STEP file | Error message. Any model already shown stays unaffected until a new file loads successfully. |
| An IFC2x3 file or a file from another CAD tool | Best effort. If it can't be parsed, show the same error as for an invalid file. No guarantee of support. |
| An IFC without any visible geometry | A message that the file contains no displayable geometry. |
| An element without property sets or quantities | The panel shows "No properties" or "No quantities" for that section instead of hiding it. |
| Clicking a small or hidden part, for example a mounting box inside a wall | The element nearest the camera under the cursor is selected. No requirement to reach hidden parts in this version. |
| Elements without their own geometry (for example `IFCELEMENTASSEMBLY`, which groups parts) | Can't be clicked. Clicking selects the part itself, not its assembly. |
| The same file is chosen again | It loads again. The selection is cleared. |
| A very large file (hundreds of MB) | No limit is set. If the browser runs out of memory, show an error message instead of letting the tab crash silently where possible. |
| The browser lacks WebGL support | A message that 3D rendering is not supported in this browser. |

## Error Handling
| Error | User Message | Recovery |
|---|---|---|
| The file can't be parsed as IFC | "The file could not be read as an IFC model." | Choose a new file. The previous model is kept. |
| The file has no displayable geometry | "The file contains no 3D geometry to display." | Choose a new file. |
| Out of memory, or rendering fails | "The model could not be displayed (the file may be too large)." | Reload the page and choose a smaller file. |
| WebGL is unavailable | "Your browser does not support 3D rendering. Use Chrome or Edge." | Switch browsers. |
| Unexpected error while loading | "Something went wrong while loading the model." with the technical detail in the console | Choose the file again. |

## Non-Functional Requirements
- **Performance**: No time requirement. The page must show a loading state during parsing, and the UI should not look frozen. Navigation should stay usable with the sample model (about 2,800 displayable elements) on the demo laptop.
- **Security**:
  - The file is read locally and never sent over the network (spec 000 §8.2).
  - All file-derived text (names, property values) is rendered as text and never as HTML (spec 000 §8.3).
  - No model file is bundled with the app, and no model file is used whole as a test fixture (spec 000 §7–8).
  - IFC parser code or WASM is served from the app's own origin, not a CDN (spec 000 §8.5).
- **Accessibility**:
  - The file button is a real, keyboard-accessible button with a visible label.
  - The info panel is regular text that screen readers can read.
  - 3D navigation itself does not need to be keyboard-accessible in this version.

## Success Criteria
- [ ] The start page shows a "Choose IFC file" button, and the file dialog is filtered to `.ifc`.
- [ ] `772_H811_new.ifc` loads in Chrome and in Edge on the demo laptop, and the whole model is framed in the view.
- [ ] The model can be rotated, zoomed and panned with the mouse, and "Reset view" frames the whole model again.
- [ ] Clicking an element highlights it and shows its name, IFC type, GlobalId, Tag/OID, property sets and quantities.
- [ ] Spot check: clicking "FD5 Opening header beam 45x182 C24" shows type IFCBEAM and Tag 589830.
- [ ] Swedish characters in names are shown correctly (for example "16mm Rörutlopp").
- [ ] Clicking empty space clears the selection.
- [ ] Choosing a new file replaces the model and clears the selection.
- [ ] Choosing a non-IFC file shows an error message, and the page stays usable.
- [ ] A loading state is visible between choosing the file and the model appearing.
- [ ] The DevTools network tab shows no request containing the file's contents.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:run` and `npm run build` pass. The domain logic (for example extracting properties and quantities, and decoding names) has unit tests on small, anonymised fixtures.

## Dependencies
| Dependency | Purpose | Risk |
|---|---|---|
| IFC parser (browser, most likely WASM) | Reading geometry, properties and quantities from IFC4 | New runtime dependency, so spec 000 §5 requires it to be named in the spec. WASM must be served locally and configured correctly in Vite. |
| 3D rendering library (WebGL) | Drawing the scene, navigation and picking elements | Bundle size, and integration with the IFC parser. |
| `772_H811_new.ifc` (local only) | Manual test and demo file | Confidential and gitignored. It must exist on the demo laptop. |
| Spec 000 (project foundation) | Architecture, test strategy and security rules | §1 Context and §10.1 are out of date after `Kravbild.docx` (see Open Questions). |

## Open Questions
- Should quantity values be shown in the IFC file's own units (mm, m², m³, kg) exactly as stored, or rounded (for example to whole mm and to 2 decimals for m³)?
- Should `docs/specs/000-project-foundation.md` §1 Context and §10.1 be updated to describe the product goals from `docs/Kravbild.docx`: interpreting drawings, BOM and article matching, cutting optimisation and a purchasing basis?
- Area to revisit: selection from outside the 3D view (purchase line or BOM row → highlighted element) – becomes precise once the BOM or purchase-line view has a spec that settles which list the user clicks in.

## Decisions Log
| Decision | Rationale | Date |
|---|---|---|
| Built for the 18:00 demo in Kravbild.docx | The user confirmed it | 2026-09-18 |
| Clicking an element shows name, type, GlobalId, Tag/OID, properties and quantities | The user chose the richer level of info, to support the purchasing story | 2026-09-18 |
| File input is a button only, with no bundled sample | The user's choice. It also keeps the confidential sample out of the bundle. | 2026-09-18 |
| Only Vertex BD IFC4 is guaranteed; other files are best effort | The user's choice, to keep demo risk low | 2026-09-18 |
| Desktop Chrome/Edge only | The user's choice | 2026-09-18 |
| No load-time requirement, but a loading state is required | The user set no time target. The loading state is derived so the page doesn't look frozen during the demo. | 2026-09-18 |
| A new file replaces the current model | The user's choice | 2026-09-18 |
| Tag/OID is always shown | It's the key to components.xml and future purchase lines, and the basis for the traceability must-have | 2026-09-18 |
