## Backend and API Analysis

### Architecture overview
- **Core services (from `dev/docker-compose.yaml`/`.min.yaml`)**:
  - **CockroachDB (PostgreSQL)**: primary database on port 26257.
  - **MongoDB**: legacy option via `dev/local-mongo/docker-compose.yaml`; deprecated in v7 (still used in tests stack).
  - **Redpanda (Kafka)**: message queue for async operations.
  - **MinIO (S3-compatible)**: object storage for files/blobs.
  - **ElasticSearch**: full-text indexing.
  - **Platform services**:
    - `account` (auth/accounts) on 3000/3003
    - `transactor` (core data/API) on 3332/3334
    - `front` (web UI, config, file proxy) on 8087/8088/8083
    - `collaborator` (Yjs/Hocuspocus doc collaboration) on 3078/3079
    - Others: `fulltext`, `datalake`, `stream`, `print`, `sign`, `rekoni`, `msg2file`, `stats`.

### HTTP API surface (pods/server)
- Implemented in `pods/server/src/server_http.ts` and `pods/server/src/rpc.ts`.
- **General/admin**:
  - GET `/api/v1/version`
  - GET `/api/v1/statistics` (requires Authorization; uses JWT decode)
  - GET `/api/v1/profiling`
  - PUT `/api/v1/manage?operation=`
    - `maintenance`, `wipe-statistics`, `profile-start`, `profile-stop`, `force-maintenance`, `force-close`, `reboot`
    - Admin-only via token claim `extra.admin === 'true'`
- **Blob/files API** (token required; workspace inferred from token):
  - PUT `/api/v1/blob?name=&contentType=&size=` (streamed upload; 100MB limit)
  - GET `/api/v1/blob?name=` (supports Range → 206 responses)
  - HEAD `/api/v1/blob?name=` (metadata)
  - DELETE `/api/v1/blob?name=`
- **Workspace-scoped data API** (token workspace must equal path workspace):
  - GET `/api/v1/ping/:workspaceId`
  - GET | POST `/api/v1/find-all/:workspaceId` (query via `class`, `query`, `options`)
  - POST `/api/v1/tx/:workspaceId` (Tx or DomainEvent)
  - POST `/api/v1/event/:workspaceId` (deprecated; use `/tx`)
  - GET `/api/v1/account/:workspaceId`
  - GET `/api/v1/load-model/:workspaceId` (params: `lastModelTx`, `lastHash`, `full`)
  - GET `/api/v1/search-fulltext/:workspaceId` (params: `query`, `classes`, `spaces`, `limit`)
  - GET `/api/v1/request/:domain/:operation/:workspaceId` (params in `params`)
  - POST `/api/v1/request/:domain/:workspaceId` (domain payload JSON)
  - POST `/api/v1/ensure-person/:workspaceId` (ensure account person + local contact)
  - GET `/api/v1/generate-id/:workspaceId`
- **Rate limiting**: 429 with headers `Retry-After`, `Retry-After-ms`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- **Compression**: Supports `snappy` and `gzip` via `accept-encoding`.

### Front service (`server/front`)
- GET `/config.json` returns runtime config keys consumed by clients (e.g., `ACCOUNTS_URL`, `UPLOAD_URL`, `FILES_URL`, preview rules, branding URL, collaborator URL).
- GET `/api/v1/statistics` for metrics (token required, admin influences output).
- Serves static assets; includes image/video preview pipelines; proxies to storage adapter.

### Collaborator service (`server/collaborator`)
- REST: GET `/api/v1/statistics`.
- Document RPC: POST `/rpc/:id` (Authorization required; methods dispatched via `methods[...]`).
- WebSocket: Hocuspocus/Yjs server on service port; extensions: `AuthenticationExtension`, `StorageExtension`.

### Data model and databases
- **Model**: Delivered as a sequence of Tx in `model.json` (bundled from `models/all`), built at runtime into `Hierarchy`/`ModelDb`.
- **Primary DB**: CockroachDB via `@hcengineering/postgres` adapters (prepared statements optionally enabled via `DB_PREPARE`).
- **Search**: ElasticSearch via `fulltext` service.
- **Blobs**: MinIO/S3 through `@hcengineering/server-storage` (external storage adapter).
- **Queues**: Redpanda (Kafka) via `@hcengineering/kafka`.
- **MongoDB**: Still supported for legacy deployments; explicitly discouraged/deprecated for v7+ (requires `PROCEED_V7_MONGO=true`).

