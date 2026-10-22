// Restaurant Management & POS System Data Entities
// Derived from Developer Reference Document v1.0

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'preparing'
  | 'cooking'
  | 'ready'
  | 'served'
  | 'completed'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface KdsColumn {
  id: string;
  key: string;
  title: string;
  statusMatch: OrderStatus[];
  color: string;
  headerBg: string;
  badgeBg: string;
  badgeText: string;
  icon: string;
  enabled: boolean;
  order: number;
  isCustom?: boolean;
}

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'bank_transfer'
  | 'easypaisa'
  | 'jazzcash'
  | 'wallet'
  | 'split'
  | `custom:${string}`;

export interface PaymentMethodConfig {
  id: PaymentMethod;
  name: string;
  enabled: boolean;
  requiresReference: boolean;
  settlementGroup: 'cash' | 'bank' | 'mobile_wallet' | 'card' | 'custom';
  displayOrder: number;
}

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'out_of_service';

export type KitchenStation = 'all' | 'grill' | 'pizza' | 'drinks' | 'packing';

export type UserRole =
  | 'super_admin'
  | 'branch_admin'
  | 'manager'
  | 'cashier'
  | 'waiter'
  | 'kitchen_staff'
  | 'inventory_officer'
  | 'accountant'
  | 'delivery_rider';

export type ThemeMode = 'forest-topbar' | 'light-clean' | 'bistro-cream' | 'emerald-clean' | 'midnight-navy' | 'saffron-counter' | 'espresso-cafe' | 'ocean-grill' | 'custom';

export interface RolePermissions {
  canAccessPos: boolean;
  canApplyDiscounts: boolean;
  canIssueRefunds: boolean;
  canManageMenu: boolean;
  canManageTables: boolean;
  canManageInventory: boolean;
  canManageProcurement: boolean;
  canViewFinancialReports: boolean;
  canManageStaff: boolean;
  canConfigureSettings: boolean;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  branchId: string;
  pin: string;
  email: string;
  /** Ephemeral desktop-session credential. Never persisted to SQLite. */
  sessionToken?: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  taxRate: number; // e.g. 8.5%
  taxEnabled: boolean;
  taxName: string;
  taxInclusive: boolean;
  taxRegistrationNumber?: string;
  serviceChargeRate: number; // e.g. 5%
  deliveryCharge: number; // e.g. 3.50
  currency: string;
  currencySymbol: string;
}

export type FloorObjectType = 'wall' | 'door' | 'counter' | 'booth' | 'plant' | 'label' | 'zone';

/** A generic, purely visual object placed on a configurable dining-floor canvas. */
export interface FloorLayoutObject {
  id: string;
  type: FloorObjectType;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  color?: string;
  zIndex?: number;
}

/** Persisted layout metadata. Real POS tables keep their own x/y fields and are linked by floorId. */
export interface FloorLayout {
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  objects: FloorLayoutObject[];
}

export interface Floor {
  id: string;
  branchId: string;
  name: string;
  displayOrder: number;
  layout?: FloorLayout;
}

/** A delivery channel is configurable per store (for example `custom:website`). */
export type DeliveryChannel = string;

export interface DeliveryMethodConfig {
  id: DeliveryChannel;
  name: string;
  icon: string;
  commissionRate: number;
  enabled: boolean;
  displayOrder: number;
  /** Own Fleet and Foodpanda are the two protected, built-in methods. */
  system?: boolean;
}

export type DeliveryOutcome = 'delivered' | 'returned' | 'damaged' | 'lost';

export type TableShape = 'round' | 'square' | 'rectangle' | 'booth';

export interface CustomRole {
  id: string;
  name: string;
  code: string;
  description: string;
  permissions: RolePermissions;
  color: string;
}

export interface ReceiptConfig {
  storeName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  taxRegistrationNumber: string;
  headerCustomText: string;
  footerCustomText: string;
  logoUrl?: string;
  paperWidth: '80mm' | '58mm';
  fontDensity: 'compact' | 'standard' | 'large';
  showCashierName: boolean;
  showServerName?: boolean;
  showOrderType: boolean;
  showTableNumber: boolean;
  showItemModifiers: boolean;
  showItemSku: boolean;
  showTaxBreakdown?: boolean;
  showServiceCharge?: boolean;
  showDiscounts?: boolean;
  showCustomerDetails?: boolean;
  showQrCode: boolean;
  qrCodeUrl: string;
  qrCodeLabel: string;
  returnPolicyText?: string;
  socialHandle?: string;
  wifiDetails?: string;
  blankFeedLines?: number;
  autoCutReceipt: boolean;
  autoDrawerKick: boolean;
}

