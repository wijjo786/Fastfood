# RestoFlow Desktop - Current Progress

Last updated: 21 October 2026

## Purpose and baseline

RestoFlow is an offline-first, single-store Windows restaurant desktop system.

- Desktop shell: Electron.
- User interface: React and TypeScript.
- Local database: SQLite through `better-sqlite3`.
- Internet: not required for normal operations.
- Currency: PKR is the configured default, but currency symbol, tax, service charge, receipt, printer, payment, role, and backup settings are editable application data.
- Scope: one local store; no cloud sync or multi-store sharing is currently implemented.

The authoritative desktop process is `electron/main.cjs`. The renderer uses the narrow IPC API exposed by `electron/preload.cjs`; it does not directly open the SQLite database.

## Current implementation status

### Platform, data, security, and recovery

| Area | Implemented behavior | Verification status |
| --- | --- | --- |
| Local data | Electron owns the SQLite schema, normalized operational tables, and a compatibility key/value store. First-run seed data is permitted only when the store is empty. | Static checks and prior isolated runtime workflows passed. |
| Security | Main-process sessions, salted PIN hashes, server-side permission checks, role permissions, account lifecycle, and session invalidation after reset/restore. Shared staff PINs are supported only when the staff profile is selected first. | Prior isolated runtime checks passed; live acceptance test remains required. |
| Backups | Independent C: and D: timestamped destinations, per-destination retention, integrity verification, manual export, inspect-before-restore, pre-restore backup, staged restore, and rollback protection. | Backup creation/integrity validation was tested in isolation. User-dialog export/restore must be tested manually. |
| Operational reset | Super-admin-only operational data reset creates a safety backup first, preserves master data/settings, and invalidates sessions. | Static and prior isolated workflow checks passed. |
| User-facing errors | Central user-feedback dialog translates Electron, IPC, SQLite, connection, and JavaScript implementation errors into clear messages. Browser alerts were removed from operational flows; printer/backup failures use the same message path. Inline feedback remains only for immediate form guidance. | TypeScript checks pass. The Electron bridge wrapper was corrected after a startup error; restart and live smoke test are still required. |

### Functional modules

| Module | Implemented functionality | Notes / limits |
| --- | --- | --- |
| POS terminal | Dine-in, takeaway, and delivery tickets; variations/modifiers; kitchen notes; optional customer details; customer lookup; table selection; discounts/refunds with permissions; configured currency/tax/service charges; split payments; payment references; held/parked unpaid tickets; receipt/KOT flow. | Full live acceptance testing remains required. |
| Customer flow | Existing CRM customer lookup can populate a ticket. Customer/contact/address information is optional for all order types. Anonymous tickets do not create placeholder CRM records. | Phone and supplied customer data are validated when used. |
| Payments and cash | Cash, bank transfer, Easypaisa, JazzCash, and custom payment methods; configurable method availability/reference requirements; split payment; cash-session tracking and cash movements. | No payment gateway processing; methods are locally recorded settlement methods. |
| Order history and loss | Searchable all-channel order history, ticket detail, receipt reprint, cancellation/return/refund. Dine-in/takeaway reversal distinguishes pre-preparation stock restoration from prepared-food loss/customer return. | Food-loss workflow should be accepted against real restaurant policy. |
| Kitchen Display System | Station routing, ticket status/check-off, controlled order lifecycle transitions, KOT printing support. | Physical printer testing is pending. |
| Menu and dishes | Categories, products/dishes, price, SKU/barcode, variations, modifiers, availability, local image upload, and permissions. | Legacy external image URLs are retained only for compatibility; replace them with local uploads. |
| Floors and tables | Floor/section management, table management, occupancy/seating, transfers, and table-related order state. | Requires operator acceptance testing. |
| Inventory and recipes | Ingredients, recipe/BOM management, automatic POS stock depletion, manual count adjustment, stock movements, low-stock filter/alert, wastage/spoilage/damage variances, and moving-average unit cost. | Actual counts and recipes must be configured by the restaurant. |
| Quick restock | Per-ingredient quick receipt without a PO. Stores quantity, unit cost, total, supplier/source, payment method/reference, timestamp, user, stock movement, audit, sync event, and numbered direct-stock-purchase record. History is visible in Stock Master and totalled in Analytics/CSV. Cash-paid receipts require POS permission plus an open, sufficiently funded drawer and create a drawer payout. | Deliberately does not create a supplier payable or formal PO; use procurement for credit purchases/formal supplier balances. |
| Suppliers and purchasing | Vendors, purchase orders, goods received notes, stock receipts, outstanding balances, supplier payments, and related inventory movements. | Prior isolated procurement reconciliation passed; full screen-level acceptance testing remains pending. |
| CRM and delivery | Customer records, loyalty fields, delivery zones/orders, rider assignment, status workflow, and configurable delivery methods. Built-ins are Own Fleet and Foodpanda; custom methods can be added, enabled/disabled, or removed. | No external Foodpanda or delivery-platform integration. |
| Staff and payroll | Employee records, attendance, payroll advances, payroll runs, expenses, and permissions. | Requires payroll-policy and accounting acceptance testing. |
| Cash drawer | Open/close sessions, expected cash, sale settlement, payouts/drops, and audit trail. | Hardware drawer trigger requires a supported raw ESC/POS printer connection. |
| Analytics and reports | Permission-scoped report summaries, dates, top products, order/payment/channel totals, operating expenses, direct stock purchases, and CSV export. | Not a full statutory accounting or tax filing system. |
| Printer settings | 58 mm/80 mm receipt and kitchen layouts; raw TCP ESC/POS; Windows printer listing/spooler selection; printer tests; receipt/KOT printing; drawer pulse through supported raw printer path. | Bluetooth is not implemented. Windows spooler cannot guarantee cutter/buzzer/drawer commands. |