### Extensibility
- **Server pipeline/plugins**: `registerServerPlugins()` and `createServerPipeline(...)` allow attaching adapters, queues, communication API factory, and plugins.
- **Domain requests**: `/api/v1/request/:domain/:workspaceId` exposes domain operations without adding new top-level endpoints.
- **Collaborator RPC**: Add new methods in collaborator RPC map.
- **Front config**: Extend `/config.json` to surface new service URLs or feature flags.


## API Client (packages/api-client)

### Client variants
- **WebSocket client** (`connect(url, { token | email/password, workspace })`): uses `@hcengineering/client` transport; exposes CRUD operations, collections, mixins, markup helpers.
- **REST client** (`connectRest`/`createRestClient`): direct mapping to REST endpoints with built-in 429 backoff.
- **Storage client** (`connectStorage(frontUrl, auth)`): uses `FILES_URL`/`UPLOAD_URL` from front `/config.json`.

### REST client endpoint mapping
- `findAll` → GET `/api/v1/find-all/:workspaceId` (query/options serialized)
- `findOne` → via `findAll` + `limit: 1`
- `tx` → POST `/api/v1/tx/:workspaceId`
- `getAccount` → GET `/api/v1/account/:workspaceId`
- `getModel(full?)` → GET `/api/v1/load-model/:workspaceId?full=true`
- `searchFulltext` → GET `/api/v1/search-fulltext/:workspaceId`
- `domainRequest` → POST `/api/v1/request/:domain/:workspaceId`
- `ensurePerson` → POST `/api/v1/ensure-person/:workspaceId`
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`, `accept-encoding: snappy, gzip`.

### Storage client behavior
- `FILES_URL` example (dev): `http://huly.local:4030/blob/:workspace/:blobId/:filename`
- `UPLOAD_URL` example (dev): `http://huly.local:4030/upload/form-data/:workspace`
- Methods: `stat`, `get`, `put` (multipart form-data), `partial` (Range), `remove`.


## Dev environment and Docker

### Compose variants
- **Full**: `dev/docker-compose.yaml` – includes full set (stream, media, cockroach, redpanda, minio, elastic, account, stats, workspace/transactor, collaborator, front, fulltext, print, sign, msg2file, export, datalake, kvs, gun, etc.).
- **Minimal**: `dev/docker-compose.min.yaml` – reduced set, still Cockroach-based.
- **Legacy Mongo**: `dev/local-mongo/docker-compose.yaml` – MongoDB, Elastic, MinIO, and services configured for Mongo; for local dev only.

