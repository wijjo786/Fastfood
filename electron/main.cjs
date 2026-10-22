const { app, BrowserWindow, dialog, ipcMain, protocol } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const Database = require('better-sqlite3');

const APP_NAME = 'RestoFlow Desktop';
const DB_FILE_NAME = 'restoflow.sqlite';
const OWNER_RECOVERY_ENABLED = process.env.RESTOFLOW_OWNER_RECOVERY === '1' || process.argv.includes('--owner-recovery');
const DEFAULT_BACKUP_CONFIG = Object.freeze({
  autoBackupHours: 24,
  retentionCount: 30,
  destinations: [
    { id: 'primary-c', label: 'Primary backup (C:)', path: 'C:\\RestoFlow\\Backups', enabled: true },
    { id: 'secondary-d', label: 'Secondary backup (D:)', path: 'D:\\RestoFlow\\Backups', enabled: true },
  ],
});
const DEFAULT_DELIVERY_METHODS = Object.freeze([
  { id: 'own_fleet', name: 'Own Fleet (In-House)', icon: '🛵', commissionRate: 0, enabled: true, displayOrder: 1, system: true },
  { id: 'foodpanda', name: 'Foodpanda', icon: '🐼', commissionRate: 22, enabled: true, displayOrder: 2, system: true },
]);