## Important workflow behavior

- Store currency is rendered from settings instead of a hard-coded dollar symbol in active business screens.
- Roles control visible workspaces and server-side mutations. A user cannot gain access merely by manually navigating to a hidden tab.
- Custom role titles are normalized into safe internal codes. Custom roles can share a display title with a system role but retain a distinct internal code.
- Staff accounts, not payroll employee records, control terminal login. Deleting a Settings account blocks its login while preserving historical employee/payroll data.
- PINs may be shared between accounts. The operator must choose their staff profile before entering the PIN so authentication remains unambiguous.
- Delivery riders are active staff with the Delivery Rider role; riders can be added from POS delivery configuration by authorized users.
- Prepared cancellations preserve consumed recipe stock and record food loss. Pre-preparation cancellations restore stock.

## Current frontend direction

- The approved forest-green top-bar direction is now a structural redesign, not only a palette change. The application uses a single compact horizontal navigation bar with icon-and-label module controls, store/time status, fullscreen control, and staff switching. It does not introduce a sidebar.
- POS now has separate rounded catalog and live-ticket workspaces, compact order-type/category controls, and a denser product grid. Floor & Tables now uses a contained header, floor tab strip, and map/inspector workspace.
- POS now includes the reference-style Point of Sale heading and replaces missing-image gray tiles with a deliberate green/porcelain category fallback. Actual dish photography remains data-dependent: only images uploaded locally through Menu management can appear in an offline desktop build.
- POS product customization is now a direct forest/porcelain modal redesign with explicit primary, secondary, selected, hover, disabled, quantity, and add-on states. Shared legacy secondary buttons receive a high-contrast white resting state and green hover treatment across nested pages and dialogs.
- A shared Forest light-workspace layer now remaps legacy Slate backgrounds, borders, text hierarchy, table headers/rows, and secondary-button hover states throughout the application. This is applied to all modules, nested pages, and popups under the production theme.
- Direct dialog-by-dialog redesign is in progress. Completed: POS product customization, Order History workspace/detail actions, Floor Table Inspector actions, Menu product/category dialogs, Inventory ingredient/recipe/quick-restock/stock-adjustment dialogs, CRM/Delivery action controls, Procurement supplier/PO/settlement/GRN controls, Staff payroll/advance/expense/employee dialogs, Cash Drawer movement/shift controls and dialogs, Reports filters/KPIs/export/chart containers, and Settings navigation/actions/security dialogs. Remaining work is a live visual sweep of less-frequent nested dialogs and any refinement identified during acceptance review.
- POS discount controls and the split-payment checkout dialog now use explicit forest selected states, visible porcelain secondary states, and clear disabled states. The shared forest theme also prevents disabled buttons from becoming nearly invisible and increases the contrast of legacy muted controls across workspaces.
- Procurement toolbar actions and tabs now have direct forest styling. A high-specificity shared rule keeps all remaining enabled legacy amber primary buttons solid forest-green with white text, preventing component-level styles from washing them out.
- Appearance is now a functional Settings tab. It provides five persisted built-in workspace presets plus a validated custom color editor (canvas, surfaces, primary/hover, text, muted text, and borders), live preview, reset, and local device persistence. The previous forced-Forest lock was removed, so Navbar palette choices now apply rather than immediately reverting.
- The Appearance editor now includes a POS-like live workspace preview, automatic contrast feedback, a balanced-color generator, and automatic dark-mode detection for custom dark palettes. Presets were renamed and tuned for practical restaurant contexts: Resto Forest, Midnight Service, Coastal Ledger, Terracotta Bistro, and Jade After Hours.
- Theme rendering was upgraded from a partial page-shell change to a shared `rf-theme` token bridge. Every preset now publishes canvas, surface, primary, hover, text, muted-text, and border variables; the bridge maps imported hard-coded Forest/slate/amber classes across cards, dialogs, controls, inputs, selected states, and disabled states to the active palette. This is the required basis for full-workspace preset and custom theming.
- The original palette is retained as **Classic Forest Green**. Restaurant-focused additions are **Saffron Counter** (yellow/black/white), **Espresso Café**, and **Ocean Grill**. Primary-button text is selected automatically from primary-color luminance, keeping bright yellow Saffron controls dark and readable while dark primaries retain white text.
- Corrected a theme-bridge regression where translucent amber/Forest semantic badges were incorrectly classified as solid primary buttons, allowing matching text and background to become invisible. Solid action tokens and soft badge tokens are now separate; the POS Current Ticket count and Procurement toolbar actions consume palette variables directly.
- Corrected the shared hover-state regression visible in Menu, Inventory, Suppliers, and CRM/Delivery tables. Neutral Slate hover tokens now render as a light palette-aware tint instead of a solid primary fill, so table text and action controls retain readable contrast; explicit primary actions still receive the stronger primary hover state.
- Floor & Tables now uses the approved top-bar workspace design: compact service header, Floor Plan/Table List switcher, live per-floor occupancy rail, dotted live floor board with status-aware table shapes, and an always-present inspector area. It retains live SQLite table status, seating, ticket lookup, POS handoff, transfer, edit, delete, and floor-management behavior; the Table List is a real view over the same table records.
- The Floor Plan canvas was refined to match the approved visual direction more closely: composed restaurant-plan surface and service-zone header, spaced table objects with seat markers, a soft-green occupied state, one dark-green selected table, and automatic real-table selection so the inspector opens with live data instead of an empty placeholder. Inline action buttons were removed from the floor objects; their working actions remain in the inspector to keep the plan clear.
- A generic, store-independent Floor Designer foundation is now implemented. Every floor can persist its own canvas size/grid and reusable visual objects (walls, doors, counters, booths, plants, labels, and zones) in local SQLite data; real POS tables persist their own X/Y coordinates. Authorized managers can enter Edit Layout mode, add palette objects, drag objects/tables with snap-to-grid, select/remove objects, resize and rotate objects, and save placement through the permission-checked Electron seating mutation. Staff retain the operational click-to-inspect/POS behavior. Safe TypeScript and Electron syntax checks pass.
- Inventory, Delivery, Analytics, Menu, Kitchen, Suppliers, Cash Drawer, Staff, and Settings use the same porcelain workspace, contained rounded headers, compact green selected states, consistent action hierarchy, form borders, and restrained card shadows.
- Login now matches the application shell: compact brand/status header, light staff-profile selection workspace, dark-green PIN console, and a clearly separated local owner-recovery panel. Account selection and PIN authentication behavior are unchanged.
- Navigation labels are shortened for the compact top bar; all existing tabs, role-based visibility, routes, and operational behavior remain unchanged.
- Existing installations retain their saved valid appearance selection. The compact Navbar palette control and Settings Appearance editor expose the complete built-in restaurant palette and the persisted custom theme option.

