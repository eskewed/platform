## Logbook Pilot — Minimal Viable Plan (Draft)

### Goals
- Carve out a focused pilot logbook inside the platform with tenant isolation (workspace), role-based dashboards (Instructor, ClubAdmin, Member), and subscription tiers.
- Reuse existing infra: auth/accounts, REST/WS, storage, print/sign, full-text, billing.

---

## 1) Data model (new domain classes)

- Aircraft
  - `tailNumber` (string, unique per workspace)
  - `type` (string, e.g., A320), `categoryClass` (enum), `complex` (bool), `highPerformance` (bool), `turbine` (bool)
  - `ownerClub` (ref Club/Organization)
- FlightEntry
  - `date` (timestamp UTC)
  - `aircraft` (ref Aircraft)
  - `from`/`to` (string ICAO), `route` (string)
  - `total` (number), `pic` (number), `sic` (number), `dual` (number), `solo` (number)
  - `xCountry` (number), `night` (number), `simInstrument` (number), `actualInstrument` (number)
  - `approaches` (number), `holds` (number)
  - `remarks` (rich-text), `attachments` (blobs)
  - `pilot` (ref Person/Employee), `instructor` (optional ref Person/Employee)
- Endorsement
  - `entry` (ref FlightEntry)
  - `signer` (ref Person/Employee)
  - `signatureId` (string; issued by sign service), `signedAt` (timestamp)

Notes:
- Implement in a new `models/logbook` package later; for MVP, we can store inside a generic space or reuse existing document patterns, then migrate.

---

## 2) Server API (domain requests over REST)

- Use existing route: `POST /api/v1/request/logbook/:workspaceId`
- Payload contract (examples):
  - List entries
    ```json
    { "listEntries": { "pilotId": "...", "from": 1735689600000, "to": 1738281600000, "limit": 100, "offset": 0 } }
    ```
  - Totals/summary
    ```json
    { "getTotals": { "pilotId": "...", "period": "90d" } }
    ```
  - Upsert entry
    ```json
    { "upsertEntry": { "entry": { /* FlightEntry fields */ } } }
    ```
  - Delete entry
    ```json
    { "deleteEntry": { "entryId": "..." } }
    ```
  - Endorsement create (sign request)
    ```json
    { "createEndorsement": { "entryId": "...", "signerId": "..." } }
    ```

Implementation sketch:
- Add a dispatcher that validates role/plan, then uses session `findAllRaw`/`txRaw` to CRUD until the dedicated model lands.
- For `createEndorsement`, call sign service (via existing SIGN_URL) to produce a `signatureId` and store linkage.
- Add feature/plan checks before heavy ops (e.g., cap number of entries/attachments by plan).

(Optional) Dedicated endpoints
- For performance/clarity, we can add dedicated routes under `/api/v1/logbook/*` later; start with `domainRequest` to minimize surface area.

---

## 3) Client SDK (api-client)

- Short term: call through `domainRequest` directly.
  ```ts
  await client.domainRequest('logbook', { getTotals: { pilotId, period: '90d' } })
  ```
- Typed helpers (optional): add `logbook.ts` in `packages/api-client` exporting `getTotals`, `listEntries`, `upsertEntry`, etc.

---

## 4) UI plugin (dashboards)

- Create `plugins/logbook-resources` (later wired to front):
  - Routes
    - `/logbook` — pilot personal view (table + totals, import/export)
    - `/logbook/instructor` — instructor dashboard (students list, progress, endorsements)
    - `/logbook/club` — club admin dashboard (aircraft fleet, members, usage charts)
  - Components
    - EntryTable, EntryEditor (dialog), TotalsPanel, AircraftManager, EndorsementDialog
  - Integrations
    - Attachments via storage client; Print PDFs via `PRINT_URL`; e-sign via `SIGN_URL`.
  - Feature flags
    - Read plan from `/config.json` + account/billing endpoint; hide gated features.

---

## 5) Roles & permissions

- Roles per workspace
  - `ClubAdmin`: manage aircraft, members, global settings; full read/write.
  - `Instructor`: read/write entries they sign; manage endorsements; view assigned pilots.
  - `Member/Pilot`: read/write own entries; limited view of club assets.
- Enforcement
  - Server: gate mutations and aggregates by role; enforce per-resource permissions.
  - Front: route guards; conditional UI.

---

## 6) Subscription tiers & quotas

- Plans (example)
  - Free: personal log, limited entries, no endorsements, limited storage.
  - Pro: everything in Free + endorsements + import/export + increased storage.
  - Club: multi-user dashboards, aircraft fleet, instructor tools, highest quotas.
- Implementation
  - Persist plan on workspace; surface via account/billing service.
  - Server checks: before `upsertEntry`, `createEndorsement`, attachments upload.
  - Front checks: hide features; annotate upgrade CTAs.

---

## 7) Milestones

- M1 (backend skeleton)
  - Add `logbook` domain dispatcher (server) wired through `/api/v1/request/logbook/:workspaceId`.
  - Implement `listEntries`, `getTotals` with placeholder data; wire basic plan/role checks.
- M2 (model & CRUD)
  - Add `models/logbook` package; CRUD `Aircraft`, `FlightEntry`, `Endorsement` via Tx ops; migrations.
  - Replace placeholders with real storage queries.
- M3 (UI dashboards)
  - Pilot table + totals + editor; instructor & club dashboards basic KPIs.
- M4 (sign/print/integrations)
  - E-sign endorsements; PDF export; CSV import; attachments.
- M5 (billing & hardening)
  - Plan gating; quotas; end-to-end tests (`ws-tests/api-tests`, `tests/sanity`).

---

## 8) Validation & tests

- API tests: `ws-tests/api-tests` new suite for logbook domain requests.
- UI tests: Playwright flows for entry CRUD, totals, endorsements.
- Performance: ensure totals queries use indexes; assess pagination.

---

## 9) Risks & notes

- Timezones/UTC: normalize times; display per-user timezone.
- Signature trust: confirm sign service compliance for your jurisdiction.
- Connection limits (managed DBs): keep pools modest; consider a pooler.
- Multi-workspace UX for instructors: provide quick switch and cross-workspace cues.

---

## 10) Config matrix (env)

- `LOGBOOK_API_ENABLED=true` (toggle when wiring server dispatcher)
- `PRINT_URL`, `SIGN_URL` (already present in front env)
- `BILLING_URL` (if using built-in billing service)

This document is the working blueprint. Next step: wire a minimal server dispatcher (behind a feature flag) and a tiny client helper, then stub a basic UI entry list to validate end-to-end flow.