protocol.registerSchemesAsPrivileged([
  { scheme: 'restoflow-media', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function isoTimestamp() {
  return new Date().toISOString();
}

function normalizeFloorLayout(value, existing) {
  const source = value && typeof value === 'object' ? value : (existing && typeof existing === 'object' ? existing : {});
  const canvasWidth = Number(source.canvasWidth ?? 1200);
  const canvasHeight = Number(source.canvasHeight ?? 760);
  const gridSize = Number(source.gridSize ?? 20);
  if (!Number.isInteger(canvasWidth) || canvasWidth < 600 || canvasWidth > 4000) throw new Error('Floor canvas width must be between 600 and 4000 pixels.');
  if (!Number.isInteger(canvasHeight) || canvasHeight < 400 || canvasHeight > 3000) throw new Error('Floor canvas height must be between 400 and 3000 pixels.');
  if (!Number.isInteger(gridSize) || gridSize < 5 || gridSize > 100) throw new Error('Floor grid size must be between 5 and 100 pixels.');
  const allowedTypes = new Set(['wall', 'door', 'counter', 'booth', 'plant', 'label', 'zone']);
  const objects = Array.isArray(source.objects) ? source.objects : [];
  if (objects.length > 150) throw new Error('A floor layout can contain at most 150 design objects.');
  return {
    canvasWidth,
    canvasHeight,
    gridSize,
    objects: objects.map((object, index) => {
      const type = String(object?.type || '');
      if (!allowedTypes.has(type)) throw new Error('Floor layout contains an unsupported object type.');
      const id = String(object?.id || '');
      if (!/^[a-z0-9_-]{3,80}$/i.test(id)) throw new Error('Floor layout object identifier is invalid.');
      const numeric = (field, minimum, maximum) => {
        const result = Number(object?.[field]);
        if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`Floor layout object ${field} is invalid.`);
        return Math.round(result * 100) / 100;
      };
      const label = String(object?.label || '').trim();
      if (label.length > 60) throw new Error('Floor layout labels must be 60 characters or fewer.');
      return {
        id, type, label: label || undefined,
        x: numeric('x', 0, 100), y: numeric('y', 0, 100),
        width: numeric('width', 1, 100), height: numeric('height', 1, 100),
        rotation: numeric('rotation', -360, 360),
        color: /^#[0-9a-f]{6}$/i.test(String(object?.color || '')) ? String(object.color) : undefined,
        zIndex: Math.max(0, Math.min(1000, Math.round(Number(object?.zIndex ?? index))))
      };
    }),
  };
}

function fileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function normalizeRoleCode(value) {
  let code = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!code) return '';
  if (!/^[a-z]/.test(code)) code = `role_${code}`;
  if (code.length < 3) code = `role_${code}`;
  return code.slice(0, 40).replace(/_+$/g, '');
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function removeSqliteSidecars(filePath) {
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${filePath}${suffix}`;
    if (fs.existsSync(sidecarPath)) fs.rmSync(sidecarPath, { force: true });
  }
}

function productMediaDirectory() {
  return path.join(app.getPath('userData'), 'product-media');
}

function productMediaUrl(fileName) {
  return `restoflow-media://local/${encodeURIComponent(fileName)}`;
}

function productMediaFileName(imageUrl) {
  try {
    const parsed = new URL(String(imageUrl || ''));
    if (parsed.protocol !== 'restoflow-media:' || parsed.hostname !== 'local') return null;
    const fileName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return /^[a-z0-9-]+\.(?:png|jpe?g|webp|gif)$/i.test(fileName) ? fileName : null;
  } catch {
    return null;
  }
}

function mediaTypeForFile(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  return extension === '.png' ? 'image/png' : extension === '.gif' ? 'image/gif' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
}

function isValidProductImage(buffer, extension) {
  if (extension === 'png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === 'jpg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === 'gif') return buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a');
  return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

function storeProductImageData(dataUrl) {
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || ''));
  if (!match) throw new Error('Product images must be PNG, JPEG, WebP, or GIF files.');
  const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const content = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!content.length || content.length > 5 * 1024 * 1024 || !isValidProductImage(content, extension)) throw new Error('The selected product image is invalid or exceeds the 5 MB limit.');
  const directory = productMediaDirectory();
  fs.mkdirSync(directory, { recursive: true });
  const fileName = `product-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
  const finalPath = path.join(directory, fileName);
  const temporaryPath = `${finalPath}.tmp`;
  fs.writeFileSync(temporaryPath, content, { flag: 'wx' });
  fs.renameSync(temporaryPath, finalPath);
  return productMediaUrl(fileName);
}

function deleteManagedProductImage(imageUrl) {
  const fileName = productMediaFileName(imageUrl);
  if (!fileName) return;
  const targetPath = path.join(productMediaDirectory(), fileName);
  if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `scrypt:${salt}:${digest}`;
}

function verifyPinHash(pinHash, pin) {
  if (typeof pinHash !== 'string' || !pinHash.startsWith('scrypt:')) return false;
  const [, salt, expected] = pinHash.split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function protectPin(record) {
  if (!record || typeof record !== 'object') return record;
  const protectedRecord = { ...record };
  if (!protectedRecord.pinHash && /^\d{4,6}$/.test(String(protectedRecord.pin || ''))) {
    protectedRecord.pinHash = hashPin(protectedRecord.pin);
  }
  delete protectedRecord.pin;
  return protectedRecord;
}

function redactPin(record) {
  if (!record || typeof record !== 'object') return record;
  const safeRecord = { ...record };
  delete safeRecord.pin;
  delete safeRecord.pinHash;
  return safeRecord;
}

function validateBackupConfig(input) {
  const candidate = input && typeof input === 'object' ? input : {};
  const retentionCount = Number(candidate.retentionCount);
  const autoBackupHours = Number(candidate.autoBackupHours);
  const destinations = Array.isArray(candidate.destinations) ? candidate.destinations : [];
  if (!Number.isInteger(retentionCount) || retentionCount < 1 || retentionCount > 365) {
    throw new Error('Retention must be a whole number between 1 and 365.');
  }
  if (!Number.isInteger(autoBackupHours) || autoBackupHours < 1 || autoBackupHours > 168) {
    throw new Error('Automatic backup interval must be between 1 and 168 hours.');
  }
  if (destinations.length !== 2) throw new Error('Exactly two backup destinations are required.');

  const normalized = destinations.map((destination, index) => {
    if (!destination || typeof destination !== 'object') throw new Error('Invalid backup destination.');
    const folder = String(destination.path || '').trim();
    const expectedDrive = index === 0 ? 'C:' : 'D:';
    if (!new RegExp(`^${expectedDrive.replace(':', '\\:')}\\\\`, 'i').test(folder)) {
      throw new Error(`Backup destination ${index + 1} must remain on the ${expectedDrive} drive.`);
    }
    return {
      id: index === 0 ? 'primary-c' : 'secondary-d',
      label: index === 0 ? 'Primary backup (C:)' : 'Secondary backup (D:)',
      path: path.win32.normalize(folder),
      enabled: destination.enabled !== false,
    };
  });

  return { autoBackupHours, retentionCount, destinations: normalized };
}

class SqliteRuntime {
  constructor() {
    this.dbPath = path.join(app.getPath('userData'), DB_FILE_NAME);
    this.db = null;
    this.backupTimer = null;
    this.sessions = new Map();
    this.senderSessions = new Map();
  }

  open() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS backup_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        config_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS backup_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        destination_id TEXT,
        destination_label TEXT NOT NULL,
        file_path TEXT,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
        error_message TEXT,
        size_bytes INTEGER,
        checksum_sha256 TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_backup_status_created_at ON backup_status(created_at DESC);
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        currency TEXT NOT NULL,
        tax_rate REAL NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS floors (
        id TEXT PRIMARY KEY NOT NULL,
        branch_id TEXT NOT NULL,
        name TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY NOT NULL,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        base_price REAL NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ingredients (
        id TEXT PRIMARY KEY NOT NULL,
        branch_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        unit TEXT NOT NULL,
        current_stock REAL NOT NULL,
        min_threshold REAL NOT NULL DEFAULT 0,
        unit_cost REAL NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY NOT NULL,
        product_id TEXT NOT NULL UNIQUE,
        calculated_cost REAL NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recipe_items (
        recipe_id TEXT NOT NULL,
        ingredient_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (recipe_id, ingredient_id)
      );
      CREATE TABLE IF NOT EXISTS restaurant_tables (
        id TEXT PRIMARY KEY NOT NULL,
        branch_id TEXT NOT NULL,
        floor_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        current_order_id TEXT,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        total_orders INTEGER NOT NULL DEFAULT 0,
        total_spent REAL NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
      CREATE TABLE IF NOT EXISTS delivery_zones (
        id TEXT PRIMARY KEY NOT NULL,
        branch_id TEXT NOT NULL,
        name TEXT NOT NULL,
        min_order_amount REAL NOT NULL DEFAULT 0,
        delivery_fee REAL NOT NULL DEFAULT 0,
        estimated_minutes INTEGER NOT NULL DEFAULT 30,
        active INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id TEXT PRIMARY KEY NOT NULL,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        order_id TEXT,
        transaction_type TEXT NOT NULL,
        points INTEGER NOT NULL,
        value_discount REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cash_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        branch_id TEXT NOT NULL,
        cashier_id TEXT NOT NULL,
        status TEXT NOT NULL,
        expected_cash REAL NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sales_orders (
        id TEXT PRIMARY KEY NOT NULL,
        invoice_number TEXT NOT NULL UNIQUE,
        branch_id TEXT NOT NULL,
        table_id TEXT,
        customer_id TEXT,
        cashier_id TEXT NOT NULL,
        order_type TEXT NOT NULL,
        status TEXT NOT NULL,
        grand_total REAL NOT NULL,
        amount_paid REAL NOT NULL DEFAULT 0,
        change_given REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sales_orders_branch_created ON sales_orders(branch_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS sales_order_items (
        id TEXT PRIMARY KEY NOT NULL,
        order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        kitchen_status TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sales_payments (
        id TEXT PRIMARY KEY NOT NULL,
        order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        reference TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY NOT NULL,
        ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
        order_id TEXT REFERENCES sales_orders(id),
        movement_type TEXT NOT NULL,
        quantity_delta REAL NOT NULL,
        created_at TEXT NOT NULL,
        note TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_ingredient_created ON inventory_movements(ingredient_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS inventory_variances (
        id TEXT PRIMARY KEY NOT NULL, ingredient_id TEXT NOT NULL REFERENCES ingredients(id), branch_id TEXT NOT NULL,
        movement_type TEXT NOT NULL, quantity_delta REAL NOT NULL, value_impact REAL NOT NULL,
        reason TEXT NOT NULL, recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL, payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_variances_branch_created ON inventory_variances(branch_id, recorded_at DESC);
      CREATE TABLE IF NOT EXISTS cash_drawer_entries (
        id TEXT PRIMARY KEY NOT NULL,
        cash_session_id TEXT,
        order_id TEXT REFERENCES sales_orders(id),
        settlement_group TEXT NOT NULL,
        amount REAL NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invoice_sequence (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        next_value INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS goods_received_notes (
        id TEXT PRIMARY KEY NOT NULL,
        grn_number TEXT NOT NULL UNIQUE,
        po_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        total_amount REAL NOT NULL,
        received_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS goods_received_items (
        grn_id TEXT NOT NULL REFERENCES goods_received_notes(id) ON DELETE CASCADE,
        ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
        quantity_received REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (grn_id, ingredient_id)
      );
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id TEXT PRIMARY KEY NOT NULL, vendor_id TEXT NOT NULL, branch_id TEXT NOT NULL,
        amount REAL NOT NULL, payment_method TEXT NOT NULL, reference_number TEXT NOT NULL,
        paid_at TEXT NOT NULL, payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, company_name TEXT NOT NULL,
        outstanding_balance REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY NOT NULL, po_number TEXT NOT NULL UNIQUE, branch_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL REFERENCES vendors(id), status TEXT NOT NULL, total_amount REAL NOT NULL,
        created_at TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch_created ON purchase_orders(branch_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        ingredient_id TEXT NOT NULL REFERENCES ingredients(id), quantity_ordered REAL NOT NULL,
        quantity_received REAL NOT NULL DEFAULT 0, unit_cost REAL NOT NULL, total_cost REAL NOT NULL,
        payload_json TEXT NOT NULL, PRIMARY KEY (po_id, ingredient_id)
      );
      CREATE TABLE IF NOT EXISTS expenses_ledger (
        id TEXT PRIMARY KEY NOT NULL, branch_id TEXT NOT NULL, category_id TEXT NOT NULL,
        amount REAL NOT NULL, payment_method TEXT NOT NULL, payee TEXT NOT NULL, recorded_at TEXT NOT NULL, payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY NOT NULL, branch_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
        hourly_rate REAL NOT NULL DEFAULT 0, monthly_salary REAL, active INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_employees_branch_active ON employees(branch_id, active);
      CREATE TABLE IF NOT EXISTS staff_attendance (
        id TEXT PRIMARY KEY NOT NULL, employee_id TEXT NOT NULL REFERENCES employees(id), branch_id TEXT NOT NULL,
        attendance_date TEXT NOT NULL, clock_in_at TEXT NOT NULL, clock_out_at TEXT, total_hours REAL,
        status TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_staff_attendance_employee_date ON staff_attendance(employee_id, attendance_date DESC);
      CREATE TABLE IF NOT EXISTS payroll_advances (
        id TEXT PRIMARY KEY NOT NULL, employee_id TEXT NOT NULL REFERENCES employees(id), branch_id TEXT NOT NULL,
        amount REAL NOT NULL, outstanding_amount REAL NOT NULL, issued_at TEXT NOT NULL, status TEXT NOT NULL,
        payload_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id TEXT PRIMARY KEY NOT NULL, payroll_number TEXT NOT NULL UNIQUE, branch_id TEXT NOT NULL,
        period_start TEXT NOT NULL, period_end TEXT NOT NULL, payment_method TEXT NOT NULL, status TEXT NOT NULL,
        total_gross REAL NOT NULL, total_deductions REAL NOT NULL, total_net REAL NOT NULL,
        posted_at TEXT NOT NULL, posted_by TEXT NOT NULL, payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payroll_items (
        payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
        employee_id TEXT NOT NULL REFERENCES employees(id), gross_pay REAL NOT NULL, advance_recovery REAL NOT NULL,
        other_deductions REAL NOT NULL, net_pay REAL NOT NULL, payload_json TEXT NOT NULL,
        PRIMARY KEY (payroll_run_id, employee_id)
      );
    `);
    const now = isoTimestamp();
    this.db.prepare('INSERT OR IGNORE INTO app_meta(key, value, updated_at) VALUES (?, ?, ?)')
      .run('schema_version', '1', now);
    this.db.prepare('INSERT OR IGNORE INTO backup_config(id, config_json, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(DEFAULT_BACKUP_CONFIG), now);
    this.db.prepare('INSERT OR IGNORE INTO invoice_sequence(id, next_value) VALUES (1, 846)').run();
    this.migrateLegacyState();
    this.migrateLegacyPins();
  }

  migrateLegacyState() {
    const version = this.db.prepare("SELECT value FROM app_meta WHERE key = 'normalized_schema_version'").get();
    if (version?.value === '5') return;
    const legacyState = this.getAll();
    this.db.transaction(() => {
      this.syncNormalizedMasterData(legacyState);
      this.syncNormalizedCollection('vendors', legacyState.vendors);
      this.syncNormalizedCollection('purchase_orders', legacyState.purchase_orders);
      this.syncNormalizedCollection('employees', legacyState.employees);
      this.syncNormalizedCollection('attendances', legacyState.attendances);
      for (const order of Array.isArray(legacyState.orders) ? legacyState.orders : []) {
        this.writeNormalizedOrder(order);
      }
      for (const grn of Array.isArray(legacyState.grns) ? legacyState.grns : []) this.writeNormalizedGrn(grn);
      const maxLegacySequence = (Array.isArray(legacyState.orders) ? legacyState.orders : [])
        .map((order) => Number(String(order.invoiceNumber || '').match(/(\d+)$/)?.[1] || 0))
        .reduce((max, current) => Math.max(max, current), 845);
      this.db.prepare('UPDATE invoice_sequence SET next_value = MAX(next_value, ?) WHERE id = 1').run(maxLegacySequence + 1);
      this.db.prepare(`INSERT INTO app_meta(key, value, updated_at) VALUES ('normalized_schema_version', '5', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(isoTimestamp());
    })();
  }

  syncNormalizedMasterData(state) {
    const list = (key) => Array.isArray(state?.[key]) ? state[key] : [];
    const now = isoTimestamp();
    const upsert = (sql, values) => this.db.prepare(sql).run(...values);
    for (const branch of list('branches')) {
      upsert(`INSERT INTO branches(id, name, currency, tax_rate, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, currency=excluded.currency, tax_rate=excluded.tax_rate, payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
      [branch.id, branch.name, branch.currency || 'PKR', Number(branch.taxRate) || 0, JSON.stringify(branch), now]);
    }
    for (const floor of list('floors')) {
      upsert(`INSERT INTO floors(id, branch_id, name, display_order, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, display_order=excluded.display_order, payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
      [floor.id, floor.branchId, floor.name, Number(floor.displayOrder) || 0, JSON.stringify(floor), now]);
    }
    for (const category of list('categories')) {
      upsert(`INSERT INTO categories(id, name, display_order, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, display_order=excluded.display_order, payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
      [category.id, category.name, Number(category.displayOrder) || 0, JSON.stringify(category), now]);
    }
    for (const product of list('products')) {
      upsert(`INSERT INTO products(id, category_id, name, sku, base_price, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id, name=excluded.name, sku=excluded.sku, base_price=excluded.base_price, payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
      [product.id, product.categoryId, product.name, product.sku || '', Number(product.basePrice) || 0, JSON.stringify(product), now]);
    }
    for (const ingredient of list('ingredients')) {
      upsert(`INSERT INTO ingredients(id, branch_id, name, sku, unit, current_stock, min_threshold, unit_cost, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET branch_id=excluded.branch_id, name=excluded.name, sku=excluded.sku, unit=excluded.unit, current_stock=excluded.current_stock, min_threshold=excluded.min_threshold, unit_cost=excluded.unit_cost, payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
      [ingredient.id, ingredient.branchId, ingredient.name, ingredient.sku || '', ingredient.unit || 'piece', Number(ingredient.currentStock) || 0, Number(ingredient.minThreshold) || 0, Number(ingredient.unitCost) || 0, JSON.stringify(ingredient), now]);
    }
    for (const recipe of list('recipes')) {
      upsert(`INSERT INTO recipes(id, product_id, calculated_cost, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET product_id=excluded.product_id, calculated_cost=excluded.calculated_cost, payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
      [recipe.id, recipe.productId, Number(recipe.calculatedCost) || 0, JSON.stringify(recipe), now]);
      this.db.prepare('DELETE FROM recipe_items WHERE recipe_id = ?').run(recipe.id);
      for (const item of Array.isArray(recipe.items) ? recipe.items : []) {
        this.db.prepare('INSERT INTO recipe_items(recipe_id, ingredient_id, quantity, unit_cost, payload_json) VALUES (?, ?, ?, ?, ?)')
          .run(recipe.id, item.ingredientId, Number(item.quantity) || 0, Number(item.unitCost) || 0, JSON.stringify(item));
      }
    }
    for (const table of list('tables')) {
      upsert(`INSERT INTO restaurant_tables(id, branch_id, floor_id, name, status, current_order_id, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status, current_order_id=excluded.current_order_id, payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
      [table.id, table.branchId, table.floorId, table.name, table.status, table.currentOrderId || null, JSON.stringify(table), now]);
    }
    for (const customer of list('customers')) this.writeNormalizedCustomer(customer, now);
    for (const zone of list('delivery_zones')) this.writeNormalizedDeliveryZone(zone, now);
    for (const vendor of list('vendors')) this.writeNormalizedVendor(vendor, now);
    for (const purchaseOrder of list('purchase_orders')) this.writeNormalizedPurchaseOrder(purchaseOrder, now);
    for (const employee of list('employees')) this.writeNormalizedEmployee(employee, now);
    for (const attendance of list('attendances')) this.writeNormalizedAttendance(attendance, now);
    const cashSession = state?.cash_session;
    if (cashSession?.id) this.writeNormalizedCashSession(cashSession, now);
  }

  syncNormalizedCollection(key, value) {
    if (key === 'cash_session') {
      if (value?.id) this.writeNormalizedCashSession(value);
      return;
    }
    const tableByKey = {
      branches: 'branches',
      floors: 'floors',
      categories: 'categories',
      products: 'products',
      ingredients: 'ingredients',
      recipes: 'recipes',
      tables: 'restaurant_tables',
      customers: 'customers',
      delivery_zones: 'delivery_zones',
      vendors: 'vendors',
      purchase_orders: 'purchase_orders',
      employees: 'employees',
      attendances: 'staff_attendance',
    };
    const table = tableByKey[key];
    if (!table || !Array.isArray(value)) return;
    this.syncNormalizedMasterData({ [key]: value });
    const ids = [...new Set(value.map((entry) => entry?.id).filter(Boolean))];
    if (ids.length === 0) {
      this.db.prepare(`DELETE FROM ${table}`).run();
    } else {
      const placeholders = ids.map(() => '?').join(', ');
      this.db.prepare(`DELETE FROM ${table} WHERE id NOT IN (${placeholders})`).run(...ids);
    }
    if (key === 'recipes') {
      if (ids.length === 0) this.db.prepare('DELETE FROM recipe_items').run();
      else {
        const placeholders = ids.map(() => '?').join(', ');
        this.db.prepare(`DELETE FROM recipe_items WHERE recipe_id NOT IN (${placeholders})`).run(...ids);
      }
    }
    if (key === 'purchase_orders') {
      if (ids.length === 0) this.db.prepare('DELETE FROM purchase_order_items').run();
      else {
        const placeholders = ids.map(() => '?').join(', ');
        this.db.prepare(`DELETE FROM purchase_order_items WHERE po_id NOT IN (${placeholders})`).run(...ids);
      }
    }
  }

  writeNormalizedVendor(vendor, now = isoTimestamp()) {
    if (!vendor?.id || !vendor?.name) return;
    this.db.prepare(`INSERT INTO vendors(id, name, company_name, outstanding_balance, active, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, company_name=excluded.company_name, outstanding_balance=excluded.outstanding_balance, active=excluded.active, payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
      .run(vendor.id, vendor.name, vendor.companyName || vendor.name, Number(vendor.outstandingBalance) || 0, vendor.active === false ? 0 : 1, JSON.stringify(vendor), now);
  }

  writeNormalizedEmployee(employee, now = isoTimestamp()) {
    if (!employee?.id || !employee?.branchId || !employee?.name) return;
    this.db.prepare(`INSERT INTO employees(id, branch_id, name, role, hourly_rate, monthly_salary, active, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, hourly_rate=excluded.hourly_rate, monthly_salary=excluded.monthly_salary, active=excluded.active, payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
      .run(employee.id, employee.branchId, employee.name, employee.role, Number(employee.hourlyRate) || 0, employee.monthlySalary == null ? null : Number(employee.monthlySalary), employee.active === false ? 0 : 1, JSON.stringify(employee), now);
  }

  writeNormalizedAttendance(attendance, now = isoTimestamp()) {
    if (!attendance?.id || !attendance?.employeeId || !attendance?.branchId) return;
    const clockInAt = attendance.clockInAt || `${attendance.date || now.slice(0, 10)}T00:00:00.000Z`;
    this.db.prepare(`INSERT INTO staff_attendance(id, employee_id, branch_id, attendance_date, clock_in_at, clock_out_at, total_hours, status, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET clock_out_at=excluded.clock_out_at, total_hours=excluded.total_hours, status=excluded.status, payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
      .run(attendance.id, attendance.employeeId, attendance.branchId, attendance.date || now.slice(0, 10), clockInAt, attendance.clockOutAt || null, attendance.totalHoursWorked == null ? null : Number(attendance.totalHoursWorked), attendance.status || 'present', JSON.stringify(attendance), now);
  }

  listNormalizedEmployees(branchId) {
    return this.db.prepare('SELECT payload_json FROM employees WHERE branch_id = ? ORDER BY active DESC, name COLLATE NOCASE').all(branchId).map((row) => JSON.parse(row.payload_json));
  }

  listNormalizedAttendances(branchId) {
    return this.db.prepare('SELECT payload_json FROM staff_attendance WHERE branch_id = ? ORDER BY attendance_date DESC, clock_in_at DESC').all(branchId).map((row) => JSON.parse(row.payload_json));
  }

  writeNormalizedPurchaseOrder(purchaseOrder, now = isoTimestamp()) {
    if (!purchaseOrder?.id || !purchaseOrder?.poNumber || !purchaseOrder?.vendorId) return;
    this.db.prepare(`INSERT INTO purchase_orders(id, po_number, branch_id, vendor_id, status, total_amount, created_at, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET vendor_id=excluded.vendor_id, status=excluded.status, total_amount=excluded.total_amount, payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
      .run(purchaseOrder.id, purchaseOrder.poNumber, purchaseOrder.branchId, purchaseOrder.vendorId, purchaseOrder.status, Number(purchaseOrder.totalAmount) || 0, purchaseOrder.createdAt || now, JSON.stringify(purchaseOrder), now);
    this.db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(purchaseOrder.id);
    for (const item of Array.isArray(purchaseOrder.items) ? purchaseOrder.items : []) {
      this.db.prepare('INSERT INTO purchase_order_items(po_id, ingredient_id, quantity_ordered, quantity_received, unit_cost, total_cost, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(purchaseOrder.id, item.ingredientId, Number(item.quantityOrdered) || 0, Number(item.quantityReceived) || 0, Number(item.unitCost) || 0, Number(item.totalCost) || 0, JSON.stringify(item));
    }
  }

  writeNormalizedCustomer(customer, now = isoTimestamp()) {
    this.db.prepare(`INSERT INTO customers(id, name, phone, total_orders, total_spent, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, total_orders=excluded.total_orders, total_spent=excluded.total_spent, payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
      .run(customer.id, customer.name, customer.phone, Number(customer.totalOrders) || 0, Number(customer.totalSpent) || 0, JSON.stringify(customer), now);
  }

  writeNormalizedDeliveryZone(zone, now = isoTimestamp()) {
    if (!zone?.id || !zone?.branchId || !zone?.name) return;
    this.db.prepare(`INSERT INTO delivery_zones(id, branch_id, name, min_order_amount, delivery_fee, estimated_minutes, active, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, min_order_amount=excluded.min_order_amount, delivery_fee=excluded.delivery_fee, estimated_minutes=excluded.estimated_minutes, active=excluded.active, payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
      .run(zone.id, zone.branchId, zone.name, Number(zone.minOrderAmount) || 0, Number(zone.deliveryFee) || 0, Number(zone.estimatedMinutes) || 0, zone.active === false ? 0 : 1, JSON.stringify(zone), now);
  }

  writeNormalizedCashSession(session, now = isoTimestamp()) {
    this.db.prepare(`INSERT INTO cash_sessions(id, branch_id, cashier_id, status, expected_cash, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, expected_cash=excluded.expected_cash, payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
      .run(session.id, session.branchId, session.cashierId, session.status, Number(session.expectedCash) || 0, JSON.stringify(session), now);
  }

  writeNormalizedOrder(order) {
    if (!order?.id || !order?.invoiceNumber) return;
    this.db.prepare(`INSERT INTO sales_orders(id, invoice_number, branch_id, table_id, customer_id, cashier_id, order_type, status, grand_total, amount_paid, change_given, created_at, updated_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, grand_total=excluded.grand_total, amount_paid=excluded.amount_paid, change_given=excluded.change_given, updated_at=excluded.updated_at, payload_json=excluded.payload_json`)
      .run(order.id, order.invoiceNumber, order.branchId, order.tableId || null, order.customerId || null, order.cashierId, order.orderType, order.status, Number(order.grandTotal) || 0, Number(order.amountPaid) || 0, Number(order.changeGiven) || 0, order.createdAt, order.updatedAt, JSON.stringify(order));
    this.db.prepare('DELETE FROM sales_order_items WHERE order_id = ?').run(order.id);
    this.db.prepare('DELETE FROM sales_payments WHERE order_id = ?').run(order.id);
    for (const item of Array.isArray(order.items) ? order.items : []) {
      this.db.prepare('INSERT INTO sales_order_items(id, order_id, product_id, product_name, quantity, unit_price, total_price, kitchen_status, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(item.id, order.id, item.productId, item.productName, Number(item.quantity) || 0, Number(item.unitPrice) || 0, Number(item.totalPrice) || 0, item.kitchenStatus || 'pending', JSON.stringify(item));
    }
    for (const payment of this.getOrderPaymentLines(order)) {
      this.db.prepare('INSERT INTO sales_payments(id, order_id, method, amount, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`pay-${order.id}-${payment.index}`, order.id, payment.method, payment.amount, payment.reference || null, order.createdAt);
    }
  }

  writeNormalizedGrn(grn) {
    if (!grn?.id || !grn?.grnNumber) return;
    this.db.prepare(`INSERT INTO goods_received_notes(id, grn_number, po_id, vendor_id, branch_id, total_amount, received_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET total_amount=excluded.total_amount, payload_json=excluded.payload_json`)
      .run(grn.id, grn.grnNumber, grn.poId, grn.vendorId, grn.branchId, Number(grn.totalAmount) || 0, grn.receivedAt, JSON.stringify(grn));
    this.db.prepare('DELETE FROM goods_received_items WHERE grn_id = ?').run(grn.id);
    for (const item of Array.isArray(grn.items) ? grn.items : []) {
      this.db.prepare('INSERT INTO goods_received_items(grn_id, ingredient_id, quantity_received, unit_cost, total_cost, payload_json) VALUES (?, ?, ?, ?, ?, ?)')
        .run(grn.id, item.ingredientId, Number(item.quantityReceived) || 0, Number(item.unitCost) || 0, Number(item.totalCost) || 0, JSON.stringify(item));
    }
  }

  getOrderPaymentLines(order) {
    if (Array.isArray(order.paymentSplits) && order.paymentSplits.length) {
      return order.paymentSplits.map((payment, index) => ({ ...payment, index }));
    }
    if (!order.paymentMethod || !Number(order.amountPaid)) return [];
    const amount = order.paymentMethod === 'cash' ? Number(order.grandTotal) : Number(order.amountPaid);
    return [{ method: order.paymentMethod, amount, reference: order.paymentReference || null, index: 0 }];
  }

  close() {
    if (this.db) {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
      this.db.close();
      this.db = null;
    }
  }

  getAll() {
    const rows = this.db.prepare('SELECT key, value_json FROM kv_store').all();
    return rows.reduce((result, row) => {
      result[row.key] = JSON.parse(row.value_json);
      return result;
    }, {});
  }

  getSafeAll() {
    const values = this.getAll();
    if (Array.isArray(values.users)) values.users = values.users.map(redactPin);
    if (Array.isArray(values.employees)) values.employees = values.employees.map(redactPin);
    return values;
  }

  protectAuthState(values) {
    const protectedValues = clone(values);
    if (Array.isArray(protectedValues.users)) protectedValues.users = protectedValues.users.map(protectPin);
    if (Array.isArray(protectedValues.employees)) protectedValues.employees = protectedValues.employees.map(protectPin);
    return protectedValues;
  }

  migrateLegacyPins() {
    const values = this.getAll();
    const requiresMigration = ['users', 'employees'].some((key) => Array.isArray(values[key]) && values[key].some((entry) => entry?.pin));
    if (!requiresMigration) return;
    const protectedValues = this.protectAuthState(values);
    this.db.transaction(() => {
      this.setValue('users', protectedValues.users || []);
      this.setValue('employees', protectedValues.employees || []);
      this.syncNormalizedCollection('employees', protectedValues.employees || []);
    })();
  }

  getLoginUsers() {
    const values = this.getAll();
    return (Array.isArray(values.users) ? values.users : [])
      .filter((entry) => entry?.id && entry.active !== false)
      .map((entry) => redactPin(entry));
  }

  authenticate(input) {
    const pin = String(input?.pin || '').trim();
    const requestedId = String(input?.userId || '').trim();
    if (!/^\d{4,6}$/.test(pin)) throw new Error('Enter a valid 4 to 6 digit PIN.');
    // A PIN can be shared by more than one staff account.  The selected account
    // is therefore the identity being authenticated; a PIN by itself is not.
    if (!requestedId) throw new Error('Select a staff account before entering a PIN.');
    const values = this.getAll();
    const candidates = (Array.isArray(values.users) ? values.users : [])
      .filter((entry) => entry?.active !== false && entry.id === requestedId);
    const matched = candidates.find((entry) => verifyPinHash(entry.pinHash, pin));
    if (!matched) throw new Error('Invalid staff PIN.');
    const sessionToken = crypto.randomBytes(32).toString('hex');
    this.sessions.set(sessionToken, { userId: matched.id, expiresAt: Date.now() + (15 * 60 * 1000) });
    return { ...redactPin(matched), sessionToken };
  }

  refreshSession(input) {
    const sessionToken = String(input?.sessionToken || '');
    const session = this.sessions.get(sessionToken);
    if (!session || session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionToken);
      throw new Error('Your terminal session has expired. Please sign in again.');
    }
    session.expiresAt = Date.now() + (15 * 60 * 1000);
  }

  logout(input) {
    const sessionToken = String(input?.sessionToken || '');
    if (sessionToken) this.sessions.delete(sessionToken);
  }

  bindSenderSession(senderId, sessionToken) {
    const session = this.sessions.get(sessionToken);
    if (!session || session.expiresAt <= Date.now()) throw new Error('Unable to bind an expired terminal session.');
    this.senderSessions.set(senderId, sessionToken);
  }

  unbindSenderSession(senderId) {
    this.senderSessions.delete(senderId);
  }

  getSenderUser(senderId) {
    const sessionToken = this.senderSessions.get(senderId);
    const session = this.sessions.get(sessionToken);
    return this.resolveAuthenticatedUser({ id: session?.userId, sessionToken });
  }

  bootstrapInitialState(values) {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM kv_store').get().count;
    if (count > 0) throw new Error('Initial data has already been created. Direct state replacement is not permitted.');
    this.replaceAll(values);
  }

  async resetOperationalData(user) {
    if (user.role !== 'super_admin') throw new Error('Only a super administrator can clear operational data.');
    const safetyBackups = await this.automaticBackup('pre_operational_reset');
    if (!safetyBackups.some((backup) => backup.status === 'success')) throw new Error('Operational reset was cancelled because no safety backup could be created.');
    const now = isoTimestamp();
    this.db.transaction(() => {
      for (const table of ['sales_order_items', 'sales_payments', 'cash_drawer_entries', 'inventory_movements', 'inventory_variances', 'goods_received_items', 'goods_received_notes', 'purchase_order_items', 'purchase_orders', 'supplier_payments', 'expenses_ledger', 'payroll_items', 'payroll_runs', 'payroll_advances', 'staff_attendance', 'sales_orders', 'cash_sessions']) this.db.prepare(`DELETE FROM ${table}`).run();
      const tables = this.getStoredValue('tables', []).map((table) => ({ ...table, status: 'available', currentOrderId: undefined, occupiedSince: undefined }));
      const ingredients = this.getStoredValue('ingredients', []).map((ingredient) => ({ ...ingredient, currentStock: 0 }));
      const vendors = this.getStoredValue('vendors', []).map((vendor) => ({ ...vendor, outstandingBalance: 0 }));
      const customers = this.getStoredValue('customers', []).map((customer) => ({ ...customer, loyaltyPoints: 0, totalOrders: 0, totalSpent: 0, lastOrderDate: undefined }));
      for (const table of tables) this.db.prepare('UPDATE restaurant_tables SET status = ?, current_order_id = NULL, payload_json = ?, updated_at = ? WHERE id = ?').run(table.status, JSON.stringify(table), now, table.id);
      for (const ingredient of ingredients) this.db.prepare('UPDATE ingredients SET current_stock = ?, payload_json = ?, updated_at = ? WHERE id = ?').run(0, JSON.stringify(ingredient), now, ingredient.id);
      for (const vendor of vendors) this.writeNormalizedVendor(vendor, now);
      for (const customer of customers) this.writeNormalizedCustomer(customer, now);
      const cashSession = { id: `csh-reset-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, branchId: user.branchId, cashierId: user.id, cashierName: user.name, openedAt: now, openingFloat: 0, cashSales: 0, cardSales: 0, walletSales: 0, cashPayouts: 0, cashDrops: 0, expectedCash: 0, status: 'open', notes: 'Opened after authorized operational-data reset.' };
      this.writeNormalizedCashSession(cashSession, now);
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: 'OPERATIONAL_DATA_RESET', details: 'Cleared operational records after a verified safety backup. Master data, staff accounts, menu, recipes, and settings were retained.' };
      const state = { orders: [], held_orders: [], quick_stock_purchases: [], cash_session: cashSession, sync_outbox: [], audit_logs: [auditLog], purchase_orders: [], grns: [], vendor_payments: [], expenses: [], attendances: [], payroll_advances: [], payroll_runs: [], tables, ingredients, vendors, customers, loyalty_tx: [] };
      for (const [key, value] of Object.entries(state)) this.setValue(key, value);
    })();
    this.sessions.clear();
    this.senderSessions.clear();
    return { reset: true, safetyBackups };
  }

  getRecoveryStatus() {
    return { enabled: OWNER_RECOVERY_ENABLED };
  }

  resetOwnerPin(input) {
    if (!OWNER_RECOVERY_ENABLED) throw new Error('Owner recovery mode is not enabled.');
    const userId = String(input?.userId || '');
    const pin = String(input?.pin || '').trim();
    if (!/^\d{4,6}$/.test(pin)) throw new Error('Recovery PIN must contain 4 to 6 digits.');
    const values = this.getAll();
    const users = Array.isArray(values.users) ? values.users : [];
    const employees = Array.isArray(values.employees) ? values.employees : [];
    const candidates = [...users, ...employees];
    const target = candidates.find((entry) => entry?.id === userId && entry?.active !== false);
    if (!target || target.role !== 'super_admin') throw new Error('Select an active super-admin account for owner recovery.');
    if (candidates.some((entry) => entry?.id !== userId && entry?.active !== false && verifyPinHash(entry.pinHash, pin))) {
      throw new Error('That PIN is already assigned to another active account.');
    }
    const pinHash = hashPin(pin);
    const update = (entry) => entry?.id === userId ? { ...entry, pinHash } : entry;
    const updatedUsers = users.map(update);
    const updatedEmployees = employees.map(update);
    this.db.transaction(() => {
      this.setValue('users', updatedUsers);
      this.setValue('employees', updatedEmployees);
      this.syncNormalizedCollection('employees', updatedEmployees);
    })();
    return redactPin({ ...target, pinHash });
  }

  getAnalyticsReport(input) {
    const branchId = String(input?.branchId || '');
    if (!branchId || !input?.user?.id) throw new Error('A branch and authenticated user are required for reports.');
    const user = this.requirePermission(input.user, 'canViewFinancialReports');
    if (user.role !== 'super_admin' && user.branchId !== branchId) throw new Error('You cannot view reports for a different store.');
    const startDate = String(input?.startDate || '').trim();
    const endDate = String(input?.endDate || '').trim();
    if ((startDate && !endDate) || (!startDate && endDate)) throw new Error('Select both a start and end date, or clear both dates.');
    let startTimestamp = '';
    let endTimestamp = '';
    if (startDate && endDate) {
      const parseDate = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Report dates must use YYYY-MM-DD format.');
        const parsed = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Report date is invalid.');
        return parsed;
      };
      const start = parseDate(startDate);
      const end = parseDate(endDate);
      if (start > end) throw new Error('The report start date cannot be after the end date.');
      end.setUTCDate(end.getUTCDate() + 1);
      startTimestamp = start.toISOString();
      endTimestamp = end.toISOString();
    }
    const eligibleStatusSql = "status NOT IN ('draft', 'cancelled', 'refunded')";
    const dateClause = startTimestamp ? ' AND created_at >= ? AND created_at < ?' : '';
    const dateValues = startTimestamp ? [startTimestamp, endTimestamp] : [];
    const orderRows = this.db.prepare(`SELECT payload_json FROM sales_orders WHERE branch_id = ? AND ${eligibleStatusSql}${dateClause} ORDER BY created_at DESC`).all(branchId, ...dateValues);
    const orders = orderRows.map((row) => JSON.parse(row.payload_json));
    const totals = orders.reduce((summary, order) => ({
      totalSales: summary.totalSales + Number(order.grandTotal || 0),
      totalTax: summary.totalTax + Number(order.taxAmount || 0),
      totalDiscounts: summary.totalDiscounts + Number(order.orderDiscountAmount || 0),
    }), { totalSales: 0, totalTax: 0, totalDiscounts: 0 });
    const channels = orders.reduce((summary, order) => {
      if (order.orderType === 'dine_in') summary.dineIn += 1;
      else if (order.orderType === 'takeaway') summary.takeaway += 1;
      else if (order.orderType === 'delivery') summary.delivery += 1;
      return summary;
    }, { dineIn: 0, takeaway: 0, delivery: 0 });
    const paymentDateClause = startTimestamp ? ' AND o.created_at >= ? AND o.created_at < ?' : '';
    const paymentRows = this.db.prepare(`SELECT p.method, COALESCE(SUM(p.amount), 0) AS amount FROM sales_payments p JOIN sales_orders o ON o.id = p.order_id WHERE o.branch_id = ? AND o.${eligibleStatusSql}${paymentDateClause} GROUP BY p.method`).all(branchId, ...dateValues);
    const payments = paymentRows.reduce((summary, row) => {
      const amount = Number(row.amount || 0);
      if (row.method === 'cash') summary.cash += amount;
      else if (row.method === 'card') summary.card += amount;
      else summary.digital += amount;
      return summary;
    }, { cash: 0, card: 0, digital: 0 });
    const topProducts = this.db.prepare(`SELECT i.product_id AS productId, i.product_name AS name, SUM(i.quantity) AS qty, SUM(i.total_price) AS revenue FROM sales_order_items i JOIN sales_orders o ON o.id = i.order_id WHERE o.branch_id = ? AND o.${eligibleStatusSql}${paymentDateClause} GROUP BY i.product_id, i.product_name ORDER BY qty DESC, revenue DESC LIMIT 5`).all(branchId, ...dateValues)
      .map((row) => ({ productId: row.productId, name: row.name, qty: Number(row.qty || 0), revenue: Number(row.revenue || 0) }));
    const expenseDateClause = startTimestamp ? ' AND recorded_at >= ? AND recorded_at < ?' : '';
    const expenseRow = this.db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses_ledger WHERE branch_id = ?${expenseDateClause}`).get(branchId, ...dateValues);
    const directStockPurchases = (this.getStoredValue('quick_stock_purchases', []) || []).filter((purchase) => purchase?.branchId === branchId && (!startTimestamp || (purchase.purchasedAt >= startTimestamp && purchase.purchasedAt < endTimestamp))).reduce((total, purchase) => total + Number(purchase.totalAmount || 0), 0);
    return {
      orders,
      totalSales: +totals.totalSales.toFixed(2),
      totalTax: +totals.totalTax.toFixed(2),
      totalDiscounts: +totals.totalDiscounts.toFixed(2),
      orderCount: orders.length,
      channels,
      payments: { cash: +payments.cash.toFixed(2), card: +payments.card.toFixed(2), digital: +payments.digital.toFixed(2) },
      topProducts,
      operatingExpenses: +Number(expenseRow.total || 0).toFixed(2),
      directStockPurchases: +directStockPurchases.toFixed(2),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };
  }

  replaceAll(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Invalid application state.');
    const protectedValues = this.protectAuthState(values);
    const persist = this.db.transaction((entries) => {
      this.db.prepare('DELETE FROM kv_store').run();
      const insert = this.db.prepare('INSERT INTO kv_store(key, value_json, updated_at) VALUES (?, ?, ?)');
      for (const [key, value] of entries) {
        if (!/^[a-z_]+$/.test(key)) throw new Error('Invalid data-store key.');
        insert.run(key, JSON.stringify(value), isoTimestamp());
      }
      for (const key of ['branches', 'floors', 'categories', 'products', 'ingredients', 'recipes', 'tables', 'customers', 'delivery_zones', 'vendors', 'purchase_orders', 'employees', 'attendances', 'cash_session']) {
        this.syncNormalizedCollection(key, protectedValues[key]);
      }
      for (const order of Array.isArray(protectedValues.orders) ? protectedValues.orders : []) this.writeNormalizedOrder(order);
      for (const grn of Array.isArray(protectedValues.grns) ? protectedValues.grns : []) this.writeNormalizedGrn(grn);
    });
    persist(Object.entries(protectedValues));
  }

  setValue(key, value) {
    if (!/^[a-z_]+$/.test(key)) throw new Error('Invalid data-store key.');
    this.db.prepare(`
      INSERT INTO kv_store(key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), isoTimestamp());
  }

  setValueAndSync(key, value) {
    if (!/^[a-z_]+$/.test(key)) throw new Error('Invalid data-store key.');
    const protectedValue = (key === 'users' || key === 'employees') && Array.isArray(value) ? value.map(protectPin) : value;
    this.db.transaction(() => {
      this.setValue(key, protectedValue);
      this.syncNormalizedCollection(key, protectedValue);
    })();
  }

  getStoredValue(key, fallback) {
    const row = this.db.prepare('SELECT value_json FROM kv_store WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value_json); } catch { return fallback; }
  }

  getDeliveryMethods() {
    const methods = this.getStoredValue('delivery_methods', DEFAULT_DELIVERY_METHODS);
    const source = Array.isArray(methods) && methods.length ? methods : DEFAULT_DELIVERY_METHODS;
    return source.map((method, index) => ({
      id: String(method?.id || ''),
      name: String(method?.name || '').trim(),
      icon: String(method?.icon || '🚚').trim() || '🚚',
      commissionRate: Number(method?.commissionRate || 0),
      enabled: method?.enabled !== false,
      displayOrder: Number(method?.displayOrder || index + 1),
      system: method?.id === 'own_fleet' || method?.id === 'foodpanda',
    })).filter((method) => method.id && method.name);
  }

  resolveAuthenticatedUser(candidate) {
    const id = String(candidate?.id || '');
    const sessionToken = String(candidate?.sessionToken || '');
    const session = this.sessions.get(sessionToken);
    if (!id || !session || session.userId !== id || session.expiresAt <= Date.now()) {
      if (sessionToken) this.sessions.delete(sessionToken);
      throw new Error('Your terminal session is invalid or has expired. Please sign in again.');
    }
    const users = this.getStoredValue('users', []);
    const matched = (Array.isArray(users) ? users : []).find((entry) => entry?.id === id);
    if (!matched || matched.active === false) throw new Error('The staff account is unavailable or inactive.');
    return { id: matched.id, name: matched.name, role: matched.role, branchId: matched.branchId, email: matched.email || '' };
  }

  requirePermission(candidate, permission) {
    const user = this.resolveAuthenticatedUser(candidate);
    if (user.role === 'super_admin') return user;
    const rolePermissions = this.getStoredValue('role_permissions', {});
    const customRoles = this.getStoredValue('custom_roles', []);
    const customRole = Array.isArray(customRoles) && customRoles.find((role) => role?.code === user.role || role?.id === user.role);
    const permissions = customRole?.permissions || rolePermissions?.[user.role];
    if (!permissions?.[permission]) throw new Error('You do not have permission to perform this action.');
    return user;
  }

  listNormalizedVendors() {
    return this.db.prepare('SELECT payload_json FROM vendors WHERE active = 1 ORDER BY name COLLATE NOCASE').all().map((row) => JSON.parse(row.payload_json));
  }

  listNormalizedPurchaseOrders(branchId) {
    return this.db.prepare('SELECT payload_json FROM purchase_orders WHERE branch_id = ? ORDER BY created_at DESC').all(branchId).map((row) => JSON.parse(row.payload_json));
  }

  manageSeating(input) {
    const action = String(input?.action || '');
    const supportedActions = ['create-floor', 'update-floor', 'delete-floor', 'create-table', 'update-table', 'delete-table', 'set-table-status', 'transfer-table'];
    if (!input?.user?.id || !supportedActions.includes(action)) throw new Error('A valid seating action and authenticated user are required.');
    const user = this.requirePermission(input.user, 'canManageTables');
    return this.db.transaction(() => {
      const now = isoTimestamp();
      const floors = this.getStoredValue('floors', []);
      const tables = this.getStoredValue('tables', []);
      const orders = this.getStoredValue('orders', []);
      if (!Array.isArray(floors) || !Array.isArray(tables) || !Array.isArray(orders)) throw new Error('Seating data is unavailable.');
      const branchFloors = floors.filter((floor) => floor?.branchId === user.branchId);
      let floor;
      let table;
      let changedTables = [];
      let updatedOrder = null;

      if (action.endsWith('floor')) {
        const source = input?.floor || {};
        const id = action === 'create-floor' ? `flr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.floorId || '');
        const index = floors.findIndex((entry) => entry?.id === id && entry?.branchId === user.branchId);
        const existing = index >= 0 ? floors[index] : null;
        if (action !== 'create-floor' && !existing) throw new Error('Floor section not found.');
        const name = String(source.name ?? existing?.name ?? '').trim();
        if (!name || name.length > 80) throw new Error('Floor section name is required and must be 80 characters or fewer.');
        const duplicate = branchFloors.find((entry) => entry?.id !== id && String(entry?.name || '').trim().toLowerCase() === name.toLowerCase());
        if (duplicate) throw new Error('A floor section with this name already exists.');
        if (action === 'delete-floor') {
          if (branchFloors.length <= 1) throw new Error('At least one floor section is required for this store.');
          if (tables.some((entry) => entry?.floorId === id && entry?.branchId === user.branchId)) throw new Error('Move or remove all tables from this floor before deleting it.');
          floors.splice(index, 1);
          floor = existing;
        } else {
          const displayOrder = Number(source.displayOrder ?? existing?.displayOrder ?? branchFloors.length + 1);
          if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 100000) throw new Error('Floor display order is invalid.');
          const layout = normalizeFloorLayout(source.layout, existing?.layout);
          floor = { ...(existing || {}), id, branchId: user.branchId, name, displayOrder, layout };
          if (index >= 0) floors[index] = floor;
          else floors.push(floor);
        }
      } else if (action === 'transfer-table') {
        const sourceId = String(input?.sourceTableId || '');
        const targetId = String(input?.targetTableId || '');
        if (!sourceId || !targetId || sourceId === targetId) throw new Error('Select two different tables for transfer.');
        const sourceIndex = tables.findIndex((entry) => entry?.id === sourceId && entry?.branchId === user.branchId);
        const targetIndex = tables.findIndex((entry) => entry?.id === targetId && entry?.branchId === user.branchId);
        const sourceTable = sourceIndex >= 0 ? tables[sourceIndex] : null;
        const targetTable = targetIndex >= 0 ? tables[targetIndex] : null;
        if (!sourceTable || !targetTable) throw new Error('Transfer table not found.');
        if (sourceTable.status !== 'occupied' || !sourceTable.currentOrderId) throw new Error('Only an occupied table with an active order can be transferred.');
        if (targetTable.status !== 'available') throw new Error('The transfer target must be available.');
        const orderIndex = orders.findIndex((entry) => entry?.id === sourceTable.currentOrderId && entry?.branchId === user.branchId);
        if (orderIndex < 0) throw new Error('The table’s active order could not be found.');
        const sourceUpdated = { ...sourceTable, status: 'available', currentOrderId: undefined, currentGuests: undefined, occupiedSince: undefined };
        const targetUpdated = { ...targetTable, status: 'occupied', currentOrderId: sourceTable.currentOrderId, currentGuests: sourceTable.currentGuests, occupiedSince: sourceTable.occupiedSince || now };
        updatedOrder = { ...orders[orderIndex], tableId: targetUpdated.id, tableName: targetUpdated.name, updatedAt: now };
        tables[sourceIndex] = sourceUpdated;
        tables[targetIndex] = targetUpdated;
        changedTables = [sourceUpdated, targetUpdated];
        table = targetUpdated;
        orders[orderIndex] = updatedOrder;
      } else {
        const source = input?.table || {};
        const id = action === 'create-table' ? `tbl-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.tableId || '');
        const index = tables.findIndex((entry) => entry?.id === id && entry?.branchId === user.branchId);
        const existing = index >= 0 ? tables[index] : null;
        if (action !== 'create-table' && !existing) throw new Error('Dining table not found.');
        if (action === 'delete-table') {
          if (existing.status === 'occupied' || existing.status === 'reserved' || existing.currentOrderId) throw new Error('Occupied or reserved tables cannot be deleted.');
          tables.splice(index, 1);
          table = existing;
        } else {
          const requestedStatus = action === 'set-table-status' ? String(input?.status || '') : String(source.status ?? existing?.status ?? 'available');
          if (!['available', 'occupied', 'reserved', 'cleaning', 'out_of_service'].includes(requestedStatus)) throw new Error('Table status is invalid.');
          if (action === 'set-table-status' && requestedStatus === 'occupied') throw new Error('Use guest seating or an order to occupy a table.');
          if (existing?.currentOrderId && requestedStatus !== 'occupied') throw new Error('This table has an active order and cannot be released manually.');
          const floorId = String(source.floorId ?? existing?.floorId ?? '').trim();
          const assignedFloor = floors.find((entry) => entry?.id === floorId && entry?.branchId === user.branchId);
          if (!assignedFloor) throw new Error('A floor section in this store is required.');
          if (existing && existing.floorId !== floorId && ['occupied', 'reserved'].includes(existing.status)) throw new Error('Occupied or reserved tables cannot be moved to another floor.');
          const name = String(source.name ?? existing?.name ?? '').trim();
          if (!name || name.length > 80) throw new Error('Table name is required and must be 80 characters or fewer.');
          const duplicate = tables.find((entry) => entry?.id !== id && entry?.branchId === user.branchId && String(entry?.name || '').trim().toLowerCase() === name.toLowerCase());
          if (duplicate) throw new Error('A table with this name already exists in this store.');
          const capacity = Number(source.capacity ?? existing?.capacity ?? 0);
          if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) throw new Error('Table capacity must be a whole number between 1 and 100.');
          const currentGuests = source.currentGuests ?? existing?.currentGuests;
          if (currentGuests != null && (!Number.isInteger(Number(currentGuests)) || Number(currentGuests) < 1 || Number(currentGuests) > capacity)) throw new Error('Guest count must be a whole number within the table capacity.');
          const shape = String(source.shape ?? existing?.shape ?? 'square');
          if (!['square', 'round', 'rectangle', 'booth'].includes(shape)) throw new Error('Table shape is invalid.');
          const normalizePosition = (value, fallback, axis) => {
            if (value == null && fallback == null) return undefined;
            const position = Number(value ?? fallback);
            if (!Number.isFinite(position) || position < 0 || position > 100) throw new Error(`Table ${axis} position must be between 0 and 100.`);
            return Math.round(position * 100) / 100;
          };
          const posX = normalizePosition(source.posX, existing?.posX, 'horizontal');
          const posY = normalizePosition(source.posY, existing?.posY, 'vertical');
          const occupiedSince = source.occupiedSince ?? existing?.occupiedSince;
          if (requestedStatus === 'occupied' && (!currentGuests || !occupiedSince || Number.isNaN(new Date(String(occupiedSince)).getTime()))) throw new Error('Occupied tables require a guest count and seating time.');
          table = {
            ...(existing || {}), id, branchId: user.branchId, floorId, name, capacity, shape,
            posX, posY,
            status: requestedStatus,
            currentOrderId: requestedStatus === 'available' || requestedStatus === 'cleaning' || requestedStatus === 'out_of_service' ? undefined : (source.currentOrderId ?? existing?.currentOrderId),
            currentGuests: requestedStatus === 'occupied' ? Number(currentGuests) : undefined,
            occupiedSince: requestedStatus === 'occupied' ? String(occupiedSince) : undefined,
          };
          if (index >= 0) tables[index] = table;
          else tables.push(table);
          changedTables = [table];
        }
      }

      const isFloorAction = action.endsWith('floor');
      const entityType = isFloorAction ? 'floors' : 'tables';
      const eventAction = action.startsWith('create') ? 'insert' : action.startsWith('delete') ? 'delete' : 'update';
      const entities = isFloorAction ? [floor] : (action === 'delete-table' ? [table] : changedTables);
      const syncEvents = entities.map((entity, index) => ({ id: `sync-evt-${Date.now()}-${index}-${crypto.randomBytes(2).toString('hex')}`, entityType, entityId: entity.id, action: eventAction, payloadJson: JSON.stringify(eventAction === 'delete' ? { id: entity.id } : entity), createdAt: now, status: 'pending', syncAttemptCount: 0 }));
      if (updatedOrder) syncEvents.push({ id: `sync-evt-${Date.now()}-order-${crypto.randomBytes(2).toString('hex')}`, entityType: 'orders', entityId: updatedOrder.id, action: 'update', payloadJson: JSON.stringify(updatedOrder), createdAt: now, status: 'pending', syncAttemptCount: 0 });
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: `SEATING_${action.replace(/-/g, '_').toUpperCase()}`, details: action === 'transfer-table' ? `Transferred order from ${changedTables[0].name} to ${changedTables[1].name}` : `${action.replace(/-/g, ' ')}: ${(floor || table).name}` };
      const syncOutbox = [...syncEvents, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ floors, tables, ...(updatedOrder ? { orders } : {}), sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      this.syncNormalizedCollection('floors', floors);
      this.syncNormalizedCollection('tables', tables);
      if (updatedOrder) this.writeNormalizedOrder(updatedOrder, now);
      return { floor, table, floors, tables, syncOutbox, auditLogs };
    })();
  }

  manageCatalog(input) {
    const action = String(input?.action || '');
    const submittedUser = input?.user;
    const supportedActions = ['create-category', 'update-category', 'deactivate-category', 'create-product', 'update-product', 'deactivate-product'];
    if (!submittedUser?.id || !supportedActions.includes(action)) throw new Error('A valid catalog action and authenticated user are required.');
    const user = this.requirePermission(submittedUser, 'canManageMenu');
    return this.db.transaction(() => {
      const now = isoTimestamp();
      const categories = this.getStoredValue('categories', []);
      const products = this.getStoredValue('products', []);
      if (!Array.isArray(categories) || !Array.isArray(products)) throw new Error('Catalog data is unavailable.');
      const isCategoryAction = action.endsWith('category');
      const source = isCategoryAction ? (input?.category || {}) : (input?.product || {});
      let category;
      let product;
      let obsoleteImageUrl = null;

      if (isCategoryAction) {
        const id = action === 'create-category' ? `cat-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.categoryId || '');
        const index = categories.findIndex((entry) => entry?.id === id);
        const existing = index >= 0 ? categories[index] : null;
        if (action !== 'create-category' && !existing) throw new Error('Menu category not found.');
        const name = String(source.name ?? existing?.name ?? '').trim();
        if (!name || name.length > 100) throw new Error('Category name is required and must be 100 characters or fewer.');
        const duplicate = categories.find((entry) => entry?.id !== id && entry?.active !== false && String(entry?.name || '').trim().toLowerCase() === name.toLowerCase());
        if (duplicate) throw new Error('An active category with this name already exists.');
        if (action !== 'deactivate-category' && source.active === false) throw new Error('Use the category deactivation action to disable a category.');
        if (action === 'deactivate-category' && products.some((entry) => entry?.categoryId === id && entry?.isAvailable !== false)) {
          throw new Error('Disable or move this category’s available menu items before deactivating it.');
        }
        const slugSource = String(source.slug ?? existing?.slug ?? name).trim().toLowerCase();
        const slug = slugSource.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100) || `category-${Date.now()}`;
        const displayOrderValue = Number(source.displayOrder ?? existing?.displayOrder ?? categories.length + 1);
        if (!Number.isInteger(displayOrderValue) || displayOrderValue < 0 || displayOrderValue > 100000) throw new Error('Category display order is invalid.');
        category = {
          ...(existing || {}),
          id,
          name,
          slug,
          iconName: String(source.iconName ?? existing?.iconName ?? 'Utensils').trim().slice(0, 80) || 'Utensils',
          displayOrder: displayOrderValue,
          active: action === 'deactivate-category' ? false : source.active !== false,
        };
        if (index >= 0) categories[index] = category;
        else categories.push(category);
      } else {
        const id = action === 'create-product' ? `prod-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.productId || '');
        const index = products.findIndex((entry) => entry?.id === id);
        const existing = index >= 0 ? products[index] : null;
        if (action !== 'create-product' && !existing) throw new Error('Menu item not found.');
        const categoryId = String(source.categoryId ?? existing?.categoryId ?? '').trim();
        const assignedCategory = categories.find((entry) => entry?.id === categoryId && entry?.active !== false);
        if (!assignedCategory) throw new Error('An active menu category is required.');
        const name = String(source.name ?? existing?.name ?? '').trim();
        if (!name || name.length > 160) throw new Error('Menu item name is required and must be 160 characters or fewer.');
        const basePrice = Number(source.basePrice ?? existing?.basePrice);
        if (!Number.isFinite(basePrice) || basePrice < 0 || basePrice > 10000000) throw new Error('Menu item price is invalid.');
        const sku = String(source.sku ?? existing?.sku ?? '').trim().slice(0, 80);
        if (sku && products.some((entry) => entry?.id !== id && entry?.isAvailable !== false && String(entry?.sku || '').trim().toLowerCase() === sku.toLowerCase())) {
          throw new Error('An available menu item already uses this SKU.');
        }
        const prepTimeMinutes = Number(source.prepTimeMinutes ?? existing?.prepTimeMinutes ?? 0);
        if (!Number.isInteger(prepTimeMinutes) || prepTimeMinutes < 0 || prepTimeMinutes > 720) throw new Error('Preparation time must be between 0 and 720 minutes.');
        const kitchenStation = String(source.kitchenStation ?? existing?.kitchenStation ?? 'all');
        if (!['all', 'grill', 'pizza', 'drinks', 'packing'].includes(kitchenStation)) throw new Error('Kitchen station is invalid.');
        const requestedVariations = source.variations ?? existing?.variations ?? [];
        const requestedModifiers = source.modifiers ?? existing?.modifiers ?? [];
        if (!Array.isArray(requestedVariations) || !Array.isArray(requestedModifiers) || requestedVariations.length > 50 || requestedModifiers.length > 50) throw new Error('Menu variations or modifiers are invalid.');
        const variations = requestedVariations.map((entry, index) => {
          const variationName = String(entry?.name || '').trim(); const priceDifference = Number(entry?.priceDifference);
          if (!variationName || variationName.length > 100 || !Number.isFinite(priceDifference) || Math.abs(priceDifference) > 10000000) throw new Error('Each variation needs a valid name and price difference.');
          return { id: String(entry?.id || `var-${Date.now()}-${index}`), name: variationName, priceDifference };
        });
        const modifiers = requestedModifiers.map((entry, index) => {
          const modifierName = String(entry?.name || '').trim(); const price = Number(entry?.price);
          if (!modifierName || modifierName.length > 100 || !Number.isFinite(price) || price < 0 || price > 10000000) throw new Error('Each modifier needs a valid name and non-negative price.');
          const ingredientQty = entry?.ingredientQty == null ? null : Number(entry.ingredientQty);
          if (ingredientQty != null && (!Number.isFinite(ingredientQty) || ingredientQty <= 0)) throw new Error('Modifier ingredient quantity must be a positive number.');
          return { id: String(entry?.id || `mod-${Date.now()}-${index}`), name: modifierName, price, ...(entry?.inventoryIngredientId ? { inventoryIngredientId: String(entry.inventoryIngredientId) } : {}), ...(ingredientQty != null ? { ingredientQty } : {}) };
        });
        const requestedImageUrl = String(source.imageUrl ?? existing?.imageUrl ?? '').trim();
        let imageUrl = requestedImageUrl;
        if (requestedImageUrl.startsWith('data:')) imageUrl = storeProductImageData(requestedImageUrl);
        else if (requestedImageUrl && !productMediaFileName(requestedImageUrl) && requestedImageUrl !== String(existing?.imageUrl || '')) {
          throw new Error('External image URLs are not allowed. Upload a local product image for offline use.');
        }
        if (imageUrl.length > 512 && !imageUrl.startsWith('http')) throw new Error('Menu item image reference is invalid.');
        obsoleteImageUrl = existing?.imageUrl && existing.imageUrl !== imageUrl ? existing.imageUrl : null;
        product = {
          ...(existing || {}), id, categoryId, name, sku,
          barcode: String(source.barcode ?? existing?.barcode ?? '').trim().slice(0, 120),
          description: String(source.description ?? existing?.description ?? '').trim().slice(0, 2000),
          basePrice: +basePrice.toFixed(2), imageUrl, prepTimeMinutes, kitchenStation,
          featured: source.featured == null ? Boolean(existing?.featured) : Boolean(source.featured),
          isAvailable: action === 'deactivate-product' ? false : source.isAvailable == null ? existing?.isAvailable !== false : Boolean(source.isAvailable),
          variations, modifiers,
        };
        if (index >= 0) products[index] = product;
        else products.unshift(product);
      }

      const entityType = isCategoryAction ? 'categories' : 'products';
      const entity = category || product;
      const eventAction = action.startsWith('create') ? 'insert' : action.startsWith('deactivate') ? 'delete' : 'update';
      const actionLabel = action.replace(/-/g, '_').toUpperCase();
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType, entityId: entity.id, action: eventAction, payloadJson: JSON.stringify(eventAction === 'delete' ? { id: entity.id } : entity), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: `CATALOG_${actionLabel}`, details: `${action.startsWith('create') ? 'Created' : action.startsWith('update') ? 'Updated' : 'Deactivated'} ${isCategoryAction ? 'category' : 'menu item'}: ${entity.name}` };
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ categories, products, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      this.syncNormalizedCollection('categories', categories);
      this.syncNormalizedCollection('products', products);
      if (!isCategoryAction && obsoleteImageUrl) {
        try { deleteManagedProductImage(obsoleteImageUrl); } catch { /* Saving the catalog must not fail because stale media cleanup failed. */ }
      }
      return { category, product, categories, products, syncOutbox, auditLogs };
    })();
  }

  manageVendor(input) {
    const action = String(input?.action || '');
    const submittedUser = input?.user;
    if (!submittedUser?.id || !['create', 'update', 'deactivate'].includes(action)) throw new Error('A valid supplier action and authenticated user are required.');
    const user = this.requirePermission(submittedUser, 'canManageProcurement');
    return this.db.transaction(() => {
      const now = isoTimestamp();
      const source = input?.vendor || {};
      const id = action === 'create' ? `vnd-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.vendorId || '');
      const existingRow = action === 'create' ? null : this.db.prepare('SELECT payload_json FROM vendors WHERE id = ?').get(id);
      if (action !== 'create' && !existingRow) throw new Error('Supplier not found.');
      const existing = existingRow ? JSON.parse(existingRow.payload_json) : null;
      if (action === 'deactivate') {
        const openPo = this.db.prepare("SELECT 1 FROM purchase_orders WHERE vendor_id = ? AND status NOT IN ('received', 'cancelled') LIMIT 1").get(id);
        if (openPo) throw new Error('This supplier has an open purchase order and cannot be removed.');
      }
      const name = String(source.name ?? existing?.name ?? '').trim();
      if (!name) throw new Error('Supplier name is required.');
      if (action === 'create') {
        const duplicate = this.db.prepare('SELECT 1 FROM vendors WHERE lower(name) = lower(?) AND active = 1 LIMIT 1').get(name);
        if (duplicate) throw new Error('An active supplier with this name already exists.');
      }
      const vendor = {
        ...(existing || {}),
        id,
        name,
        companyName: String(source.companyName ?? existing?.companyName ?? name).trim() || name,
        contactPerson: String(source.contactPerson ?? existing?.contactPerson ?? '').trim(),
        phone: String(source.phone ?? existing?.phone ?? '').trim(),
        email: String(source.email ?? existing?.email ?? '').trim(),
        address: String(source.address ?? existing?.address ?? '').trim(),
        paymentTerms: String(source.paymentTerms ?? existing?.paymentTerms ?? 'Net 15').trim() || 'Net 15',
        outstandingBalance: Number(existing?.outstandingBalance || 0),
        active: action === 'deactivate' ? false : source.active !== false,
      };
      this.writeNormalizedVendor(vendor, now);
      const vendors = this.listNormalizedVendors();
      const eventAction = action === 'create' ? 'insert' : action === 'update' ? 'update' : 'delete';
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType: 'vendors', entityId: vendor.id, action: eventAction, payloadJson: JSON.stringify(action === 'deactivate' ? { id: vendor.id } : vendor), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: action === 'create' ? 'VENDOR_CREATED' : action === 'update' ? 'VENDOR_UPDATED' : 'VENDOR_DEACTIVATED', details: `${action === 'create' ? 'Created' : action === 'update' ? 'Updated' : 'Deactivated'} supplier: ${vendor.name}` };
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ vendors, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      return { vendor, vendors, syncOutbox, auditLogs };
    })();
  }

  savePurchaseOrder(input) {
    const submittedUser = input?.user;
    const draft = input?.purchaseOrder;
    if (!submittedUser?.id || !draft || typeof draft !== 'object') throw new Error('A valid purchase order and authenticated user are required.');
    const user = this.requirePermission(submittedUser, 'canManageProcurement');
    return this.db.transaction(() => {
      const now = isoTimestamp();
      const id = draft.id ? String(draft.id) : `po-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const existingRow = draft.id ? this.db.prepare('SELECT payload_json FROM purchase_orders WHERE id = ?').get(id) : null;
      if (draft.id && !existingRow) throw new Error('Purchase order not found.');
      const existing = existingRow ? JSON.parse(existingRow.payload_json) : null;
      if (existing && ['received', 'cancelled'].includes(existing.status)) throw new Error(`Purchase order ${existing.poNumber} can no longer be changed.`);
      const vendorId = String(draft.vendorId || existing?.vendorId || '');
      const vendorRow = this.db.prepare('SELECT payload_json FROM vendors WHERE id = ? AND active = 1').get(vendorId);
      if (!vendorRow) throw new Error('An active supplier is required.');
      const vendor = JSON.parse(vendorRow.payload_json);
      const requestedItems = Array.isArray(draft.items) ? draft.items : existing?.items;
      if (!Array.isArray(requestedItems) || requestedItems.length === 0) throw new Error('At least one purchase-order item is required.');
      const seenIngredients = new Set();
      const items = requestedItems.map((requested) => {
        const ingredientId = String(requested?.ingredientId || '');
        if (!ingredientId || seenIngredients.has(ingredientId)) throw new Error('Each ingredient can appear only once on a purchase order.');
        seenIngredients.add(ingredientId);
        const ingredientRow = this.db.prepare('SELECT payload_json FROM ingredients WHERE id = ?').get(ingredientId);
        if (!ingredientRow) throw new Error('A purchase-order ingredient no longer exists.');
        const ingredient = JSON.parse(ingredientRow.payload_json);
        const quantityOrdered = Number(requested.quantityOrdered);
        const unitCost = Number(requested.unitCost);
        const quantityReceived = Number(existing?.items?.find((item) => item.ingredientId === ingredientId)?.quantityReceived || requested.quantityReceived || 0);
        if (!Number.isFinite(quantityOrdered) || quantityOrdered <= 0 || !Number.isFinite(unitCost) || unitCost < 0 || quantityOrdered + 0.0001 < quantityReceived) throw new Error('Purchase-order quantities and costs are invalid.');
        return { ingredientId, ingredientName: ingredient.name, quantityOrdered, quantityReceived, unit: ingredient.unit, unitCost, totalCost: +(quantityOrdered * unitCost).toFixed(2) };
      });
      const requestedStatus = String(draft.status || existing?.status || 'ordered');
      if (!['draft', 'ordered', 'cancelled'].includes(requestedStatus)) throw new Error('Only draft, ordered, or cancelled purchase-order states may be saved directly.');
      if (requestedStatus === 'cancelled' && items.some((item) => item.quantityReceived > 0)) throw new Error('A partially received purchase order cannot be cancelled.');
      const count = this.db.prepare('SELECT COUNT(*) AS count FROM purchase_orders WHERE branch_id = ?').get(user.branchId).count;
      const purchaseOrder = { ...(existing || {}), id, poNumber: existing?.poNumber || `PO-${new Date().getFullYear()}-${String(Number(count) + 1).padStart(6, '0')}`, branchId: user.branchId, vendorId: vendor.id, vendorName: vendor.name, status: requestedStatus, items, totalAmount: +items.reduce((total, item) => total + item.totalCost, 0).toFixed(2), createdAt: existing?.createdAt || now, expectedDate: draft.expectedDate || existing?.expectedDate, notes: String(draft.notes ?? existing?.notes ?? '').trim() };
      this.writeNormalizedPurchaseOrder(purchaseOrder, now);
      const purchaseOrders = this.listNormalizedPurchaseOrders(user.branchId);
      const action = existing ? 'update' : 'insert';
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType: 'purchase_orders', entityId: id, action, payloadJson: JSON.stringify(purchaseOrder), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: existing ? 'PURCHASE_ORDER_UPDATED' : 'PURCHASE_ORDER_CREATED', details: `${existing ? 'Updated' : 'Created'} ${purchaseOrder.poNumber} for ${vendor.name} (${purchaseOrder.totalAmount.toFixed(2)})` };
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ purchase_orders: purchaseOrders, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      return { purchaseOrder, purchaseOrders, syncOutbox, auditLogs };
    })();
  }

  manageHeldPosOrder(input) {
    const action = String(input?.action || '');
    if (!input?.user?.id || !['save', 'remove'].includes(action)) throw new Error('A valid held-ticket action and authenticated user are required.');
    const user = this.requirePermission(input.user, 'canAccessPos');
    const stored = this.getStoredValue('held_orders', []);
    const heldOrders = Array.isArray(stored) ? stored.filter((entry) => entry && typeof entry === 'object') : [];

    if (action === 'remove') {
      const heldOrderId = String(input?.heldOrderId || '');
      const existing = heldOrders.find((entry) => entry.id === heldOrderId && entry.branchId === user.branchId);
      if (!existing) throw new Error('The parked ticket was not found for this store.');
      const nextHeldOrders = heldOrders.filter((entry) => entry.id !== heldOrderId);
      this.setValue('held_orders', nextHeldOrders);
      return { heldOrders: nextHeldOrders.filter((entry) => entry.branchId === user.branchId) };
    }

    const source = input?.heldOrder;
    if (!source || typeof source !== 'object') throw new Error('Parked ticket details are required.');
    const orderType = String(source.orderType || '');
    const items = Array.isArray(source.items) ? source.items : [];
    const name = String(source.name || '').trim();
    const total = Number(source.total);
    const discountMode = String(source.discountMode || '');
    const discountValue = Number(source.discountValue || 0);
    if (!['dine_in', 'takeaway', 'delivery'].includes(orderType) || !name || name.length > 140 || items.length < 1 || items.length > 500 || !Number.isFinite(total) || total < 0 || !['percent', 'amount'].includes(discountMode) || !Number.isFinite(discountValue) || discountValue < 0) {
      throw new Error('Parked ticket details are invalid.');
    }
    const text = (value, limit) => String(value || '').trim().slice(0, limit);
    const deliveryChannel = text(source.deliveryChannel, 40);
    if (deliveryChannel && !this.getDeliveryMethods().some((method) => method.id === deliveryChannel && method.enabled)) throw new Error('Parked ticket delivery channel is not enabled in settings.');
    const parkedTicket = {
      id: `hold-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      branchId: user.branchId,
      name,
      items: JSON.parse(JSON.stringify(items)),
      orderType,
      ...(text(source.tableId, 120) ? { tableId: text(source.tableId, 120) } : {}),
      ...(text(source.customerName, 140) ? { customerName: text(source.customerName, 140) } : {}),
      ...(text(source.customerPhone, 40) ? { customerPhone: text(source.customerPhone, 40) } : {}),
      ...(text(source.deliveryAddress, 500) ? { deliveryAddress: text(source.deliveryAddress, 500) } : {}),
      ...(deliveryChannel ? { deliveryChannel } : {}),
      ...(text(source.deliveryNotes, 500) ? { deliveryNotes: text(source.deliveryNotes, 500) } : {}),
      ...(text(source.riderId, 120) ? { riderId: text(source.riderId, 120) } : {}),
      ...(text(source.riderName, 140) ? { riderName: text(source.riderName, 140) } : {}),
      discountMode,
      discountValue: +discountValue.toFixed(2),
      time: text(source.time, 40) || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      total: +total.toFixed(2),
      createdAt: isoTimestamp(),
    };
    const nextHeldOrders = [parkedTicket, ...heldOrders];
    this.setValue('held_orders', nextHeldOrders);
    return { heldOrder: parkedTicket, heldOrders: nextHeldOrders.filter((entry) => entry.branchId === user.branchId) };
  }

  commitPosOrder(input) {
    const draft = input?.order;
    const submittedCashier = input?.cashier;
    const state = input?.state;
    if (!draft || typeof draft !== 'object' || !submittedCashier?.id || !state || typeof state !== 'object') {
      throw new Error('Invalid sale request.');
    }
    const cashier = this.requirePermission(submittedCashier, 'canAccessPos');
    const orderType = String(draft.orderType || '');
    if (!['dine_in', 'takeaway', 'delivery'].includes(orderType)) throw new Error('Sale order type is invalid.');
    if (String(draft.branchId || '') !== cashier.branchId) throw new Error('You cannot create a sale for a different store.');
    if (!Array.isArray(draft.items) || draft.items.length === 0) throw new Error('A sale must contain at least one item.');
    const branches = this.getStoredValue('branches', []);
    const branch = Array.isArray(branches) && branches.find((entry) => entry?.id === cashier.branchId);
    if (!branch) throw new Error('The active store profile could not be found.');
    const products = this.getStoredValue('products', []);
    const masterProducts = Array.isArray(products) ? products : [];
    const items = draft.items.map((item) => {
      const product = masterProducts.find((entry) => entry?.id === item?.productId && entry?.isAvailable !== false);
      const quantity = Number(item?.quantity);
      if (!item?.id || !product || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) {
        throw new Error('A sale contains an unavailable product or invalid quantity.');
      }
      const variation = item.variationId ? (product.variations || []).find((entry) => entry?.id === item.variationId) : null;
      if (item.variationId && !variation) throw new Error(`The selected variation for ${product.name} is no longer available.`);
      const selectedModifierIds = new Set();
      const selectedModifiers = [];
      for (const selected of Array.isArray(item.selectedModifiers) ? item.selectedModifiers : []) {
        const modifierId = String(selected?.modifierId || '');
        const modifier = (product.modifiers || []).find((entry) => entry?.id === modifierId);
        if (!modifier || selectedModifierIds.has(modifierId)) throw new Error(`A selected option for ${product.name} is invalid.`);
        selectedModifierIds.add(modifierId);
        selectedModifiers.push({ modifierId: modifier.id, name: modifier.name, price: Number(modifier.price) || 0 });
      }
      const itemNotes = String(item.itemNotes || '').trim();
      if (itemNotes.length > 500) throw new Error('Kitchen notes cannot exceed 500 characters.');
      const unitPrice = +(Number(product.basePrice || 0) + Number(variation?.priceDifference || 0) + selectedModifiers.reduce((total, modifier) => total + modifier.price, 0)).toFixed(2);
      return {
        id: String(item.id), productId: product.id, productName: product.name, sku: product.sku || '',
        variationId: variation?.id, variationName: variation?.name, unitPrice, quantity, selectedModifiers,
        ...(itemNotes ? { itemNotes } : {}), kitchenStatus: 'pending', kitchenStation: product.kitchenStation,
        totalPrice: +(unitPrice * quantity).toFixed(2),
      };
    });
    const customerName = String(draft.customerName || '').trim();
    const customerPhone = String(draft.customerPhone || '').trim();
    const customerPhoneKey = customerPhone.replace(/[^0-9]/g, '');
    const deliveryAddress = String(draft.deliveryAddress || '').trim();
    const orderNotes = String(draft.orderNotes || '').trim();
    let riderName = String(draft.riderName || '').trim();
    const riderId = String(draft.riderId || '').trim();
    const deliveryChannel = String(draft.deliveryChannel || 'own_fleet');
    if (customerName.length > 140 || customerPhone.length > 40 || deliveryAddress.length > 500 || orderNotes.length > 500 || riderName.length > 140) throw new Error('Customer or order details are too long.');
    if (customerPhone && (customerPhoneKey.length < 7 || customerPhoneKey.length > 20)) throw new Error('Customer phone number is invalid.');
    // Customer contact and address data are optional for every POS order type.
    // When present, the phone is still validated above and may update CRM.
    const deliveryMethod = orderType === 'delivery'
      ? this.getDeliveryMethods().find((method) => method.id === deliveryChannel && method.enabled)
      : null;
    if (orderType === 'delivery' && !deliveryMethod) throw new Error('Choose an enabled delivery method in CRM & Delivery settings.');
    if (riderId) {
      const employees = this.getStoredValue('employees', []);
      const rider = Array.isArray(employees) && employees.find((employee) => employee?.id === riderId && employee?.branchId === cashier.branchId && employee?.active !== false && employee?.role === 'delivery_rider');
      if (!rider) throw new Error('The selected delivery rider is unavailable.');
      riderName = rider.name;
    }
    const tables = this.getStoredValue('tables', []);
    if (orderType === 'dine_in') {
      const table = Array.isArray(tables) && tables.find((entry) => entry?.id === draft.tableId && entry?.branchId === cashier.branchId);
      if (!table) throw new Error('Choose a valid table for this dine-in order.');
      if (table.status !== 'available') throw new Error(`Table ${table.name} is currently ${table.status.replace(/_/g, ' ')}.`);
    }
    const subtotal = +items.reduce((total, item) => total + item.totalPrice, 0).toFixed(2);
    const requestedDiscount = Number(draft.orderDiscountAmount || 0);
    if (!Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > subtotal) throw new Error('Sale discount is invalid.');
    if (requestedDiscount > 0) this.requirePermission(submittedCashier, 'canApplyDiscounts');
    const discountAmount = +requestedDiscount.toFixed(2);
    const taxableAmount = +(subtotal - discountAmount).toFixed(2);
    const taxRate = Number(branch.taxRate || 0);
    const taxAmount = branch.taxEnabled === false ? 0 : branch.taxInclusive
      ? +(taxableAmount - taxableAmount / (1 + taxRate / 100)).toFixed(2)
      : +((taxableAmount * taxRate) / 100).toFixed(2);
    const serviceChargeAmount = orderType === 'dine_in' ? +((taxableAmount * Number(branch.serviceChargeRate || 0)) / 100).toFixed(2) : 0;
    const deliveryChargeAmount = orderType === 'delivery' ? +(Number(branch.deliveryCharge || 0)).toFixed(2) : 0;
    const grandTotal = +(taxableAmount + (branch.taxInclusive ? 0 : taxAmount) + serviceChargeAmount + deliveryChargeAmount).toFixed(2);
    if (Math.abs(Number(draft.grandTotal) - grandTotal) > 0.01) throw new Error('The ticket total changed. Review the order and payment before completing the sale.');

    const commit = this.db.transaction(() => {
      const existingOrders = Array.isArray(state.orders) ? state.orders : [];
      const nextValue = this.db.prepare('SELECT next_value AS nextValue FROM invoice_sequence WHERE id = 1').get().nextValue;
      this.db.prepare('UPDATE invoice_sequence SET next_value = ? WHERE id = 1').run(nextValue + 1);
      const now = isoTimestamp();
      const finalOrder = {
        ...draft,
        id: `ord-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        invoiceNumber: `INV-${new Date().getFullYear()}-${String(nextValue).padStart(6, '0')}`,
        branchId: cashier.branchId,
        orderType,
        status: 'confirmed',
        ...(orderType === 'dine_in' ? { tableId: String(draft.tableId), tableName: (Array.isArray(tables) ? tables : []).find((table) => table?.id === draft.tableId)?.name } : { tableId: undefined, tableName: undefined }),
        ...(customerName ? { customerName } : { customerName: undefined }),
        ...(customerPhone ? { customerPhone } : { customerPhone: undefined }),
        ...(orderType === 'delivery' ? { deliveryAddress, deliveryChannel, riderId: riderId || undefined, riderName: riderName || undefined, orderNotes: orderNotes || undefined } : { deliveryAddress: undefined, deliveryChannel: undefined, riderId: undefined, riderName: undefined, orderNotes: undefined }),
        items,
        subtotal,
        itemDiscounts: 0,
        orderDiscountAmount: discountAmount,
        orderDiscountPercent: subtotal > 0 ? +((discountAmount / subtotal) * 100).toFixed(4) : 0,
        taxAmount,
        serviceChargeAmount,
        deliveryChargeAmount,
        deliveryCommissionRate: deliveryMethod ? +Number(deliveryMethod.commissionRate || 0).toFixed(4) : 0,
        deliveryCommissionAmount: deliveryMethod ? +((grandTotal * Number(deliveryMethod.commissionRate || 0)) / 100).toFixed(2) : 0,
        grandTotal,
        cashierId: cashier.id,
        cashierName: cashier.name,
        createdAt: now,
        updatedAt: now,
      };
      const paymentLines = this.getOrderPaymentLines(finalOrder);
      const configuredMethods = Array.isArray(state.paymentMethods) ? state.paymentMethods : [];
      const configuredById = new Map(configuredMethods.map((method) => [method.id, method]));
      if (paymentLines.length) {
        const paidTotal = paymentLines.reduce((total, payment) => total + Number(payment.amount || 0), 0);
        if (Math.abs(paidTotal - grandTotal) > 0.01) throw new Error('Recorded payments must equal the sale total.');
        for (const payment of paymentLines) {
          const config = configuredById.get(payment.method);
          if (!config?.enabled) throw new Error(`Payment method ${payment.method} is not enabled.`);
          if (config.requiresReference && !String(payment.reference || '').trim()) throw new Error(`${config.name} payment reference is required.`);
        }
      } else if (Number(finalOrder.amountPaid) > 0) {
        throw new Error('A paid sale must include a payment method.');
      }
      if (finalOrder.paymentMethod === 'cash' && Number(finalOrder.amountPaid) + 0.01 < grandTotal) {
        throw new Error('Cash received cannot be less than the sale total.');
      }

      // Ensure every movement and payment below references a normalized master record.
      this.syncNormalizedMasterData({ ...state, cash_session: state.cashSession });

      let updatedTables = Array.isArray(state.tables) ? state.tables.map((table) => ({ ...table })) : [];
      let ingredients = Array.isArray(state.ingredients) ? state.ingredients.map((ingredient) => ({ ...ingredient })) : [];
      let customers = Array.isArray(state.customers) ? state.customers.map((customer) => ({ ...customer })) : [];
      let cashSession = state.cashSession ? { ...state.cashSession } : null;
      const recipes = Array.isArray(state.recipes) ? state.recipes : [];
      const products = Array.isArray(state.products) ? state.products : [];

      if (finalOrder.orderType === 'dine_in' && finalOrder.tableId) {
        updatedTables = updatedTables.map((table) => table.id === finalOrder.tableId ? {
          ...table, status: 'occupied', currentOrderId: finalOrder.id, currentGuests: table.currentGuests || 2, occupiedSince: now,
        } : table);
      }

      // Insert the order before inventory movements so their foreign key is valid.
      this.writeNormalizedOrder(finalOrder);

      const deductions = {};
      for (const item of finalOrder.items) {
        const recipe = recipes.find((entry) => entry.productId === item.productId);
        for (const recipeItem of recipe?.items || []) {
          deductions[recipeItem.ingredientId] = (deductions[recipeItem.ingredientId] || 0) + Number(recipeItem.quantity || 0) * Number(item.quantity);
        }
        const product = products.find((entry) => entry.id === item.productId);
        for (const selectedModifier of item.selectedModifiers || []) {
          const modifier = product?.modifiers?.find((entry) => entry.id === selectedModifier.modifierId);
          if (modifier?.inventoryIngredientId && modifier.ingredientQty) {
            deductions[modifier.inventoryIngredientId] = (deductions[modifier.inventoryIngredientId] || 0) + Number(modifier.ingredientQty) * Number(item.quantity);
          }
        }
      }
      ingredients = ingredients.map((ingredient) => {
        const requested = Number(deductions[ingredient.id] || 0);
        if (!requested) return ingredient;
        const current = Number(ingredient.currentStock) || 0;
        const next = Math.max(0, +(current - requested).toFixed(2));
        const actualDeduction = +(current - next).toFixed(2);
        this.db.prepare('INSERT INTO inventory_movements(id, ingredient_id, order_id, movement_type, quantity_delta, created_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(`inv-${finalOrder.id}-${ingredient.id}`, ingredient.id, finalOrder.id, 'sale_deduction', -actualDeduction, now, finalOrder.invoiceNumber);
        return { ...ingredient, currentStock: next };
      });

      if (finalOrder.customerName && customerPhoneKey) {
        let customer = customers.find((entry) => String(entry?.phone || '').replace(/[^0-9]/g, '') === customerPhoneKey);
        if (customer) {
          customer.loyaltyPoints = Number(customer.loyaltyPoints || 0) + Math.floor(grandTotal);
          customer.totalOrders = Number(customer.totalOrders || 0) + 1;
          customer.totalSpent = +(Number(customer.totalSpent || 0) + grandTotal).toFixed(2);
          customer.lastOrderDate = now;
        } else {
          customer = {
            id: `cust-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            name: finalOrder.customerName,
            phone: finalOrder.customerPhone || 'walk-in',
            primaryAddress: finalOrder.deliveryAddress,
            tags: [finalOrder.orderType === 'delivery' ? 'Delivery' : 'Regular'],
            loyaltyPoints: Math.floor(grandTotal), totalOrders: 1, totalSpent: grandTotal, lastOrderDate: now, createdAt: now,
          };
          customers.push(customer);
        }
        if (customer) finalOrder.customerId = customer.id;
      }

      if (cashSession && Number(finalOrder.amountPaid) > 0) {
        for (const payment of paymentLines) {
          const amount = Number(payment.amount);
          const settlementGroup = payment.method === 'cash' ? 'cash' : payment.method === 'card' ? 'card' : 'alternate';
          if (settlementGroup === 'cash') {
            cashSession.cashSales = +(Number(cashSession.cashSales || 0) + amount).toFixed(2);
            cashSession.expectedCash = +(Number(cashSession.expectedCash || 0) + amount).toFixed(2);
          } else if (settlementGroup === 'card') {
            cashSession.cardSales = +(Number(cashSession.cardSales || 0) + amount).toFixed(2);
          } else {
            cashSession.walletSales = +(Number(cashSession.walletSales || 0) + amount).toFixed(2);
          }
          this.db.prepare('INSERT INTO cash_drawer_entries(id, cash_session_id, order_id, settlement_group, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(`drawer-${finalOrder.id}-${payment.index}`, cashSession.id, finalOrder.id, settlementGroup, amount, now);
        }
      }

      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType: 'orders', entityId: finalOrder.id, action: 'insert', payloadJson: JSON.stringify(finalOrder), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: cashier.id, userName: cashier.name, branchId: cashier.branchId, action: 'ORDER_CREATED', details: `Order ${finalOrder.invoiceNumber} (${String(finalOrder.orderType).toUpperCase()}) created with total ${Number(finalOrder.grandTotal).toFixed(2)}` };
      const nextState = {
        ...state,
        orders: [finalOrder, ...existingOrders], tables: updatedTables, ingredients, customers, cashSession,
        syncOutbox: [syncEvent, ...(Array.isArray(state.syncOutbox) ? state.syncOutbox : [])],
        auditLogs: [auditLog, ...(Array.isArray(state.auditLogs) ? state.auditLogs : [])],
      };
      this.syncNormalizedMasterData({ ...state, tables: updatedTables, ingredients, customers, cash_session: cashSession });
      this.writeNormalizedOrder(finalOrder);
      for (const [key, value] of Object.entries({ orders: nextState.orders, tables: updatedTables, ingredients, customers, cash_session: cashSession, sync_outbox: nextState.syncOutbox, audit_logs: nextState.auditLogs })) {
        this.setValue(key, value);
      }
      return { order: finalOrder, tables: updatedTables, ingredients, customers, cashSession, syncOutbox: nextState.syncOutbox, auditLogs: nextState.auditLogs };
    });
    return commit();
  }

  updateOrderLifecycle(input) {
    const orderId = String(input?.orderId || '');
    const nextStatus = String(input?.status || '');
    const submittedUser = input?.user;
    const allowedStatuses = new Set(['draft', 'confirmed', 'preparing', 'cooking', 'ready', 'served', 'completed', 'out_for_delivery', 'delivered', 'cancelled', 'refunded']);
    if (!orderId || !allowedStatuses.has(nextStatus) || !submittedUser?.id) {
      throw new Error('Invalid order lifecycle request.');
    }
    const user = this.resolveAuthenticatedUser(submittedUser);

    return this.db.transaction(() => {
      const stored = this.db.prepare('SELECT payload_json FROM sales_orders WHERE id = ?').get(orderId);
      if (!stored) throw new Error('Order not found.');
      const currentOrder = JSON.parse(stored.payload_json);
      if (currentOrder.branchId !== user.branchId) throw new Error('This order belongs to a different store.');
      const kitchenStatuses = new Set(['preparing', 'cooking', 'ready']);
      if (kitchenStatuses.has(nextStatus) || nextStatus === 'completed') this.requirePermission(submittedUser, 'canManageInventory');
      else if (['cancelled', 'refunded'].includes(nextStatus)) this.requirePermission(submittedUser, 'canIssueRefunds');
      else this.requirePermission(submittedUser, 'canAccessPos');
      const terminalReversal = nextStatus === 'cancelled' || nextStatus === 'refunded';
      const reversalMode = String(input?.reversalMode || 'restore_stock');
      const reversalReason = String(input?.reversalReason || '').trim();
      if (terminalReversal && !['restore_stock', 'prepared_waste'].includes(reversalMode)) throw new Error('Order reversal handling is invalid.');
      if (terminalReversal && reversalMode === 'prepared_waste') {
        if (!['dine_in', 'takeaway'].includes(currentOrder.orderType)) throw new Error('Prepared-food loss can be recorded only for dine-in or takeaway orders.');
        if (!reversalReason || reversalReason.length > 500) throw new Error('A reason is required when prepared food is written off.');
      }
      if (terminalReversal && (currentOrder.status === 'cancelled' || currentOrder.status === 'refunded')) {
        throw new Error(`Order ${currentOrder.invoiceNumber} has already been reversed.`);
      }
      const permittedTransitions = {
        draft: ['confirmed', 'preparing', 'cancelled'],
        confirmed: ['preparing', 'cancelled'],
        preparing: ['cooking', 'ready', 'confirmed', 'cancelled'],
        cooking: ['ready', 'preparing', 'cancelled'],
        ready: ['served', 'completed', 'out_for_delivery', 'cooking', 'cancelled'],
        served: ['completed', 'cancelled'],
        completed: [],
        out_for_delivery: ['delivered', 'cancelled'],
        delivered: [],
        cancelled: [],
        refunded: [],
      };
      if (nextStatus !== 'refunded' && nextStatus !== currentOrder.status && !permittedTransitions[currentOrder.status]?.includes(nextStatus)) {
        throw new Error(`Order cannot move from ${currentOrder.status} to ${nextStatus}.`);
      }
      const now = isoTimestamp();
      const state = {
        orders: this.getStoredValue('orders', []),
        tables: this.getStoredValue('tables', []),
        ingredients: this.getStoredValue('ingredients', []),
        cashSession: this.getStoredValue('cash_session', null),
        syncOutbox: this.getStoredValue('sync_outbox', []),
        auditLogs: this.getStoredValue('audit_logs', []),
      };
      const patch = input.patch && typeof input.patch === 'object' ? input.patch : {};
      if (Object.prototype.hasOwnProperty.call(patch, 'deliveryOutcome')) {
        const deliveryOutcome = String(patch.deliveryOutcome || '');
        const lossAmount = Number(patch.deliveryLossAmount || 0);
        const lossReason = String(patch.deliveryLossReason || '').trim();
        const absorbedBy = String(patch.deliveryLossAbsorbedBy || 'restaurant');
        if (currentOrder.orderType !== 'delivery') throw new Error('Delivery outcomes can be recorded only for delivery orders.');
        if (!['delivered', 'returned', 'damaged', 'lost'].includes(deliveryOutcome)) throw new Error('Delivery outcome is invalid.');
        if (!Number.isFinite(lossAmount) || lossAmount < 0 || lossAmount > Number(currentOrder.grandTotal || 0) + 0.0001) throw new Error('Delivery loss cannot exceed the order total.');
        if (!['restaurant', 'rider', 'aggregator'].includes(absorbedBy)) throw new Error('Delivery loss responsibility is invalid.');
        if (deliveryOutcome !== 'delivered' && (!lossReason || lossReason.length > 500)) throw new Error('A delivery incident reason is required.');
      }
      const permittedPatch = {};
      for (const key of ['deliveryOutcome', 'deliveryLossAmount', 'deliveryLossReason', 'deliveryLossAbsorbedBy', 'orderNotes']) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        permittedPatch[key] = key === 'orderNotes' && patch[key]
          ? `${currentOrder.orderNotes || ''} ${patch[key]}`.trim()
          : patch[key];
      }
      const updatedOrder = {
        ...currentOrder,
        ...permittedPatch,
        status: nextStatus,
        updatedAt: now,
        completedAt: ['served', 'completed', 'delivered', 'cancelled', 'refunded'].includes(nextStatus) ? now : currentOrder.completedAt,
      };

      let updatedTable = null;
      if (updatedOrder.tableId && ['served', 'completed', 'refunded', 'cancelled'].includes(nextStatus)) {
        const row = this.db.prepare('SELECT payload_json FROM restaurant_tables WHERE id = ?').get(updatedOrder.tableId);
        if (row) {
          const currentTable = JSON.parse(row.payload_json);
          updatedTable = { ...currentTable, status: 'cleaning', currentOrderId: undefined, occupiedSince: undefined };
          this.db.prepare('UPDATE restaurant_tables SET status = ?, current_order_id = NULL, payload_json = ?, updated_at = ? WHERE id = ?')
            .run(updatedTable.status, JSON.stringify(updatedTable), now, updatedTable.id);
        }
      }

      const reversedMovements = [];
      const reversedCashEntries = [];
      if (terminalReversal) {
        const deductions = this.db.prepare("SELECT ingredient_id AS ingredientId, quantity_delta AS quantityDelta FROM inventory_movements WHERE order_id = ? AND movement_type = 'sale_deduction'").all(orderId);
        const alreadyHandled = this.db.prepare("SELECT 1 FROM inventory_movements WHERE order_id = ? AND movement_type IN ('sale_reversal', 'prepared_order_waste') LIMIT 1").get(orderId);
        if (!alreadyHandled && reversalMode === 'restore_stock') {
          for (const deduction of deductions) {
            const ingredientRow = this.db.prepare('SELECT payload_json FROM ingredients WHERE id = ?').get(deduction.ingredientId);
            if (!ingredientRow) continue;
            const ingredient = JSON.parse(ingredientRow.payload_json);
            const reversalQuantity = Math.abs(Number(deduction.quantityDelta));
            ingredient.currentStock = +(Number(ingredient.currentStock || 0) + reversalQuantity).toFixed(2);
            this.db.prepare('UPDATE ingredients SET current_stock = ?, payload_json = ?, updated_at = ? WHERE id = ?')
              .run(ingredient.currentStock, JSON.stringify(ingredient), now, ingredient.id);
            this.db.prepare('INSERT INTO inventory_movements(id, ingredient_id, order_id, movement_type, quantity_delta, created_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(`inv-reversal-${orderId}-${ingredient.id}`, ingredient.id, orderId, 'sale_reversal', reversalQuantity, now, `${nextStatus}: ${updatedOrder.invoiceNumber}`);
            reversedMovements.push({ ingredientId: ingredient.id, ingredient });
          }
        } else if (!alreadyHandled && reversalMode === 'prepared_waste') {
          let foodLossAmount = 0;
          for (const deduction of deductions) {
            const ingredientRow = this.db.prepare('SELECT payload_json FROM ingredients WHERE id = ?').get(deduction.ingredientId);
            if (!ingredientRow) continue;
            const ingredient = JSON.parse(ingredientRow.payload_json);
            const consumedQuantity = Math.abs(Number(deduction.quantityDelta));
            foodLossAmount += consumedQuantity * Number(ingredient.unitCost || 0);
            // Stock was already consumed at sale time. This zero-delta movement is the permanent loss trace.
            this.db.prepare('INSERT INTO inventory_movements(id, ingredient_id, order_id, movement_type, quantity_delta, created_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(`prepared-waste-${orderId}-${ingredient.id}`, ingredient.id, orderId, 'prepared_order_waste', 0, now, reversalReason);
          }
          updatedOrder.foodLossAmount = +foodLossAmount.toFixed(2);
          updatedOrder.foodLossReason = reversalReason;
          updatedOrder.foodLossType = nextStatus === 'refunded' ? 'customer_return' : 'cancelled_after_preparation';
        }

        const refunded = this.db.prepare("SELECT 1 FROM cash_drawer_entries WHERE order_id = ? AND settlement_group = 'refund' LIMIT 1").get(orderId);
        if (!refunded) {
          const entries = this.db.prepare("SELECT id AS entryId, cash_session_id AS cashSessionId, settlement_group AS settlementGroup, amount FROM cash_drawer_entries WHERE order_id = ? AND settlement_group IN ('cash', 'card', 'alternate')").all(orderId);
          for (const entry of entries) {
            this.db.prepare('INSERT INTO cash_drawer_entries(id, cash_session_id, order_id, settlement_group, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)')
              .run(`drawer-reversal-${entry.entryId}`, entry.cashSessionId, orderId, 'refund', -Number(entry.amount), now);
            if (!entry.cashSessionId) continue;
            const sessionRow = this.db.prepare('SELECT payload_json FROM cash_sessions WHERE id = ?').get(entry.cashSessionId);
            if (!sessionRow) continue;
            const session = JSON.parse(sessionRow.payload_json);
            if (entry.settlementGroup === 'cash') {
              session.cashSales = +(Number(session.cashSales || 0) - Number(entry.amount)).toFixed(2);
              session.expectedCash = +(Number(session.expectedCash || 0) - Number(entry.amount)).toFixed(2);
            } else if (entry.settlementGroup === 'card') {
              session.cardSales = +(Number(session.cardSales || 0) - Number(entry.amount)).toFixed(2);
            } else {
              session.walletSales = +(Number(session.walletSales || 0) - Number(entry.amount)).toFixed(2);
            }
            this.writeNormalizedCashSession(session, now);
            reversedCashEntries.push({ cashSessionId: session.id, session });
          }
        }
      }

      this.writeNormalizedOrder(updatedOrder);
      const stateOrders = Array.isArray(state.orders) ? state.orders : [];
      const orders = stateOrders.some((order) => order.id === orderId)
        ? stateOrders.map((order) => order.id === orderId ? updatedOrder : order)
        : [updatedOrder, ...stateOrders];
      const stateTables = Array.isArray(state.tables) ? state.tables : [];
      const tables = updatedTable && !stateTables.some((table) => table.id === updatedTable.id)
        ? [...stateTables, updatedTable]
        : stateTables.map((table) => updatedTable && table.id === updatedTable.id ? updatedTable : table);
      const ingredientById = new Map(reversedMovements.map((movement) => [movement.ingredientId, movement.ingredient]));
      const ingredients = (Array.isArray(state.ingredients) ? state.ingredients : []).map((ingredient) => ingredientById.get(ingredient.id) || ingredient);
      let cashSession = state.cashSession ? { ...state.cashSession } : null;
      for (const reversal of reversedCashEntries) if (cashSession?.id === reversal.cashSessionId) cashSession = reversal.session;
      const action = terminalReversal ? `ORDER_${nextStatus.toUpperCase()}` : 'ORDER_STATUS_CHANGED';
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action, details: `Order ${updatedOrder.invoiceNumber} status changed from ${currentOrder.status} to ${nextStatus}${reversalMode === 'prepared_waste' ? `; prepared-food loss ${Number(updatedOrder.foodLossAmount || 0).toFixed(2)}: ${reversalReason}` : ''}` };
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType: 'orders', entityId: orderId, action: 'update', payloadJson: JSON.stringify(updatedOrder), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLogs = [auditLog, ...(Array.isArray(state.auditLogs) ? state.auditLogs : [])];
      const syncOutbox = [syncEvent, ...(Array.isArray(state.syncOutbox) ? state.syncOutbox : [])];
      for (const [key, value] of Object.entries({ orders, tables, ingredients, cash_session: cashSession, audit_logs: auditLogs, sync_outbox: syncOutbox })) this.setValue(key, value);
      return { order: updatedOrder, tables, ingredients, cashSession, auditLogs, syncOutbox };
    })();
  }

  updateKitchenItemStatus(input) {
    const orderId = String(input?.orderId || '');
    const itemId = String(input?.itemId || '');
    const nextItemStatus = String(input?.status || '');
    const submittedUser = input?.user;
    const allowedItemStatuses = new Set(['pending', 'preparing', 'ready']);
    if (!orderId || !itemId || !allowedItemStatuses.has(nextItemStatus) || !submittedUser?.id) {
      throw new Error('Invalid kitchen item update request.');
    }
    const user = this.resolveAuthenticatedUser(submittedUser);
    this.requirePermission(submittedUser, 'canManageInventory');

    return this.db.transaction(() => {
      const stored = this.db.prepare('SELECT payload_json FROM sales_orders WHERE id = ?').get(orderId);
      if (!stored) throw new Error('Order not found.');
      const currentOrder = JSON.parse(stored.payload_json);
      if (currentOrder.branchId !== user.branchId) throw new Error('This order belongs to a different store.');
      if (['cancelled', 'refunded', 'completed', 'served', 'delivered', 'out_for_delivery'].includes(currentOrder.status)) {
        throw new Error('Kitchen items cannot be changed after the order has left the kitchen.');
      }
      const currentItems = Array.isArray(currentOrder.items) ? currentOrder.items : [];
      const item = currentItems.find((entry) => entry?.id === itemId);
      if (!item) throw new Error('Order item not found.');
      const previousItemStatus = String(item.kitchenStatus || 'pending');
      const allowedTransitions = {
        pending: ['preparing', 'ready'],
        preparing: ['pending', 'ready'],
        ready: ['pending', 'preparing'],
      };
      if (previousItemStatus !== nextItemStatus && !allowedTransitions[previousItemStatus]?.includes(nextItemStatus)) {
        throw new Error('Kitchen item status cannot be changed to that stage.');
      }

      const now = isoTimestamp();
      const items = currentItems.map((entry) => entry.id === itemId ? { ...entry, kitchenStatus: nextItemStatus } : entry);
      const allReady = items.length > 0 && items.every((entry) => entry.kitchenStatus === 'ready');
      const hasPreparingItem = items.some((entry) => entry.kitchenStatus === 'preparing');
      const orderStatus = allReady
        ? 'ready'
        : hasPreparingItem || currentOrder.status === 'ready'
          ? 'cooking'
          : ['draft', 'confirmed'].includes(currentOrder.status) ? 'preparing' : currentOrder.status;
      const updatedOrder = { ...currentOrder, items, status: orderStatus, updatedAt: now };
      this.writeNormalizedOrder(updatedOrder);

      const stateOrders = this.getStoredValue('orders', []);
      const orders = Array.isArray(stateOrders) && stateOrders.some((order) => order?.id === orderId)
        ? stateOrders.map((order) => order.id === orderId ? updatedOrder : order)
        : [updatedOrder, ...(Array.isArray(stateOrders) ? stateOrders : [])];
      const auditLog = {
        id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        timestamp: now,
        userId: user.id,
        userName: user.name,
        branchId: user.branchId,
        action: 'KDS_ITEM_UPDATED',
        details: `Order ${updatedOrder.invoiceNumber} item ${item.productName || itemId} changed from ${previousItemStatus} to ${nextItemStatus}`,
      };
      const syncEvent = {
        id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        entityType: 'orders', entityId: orderId, action: 'update', payloadJson: JSON.stringify(updatedOrder),
        createdAt: now, status: 'pending', syncAttemptCount: 0,
      };
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      for (const [key, value] of Object.entries({ orders, audit_logs: auditLogs, sync_outbox: syncOutbox })) this.setValue(key, value);
      return { order: updatedOrder, orders, auditLogs, syncOutbox };
    })();
  }

  postGoodsReceived(input) {
    const poId = String(input?.poId || '');
    const submittedUser = input?.user;
    const receivedItems = Array.isArray(input?.receivedItems) ? input.receivedItems : [];
    if (!poId || !submittedUser?.id || !receivedItems.length) throw new Error('Invalid goods receipt request.');
    const user = this.requirePermission(submittedUser, 'canManageProcurement');
    return this.db.transaction(() => {
      const storedPo = this.db.prepare('SELECT payload_json FROM purchase_orders WHERE id = ?').get(poId);
      if (!storedPo) throw new Error('Purchase order not found.');
      const po = JSON.parse(storedPo.payload_json);
      const purchaseOrders = this.listNormalizedPurchaseOrders(po.branchId);
      const poIndex = purchaseOrders.findIndex((po) => po.id === poId);
      if (poIndex < 0) throw new Error('Purchase order not found.');
      if (['received', 'cancelled'].includes(po.status)) throw new Error(`Purchase order ${po.poNumber} cannot receive more goods.`);
      let ingredients = this.db.prepare('SELECT payload_json FROM ingredients WHERE branch_id = ?').all(po.branchId).map((row) => JSON.parse(row.payload_json));
      let totalAmount = 0;
      const now = isoTimestamp();
      const grnItems = [];
      for (const received of receivedItems) {
        const quantity = Number(received.quantity);
        if (!received?.ingredientId || !Number.isFinite(quantity) || quantity <= 0) throw new Error('Received quantity must be greater than zero.');
        const poItem = po.items.find((item) => item.ingredientId === received.ingredientId);
        const ingredientIndex = ingredients.findIndex((ingredient) => ingredient.id === received.ingredientId);
        if (!poItem || ingredientIndex < 0) throw new Error('A received item is not on this purchase order.');
        const remaining = Number(poItem.quantityOrdered) - Number(poItem.quantityReceived || 0);
        if (quantity > remaining + 0.0001) throw new Error(`${poItem.ingredientName} exceeds the quantity remaining on the purchase order.`);
        const ingredient = ingredients[ingredientIndex];
        const unitCost = Number(poItem.unitCost ?? ingredient.unitCost) || 0;
        const totalCost = +(quantity * unitCost).toFixed(2);
        totalAmount += totalCost;
        poItem.quantityReceived = +(Number(poItem.quantityReceived || 0) + quantity).toFixed(2);
        ingredient.currentStock = +(Number(ingredient.currentStock || 0) + quantity).toFixed(2);
        ingredients[ingredientIndex] = ingredient;
        grnItems.push({ ingredientId: ingredient.id, ingredientName: ingredient.name, quantityReceived: quantity, unit: ingredient.unit, unitCost, totalCost });
      }
      po.status = po.items.every((item) => Number(item.quantityReceived || 0) >= Number(item.quantityOrdered)) ? 'received' : 'partially_received';
      purchaseOrders[poIndex] = po;
      const vendorRow = this.db.prepare('SELECT payload_json FROM vendors WHERE id = ?').get(po.vendorId);
      if (!vendorRow) throw new Error('Supplier for this purchase order was not found.');
      const vendor = JSON.parse(vendorRow.payload_json);
      vendor.outstandingBalance = +(Number(vendor.outstandingBalance || 0) + totalAmount).toFixed(2);
      this.writeNormalizedVendor(vendor, now);
      const vendors = this.listNormalizedVendors();
      const grn = {
        id: `grn-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        grnNumber: `GRN-${new Date().getFullYear()}-${String(this.getStoredValue('grns', []).length + 1).padStart(6, '0')}`,
        poId: po.id, poNumber: po.poNumber, vendorId: po.vendorId, vendorName: po.vendorName, branchId: po.branchId,
        items: grnItems, totalAmount: +totalAmount.toFixed(2), receivedAt: now, receivedBy: user.name,
        invoiceReference: String(input.invoiceReference || 'INV-DIRECT'), status: 'posted',
      };
      for (const item of grnItems) {
        const ingredient = ingredients.find((entry) => entry.id === item.ingredientId);
        this.db.prepare('UPDATE ingredients SET current_stock = ?, payload_json = ?, updated_at = ? WHERE id = ?')
          .run(ingredient.currentStock, JSON.stringify(ingredient), now, ingredient.id);
        this.db.prepare('INSERT INTO inventory_movements(id, ingredient_id, movement_type, quantity_delta, created_at, note) VALUES (?, ?, ?, ?, ?, ?)')
          .run(`grn-move-${grn.id}-${item.ingredientId}`, item.ingredientId, 'goods_receipt', item.quantityReceived, now, grn.grnNumber);
      }
      this.db.prepare('INSERT INTO goods_received_notes(id, grn_number, po_id, vendor_id, branch_id, total_amount, received_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(grn.id, grn.grnNumber, grn.poId, grn.vendorId, grn.branchId, grn.totalAmount, now, JSON.stringify(grn));
      for (const item of grnItems) this.db.prepare('INSERT INTO goods_received_items(grn_id, ingredient_id, quantity_received, unit_cost, total_cost, payload_json) VALUES (?, ?, ?, ?, ?, ?)')
        .run(grn.id, item.ingredientId, item.quantityReceived, item.unitCost, item.totalCost, JSON.stringify(item));
      this.writeNormalizedPurchaseOrder(po, now);
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType: 'grns', entityId: grn.id, action: 'insert', payloadJson: JSON.stringify(grn), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: 'GRN_POSTED', details: `Posted ${grn.grnNumber} for PO ${po.poNumber}. Stock replenished (${grn.totalAmount.toFixed(2)})` };
      const grns = [grn, ...(this.getStoredValue('grns', []))];
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ ingredients, purchase_orders: purchaseOrders, vendors, grns, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      return { grn, ingredients, purchaseOrders, vendors, grns, syncOutbox, auditLogs };
    })();
  }

  manageInventoryMaster(input) {
    const action = String(input?.action || '');
    const supportedActions = ['create-ingredient', 'update-ingredient', 'delete-ingredient', 'create-recipe', 'update-recipe', 'delete-recipe'];
    if (!input?.user?.id || !supportedActions.includes(action)) throw new Error('A valid inventory action and authenticated user are required.');
    const user = this.requirePermission(input.user, 'canManageInventory');
    return this.db.transaction(() => {
      const now = isoTimestamp();
      const ingredients = this.getStoredValue('ingredients', []);
      const recipes = this.getStoredValue('recipes', []);
      const products = this.getStoredValue('products', []);
      if (!Array.isArray(ingredients) || !Array.isArray(recipes) || !Array.isArray(products)) throw new Error('Inventory master data is unavailable.');
      const isIngredientAction = action.endsWith('ingredient');
      let ingredient;
      let recipe;

      if (isIngredientAction) {
        const source = input?.ingredient || {};
        const id = action === 'create-ingredient' ? `ing-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.ingredientId || '');
        const index = ingredients.findIndex((entry) => entry?.id === id && entry?.branchId === user.branchId);
        const existing = index >= 0 ? ingredients[index] : null;
        if (action !== 'create-ingredient' && !existing) throw new Error('Ingredient not found.');
        if (action === 'delete-ingredient') {
          if (recipes.some((entry) => Array.isArray(entry?.items) && entry.items.some((item) => item?.ingredientId === id))) throw new Error('Remove this ingredient from all recipes before deleting it.');
          ingredients.splice(index, 1);
          ingredient = existing;
        } else {
          const name = String(source.name ?? existing?.name ?? '').trim();
          const sku = String(source.sku ?? existing?.sku ?? '').trim().slice(0, 80);
          const category = String(source.category ?? existing?.category ?? '').trim();
          const unit = String(source.unit ?? existing?.unit ?? 'piece');
          const currentStock = Number(source.currentStock ?? existing?.currentStock ?? 0);
          const minThreshold = Number(source.minThreshold ?? existing?.minThreshold ?? 0);
          const unitCost = Number(source.unitCost ?? existing?.unitCost ?? 0);
          if (!name || name.length > 140 || !category || category.length > 80) throw new Error('Ingredient name and category are required.');
          if (!['kg', 'g', 'litre', 'ml', 'piece', 'box'].includes(unit)) throw new Error('Ingredient unit is invalid.');
          if (!Number.isFinite(currentStock) || currentStock < 0 || !Number.isFinite(minThreshold) || minThreshold < 0 || !Number.isFinite(unitCost) || unitCost < 0) throw new Error('Ingredient stock, threshold, and unit cost must be non-negative numbers.');
          if (existing && source.currentStock != null && Math.abs(currentStock - Number(existing.currentStock || 0)) > 0.000001) throw new Error('Use the stock adjustment control to change on-hand quantity.');
          if (sku && ingredients.some((entry) => entry?.id !== id && entry?.branchId === user.branchId && String(entry?.sku || '').trim().toLowerCase() === sku.toLowerCase())) throw new Error('An ingredient with this SKU already exists in this store.');
          ingredient = { ...(existing || {}), id, branchId: user.branchId, name, sku, category, unit, currentStock: +currentStock.toFixed(4), minThreshold: +minThreshold.toFixed(4), unitCost: +unitCost.toFixed(4) };
          if (index >= 0) ingredients[index] = ingredient;
          else ingredients.unshift(ingredient);
          for (let recipeIndex = 0; recipeIndex < recipes.length; recipeIndex += 1) {
            const currentRecipe = recipes[recipeIndex];
            if (!Array.isArray(currentRecipe?.items) || !currentRecipe.items.some((item) => item?.ingredientId === id)) continue;
            const items = currentRecipe.items.map((item) => item?.ingredientId === id ? { ...item, ingredientName: ingredient.name, unit: ingredient.unit, unitCost: ingredient.unitCost, totalCost: +(Number(item.quantity || 0) * ingredient.unitCost).toFixed(4) } : item);
            const rawCost = items.reduce((total, item) => total + Number(item.totalCost || 0), 0);
            const calculatedCost = +(rawCost * (1 + Number(currentRecipe.wastagePercent || 0) / 100)).toFixed(4);
            recipes[recipeIndex] = { ...currentRecipe, items, calculatedCost, foodCostPercent: Number(currentRecipe.sellingPrice || 0) > 0 ? +((calculatedCost / Number(currentRecipe.sellingPrice)) * 100).toFixed(2) : 0 };
          }
        }
      } else {
        const source = input?.recipe || {};
        const id = action === 'create-recipe' ? `rec-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.recipeId || '');
        const index = recipes.findIndex((entry) => entry?.id === id);
        const existing = index >= 0 ? recipes[index] : null;
        if (action !== 'create-recipe' && !existing) throw new Error('Recipe not found.');
        if (action === 'delete-recipe') {
          recipes.splice(index, 1);
          const productIndex = products.findIndex((entry) => entry?.id === existing.productId);
          if (productIndex >= 0) products[productIndex] = { ...products[productIndex], recipeId: undefined };
          recipe = existing;
        } else {
          const productId = String(source.productId ?? existing?.productId ?? '');
          const product = products.find((entry) => entry?.id === productId);
          if (!product) throw new Error('A valid menu item is required for this recipe.');
          if (recipes.some((entry) => entry?.id !== id && entry?.productId === productId)) throw new Error('This menu item already has a recipe.');
          const wastagePercent = Number(source.wastagePercent ?? existing?.wastagePercent ?? 0);
          if (!Number.isFinite(wastagePercent) || wastagePercent < 0 || wastagePercent > 100) throw new Error('Recipe wastage must be between 0% and 100%.');
          const requestedItems = source.items ?? existing?.items ?? [];
          if (!Array.isArray(requestedItems) || requestedItems.length === 0 || requestedItems.length > 100) throw new Error('A recipe needs between 1 and 100 ingredient lines.');
          const seenIngredients = new Set();
          const items = requestedItems.map((item) => {
            const ingredientId = String(item?.ingredientId || '');
            if (!ingredientId || seenIngredients.has(ingredientId)) throw new Error('Each ingredient may appear only once in a recipe.');
            seenIngredients.add(ingredientId);
            const recipeIngredient = ingredients.find((entry) => entry?.id === ingredientId && entry?.branchId === user.branchId);
            if (!recipeIngredient) throw new Error('A recipe ingredient no longer exists in this store.');
            const quantity = Number(item?.quantity);
            if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) throw new Error('Recipe ingredient quantity must be a positive number.');
            return { ingredientId, ingredientName: recipeIngredient.name, quantity: +quantity.toFixed(4), unit: recipeIngredient.unit, unitCost: recipeIngredient.unitCost, totalCost: +(quantity * recipeIngredient.unitCost).toFixed(4) };
          });
          const rawCost = items.reduce((total, item) => total + item.totalCost, 0);
          const calculatedCost = +(rawCost * (1 + wastagePercent / 100)).toFixed(4);
          recipe = { ...(existing || {}), id, productId: product.id, productName: product.name, items, wastagePercent: +wastagePercent.toFixed(2), calculatedCost, sellingPrice: Number(product.basePrice || 0), foodCostPercent: Number(product.basePrice || 0) > 0 ? +((calculatedCost / Number(product.basePrice)) * 100).toFixed(2) : 0 };
          if (existing?.productId && existing.productId !== product.id) {
            const oldProductIndex = products.findIndex((entry) => entry?.id === existing.productId);
            if (oldProductIndex >= 0) products[oldProductIndex] = { ...products[oldProductIndex], recipeId: undefined };
          }
          const productIndex = products.findIndex((entry) => entry?.id === product.id);
          products[productIndex] = { ...products[productIndex], recipeId: id };
          if (index >= 0) recipes[index] = recipe;
          else recipes.unshift(recipe);
        }
      }

      const entityType = isIngredientAction ? 'ingredients' : 'recipes';
      const entity = ingredient || recipe;
      const eventAction = action.startsWith('create') ? 'insert' : action.startsWith('delete') ? 'delete' : 'update';
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType, entityId: entity.id, action: eventAction, payloadJson: JSON.stringify(eventAction === 'delete' ? { id: entity.id } : entity), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: `INVENTORY_${action.replace(/-/g, '_').toUpperCase()}`, details: `${action.replace(/-/g, ' ')}: ${entity.name || entity.productName}` };
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ ingredients, recipes, products, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      this.syncNormalizedCollection('ingredients', ingredients);
      this.syncNormalizedCollection('recipes', recipes);
      this.syncNormalizedCollection('products', products);
      return { ingredient, recipe, ingredients, recipes, products, syncOutbox, auditLogs };
    })();
  }

  manageCrm(input) {
    const action = String(input?.action || '');
    const supportedActions = ['create-customer', 'update-customer', 'delete-customer', 'create-zone', 'update-zone', 'delete-zone', 'adjust-loyalty'];
    if (!input?.user?.id || !supportedActions.includes(action)) throw new Error('A valid CRM action and authenticated user are required.');
    const user = this.requirePermission(input.user, 'canAccessPos');
    return this.db.transaction(() => {
      const now = isoTimestamp();
      const customers = this.getStoredValue('customers', []);
      const deliveryZones = this.getStoredValue('delivery_zones', []);
      const loyaltyTransactions = this.getStoredValue('loyalty_tx', []);
      const orders = this.getStoredValue('orders', []);
      if (!Array.isArray(customers) || !Array.isArray(deliveryZones) || !Array.isArray(loyaltyTransactions) || !Array.isArray(orders)) throw new Error('CRM data is unavailable.');
      let customer;
      let zone;
      let loyaltyTransaction;

      if (action.endsWith('customer')) {
        const source = input?.customer || {};
        const id = action === 'create-customer' ? `cust-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.customerId || '');
        const index = customers.findIndex((entry) => entry?.id === id);
        const existing = index >= 0 ? customers[index] : null;
        if (action !== 'create-customer' && !existing) throw new Error('Customer not found.');
        if (action === 'delete-customer') {
          if (orders.some((entry) => entry?.customerId === id)) throw new Error('Customers with order history cannot be deleted. Update the profile instead.');
          customers.splice(index, 1);
          customer = existing;
        } else {
          const name = String(source.name ?? existing?.name ?? '').trim();
          const phone = String(source.phone ?? existing?.phone ?? '').trim();
          const phoneKey = phone.replace(/[^0-9]/g, '');
          const email = String(source.email ?? existing?.email ?? '').trim();
          const primaryAddress = String(source.primaryAddress ?? existing?.primaryAddress ?? '').trim();
          const notes = String(source.notes ?? existing?.notes ?? '').trim();
          const tags = source.tags ?? existing?.tags ?? ['Regular'];
          if (!name || name.length > 140 || phoneKey.length < 7 || phoneKey.length > 20) throw new Error('A customer name and valid phone number are required.');
          if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160)) throw new Error('Customer email is invalid.');
          if (!Array.isArray(tags) || tags.length === 0 || tags.length > 4 || tags.some((tag) => !['VIP', 'Regular', 'Corporate', 'Delivery'].includes(tag))) throw new Error('Customer tags are invalid.');
          if (customers.some((entry) => entry?.id !== id && String(entry?.phone || '').replace(/[^0-9]/g, '') === phoneKey)) throw new Error('A customer with this phone number already exists.');
          customer = { ...(existing || {}), id, name, phone, ...(email ? { email } : {}), ...(primaryAddress ? { primaryAddress } : {}), ...(notes ? { notes } : {}), tags: [...new Set(tags)], loyaltyPoints: Number(existing?.loyaltyPoints || 0), totalOrders: Number(existing?.totalOrders || 0), totalSpent: Number(existing?.totalSpent || 0), lastOrderDate: existing?.lastOrderDate, createdAt: existing?.createdAt || now };
          if (index >= 0) customers[index] = customer;
          else customers.unshift(customer);
        }
      } else if (action.endsWith('zone')) {
        const source = input?.zone || {};
        const id = action === 'create-zone' ? `zone-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.zoneId || '');
        const index = deliveryZones.findIndex((entry) => entry?.id === id && entry?.branchId === user.branchId);
        const existing = index >= 0 ? deliveryZones[index] : null;
        if (action !== 'create-zone' && !existing) throw new Error('Delivery zone not found.');
        if (action === 'delete-zone') {
          deliveryZones.splice(index, 1);
          zone = existing;
        } else {
          const name = String(source.name ?? existing?.name ?? '').trim();
          const minOrderAmount = Number(source.minOrderAmount ?? existing?.minOrderAmount ?? 0);
          const deliveryFee = Number(source.deliveryFee ?? existing?.deliveryFee ?? 0);
          const estimatedMinutes = Number(source.estimatedMinutes ?? existing?.estimatedMinutes ?? 30);
          if (!name || name.length > 100 || !Number.isFinite(minOrderAmount) || minOrderAmount < 0 || !Number.isFinite(deliveryFee) || deliveryFee < 0 || !Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 720) throw new Error('Delivery zone details are invalid.');
          if (deliveryZones.some((entry) => entry?.id !== id && entry?.branchId === user.branchId && String(entry?.name || '').trim().toLowerCase() === name.toLowerCase())) throw new Error('A delivery zone with this name already exists.');
          zone = { ...(existing || {}), id, branchId: user.branchId, name, minOrderAmount: +minOrderAmount.toFixed(2), deliveryFee: +deliveryFee.toFixed(2), estimatedMinutes, active: source.active == null ? existing?.active !== false : Boolean(source.active) };
          if (index >= 0) deliveryZones[index] = zone;
          else deliveryZones.unshift(zone);
        }
      } else {
        const customerId = String(input?.customerId || '');
        const points = Number(input?.points);
        const reason = String(input?.reason || '').trim();
        const customerIndex = customers.findIndex((entry) => entry?.id === customerId);
        if (customerIndex < 0) throw new Error('Customer not found.');
        if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1000000 || !reason || reason.length > 500) throw new Error('A non-zero whole-point adjustment and reason are required.');
        customer = { ...customers[customerIndex], loyaltyPoints: Number(customers[customerIndex].loyaltyPoints || 0) + points };
        if (customer.loyaltyPoints < 0) throw new Error('Loyalty points cannot fall below zero.');
        customers[customerIndex] = customer;
        loyaltyTransaction = { id: `loyalty-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, customerId, type: 'manual_adjustment', points, valueDiscount: 0, createdAt: now, reason };
        loyaltyTransactions.unshift(loyaltyTransaction);
        this.db.prepare('INSERT INTO loyalty_transactions(id, customer_id, order_id, transaction_type, points, value_discount, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(loyaltyTransaction.id, customerId, null, loyaltyTransaction.type, points, 0, now, JSON.stringify(loyaltyTransaction));
      }

      const entity = customer || zone || loyaltyTransaction;
      const entityType = action.includes('customer') ? 'customers' : action.includes('zone') ? 'delivery_zones' : 'loyalty_tx';
      const eventAction = action.startsWith('create') ? 'insert' : action.startsWith('delete') ? 'delete' : 'update';
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType, entityId: entity.id, action: action === 'adjust-loyalty' ? 'insert' : eventAction, payloadJson: JSON.stringify(eventAction === 'delete' ? { id: entity.id } : entity), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: `CRM_${action.replace(/-/g, '_').toUpperCase()}`, details: action === 'adjust-loyalty' ? `Adjusted loyalty for ${customer.name} by ${loyaltyTransaction.points} points: ${reason}` : `${action.replace(/-/g, ' ')}: ${(customer || zone).name}` };
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ customers, delivery_zones: deliveryZones, loyalty_tx: loyaltyTransactions, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      this.syncNormalizedCollection('customers', customers);
      this.syncNormalizedCollection('delivery_zones', deliveryZones);
      return { customer, zone, loyaltyTransaction, customers, deliveryZones, loyaltyTransactions, syncOutbox, auditLogs };
    })();
  }

  manageSecuritySettings(input) {
    const action = String(input?.action || '');
    const supportedActions = ['create-role', 'update-role', 'delete-role', 'create-user', 'update-user', 'delete-user'];
    if (!input?.user?.id || !supportedActions.includes(action)) throw new Error('A valid security-settings action and authenticated user are required.');
    const actor = this.requirePermission(input.user, 'canConfigureSettings');
    return this.db.transaction(() => {
      const now = isoTimestamp();
      const users = this.getStoredValue('users', []);
      const employees = this.getStoredValue('employees', []);
      const customRoles = this.getStoredValue('custom_roles', []);
      if (!Array.isArray(users) || !Array.isArray(employees) || !Array.isArray(customRoles)) throw new Error('Security settings are unavailable.');
      const baseRoles = new Set(['super_admin', 'branch_admin', 'manager', 'cashier', 'waiter', 'kitchen_staff', 'inventory_officer', 'accountant', 'delivery_rider']);
      const permissionKeys = ['canAccessPos', 'canApplyDiscounts', 'canIssueRefunds', 'canManageMenu', 'canManageTables', 'canManageInventory', 'canManageProcurement', 'canViewFinancialReports', 'canManageStaff', 'canConfigureSettings'];
      const actorPermissions = actor.role === 'super_admin' ? Object.fromEntries(permissionKeys.map((key) => [key, true])) : (customRoles.find((role) => role?.code === actor.role || role?.id === actor.role)?.permissions || this.getStoredValue('role_permissions', {})?.[actor.role] || {});
      const assertGrantablePermissions = (permissions) => {
        if (!permissions || typeof permissions !== 'object') throw new Error('A complete permissions set is required.');
        for (const key of permissionKeys) {
          if (typeof permissions[key] !== 'boolean') throw new Error('Role permissions are invalid.');
          if (actor.role !== 'super_admin' && permissions[key] && !actorPermissions[key]) throw new Error('You cannot grant a permission you do not have.');
        }
      };
      let role;
      let managedUser;

      if (action.endsWith('role')) {
        const source = input?.role || {};
        const id = action === 'create-role' ? `role-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.roleId || '');
        const index = customRoles.findIndex((entry) => entry?.id === id);
        const existing = index >= 0 ? customRoles[index] : null;
        if (action !== 'create-role' && !existing) throw new Error('Custom role not found.');
        if (action === 'delete-role') {
          if (baseRoles.has(existing.code)) throw new Error('System roles cannot be deleted.');
          if (users.some((entry) => entry?.role === existing.code) || employees.some((entry) => entry?.role === existing.code)) throw new Error('Reassign staff using this custom role before deleting it.');
          customRoles.splice(index, 1);
          role = existing;
        } else {
          const name = String(source.name ?? existing?.name ?? '').trim();
          let code = normalizeRoleCode(source.code ?? existing?.code ?? name);
          const description = String(source.description ?? existing?.description ?? '').trim();
          const color = String(source.color ?? existing?.color ?? '#2563eb').trim();
          const permissions = source.permissions ?? existing?.permissions;
          if (!name || name.length > 80 || !/^[a-z][a-z0-9_]{2,39}$/.test(code)) throw new Error('Role title must contain enough letters or numbers to create a valid internal code.');
          if (action === 'create-role' && baseRoles.has(code)) code = `custom_${code}`;
          if (existing && baseRoles.has(existing.code) && code !== existing.code) throw new Error('System role codes cannot be renamed.');
          if (!/^#[0-9a-fA-F]{6}$/.test(color) || description.length > 500) throw new Error('Role color or description is invalid.');
          if (customRoles.some((entry) => entry?.id !== id && entry?.code === code)) throw new Error('A custom role with this code already exists.');
          if (existing?.code !== code && (users.some((entry) => entry?.role === existing?.code) || employees.some((entry) => entry?.role === existing?.code))) throw new Error('Reassign staff before changing an in-use role code.');
          assertGrantablePermissions(permissions);
          role = { ...(existing || {}), id, name, code, description, color, permissions };
          if (index >= 0) customRoles[index] = role;
          else customRoles.push(role);
        }
      } else {
        const source = input?.account || {};
        const id = action === 'create-user' ? `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.userId || '');
        const index = users.findIndex((entry) => entry?.id === id);
        const existing = index >= 0 ? users[index] : null;
        if (action !== 'create-user' && !existing) throw new Error('User account not found.');
        if (action === 'delete-user') {
          if (id === actor.id) throw new Error('You cannot delete the account currently signed in.');
          if (users.some((entry) => entry?.id === id && entry?.role === 'super_admin') && users.filter((entry) => entry?.role === 'super_admin' && entry?.active !== false).length <= 1) throw new Error('At least one active super administrator is required.');
          if (this.getStoredValue('orders', []).some((entry) => entry?.cashierId === id || entry?.waiterId === id)) throw new Error('Accounts with order history cannot be deleted. Deactivate or update the account instead.');
          users.splice(index, 1);
          managedUser = existing;
        } else {
          const name = String(source.name ?? existing?.name ?? '').trim();
          const roleCode = String(source.role ?? existing?.role ?? '').trim();
          const email = String(source.email ?? existing?.email ?? '').trim().toLowerCase();
          const pin = source.pin == null ? undefined : String(source.pin).trim();
          const active = source.active == null ? existing?.active !== false : Boolean(source.active);
          const roleExists = baseRoles.has(roleCode) || customRoles.some((entry) => entry?.code === roleCode || entry?.id === roleCode);
          if (!name || name.length > 120 || !roleExists || (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160))) throw new Error('User account details are invalid.');
          if (actor.role !== 'super_admin' && roleCode === 'super_admin') throw new Error('Only a super administrator can create or assign super-administrator accounts.');
          if (pin != null && !/^\d{4,6}$/.test(pin)) throw new Error('PIN must contain 4 to 6 digits.');
          if (action === 'create-user' && !pin) throw new Error('A PIN is required for a new account.');
          if (email && users.some((entry) => entry?.id !== id && String(entry?.email || '').toLowerCase() === email)) throw new Error('An account with this email already exists.');
          if (existing?.id === actor.id && (roleCode !== existing.role || !active)) throw new Error('You cannot remove or deactivate your currently signed-in account.');
          if (existing?.role === 'super_admin' && (!active || roleCode !== 'super_admin') && users.filter((entry) => entry?.role === 'super_admin' && entry?.active !== false).length <= 1) throw new Error('At least one active super administrator is required.');
          managedUser = protectPin({ ...(existing || {}), id, name, role: roleCode, email, branchId: existing?.branchId || actor.branchId, active, ...(pin ? { pin } : {}) });
          if (index >= 0) users[index] = managedUser;
          else users.push(managedUser);
        }
      }

      const entity = role || managedUser;
      const entityType = action.includes('role') ? 'custom_roles' : 'users';
      const eventAction = action.startsWith('create') ? 'insert' : action.startsWith('delete') ? 'delete' : 'update';
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType, entityId: entity.id, action: eventAction, payloadJson: JSON.stringify(eventAction === 'delete' ? { id: entity.id } : redactPin(entity)), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: actor.id, userName: actor.name, branchId: actor.branchId, action: `SECURITY_${action.replace(/-/g, '_').toUpperCase()}`, details: `${action.replace(/-/g, ' ')}: ${entity.name}` };
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ users, custom_roles: customRoles, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      return { role, account: managedUser ? redactPin(managedUser) : undefined, customRoles, users: users.map(redactPin), syncOutbox, auditLogs };
    })();
  }

  manageConfiguration(input) {
    const action = String(input?.action || '');
    if (!input?.user?.id || !['update-store', 'update-receipt', 'update-printers', 'update-payment-methods', 'update-delivery-methods'].includes(action)) throw new Error('A valid configuration action and authenticated user are required.');
    const user = this.requirePermission(input.user, 'canConfigureSettings');
    return this.db.transaction(() => {
      const now = isoTimestamp();
      const branches = this.getStoredValue('branches', []);
      let receiptConfig = this.getStoredValue('receipt_config', {});
      let printerSettings = this.getStoredValue('printer_settings', {});
      let paymentMethods = this.getStoredValue('payment_methods', []);
      let deliveryMethods = this.getDeliveryMethods();
      if (!Array.isArray(branches) || !Array.isArray(paymentMethods)) throw new Error('Configuration data is unavailable.');
      let entity;
      let entityType;

      if (action === 'update-store') {
        const source = input?.branch || {};
        const index = branches.findIndex((entry) => entry?.id === user.branchId);
        if (index < 0) throw new Error('Store profile not found.');
        const current = branches[index];
        const name = String(source.name ?? current.name ?? '').trim();
        const code = String(source.code ?? current.code ?? '').trim().toUpperCase();
        const taxRate = Number(source.taxRate ?? current.taxRate ?? 0);
        const serviceChargeRate = Number(source.serviceChargeRate ?? current.serviceChargeRate ?? 0);
        const deliveryCharge = Number(source.deliveryCharge ?? current.deliveryCharge ?? 0);
        const currency = String(source.currency ?? current.currency ?? 'PKR').trim().toUpperCase();
        const currencySymbol = String(source.currencySymbol ?? current.currencySymbol ?? '₨').trim();
        if (!name || name.length > 120 || !/^[A-Z0-9_-]{2,20}$/.test(code) || !/^[A-Z]{3}$/.test(currency) || currencySymbol.length > 8 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !Number.isFinite(serviceChargeRate) || serviceChargeRate < 0 || serviceChargeRate > 100 || !Number.isFinite(deliveryCharge) || deliveryCharge < 0 || deliveryCharge > 10000000) throw new Error('Store profile, currency, tax, service charge, or delivery fee is invalid.');
        entity = { ...current, name, code, address: String(source.address ?? current.address ?? '').trim().slice(0, 500), phone: String(source.phone ?? current.phone ?? '').trim().slice(0, 40), taxRate: +taxRate.toFixed(4), taxEnabled: source.taxEnabled == null ? current.taxEnabled !== false : Boolean(source.taxEnabled), taxName: String(source.taxName ?? current.taxName ?? 'Sales Tax').trim().slice(0, 60) || 'Sales Tax', taxInclusive: source.taxInclusive == null ? Boolean(current.taxInclusive) : Boolean(source.taxInclusive), serviceChargeRate: +serviceChargeRate.toFixed(4), deliveryCharge: +deliveryCharge.toFixed(2), currency, currencySymbol };
        branches[index] = entity;
        entityType = 'branches';
      } else if (action === 'update-receipt') {
        const source = input?.receiptConfig || {};
        const merged = { ...receiptConfig, ...source };
        if (!['80mm', '58mm'].includes(merged.paperWidth) || !['compact', 'standard', 'large'].includes(merged.fontDensity) || String(merged.storeName || '').trim().length > 120 || String(merged.headerCustomText || '').length > 500 || String(merged.footerCustomText || '').length > 500 || !Number.isInteger(Number(merged.blankFeedLines ?? 0)) || Number(merged.blankFeedLines ?? 0) < 0 || Number(merged.blankFeedLines ?? 0) > 20) throw new Error('Receipt template settings are invalid.');
        receiptConfig = { ...merged, storeName: String(merged.storeName || '').trim().slice(0, 120), tagline: String(merged.tagline || '').trim().slice(0, 160), address: String(merged.address || '').trim().slice(0, 500), phone: String(merged.phone || '').trim().slice(0, 40), email: String(merged.email || '').trim().slice(0, 160), blankFeedLines: Number(merged.blankFeedLines || 0) };
        entity = receiptConfig; entityType = 'receipt_config';
      } else if (action === 'update-printers') {
        const source = input?.printerSettings || {};
        const merged = { ...printerSettings, ...source, receiptPrinter: { ...(printerSettings.receiptPrinter || {}), ...(source.receiptPrinter || {}) }, kitchenPrinter: { ...(printerSettings.kitchenPrinter || {}), ...(source.kitchenPrinter || {}) } };
        const validateDevice = (device, expectedType) => {
          if (!device || device.type !== expectedType || !String(device.name || '').trim() || !['network_ip', 'usb'].includes(device.connectionType) || !['80mm', '58mm'].includes(device.paperSize) || !Number.isInteger(Number(device.port)) || Number(device.port) < 1 || Number(device.port) > 65535) throw new Error('Printer device settings are invalid. Only Network ESC/POS and Windows system printer connections are supported.');
          if (device.connectionType === 'network_ip' && !/^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(device.ipAddress || ''))) throw new Error('Network printers require a valid IPv4 address.');
          const systemPrinterName = String(device.systemPrinterName || '').trim();
          if (device.connectionType === 'usb' && (!systemPrinterName || systemPrinterName.length > 200)) throw new Error('Windows system printers require a selected installed printer.');
          return { ...device, name: String(device.name).trim().slice(0, 100), ipAddress: String(device.ipAddress || '').trim(), port: Number(device.port), systemPrinterName: systemPrinterName.slice(0, 200), enabled: Boolean(device.enabled), autoPrintOnOrder: Boolean(device.autoPrintOnOrder), cutPaper: Boolean(device.cutPaper), copies: Math.min(10, Math.max(1, Number(device.copies || 1))) };
        };
        if (!['always_both', 'prompt_choice', 'receipt_only', 'kitchen_only'].includes(merged.printOptionsOnOrder)) throw new Error('Order print option is invalid.');
        printerSettings = { ...merged, receiptPrinter: validateDevice(merged.receiptPrinter, 'receipt'), kitchenPrinter: validateDevice(merged.kitchenPrinter, 'kitchen') };
        entity = printerSettings; entityType = 'printer_settings';
      } else if (action === 'update-payment-methods') {
        const methods = input?.paymentMethods;
        if (!Array.isArray(methods) || methods.length === 0 || methods.length > 20) throw new Error('Payment methods are invalid.');
        const ids = new Set();
        const groups = new Set(['cash', 'bank', 'mobile_wallet', 'card', 'custom']);
        paymentMethods = methods.map((method, index) => {
          const id = String(method?.id || ''); const name = String(method?.name || '').trim(); const group = String(method?.settlementGroup || '');
          if (!id || ids.has(id) || !name || name.length > 80 || !groups.has(group) || (!['cash', 'card', 'bank_transfer', 'easypaisa', 'jazzcash', 'wallet', 'split'].includes(id) && !/^custom:[a-z0-9-]{1,50}$/.test(id))) throw new Error('A payment method is invalid.');
          ids.add(id); return { id, name, enabled: Boolean(method.enabled), requiresReference: Boolean(method.requiresReference), settlementGroup: group, displayOrder: index + 1 };
        });
        if (!paymentMethods.some((method) => method.id === 'cash' && method.enabled)) throw new Error('Cash must remain enabled for offline POS operations.');
        entity = paymentMethods; entityType = 'payment_methods';
      } else {
        const methods = input?.deliveryMethods;
        if (!Array.isArray(methods) || methods.length < 2 || methods.length > 20) throw new Error('Delivery methods are invalid.');
        const ids = new Set();
        const names = new Set();
        deliveryMethods = methods.map((method, index) => {
          const id = String(method?.id || '');
          const name = String(method?.name || '').trim();
          const icon = String(method?.icon || '').trim() || '🚚';
          const commissionRate = Number(method?.commissionRate || 0);
          const system = id === 'own_fleet' || id === 'foodpanda';
          if (!id || ids.has(id) || !name || name.length > 80 || names.has(name.toLowerCase()) || icon.length > 16 || !Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100 || (!system && !/^custom:[a-z0-9][a-z0-9_-]{1,49}$/.test(id))) throw new Error('A delivery method is invalid.');
          ids.add(id); names.add(name.toLowerCase());
          return { id, name, icon, commissionRate: +commissionRate.toFixed(4), enabled: system ? true : Boolean(method.enabled), displayOrder: index + 1, system };
        });
        if (!deliveryMethods.some((method) => method.id === 'own_fleet') || !deliveryMethods.some((method) => method.id === 'foodpanda')) throw new Error('Own Fleet and Foodpanda must remain configured delivery methods.');
        entity = deliveryMethods; entityType = 'delivery_methods';
      }

      const eventPayload = action === 'update-payment-methods' ? paymentMethods : action === 'update-delivery-methods' ? deliveryMethods : entity;
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType, entityId: action === 'update-store' ? entity.id : entityType, action: 'update', payloadJson: JSON.stringify(eventPayload), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: `CONFIG_${action.replace(/-/g, '_').toUpperCase()}`, details: `Updated ${action.replace('update-', '').replace(/-/g, ' ')}` };
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ branches, receipt_config: receiptConfig, printer_settings: printerSettings, payment_methods: paymentMethods, delivery_methods: deliveryMethods, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      if (action === 'update-store') this.syncNormalizedCollection('branches', branches);
      return { branch: action === 'update-store' ? entity : undefined, receiptConfig, printerSettings, paymentMethods, deliveryMethods, syncOutbox, auditLogs };
    })();
  }

  adjustInventoryStock(input) {
    const ingredientId = String(input?.ingredientId || '');
    const newStock = Number(input?.newStock);
    const reason = String(input?.reason || '').trim();
    const submittedUser = input?.user;
    if (!ingredientId || !Number.isFinite(newStock) || newStock < 0 || !reason || reason.length > 500 || !submittedUser?.id) throw new Error('A valid stock quantity and adjustment reason are required.');
    const user = this.requirePermission(submittedUser, 'canManageInventory');
    // A cash purchase affects the active drawer, so it requires POS/cash-drawer access too.
    if (paymentMethod === 'cash') this.requirePermission(submittedUser, 'canAccessPos');
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT payload_json FROM ingredients WHERE id = ?').get(ingredientId);
      if (!row) throw new Error('Ingredient not found.');
      const ingredient = JSON.parse(row.payload_json);
      const previousStock = Number(ingredient.currentStock || 0);
      const delta = +(newStock - previousStock).toFixed(2);
      const now = isoTimestamp();
      ingredient.currentStock = newStock;
      this.db.prepare('UPDATE ingredients SET current_stock = ?, payload_json = ?, updated_at = ? WHERE id = ?')
        .run(newStock, JSON.stringify(ingredient), now, ingredientId);
      this.db.prepare('INSERT INTO inventory_movements(id, ingredient_id, movement_type, quantity_delta, created_at, note) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`adjust-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, ingredientId, 'manual_adjustment', delta, now, reason);
      const ingredients = this.getStoredValue('ingredients', []).map((entry) => entry.id === ingredientId ? ingredient : entry);
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType: 'ingredients', entityId: ingredientId, action: 'update', payloadJson: JSON.stringify(ingredient), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: 'STOCK_MANUAL_ADJUSTMENT', details: `Stock for ${ingredient.name} adjusted from ${previousStock} to ${newStock} (${ingredient.unit}). Reason: ${reason}` };
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ ingredients, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      return { ingredient, ingredients, syncOutbox, auditLogs };
    })();
  }

  quickRestockIngredient(input) {
    const ingredientId = String(input?.ingredientId || '');
    const quantity = Number(input?.quantity);
    const unitCost = Number(input?.unitCost);
    const note = String(input?.note || '').trim();
    const supplierName = String(input?.supplierName || '').trim();
    const paymentMethod = String(input?.paymentMethod || 'other');
    const paymentReference = String(input?.paymentReference || '').trim();
    const submittedUser = input?.user;
    if (!ingredientId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000 || !Number.isFinite(unitCost) || unitCost < 0 || unitCost > 10000000 || note.length > 500 || supplierName.length > 140 || paymentReference.length > 160 || !['cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'other'].includes(paymentMethod) || !submittedUser?.id) throw new Error('A positive quantity, valid unit cost, and payment method are required for a quick restock.');
    const user = this.requirePermission(submittedUser, 'canManageInventory');
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT payload_json FROM ingredients WHERE id = ? AND branch_id = ?').get(ingredientId, user.branchId);
      if (!row) throw new Error('Ingredient not found.');
      const ingredient = JSON.parse(row.payload_json);
      const previousStock = Number(ingredient.currentStock || 0);
      const previousUnitCost = Number(ingredient.unitCost || 0);
      const nextStock = +(previousStock + quantity).toFixed(4);
      // Retain a defensible moving-average cost without changing supplier balances or POs.
      const nextUnitCost = nextStock > 0 ? +(((previousStock * previousUnitCost) + (quantity * unitCost)) / nextStock).toFixed(4) : unitCost;
      const now = isoTimestamp();
      const restockNote = note || 'Quick restock (no purchase order)';
      ingredient.currentStock = nextStock;
      ingredient.unitCost = nextUnitCost;
      this.db.prepare('UPDATE ingredients SET current_stock = ?, unit_cost = ?, payload_json = ?, updated_at = ? WHERE id = ?')
        .run(nextStock, nextUnitCost, JSON.stringify(ingredient), now, ingredientId);
      this.db.prepare('INSERT INTO inventory_movements(id, ingredient_id, movement_type, quantity_delta, created_at, note) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`restock-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, ingredientId, 'quick_restock', quantity, now, restockNote);
      const ingredients = this.getStoredValue('ingredients', []).map((entry) => entry.id === ingredientId ? ingredient : entry);
      const existingPurchases = this.getStoredValue('quick_stock_purchases', []);
      const quickStockPurchase = { id: `qsp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, purchaseNumber: `QSP-${new Date().getFullYear()}-${String((Array.isArray(existingPurchases) ? existingPurchases.length : 0) + 1).padStart(6, '0')}`, branchId: user.branchId, ingredientId, ingredientName: ingredient.name, quantity: +quantity.toFixed(4), unit: ingredient.unit, unitCost: +unitCost.toFixed(4), totalAmount: +(quantity * unitCost).toFixed(2), supplierName: supplierName || undefined, paymentMethod, paymentReference: paymentReference || undefined, notes: note || undefined, purchasedAt: now, purchasedBy: user.name };
      const quickStockPurchases = [quickStockPurchase, ...(Array.isArray(existingPurchases) ? existingPurchases : [])];
      let cashSession = this.getStoredValue('cash_session', null);
      if (paymentMethod === 'cash') {
        if (!cashSession || cashSession.status !== 'open' || cashSession.branchId !== user.branchId || Number(cashSession.expectedCash || 0) + 0.0001 < quickStockPurchase.totalAmount) throw new Error('An open cash drawer with sufficient funds is required for a cash stock purchase. Use another recorded payment method if the purchase was paid outside the drawer.');
        cashSession = { ...cashSession, cashPayouts: +(Number(cashSession.cashPayouts || 0) + quickStockPurchase.totalAmount).toFixed(2), expectedCash: +(Number(cashSession.expectedCash || 0) - quickStockPurchase.totalAmount).toFixed(2) };
        this.writeNormalizedCashSession(cashSession, now);
        this.db.prepare('INSERT INTO cash_drawer_entries(id, cash_session_id, settlement_group, amount, created_at) VALUES (?, ?, ?, ?, ?)').run(`quick-purchase-${quickStockPurchase.id}`, cashSession.id, 'stock_purchase', -quickStockPurchase.totalAmount, now);
      }
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType: 'quick_stock_purchases', entityId: quickStockPurchase.id, action: 'insert', payloadJson: JSON.stringify(quickStockPurchase), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: 'INVENTORY_QUICK_RESTOCK', details: `Quick purchase ${quickStockPurchase.purchaseNumber}: ${ingredient.name} +${quantity} ${ingredient.unit}, paid ${quickStockPurchase.totalAmount.toFixed(2)} via ${paymentMethod}. ${restockNote}` };
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ ingredients, quick_stock_purchases: quickStockPurchases, cash_session: cashSession, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      return { ingredient, ingredients, quickStockPurchases, cashSession, syncOutbox, auditLogs };
    })();
  }

  getInventoryReport(input) {
    const branchId = String(input?.branchId || '');
    if (!branchId || !input?.user?.id) throw new Error('A branch and authenticated user are required for inventory reports.');
    this.requirePermission(input.user, 'canManageInventory');
    const ingredients = this.db.prepare('SELECT payload_json FROM ingredients WHERE branch_id = ? ORDER BY name COLLATE NOCASE').all(branchId).map((row) => JSON.parse(row.payload_json));
    const recentVariances = this.db.prepare('SELECT payload_json FROM inventory_variances WHERE branch_id = ? ORDER BY recorded_at DESC LIMIT 100').all(branchId).map((row) => JSON.parse(row.payload_json));
    return { totalStockValue: +ingredients.reduce((total, ingredient) => total + Number(ingredient.currentStock || 0) * Number(ingredient.unitCost || 0), 0).toFixed(2), lowStockItems: ingredients.filter((ingredient) => Number(ingredient.currentStock || 0) <= Number(ingredient.minThreshold || 0)), recentVariances };
  }

  recordInventoryVariance(input) {
    const ingredientId = String(input?.ingredientId || ''); const type = String(input?.type || ''); const quantity = Number(input?.quantity); const reason = String(input?.reason || '').trim();
    if (!ingredientId || !['wastage', 'spoilage', 'damage'].includes(type) || !Number.isFinite(quantity) || quantity <= 0 || !reason) throw new Error('An ingredient, positive quantity, variance type, and reason are required.');
    const user = this.requirePermission(input?.user, 'canManageInventory');
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT payload_json FROM ingredients WHERE id = ? AND branch_id = ?').get(ingredientId, user.branchId); if (!row) throw new Error('Ingredient not found.');
      const ingredient = JSON.parse(row.payload_json); if (quantity > Number(ingredient.currentStock || 0) + .0001) throw new Error('Wastage cannot exceed available stock.');
      const now = isoTimestamp(); const delta = -quantity; ingredient.currentStock = +(Number(ingredient.currentStock || 0) + delta).toFixed(2);
      const variance = { id: `ivar-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, ingredientId, ingredientName: ingredient.name, branchId: user.branchId, movementType: type, quantityDelta: delta, valueImpact: +(quantity * Number(ingredient.unitCost || 0)).toFixed(2), reason, recordedAt: now, recordedBy: user.name };
      this.db.prepare('UPDATE ingredients SET current_stock = ?, payload_json = ?, updated_at = ? WHERE id = ?').run(ingredient.currentStock, JSON.stringify(ingredient), now, ingredientId);
      this.db.prepare('INSERT INTO inventory_movements(id, ingredient_id, movement_type, quantity_delta, created_at, note) VALUES (?, ?, ?, ?, ?, ?)').run(`variance-${variance.id}`, ingredientId, type, delta, now, reason);
      this.db.prepare('INSERT INTO inventory_variances(id, ingredient_id, branch_id, movement_type, quantity_delta, value_impact, reason, recorded_at, recorded_by, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(variance.id, ingredientId, user.branchId, type, delta, variance.valueImpact, reason, now, user.name, JSON.stringify(variance));
      const ingredients = this.listNormalizedIngredients ? this.listNormalizedIngredients(user.branchId) : this.db.prepare('SELECT payload_json FROM ingredients WHERE branch_id = ?').all(user.branchId).map((entry) => JSON.parse(entry.payload_json)); const syncOutbox = [{ id: `sync-evt-${Date.now()}`, entityType: 'inventory_variances', entityId: variance.id, action: 'insert', payloadJson: JSON.stringify(variance), createdAt: now, status: 'pending', syncAttemptCount: 0 }, ...(this.getStoredValue('sync_outbox', []))]; const auditLogs = [{ id: `log-${Date.now()}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: `INVENTORY_${type.toUpperCase()}`, details: `${quantity} ${ingredient.unit} ${ingredient.name}: ${reason}` }, ...(this.getStoredValue('audit_logs', []))]; for (const [key, value] of Object.entries({ ingredients, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value); return { variance, ingredients, syncOutbox, auditLogs };
    })();
  }

  recordSupplierPayment(input) {
    const vendorId = String(input?.vendorId || ''); const amount = Number(input?.amount); const method = String(input?.method || '');
    const reference = String(input?.reference || '').trim(); const submittedUser = input?.user;
    if (!vendorId || !Number.isFinite(amount) || amount <= 0 || !['cash', 'bank_transfer', 'cheque'].includes(method) || !reference || !submittedUser?.id) throw new Error('Valid supplier payment details are required.');
    const user = this.requirePermission(submittedUser, 'canViewFinancialReports');
    return this.db.transaction(() => {
      const vendorRow = this.db.prepare('SELECT payload_json FROM vendors WHERE id = ? AND active = 1').get(vendorId);
      if (!vendorRow) throw new Error('Supplier not found.');
      const vendor = JSON.parse(vendorRow.payload_json);
      if (amount > Number(vendor.outstandingBalance || 0) + 0.0001) throw new Error('Supplier payment cannot exceed the outstanding balance.');
      const now = isoTimestamp(); vendor.outstandingBalance = +(Number(vendor.outstandingBalance || 0) - amount).toFixed(2);
      this.writeNormalizedVendor(vendor, now);
      const vendorPaymentsExisting = this.getStoredValue('vendor_payments', []);
      const payment = { id: `vpay-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, paymentNumber: `VPAY-${new Date().getFullYear()}-${String((vendorPaymentsExisting).length + 1).padStart(6, '0')}`, vendorId, vendorName: vendor.name, branchId: user.branchId, amount, paymentMethod: method, referenceNumber: reference, paidAt: now };
      this.db.prepare('INSERT INTO supplier_payments(id, vendor_id, branch_id, amount, payment_method, reference_number, paid_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(payment.id, vendorId, user.branchId, amount, method, reference, now, JSON.stringify(payment));
      let cashSession = this.getStoredValue('cash_session', null);
      if (method === 'cash') {
        if (!cashSession || cashSession.status !== 'open' || cashSession.branchId !== user.branchId || Number(cashSession.expectedCash || 0) + 0.0001 < amount) throw new Error('An open cash drawer with sufficient funds is required for a cash supplier payment.');
        cashSession = { ...cashSession, cashPayouts: +(Number(cashSession.cashPayouts || 0) + amount).toFixed(2), expectedCash: +(Number(cashSession.expectedCash || 0) - amount).toFixed(2) };
        this.writeNormalizedCashSession(cashSession, now);
        this.db.prepare('INSERT INTO cash_drawer_entries(id, cash_session_id, settlement_group, amount, created_at) VALUES (?, ?, ?, ?, ?)').run(`supplier-payout-${payment.id}`, cashSession.id, 'supplier_payout', -amount, now);
      }
      const vendors = this.listNormalizedVendors(); const vendorPayments = [payment, ...vendorPaymentsExisting]; const syncEvent = { id: `sync-evt-${Date.now()}`, entityType: 'vendor_payments', entityId: payment.id, action: 'insert', payloadJson: JSON.stringify(payment), createdAt: now, status: 'pending', syncAttemptCount: 0 }; const auditLog = { id: `log-${Date.now()}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: 'VENDOR_PAYMENT', details: `Paid ${amount.toFixed(2)} to ${vendor.name} via ${method.toUpperCase()}` }; const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))]; const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ vendors, vendor_payments: vendorPayments, cash_session: cashSession, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      return { payment, vendors, vendorPayments, cashSession, syncOutbox, auditLogs };
    })();
  }

  manageEmployee(input) {
    const action = String(input?.action || ''); const submittedUser = input?.user; const source = input?.employee || {};
    if (!submittedUser?.id || !['create', 'update', 'deactivate'].includes(action)) throw new Error('A valid staff action and authenticated user are required.');
    const user = this.requirePermission(submittedUser, 'canManageStaff');
    return this.db.transaction(() => {
      const now = isoTimestamp(); const id = action === 'create' ? `emp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : String(input?.employeeId || '');
      const existingRow = action === 'create' ? null : this.db.prepare('SELECT payload_json FROM employees WHERE id = ?').get(id);
      const existing = existingRow ? JSON.parse(existingRow.payload_json) : null;
      if (action !== 'create' && !existing) throw new Error('Staff member not found.');
      if (existing && existing.branchId !== user.branchId && user.role !== 'super_admin') throw new Error('You cannot manage staff from another store.');
      if (action === 'deactivate') {
        if (id === user.id) throw new Error('You cannot deactivate your own account.');
        const employee = { ...existing, active: false }; this.writeNormalizedEmployee(employee, now);
        const employees = this.listNormalizedEmployees(employee.branchId); const users = this.getStoredValue('users', []).filter((entry) => entry.id !== id);
        const syncOutbox = [{ id: `sync-evt-${Date.now()}`, entityType: 'employees', entityId: id, action: 'delete', payloadJson: JSON.stringify({ id }), createdAt: now, status: 'pending', syncAttemptCount: 0 }, ...(this.getStoredValue('sync_outbox', []))];
        const auditLogs = [{ id: `log-${Date.now()}`, timestamp: now, userId: user.id, userName: user.name, branchId: employee.branchId, action: 'EMPLOYEE_DEACTIVATED', details: `Deactivated staff account: ${employee.name}` }, ...(this.getStoredValue('audit_logs', []))];
        for (const [key, value] of Object.entries({ employees, users, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
        return { employees: employees.map(redactPin), users: users.map(redactPin), syncOutbox, auditLogs };
      }
      const name = String(source.name ?? existing?.name ?? '').trim(); const role = String(source.role ?? existing?.role ?? ''); const requestedPin = String(source.pin ?? '').trim();
      if (!name || !role || (!existing && !/^\d{4,6}$/.test(requestedPin)) || (requestedPin && !/^\d{4,6}$/.test(requestedPin))) throw new Error('Staff name, role, and a 4 to 6 digit PIN are required for new staff. Changed PINs must contain 4 to 6 digits.');
      if (role === 'super_admin' && user.role !== 'super_admin') throw new Error('Only a super administrator can assign that role.');
      let pinHash = existing?.pinHash;
      if (requestedPin) {
        pinHash = hashPin(requestedPin);
      }
      if (!pinHash) throw new Error('A secure terminal PIN is required.');
      const employee = { ...(existing || {}), id, branchId: existing?.branchId || user.branchId, name, role, phone: String(source.phone ?? existing?.phone ?? ''), email: String(source.email ?? existing?.email ?? ''), hourlyRate: Math.max(0, Number(source.hourlyRate ?? existing?.hourlyRate ?? 0)), monthlySalary: source.monthlySalary === '' ? undefined : (source.monthlySalary ?? existing?.monthlySalary), pinHash, active: true, hiredDate: existing?.hiredDate || now.slice(0, 10) };
      if (employee.monthlySalary != null && (!Number.isFinite(Number(employee.monthlySalary)) || Number(employee.monthlySalary) < 0)) throw new Error('Monthly salary must be a non-negative amount.');
      if (employee.monthlySalary != null) employee.monthlySalary = Number(employee.monthlySalary);
      this.writeNormalizedEmployee(employee, now);
      const employees = this.listNormalizedEmployees(employee.branchId); const users = this.getStoredValue('users', []).filter((entry) => entry.id !== id).concat([{ id, name, role, branchId: employee.branchId, pinHash, email: employee.email }]);
      const syncOutbox = [{ id: `sync-evt-${Date.now()}`, entityType: 'employees', entityId: id, action: existing ? 'update' : 'insert', payloadJson: JSON.stringify(employee), createdAt: now, status: 'pending', syncAttemptCount: 0 }, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [{ id: `log-${Date.now()}`, timestamp: now, userId: user.id, userName: user.name, branchId: employee.branchId, action: existing ? 'EMPLOYEE_UPDATED' : 'EMPLOYEE_HIRED', details: `${existing ? 'Updated' : 'Onboarded'} staff member: ${name}` }, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ employees, users, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      return { employee: redactPin(employee), employees: employees.map(redactPin), users: users.map(redactPin), syncOutbox, auditLogs };
    })();
  }

  recordStaffAttendance(input) {
    const action = String(input?.action || ''); const user = this.requirePermission(input?.user, 'canManageStaff'); const now = isoTimestamp();
    if (!['clock-in', 'clock-out'].includes(action)) throw new Error('A valid attendance action is required.');
    return this.db.transaction(() => {
      let attendance;
      if (action === 'clock-in') {
        const employeeId = String(input?.employeeId || ''); const row = this.db.prepare('SELECT payload_json FROM employees WHERE id = ? AND branch_id = ? AND active = 1').get(employeeId, user.branchId);
        if (!row) throw new Error('Active staff member not found.'); const employee = JSON.parse(row.payload_json);
        const open = this.db.prepare("SELECT 1 FROM staff_attendance WHERE employee_id = ? AND status = 'present'").get(employeeId); if (open) throw new Error('This staff member is already clocked in.');
        attendance = { id: `att-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, employeeId, employeeName: employee.name, branchId: user.branchId, date: now.slice(0, 10), clockInTime: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), clockInAt: now, status: 'present', notes: 'Shift started' };
      } else {
        const id = String(input?.attendanceId || ''); const row = this.db.prepare("SELECT payload_json FROM staff_attendance WHERE id = ? AND branch_id = ? AND status = 'present'").get(id, user.branchId); if (!row) throw new Error('Open attendance record not found.');
        attendance = JSON.parse(row.payload_json); const hours = Math.max(0, (Date.now() - new Date(attendance.clockInAt).getTime()) / 3600000);
        attendance = { ...attendance, clockOutTime: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), clockOutAt: now, totalHoursWorked: +hours.toFixed(2), status: 'completed' };
      }
      this.writeNormalizedAttendance(attendance, now); const attendances = this.listNormalizedAttendances(user.branchId);
      const syncOutbox = [{ id: `sync-evt-${Date.now()}`, entityType: 'attendances', entityId: attendance.id, action: action === 'clock-in' ? 'insert' : 'update', payloadJson: JSON.stringify(attendance), createdAt: now, status: 'pending', syncAttemptCount: 0 }, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [{ id: `log-${Date.now()}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: action === 'clock-in' ? 'STAFF_CLOCK_IN' : 'STAFF_CLOCK_OUT', details: `${attendance.employeeName} ${action === 'clock-in' ? 'clocked in' : `clocked out (${attendance.totalHoursWorked} hrs)`}` }, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ attendances, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      return { attendance, attendances, syncOutbox, auditLogs };
    })();
  }

  recordPayrollAdvance(input) {
    const user = this.requirePermission(input?.user, 'canManageStaff'); const employeeId = String(input?.employeeId || ''); const amount = Number(input?.amount); const paymentMethod = String(input?.paymentMethod || ''); const notes = String(input?.notes || '').trim();
    if (!employeeId || !Number.isFinite(amount) || amount <= 0 || !['cash', 'bank_transfer'].includes(paymentMethod)) throw new Error('Valid advance details are required.');
    return this.db.transaction(() => {
      const employeeRow = this.db.prepare('SELECT payload_json FROM employees WHERE id = ? AND branch_id = ? AND active = 1').get(employeeId, user.branchId); if (!employeeRow) throw new Error('Active staff member not found.');
      const employee = JSON.parse(employeeRow.payload_json); const now = isoTimestamp(); let cashSession = this.getStoredValue('cash_session', null);
      if (paymentMethod === 'cash') { if (!cashSession || cashSession.status !== 'open' || cashSession.branchId !== user.branchId || Number(cashSession.expectedCash || 0) + .0001 < amount) throw new Error('An open cash drawer with sufficient funds is required for a cash advance.'); cashSession = { ...cashSession, cashPayouts: +(Number(cashSession.cashPayouts || 0) + amount).toFixed(2), expectedCash: +(Number(cashSession.expectedCash || 0) - amount).toFixed(2) }; this.writeNormalizedCashSession(cashSession, now); }
      const advance = { id: `padv-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, employeeId, employeeName: employee.name, branchId: user.branchId, amount, outstandingAmount: amount, paymentMethod, issuedAt: now, notes, status: 'open' };
      this.db.prepare('INSERT INTO payroll_advances(id, employee_id, branch_id, amount, outstanding_amount, issued_at, status, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(advance.id, employeeId, user.branchId, amount, amount, now, 'open', JSON.stringify(advance), now);
      if (paymentMethod === 'cash') this.db.prepare('INSERT INTO cash_drawer_entries(id, cash_session_id, settlement_group, amount, created_at) VALUES (?, ?, ?, ?, ?)').run(`advance-${advance.id}`, cashSession.id, 'payroll_advance', -amount, now);
      const advances = this.db.prepare('SELECT payload_json FROM payroll_advances WHERE branch_id = ? ORDER BY issued_at DESC').all(user.branchId).map((row) => JSON.parse(row.payload_json)); const syncOutbox = [{ id: `sync-evt-${Date.now()}`, entityType: 'payroll_advances', entityId: advance.id, action: 'insert', payloadJson: JSON.stringify(advance), createdAt: now, status: 'pending', syncAttemptCount: 0 }, ...(this.getStoredValue('sync_outbox', []))]; const auditLogs = [{ id: `log-${Date.now()}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: 'PAYROLL_ADVANCE_ISSUED', details: `Issued ${amount.toFixed(2)} advance to ${employee.name}` }, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ payroll_advances: advances, cash_session: cashSession, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value); return { advance, advances, cashSession, syncOutbox, auditLogs };
    })();
  }

  postPayroll(input) {
    const user = this.requirePermission(input?.user, 'canManageStaff'); const periodStart = String(input?.periodStart || ''); const periodEnd = String(input?.periodEnd || ''); const paymentMethod = String(input?.paymentMethod || ''); const requestedDeductions = input?.otherDeductions || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodStart > periodEnd || !['cash', 'bank_transfer'].includes(paymentMethod)) throw new Error('A valid payroll period and payment method are required.');
    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT 1 FROM payroll_runs WHERE branch_id = ? AND period_start = ? AND period_end = ?').get(user.branchId, periodStart, periodEnd); if (existing) throw new Error('Payroll has already been posted for this period.');
      const now = isoTimestamp(); const employees = this.listNormalizedEmployees(user.branchId).filter((employee) => employee.active !== false); if (!employees.length) throw new Error('No active staff members are available for payroll.');
      const attendance = this.listNormalizedAttendances(user.branchId); const advances = this.db.prepare("SELECT payload_json FROM payroll_advances WHERE branch_id = ? AND status = 'open' ORDER BY issued_at").all(user.branchId).map((row) => JSON.parse(row.payload_json));
      const items = employees.map((employee) => { const hours = attendance.filter((entry) => entry.employeeId === employee.id && entry.status === 'completed' && entry.date >= periodStart && entry.date <= periodEnd).reduce((total, entry) => total + Number(entry.totalHoursWorked || 0), 0); const gross = employee.monthlySalary != null ? Number(employee.monthlySalary) : hours * Number(employee.hourlyRate || 0); const other = Math.max(0, Number(requestedDeductions[employee.id] || 0)); let available = Math.max(0, gross - other); let recovery = 0; for (const advance of advances.filter((entry) => entry.employeeId === employee.id)) { const recovered = Math.min(available, Number(advance.outstandingAmount || 0)); recovery += recovered; available -= recovered; advance.outstandingAmount = +(Number(advance.outstandingAmount || 0) - recovered).toFixed(2); advance.status = advance.outstandingAmount <= .0001 ? 'recovered' : 'open'; } const totalDeductions = +(other + recovery).toFixed(2); return { employeeId: employee.id, employeeName: employee.name, hoursWorked: +hours.toFixed(2), grossPay: +gross.toFixed(2), advanceRecovery: +recovery.toFixed(2), otherDeductions: +other.toFixed(2), totalDeductions, netPay: +Math.max(0, gross - totalDeductions).toFixed(2) }; });
      const totalGross = +items.reduce((total, item) => total + item.grossPay, 0).toFixed(2); const totalDeductions = +items.reduce((total, item) => total + item.totalDeductions, 0).toFixed(2); const totalNet = +items.reduce((total, item) => total + item.netPay, 0).toFixed(2); let cashSession = this.getStoredValue('cash_session', null);
      if (paymentMethod === 'cash') { if (!cashSession || cashSession.status !== 'open' || cashSession.branchId !== user.branchId || Number(cashSession.expectedCash || 0) + .0001 < totalNet) throw new Error('An open cash drawer with sufficient funds is required for cash payroll.'); cashSession = { ...cashSession, cashPayouts: +(Number(cashSession.cashPayouts || 0) + totalNet).toFixed(2), expectedCash: +(Number(cashSession.expectedCash || 0) - totalNet).toFixed(2) }; this.writeNormalizedCashSession(cashSession, now); }
      const payrollRuns = this.getStoredValue('payroll_runs', []); const id = `pay-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`; const payrollRun = { id, payrollNumber: `PAY-${new Date().getFullYear()}-${String(payrollRuns.length + 1).padStart(6, '0')}`, branchId: user.branchId, periodStart, periodEnd, paymentMethod, status: 'posted', totalGross, totalDeductions, totalNet, postedAt: now, postedBy: user.name, items };
      this.db.prepare('INSERT INTO payroll_runs(id, payroll_number, branch_id, period_start, period_end, payment_method, status, total_gross, total_deductions, total_net, posted_at, posted_by, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, payrollRun.payrollNumber, user.branchId, periodStart, periodEnd, paymentMethod, 'posted', totalGross, totalDeductions, totalNet, now, user.name, JSON.stringify(payrollRun)); for (const item of items) this.db.prepare('INSERT INTO payroll_items(payroll_run_id, employee_id, gross_pay, advance_recovery, other_deductions, net_pay, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, item.employeeId, item.grossPay, item.advanceRecovery, item.otherDeductions, item.netPay, JSON.stringify(item)); for (const advance of advances) this.db.prepare('UPDATE payroll_advances SET outstanding_amount = ?, status = ?, payload_json = ?, updated_at = ? WHERE id = ?').run(advance.outstandingAmount, advance.status, JSON.stringify(advance), now, advance.id);
      const expense = { id: `exp-pay-${id}`, voucherNumber: `EXP-PAY-${String(payrollRuns.length + 1).padStart(6, '0')}`, branchId: user.branchId, categoryId: 'payroll', categoryName: 'Payroll', amount: totalGross, paymentMethod, payee: 'Staff Payroll', date: now.slice(0, 10), notes: `${periodStart} to ${periodEnd}; deductions ${totalDeductions.toFixed(2)}`, approvedBy: user.name, status: 'approved' }; this.db.prepare('INSERT INTO expenses_ledger(id, branch_id, category_id, amount, payment_method, payee, recorded_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(expense.id, user.branchId, 'payroll', totalGross, paymentMethod, expense.payee, now, JSON.stringify(expense)); if (paymentMethod === 'cash') this.db.prepare('INSERT INTO cash_drawer_entries(id, cash_session_id, settlement_group, amount, created_at) VALUES (?, ?, ?, ?, ?)').run(`payroll-${id}`, cashSession.id, 'payroll_payout', -totalNet, now);
      const nextRuns = [payrollRun, ...payrollRuns]; const nextAdvances = this.db.prepare('SELECT payload_json FROM payroll_advances WHERE branch_id = ? ORDER BY issued_at DESC').all(user.branchId).map((row) => JSON.parse(row.payload_json)); const expenses = [expense, ...(this.getStoredValue('expenses', []))]; const syncOutbox = [{ id: `sync-evt-${Date.now()}`, entityType: 'payroll_runs', entityId: id, action: 'insert', payloadJson: JSON.stringify(payrollRun), createdAt: now, status: 'pending', syncAttemptCount: 0 }, ...(this.getStoredValue('sync_outbox', []))]; const auditLogs = [{ id: `log-${Date.now()}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: 'PAYROLL_POSTED', details: `${payrollRun.payrollNumber} posted: net ${totalNet.toFixed(2)}` }, ...(this.getStoredValue('audit_logs', []))]; for (const [key, value] of Object.entries({ payroll_runs: nextRuns, payroll_advances: nextAdvances, expenses, cash_session: cashSession, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value); return { payrollRun, payrollRuns: nextRuns, advances: nextAdvances, expenses, cashSession, syncOutbox, auditLogs };
    })();
  }

  recordExpense(input) {
    const categoryId = String(input?.categoryId || ''); const payee = String(input?.payee || '').trim(); const notes = String(input?.notes || '').trim(); const method = String(input?.method || ''); const submittedUser = input?.user; const amount = Number(input?.amount);
    if (!categoryId || !payee || payee.length > 160 || notes.length > 1000 || !Number.isFinite(amount) || amount <= 0 || amount > 10000000 || !['cash', 'bank_transfer', 'card'].includes(method) || !submittedUser?.id) throw new Error('Valid expense details are required.');
    const user = this.requirePermission(submittedUser, 'canViewFinancialReports');
    return this.db.transaction(() => {
      const now = isoTimestamp(); const categories = this.getStoredValue('expense_categories', []); const category = (Array.isArray(categories) ? categories : []).find((entry) => entry?.id === categoryId);
      if (!category) throw new Error('Expense category not found.');
      const existingExpenses = this.getStoredValue('expenses', []);
      let cashSession = this.getStoredValue('cash_session', null);
      if (method === 'cash') {
        if (!cashSession || cashSession.status !== 'open' || cashSession.branchId !== user.branchId || Number(cashSession.expectedCash || 0) + 0.0001 < amount) throw new Error('An open cash drawer with sufficient funds is required for a cash expense.');
        cashSession = { ...cashSession, cashPayouts: +(Number(cashSession.cashPayouts || 0) + amount).toFixed(2), expectedCash: +(Number(cashSession.expectedCash || 0) - amount).toFixed(2) };
      }
      const expense = { id: `exp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, voucherNumber: `EXP-${new Date().getFullYear()}-${String((Array.isArray(existingExpenses) ? existingExpenses.length : 0) + 1).padStart(6, '0')}`, branchId: user.branchId, categoryId, categoryName: category.name, amount: +amount.toFixed(2), paymentMethod: method, payee, date: now.slice(0, 10), notes, approvedBy: user.name, status: 'approved' };
      this.db.prepare('INSERT INTO expenses_ledger(id, branch_id, category_id, amount, payment_method, payee, recorded_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(expense.id, user.branchId, categoryId, amount, method, payee, now, JSON.stringify(expense));
      if (method === 'cash') { this.writeNormalizedCashSession(cashSession, now); this.db.prepare('INSERT INTO cash_drawer_entries(id, cash_session_id, settlement_group, amount, created_at) VALUES (?, ?, ?, ?, ?)').run(`expense-payout-${expense.id}`, cashSession.id, 'expense_payout', -amount, now); }
      const expenses = [expense, ...(Array.isArray(existingExpenses) ? existingExpenses : [])]; const syncEvent = { id: `sync-evt-${Date.now()}`, entityType: 'expenses', entityId: expense.id, action: 'insert', payloadJson: JSON.stringify(expense), createdAt: now, status: 'pending', syncAttemptCount: 0 }; const auditLog = { id: `log-${Date.now()}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: 'EXPENSE_RECORDED', details: `Voucher ${expense.voucherNumber} logged: ${amount.toFixed(2)} to ${payee}` }; const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))]; const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))]; for (const [key, value] of Object.entries({ expenses, cash_session: cashSession, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value); return { expense, expenses, cashSession, syncOutbox, auditLogs };
    })();
  }

  updateCashSession(input) {
    const action = String(input?.action || '');
    const submittedUser = input?.user;
    if (!submittedUser?.id || !['movement', 'close', 'open'].includes(action)) throw new Error('A valid cash-drawer action and authenticated user are required.');
    const user = this.requirePermission(submittedUser, 'canAccessPos');
    return this.db.transaction(() => {
      const now = isoTimestamp();
      const targetStatus = action === 'open' ? 'closed' : 'open';
      const sessionRow = this.db.prepare('SELECT payload_json FROM cash_sessions WHERE branch_id = ? AND status = ? ORDER BY updated_at DESC LIMIT 1').get(user.branchId, targetStatus);
      if (!sessionRow) throw new Error(action === 'open' ? 'Close the current drawer before opening a new shift.' : 'No open cash drawer session exists for this store.');
      const current = JSON.parse(sessionRow.payload_json);
      if (current.branchId !== user.branchId) throw new Error('This cash drawer belongs to a different store.');
      let cashSession;
      let auditAction;
      let auditDetails;
      let settlementGroup;
      let drawerAmount = 0;

      if (action === 'movement') {
        const type = String(input?.type || '');
        const amount = Number(input?.amount);
        const reason = String(input?.reason || '').trim();
        if (current.status !== 'open' || !['payout', 'drop'].includes(type) || !Number.isFinite(amount) || amount <= 0 || !reason || reason.length > 500) throw new Error('An open session, a positive amount, and a reason of up to 500 characters are required for a cash movement.');
        if (amount > Number(current.expectedCash || 0) + 0.0001) throw new Error('Cash movement cannot exceed the amount currently expected in the drawer.');
        cashSession = { ...current };
        if (type === 'payout') cashSession.cashPayouts = +(Number(cashSession.cashPayouts || 0) + amount).toFixed(2);
        else cashSession.cashDrops = +(Number(cashSession.cashDrops || 0) + amount).toFixed(2);
        cashSession.expectedCash = +(Number(cashSession.expectedCash || 0) - amount).toFixed(2);
        auditAction = type === 'payout' ? 'CASH_PAYOUT' : 'CASH_DROP';
        auditDetails = `${type.toUpperCase()} of ${amount.toFixed(2)} recorded. Reason: ${reason}`;
        settlementGroup = type === 'payout' ? 'cash_payout' : 'cash_drop';
        drawerAmount = -amount;
      } else if (action === 'close') {
        const countedCash = Number(input?.countedCash);
        const notes = String(input?.notes || '').trim();
        if (current.status !== 'open' || !Number.isFinite(countedCash) || countedCash < 0 || notes.length > 1000) throw new Error('A non-negative cash count and closing notes of up to 1,000 characters are required to close an open session.');
        const variance = +(countedCash - Number(current.expectedCash || 0)).toFixed(2);
        cashSession = { ...current, status: 'closed', closedAt: now, actualCashCounted: countedCash, variance, notes: [current.notes, notes].filter(Boolean).join('\n'), managerApproved: Math.abs(variance) <= 5 };
        auditAction = 'CASH_SESSION_CLOSED';
        auditDetails = `Session ${cashSession.id} closed. Counted: ${countedCash.toFixed(2)}, Expected: ${Number(cashSession.expectedCash || 0).toFixed(2)}, Variance: ${variance.toFixed(2)}`;
        settlementGroup = 'shift_close';
      } else {
        const openingFloat = Number(input?.openingFloat);
        if (current.status !== 'closed' || !Number.isFinite(openingFloat) || openingFloat < 0) throw new Error('A closed session and a non-negative opening float are required to open a new shift.');
        cashSession = { id: `csh-sess-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, branchId: user.branchId, cashierId: user.id, cashierName: user.name, openedAt: now, openingFloat, cashSales: 0, cardSales: 0, walletSales: 0, cashPayouts: 0, cashDrops: 0, expectedCash: openingFloat, status: 'open', notes: `New shift initialized with opening float ${openingFloat.toFixed(2)}` };
        auditAction = 'CASH_SESSION_OPENED';
        auditDetails = `New drawer session opened with float ${openingFloat.toFixed(2)}`;
        settlementGroup = 'shift_open';
        drawerAmount = openingFloat;
      }

      this.writeNormalizedCashSession(cashSession, now);
      this.db.prepare('INSERT INTO cash_drawer_entries(id, cash_session_id, settlement_group, amount, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(`drawer-${action}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, cashSession.id, settlementGroup, drawerAmount, now);
      const syncEvent = { id: `sync-evt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, entityType: 'cash_sessions', entityId: cashSession.id, action: action === 'open' ? 'insert' : 'update', payloadJson: JSON.stringify(cashSession), createdAt: now, status: 'pending', syncAttemptCount: 0 };
      const auditLog = { id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now, userId: user.id, userName: user.name, branchId: user.branchId, action: auditAction, details: auditDetails };
      const syncOutbox = [syncEvent, ...(this.getStoredValue('sync_outbox', []))];
      const auditLogs = [auditLog, ...(this.getStoredValue('audit_logs', []))];
      for (const [key, value] of Object.entries({ cash_session: cashSession, sync_outbox: syncOutbox, audit_logs: auditLogs })) this.setValue(key, value);
      return { cashSession, syncOutbox, auditLogs };
    })();
  }

  getBackupConfig() {
    const row = this.db.prepare('SELECT config_json FROM backup_config WHERE id = 1').get();
    return validateBackupConfig(JSON.parse(row.config_json));
  }

  saveBackupConfig(config) {
    const validated = validateBackupConfig(config);
    this.db.prepare('UPDATE backup_config SET config_json = ?, updated_at = ? WHERE id = 1')
      .run(JSON.stringify(validated), isoTimestamp());
    this.scheduleAutomaticBackups();
    return validated;
  }

  getBackupStatus() {
    return this.db.prepare(`
      SELECT id, operation, destination_id AS destinationId, destination_label AS destinationLabel,
        file_path AS filePath, created_at AS createdAt, status, error_message AS errorMessage,
        size_bytes AS sizeBytes, checksum_sha256 AS checksumSha256
      FROM backup_status ORDER BY id DESC LIMIT 100
    `).all();
  }

  recordBackupStatus(record) {
    this.db.prepare(`
      INSERT INTO backup_status(operation, destination_id, destination_label, file_path, created_at,
        status, error_message, size_bytes, checksum_sha256)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.operation,
      record.destinationId || null,
      record.destinationLabel,
      record.filePath || null,
      isoTimestamp(),
      record.status,
      record.errorMessage || null,
      record.sizeBytes || null,
      record.checksumSha256 || null,
    );
  }

  recordBackupAudit(user, action, details) {
    const auditLog = {
      id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      timestamp: isoTimestamp(),
      userId: user.id,
      userName: user.name,
      branchId: user.branchId,
      action,
      details,
    };
    this.setValue('audit_logs', [auditLog, ...(this.getStoredValue('audit_logs', []))]);
  }

  validateDatabaseFile(filePath) {
    if (!fs.existsSync(filePath)) throw new Error('Backup file does not exist.');
    const candidate = new Database(filePath, { readonly: true, fileMustExist: true });
    try {
      const integrity = candidate.pragma('integrity_check', { simple: true });
      if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity}`);
      const kvTable = candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kv_store'").get();
      const version = candidate.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get();
      if (!kvTable || !version) throw new Error('The selected file is not a compatible RestoFlow backup.');
    } finally {
      candidate.close();
    }
  }

  async writeBackup(destinationPath, operation, destination) {
    const folder = path.dirname(destinationPath);
    const tempPath = `${destinationPath}.tmp`;
    try {
      fs.mkdirSync(folder, { recursive: true });
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
      removeSqliteSidecars(tempPath);
      this.db.pragma('wal_checkpoint(FULL)');
      await this.db.backup(tempPath);
      this.validateDatabaseFile(tempPath);
      fs.renameSync(tempPath, destinationPath);
      removeSqliteSidecars(tempPath);
      const stat = fs.statSync(destinationPath);
      const result = {
        destinationId: destination.id,
        destinationLabel: destination.label,
        filePath: destinationPath,
        status: 'success',
        sizeBytes: stat.size,
        checksumSha256: hashFile(destinationPath),
      };
      this.recordBackupStatus({ operation, ...result });
      return result;
    } catch (error) {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
      removeSqliteSidecars(tempPath);
      const result = {
        destinationId: destination.id,
        destinationLabel: destination.label,
        filePath: destinationPath,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      this.recordBackupStatus({ operation, ...result });
      return result;
    }
  }

  applyRetention(destination, retentionCount) {
    try {
      if (!fs.existsSync(destination.path)) return;
      const backups = fs.readdirSync(destination.path)
        .filter((name) => /^restoflow_.*\.sqlite$/i.test(name))
        .map((name) => ({ name, fullPath: path.join(destination.path, name), modified: fs.statSync(path.join(destination.path, name)).mtimeMs }))
        .sort((a, b) => b.modified - a.modified);
      for (const stale of backups.slice(retentionCount)) fs.rmSync(stale.fullPath, { force: true });
    } catch (error) {
      this.recordBackupStatus({
        operation: 'retention', destinationId: destination.id, destinationLabel: destination.label,
        status: 'failed', errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async automaticBackup(operation = 'automatic') {
    const config = this.getBackupConfig();
    const stamp = fileTimestamp();
    const results = [];
    for (const destination of config.destinations) {
      if (!destination.enabled) continue;
      const filePath = path.join(destination.path, `restoflow_${stamp}_${destination.id}.sqlite`);
      const result = await this.writeBackup(filePath, operation, destination);
      results.push(result);
      if (result.status === 'success') this.applyRetention(destination, config.retentionCount);
    }
    return results;
  }

  async exportBackup(browserWindow) {
    const result = await dialog.showSaveDialog(browserWindow, {
      title: 'Export RestoFlow Backup',
      defaultPath: `restoflow_manual_${fileTimestamp()}.sqlite`,
      filters: [{ name: 'RestoFlow SQLite Backup', extensions: ['sqlite', 'db'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const outputPath = result.filePath.toLowerCase().endsWith('.sqlite') || result.filePath.toLowerCase().endsWith('.db')
      ? result.filePath : `${result.filePath}.sqlite`;
    const record = await this.writeBackup(outputPath, 'manual_export', {
      id: 'manual-export', label: 'Manual export', path: path.dirname(outputPath), enabled: true,
    });
    return { canceled: false, ...record };
  }

  async inspectBackup(browserWindow) {
    const result = await dialog.showOpenDialog(browserWindow, {
      title: 'Verify a RestoFlow Backup',
      properties: ['openFile'],
      filters: [{ name: 'RestoFlow SQLite Backup', extensions: ['sqlite', 'db'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const sourcePath = result.filePaths[0];
    try {
      this.validateDatabaseFile(sourcePath);
      const candidate = new Database(sourcePath, { readonly: true, fileMustExist: true });
      let schemaVersion = '';
      try {
        schemaVersion = String(candidate.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get()?.value || 'unknown');
      } finally {
        candidate.close();
      }
      const stat = fs.statSync(sourcePath);
      const inspection = { canceled: false, verified: true, sourcePath, schemaVersion, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString(), checksumSha256: hashFile(sourcePath) };
      this.recordBackupStatus({ operation: 'inspection', destinationId: 'selected-backup', destinationLabel: 'Selected backup verification', filePath: sourcePath, status: 'success', sizeBytes: inspection.sizeBytes, checksumSha256: inspection.checksumSha256 });
      return inspection;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordBackupStatus({ operation: 'inspection', destinationId: 'selected-backup', destinationLabel: 'Selected backup verification', filePath: sourcePath, status: 'failed', errorMessage });
      return { canceled: false, verified: false, sourcePath, errorMessage };
    }
  }

  async restoreBackup(browserWindow) {
    const result = await dialog.showOpenDialog(browserWindow, {
      title: 'Select a RestoFlow Backup to Restore',
      properties: ['openFile'],
      filters: [{ name: 'RestoFlow SQLite Backup', extensions: ['sqlite', 'db'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const sourcePath = result.filePaths[0];
    this.validateDatabaseFile(sourcePath);

    const safetyBackups = await this.automaticBackup('pre_restore');
    if (!safetyBackups.some((backup) => backup.status === 'success')) {
      throw new Error('Restore was cancelled because no pre-restore backup could be created.');
    }

    const stagingPath = `${this.dbPath}.restore-${Date.now()}.tmp`;
    const previousPath = `${this.dbPath}.pre-restore-${Date.now()}`;
    fs.copyFileSync(sourcePath, stagingPath);
    this.validateDatabaseFile(stagingPath);
    try {
      this.close();
      fs.renameSync(this.dbPath, previousPath);
      fs.renameSync(stagingPath, this.dbPath);
      this.open();
      this.validateDatabaseFile(this.dbPath);
      this.sessions.clear();
      this.senderSessions.clear();
      this.recordBackupStatus({
        operation: 'restore', destinationId: 'active-database', destinationLabel: 'Active database',
        filePath: sourcePath, status: 'success', sizeBytes: fs.statSync(sourcePath).size, checksumSha256: hashFile(sourcePath),
      });
      return { canceled: false, restored: true, sourcePath, safetyBackups };
    } catch (error) {
      if (this.db) this.close();
      if (fs.existsSync(this.dbPath)) fs.rmSync(this.dbPath, { force: true });
      if (fs.existsSync(previousPath)) fs.renameSync(previousPath, this.dbPath);
      if (fs.existsSync(stagingPath)) fs.rmSync(stagingPath, { force: true });
      this.open();
      throw error;
    }
  }

  scheduleAutomaticBackups() {
    if (this.backupTimer) clearInterval(this.backupTimer);
    const { autoBackupHours } = this.getBackupConfig();
    this.backupTimer = setInterval(() => {
      this.automaticBackup('scheduled').catch(() => {});
    }, autoBackupHours * 60 * 60 * 1000);
  }
}

const runtime = new SqliteRuntime();

function validatePrinterConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Invalid printer configuration.');
  const connectionType = String(config.connectionType || '');
  if (config.enabled === false) throw new Error('This printer is disabled in Settings.');
  const shared = { connectionType, paperSize: config.paperSize === '58mm' ? '58mm' : '80mm', cutPaper: config.cutPaper !== false, copies: Math.min(10, Math.max(1, Number(config.copies || 1))) };
  if (connectionType === 'usb') {
    const systemPrinterName = String(config.systemPrinterName || '').trim();
    if (!systemPrinterName || systemPrinterName.length > 200) throw new Error('Select an installed Windows printer before printing.');
    return { ...shared, systemPrinterName };
  }
  if (connectionType !== 'network_ip') throw new Error('Only Network ESC/POS and Windows system printer connections are supported. Bluetooth printing is not configured.');
  const host = String(config.ipAddress || '').trim();
  const port = Number(config.port);
  if (!/^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A valid printer IPv4 address and TCP port are required.');
  return { ...shared, host, port };
}

function sendNetworkPrinterPayload(printer, payload, actionLabel) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: printer.host, port: printer.port });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Printer at ${printer.host}:${printer.port} did not respond within 5 seconds.`));
    }, 5000);
    socket.once('error', (error) => { clearTimeout(timeout); reject(error); });
    socket.once('connect', () => socket.end(payload));
    socket.once('close', (hadError) => {
      clearTimeout(timeout);
      if (!hadError) resolve({ success: true, message: `${actionLabel} sent to ${printer.host}:${printer.port} (${printer.paperSize}).` });
    });
  });
}

function escapePrintHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function printSystemThermal(printer, text) {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const width = printer.paperSize === '58mm' ? '58mm' : '80mm';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${width} auto;margin:0}html,body{margin:0;padding:0;width:${width}}body{font-family:monospace;font-size:${printer.paperSize === '58mm' ? '9px' : '10px'};line-height:1.25;color:#000}pre{box-sizing:border-box;margin:0;padding:3mm;white-space:pre-wrap;word-break:break-word}</style></head><body><pre>${escapePrintHtml(text)}</pre></body></html>`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (!printWindow.isDestroyed()) printWindow.destroy();
      if (error) reject(error); else resolve(result);
    };
    printWindow.webContents.once('did-finish-load', () => {
      printWindow.webContents.print({ silent: true, printBackground: true, deviceName: printer.systemPrinterName, copies: printer.copies, margins: { marginType: 'none' } }, (success, failureReason) => {
        if (!success) finish(new Error(`Windows print spooler rejected the job${failureReason ? `: ${failureReason}` : '.'}`));
        else finish(null, { success: true, message: `Print job sent to Windows printer ${printer.systemPrinterName} (${printer.paperSize}).` });
      });
    });
    printWindow.webContents.once('render-process-gone', (_event, details) => finish(new Error(`Windows print preview process stopped: ${details.reason}.`)));
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((error) => finish(error));
  });
}

function sendPrinterData(config, text) {
  const printer = validatePrinterConfig(config);
  const copyText = Array.from({ length: printer.copies }, () => String(text).slice(0, 12000)).join('\n\n');
  if (printer.connectionType === 'usb') return printSystemThermal(printer, copyText);
  const cutCommand = printer.cutPaper ? '\x1dV\x00' : '';
  const beepCommand = config.beepOnPrint ? '\x07' : '';
  const payload = Buffer.from(`\x1b@\x1ba\x01${copyText}\n\n\n${beepCommand}${cutCommand}`, 'utf8');
  return sendNetworkPrinterPayload(printer, payload, 'Print job');
}

function kickCashDrawer(config) {
  const printer = validatePrinterConfig(config);
  if (printer.connectionType !== 'network_ip') throw new Error('Cash-drawer pulse requires a raw Network ESC/POS printer connection.');
  return sendNetworkPrinterPayload(printer, Buffer.from('\x1b@\x1bp\x00\x19\xfa', 'binary'), 'Cash-drawer kick pulse');
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return window;
}

function registerIpc(mainWindow) {
  ipcMain.handle('storage:get-all', () => runtime.getSafeAll());
  ipcMain.handle('storage:bootstrap', (_event, values) => runtime.bootstrapInitialState(values));
  ipcMain.handle('auth:list-users', () => runtime.getLoginUsers());
  ipcMain.handle('auth:login', (event, input) => {
    const user = runtime.authenticate(input);
    runtime.bindSenderSession(event.sender.id, user.sessionToken);
    return user;
  });
  ipcMain.handle('auth:refresh', (_event, input) => runtime.refreshSession(input));
  ipcMain.handle('auth:logout', (event, input) => {
    runtime.logout(input);
    runtime.unbindSenderSession(event.sender.id);
  });
  ipcMain.handle('auth:recovery-status', () => runtime.getRecoveryStatus());
  ipcMain.handle('auth:reset-owner-pin', (_event, input) => runtime.resetOwnerPin(input));
  ipcMain.handle('reports:summary', (_event, input) => runtime.getAnalyticsReport(input));
  ipcMain.handle('pos:held-order', (_event, input) => runtime.manageHeldPosOrder(input));
  ipcMain.handle('pos:commit-order', (_event, input) => runtime.commitPosOrder(input));
  ipcMain.handle('pos:update-order-lifecycle', (_event, input) => runtime.updateOrderLifecycle(input));
  ipcMain.handle('kds:update-item', (_event, input) => runtime.updateKitchenItemStatus(input));
  ipcMain.handle('catalog:mutate', (_event, input) => runtime.manageCatalog(input));
  ipcMain.handle('seating:mutate', (_event, input) => runtime.manageSeating(input));
  ipcMain.handle('procurement:vendor', (_event, input) => runtime.manageVendor(input));
  ipcMain.handle('procurement:purchase-order', (_event, input) => runtime.savePurchaseOrder(input));
  ipcMain.handle('procurement:post-grn', (_event, input) => runtime.postGoodsReceived(input));
  ipcMain.handle('inventory:master', (_event, input) => runtime.manageInventoryMaster(input));
  ipcMain.handle('inventory:adjust-stock', (_event, input) => runtime.adjustInventoryStock(input));
  ipcMain.handle('inventory:quick-restock', (_event, input) => runtime.quickRestockIngredient(input));
  ipcMain.handle('inventory:report', (_event, input) => runtime.getInventoryReport(input));
  ipcMain.handle('inventory:variance', (_event, input) => runtime.recordInventoryVariance(input));
  ipcMain.handle('crm:mutate', (_event, input) => runtime.manageCrm(input));
  ipcMain.handle('security:mutate', (_event, input) => runtime.manageSecuritySettings(input));
  ipcMain.handle('config:mutate', (_event, input) => runtime.manageConfiguration(input));
  ipcMain.handle('staff:employee', (_event, input) => runtime.manageEmployee(input));
  ipcMain.handle('staff:attendance', (_event, input) => runtime.recordStaffAttendance(input));
  ipcMain.handle('staff:advance', (_event, input) => runtime.recordPayrollAdvance(input));
  ipcMain.handle('staff:payroll', (_event, input) => runtime.postPayroll(input));
  ipcMain.handle('finance:vendor-payment', (_event, input) => runtime.recordSupplierPayment(input));
  ipcMain.handle('finance:expense', (_event, input) => runtime.recordExpense(input));
  ipcMain.handle('finance:cash-session', (_event, input) => runtime.updateCashSession(input));
  ipcMain.handle('admin:reset-operational-data', async (event) => {
    const senderUser = runtime.getSenderUser(event.sender.id);
    const user = runtime.requirePermission({ id: senderUser.id, sessionToken: runtime.senderSessions.get(event.sender.id) }, 'canConfigureSettings');
    return runtime.resetOperationalData(user);
  });
  const requireBackupAccess = (event) => {
    const user = runtime.getSenderUser(event.sender.id);
    return runtime.requirePermission({ id: user.id, sessionToken: runtime.senderSessions.get(event.sender.id) }, 'canConfigureSettings');
  };
  ipcMain.handle('backup:get-config', (event) => { requireBackupAccess(event); return runtime.getBackupConfig(); });
  ipcMain.handle('backup:save-config', (event, config) => {
    const user = requireBackupAccess(event);
    const saved = runtime.saveBackupConfig(config);
    runtime.recordBackupAudit(user, 'BACKUP_CONFIGURATION_UPDATED', 'Updated automatic backup destinations, interval, or retention.');
    return saved;
  });
  ipcMain.handle('backup:get-status', (event) => { requireBackupAccess(event); return runtime.getBackupStatus(); });
  ipcMain.handle('backup:run-now', async (event) => {
    const user = requireBackupAccess(event);
    const results = await runtime.automaticBackup('manual_automatic');
    runtime.recordBackupAudit(user, 'BACKUP_RUN_REQUESTED', `${results.filter((result) => result.status === 'success').length}/${results.length} configured destination(s) completed.`);
    return results;
  });
  ipcMain.handle('backup:export', async (event) => {
    const user = requireBackupAccess(event);
    const result = await runtime.exportBackup(mainWindow);
    if (!result.canceled) runtime.recordBackupAudit(user, 'BACKUP_EXPORTED', result.status === 'success' ? 'Exported a verified SQLite backup.' : 'Backup export failed.');
    return result;
  });
  ipcMain.handle('backup:inspect', async (event) => {
    const user = requireBackupAccess(event);
    const result = await runtime.inspectBackup(mainWindow);
    if (!result.canceled) runtime.recordBackupAudit(user, 'BACKUP_VERIFIED', result.verified ? 'Verified a selected SQLite backup before restore.' : 'Backup verification failed.');
    return result;
  });
  ipcMain.handle('backup:restore', async (event) => {
    const user = requireBackupAccess(event);
    const result = await runtime.restoreBackup(mainWindow);
    if (result.restored) runtime.recordBackupAudit(user, 'BACKUP_RESTORED', 'Restored a validated SQLite backup and invalidated all terminal sessions.');
    return result;
  });
  const requirePrinterAccess = (event) => {
    const user = runtime.getSenderUser(event.sender.id);
    runtime.requirePermission({ id: user.id, sessionToken: runtime.senderSessions.get(event.sender.id) }, 'canAccessPos');
  };
  ipcMain.handle('printer:test', (event, config) => { requirePrinterAccess(event); return sendPrinterData(config, `${APP_NAME}\nTEST PRINT\n${isoTimestamp()}`); });
  ipcMain.handle('printer:print-text', (event, config, text) => { requirePrinterAccess(event); return sendPrinterData(config, text); });
  ipcMain.handle('printer:kick-drawer', (event, config) => { requirePrinterAccess(event); return kickCashDrawer(config); });
  ipcMain.handle('printer:list-system', async (event) => {
    const user = runtime.getSenderUser(event.sender.id);
    runtime.requirePermission({ id: user.id, sessionToken: runtime.senderSessions.get(event.sender.id) }, 'canConfigureSettings');
    const printers = await event.sender.getPrintersAsync();
    return printers.map((printer) => ({ name: String(printer.name || ''), displayName: String(printer.displayName || printer.name || ''), description: String(printer.description || ''), isDefault: Boolean(printer.isDefault), status: Number(printer.status || 0) })).filter((printer) => printer.name);
  });
  ipcMain.handle('app:info', () => ({ isDesktop: true, databasePath: runtime.dbPath }));
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.restoflow.desktop');
  runtime.open();
  protocol.handle('restoflow-media', (request) => {
    const fileName = productMediaFileName(request.url);
    if (!fileName) return new Response('Not found', { status: 404 });
    const targetPath = path.join(productMediaDirectory(), fileName);
    if (!fs.existsSync(targetPath)) return new Response('Not found', { status: 404 });
    try {
      return new Response(fs.readFileSync(targetPath), { headers: { 'content-type': mediaTypeForFile(fileName), 'cache-control': 'no-store' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  runtime.scheduleAutomaticBackups();
  runtime.automaticBackup('startup').catch(() => {});
  const mainWindow = createWindow();
  registerIpc(mainWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => runtime.close());