## Key source locations

| Concern | Main locations |
| --- | --- |
| Shell, navigation, global error dialog | `src/App.tsx`, `src/components/Navbar.tsx`, `src/utils/userFeedback.ts` |
| Electron, SQLite, security, IPC, backups, printing | `electron/main.cjs`, `electron/preload.cjs` |
| Renderer data adapter | `src/services/sqliteStorage.ts` |
| POS, payment, receipt, orders | `src/components/pos/`, `src/components/orders/` |
| Kitchen, floors/tables, menu | `src/components/kds/`, `src/components/tables/`, `src/components/menu/` |
| Inventory and purchasing | `src/components/inventory/`, `src/components/procurement/` |
| CRM/delivery, staff/expenses, cash drawer | `src/components/delivery/`, `src/components/staff/`, `src/components/finance/` |
| Reports and settings | `src/components/reports/`, `src/components/settings/` |
| Shared types | `src/types/restaurant.ts`, `src/types/desktop.d.ts` |

## Verification completed

The following safe checks passed after the current changes:

```powershell
npm run lint
node --check electron\main.cjs
node --check electron\preload.cjs
```

The structural top-bar and workspace redesign also passed `npm run lint` after the latest changes.

Earlier non-production isolated Electron workflows also exercised catalog creation, a split-payment POS sale, KDS lifecycle changes, non-hardware cash movement, CRM customer creation, delivery lifecycle, expense posting, attendance, payroll, analytics, SQLite backup integrity, procurement/GRN/supplier-payment reconciliation, login-account lifecycle, and foreign-key validation.