export interface PrinterDeviceConfig {
  id: string;
  name: string;
  type: 'receipt' | 'kitchen';
  connectionType: 'network_ip' | 'usb' | 'bluetooth';
  ipAddress: string;
  port: number;
  /** Exact Windows printer queue name, used when connectionType is usb. */
  systemPrinterName?: string;
  paperSize: '80mm' | '58mm';
  enabled: boolean;
  autoPrintOnOrder: boolean;
  cutPaper: boolean;
  beepOnPrint?: boolean;
  copies?: number;
  kitchenStationFilter?: KitchenStation | 'all';
}

export interface HardwarePrinterSettings {
  receiptPrinter: PrinterDeviceConfig;
  kitchenPrinter: PrinterDeviceConfig;
  printOptionsOnOrder: 'always_both' | 'prompt_choice' | 'receipt_only' | 'kitchen_only';
}

export interface RestaurantTable {
  id: string;
  floorId: string;
  branchId: string;
  name: string;
  capacity: number;
  status: TableStatus;
  shape?: TableShape;
  posX?: number;
  posY?: number;
  currentOrderId?: string;
  currentGuests?: number;
  occupiedSince?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  iconName: string;
  displayOrder: number;
  active: boolean;
}

export interface ProductVariation {
  id: string;
  name: string;
  priceDifference: number;
}

export interface ProductModifier {
  id: string;
  name: string;
  price: number;
  inventoryIngredientId?: string;
  ingredientQty?: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  sku: string;
  barcode: string;
  description: string;
  basePrice: number;
  imageUrl: string;
  prepTimeMinutes: number;
  isAvailable: boolean;
  featured: boolean;
  kitchenStation: KitchenStation;
  variations: ProductVariation[];
  modifiers: ProductModifier[];
  recipeId?: string;
}

export interface OrderItemModifier {
  modifierId: string;
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  variationId?: string;
  variationName?: string;
  unitPrice: number;
  quantity: number;
  selectedModifiers: OrderItemModifier[];
  itemNotes?: string;
  kitchenStatus: 'pending' | 'preparing' | 'ready';
  kitchenStation: KitchenStation;
  totalPrice: number;
}

