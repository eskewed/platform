## Huly Platform research findings

### Executive summary
- **Platform**: Monorepo for a business app framework (CRM, Chat, Project Management, HRM, ATS). Built by/for teams like Huly and TraceX.
- **Stack**: Node 20, Rush (pnpm), TypeScript, Svelte, Webpack, Docker/Compose.
- **Run**:
  - Quick start: `sh ./scripts/fast-start.sh`
  - Install/build: `rush install && rush build` (or `sh ./scripts/presetup-rush.sh`)
  - Docker dev: `cd dev && rush docker:build && rush docker:up` → app at `http://huly.local:8087`
  - Live dev: `cd dev/prod && rush validate && rushx dev-server` → `http://localhost:8080`

### Directory overview (top-level, 3 levels)
```
/  
.github/  
.vscode/  
common/ (shared scripts & config)
  config/
    rush/
  git-hooks/
  scripts/
communication/ (submodule, SDKs & server pieces)
desktop/ (Electron app sources)
desktop-package/ (desktop packaging)
dev/ (local development env)
  prod/ (webpack dev client)
    config/
    public/
    src/
  scripts/
  storybook/
  docker-compose.yaml
  docker-compose.min.yaml
models/ (domain models per feature)
packages/ (core libraries)
  api-client/
  platform/
  ui/
plugins/ (feature plugins: chat, task, contact, etc.)
server/ (core backend services)
server-plugins/ (server feature services)
services/ (pods/microservices)
tests/ (UI & env tests)
  sanity/
    prepare.sh
    create-local.sh
    restore-local.sh
scripts/
  fast-start.sh
  presetup-rush.sh
  build.sh
README.md
rush.json
```

### Key files and how to run
- **README**: Overview, prerequisites, and commands. Highlights:
  - Quick start: `sh ./scripts/fast-start.sh`
  - Install: `npm i -g @microsoft/rush` → `rush install && rush build`
  - Docker dev: `cd dev && rush docker:build && rush docker:up` → `http://huly.local:8087`
  - Live dev: `cd dev/prod && rush validate && rushx dev-server` → `http://localhost:8080`
  - Hosts: add `huly.local` to `/etc/hosts`.
- **Scripts**: `scripts/fast-start.sh`, `scripts/presetup-rush.sh`, `scripts/build.sh`, and versioning `common/scripts/bump.js`.
- **Packages (examples)**:
  - `packages/api-client`: Typed API, depends on `@hcengineering/core`, `@hcengineering/platform`, client libs.
  - `packages/platform`: Core platform; minimal runtime deps.
  - `packages/ui`: Svelte UI library; depends on `svelte`, platform/core/theme.
  - `dev/prod`: Webpack app with many feature plugins for dev/prod.

### Docker development setup (dev/)
- Compose files: `dev/docker-compose.yaml` (full) and `dev/docker-compose.min.yaml` (minimal).
- Core infra: CockroachDB, Redpanda (Kafka), MinIO, Elasticsearch.
- App services: account, workspace, collaborator, front, stats, and numerous server feature services.
- Ports (examples): Cockroach `26257/8089`, Redpanda Console `8000`, MinIO `9000/9001`, Elastic `9200`.
- Testing stacks: `tests/docker-compose.yaml`, `ws-tests/docker-compose.yaml`, `qms-tests/docker-compose.yaml`.

### Rush monorepo details
- Rush: version `5.151.0`; pnpm `9.15.3`; Node `>=20.0.0 <23.0.0`; `projectFolderMaxDepth=3`.
- Projects: **450** total. By group: `plugins=178`, `models=90`, `server-plugins=62`, `packages=33`, `services=29`, `server=26`, `pods=11`, `communication=9`, `dev=4`, `ws-tests=2`, `tests=1`, `qms-tests=1`, `desktop=1`, `desktop-package=1`, `qms-desktop-package=1`, `common=1`.
- Full list saved to: `/workspace/rush-projects.txt`.

### Dependency graph (internal packages)
- Generated DOT: `/workspace/dep-graph.dot`
- Stats: **nodes=450**, **edges=5078**.
- Most depended-on (top 10):
  - `@hcengineering/platform-rig` (438)
  - `@hcengineering/platform` (413)
  - `@hcengineering/core` (360)
  - `@hcengineering/ui` (168)
  - `@hcengineering/contact` (157)
  - `@hcengineering/server-core` (151)
  - `@hcengineering/view` (131)
  - `@hcengineering/model` (101)
  - `@hcengineering/notification` (98)
  - `@hcengineering/activity` (75)
- Render example:
  ```bash
  dot -Tsvg /workspace/dep-graph.dot -o /workspace/dep-graph.svg
  ```

### Generated artifacts
- **Tree (3 levels)**: `/workspace/tree-L3.txt`
- **Rush projects list**: `/workspace/rush-projects.txt`
- **Dependency graph (DOT)**: `/workspace/dep-graph.dot`

### Notes
- UI tests workflow documented under `tests/readme.md`; use `tests/prepare.sh` and `rushx uitest`.
- Many services resolve host `huly.local`; ensure `/etc/hosts` contains it.