Not dynamically exercised in the current environment:

- Restart/smoke test after the latest Electron bridge error-dialog correction.
- Physical printers, receipt layouts, Windows spooler, raw ESC/POS connection, and cash-drawer hardware.
- User-dialog-driven manual backup export, verification, and restore.
- Installer build/install on a clean Windows machine.
- Full end-to-end UI acceptance run using representative restaurant data.

## Remaining work

### Required before production use

1. Restart the desktop application and perform a short smoke test after the latest bridge/error-dialog correction: login, open each workspace, create/park/settle an order, and intentionally trigger one validation error.
2. Complete an end-to-end acceptance run using representative restaurant data: dine-in, takeaway, delivery, customer lookup, split payment, KDS completion, cancellation/food loss, stock usage, quick restock, PO/GRN, supplier payment, cash close, expense, attendance/payroll, and report reconciliation.
3. Test backup/disaster recovery against a disposable database: C: success, D: failure, independent retention, manual export, inspect, failed restore, and successful restore.
4. Test target Windows hardware: all receipt/KOT printers, 58 mm/80 mm formats, raw network ESC/POS, Windows USB/system queue, and the connected cash drawer.
5. Build/install the NSIS package on a clean Windows machine, then verify first-run database creation, upgrades, launch, and offline operation. Code signing is not configured.
6. Replace sample store/menu/recipe/staff data; configure actual tax, payment methods, printer addresses, private staff PINs, backup folders, and restaurant-specific operating procedures.

### Planned product work / intentional limits

- Perform a live visual review of the structural redesign at the target Windows display size. The required follow-up is visual acceptance/refinement only; it must not change business workflows without a separate requirement.
- Add automated UI/end-to-end coverage and repeatable database workflow tests.
- Consider code splitting if initial client load becomes a practical issue.
- Bluetooth printer transport is not implemented.
- No multi-store synchronization, cloud replication, centralized administration, payment-gateway connection, statutory fiscal integration, or tax filing integration is implemented.
- Review tax, receipt, payroll, and accounting behavior against the restaurant's local legal/accounting requirements before live use.

## Recommended next task

Restart the desktop app and review the structural forest-green redesign in POS, tables, inventory, delivery, reports, and settings. Confirm screen density and preferred refinements before production acceptance testing.