export interface SplitPaymentDetail {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface Order {
  id: string;
  invoiceNumber: string;
  branchId: string;
  orderType: OrderType;
  status: OrderStatus;
  tableId?: string;
  tableName?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryChannel?: DeliveryChannel;
  deliveryOutcome?: DeliveryOutcome;
  deliveryLossAmount?: number;
  deliveryLossReason?: string;
  deliveryLossAbsorbedBy?: 'restaurant' | 'rider' | 'aggregator';
  deliveryCommissionRate?: number;
  deliveryCommissionAmount?: number;
  /** Cost of food written off when a prepared dine-in/takeaway ticket is cancelled or returned. */
  foodLossAmount?: number;
  foodLossReason?: string;
  foodLossType?: 'cancelled_after_preparation' | 'customer_return';
  riderId?: string;
  riderName?: string;
  cashierId: string;
  cashierName: string;
  waiterId?: string;
  items: OrderItem[];
  subtotal: number;
  itemDiscounts: number;
  orderDiscountPercent: number;
  orderDiscountAmount: number;
  taxAmount: number;
  serviceChargeAmount: number;
  deliveryChargeAmount: number;
  grandTotal: number;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  paymentSplits?: SplitPaymentDetail[];
  amountPaid: number;
  changeGiven: number;
  orderNotes?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** An unpaid POS ticket deliberately parked for later recall. */
export interface HeldPosOrder {
  id: string;
  branchId: string;
  name: string;
  items: OrderItem[];
  orderType: OrderType;
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryChannel?: DeliveryChannel;
  deliveryNotes?: string;
  riderId?: string;
  riderName?: string;
  discountMode: 'percent' | 'amount';
  discountValue: number;
  time: string;
  total: number;
  createdAt: string;
}

export interface Ingredient {
  id: string;
  branchId: string;
  name: string;
  sku: string;
  category: string;
  unit: 'kg' | 'g' | 'litre' | 'ml' | 'piece' | 'box';
  currentStock: number;
  minThreshold: number;
  unitCost: number;
}

export interface RecipeItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

export interface Recipe {
  id: string;
  productId: string;
  productName: string;
  items: RecipeItem[];
  wastagePercent: number;
  calculatedCost: number;
  sellingPrice: number;
  foodCostPercent: number;
}

export interface CashSession {
  id: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  cashSales: number;
  cardSales: number;
  walletSales: number;
  cashPayouts: number;
  cashDrops: number;
  expectedCash: number;
  actualCashCounted?: number;
  variance?: number;
  managerApproved?: boolean;
  status: 'open' | 'closed';
  notes?: string;
}

export interface DeliveryRider {
  id: string;
  name: string;
  phone: string;
  vehicleNumber: string;
  status: 'available' | 'assigned' | 'out_for_delivery' | 'offline';
  assignedOrderId?: string;
  cashInHand: number;
}

// -------------------------------------------------------------
// VENDORS & PROCUREMENT
// -------------------------------------------------------------
export interface Vendor {
  id: string;
  name: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms: string; // e.g. "Net 15", "COD", "Net 30"
  outstandingBalance: number;
  active: boolean;
}

export interface PurchaseOrderItem {
  ingredientId: string;
  ingredientName: string;
  quantityOrdered: number;
  quantityReceived: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  branchId: string;
  vendorId: string;
  vendorName: string;
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';
  items: PurchaseOrderItem[];
  totalAmount: number;
  createdAt: string;
  expectedDate?: string;
  notes?: string;
}

export interface GoodsReceivedNote {
  id: string;
  grnNumber: string;
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  branchId: string;
  items: {
    ingredientId: string;
    ingredientName: string;
    quantityReceived: number;
    unit: string;
    unitCost: number;
    totalCost: number;
  }[];
  totalAmount: number;
  receivedAt: string;
  receivedBy: string;
  invoiceReference: string;
  status: 'posted' | 'voided';
}

export interface VendorPayment {
  id: string;
  paymentNumber: string;
  vendorId: string;
  vendorName: string;
  branchId: string;
  amount: number;
  paymentMethod: 'bank_transfer' | 'cash' | 'cheque';
  referenceNumber: string;
  paidAt: string;
  notes?: string;
}

// -------------------------------------------------------------
// CUSTOMER CRM, LOYALTY & DELIVERY ZONES
// -------------------------------------------------------------
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  primaryAddress?: string;
  notes?: string;
  tags: ('VIP' | 'Regular' | 'Corporate' | 'Delivery')[];
  loyaltyPoints: number;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
  createdAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  orderId?: string;
  type: 'earned' | 'redeemed' | 'manual_adjustment';
  points: number;
  valueDiscount: number;
  createdAt: string;
}

export interface DeliveryZone {
  id: string;
  branchId: string;
  name: string;
  minOrderAmount: number;
  deliveryFee: number;
  estimatedMinutes: number;
  active: boolean;
}

// -------------------------------------------------------------
// FINANCE & EXPENSES, STAFF ATTENDANCE & SHIFTS
// -------------------------------------------------------------
export interface ExpenseCategory {
  id: string;
  name: string;
  code: string;
  description?: string;
}

export interface Expense {
  id: string;
  voucherNumber: string;
  branchId: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'card';
  payee: string;
  date: string;
  notes: string;
  approvedBy?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Employee {
  id: string;
  branchId: string;
  name: string;
  role: UserRole;
  phone: string;
  email: string;
  hourlyRate: number;
  monthlySalary?: number;
  active: boolean;
  pin: string;
  hiredDate: string;
}

export interface StaffAttendance {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  date: string;
  clockInTime: string;
  clockOutTime?: string;
  totalHoursWorked?: number;
  status: 'present' | 'late' | 'absent' | 'completed';
  notes?: string;
  clockInAt?: string;
  clockOutAt?: string;
}

export interface InventoryVarianceRecord {
  id: string;
  ingredientId: string;
  ingredientName: string;
  branchId: string;
  movementType: 'stock_count' | 'wastage' | 'spoilage' | 'damage';
  quantityDelta: number;
  valueImpact: number;
  reason: string;
  recordedAt: string;
  recordedBy: string;
}

export interface InventoryReport {
  totalStockValue: number;
  lowStockItems: Ingredient[];
  recentVariances: InventoryVarianceRecord[];
}

/** A direct stock receipt that intentionally bypasses a supplier purchase order. */
export interface QuickStockPurchase {
  id: string;
  purchaseNumber: string;
  branchId: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalAmount: number;
  supplierName?: string;
  paymentMethod: string;
  paymentReference?: string;
  notes?: string;
  purchasedAt: string;
  purchasedBy: string;
}

export interface PayrollAdvance {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  amount: number;
  outstandingAmount: number;
  paymentMethod: 'cash' | 'bank_transfer';
  issuedAt: string;
  notes: string;
  status: 'open' | 'recovered';
}

export interface PayrollItem {
  employeeId: string;
  employeeName: string;
  hoursWorked: number;
  grossPay: number;
  advanceRecovery: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
}

export interface PayrollRun {
  id: string;
  payrollNumber: string;
  branchId: string;
  periodStart: string;
  periodEnd: string;
  paymentMethod: 'cash' | 'bank_transfer';
  status: 'posted';
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  postedAt: string;
  postedBy: string;
  items: PayrollItem[];
}

export interface SyncOutboxEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: 'insert' | 'update' | 'delete';
  payloadJson: string;
  createdAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'conflict';
  syncAttemptCount: number;
}

export interface SystemAuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  branchId: string;
  action: string;
  details: string;
}
