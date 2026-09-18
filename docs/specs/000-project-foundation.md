# 000 – Project Foundation

| | |
|---|---|
| **Status** | Draft |
| **Date** | 2026-09-18 |
| **Scope** | Repository scaffold, tooling, architecture and conventions. No product features. |

## 1. Context

The repository contains two exports of prefab building project **772_H811** (modules 130/131/132, rooms FRD/TVÄTT/BASTU). Both were written by Vertex BD Pro 32.0.8:

- `772_H811_new.ifc`: IFC4 model, about 18 MB. It holds geometry, property sets and quantities.
- `components.xml`: Vertex component/BOM export, about 2 MB. It holds every part with attributes and parent–child structure.

The two files share a key: the IFC product `Tag` equals the XML `OID`. The GUIDs do **not** match. See `CLAUDE.md` for the file structures.

We're building **Labbithuset**, a browser-based React app for exploring these exports: browsing the component hierarchy and BOM, and later linking each part to its IFC element. This spec covers only the foundation that later feature specs (`001-…`, `002-…`) build on.

## 2. Goals

1. A React + TypeScript single-page app at the repository root that builds, lints, type-checks and tests with one command each.
2. A folder layout that keeps **domain logic** (parsing, linking, BOM aggregation) as pure TypeScript, separate from **UI**. Domain code can then be unit-tested without a DOM.
3. A test setup that works from the first commit: Vitest, React Testing Library and jsdom, with one passing smoke test.
4. Documented local development and conventions, in this spec and `CLAUDE.md`, so later work doesn't have to rediscover them.
5. Security assumptions for handling model files that contain customer and personal data.

## 3. Non-goals (for this spec)

- Parsing `components.xml` or IFC. That belongs to spec 001 and later.
- 3D rendering, IFC geometry, `web-ifc` or `three.js`. These will be added by a later spec with its own dependency review.
- A backend, API, database, authentication or multi-user features.
- Routing, a global state library, a UI component library or a design system. Each gets added when a feature needs it.
- Deployment, hosting and CI pipelines. The current directory isn't a git repository.
- Editing or writing back model files. The app is read-only.
- Internationalisation. UI text may be Swedish or English and will be settled later.

## 4. Architecture

### 4.1 Runtime model

- **Static SPA, client-side only.** The user opens model files through a file picker or drag-and-drop, and the browser parses them. Nothing is uploaded, and the app needs no server beyond static file hosting.
- **Parsing runs off the main thread** (in a Web Worker) once real parsers exist. The 18 MB IFC file would block the UI otherwise. Setting this up is deferred to the first parsing spec, but the layout below leaves room for it.

### 4.2 Source layout

```
/
├── docs/specs/            Numbered specs (NNN-kebab-title.md)
├── public/                Static assets served as-is
├── src/
│   ├── main.tsx           Entry point: mounts <App/>
│   ├── App.tsx            Root component / app shell
│   ├── domain/            Pure TS: types, parsers, OID linking, BOM logic. No React, no DOM.
│   ├── features/          One folder per feature (UI + hooks), e.g. features/component-tree/
│   ├── components/        Shared presentational components
│   └── test/setup.ts      Vitest global setup (jest-dom matchers)
├── index.html
├── vite.config.ts         Vite + Vitest config
└── tsconfig*.json         Project references: app (src) and node (config files)
```

Dependency direction: `features → components`, and `features → domain`. `domain` imports nothing from the UI layers. Tests sit next to their subject as `*.test.ts(x)`.

The `domain/`, `features/` and `components/` folders are created by the first spec that puts code in them, not left empty now.

### 4.3 Domain model direction (informative)

Later specs will normalise both sources into one model keyed by **OID**:

```
Component { oid, parentOid?, kind (XML tag), attributes, ifc?: { globalId, entity, name } }
```

Hierarchy comes from XML nesting and `PARENT_OID`. The IFC side attaches through `Tag`. This is recorded here only to explain why `domain/` is kept pure.

## 5. Dependencies

The versions below were current when the project was scaffolded, and `package-lock.json` pins the exact ones.

