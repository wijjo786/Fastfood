// SQLite Simulation & Local Data Storage Service
// Simulates better-sqlite3 in Electron with ACID transactions, inventory auto-deduction,
// and complete CRUD UI management across Products, Tables, Recipes, Stock, Vendors, and Staff.

import {
  Order,
  OrderStatus,
  OrderItem,
  Ingredient,
  Recipe,
  RestaurantTable,
  Floor,
  FloorLayout,
  CashSession,
  SyncOutboxEvent,
  SystemAuditLog,
  Branch,
  Category,
  User,
  UserRole,
  RolePermissions,
  Product,
  Vendor,
  PurchaseOrder,
  GoodsReceivedNote,
  VendorPayment,
  Customer,
  LoyaltyTransaction,
  DeliveryZone,
  Expense,
  ExpenseCategory,
  Employee,
  StaffAttendance,
  PayrollAdvance,
  PayrollRun,
  ReceiptConfig,
  CustomRole,
  DeliveryOutcome,
  TableShape,
  HardwarePrinterSettings,
  PaymentMethodConfig,
  DeliveryMethodConfig,
  InventoryReport,
  InventoryVarianceRecord,
  HeldPosOrder,
  QuickStockPurchase,
} from '../types/restaurant';
import {
  INITIAL_BRANCHES,
  INITIAL_USERS,
  INITIAL_FLOORS,
  INITIAL_TABLES,
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_INGREDIENTS,
  INITIAL_RECIPES,
  INITIAL_ORDERS,
  INITIAL_RIDERS,
  INITIAL_CASH_SESSION,
  INITIAL_AUDIT_LOGS,
  INITIAL_VENDORS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_GRNS,
  INITIAL_CUSTOMERS,
  INITIAL_DELIVERY_ZONES,
  INITIAL_EXPENSE_CATEGORIES,
  INITIAL_EXPENSES,
  INITIAL_EMPLOYEES,
  INITIAL_ATTENDANCE,
  INITIAL_RECEIPT_CONFIG,
  INITIAL_CUSTOM_ROLES,
  INITIAL_PRINTER_SETTINGS,
  INITIAL_PAYMENT_METHODS,
  INITIAL_DELIVERY_METHODS,
} from '../data/mockDatabase';
import { formatCurrency } from '../utils/currency';
import { showUserError } from '../utils/userFeedback';

const STORAGE_KEY_PREFIX = 'restoflow_sqlite_';

let feedbackDesktopBridge: typeof window.restoFlowDesktop | undefined;

function getDesktopBridge() {
  const desktop = typeof window !== 'undefined' ? window.restoFlowDesktop : undefined;
  if (!desktop) return undefined;
  if (feedbackDesktopBridge) return feedbackDesktopBridge;

  // All renderer-to-main requests pass through this proxy. That guarantees an
  // Electron/SQLite failure is presented consistently instead of surfacing as
  // a raw "Error invoking remote method" string in individual screens.
  const wrap = (value: unknown): unknown => {
    if (typeof value === 'function') {
      return (...args: unknown[]) => {
        try {
          const result = value(...args);
          if (result && typeof (result as Promise<unknown>).then === 'function') {
            return (result as Promise<unknown>).catch((error) => {
              const message = showUserError(error);
              throw new Error(message);
            });
          }
          return result;
        } catch (error) {
          const message = showUserError(error);
          throw new Error(message);
        }
      };
    }
    if (value && typeof value === 'object') {
      // Electron contextBridge exposes frozen, non-configurable properties.
      // A Proxy cannot substitute their nested values without violating the
      // JavaScript proxy invariants, so build an ordinary safe wrapper object.
      return Object.fromEntries(Object.keys(value).map((key) => [key, wrap((value as Record<string, unknown>)[key])]));
    }
    return value;
  };

  feedbackDesktopBridge = wrap(desktop) as typeof window.restoFlowDesktop;
  return feedbackDesktopBridge;
}

function getStored<T>(key: string, defaultValue: T): T {
  if (getDesktopBridge()) {
    // Electron hydrates this service from SQLite before React mounts.
    return defaultValue;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (err) {
    console.warn('SQLite storage read fallback:', err);
    return defaultValue;
  }
}

function setStored<T>(key: string, val: T): void {
  if (getDesktopBridge()) return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(val));
  } catch (err) {
    console.error('SQLite storage write error:', err);
  }
}

const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  super_admin: { canAccessPos: true, canApplyDiscounts: true, canIssueRefunds: true, canManageMenu: true, canManageTables: true, canManageInventory: true, canManageProcurement: true, canViewFinancialReports: true, canManageStaff: true, canConfigureSettings: true },
  branch_admin: { canAccessPos: true, canApplyDiscounts: true, canIssueRefunds: true, canManageMenu: true, canManageTables: true, canManageInventory: true, canManageProcurement: true, canViewFinancialReports: true, canManageStaff: true, canConfigureSettings: false },
  manager: { canAccessPos: true, canApplyDiscounts: true, canIssueRefunds: true, canManageMenu: true, canManageTables: true, canManageInventory: true, canManageProcurement: true, canViewFinancialReports: true, canManageStaff: true, canConfigureSettings: false },
  cashier: { canAccessPos: true, canApplyDiscounts: false, canIssueRefunds: false, canManageMenu: false, canManageTables: true, canManageInventory: false, canManageProcurement: false, canViewFinancialReports: false, canManageStaff: false, canConfigureSettings: false },
  waiter: { canAccessPos: true, canApplyDiscounts: false, canIssueRefunds: false, canManageMenu: false, canManageTables: true, canManageInventory: false, canManageProcurement: false, canViewFinancialReports: false, canManageStaff: false, canConfigureSettings: false },
  kitchen_staff: { canAccessPos: false, canApplyDiscounts: false, canIssueRefunds: false, canManageMenu: false, canManageTables: false, canManageInventory: true, canManageProcurement: false, canViewFinancialReports: false, canManageStaff: false, canConfigureSettings: false },
  inventory_officer: { canAccessPos: false, canApplyDiscounts: false, canIssueRefunds: false, canManageMenu: false, canManageTables: false, canManageInventory: true, canManageProcurement: true, canViewFinancialReports: false, canManageStaff: false, canConfigureSettings: false },
  accountant: { canAccessPos: false, canApplyDiscounts: false, canIssueRefunds: false, canManageMenu: false, canManageTables: false, canManageInventory: false, canManageProcurement: true, canViewFinancialReports: true, canManageStaff: false, canConfigureSettings: false },
  delivery_rider: { canAccessPos: false, canApplyDiscounts: false, canIssueRefunds: false, canManageMenu: false, canManageTables: false, canManageInventory: false, canManageProcurement: false, canViewFinancialReports: false, canManageStaff: false, canConfigureSettings: false },
};

interface PosCommitResult {
  order: Order;
  tables: RestaurantTable[];
  ingredients: Ingredient[];
  customers: Customer[];
  cashSession: CashSession | null;
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
}

interface OrderLifecycleResult {
  order: Order;
  tables: RestaurantTable[];
  ingredients: Ingredient[];
  cashSession: CashSession | null;
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
}

interface KitchenItemUpdateResult {
  order: Order;
  orders: Order[];
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
}

interface GoodsReceivedResult {
  grn: GoodsReceivedNote;
  ingredients: Ingredient[];
  purchaseOrders: PurchaseOrder[];
  vendors: Vendor[];
  grns: GoodsReceivedNote[];
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
}

interface InventoryAdjustmentResult {
  ingredient: Ingredient;
  ingredients: Ingredient[];
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
  quickStockPurchases?: QuickStockPurchase[];
  cashSession?: CashSession | null;
}

interface CatalogMutationResult {
  category?: Category;
  product?: Product;
  categories: Category[];
  products: Product[];
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
}

interface SeatingMutationResult {
  floor?: Floor;
  table?: RestaurantTable;
  floors: Floor[];
  tables: RestaurantTable[];
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
}

interface InventoryMasterMutationResult {
  ingredient?: Ingredient;
  recipe?: Recipe;
  ingredients: Ingredient[];
  recipes: Recipe[];
  products: Product[];
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
}

interface CrmMutationResult {
  customer?: Customer;
  zone?: DeliveryZone;
  loyaltyTransaction?: LoyaltyTransaction;
  customers: Customer[];
  deliveryZones: DeliveryZone[];
  loyaltyTransactions: LoyaltyTransaction[];
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
}

interface SecurityMutationResult {
  role?: CustomRole;
  account?: User;
  customRoles: CustomRole[];
  users: User[];
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
}

interface ConfigurationMutationResult {
  branch?: Branch;
  receiptConfig: ReceiptConfig;
  printerSettings: HardwarePrinterSettings;
  paymentMethods: PaymentMethodConfig[];
  deliveryMethods: DeliveryMethodConfig[];
  syncOutbox: SyncOutboxEvent[];
  auditLogs: SystemAuditLog[];
}

export interface AnalyticsReport {
  orders: Order[];
  totalSales: number;
  totalTax: number;
  totalDiscounts: number;
  orderCount: number;
  channels: { dineIn: number; takeaway: number; delivery: number };
  payments: { cash: number; card: number; digital: number };
  topProducts: { productId: string; name: string; qty: number; revenue: number }[];
  operatingExpenses: number;
  directStockPurchases: number;
  startDate?: string;
  endDate?: string;
}

class SqliteStoreService {
  private branches: Branch[];
  private users: User[];
  private floors: Floor[];
  private tables: RestaurantTable[];
  private categories: Category[];
  private products: Product[];
  private ingredients: Ingredient[];
  private recipes: Recipe[];
  private orders: Order[];
  private cashSession: CashSession;
  private syncOutbox: SyncOutboxEvent[];
  private auditLogs: SystemAuditLog[];
  private isOnline: boolean = false;

  private vendors: Vendor[];
  private purchaseOrders: PurchaseOrder[];
  private grns: GoodsReceivedNote[];
  private vendorPayments: VendorPayment[];

  private customers: Customer[];
  private deliveryZones: DeliveryZone[];
  private loyaltyTransactions: LoyaltyTransaction[];

  private expenses: Expense[];
  private expenseCategories: ExpenseCategory[];
  private employees: Employee[];
  private attendances: StaffAttendance[];
  private payrollAdvances: PayrollAdvance[];
  private payrollRuns: PayrollRun[];
  private rolePermissions: Record<UserRole, RolePermissions>;
  private receiptConfig: ReceiptConfig;
  private customRoles: CustomRole[];
  private printerSettings: HardwarePrinterSettings;
  private paymentMethods: PaymentMethodConfig[];
  private deliveryMethods: DeliveryMethodConfig[];
  private heldOrders: HeldPosOrder[];
  private quickStockPurchases: QuickStockPurchase[];

  private money(amount: number): string {
    return formatCurrency(amount, this.branches[0]?.currencySymbol);
  }

  constructor() {
    this.branches = getStored('branches', INITIAL_BRANCHES);
    this.users = getStored('users', INITIAL_USERS);
    this.floors = getStored('floors', INITIAL_FLOORS);
    this.tables = getStored('tables', INITIAL_TABLES);
    this.categories = getStored('categories', INITIAL_CATEGORIES);
    this.products = getStored('products', INITIAL_PRODUCTS);
    this.ingredients = getStored('ingredients', INITIAL_INGREDIENTS);
    this.recipes = getStored('recipes', INITIAL_RECIPES);
    const storedOrders = getStored('orders', INITIAL_ORDERS);
    for (const initOrd of INITIAL_ORDERS) {
      if (!storedOrders.some((o: Order) => o.id === initOrd.id)) {
        storedOrders.push(initOrd);
      }
    }
    this.orders = storedOrders;
    this.cashSession = getStored('cash_session', INITIAL_CASH_SESSION);
    this.syncOutbox = getStored('sync_outbox', []);
    this.auditLogs = getStored('audit_logs', INITIAL_AUDIT_LOGS);

    this.vendors = getStored('vendors', INITIAL_VENDORS);
    this.purchaseOrders = getStored('purchase_orders', INITIAL_PURCHASE_ORDERS);
    this.grns = getStored('grns', INITIAL_GRNS);
    this.vendorPayments = getStored('vendor_payments', []);

    this.customers = getStored('customers', INITIAL_CUSTOMERS);
    this.deliveryZones = getStored('delivery_zones', INITIAL_DELIVERY_ZONES);
    this.loyaltyTransactions = getStored('loyalty_tx', []);

    this.expenses = getStored('expenses', INITIAL_EXPENSES);
    this.expenseCategories = getStored('expense_categories', INITIAL_EXPENSE_CATEGORIES);
    this.employees = getStored('employees', INITIAL_EMPLOYEES);
    this.attendances = getStored('attendances', INITIAL_ATTENDANCE);
    this.payrollAdvances = getStored('payroll_advances', []);
    this.payrollRuns = getStored('payroll_runs', []);
    this.rolePermissions = getStored('role_permissions', DEFAULT_ROLE_PERMISSIONS);
    this.receiptConfig = getStored('receipt_config', INITIAL_RECEIPT_CONFIG);
    this.customRoles = getStored('custom_roles', INITIAL_CUSTOM_ROLES);
    this.printerSettings = getStored('printer_settings', INITIAL_PRINTER_SETTINGS);
    this.paymentMethods = getStored('payment_methods', INITIAL_PAYMENT_METHODS);
    this.deliveryMethods = getStored('delivery_methods', INITIAL_DELIVERY_METHODS);
    this.heldOrders = getStored('held_orders', []);
    this.quickStockPurchases = getStored('quick_stock_purchases', []);
  }

