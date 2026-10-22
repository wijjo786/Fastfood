const Database = require('better-sqlite3');

const databasePath = process.env.RESTOFLOW_DB_PATH;
if (!databasePath) throw new Error('RESTOFLOW_DB_PATH must point to the SQLite database to inspect.');

const db = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  const requiredTables = [
    'sales_orders', 'sales_order_items', 'sales_payments', 'inventory_movements',
    'cash_drawer_entries', 'ingredients', 'customers', 'vendors', 'inventory_variances',
    'purchase_orders', 'purchase_order_items', 'employees', 'staff_attendance',
    'payroll_advances', 'payroll_runs', 'payroll_items',
  ];
  const available = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  const version = db.prepare("SELECT value FROM app_meta WHERE key = 'normalized_schema_version'").get();
  const legacyOrders = JSON.parse(db.prepare("SELECT value_json FROM kv_store WHERE key = 'orders'").get()?.value_json || '[]');
  const foreignKeyViolations = db.pragma('foreign_key_check');
  console.log(JSON.stringify({
    normalizedSchemaVersion: version?.value || null,
    missingTables: requiredTables.filter((name) => !available.has(name)),
    legacyOrders: legacyOrders.length,
    salesOrders: db.prepare('SELECT count(*) AS count FROM sales_orders').get().count,
    payments: db.prepare('SELECT count(*) AS count FROM sales_payments').get().count,
    vendors: db.prepare('SELECT count(*) AS count FROM vendors').get().count,
    purchaseOrders: db.prepare('SELECT count(*) AS count FROM purchase_orders').get().count,
    employees: db.prepare('SELECT count(*) AS count FROM employees').get().count,
    payrollRuns: db.prepare('SELECT count(*) AS count FROM payroll_runs').get().count,
    foreignKeyViolations: foreignKeyViolations.length,
  }));
} finally {
  db.close();
}