| Package | Purpose | Kind |
|---|---|---|
| `react`, `react-dom` 19 | UI | runtime |
| `vite` 8, `@vitejs/plugin-react` | Dev server and bundler | dev |
| `typescript` 6 | Type checking (`strict`) | dev |
| `oxlint` | Linting (create-vite's React default) | dev |
| `vitest` | Test runner, shares the Vite config | dev |
| `jsdom` | DOM environment for component tests | dev |
| `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` | Component testing | dev |
| `@types/*` | Type definitions | dev |

The foundation has **no other runtime dependencies**. Every new runtime dependency must be named in a spec with a reason. Expected candidates are `web-ifc`, `three` and a virtualised tree or table library.

Toolchain: **Node ≥ 22.12** (or 20.19+), as Vite 8 requires, and **npm**, which owns the committed lockfile.

## 6. Local development

```bash
npm install          # install dependencies
npm run dev          # dev server at http://localhost:5173
npm run build        # type-check (tsc -b) + production build to dist/
npm run preview      # serve the production build
npm run lint         # oxlint
npm run typecheck    # tsc -b, no emit
npm test             # vitest in watch mode
npm run test:run     # vitest single run (CI-style)
npx vitest run src/App.test.tsx          # one test file
npx vitest run -t "renders the app"      # tests matching a name
```

The sample model files stay at the repository root for manual testing. They are listed in `.gitignore` (see §8).

## 7. Test strategy

| Layer | Tooling | What |
|---|---|---|
| Domain unit tests | Vitest (node env is enough) | Parsers, OID linking and BOM aggregation. This is where most of the tests will be. |
| Component tests | Vitest, jsdom and RTL | Rendering and interaction through accessible queries (`getByRole`, `getByText`). No snapshot tests of large trees. |
| Manual / exploratory | `npm run dev` with the real sample files | Performance with the 18 MB IFC, visual checks |
| End-to-end | Not in foundation | Revisit when there's a multi-step user flow worth automating. |

Rules:

- **Fixtures are small, hand-trimmed excerpts** kept in `src/**/__fixtures__/`, never the full sample files. Tests must run fast and stay within the data policy in §8.
- Fixtures must not contain personal names or other personal data. Replace them with placeholders.
- A spec is done when its acceptance criteria have matching tests, where testable, and `lint`, `typecheck` and `test:run` all pass.

## 8. Security and data assumptions

1. **Model files are confidential customer data.** The IFC header names a person, the file author. Neither sample file may be committed to a shared or public repository. The project's `.gitignore` excludes `*.ifc` and `components.xml`.
2. **Files stay local.** Parsing happens in the browser. The app makes no network requests with file contents, and has no analytics, telemetry or third-party scripts.
3. **File contents are untrusted input.**
   - Values are rendered as text through React's normal escaping. `dangerouslySetInnerHTML` is never used for file-derived data.
   - XML is parsed with the browser's `DOMParser`, which does not resolve external entities or fetch DTDs, so XXE is not a concern. Parse errors (`<parsererror>`) are surfaced, not ignored.
   - Parsers must reject or cap unreasonable inputs, such as absurd file sizes or nesting depth, instead of freezing the tab. Exact limits are set in the parser spec.
4. **No secrets.** The app has no credentials, API keys or environment secrets. Any `VITE_*` variables are public by definition.
5. **Supply chain.** The lockfile is committed, dependencies are added only through specs, and `npm audit` is reviewed when dependencies change. WASM dependencies such as `web-ifc` are served from the app's own origin, not a CDN.
6. **No auth.** Anyone with the files and the static app can use it. That's acceptable for a local, read-only tool, and must be revisited before any hosted deployment.

## 9. Acceptance criteria

- [x] `docs/specs/000-project-foundation.md` exists (this document).
- [x] A Vite React + TypeScript project exists at the repository root, and the existing sample files and `CLAUDE.md` are untouched.
- [x] `npm install` completes on Node 22 and `package-lock.json` is present.
- [x] `npm run build` succeeds and produces `dist/`.
- [x] `npm run lint` and `npm run typecheck` pass with no errors.
- [x] `npm run test:run` runs at least one passing React Testing Library test of `<App/>`.
- [x] `npm run dev` serves the app, and it renders a page titled "Labbithuset".
- [x] `.gitignore` excludes `node_modules`, `dist`, `*.ifc` and `components.xml`.
- [x] The Vite demo content (counter, logos, hero image) is replaced by a minimal Labbithuset placeholder shell.
- [x] `CLAUDE.md` is updated with the commands from §6 and the layout from §4.2.

## 10. Open questions

1. **Product scope.** Is the primary use case BOM and parts browsing, IFC ↔ BOM consistency checking, 3D viewing, or all three? This decides what spec 001 covers.
2. **Deployment.** Will this stay local-only, or be hosted internally? Hosting would reopen §8.6.
3. **Version control.** Should the directory become a git repository, and where will it be hosted?
4. **UI language.** Swedish, English, or both?