  private exportPersistentState(): Record<string, unknown> {
    return {
      branches: this.branches,
      users: this.users,
      floors: this.floors,
      tables: this.tables,
      categories: this.categories,
      products: this.products,
      ingredients: this.ingredients,
      recipes: this.recipes,
      orders: this.orders,
      cash_session: this.cashSession,
      sync_outbox: this.syncOutbox,
      audit_logs: this.auditLogs,
      vendors: this.vendors,
      purchase_orders: this.purchaseOrders,
      grns: this.grns,
      vendor_payments: this.vendorPayments,
      customers: this.customers,
      delivery_zones: this.deliveryZones,
      loyalty_tx: this.loyaltyTransactions,
      expenses: this.expenses,
      expense_categories: this.expenseCategories,
      employees: this.employees,
      attendances: this.attendances,
      payroll_advances: this.payrollAdvances,
      payroll_runs: this.payrollRuns,
      role_permissions: this.rolePermissions,
      receipt_config: this.receiptConfig,
      custom_roles: this.customRoles,
      printer_settings: this.printerSettings,
      payment_methods: this.paymentMethods,
      delivery_methods: this.deliveryMethods,
      held_orders: this.heldOrders,
      quick_stock_purchases: this.quickStockPurchases,
    };
  }

  /** Hydrates the renderer cache from the Electron-owned SQLite database. */
  public async initialize(): Promise<void> {
    const desktop = getDesktopBridge();
    if (!desktop) return;
    let stored = await desktop.storage.getAll();
    if (Object.keys(stored).length === 0) {
      await desktop.storage.bootstrap(this.exportPersistentState());
      stored = await desktop.storage.getAll();
    }

    const use = <T>(key: string, fallback: T): T => (stored[key] === undefined ? fallback : stored[key] as T);
    this.branches = use('branches', this.branches);
    this.users = use('users', this.users);
    this.floors = use('floors', this.floors);
    this.tables = use('tables', this.tables);
    this.categories = use('categories', this.categories);
    this.products = use('products', this.products);
    this.ingredients = use('ingredients', this.ingredients);
    this.recipes = use('recipes', this.recipes);
    this.orders = use('orders', this.orders);
    this.cashSession = use('cash_session', this.cashSession);
    this.syncOutbox = use('sync_outbox', this.syncOutbox);
    this.auditLogs = use('audit_logs', this.auditLogs);
    this.vendors = use('vendors', this.vendors);
    this.purchaseOrders = use('purchase_orders', this.purchaseOrders);
    this.grns = use('grns', this.grns);
    this.vendorPayments = use('vendor_payments', this.vendorPayments);
    this.customers = use('customers', this.customers);
    this.deliveryZones = use('delivery_zones', this.deliveryZones);
    this.loyaltyTransactions = use('loyalty_tx', this.loyaltyTransactions);
    this.expenses = use('expenses', this.expenses);
    this.expenseCategories = use('expense_categories', this.expenseCategories);
    this.employees = use('employees', this.employees);
    this.attendances = use('attendances', this.attendances);
    this.payrollAdvances = use('payroll_advances', this.payrollAdvances);
    this.payrollRuns = use('payroll_runs', this.payrollRuns);
    this.rolePermissions = use('role_permissions', this.rolePermissions);
    this.receiptConfig = use('receipt_config', this.receiptConfig);
    this.customRoles = use('custom_roles', this.customRoles);
    this.printerSettings = use('printer_settings', this.printerSettings);
    this.paymentMethods = use('payment_methods', this.paymentMethods);
    this.deliveryMethods = use('delivery_methods', this.deliveryMethods);
    this.heldOrders = use('held_orders', this.heldOrders);
    this.quickStockPurchases = use('quick_stock_purchases', this.quickStockPurchases);
  }

  public async resetToFactoryDefaults(): Promise<void> {
    const desktop = getDesktopBridge();
    if (desktop) {
      await desktop.app.resetOperationalData();
      await this.initialize();
      return;
    }
    this.branches = INITIAL_BRANCHES;
    this.users = INITIAL_USERS;
    this.floors = INITIAL_FLOORS;
    this.tables = INITIAL_TABLES;
    this.categories = INITIAL_CATEGORIES;
    this.products = INITIAL_PRODUCTS;
    this.ingredients = INITIAL_INGREDIENTS;
    this.recipes = INITIAL_RECIPES;
    this.orders = INITIAL_ORDERS;
    this.cashSession = INITIAL_CASH_SESSION;
    this.syncOutbox = [];
    this.auditLogs = INITIAL_AUDIT_LOGS;

    this.vendors = INITIAL_VENDORS;
    this.purchaseOrders = INITIAL_PURCHASE_ORDERS;
    this.grns = INITIAL_GRNS;
    this.vendorPayments = [];

    this.customers = INITIAL_CUSTOMERS;
    this.deliveryZones = INITIAL_DELIVERY_ZONES;
    this.loyaltyTransactions = [];

    this.expenses = INITIAL_EXPENSES;
    this.expenseCategories = INITIAL_EXPENSE_CATEGORIES;
    this.employees = INITIAL_EMPLOYEES;
    this.attendances = INITIAL_ATTENDANCE;
    this.payrollAdvances = [];
    this.payrollRuns = [];
    this.rolePermissions = DEFAULT_ROLE_PERMISSIONS;
    this.receiptConfig = INITIAL_RECEIPT_CONFIG;
    this.customRoles = INITIAL_CUSTOM_ROLES;
    this.printerSettings = INITIAL_PRINTER_SETTINGS;
    this.paymentMethods = INITIAL_PAYMENT_METHODS;
    this.deliveryMethods = INITIAL_DELIVERY_METHODS;
    this.heldOrders = [];
    this.quickStockPurchases = [];

    setStored('branches', this.branches);
    setStored('users', this.users);
    setStored('floors', this.floors);
    setStored('tables', this.tables);
    setStored('categories', this.categories);
    setStored('products', this.products);
    setStored('ingredients', this.ingredients);
    setStored('recipes', this.recipes);
    setStored('orders', this.orders);
    setStored('cash_session', this.cashSession);
    setStored('sync_outbox', this.syncOutbox);
    setStored('audit_logs', this.auditLogs);
    setStored('vendors', this.vendors);
    setStored('purchase_orders', this.purchaseOrders);
    setStored('grns', this.grns);
    setStored('vendor_payments', this.vendorPayments);
    setStored('customers', this.customers);
    setStored('delivery_zones', this.deliveryZones);
    setStored('loyalty_tx', this.loyaltyTransactions);
    setStored('expenses', this.expenses);
    setStored('expense_categories', this.expenseCategories);
    setStored('employees', this.employees);
    setStored('attendances', this.attendances);
    setStored('payroll_advances', this.payrollAdvances);
    setStored('payroll_runs', this.payrollRuns);
    setStored('role_permissions', this.rolePermissions);
    setStored('receipt_config', this.receiptConfig);
    setStored('custom_roles', this.customRoles);
    setStored('printer_settings', this.printerSettings);
    setStored('payment_methods', this.paymentMethods);
    setStored('delivery_methods', this.deliveryMethods);
    setStored('held_orders', this.heldOrders);
    setStored('quick_stock_purchases', this.quickStockPurchases);
  }

  // --- Read Operations ---
  public getBranches(): Branch[] {
    return [...this.branches];
  }

  public async updateBranch(id: string, updates: Partial<Branch>, user?: User): Promise<Branch> {
    const desktop = getDesktopBridge();
    if (desktop) {
      if (!user) throw new Error('An authenticated administrator is required.');
      const result = await desktop.config.mutate({ action: 'update-store', branch: { ...updates, id }, user }) as ConfigurationMutationResult;
      if (!result.branch) throw new Error('The store profile could not be updated.');
      this.branches = this.branches.map((branch) => branch.id === result.branch!.id ? result.branch! : branch);
      this.receiptConfig = result.receiptConfig; this.printerSettings = result.printerSettings; this.paymentMethods = result.paymentMethods; this.deliveryMethods = result.deliveryMethods; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.branch;
    }
    const index = this.branches.findIndex((branch) => branch.id === id);
    if (index === -1) throw new Error('Store profile not found');
    this.branches[index] = { ...this.branches[index], ...updates };
    setStored('branches', this.branches);
    if (user) this.logAudit(user, 'STORE_PROFILE_UPDATED', 'Updated store currency, tax, or operational settings');
    return { ...this.branches[index] };
  }

  public getUsers(): User[] {
    return [...this.users];
  }

  public async addUser(user: Omit<User, 'id'>, currentUser?: User): Promise<User> {
    const desktop = getDesktopBridge();
    if (desktop) {
      if (!currentUser) throw new Error('An authenticated administrator is required.');
      const result = await desktop.security.mutate({ action: 'create-user', account: user, user: currentUser }) as SecurityMutationResult;
      if (!result.account) throw new Error('The user account could not be created.');
      this.users = result.users; this.customRoles = result.customRoles; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.account;
    }
    const newUser: User = {
      ...user,
      id: `usr-${Date.now()}`,
    };
    this.users.push(newUser);
    setStored('users', this.users);
    if (currentUser) {
      this.logAudit(currentUser, 'USER_CREATED', `Created staff account: ${newUser.name} (${newUser.role})`);
    }
    return newUser;
  }

