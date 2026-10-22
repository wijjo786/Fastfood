# RestoFlow Current-State Audit

Audit date: 2026-10-15. Scope: read-only source inspection of the imported project. No application code, configuration, dependencies, or data was changed.

## Executive assessment

RestoFlow is a browser-only React/Vite prototype for restaurant POS/ERP workflows. It has many interactive screens and a broad domain model, but it is not an Electron or cloud/server application. The file named `sqliteStorage.ts` is a synchronous in-memory service backed by browser `localStorage`; it does not use SQLite, a database file, transactions, encryption, or a server. All initial business data is seeded from `src/data/mockDatabase.ts`.

The UI is substantially implemented for local, single-browser demonstrations. The security, device, payment, cloud sync, database, and multi-user claims are not supported by an implementation and must not be treated as production-ready.

## Architecture actually present

```
Browser
  index.html -> src/main.tsx -> App.tsx
    ThemeProvider (localStorage theme)
    Navbar (navigation and PIN-based user switching)
    Feature screens (one mounted selected tab)
      sqliteService (module singleton)
        in-memory arrays <-> localStorage keys prefixed restoflow_sqlite_
        initial seed data from mockDatabase.ts
```

The app uses React 19, TypeScript, Vite, Tailwind, Lucide, and Motion. `@google/genai`, Express, and dotenv are declared dependencies but have no source-code consumers. The repository contains no server source, API routes, migrations, ORM/schema, Electron main/preload process, SQLite driver/database, test directory, test script, lockfile, or installed `node_modules` directory.

## Persistence and data model

The storage service holds branches, users, floors/tables, categories/products, ingredients/recipes, orders, a single cash session, vendors/POs/GRNs/payments, customers/zones, expenses/employees/attendance, roles, receipt/printer settings, audit logs, and a sync outbox. Most CRUD paths write JSON to `localStorage`; a page refresh normally retains those local changes in the same browser profile.

The initial records, pre-existing orders, devices, delivery data, staff, and business identifiers are demo data. A factory reset overwrites many local keys with those seeded values. It does not persist the reset printer settings key, so an earlier printer configuration can reappear after a reload.

There is no data isolation between users of the same browser profile, no branch selector (one seeded branch is active), no schema validation or migration/versioning, no transactional write boundary, no concurrent-tab protection, and no backup import/restore path. The JSON backup export omits several stored domains, including cash session, GRNs/vendor payments, expenses/attendance, audit logs, sync outbox, zones, role permissions, and hardware printer settings.

## Capability classification