### Key service env vars
- **Auth/crypto**: `SERVER_SECRET` (JWT signing), `HULY_TOKEN_SECRET` (KVS).
- **Databases**: `DB_URL` (Cockroach/Mongo), `FULLTEXT_DB_URL` (Elastic), `MONGO_URL` (legacy).
- **Queues**: `QUEUE_CONFIG` (Redpanda/Kafka URLs and credentials).
- **Storage**: `STORAGE_CONFIG` (S3/MinIO endpoints, keys), `MINIO_*` in some pods.
- **Service discovery**: `ACCOUNTS_URL`, `TRANSACTOR_URL`, `FRONT_URL`, `COLLABORATOR_URL`, `FULLTEXT_URL`, `REKONI_URL`, etc.
- **Features/ops**: `COMMUNICATION_API_ENABLED`, `DISABLE_SIGNUP`, `LAST_NAME_FIRST`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`, `MODEL_VERSION`, `MODEL_JSON`, `BRANDING_PATH`.


## Testing and scripts

### UI and API test suites
- **UI sanity (Playwright)**: `tests/sanity` (general), `ws-tests/sanity` (workspace-focused); config in `playwright.config.ts` with retries, trace-on-failure.
- **API tests (Jest)**: `ws-tests/api-tests` use `@hcengineering/api-client` REST and storage clients to verify endpoints.
- **Service-level unit tests**: various pods/services include Jest suites (e.g., mail/gmail).

### Local test environment
- Build images and start stack (dockerized):
  - `rush update && rush build && rush bundle && rush docker:build`
  - `tests/prepare.sh` (or `tests/prepare-pg.sh`, `tests/prepare-tests.sh`)
  - Seeds users and workspaces via `ws-tests/prepare.sh` (`tool.sh create-account`, `create-workspace`, `assign-workspace`).
- Run tests:
  - UI: `cd tests/sanity && rushx uitest` (docker) or `rushx dev-uitest` (dev)
  - API: `cd ws-tests/api-tests && rushx api-test`
- Restore/cleanup:
  - `tests/restore-workspace.sh`, `tests/restore-local.sh`, `tests/shutdown.sh`.

### CI/CD highlights (`.github/workflows/main.yml`)
- Jobs: `build` → `svelte-check` → `formatting` → `test` (Jest with DB/Elastic envs) → `uitest`/`uitest-pg`/`uitest-workspaces` (Playwright) → `docker-build` (multi-arch) → desktop `dist-build`.
- Uses Rush caching and Docker login; gathers profiling and logs from containers as artifacts.


## Dependencies and security considerations

### Key dependencies
- **HTTP servers**: `express` (core, front), `koa` (account-service).
- **Real-time**: `ws`, `@hocuspocus/server` for collaborative editing.
- **Data/infra**: `@hcengineering/postgres`, `@hcengineering/mongo` (legacy), `@hcengineering/server-storage`, Elastic via `fulltext` service.
- **Auth**: `@hcengineering/server-token`, `@hcengineering/account-client`, `@hcengineering/auth-providers` (GitHub/Google/OIDC).
- **SDKs**: `@hcengineering/api-client`, `@hcengineering/client`, `@hcengineering/core`.

### Security & customization points
- Keep secrets out of VCS/logs: `SERVER_SECRET`, storage keys, OAuth provider secrets.
- Token validation ensures workspace scoping; admin-only routes in manage API.
- Rate limiting is enforced and surfaced via headers; REST client honors backoff automatically.
- Front issues cookies with appropriate `secure` flag and domain logic; consider TLS termination in deployment.
- File uploads are capped (100MB) and validated for content type.


## Adding new features (guidance)
- **Backend**:
  - Add domain operations consumed via `/api/v1/request/:domain/:workspaceId` to avoid proliferating routes.
  - Extend `pods/server/src/rpc.ts` for new workspace-scoped REST endpoints when needed.
  - Register server plugins via `registerServerPlugins()` for cross-cutting functionality.
- **Collaborator**:
  - Add RPC methods in `server/collaborator/src/rpc.ts` and related extensions for document workflows.
- **Client SDK**:
  - Expose new operations in `packages/api-client` (REST and WS) to keep parity with server.
- **Front**:
  - Surface new service endpoints/flags through `/config.json` and propagate to clients.
- **Testing**:
  - Add Jest tests in `ws-tests/api-tests` for new REST endpoints.
  - Add Playwright scenarios in `tests/sanity/tests` for UI flows.
  - Use `dev/tool` utilities to seed deterministic data in CI and local runs.


## Quickstart (local dev)
- Fast start scripts:
  - `scripts/presetup-rush.sh` → installs Rush and builds
  - `scripts/build.sh` → Docker build & up; `scripts/fast-start.sh` runs both
- Dev Compose:
  - `docker compose -f dev/docker-compose.min.yaml up -d` (minimal)
  - or `docker compose -f dev/docker-compose.yaml up -d` (full stack)


## Appendix: Notable files
- `pods/server/src/server_http.ts`, `pods/server/src/rpc.ts` — core HTTP endpoints.
- `server/front/src/index.ts` — front `/config.json`, files proxy, statistics.
- `server/collaborator/src/server.ts` — collaborator (Hocuspocus) endpoints and WS.
- `server/account-service/src/index.ts` — account service, providers, Mongo v7 deprecation guard.
- `packages/api-client/src/rest/rest.ts` — REST client mapping with rate-limit handling.
- `packages/api-client/src/storage/client.ts` — storage client using front config.
- `dev/docker-compose.yaml` / `.min.yaml` / `local-mongo/docker-compose.yaml` — dev stacks.
- `tests/` and `ws-tests/` — test stacks, scripts, Playwright and Jest suites.
- `.github/workflows/main.yml` — CI pipeline (build, tests, docker, packaging).