  public async updateUser(id: string, updates: Partial<User>, currentUser?: User): Promise<User> {
    const desktop = getDesktopBridge();
    if (desktop) {
      if (!currentUser) throw new Error('An authenticated administrator is required.');
      const result = await desktop.security.mutate({ action: 'update-user', userId: id, account: updates, user: currentUser }) as SecurityMutationResult;
      if (!result.account) throw new Error('The user account could not be updated.');
      this.users = result.users; this.customRoles = result.customRoles; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.account;
    }
    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) throw new Error('User not found');
    this.users[index] = { ...this.users[index], ...updates };
    setStored('users', this.users);
    if (currentUser) {
      this.logAudit(currentUser, 'USER_UPDATED', `Updated staff account: ${this.users[index].name}`);
    }
    return this.users[index];
  }

  public async deleteUser(id: string, currentUser?: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      if (!currentUser) throw new Error('An authenticated administrator is required.');
      const result = await desktop.security.mutate({ action: 'delete-user', userId: id, user: currentUser }) as SecurityMutationResult;
      this.users = result.users; this.customRoles = result.customRoles; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return Boolean(result.account);
    }
    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) return false;
    const name = this.users[index].name;
    this.users.splice(index, 1);
    setStored('users', this.users);
    if (currentUser) {
      this.logAudit(currentUser, 'USER_DELETED', `Deleted staff account: ${name}`);
    }
    return true;
  }

  public getFloors(branchId: string): Floor[] {
    return this.floors.filter((f) => f.branchId === branchId);
  }

  public getTables(branchId: string): RestaurantTable[] {
    return this.tables.filter((t) => t.branchId === branchId);
  }

  public getCategories(): Category[] {
    return [...this.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  }

  public async addCategory(cat: Omit<Category, 'id'>, user: User): Promise<Category> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.catalog.mutate({ action: 'create-category', category: cat, user }) as CatalogMutationResult;
      if (!result.category) throw new Error('The category could not be created.');
      this.categories = result.categories;
      this.products = result.products;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.category;
    }
    const newCat: Category = {
      ...cat,
      id: `cat-${Date.now()}`,
    };
    this.categories.push(newCat);
    setStored('categories', this.categories);
    this.pushSyncOutbox('categories', newCat.id, 'insert', newCat);
    this.logAudit(user, 'CATEGORY_CREATED', `Added category: ${newCat.name}`);
    return newCat;
  }

  public async updateCategory(id: string, updates: Partial<Category>, user: User): Promise<Category | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.catalog.mutate({ action: 'update-category', categoryId: id, category: updates, user }) as CatalogMutationResult;
      this.categories = result.categories;
      this.products = result.products;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.category || null;
    }
    const index = this.categories.findIndex((c) => c.id === id);
    if (index === -1) return null;
    this.categories[index] = { ...this.categories[index], ...updates };
    setStored('categories', this.categories);
    this.pushSyncOutbox('categories', id, 'update', this.categories[index]);
    this.logAudit(user, 'CATEGORY_UPDATED', `Updated category: ${this.categories[index].name}`);
    return this.categories[index];
  }

  public async deleteCategory(id: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.catalog.mutate({ action: 'deactivate-category', categoryId: id, user }) as CatalogMutationResult;
      this.categories = result.categories;
      this.products = result.products;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return Boolean(result.category);
    }
    const index = this.categories.findIndex((c) => c.id === id);
    if (index === -1) return false;
    const name = this.categories[index].name;
    this.categories.splice(index, 1);
    setStored('categories', this.categories);
    this.pushSyncOutbox('categories', id, 'delete', { id });
    this.logAudit(user, 'CATEGORY_DELETED', `Deleted category: ${name}`);
    return true;
  }

  public getProducts(): Product[] {
    return [...this.products];
  }

  public getIngredients(branchId: string): Ingredient[] {
    return this.ingredients.filter((i) => i.branchId === branchId);
  }

  public getRecipes(): Recipe[] {
    return [...this.recipes];
  }

  public getOrders(branchId: string): Order[] {
    return this.orders
      .filter((o) => o.branchId === branchId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getAnalyticsReport(branchId: string, user: User, period?: { startDate?: string; endDate?: string }): Promise<AnalyticsReport> {
    const desktop = getDesktopBridge();
    if (desktop) {
      return desktop.reports.summary({ branchId, user, ...period }) as Promise<AnalyticsReport>;
    }
    const inPeriod = (value: string) => (!period?.startDate || value >= `${period.startDate}T00:00:00.000Z`) && (!period?.endDate || value < `${period.endDate}T23:59:59.999Z`);
    const orders = this.getOrders(branchId).filter((order) => !['draft', 'cancelled', 'refunded'].includes(order.status) && inPeriod(order.createdAt));
    const result: AnalyticsReport = {
      orders,
      totalSales: 0,
      totalTax: 0,
      totalDiscounts: 0,
      orderCount: orders.length,
      channels: { dineIn: 0, takeaway: 0, delivery: 0 },
      payments: { cash: 0, card: 0, digital: 0 },
      topProducts: [],
      operatingExpenses: this.getExpenses(branchId).filter((expense) => inPeriod(`${expense.date}T12:00:00.000Z`)).reduce((total, expense) => total + expense.amount, 0),
      directStockPurchases: this.getQuickStockPurchases(branchId).filter((purchase) => inPeriod(purchase.purchasedAt)).reduce((total, purchase) => total + purchase.totalAmount, 0),
      startDate: period?.startDate,
      endDate: period?.endDate,
    };
    const productMap = new Map<string, { productId: string; name: string; qty: number; revenue: number }>();
    for (const order of orders) {
      result.totalSales += order.grandTotal;
      result.totalTax += order.taxAmount;
      result.totalDiscounts += order.orderDiscountAmount;
      if (order.orderType === 'dine_in') result.channels.dineIn += 1;
      else if (order.orderType === 'takeaway') result.channels.takeaway += 1;
      else if (order.orderType === 'delivery') result.channels.delivery += 1;
      const payments = order.paymentSplits?.length ? order.paymentSplits : order.paymentMethod ? [{ method: order.paymentMethod, amount: order.amountPaid }] : [];
      for (const payment of payments) {
        if (payment.method === 'cash') result.payments.cash += payment.amount;
        else if (payment.method === 'card') result.payments.card += payment.amount;
        else result.payments.digital += payment.amount;
      }
      for (const item of order.items) {
        const current = productMap.get(item.productId) || { productId: item.productId, name: item.productName, qty: 0, revenue: 0 };
        current.qty += item.quantity;
        current.revenue += item.totalPrice;
        productMap.set(item.productId, current);
      }
    }
    result.topProducts = [...productMap.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 5);
    return result;
  }

  public getCashSession(): CashSession {
    return { ...this.cashSession };
  }

  public getSyncOutbox(): SyncOutboxEvent[] {
    return [...this.syncOutbox];
  }

  public getAuditLogs(): SystemAuditLog[] {
    return [...this.auditLogs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public toggleOnlineStatus(): boolean {
    this.isOnline = !this.isOnline;
    return this.isOnline;
  }

  public getVendors(): Vendor[] {
    return [...this.vendors];
  }

  public getPurchaseOrders(branchId: string): PurchaseOrder[] {
    return this.purchaseOrders
      .filter((po) => po.branchId === branchId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getGRNs(branchId: string): GoodsReceivedNote[] {
    return this.grns
      .filter((g) => g.branchId === branchId)
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }

  public getVendorPayments(branchId: string): VendorPayment[] {
    return this.vendorPayments
      .filter((p) => p.branchId === branchId)
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  }

  public getCustomers(): Customer[] {
    return [...this.customers].sort((a, b) => b.totalSpent - a.totalSpent);
  }

  public getDeliveryZones(branchId: string): DeliveryZone[] {
    return this.deliveryZones.filter((z) => z.branchId === branchId);
  }

  public getExpenses(branchId: string): Expense[] {
    return this.expenses
      .filter((e) => e.branchId === branchId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  public getExpenseCategories(): ExpenseCategory[] {
    return [...this.expenseCategories];
  }

  public getEmployees(branchId: string): Employee[] {
    return this.employees.filter((emp) => emp.branchId === branchId);
  }

  public getAttendances(branchId: string): StaffAttendance[] {
    return this.attendances
      .filter((att) => att.branchId === branchId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  public getPayrollAdvances(branchId: string): PayrollAdvance[] {
    return this.payrollAdvances.filter((advance) => advance.branchId === branchId);
  }

  public getPayrollRuns(branchId: string): PayrollRun[] {
    return this.payrollRuns.filter((run) => run.branchId === branchId);
  }

  public getRolePermissions(): Record<UserRole, RolePermissions> {
    return { ...this.rolePermissions };
  }

  public updateRolePermissions(role: UserRole, permissions: RolePermissions, user: User) {
    this.rolePermissions[role] = permissions;
    setStored('role_permissions', this.rolePermissions);
    this.logAudit(user, 'ROLE_PERMISSIONS_UPDATED', `Permissions updated for role ${role}`);
  }

  // RECEIPT PRINTER CONFIGURATION
  public getReceiptConfig(): ReceiptConfig {
    return { ...this.receiptConfig };
  }

  public async updateReceiptConfig(updates: Partial<ReceiptConfig>, user: User): Promise<ReceiptConfig> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.config.mutate({ action: 'update-receipt', receiptConfig: updates, user }) as ConfigurationMutationResult;
      this.receiptConfig = result.receiptConfig; this.printerSettings = result.printerSettings; this.paymentMethods = result.paymentMethods; this.deliveryMethods = result.deliveryMethods; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return this.getReceiptConfig();
    }
    this.receiptConfig = { ...this.receiptConfig, ...updates };
    setStored('receipt_config', this.receiptConfig);
    this.logAudit(user, 'RECEIPT_CONFIG_UPDATED', 'Configured thermal receipt printer parameters');
    return { ...this.receiptConfig };
  }

  // HARDWARE & NETWORK PRINTER CONFIGURATION (RECEIPT & KITCHEN)
  public getPrinterSettings(): HardwarePrinterSettings {
    return {
      ...this.printerSettings,
      receiptPrinter: { ...this.printerSettings.receiptPrinter },
      kitchenPrinter: { ...this.printerSettings.kitchenPrinter },
    };
  }

  public getPaymentMethods(): PaymentMethodConfig[] {
    return [...this.paymentMethods].sort((a, b) => a.displayOrder - b.displayOrder);
  }

  public getDeliveryMethods(): DeliveryMethodConfig[] {
    return [...this.deliveryMethods].sort((a, b) => a.displayOrder - b.displayOrder);
  }

  public async updateDeliveryMethods(methods: DeliveryMethodConfig[], user: User): Promise<DeliveryMethodConfig[]> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.config.mutate({ action: 'update-delivery-methods', deliveryMethods: methods, user }) as ConfigurationMutationResult;
      this.receiptConfig = result.receiptConfig; this.printerSettings = result.printerSettings; this.paymentMethods = result.paymentMethods; this.deliveryMethods = result.deliveryMethods; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return this.getDeliveryMethods();
    }
    if (!methods.some((method) => method.id === 'own_fleet' && method.enabled) || !methods.some((method) => method.id === 'foodpanda' && method.enabled)) {
      throw new Error('Own Fleet and Foodpanda must remain available delivery methods.');
    }
    this.deliveryMethods = methods.map((method, index) => ({ ...method, displayOrder: index + 1 }));
    setStored('delivery_methods', this.deliveryMethods);
    this.logAudit(user, 'DELIVERY_METHODS_UPDATED', 'Updated available delivery methods');
    return this.getDeliveryMethods();
  }

  public async updatePaymentMethods(methods: PaymentMethodConfig[], user: User): Promise<PaymentMethodConfig[]> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.config.mutate({ action: 'update-payment-methods', paymentMethods: methods, user }) as ConfigurationMutationResult;
      this.receiptConfig = result.receiptConfig; this.printerSettings = result.printerSettings; this.paymentMethods = result.paymentMethods; this.deliveryMethods = result.deliveryMethods; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return this.getPaymentMethods();
    }
    if (!methods.some((method) => method.id === 'cash' && method.enabled)) {
      throw new Error('Cash must remain enabled for offline POS operations.');
    }
    this.paymentMethods = methods.map((method, index) => ({ ...method, displayOrder: index + 1 }));
    setStored('payment_methods', this.paymentMethods);
    this.logAudit(user, 'PAYMENT_METHODS_UPDATED', 'Updated available POS payment methods');
    return this.getPaymentMethods();
  }

  public getHeldOrders(branchId: string): HeldPosOrder[] {
    return this.heldOrders
      .filter((order) => order.branchId === branchId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((order) => ({ ...order, items: order.items.map((item) => ({ ...item, selectedModifiers: [...item.selectedModifiers] })) }));
  }

  public async saveHeldOrder(order: Omit<HeldPosOrder, 'id' | 'branchId' | 'createdAt'>, user: User): Promise<HeldPosOrder[]> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.pos.heldOrder({ action: 'save', heldOrder: order, user }) as { heldOrders: HeldPosOrder[] };
      this.heldOrders = result.heldOrders;
      return this.getHeldOrders(user.branchId);
    }
    const heldOrder: HeldPosOrder = {
      ...order,
      id: `hold-${Date.now()}`,
      branchId: user.branchId,
      createdAt: new Date().toISOString(),
    };
    this.heldOrders = [heldOrder, ...this.heldOrders.filter((entry) => entry.id !== heldOrder.id)];
    setStored('held_orders', this.heldOrders);
    return this.getHeldOrders(user.branchId);
  }

  public async removeHeldOrder(id: string, user: User): Promise<HeldPosOrder[]> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.pos.heldOrder({ action: 'remove', heldOrderId: id, user }) as { heldOrders: HeldPosOrder[] };
      this.heldOrders = result.heldOrders;
      return this.getHeldOrders(user.branchId);
    }
    this.heldOrders = this.heldOrders.filter((order) => order.id !== id || order.branchId !== user.branchId);
    setStored('held_orders', this.heldOrders);
    return this.getHeldOrders(user.branchId);
  }

  public async updatePrinterSettings(
    updates: Partial<HardwarePrinterSettings>,
    user?: User
  ): Promise<HardwarePrinterSettings> {
    const desktop = getDesktopBridge();
    if (desktop) {
      if (!user) throw new Error('An authenticated administrator is required.');
      const result = await desktop.config.mutate({ action: 'update-printers', printerSettings: updates, user }) as ConfigurationMutationResult;
      this.receiptConfig = result.receiptConfig; this.printerSettings = result.printerSettings; this.paymentMethods = result.paymentMethods; this.deliveryMethods = result.deliveryMethods; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return this.getPrinterSettings();
    }
    this.printerSettings = {
      ...this.printerSettings,
      ...updates,
      receiptPrinter: updates.receiptPrinter
        ? { ...this.printerSettings.receiptPrinter, ...updates.receiptPrinter }
        : this.printerSettings.receiptPrinter,
      kitchenPrinter: updates.kitchenPrinter
        ? { ...this.printerSettings.kitchenPrinter, ...updates.kitchenPrinter }
        : this.printerSettings.kitchenPrinter,
    };
    setStored('printer_settings', this.printerSettings);
    if (user) {
      this.logAudit(
        user,
        'PRINTER_HARDWARE_CONFIG_UPDATED',
        `Configured printers: Receipt ${this.printerSettings.receiptPrinter.ipAddress} (${this.printerSettings.receiptPrinter.paperSize}), Kitchen ${this.printerSettings.kitchenPrinter.ipAddress} (${this.printerSettings.kitchenPrinter.paperSize})`
      );
    }
    return this.getPrinterSettings();
  }

  // CUSTOM ROLES & ACCESS CONTROL
  public getCustomRoles(): CustomRole[] {
    return [...this.customRoles];
  }

  public async addCustomRole(role: Omit<CustomRole, 'id'>, user: User): Promise<CustomRole> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.security.mutate({ action: 'create-role', role, user }) as SecurityMutationResult;
      if (!result.role) throw new Error('The custom role could not be created.');
      this.users = result.users; this.customRoles = result.customRoles; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.role;
    }
    const newRole: CustomRole = {
      ...role,
      id: `role-${Date.now()}`,
    };
    this.customRoles.push(newRole);
    setStored('custom_roles', this.customRoles);
    this.logAudit(user, 'ROLE_CREATED', `Created custom role: ${newRole.name}`);
    return newRole;
  }

  public async updateCustomRole(id: string, updates: Partial<CustomRole>, user: User): Promise<CustomRole> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.security.mutate({ action: 'update-role', roleId: id, role: updates, user }) as SecurityMutationResult;
      if (!result.role) throw new Error('The custom role could not be updated.');
      this.users = result.users; this.customRoles = result.customRoles; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.role;
    }
    const idx = this.customRoles.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('Role not found');
    this.customRoles[idx] = { ...this.customRoles[idx], ...updates };
    setStored('custom_roles', this.customRoles);
    this.logAudit(user, 'ROLE_UPDATED', `Updated permissions for custom role: ${this.customRoles[idx].name}`);
    return this.customRoles[idx];
  }

  public async deleteCustomRole(id: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.security.mutate({ action: 'delete-role', roleId: id, user }) as SecurityMutationResult;
      this.users = result.users; this.customRoles = result.customRoles; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return Boolean(result.role);
    }
    const idx = this.customRoles.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    const name = this.customRoles[idx].name;
    this.customRoles.splice(idx, 1);
    setStored('custom_roles', this.customRoles);
    this.logAudit(user, 'ROLE_DELETED', `Deleted custom role: ${name}`);
    return true;
  }

  // PIN AUTHENTICATION
  public authenticatePin(pin: string): User | null {
    const clean = pin.trim();
    if (!clean) return null;
    const matchedUser = this.users.find((u) => u.pin === clean);
    if (matchedUser) return matchedUser;
    return null;
  }

  public authenticateUserWithPin(userId: string, pin: string): { success: boolean; user?: User; error?: string } {
    const cleanPin = pin.trim();
    if (!cleanPin) {
      return { success: false, error: 'Please enter a 4-digit PIN.' };
    }
    const target = this.users.find((u) => u.id === userId);
    if (!target) {
      return { success: false, error: 'Staff account not found.' };
    }
    if (target.pin !== cleanPin) {
      return { success: false, error: `Incorrect PIN code for ${target.name}. Access denied.` };
    }
    return { success: true, user: target };
  }

  public verifyManagerOrAdminPin(pin: string): { verified: boolean; managerName?: string } {
    const clean = pin.trim();
    if (!clean) return { verified: false };
    const adminOrManager = this.users.find(
      (u) => (u.role === 'super_admin' || u.role === 'manager' || u.role === 'branch_admin') && u.pin === clean
    );
    if (adminOrManager) {
      return { verified: true, managerName: adminOrManager.name };
    }
    return { verified: false };
  }

  public getUserPermissions(user?: User | null): RolePermissions {
    if (!user) {
      return {
        canAccessPos: false,
        canApplyDiscounts: false,
        canIssueRefunds: false,
        canManageMenu: false,
        canManageTables: false,
        canManageInventory: false,
        canManageProcurement: false,
        canViewFinancialReports: false,
        canManageStaff: false,
        canConfigureSettings: false,
      };
    }

    if (user.role === 'super_admin') {
      return {
        canAccessPos: true,
        canApplyDiscounts: true,
        canIssueRefunds: true,
        canManageMenu: true,
        canManageTables: true,
        canManageInventory: true,
        canManageProcurement: true,
        canViewFinancialReports: true,
        canManageStaff: true,
        canConfigureSettings: true,
      };
    }

    // Match custom roles
    const matchedCustomRole = this.customRoles.find((r) => r.code === user.role || r.id === user.role);
    if (matchedCustomRole) {
      return { ...matchedCustomRole.permissions };
    }

    // Match role permissions
    if (this.rolePermissions[user.role as UserRole]) {
      return { ...this.rolePermissions[user.role as UserRole] };
    }

    return { ...DEFAULT_ROLE_PERMISSIONS.cashier };
  }

  // FLOOR / SECTION MANAGEMENT
  public async updateFloor(floorId: string, name: string, user: User): Promise<Floor> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.seating.mutate({ action: 'update-floor', floorId, floor: { name }, user }) as SeatingMutationResult;
      if (!result.floor) throw new Error('The floor section could not be updated.');
      this.floors = result.floors; this.tables = result.tables; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.floor;
    }
    const idx = this.floors.findIndex((f) => f.id === floorId);
    if (idx === -1) throw new Error('Section not found');
    this.floors[idx] = { ...this.floors[idx], name };
    setStored('floors', this.floors);
    this.logAudit(user, 'FLOOR_UPDATED', `Renamed section to: ${name}`);
    return this.floors[idx];
  }

  /** Save generic floor-canvas metadata without changing the floor's operational identity. */
  public async updateFloorLayout(floorId: string, layout: FloorLayout, user: User): Promise<Floor> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.seating.mutate({ action: 'update-floor', floorId, floor: { layout }, user }) as SeatingMutationResult;
      if (!result.floor) throw new Error('The floor layout could not be saved.');
      this.floors = result.floors; this.tables = result.tables; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.floor;
    }
    const index = this.floors.findIndex((floor) => floor.id === floorId);
    if (index < 0) throw new Error('Floor section not found.');
    this.floors[index] = { ...this.floors[index], layout };
    setStored('floors', this.floors);
    this.logAudit(user, 'FLOOR_LAYOUT_UPDATED', `Updated visual layout for ${this.floors[index].name}`);
    return this.floors[index];
  }

  public async deleteFloor(floorId: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.seating.mutate({ action: 'delete-floor', floorId, user }) as SeatingMutationResult;
      this.floors = result.floors; this.tables = result.tables; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return Boolean(result.floor);
    }
    if (this.floors.length <= 1) {
      return false; // Keep at least one section
    }
    const flr = this.floors.find((f) => f.id === floorId);
    if (!flr) return false;
    this.floors = this.floors.filter((f) => f.id !== floorId);
    const fallbackFloorId = this.floors[0].id;
    this.tables = this.tables.map((t) => (t.floorId === floorId ? { ...t, floorId: fallbackFloorId } : t));
    setStored('floors', this.floors);
    setStored('tables', this.tables);
    this.logAudit(user, 'FLOOR_DELETED', `Deleted floor section: ${flr.name} (tables migrated to ${this.floors[0].name})`);
    return true;
  }

  // DELIVERY OUTCOME & LOSS RECORDING
  public async updateDeliveryOutcome(
    orderId: string,
    outcome: DeliveryOutcome,
    details: {
      lossAmount?: number;
      lossReason?: string;
      absorbedBy?: 'restaurant' | 'rider' | 'aggregator';
      notes?: string;
    },
    user: User
  ): Promise<Order> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.pos.updateOrderLifecycle({
        orderId,
        status: outcome === 'delivered' ? 'delivered' : 'cancelled',
        patch: {
          deliveryOutcome: outcome,
          deliveryLossAmount: details.lossAmount || 0,
          deliveryLossReason: details.lossReason || '',
          deliveryLossAbsorbedBy: details.absorbedBy || 'restaurant',
          orderNotes: details.notes ? `[Outcome: ${outcome.toUpperCase()} - ${details.notes}]` : undefined,
        },
        user,
      }) as OrderLifecycleResult;
      this.orders = this.orders.map((order) => order.id === result.order.id ? result.order : order);
      this.tables = result.tables;
      this.ingredients = result.ingredients;
      if (result.cashSession) this.cashSession = result.cashSession;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.order;
    }

    const idx = this.orders.findIndex((o) => o.id === orderId);
    if (idx === -1) throw new Error('Order not found');
    const curr = this.orders[idx];
    const newStatus: OrderStatus = outcome === 'delivered' ? 'delivered' : 'cancelled';
    this.orders[idx] = {
      ...curr,
      status: newStatus,
      deliveryOutcome: outcome,
      deliveryLossAmount: details.lossAmount || 0,
      deliveryLossReason: details.lossReason || '',
      deliveryLossAbsorbedBy: details.absorbedBy || 'restaurant',
      orderNotes: details.notes ? `${curr.orderNotes || ''} [Outcome: ${outcome.toUpperCase()} - ${details.notes}]` : curr.orderNotes,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setStored('orders', this.orders);
    this.pushSyncOutbox('orders', curr.id, 'update', this.orders[idx]);
    this.logAudit(
      user,
      'DELIVERY_OUTCOME_LOGGED',
      `Order ${curr.invoiceNumber} recorded as ${outcome.toUpperCase()}. Loss: ${this.money(details.lossAmount || 0)} (${details.lossReason || 'N/A'})`
    );
    return this.orders[idx];
  }

  // --- IN-APP UI CRUD MUTATIONS ---

  // 1. PRODUCTS & MENU MANAGEMENT
  public async addProduct(product: Omit<Product, 'id'>, user: User): Promise<Product> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.catalog.mutate({ action: 'create-product', product, user }) as CatalogMutationResult;
      if (!result.product) throw new Error('The menu item could not be created.');
      this.categories = result.categories;
      this.products = result.products;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.product;
    }
    const newProduct: Product = {
      ...product,
      id: `prod-${Date.now()}`,
    };
    this.products.unshift(newProduct);
    setStored('products', this.products);
    this.pushSyncOutbox('products', newProduct.id, 'insert', newProduct);
    this.logAudit(user, 'PRODUCT_CREATED', `Added menu item: ${newProduct.name} (${this.money(newProduct.basePrice)})`);
    return newProduct;
  }

  public async updateProduct(id: string, updates: Partial<Product>, user: User): Promise<Product | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.catalog.mutate({ action: 'update-product', productId: id, product: updates, user }) as CatalogMutationResult;
      this.categories = result.categories;
      this.products = result.products;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.product || null;
    }
    const index = this.products.findIndex((p) => p.id === id);
    if (index === -1) return null;
    this.products[index] = { ...this.products[index], ...updates };
    setStored('products', this.products);
    this.pushSyncOutbox('products', id, 'update', this.products[index]);
    this.logAudit(user, 'PRODUCT_UPDATED', `Updated menu item: ${this.products[index].name}`);
    return this.products[index];
  }

  public async deleteProduct(id: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.catalog.mutate({ action: 'deactivate-product', productId: id, user }) as CatalogMutationResult;
      this.categories = result.categories;
      this.products = result.products;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return Boolean(result.product);
    }
    const index = this.products.findIndex((p) => p.id === id);
    if (index === -1) return false;
    const name = this.products[index].name;
    this.products.splice(index, 1);
    setStored('products', this.products);
    this.pushSyncOutbox('products', id, 'delete', { id });
    this.logAudit(user, 'PRODUCT_DELETED', `Removed menu item: ${name}`);
    return true;
  }

  // 2. TABLES & FLOORS MANAGEMENT
  public async addTable(table: Omit<RestaurantTable, 'id'>, user: User): Promise<RestaurantTable> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.seating.mutate({ action: 'create-table', table, user }) as SeatingMutationResult;
      if (!result.table) throw new Error('The table could not be created.');
      this.floors = result.floors; this.tables = result.tables; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.table;
    }
    const newTable: RestaurantTable = {
      ...table,
      id: `tbl-${Date.now()}`,
    };
    this.tables.push(newTable);
    setStored('tables', this.tables);
    this.pushSyncOutbox('tables', newTable.id, 'insert', newTable);
    this.logAudit(user, 'TABLE_CREATED', `Created table ${newTable.name} (Capacity: ${newTable.capacity})`);
    return newTable;
  }

  public async updateTable(id: string, updates: Partial<RestaurantTable>, user: User): Promise<RestaurantTable | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.seating.mutate({ action: 'update-table', tableId: id, table: updates, user }) as SeatingMutationResult;
      this.floors = result.floors; this.tables = result.tables; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.table || null;
    }
    const index = this.tables.findIndex((t) => t.id === id);
    if (index === -1) return null;
    this.tables[index] = { ...this.tables[index], ...updates };
    setStored('tables', this.tables);
    this.pushSyncOutbox('tables', id, 'update', this.tables[index]);
    this.logAudit(user, 'TABLE_UPDATED', `Updated table ${this.tables[index].name}`);
    return this.tables[index];
  }

  public async deleteTable(id: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.seating.mutate({ action: 'delete-table', tableId: id, user }) as SeatingMutationResult;
      this.floors = result.floors; this.tables = result.tables; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return Boolean(result.table);
    }
    const index = this.tables.findIndex((t) => t.id === id);
    if (index === -1) return false;
    const name = this.tables[index].name;
    this.tables.splice(index, 1);
    setStored('tables', this.tables);
    this.pushSyncOutbox('tables', id, 'delete', { id });
    this.logAudit(user, 'TABLE_DELETED', `Deleted table ${name}`);
    return true;
  }

  public async addFloor(name: string, branchId: string, user?: User): Promise<Floor> {
    const desktop = getDesktopBridge();
    if (desktop) {
      if (!user) throw new Error('An authenticated user is required to create a floor section.');
      const result = await desktop.seating.mutate({ action: 'create-floor', floor: { name, branchId }, user }) as SeatingMutationResult;
      if (!result.floor) throw new Error('The floor section could not be created.');
      this.floors = result.floors; this.tables = result.tables; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.floor;
    }
    const newFloor: Floor = {
      id: `flr-${Date.now()}`,
      branchId,
      name,
      displayOrder: this.floors.length + 1,
    };
    this.floors.push(newFloor);
    setStored('floors', this.floors);
    return newFloor;
  }

  // 3. INVENTORY INGREDIENTS MANAGEMENT
  private recalculateRecipeCosts(): void {
    const ingredientById = new Map(this.ingredients.map((ingredient) => [ingredient.id, ingredient]));
    this.recipes = this.recipes.map((recipe) => {
      const items = recipe.items.map((item) => {
        const ingredient = ingredientById.get(item.ingredientId);
        const unitCost = ingredient ? Number(ingredient.unitCost || 0) : Number(item.unitCost || 0);
        return { ...item, unitCost, totalCost: +(Number(item.quantity || 0) * unitCost).toFixed(2) };
      });
      const rawCost = items.reduce((total, item) => total + item.totalCost, 0);
      const calculatedCost = +(rawCost * (1 + Number(recipe.wastagePercent || 0) / 100)).toFixed(2);
      const foodCostPercent = recipe.sellingPrice > 0 ? +((calculatedCost / recipe.sellingPrice) * 100).toFixed(1) : 0;
      return { ...recipe, items, calculatedCost, foodCostPercent };
    });
    setStored('recipes', this.recipes);
  }

  public async addIngredient(ing: Omit<Ingredient, 'id'>, user: User): Promise<Ingredient> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.inventory.master({ action: 'create-ingredient', ingredient: ing, user }) as InventoryMasterMutationResult;
      if (!result.ingredient) throw new Error('The ingredient could not be created.');
      this.ingredients = result.ingredients; this.recipes = result.recipes; this.products = result.products; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.ingredient;
    }
    const newIng: Ingredient = {
      ...ing,
      id: `ing-${Date.now()}`,
    };
    this.ingredients.unshift(newIng);
    setStored('ingredients', this.ingredients);
    this.recalculateRecipeCosts();
    this.pushSyncOutbox('ingredients', newIng.id, 'insert', newIng);
    this.logAudit(user, 'INGREDIENT_CREATED', `Added raw ingredient: ${newIng.name} (${newIng.currentStock} ${newIng.unit})`);
    return newIng;
  }

  public async updateIngredient(id: string, updates: Partial<Ingredient>, user: User): Promise<Ingredient | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.inventory.master({ action: 'update-ingredient', ingredientId: id, ingredient: updates, user }) as InventoryMasterMutationResult;
      this.ingredients = result.ingredients; this.recipes = result.recipes; this.products = result.products; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.ingredient || null;
    }
    const index = this.ingredients.findIndex((i) => i.id === id);
    if (index === -1) return null;
    this.ingredients[index] = { ...this.ingredients[index], ...updates };
    setStored('ingredients', this.ingredients);
    this.recalculateRecipeCosts();
    this.pushSyncOutbox('ingredients', id, 'update', this.ingredients[index]);
    this.logAudit(user, 'INGREDIENT_UPDATED', `Updated ingredient: ${this.ingredients[index].name}`);
    return this.ingredients[index];
  }

  public async deleteIngredient(id: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.inventory.master({ action: 'delete-ingredient', ingredientId: id, user }) as InventoryMasterMutationResult;
      this.ingredients = result.ingredients; this.recipes = result.recipes; this.products = result.products; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return Boolean(result.ingredient);
    }
    const index = this.ingredients.findIndex((i) => i.id === id);
    if (index === -1) return false;
    const name = this.ingredients[index].name;
    this.ingredients.splice(index, 1);
    setStored('ingredients', this.ingredients);
    this.pushSyncOutbox('ingredients', id, 'delete', { id });
    this.logAudit(user, 'INGREDIENT_DELETED', `Deleted ingredient: ${name}`);
    return true;
  }

  // 4. RECIPES (BOM) MANAGEMENT
  public async createRecipe(recipe: Omit<Recipe, 'id'>, user: User): Promise<Recipe> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.inventory.master({ action: 'create-recipe', recipe, user }) as InventoryMasterMutationResult;
      if (!result.recipe) throw new Error('The recipe could not be created.');
      this.ingredients = result.ingredients; this.recipes = result.recipes; this.products = result.products; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.recipe;
    }
    const newRec: Recipe = {
      ...recipe,
      id: `rec-${Date.now()}`,
    };
    this.recipes.unshift(newRec);
    setStored('recipes', this.recipes);

    // Link product to this recipe
    const pIndex = this.products.findIndex((p) => p.id === recipe.productId);
    if (pIndex !== -1) {
      this.products[pIndex].recipeId = newRec.id;
      setStored('products', this.products);
    }

    this.pushSyncOutbox('recipes', newRec.id, 'insert', newRec);
    this.logAudit(user, 'RECIPE_CREATED', `Configured recipe BOM for: ${newRec.productName}`);
    return newRec;
  }

  public async updateRecipe(id: string, updates: Partial<Recipe>, user: User): Promise<Recipe | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.inventory.master({ action: 'update-recipe', recipeId: id, recipe: updates, user }) as InventoryMasterMutationResult;
      this.ingredients = result.ingredients; this.recipes = result.recipes; this.products = result.products; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.recipe || null;
    }
    const index = this.recipes.findIndex((r) => r.id === id);
    if (index === -1) return null;
    this.recipes[index] = { ...this.recipes[index], ...updates };
    setStored('recipes', this.recipes);
    this.pushSyncOutbox('recipes', id, 'update', this.recipes[index]);
    this.logAudit(user, 'RECIPE_UPDATED', `Updated recipe BOM for: ${this.recipes[index].productName}`);
    return this.recipes[index];
  }

  public async deleteRecipe(id: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.inventory.master({ action: 'delete-recipe', recipeId: id, user }) as InventoryMasterMutationResult;
      this.ingredients = result.ingredients; this.recipes = result.recipes; this.products = result.products; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return Boolean(result.recipe);
    }
    const index = this.recipes.findIndex((r) => r.id === id);
    if (index === -1) return false;
    const name = this.recipes[index].productName;
    const prodId = this.recipes[index].productId;
    this.recipes.splice(index, 1);
    setStored('recipes', this.recipes);

    // Unlink product recipeId
    const pIndex = this.products.findIndex((p) => p.id === prodId);
    if (pIndex !== -1) {
      this.products[pIndex].recipeId = undefined;
      setStored('products', this.products);
    }

    this.pushSyncOutbox('recipes', id, 'delete', { id });
    this.logAudit(user, 'RECIPE_DELETED', `Deleted recipe BOM for: ${name}`);
    return true;
  }

  // 5. VENDORS & SUPPLIERS MANAGEMENT
  public async addVendor(vendor: Omit<Vendor, 'id' | 'outstandingBalance'>, user: User): Promise<Vendor> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.procurement.vendor({ action: 'create', vendor, user }) as { vendor: Vendor; vendors: Vendor[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.vendors = result.vendors;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.vendor;
    }
    const newVendor: Vendor = {
      ...vendor,
      id: `vnd-${Date.now()}`,
      outstandingBalance: 0,
    };
    this.vendors.unshift(newVendor);
    setStored('vendors', this.vendors);
    this.pushSyncOutbox('vendors', newVendor.id, 'insert', newVendor);
    this.logAudit(user, 'VENDOR_CREATED', `Added supplier: ${newVendor.name} (${newVendor.paymentTerms})`);
    return newVendor;
  }

  public async updateVendor(id: string, updates: Partial<Vendor>, user: User): Promise<Vendor | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.procurement.vendor({ action: 'update', vendorId: id, vendor: updates, user }) as { vendor: Vendor; vendors: Vendor[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.vendors = result.vendors;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.vendor;
    }
    const index = this.vendors.findIndex((v) => v.id === id);
    if (index === -1) return null;
    this.vendors[index] = { ...this.vendors[index], ...updates };
    setStored('vendors', this.vendors);
    this.pushSyncOutbox('vendors', id, 'update', this.vendors[index]);
    this.logAudit(user, 'VENDOR_UPDATED', `Updated vendor: ${this.vendors[index].name}`);
    return this.vendors[index];
  }

  public async deleteVendor(id: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.procurement.vendor({ action: 'deactivate', vendorId: id, user }) as { vendors: Vendor[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.vendors = result.vendors;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return true;
    }
    const index = this.vendors.findIndex((v) => v.id === id);
    if (index === -1) return false;
    const name = this.vendors[index].name;
    this.vendors.splice(index, 1);
    setStored('vendors', this.vendors);
    this.pushSyncOutbox('vendors', id, 'delete', { id });
    this.logAudit(user, 'VENDOR_DELETED', `Deleted vendor: ${name}`);
    return true;
  }

  // 6. STAFF & EMPLOYEES MANAGEMENT
  public async addEmployee(emp: Omit<Employee, 'id'>, user: User): Promise<Employee> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.staff.employee({ action: 'create', employee: emp, user }) as { employee: Employee; employees: Employee[]; users: User[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.employees = result.employees; this.users = result.users; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.employee;
    }
    const newEmp: Employee = {
      ...emp,
      id: `emp-${Date.now()}`,
    };
    this.employees.unshift(newEmp);
    setStored('employees', this.employees);

    // Also add to system users login directory
    this.users.push({
      id: newEmp.id,
      name: newEmp.name,
      role: newEmp.role,
      branchId: newEmp.branchId,
      pin: newEmp.pin,
      email: newEmp.email,
    });
    setStored('users', this.users);

    this.pushSyncOutbox('employees', newEmp.id, 'insert', newEmp);
    this.logAudit(user, 'EMPLOYEE_HIRED', `Onboarded employee: ${newEmp.name} [${newEmp.role.toUpperCase()}]`);
    return newEmp;
  }

  public async updateEmployee(id: string, updates: Partial<Employee>, user: User): Promise<Employee | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.staff.employee({ action: 'update', employeeId: id, employee: updates, user }) as { employee: Employee; employees: Employee[]; users: User[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.employees = result.employees; this.users = result.users; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.employee;
    }
    const index = this.employees.findIndex((e) => e.id === id);
    if (index === -1) return null;
    this.employees[index] = { ...this.employees[index], ...updates };
    setStored('employees', this.employees);

    // Update matching user
    const uIndex = this.users.findIndex((u) => u.id === id);
    if (uIndex !== -1) {
      if (updates.name) this.users[uIndex].name = updates.name;
      if (updates.role) this.users[uIndex].role = updates.role;
      if (updates.pin) this.users[uIndex].pin = updates.pin;
      if (updates.email) this.users[uIndex].email = updates.email;
      setStored('users', this.users);
    }

    this.logAudit(user, 'EMPLOYEE_UPDATED', `Updated employee: ${this.employees[index].name}`);
    return this.employees[index];
  }

  public async deleteEmployee(id: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.staff.employee({ action: 'deactivate', employeeId: id, user }) as { employees: Employee[]; users: User[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.employees = result.employees; this.users = result.users; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return true;
    }
    const index = this.employees.findIndex((e) => e.id === id);
    if (index === -1) return false;
    const name = this.employees[index].name;
    this.employees.splice(index, 1);
    setStored('employees', this.employees);

    this.users = this.users.filter((u) => u.id !== id);
    setStored('users', this.users);

    this.pushSyncOutbox('employees', id, 'delete', { id });
    this.logAudit(user, 'EMPLOYEE_REMOVED', `Removed employee: ${name}`);
    return true;
  }

  // Orders & Transactions
  public async createOrder(
    order: Omit<Order, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt'> | Order,
    cashierUser: User
  ): Promise<Order> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.pos.commitOrder({
        order,
        cashier: cashierUser,
        state: {
          branches: this.branches,
          categories: this.categories,
          products: this.products,
          ingredients: this.ingredients,
          recipes: this.recipes,
          tables: this.tables,
          customers: this.customers,
          cashSession: this.cashSession,
          orders: this.orders,
          syncOutbox: this.syncOutbox,
          auditLogs: this.auditLogs,
          paymentMethods: this.paymentMethods,
        },
      }) as PosCommitResult;
      this.orders = [result.order, ...this.orders];
      this.tables = result.tables;
      this.ingredients = result.ingredients;
      this.customers = result.customers;
      if (result.cashSession) this.cashSession = result.cashSession;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.order;
    }

    const nextInvoiceSeq = this.orders.length + 845;
    const finalOrder: Order = {
      ...order,
      id: `ord-${Date.now()}`,
      invoiceNumber: `INV-2026-0${nextInvoiceSeq}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cashierId: cashierUser.id,
      cashierName: cashierUser.name,
    };

    this.orders.unshift(finalOrder);
    setStored('orders', this.orders);

    if (finalOrder.orderType === 'dine_in' && finalOrder.tableId) {
      this.tables = this.tables.map((t) =>
        t.id === finalOrder.tableId
          ? {
              ...t,
              status: 'occupied',
              currentOrderId: finalOrder.id,
              currentGuests: 2,
              occupiedSince: new Date().toISOString(),
            }
          : t
      );
      setStored('tables', this.tables);
    }

    if (finalOrder.amountPaid > 0) {
      this.recordPaymentIntoCashDrawer(finalOrder);
    }

    this.deductIngredientsForOrder(finalOrder);

    if (finalOrder.customerPhone || finalOrder.customerName) {
      this.updateCustomerSpend(finalOrder);
    }

    this.pushSyncOutbox('orders', finalOrder.id, 'insert', finalOrder);
    this.logAudit(
      cashierUser,
      'ORDER_CREATED',
      `Order ${finalOrder.invoiceNumber} (${finalOrder.orderType.toUpperCase()}) created with total ${this.money(finalOrder.grandTotal)}`
    );

    return finalOrder;
  }

  private updateCustomerSpend(order: Order) {
    let cust = this.customers.find(
      (c) => c.phone === order.customerPhone || c.name.toLowerCase() === order.customerName?.toLowerCase()
    );

    if (cust) {
      const earnedPoints = Math.floor(order.grandTotal);
      cust.loyaltyPoints += earnedPoints;
      cust.totalOrders += 1;
      cust.totalSpent = +(cust.totalSpent + order.grandTotal).toFixed(2);
      cust.lastOrderDate = new Date().toISOString();
    } else if (order.customerName) {
      const earnedPoints = Math.floor(order.grandTotal);
      const newCust: Customer = {
        id: `cust-${Date.now()}`,
        name: order.customerName,
        phone: order.customerPhone || '+1 555-000-0000',
        primaryAddress: order.deliveryAddress,
        tags: [order.orderType === 'delivery' ? 'Delivery' : 'Regular'],
        loyaltyPoints: earnedPoints,
        totalOrders: 1,
        totalSpent: order.grandTotal,
        lastOrderDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      this.customers.push(newCust);
    }
    setStored('customers', this.customers);
  }

  public async updateOrderStatus(orderId: string, newStatus: OrderStatus, user: User): Promise<Order | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.pos.updateOrderLifecycle({
        orderId,
        status: newStatus,
        user,
      }) as OrderLifecycleResult;
      this.orders = this.orders.map((order) => order.id === result.order.id ? result.order : order);
      this.tables = result.tables;
      this.ingredients = result.ingredients;
      if (result.cashSession) this.cashSession = result.cashSession;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.order;
    }

    const orderIndex = this.orders.findIndex((o) => o.id === orderId);
    if (orderIndex === -1) return null;

    const oldStatus = this.orders[orderIndex].status;
    const updatedOrder: Order = {
      ...this.orders[orderIndex],
      status: newStatus,
      updatedAt: new Date().toISOString(),
      completedAt: ['served', 'completed', 'delivered', 'cancelled', 'refunded'].includes(newStatus)
        ? new Date().toISOString()
        : this.orders[orderIndex].completedAt,
    };

    this.orders[orderIndex] = updatedOrder;
    setStored('orders', this.orders);

    if (updatedOrder.tableId && ['served', 'completed', 'refunded', 'cancelled'].includes(newStatus)) {
      this.tables = this.tables.map((t) =>
        t.id === updatedOrder.tableId
          ? {
              ...t,
              status: 'cleaning',
              currentOrderId: undefined,
              occupiedSince: undefined,
            }
          : t
      );
      setStored('tables', this.tables);
    }

    this.pushSyncOutbox('orders', updatedOrder.id, 'update', updatedOrder);
    this.logAudit(
      user,
      'ORDER_STATUS_CHANGED',
      `Order ${updatedOrder.invoiceNumber} status shifted from ${oldStatus} to ${newStatus}`
    );

    return updatedOrder;
  }

  /** Cancels/refunds a ticket, either restoring uncooked stock or retaining consumed food as a documented loss. */
  public async reverseOrder(
    orderId: string,
    status: 'cancelled' | 'refunded',
    reversalMode: 'restore_stock' | 'prepared_waste',
    reversalReason: string,
    user: User,
  ): Promise<Order | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.pos.updateOrderLifecycle({ orderId, status, reversalMode, reversalReason, user }) as OrderLifecycleResult;
      this.orders = this.orders.map((order) => order.id === result.order.id ? result.order : order);
      this.tables = result.tables;
      this.ingredients = result.ingredients;
      if (result.cashSession) this.cashSession = result.cashSession;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.order;
    }
    const index = this.orders.findIndex((order) => order.id === orderId);
    if (index < 0) return null;
    const order = this.orders[index];
    if (['cancelled', 'refunded'].includes(order.status)) throw new Error('This order has already been reversed.');
    if (reversalMode === 'prepared_waste' && !reversalReason.trim()) throw new Error('A reason is required when prepared food is written off.');
    this.orders[index] = { ...order, status, ...(reversalMode === 'prepared_waste' ? { foodLossAmount: 0, foodLossReason: reversalReason.trim(), foodLossType: status === 'refunded' ? 'customer_return' as const : 'cancelled_after_preparation' as const } : {}), updatedAt: new Date().toISOString(), completedAt: new Date().toISOString() };
    setStored('orders', this.orders);
    this.logAudit(user, `ORDER_${status.toUpperCase()}`, `Order ${order.invoiceNumber} ${reversalMode === 'prepared_waste' ? `recorded with prepared-food loss: ${reversalReason}` : 'reversed before preparation.'}`);
    return this.orders[index];
  }

  public async updateKitchenItemStatus(
    orderId: string,
    itemId: string,
    newStatus: 'pending' | 'preparing' | 'ready',
    user: User
  ): Promise<Order | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.kds.updateItem({ orderId, itemId, status: newStatus, user }) as KitchenItemUpdateResult;
      this.orders = result.orders;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.order;
    }

    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return null;

    const updatedItems = order.items.map((item) =>
      item.id === itemId ? { ...item, kitchenStatus: newStatus } : item
    );

    const allReady = updatedItems.every((item) => item.kitchenStatus === 'ready');
    const orderStatus: OrderStatus = allReady
      ? 'ready'
      : order.status === 'draft' || order.status === 'confirmed'
      ? 'preparing'
      : order.status;

    const updatedOrder: Order = {
      ...order,
      items: updatedItems,
      status: orderStatus,
      updatedAt: new Date().toISOString(),
    };

    const index = this.orders.findIndex((o) => o.id === orderId);
    this.orders[index] = updatedOrder;
    setStored('orders', this.orders);

    this.pushSyncOutbox('orders', updatedOrder.id, 'update', updatedOrder);
    this.logAudit(
      user,
      'KDS_ITEM_BUMP',
      `Order ${order.invoiceNumber} item status marked ${newStatus}`
    );

    return updatedOrder;
  }

  public settlePayment(
    orderId: string,
    paymentMethod: Order['paymentMethod'],
    amountPaid: number,
    changeGiven: number,
    splits: Order['paymentSplits'],
    user: User
  ): Order | null {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return null;

    const updatedOrder: Order = {
      ...order,
      paymentMethod,
      amountPaid,
      changeGiven,
      paymentSplits: splits,
      updatedAt: new Date().toISOString(),
    };

    const index = this.orders.findIndex((o) => o.id === orderId);
    this.orders[index] = updatedOrder;
    setStored('orders', this.orders);

    this.recordPaymentIntoCashDrawer(updatedOrder);
    this.pushSyncOutbox('orders', updatedOrder.id, 'update', updatedOrder);

    this.logAudit(
      user,
      'PAYMENT_COLLECTED',
      `Payment collected for ${updatedOrder.invoiceNumber}: ${this.money(amountPaid)} (${paymentMethod?.toUpperCase()})`
    );

    return updatedOrder;
  }

  private deductIngredientsForOrder(order: Order) {
    const ingredientDeductions: Record<string, number> = {};

    for (const item of order.items) {
      const recipe = this.recipes.find((r) => r.productId === item.productId);
      if (recipe) {
        for (const recipeItem of recipe.items) {
          const totalQtyNeeded = recipeItem.quantity * item.quantity;
          ingredientDeductions[recipeItem.ingredientId] =
            (ingredientDeductions[recipeItem.ingredientId] || 0) + totalQtyNeeded;
        }
      }

      const product = this.products.find((p) => p.id === item.productId);
      if (product) {
        for (const selMod of item.selectedModifiers) {
          const modDef = product.modifiers.find((m) => m.id === selMod.modifierId);
          if (modDef?.inventoryIngredientId && modDef.ingredientQty) {
            const ingId = modDef.inventoryIngredientId;
            const extraQty = modDef.ingredientQty * item.quantity;
            ingredientDeductions[ingId] = (ingredientDeductions[ingId] || 0) + extraQty;
          }
        }
      }
    }

    let modified = false;
    this.ingredients = this.ingredients.map((ing) => {
      const deduction = ingredientDeductions[ing.id];
      if (deduction) {
        modified = true;
        const newStock = Math.max(0, +(ing.currentStock - deduction).toFixed(2));
        return { ...ing, currentStock: newStock };
      }
      return ing;
    });

    if (modified) {
      setStored('ingredients', this.ingredients);
    }
  }

  public async adjustIngredientStock(
    ingredientId: string,
    newStock: number,
    reason: string,
    user: User
  ): Promise<Ingredient | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.inventory.adjustStock({
        ingredientId,
        newStock,
        reason,
        user,
      }) as InventoryAdjustmentResult;
      this.ingredients = result.ingredients;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.ingredient;
    }

    const index = this.ingredients.findIndex((i) => i.id === ingredientId);
    if (index === -1) return null;

    const oldStock = this.ingredients[index].currentStock;
    this.ingredients[index].currentStock = newStock;
    setStored('ingredients', this.ingredients);

    this.pushSyncOutbox('ingredients', ingredientId, 'update', this.ingredients[index]);
    this.logAudit(
      user,
      'STOCK_MANUAL_ADJUSTMENT',
      `Stock for ${this.ingredients[index].name} adjusted from ${oldStock} to ${newStock} (${this.ingredients[index].unit}). Reason: ${reason}`
    );

    return this.ingredients[index];
  }

  /** Receives a small stock top-up directly, without creating a supplier purchase order. */
  public async quickRestockIngredient(
    ingredientId: string,
    quantity: number,
    unitCost: number,
    note: string,
    supplierName: string,
    paymentMethod: string,
    paymentReference: string,
    user: User
  ): Promise<Ingredient | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.inventory.quickRestock({ ingredientId, quantity, unitCost, note, supplierName, paymentMethod, paymentReference, user }) as InventoryAdjustmentResult;
      this.ingredients = result.ingredients;
      if (result.quickStockPurchases) this.quickStockPurchases = result.quickStockPurchases;
      if (result.cashSession) this.cashSession = result.cashSession;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.ingredient;
    }
    const index = this.ingredients.findIndex((ingredient) => ingredient.id === ingredientId && ingredient.branchId === user.branchId);
    if (index < 0) return null;
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) throw new Error('A positive quantity and valid unit cost are required for a quick restock.');
    const ingredient = this.ingredients[index];
    const previousStock = Number(ingredient.currentStock || 0);
    const nextStock = +(previousStock + quantity).toFixed(4);
    const nextUnitCost = +(((previousStock * Number(ingredient.unitCost || 0)) + (quantity * unitCost)) / nextStock).toFixed(4);
    this.ingredients[index] = { ...ingredient, currentStock: nextStock, unitCost: nextUnitCost };
    setStored('ingredients', this.ingredients);
    const purchase: QuickStockPurchase = { id: `qsp-${Date.now()}`, purchaseNumber: `QSP-${new Date().getFullYear()}-${String(this.quickStockPurchases.length + 1).padStart(6, '0')}`, branchId: user.branchId, ingredientId, ingredientName: ingredient.name, quantity, unit: ingredient.unit, unitCost, totalAmount: +(quantity * unitCost).toFixed(2), supplierName: supplierName.trim() || undefined, paymentMethod: paymentMethod || 'other', paymentReference: paymentReference.trim() || undefined, notes: note.trim() || undefined, purchasedAt: new Date().toISOString(), purchasedBy: user.name };
    this.quickStockPurchases = [purchase, ...this.quickStockPurchases];
    setStored('quick_stock_purchases', this.quickStockPurchases);
    this.pushSyncOutbox('quick_stock_purchases', purchase.id, 'insert', purchase);
    this.logAudit(user, 'INVENTORY_QUICK_RESTOCK', `Restocked ${ingredient.name}: +${quantity} ${ingredient.unit}. ${note || 'Quick restock (no purchase order)'}`);
    return this.ingredients[index];
  }

  public getQuickStockPurchases(branchId: string): QuickStockPurchase[] {
    return this.quickStockPurchases.filter((purchase) => purchase.branchId === branchId).sort((left, right) => right.purchasedAt.localeCompare(left.purchasedAt));
  }

  public async getInventoryReport(branchId: string, user: User): Promise<InventoryReport> {
    const desktop = getDesktopBridge();
    if (!desktop) return { totalStockValue: this.getIngredients(branchId).reduce((total, ingredient) => total + ingredient.currentStock * ingredient.unitCost, 0), lowStockItems: this.getIngredients(branchId).filter((ingredient) => ingredient.currentStock <= ingredient.minThreshold), recentVariances: [] };
    return desktop.inventory.report({ branchId, user }) as Promise<InventoryReport>;
  }

  public async recordInventoryVariance(ingredientId: string, type: 'wastage' | 'spoilage' | 'damage', quantity: number, reason: string, user: User): Promise<InventoryVarianceRecord> {
    const desktop = getDesktopBridge();
    if (!desktop) throw new Error('Inventory variance recording requires the desktop SQLite runtime.');
    const result = await desktop.inventory.variance({ ingredientId, type, quantity, reason, user }) as { variance: InventoryVarianceRecord; ingredients: Ingredient[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
    this.ingredients = result.ingredients; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
    return result.variance;
  }

  public async createPurchaseOrder(
    po: Omit<PurchaseOrder, 'id' | 'poNumber' | 'createdAt'>,
    user: User
  ): Promise<PurchaseOrder> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.procurement.purchaseOrder({ purchaseOrder: po, user }) as { purchaseOrder: PurchaseOrder; purchaseOrders: PurchaseOrder[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.purchaseOrders = result.purchaseOrders;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.purchaseOrder;
    }
    const newPO: PurchaseOrder = {
      ...po,
      id: `po-${Date.now()}`,
      poNumber: `PO-2026-00${this.purchaseOrders.length + 44}`,
      createdAt: new Date().toISOString(),
    };
    this.purchaseOrders.unshift(newPO);
    setStored('purchase_orders', this.purchaseOrders);

    this.pushSyncOutbox('purchase_orders', newPO.id, 'insert', newPO);
    this.logAudit(user, 'PURCHASE_ORDER_CREATED', `Created ${newPO.poNumber} for vendor ${newPO.vendorName} (${this.money(newPO.totalAmount)})`);
    return newPO;
  }

  public async updatePurchaseOrder(purchaseOrder: PurchaseOrder, user: User): Promise<PurchaseOrder> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.procurement.purchaseOrder({ purchaseOrder, user }) as { purchaseOrder: PurchaseOrder; purchaseOrders: PurchaseOrder[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.purchaseOrders = result.purchaseOrders;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.purchaseOrder;
    }
    const index = this.purchaseOrders.findIndex((entry) => entry.id === purchaseOrder.id);
    if (index === -1) throw new Error('Purchase order not found');
    this.purchaseOrders[index] = purchaseOrder;
    setStored('purchase_orders', this.purchaseOrders);
    this.pushSyncOutbox('purchase_orders', purchaseOrder.id, 'update', purchaseOrder);
    this.logAudit(user, 'PURCHASE_ORDER_UPDATED', `Updated ${purchaseOrder.poNumber}`);
    return purchaseOrder;
  }

  public async postGRN(
    poId: string,
    invoiceReference: string,
    receivedItems: { ingredientId: string; quantity: number }[],
    user: User
  ): Promise<GoodsReceivedNote | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.procurement.postGoodsReceived({
        poId,
        invoiceReference,
        receivedItems,
        user,
      }) as GoodsReceivedResult;
      this.ingredients = result.ingredients;
      this.purchaseOrders = result.purchaseOrders;
      this.vendors = result.vendors;
      this.grns = result.grns;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return result.grn;
    }

    const poIndex = this.purchaseOrders.findIndex((p) => p.id === poId);
    if (poIndex === -1) return null;
    const po = this.purchaseOrders[poIndex];

    let totalGRNAmount = 0;
    const grnItems = [];

    for (const recItem of receivedItems) {
      const ingIndex = this.ingredients.findIndex((i) => i.id === recItem.ingredientId);
      if (ingIndex !== -1) {
        this.ingredients[ingIndex].currentStock = +(this.ingredients[ingIndex].currentStock + recItem.quantity).toFixed(2);
        const itemCost = +(this.ingredients[ingIndex].unitCost * recItem.quantity).toFixed(2);
        totalGRNAmount += itemCost;
        grnItems.push({
          ingredientId: recItem.ingredientId,
          ingredientName: this.ingredients[ingIndex].name,
          quantityReceived: recItem.quantity,
          unit: this.ingredients[ingIndex].unit,
          unitCost: this.ingredients[ingIndex].unitCost,
          totalCost: itemCost,
        });
      }
    }
    setStored('ingredients', this.ingredients);

    this.purchaseOrders[poIndex].status = 'received';
    setStored('purchase_orders', this.purchaseOrders);

    const vendorIndex = this.vendors.findIndex((v) => v.id === po.vendorId);
    if (vendorIndex !== -1) {
      this.vendors[vendorIndex].outstandingBalance = +(this.vendors[vendorIndex].outstandingBalance + totalGRNAmount).toFixed(2);
      setStored('vendors', this.vendors);
    }

    const grn: GoodsReceivedNote = {
      id: `grn-${Date.now()}`,
      grnNumber: `GRN-2026-00${this.grns.length + 32}`,
      poId: po.id,
      poNumber: po.poNumber,
      vendorId: po.vendorId,
      vendorName: po.vendorName,
      branchId: po.branchId,
      items: grnItems,
      totalAmount: totalGRNAmount,
      receivedAt: new Date().toISOString(),
      receivedBy: user.name,
      invoiceReference: invoiceReference || 'INV-DIRECT',
      status: 'posted',
    };

    this.grns.unshift(grn);
    setStored('grns', this.grns);

    this.pushSyncOutbox('grns', grn.id, 'insert', grn);
    this.logAudit(user, 'GRN_POSTED', `Posted ${grn.grnNumber} for PO ${po.poNumber}. Stock replenished (${this.money(totalGRNAmount)})`);
    return grn;
  }

  public async recordVendorPayment(
    vendorId: string,
    amount: number,
    method: 'bank_transfer' | 'cash' | 'cheque',
    ref: string,
    user: User
  ): Promise<VendorPayment | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.finance.vendorPayment({ vendorId, amount, method, reference: ref, user, state: { vendors: this.vendors, vendorPayments: this.vendorPayments, cashSession: this.cashSession, syncOutbox: this.syncOutbox, auditLogs: this.auditLogs } }) as { payment: VendorPayment; vendors: Vendor[]; vendorPayments: VendorPayment[]; cashSession: CashSession | null; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.vendors = result.vendors; this.vendorPayments = result.vendorPayments; if (result.cashSession) this.cashSession = result.cashSession; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.payment;
    }

    const vIndex = this.vendors.findIndex((v) => v.id === vendorId);
    if (vIndex === -1) return null;

    this.vendors[vIndex].outstandingBalance = Math.max(0, +(this.vendors[vIndex].outstandingBalance - amount).toFixed(2));
    setStored('vendors', this.vendors);

    const payment: VendorPayment = {
      id: `vpay-${Date.now()}`,
      paymentNumber: `VPAY-2026-00${this.vendorPayments.length + 12}`,
      vendorId,
      vendorName: this.vendors[vIndex].name,
      branchId: user.branchId,
      amount,
      paymentMethod: method,
      referenceNumber: ref,
      paidAt: new Date().toISOString(),
    };

    this.vendorPayments.unshift(payment);
    setStored('vendor_payments', this.vendorPayments);

    this.pushSyncOutbox('vendor_payments', payment.id, 'insert', payment);
    this.logAudit(user, 'VENDOR_PAYMENT', `Paid ${this.money(amount)} to ${this.vendors[vIndex].name} via ${method.toUpperCase()}`);
    return payment;
  }

  public async addCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'loyaltyPoints' | 'totalOrders' | 'totalSpent'>, user: User): Promise<Customer> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.crm.mutate({ action: 'create-customer', customer, user }) as CrmMutationResult;
      if (!result.customer) throw new Error('The customer could not be created.');
      this.customers = result.customers; this.deliveryZones = result.deliveryZones; this.loyaltyTransactions = result.loyaltyTransactions; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.customer;
    }
    const newCust: Customer = {
      ...customer,
      id: `cust-${Date.now()}`,
      loyaltyPoints: 0,
      totalOrders: 0,
      totalSpent: 0,
      createdAt: new Date().toISOString(),
    };
    this.customers.unshift(newCust);
    setStored('customers', this.customers);
    this.pushSyncOutbox('customers', newCust.id, 'insert', newCust);
    this.logAudit(user, 'CUSTOMER_CREATED', `Added new customer ${newCust.name} (${newCust.phone})`);
    return newCust;
  }

  public async updateCustomer(id: string, updates: Partial<Customer>, user: User): Promise<Customer | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.crm.mutate({ action: 'update-customer', customerId: id, customer: updates, user }) as CrmMutationResult;
      this.customers = result.customers; this.deliveryZones = result.deliveryZones; this.loyaltyTransactions = result.loyaltyTransactions; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.customer || null;
    }
    const index = this.customers.findIndex((c) => c.id === id);
    if (index === -1) return null;
    this.customers[index] = { ...this.customers[index], ...updates };
    setStored('customers', this.customers);
    this.pushSyncOutbox('customers', id, 'update', this.customers[index]);
    this.logAudit(user, 'CUSTOMER_UPDATED', `Updated customer: ${this.customers[index].name}`);
    return this.customers[index];
  }

  public async deleteCustomer(id: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.crm.mutate({ action: 'delete-customer', customerId: id, user }) as CrmMutationResult;
      this.customers = result.customers; this.deliveryZones = result.deliveryZones; this.loyaltyTransactions = result.loyaltyTransactions; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return Boolean(result.customer);
    }
    const index = this.customers.findIndex((c) => c.id === id);
    if (index === -1) return false;
    const name = this.customers[index].name;
    this.customers.splice(index, 1);
    setStored('customers', this.customers);
    this.pushSyncOutbox('customers', id, 'delete', { id });
    this.logAudit(user, 'CUSTOMER_DELETED', `Deleted customer: ${name}`);
    return true;
  }

  public async addDeliveryZone(zone: Omit<DeliveryZone, 'id'>, user: User): Promise<DeliveryZone> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.crm.mutate({ action: 'create-zone', zone, user }) as CrmMutationResult;
      if (!result.zone) throw new Error('The delivery zone could not be created.');
      this.customers = result.customers; this.deliveryZones = result.deliveryZones; this.loyaltyTransactions = result.loyaltyTransactions; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.zone;
    }
    const newZone = { ...zone, id: `zone-${Date.now()}` };
    this.deliveryZones.unshift(newZone); setStored('delivery_zones', this.deliveryZones); this.logAudit(user, 'DELIVERY_ZONE_CREATED', `Created delivery zone: ${newZone.name}`); return newZone;
  }

  public async updateDeliveryZone(id: string, updates: Partial<DeliveryZone>, user: User): Promise<DeliveryZone | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.crm.mutate({ action: 'update-zone', zoneId: id, zone: updates, user }) as CrmMutationResult;
      this.customers = result.customers; this.deliveryZones = result.deliveryZones; this.loyaltyTransactions = result.loyaltyTransactions; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.zone || null;
    }
    const index = this.deliveryZones.findIndex((zone) => zone.id === id); if (index < 0) return null;
    this.deliveryZones[index] = { ...this.deliveryZones[index], ...updates }; setStored('delivery_zones', this.deliveryZones); this.logAudit(user, 'DELIVERY_ZONE_UPDATED', `Updated delivery zone: ${this.deliveryZones[index].name}`); return this.deliveryZones[index];
  }

  public async deleteDeliveryZone(id: string, user: User): Promise<boolean> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.crm.mutate({ action: 'delete-zone', zoneId: id, user }) as CrmMutationResult;
      this.customers = result.customers; this.deliveryZones = result.deliveryZones; this.loyaltyTransactions = result.loyaltyTransactions; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return Boolean(result.zone);
    }
    const index = this.deliveryZones.findIndex((zone) => zone.id === id); if (index < 0) return false;
    const [zone] = this.deliveryZones.splice(index, 1); setStored('delivery_zones', this.deliveryZones); this.logAudit(user, 'DELIVERY_ZONE_DELETED', `Deleted delivery zone: ${zone.name}`); return true;
  }

  public async adjustLoyalty(customerId: string, points: number, reason: string, user: User): Promise<LoyaltyTransaction> {
    const desktop = getDesktopBridge();
    if (!desktop) throw new Error('Loyalty adjustments require the desktop SQLite runtime.');
    const result = await desktop.crm.mutate({ action: 'adjust-loyalty', customerId, points, reason, user }) as CrmMutationResult;
    if (!result.loyaltyTransaction) throw new Error('The loyalty adjustment could not be saved.');
    this.customers = result.customers; this.deliveryZones = result.deliveryZones; this.loyaltyTransactions = result.loyaltyTransactions; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
    return result.loyaltyTransaction;
  }

  public async addExpense(
    categoryId: string,
    amount: number,
    payee: string,
    notes: string,
    method: 'cash' | 'bank_transfer' | 'card',
    user: User
  ): Promise<Expense> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.finance.expense({ categoryId, amount, payee, notes, method, user }) as { expense: Expense; expenses: Expense[]; cashSession: CashSession | null; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.expenses = result.expenses; if (result.cashSession) this.cashSession = result.cashSession; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs; return result.expense;
    }

    const category = this.expenseCategories.find((c) => c.id === categoryId);
    const newExp: Expense = {
      id: `exp-${Date.now()}`,
      voucherNumber: `EXP-2026-0${this.expenses.length + 106}`,
      branchId: user.branchId,
      categoryId,
      categoryName: category?.name || 'General Expense',
      amount,
      paymentMethod: method,
      payee,
      date: new Date().toISOString().split('T')[0],
      notes,
      approvedBy: user.name,
      status: 'approved',
    };

    this.expenses.unshift(newExp);
    setStored('expenses', this.expenses);

    if (method === 'cash') {
      await this.recordCashMovement('payout', amount, `Expense: ${newExp.voucherNumber} - ${payee}`, user);
    }

    this.pushSyncOutbox('expenses', newExp.id, 'insert', newExp);
    this.logAudit(user, 'EXPENSE_RECORDED', `Voucher ${newExp.voucherNumber} logged: ${this.money(amount)} to ${payee}`);
    return newExp;
  }

  public async recordClockIn(employeeId: string, user: User): Promise<StaffAttendance | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.staff.attendance({ action: 'clock-in', employeeId, user }) as { attendance: StaffAttendance; attendances: StaffAttendance[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.attendances = result.attendances; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.attendance;
    }
    const emp = this.employees.find((e) => e.id === employeeId);
    if (!emp) return null;

    const todayStr = new Date().toISOString().split('T')[0];
    const newAtt: StaffAttendance = {
      id: `att-${Date.now()}`,
      employeeId,
      employeeName: emp.name,
      branchId: user.branchId,
      date: todayStr,
      clockInTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'present',
      notes: 'Shift started at station',
    };

    this.attendances.unshift(newAtt);
    setStored('attendances', this.attendances);
    this.logAudit(user, 'STAFF_CLOCK_IN', `${emp.name} clocked in at ${newAtt.clockInTime}`);
    return newAtt;
  }

  public async recordClockOut(attendanceId: string, hours: number, user: User): Promise<StaffAttendance | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.staff.attendance({ action: 'clock-out', attendanceId, user }) as { attendance: StaffAttendance; attendances: StaffAttendance[]; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.attendances = result.attendances; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.attendance;
    }
    const aIndex = this.attendances.findIndex((a) => a.id === attendanceId);
    if (aIndex === -1) return null;

    this.attendances[aIndex] = {
      ...this.attendances[aIndex],
      clockOutTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      totalHoursWorked: hours,
      status: 'completed',
    };
    setStored('attendances', this.attendances);
    this.logAudit(user, 'STAFF_CLOCK_OUT', `${this.attendances[aIndex].employeeName} clocked out (${hours} hrs)`);
    return this.attendances[aIndex];
  }

  public async recordPayrollAdvance(employeeId: string, amount: number, paymentMethod: 'cash' | 'bank_transfer', notes: string, user: User): Promise<PayrollAdvance> {
    const desktop = getDesktopBridge();
    if (!desktop) throw new Error('Payroll advances require the desktop SQLite runtime.');
    const result = await desktop.staff.advance({ employeeId, amount, paymentMethod, notes, user }) as { advance: PayrollAdvance; advances: PayrollAdvance[]; cashSession: CashSession | null; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
    this.payrollAdvances = result.advances; if (result.cashSession) this.cashSession = result.cashSession; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
    return result.advance;
  }

  public async postPayroll(periodStart: string, periodEnd: string, paymentMethod: 'cash' | 'bank_transfer', otherDeductions: Record<string, number>, user: User): Promise<PayrollRun> {
    const desktop = getDesktopBridge();
    if (!desktop) throw new Error('Payroll posting requires the desktop SQLite runtime.');
    const result = await desktop.staff.payroll({ periodStart, periodEnd, paymentMethod, otherDeductions, user }) as { payrollRun: PayrollRun; payrollRuns: PayrollRun[]; advances: PayrollAdvance[]; expenses: Expense[]; cashSession: CashSession | null; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
    this.payrollRuns = result.payrollRuns; this.payrollAdvances = result.advances; this.expenses = result.expenses; if (result.cashSession) this.cashSession = result.cashSession; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
    return result.payrollRun;
  }

  private recordPaymentIntoCashDrawer(order: Order) {
    if (order.paymentMethod === 'cash') {
      const netCash = order.grandTotal;
      this.cashSession.cashSales += netCash;
      this.cashSession.expectedCash += netCash;
    } else if (order.paymentMethod === 'card') {
      this.cashSession.cardSales += order.grandTotal;
    } else if (['wallet', 'bank_transfer', 'easypaisa', 'jazzcash'].includes(order.paymentMethod || '') || order.paymentMethod?.startsWith('custom:')) {
      this.cashSession.walletSales += order.grandTotal;
    } else if (order.paymentMethod === 'split' && order.paymentSplits) {
      for (const split of order.paymentSplits) {
        if (split.method === 'cash') {
          this.cashSession.cashSales += split.amount;
          this.cashSession.expectedCash += split.amount;
        } else if (split.method === 'card') {
          this.cashSession.cardSales += split.amount;
        } else {
          this.cashSession.walletSales += split.amount;
        }
      }
    }
    setStored('cash_session', this.cashSession);
  }

  public async recordCashMovement(
    type: 'payout' | 'drop',
    amount: number,
    reason: string,
    user: User
  ): Promise<CashSession> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.finance.cashSession({ action: 'movement', type, amount, reason, user }) as { cashSession: CashSession; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.cashSession = result.cashSession;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return { ...this.cashSession };
    }
    if (type === 'payout') {
      this.cashSession.cashPayouts += amount;
      this.cashSession.expectedCash -= amount;
    } else {
      this.cashSession.cashDrops += amount;
      this.cashSession.expectedCash -= amount;
    }
    setStored('cash_session', this.cashSession);

    this.logAudit(
      user,
      type === 'payout' ? 'CASH_PAYOUT' : 'CASH_DROP',
      `${type.toUpperCase()} of ${this.money(amount)} recorded. Reason: ${reason}`
    );
    return { ...this.cashSession };
  }

  public async closeCashSession(countedCash: number, notes: string, user: User): Promise<CashSession> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.finance.cashSession({ action: 'close', countedCash, notes, user }) as { cashSession: CashSession; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.cashSession = result.cashSession;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return { ...this.cashSession };
    }
    const variance = +(countedCash - this.cashSession.expectedCash).toFixed(2);
    this.cashSession = {
      ...this.cashSession,
      status: 'closed',
      closedAt: new Date().toISOString(),
      actualCashCounted: countedCash,
      variance,
      notes: (this.cashSession.notes || '') + '\n' + notes,
      managerApproved: Math.abs(variance) > 5 ? false : true,
    };
    setStored('cash_session', this.cashSession);

    this.logAudit(
      user,
      'CASH_SESSION_CLOSED',
      `Session ${this.cashSession.id} closed. Counted: ${this.money(countedCash)}, Expected: ${this.money(this.cashSession.expectedCash)}, Variance: ${this.money(variance)}`
    );

    return { ...this.cashSession };
  }

  public async reopenCashSession(openingFloat: number, user: User): Promise<CashSession> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.finance.cashSession({ action: 'open', openingFloat, user }) as { cashSession: CashSession; syncOutbox: SyncOutboxEvent[]; auditLogs: SystemAuditLog[] };
      this.cashSession = result.cashSession;
      this.syncOutbox = result.syncOutbox;
      this.auditLogs = result.auditLogs;
      return { ...this.cashSession };
    }
    this.cashSession = {
      id: `csh-sess-${Date.now()}`,
      branchId: user.branchId,
      cashierId: user.id,
      cashierName: user.name,
      openedAt: new Date().toISOString(),
      openingFloat,
      cashSales: 0,
      cardSales: 0,
      walletSales: 0,
      cashPayouts: 0,
      cashDrops: 0,
      expectedCash: openingFloat,
      status: 'open',
      notes: `New shift initialized with opening float ${this.money(openingFloat)}`,
    };
    setStored('cash_session', this.cashSession);

    this.logAudit(
      user,
      'CASH_SESSION_OPENED',
      `New drawer session opened with float ${this.money(openingFloat)}`
    );

    return { ...this.cashSession };
  }

  public async setTableStatus(tableId: string, status: RestaurantTable['status'], user: User): Promise<RestaurantTable | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.seating.mutate({ action: 'set-table-status', tableId, status, user }) as SeatingMutationResult;
      this.floors = result.floors; this.tables = result.tables; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.table || null;
    }
    this.tables = this.tables.map((t) =>
      t.id === tableId
        ? {
            ...t,
            status,
            currentOrderId: status === 'available' ? undefined : t.currentOrderId,
            occupiedSince: status === 'available' ? undefined : t.occupiedSince,
          }
        : t
    );
    setStored('tables', this.tables);
    this.logAudit(user, 'TABLE_STATUS_CHANGED', `Table status updated to ${status}`);
    return this.tables.find((table) => table.id === tableId) || null;
  }

  public async transferTable(sourceTableId: string, targetTableId: string, user: User): Promise<RestaurantTable | null> {
    const desktop = getDesktopBridge();
    if (desktop) {
      const result = await desktop.seating.mutate({ action: 'transfer-table', sourceTableId, targetTableId, user }) as SeatingMutationResult;
      this.floors = result.floors; this.tables = result.tables; this.syncOutbox = result.syncOutbox; this.auditLogs = result.auditLogs;
      return result.table || null;
    }
    const source = this.tables.find((table) => table.id === sourceTableId);
    const target = this.tables.find((table) => table.id === targetTableId);
    if (!source || !target || source.status !== 'occupied' || !source.currentOrderId || target.status !== 'available') return null;
    this.tables = this.tables.map((table) => table.id === source.id
      ? { ...table, status: 'available', currentOrderId: undefined, currentGuests: undefined, occupiedSince: undefined }
      : table.id === target.id
        ? { ...table, status: 'occupied', currentOrderId: source.currentOrderId, currentGuests: source.currentGuests, occupiedSince: source.occupiedSince }
        : table);
    setStored('tables', this.tables);
    this.logAudit(user, 'TABLE_TRANSFERRED', `Transferred order from ${source.name} to ${target.name}`);
    return this.tables.find((table) => table.id === targetTableId) || null;
  }

  private pushSyncOutbox(
    entityType: string,
    entityId: string,
    action: 'insert' | 'update' | 'delete',
    payload: unknown
  ) {
    const event: SyncOutboxEvent = {
      id: `sync-evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      entityType,
      entityId,
      action,
      payloadJson: JSON.stringify(payload),
      createdAt: new Date().toISOString(),
      status: 'pending',
      syncAttemptCount: 0,
    };
    this.syncOutbox.unshift(event);
    setStored('sync_outbox', this.syncOutbox);
  }

  private logAudit(user: User, action: string, details: string) {
    const log: SystemAuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
      branchId: user.branchId,
      action,
      details,
    };
    this.auditLogs.unshift(log);
    setStored('audit_logs', this.auditLogs);
  }
}

export const sqliteService = new SqliteStoreService();