| Area | Classification | Evidence and limitation |
| --- | --- | --- |
| POS cart, product search, modifiers/variations, totals, discounts, tax/service/delivery charge, cash/card/wallet/split tender recording | Verified local demo flow | `PosTerminal` creates an order through `sqliteService`; amounts are calculated in the client and persisted locally. Card/wallet tender is accepted without processor authorization. Held tickets exist only in component state and disappear on unmount/reload. |
| Order persistence, customer spend/loyalty total, recipe-stock deduction, audit/outbox append | Verified local demo flow | `createOrder` writes the order and mutates local customer, inventory, audit, and outbox arrays. It permits stock to reach zero without availability/negative-stock validation and does not create a real loyalty transaction. |
| Kitchen board/order stage controls | Partially implemented | Board polls the local service every 3 seconds and persists order-level status changes. Per-item “done” checkmarks are React state only; `updateKitchenItemStatus` exists but is never invoked. Custom columns/settings are localStorage-only. |
| Floor/table CRUD, seating, status, order transfer | Partially implemented | Table/floor mutations persist locally. Selecting a table to create an order only switches tabs: `App` discards the table ID, so POS uses its default selection. Transfer moves table pointers but never updates the order's `tableId`/`tableName`; later order completion can clean the old table while leaving the target occupied. Deleting occupied tables is not guarded. |
| Menu/categories | Partially implemented | Product create/edit/delete/availability and category create persist locally. Category update/delete service methods are not reached by the UI. POS reads its menu only at component mount, so menu changes need tab remount rather than an actual refresh mechanism. Images are external URL fields; no media upload/storage exists. |
| Ingredients/recipes | Verified local demo CRUD | Ingredient and recipe CRUD and manual adjustment are reachable; GRN and sales deductions change local stock. Referential validation is absent (ingredients/products may be deleted while recipes/orders still reference them). |
| Suppliers, POs, GRNs, vendor payments | Verified local demo flow | Local vendor CRUD, PO creation, GRN posting, stock increment, balance update, and vendor payment recording are implemented. PO receiving always marks the PO received; partial receipt/cancellation lifecycle is not implemented. |
| Customer CRM and delivery outcomes | Partially implemented | Customer CRUD and recording delivered/returned/damaged/lost outcomes persist locally. Delivery zones are read-only seed data; riders are only a seed/type and are not managed/assigned. “New delivery order” fabricates one hard-coded menu item and uses hard-coded tax/delivery fees rather than branch configuration. No aggregator integration exists. |
| Cash drawer, shift close/reopen, X report | Verified local demo flow | Local session totals, payouts/drops, close variance, and reopen persist. There is one global session rather than branch/cashier session history and no approval enforcement. Print is the browser print dialog only. |
| Expenses, employees, clock in/out | Verified local demo CRUD | Expenses and employee CRUD/attendance persist locally. Employee and login-user records are separate concepts and can drift; roles and PINs are not securely managed. |
| Reports and CSV | Partially implemented | Dashboard derives gross totals and product counts from all local orders and exports CSV/prints. It has no date filters, fiscal rules, reconciliation, refund treatment, expense/P&L calculation, or live subscription. Split payments are excluded from displayed tender totals; cancelled/refunded orders remain in gross sales. |
| Receipt/KOT printing, cash-drawer kick, LAN printer scan/test | Mock/demo only | Code produces toasts, timers, sound synthesis, and `window.print()`. It contains no network socket, USB, Bluetooth, ESC/POS, printer SDK, or drawer interface call. |
| Offline sync/cloud sync | Mock/demo only | A local pending `syncOutbox` is appended to, and `isOnline` can be toggled in the service, but no worker, transport, endpoint, retry, conflict resolution, or UI consumer exists. |
| Authentication, authorization, roles | Unsafe partial UI only | PIN matching happens entirely in the browser against plaintext locally stored values. `App` bypasses login and starts as a hard-coded demo cashier. Navbar PIN entry can switch user, but every navigation tab remains visible and no screen/service mutation enforces `RolePermissions`. The separate `LoginScreen` component is not rendered. |
| Cloud/API/Gemini/Express | Cannot verify; no implementation present | No API call, server entrypoint, route, client, or GenAI invocation appears in source. The README and metadata claim Gemini/server capability, but source provides no implementation. |
| Electron/SQLite architecture | Cannot verify; no implementation present | There is no Electron or SQLite code despite text comments and UI labels claiming both. |

## High-priority risks before any feature work

1. Data and access control are client-side, mutable, and plaintext. Anyone with browser/devtools access can inspect/change localStorage (including PINs and business data). There is no real session, password hashing, authorization boundary, audit integrity, or server-side validation.
2. Financial/payment states have no processor integration, idempotency, approval, refund workflow, or secure card handling. The UI records a card sale immediately.
3. Local storage is not a transactional restaurant ledger. Multi-device operation, recovery, integrity, concurrency, backup completeness, and data retention are unsupported.
4. Printer, drawer, device discovery, and terminal claims are simulations. The code cannot connect to configured addresses.
5. Role and permission models create a false security signal: they are editable/displayed but not consulted at routing or mutation boundaries.
6. Several core cross-screen defects exist: table selection is not handed to POS, transfers do not update orders, active POS master data is stale, and branch settings are state-only because no branch update is stored by the service.

## Safe validation performed

* Complete source inventory and call tracing were performed without running the application or changing data.
* `npm run lint` was attempted. The script invokes `tsc --noEmit`, but it could not run because `tsc` is unavailable (`node_modules` is not installed). Dependencies were not installed, per audit scope.
* No test script exists, so no automated behavioral test could be executed.

## What must be inspected/provided to verify missing claims

* A server/API repository or deployment configuration, data schema/migrations, and database connection configuration.
* Electron main/preload source and a SQLite implementation, if desktop/offline behavior is expected.
* Payment provider integration, tokenization/PCI design, and test credentials in a secure environment.
* Printer/drawer/KDS device bridge or approved hardware SDK code plus a non-production test environment.
* Sync API/worker, identity provider/session architecture, RBAC enforcement location, and observability/audit-retention design.
* Dependency installation and an approved test plan before running build/type checks or interactive workflows.

## Recommended baseline before feature development

Decide whether the product is browser/cloud-first or Electron/offline-first. Then establish a real persistence/API boundary, authenticated server-side RBAC, schema/migrations, financial transaction rules, and automated tests. The existing UI can be retained as a prototype reference, but its business-critical claims should be relabeled or disabled until those foundations are implemented.
