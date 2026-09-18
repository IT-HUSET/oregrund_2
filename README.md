# Labbithuset

Browser-based explorer for Vertex BD Pro model exports (`*.ifc` + `components.xml`). Files are processed locally in the browser; nothing is uploaded.

Requires Node 22.12+ (or 20.19+).

```bash
npm install
npm run dev        # http://localhost:5173
npm run test:run   # run tests once
npm run lint
npm run typecheck
npm run build
```

Specs live in [`docs/specs/`](docs/specs/). Start with [000 – Project Foundation](docs/specs/000-project-foundation.md).
