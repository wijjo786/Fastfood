import React, { useEffect, useState, useMemo } from 'react';
import {
  Product,
  Category,
  RestaurantTable,
  OrderItem,
  OrderType,
  Branch,
  User,
  Order,
  PaymentMethod,
  PaymentMethodConfig,
  SplitPaymentDetail,
  ProductVariation,
  OrderItemModifier,
  DeliveryChannel,
  Customer,
  Employee,
  HeldPosOrder,
  DeliveryMethodConfig,
} from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { showUserError, showUserInfo } from '../../utils/userFeedback';
import { ProductCustomizationModal } from './ProductCustomizationModal';
import { SplitPaymentModal } from './SplitPaymentModal';
import { ReceiptModal } from './ReceiptModal';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Clock,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  PauseCircle,
  PlayCircle,
  Percent,
  CheckCircle2,
  Flame,
  UserCheck,
  MapPin,
  Phone,
  User as UserIcon,
  Truck,
  RotateCcw,
  X,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface PosTerminalProps {
  branch: Branch;
  currentUser: User;
  onOrderCreated?: (order: Order) => void;
}

const offlineProductImage = (imageUrl: string) => /^(?:restoflow-media:|data:image\/)/i.test(imageUrl) ? imageUrl : '';

export const PosTerminal: React.FC<PosTerminalProps> = ({
  branch,
  currentUser,
  onOrderCreated,
}) => {
  const { styles, isDark, theme } = useAppTheme();
  // Master data
  const [products] = useState<Product[]>(() => sqliteService.getProducts());
  const [categories] = useState<Category[]>(() => sqliteService.getCategories());
  const [tables, setTables] = useState<RestaurantTable[]>(() => sqliteService.getTables(branch.id));
  const [customers, setCustomers] = useState<Customer[]>(() => sqliteService.getCustomers());
  const [riders, setRiders] = useState<Employee[]>(() => sqliteService.getEmployees(branch.id).filter((employee) => employee.active && employee.role === 'delivery_rider'));
  const [paymentMethods] = useState<PaymentMethodConfig[]>(() => sqliteService.getPaymentMethods());
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethodConfig[]>(() => sqliteService.getDeliveryMethods());

  // Terminal Order State
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState<string>(() => tables.find((table) => table.status === 'available')?.id || tables[0]?.id || '');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Customer & Delivery Dispatch Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryApt, setDeliveryApt] = useState('');
  const [deliveryChannel, setDeliveryChannel] = useState<DeliveryChannel>(() => sqliteService.getDeliveryMethods().find((method) => method.id === 'own_fleet' && method.enabled)?.id || sqliteService.getDeliveryMethods().find((method) => method.enabled)?.id || 'own_fleet');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [riderName, setRiderName] = useState('');
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [isAddRiderOpen, setIsAddRiderOpen] = useState(false);
  const [newRiderName, setNewRiderName] = useState('');
  const [newRiderPhone, setNewRiderPhone] = useState('');
  const [newRiderPin, setNewRiderPin] = useState('');
  const [riderError, setRiderError] = useState('');
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [customerPickerQuery, setCustomerPickerQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState('');

  // Cart / Line items
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);

  // Discount options: Percent or Custom Amount
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Modals state
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(null);

  // Clear confirmation modal state (replaces window.confirm)
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // Order Hold & Recall state (Parked Tickets)
  const [heldOrders, setHeldOrders] = useState<HeldPosOrder[]>(() => sqliteService.getHeldOrders(branch.id));
  const [isRecallModalOpen, setIsRecallModalOpen] = useState(false);

  useEffect(() => {
    setHeldOrders(sqliteService.getHeldOrders(branch.id));
  }, [branch.id]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
      const matchQuery =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.includes(searchQuery);
      return matchCat && matchQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  const customerMatches = useMemo(() => {
    const nameQuery = customerName.trim().toLowerCase();
    const phoneQuery = customerPhone.trim().toLowerCase();
    if (nameQuery.length < 2 && phoneQuery.length < 2) return [];
    return customers.filter((customer) =>
      (nameQuery.length >= 2 && customer.name.toLowerCase().includes(nameQuery)) ||
      (phoneQuery.length >= 2 && customer.phone.toLowerCase().includes(phoneQuery))
    ).slice(0, 5);
  }, [customers, customerName, customerPhone]);
  const canManageStaff = sqliteService.getUserPermissions(currentUser).canManageStaff;

  const savedCustomerResults = useMemo(() => {
    const query = customerPickerQuery.trim().toLowerCase();
    return customers
      .filter((customer) => !query || customer.name.toLowerCase().includes(query) || customer.phone.toLowerCase().includes(query))
      .sort((left, right) => right.totalSpent - left.totalSpent || left.name.localeCompare(right.name))
      .slice(0, 8);
  }, [customers, customerPickerQuery]);

  // Financial Calculations
  const subtotal = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.totalPrice, 0);
  }, [cartItems]);

  const discountAmount = useMemo(() => {
    if (discountMode === 'percent') {
      return +((subtotal * discountValue) / 100).toFixed(2);
    }
    return Math.min(subtotal, +discountValue.toFixed(2));
  }, [subtotal, discountMode, discountValue]);

  const discountPercentCalculated = useMemo(() => {
    if (discountMode === 'percent') return discountValue;
    if (subtotal <= 0) return 0;
    return +((discountAmount / subtotal) * 100).toFixed(1);
  }, [subtotal, discountMode, discountValue, discountAmount]);

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = branch.taxEnabled === false ? 0 : branch.taxInclusive
    ? +(taxableAmount - taxableAmount / (1 + branch.taxRate / 100)).toFixed(2)
    : +((taxableAmount * branch.taxRate) / 100).toFixed(2);
  const serviceChargeAmount =
    orderType === 'dine_in' ? +((taxableAmount * branch.serviceChargeRate) / 100).toFixed(2) : 0;
  const deliveryChargeAmount = orderType === 'delivery' ? branch.deliveryCharge : 0;
  const grandTotal = +(
    taxableAmount +
    (branch.taxInclusive ? 0 : taxAmount) +
    serviceChargeAmount +
    deliveryChargeAmount
  ).toFixed(2);
  const money = (amount: number) => `${branch.currencySymbol || 'PKR'} ${amount.toFixed(2)}`;

  // Add product to cart handler
  const handleProductClick = (product: Product) => {
    if (product.variations.length > 0 || product.modifiers.length > 0) {
      setCustomizingProduct(product);
    } else {
      addProductToCart(product, undefined, [], '', 1);
    }
  };

  const addProductToCart = (
    product: Product,
    variation: ProductVariation | undefined,
    selectedModifiers: OrderItemModifier[],
    itemNotes: string,
    quantity: number
  ) => {
    const unitPrice =
      product.basePrice +
      (variation ? variation.priceDifference : 0) +
      selectedModifiers.reduce((sum, m) => sum + m.price, 0);

    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      variationId: variation?.id,
      variationName: variation?.name,
      unitPrice,
      quantity,
      selectedModifiers,
      itemNotes,
      kitchenStatus: 'pending',
      kitchenStation: product.kitchenStation,
      totalPrice: unitPrice * quantity,
    };

    setCartItems((prev) => [...prev, newItem]);
  };

  const updateItemQty = (index: number, delta: number) => {
    setCartItems((prev) => {
      const copy = [...prev];
      const target = copy[index];
      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        copy.splice(index, 1);
      } else {
        copy[index] = {
          ...target,
          quantity: newQty,
          totalPrice: target.unitPrice * newQty,
        };
      }
      return copy;
    });
  };

  const removeItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const beginItemNoteEdit = (item: OrderItem) => {
    setEditingNoteItemId(item.id);
    setEditingNoteValue(item.itemNotes || '');
  };

  const saveItemNote = () => {
    if (!editingNoteItemId) return;
    const note = editingNoteValue.trim();
    if (note.length > 500) {
      showUserInfo('Kitchen notes can contain up to 500 characters.', 'Note is too long');
      return;
    }
    setCartItems((items) => items.map((item) => item.id === editingNoteItemId ? { ...item, itemNotes: note || undefined } : item));
    setEditingNoteItemId(null);
    setEditingNoteValue('');
  };

  const chooseCustomer = (customer: Customer) => {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setSelectedCustomerId(customer.id);
    setIsCustomerPickerOpen(false);
    setCustomerPickerQuery('');
    if (orderType === 'delivery' && customer.primaryAddress) {
      setDeliveryStreet(customer.primaryAddress);
      setDeliveryApt('');
    }
  };

  const clearCustomer = () => {
    setCustomerName('');
    setCustomerPhone('');
    setSelectedCustomerId(null);
    setCustomerPickerQuery('');
    setIsCustomerPickerOpen(false);
    if (orderType === 'delivery') {
      setDeliveryStreet('');
      setDeliveryApt('');
    }
  };

  const selectRider = (riderId: string) => {
    setSelectedRiderId(riderId);
    const rider = riders.find((employee) => employee.id === riderId);
    setRiderName(rider?.name || '');
  };

  const openDeliveryConfiguration = () => {
    setRiders(sqliteService.getEmployees(branch.id).filter((employee) => employee.active && employee.role === 'delivery_rider'));
    const latestMethods = sqliteService.getDeliveryMethods();
    setDeliveryMethods(latestMethods);
    if (!latestMethods.some((method) => method.id === deliveryChannel && method.enabled)) setDeliveryChannel(latestMethods.find((method) => method.enabled)?.id || 'own_fleet');
    setRiderError('');
    setIsDeliveryModalOpen(true);
  };

  const addDeliveryRider = async () => {
    if (!canManageStaff) {
      setRiderError('Only a user with Staff management permission can add riders.');
      return;
    }
    if (!newRiderName.trim() || !/^\d{4,6}$/.test(newRiderPin.trim())) {
      setRiderError('Enter the rider name and a 4 to 6 digit terminal PIN.');
      return;
    }
    try {
      const rider = await sqliteService.addEmployee({
        branchId: branch.id,
        name: newRiderName.trim(),
        role: 'delivery_rider',
        phone: newRiderPhone.trim(),
        email: '',
        hourlyRate: 0,
        monthlySalary: undefined,
        pin: newRiderPin.trim(),
        active: true,
        hiredDate: new Date().toISOString().slice(0, 10),
      }, currentUser);
      const nextRiders = sqliteService.getEmployees(branch.id).filter((employee) => employee.active && employee.role === 'delivery_rider');
      setRiders(nextRiders);
      setSelectedRiderId(rider.id);
      setRiderName(rider.name);
      setNewRiderName('');
      setNewRiderPhone('');
      setNewRiderPin('');
      setRiderError('');
      setIsAddRiderOpen(false);
    } catch (error) {
      setRiderError(error instanceof Error ? error.message : 'The delivery rider could not be added.');
    }
  };

  const handleConfirmClearCart = () => {
    setCartItems([]);
    setDiscountValue(0);
    setIsClearModalOpen(false);
  };

  // Hold / Park active order
  const handleHoldOrder = async () => {
    if (cartItems.length === 0) return;
    const holdTitle =
      orderType === 'dine_in'
        ? `Table ${tables.find((t) => t.id === selectedTableId)?.name || 'Dine-In'}`
        : orderType === 'delivery'
        ? `${deliveryMethods.find((method) => method.id === deliveryChannel)?.name.split(' ')[0] || 'Delivery'}: ${customerName || 'Delivery'}`
        : customerName || `Takeaway Ticket #${heldOrders.length + 1}`;

    const newHeld: Omit<HeldPosOrder, 'id' | 'branchId' | 'createdAt'> = {
      name: holdTitle,
      items: [...cartItems],
      orderType,
      tableId: orderType === 'dine_in' ? selectedTableId : undefined,
      customerName,
      customerPhone,
      deliveryAddress: fullDeliveryAddress,
      deliveryChannel,
      deliveryNotes,
      riderId: selectedRiderId || undefined,
      riderName: riderName || undefined,
      discountMode,
      discountValue,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      total: grandTotal,
    };

    try {
      setHeldOrders(await sqliteService.saveHeldOrder(newHeld, currentUser));
      setCartItems([]);
      setDiscountValue(0);
    } catch (error) {
      showUserError(error, 'The ticket could not be parked. Please try again.');
    }
  };

  // Recall selected order back to register
  const handleRecallOrder = async (holdId: string) => {
    const target = heldOrders.find((h) => h.id === holdId);
    if (!target) return;
    try {
      setHeldOrders(await sqliteService.removeHeldOrder(holdId, currentUser));
    } catch (error) {
      showUserError(error, 'The parked ticket could not be recalled. Please try again.');
      return;
    }
    setCartItems(target.items);
    setOrderType(target.orderType);
    setSelectedTableId(target.tableId || '');
    setCustomerName(target.customerName || '');
    setCustomerPhone(target.customerPhone || '');
    setSelectedCustomerId(null);
    setDeliveryChannel(target.deliveryChannel && deliveryMethods.some((method) => method.id === target.deliveryChannel && method.enabled) ? target.deliveryChannel : deliveryMethods.find((method) => method.enabled)?.id || 'own_fleet');
    setDeliveryStreet(target.deliveryAddress || '');
    setDeliveryApt('');
    setDeliveryNotes(target.deliveryNotes || '');
    setSelectedRiderId(target.riderId || '');
    setRiderName(target.riderName || '');
    setDiscountMode(target.discountMode);
    setDiscountValue(target.discountValue);
    setIsRecallModalOpen(false);
  };

  const handleDeleteHeldOrder = async (holdId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setHeldOrders(await sqliteService.removeHeldOrder(holdId, currentUser));
    } catch (error) {
      showUserError(error, 'The parked ticket could not be discarded. Please try again.');
    }
  };

  // Full formatted delivery address
  const fullDeliveryAddress = [deliveryStreet, deliveryApt].filter(Boolean).join(', ');

  const validateOrderContext = (): string | null => {
    if (orderType === 'dine_in' && !selectedTableId) return 'Choose an available table for this dine-in order.';
    if (orderType !== 'delivery') return null;
    if (customerPhone.trim() && customerPhone.replace(/[^0-9]/g, '').length < 7) return 'Enter a valid customer phone number, or clear the phone field.';
    if (deliveryNotes.trim().length > 500) return 'Delivery instructions can contain up to 500 characters.';
    return null;
  };

  const handleOpenPayment = () => {
    const error = validateOrderContext();
    if (error) {
      showUserError(error, 'The order could not be saved. Please review the order and try again.');
      return;
    }
    setIsPaymentOpen(true);
  };

  // Payment completed & final order creation
  const handlePaymentCompleted = async (
    method: PaymentMethod,
    amountPaid: number,
    changeGiven: number,
    splits?: SplitPaymentDetail[],
    paymentReference?: string,
  ) => {
    const contextError = validateOrderContext();
    if (contextError) throw new Error(contextError);
    const selectedTable = tables.find((t) => t.id === selectedTableId);
    const selectedProvider = deliveryMethods.find((method) => method.id === deliveryChannel && method.enabled);

    const commissionRate = selectedProvider?.commissionRate || 0;
    const commissionAmount = +((grandTotal * commissionRate) / 100).toFixed(2);

    const newOrderData: Order = {
      id: '',
      invoiceNumber: '',
      branchId: branch.id,
      orderType,
      status: 'confirmed',
      tableId: orderType === 'dine_in' ? selectedTableId : undefined,
      tableName: orderType === 'dine_in' ? selectedTable?.name : undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      deliveryAddress: orderType === 'delivery' ? fullDeliveryAddress.trim() : undefined,
      deliveryChannel: orderType === 'delivery' ? deliveryChannel : undefined,
      deliveryCommissionRate: orderType === 'delivery' ? commissionRate : 0,
      deliveryCommissionAmount: orderType === 'delivery' ? commissionAmount : 0,
      riderName: orderType === 'delivery' ? riderName || undefined : undefined,
      riderId: orderType === 'delivery' ? selectedRiderId || undefined : undefined,
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      items: cartItems,
      subtotal,
      itemDiscounts: 0,
      orderDiscountPercent: discountPercentCalculated,
      orderDiscountAmount: discountAmount,
      taxAmount,
      serviceChargeAmount,
      deliveryChargeAmount,
      grandTotal,
      paymentMethod: method,
      paymentReference,
      paymentSplits: splits,
      amountPaid,
      changeGiven,
      orderNotes: orderType === 'delivery' ? deliveryNotes.trim() || undefined : undefined,
      createdAt: '',
      updatedAt: '',
    };

    let finalizedOrder: Order;
    try {
      finalizedOrder = await sqliteService.createOrder(newOrderData, currentUser);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Sale was not saved. Please try again.');
    }
    setLastCompletedOrder(finalizedOrder);
    setCustomers(sqliteService.getCustomers());
    const latestTables = sqliteService.getTables(branch.id);
    setTables(latestTables);
    if (orderType === 'dine_in') setSelectedTableId(latestTables.find((table) => table.status === 'available')?.id || '');
    setIsReceiptOpen(true);

    // Reset register for next guest
    setCartItems([]);
    setDiscountValue(0);
    setCustomerName('');
    setCustomerPhone('');
    setSelectedCustomerId(null);
    setDeliveryStreet('');
    setDeliveryApt('');
    setDeliveryNotes('');
    setRiderName('');
    setSelectedRiderId('');

    if (onOrderCreated) {
      onOrderCreated(finalizedOrder);
    }
  };

  const selectedTableObj = tables.find((t) => t.id === selectedTableId);
  const activeDeliveryMethods = deliveryMethods.filter((method) => method.enabled);
  const activeDeliveryProvider = activeDeliveryMethods.find((method) => method.id === deliveryChannel) || activeDeliveryMethods[0] || { id: 'own_fleet', name: 'Own Fleet', icon: '🛵', commissionRate: 0, enabled: true, displayOrder: 1 };

  return (
    <div className={`flex-1 flex flex-col lg:flex-row h-full min-h-0 overflow-hidden gap-4 p-4 ${styles.bgApp}`}>
      {/* LEFT: Product Catalog & Fast Touch Keypad */}
      <div className={`flex-1 min-w-0 flex flex-col h-full overflow-hidden rounded-2xl border ${styles.borderDefault} ${styles.bgSurface} shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        {/* Top Order Context Header */}
        <div className={`p-4 ${styles.bgSurface} border-b ${styles.borderDefault} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-[22px] leading-none font-extrabold tracking-tight text-[#18302D]">Point of Sale</h1>
              <p className="mt-1 text-[11px] font-medium text-[#71807C]">Build a ticket, add a guest, and send it to the kitchen.</p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#DCE8E3] bg-[#F2F5F3] px-2.5 py-1 text-[10px] font-bold text-[#35514C]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Local terminal online
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Order Type Tabs */}
          <div className={`flex items-center gap-1 ${isDark ? 'bg-slate-900 border border-slate-800' : 'bg-slate-200/60'} p-1 rounded-xl`}>
            <button
              type="button"
              onClick={() => setOrderType('dine_in')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                orderType === 'dine_in'
                  ? 'bg-[#16665A] text-white font-black shadow-sm'
                  : `${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>Dine-In</span>
            </button>

            <button
              type="button"
              onClick={() => setOrderType('takeaway')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                orderType === 'takeaway'
                  ? 'bg-[#16665A] text-white font-black shadow-sm'
                  : `${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Takeaway</span>
            </button>

            <button
              type="button"
              onClick={() => setOrderType('delivery')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                orderType === 'delivery'
                  ? 'bg-[#16665A] text-white font-black shadow-sm'
                  : `${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              <span>Delivery</span>
            </button>
          </div>

          {/* Dine-In Table Selector */}
          {orderType === 'dine_in' && (
            <div className="flex items-center gap-2">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} font-medium`}>Table:</span>
              <select
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
                className={`px-2.5 py-1 text-xs font-bold ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-100 border-slate-300 text-slate-800'} border rounded-xl focus:outline-none cursor-pointer`}
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.status !== 'available'}>
                    {t.name} ({t.status.toUpperCase()} - {t.capacity}p)
                  </option>
                ))}
              </select>
              {selectedTableObj?.status === 'occupied' && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 font-bold">
                  Occupied
                </span>
              )}
            </div>
          )}

          {/* Delivery Dispatch Trigger Button */}
          {orderType === 'delivery' && (
            <button
              type="button"
              onClick={openDeliveryConfiguration}
              className="px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-2 border transition shadow-2xs cursor-pointer bg-blue-100 text-blue-800 border-blue-300"
            >
              <span className="text-sm">{activeDeliveryProvider.icon}</span>
              <span>{activeDeliveryProvider.name}</span>
              <span className="text-[10px] opacity-75 font-normal">
                {fullDeliveryAddress ? `• ${fullDeliveryAddress.slice(0, 22)}...` : '• Configure Dispatch'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </button>
          )}

          {/* Search Bar */}
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search item, SKU, barcode..."
              className={`w-full pl-8 pr-3 py-1.5 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'} border rounded-xl focus:outline-none focus:border-amber-500`}
            />
          </div>
          </div>
        </div>

        {/* Category Bar */}
        <div className={`px-3.5 py-2.5 ${styles.bgSubtle} border-b ${styles.borderDefault} flex items-center gap-1.5 overflow-x-auto no-scrollbar`}>
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#16665A] text-white font-black shadow-sm'
                : `${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-200'}`
            }`}
          >
            All Items ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-[#16665A] text-white font-bold shadow-sm'
                  : `${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-200'}`
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5">
            {filteredProducts.map((product) => {
              const hasCustom = product.variations.length > 0 || product.modifiers.length > 0;
              const categoryName = categories.find((category) => category.id === product.categoryId)?.name || 'Menu item';
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleProductClick(product)}
                  className={`group relative flex flex-col ${styles.bgCard} border ${styles.borderDefault} hover:border-[#16665A] rounded-2xl overflow-hidden text-left transition transform active:scale-[0.98] shadow-xs hover:shadow-lg cursor-pointer`}
                >
                  <div className="relative h-28 w-full overflow-hidden bg-[#E8F3F0]">
                    {offlineProductImage(product.imageUrl) ? <img src={offlineProductImage(product.imageUrl)} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" /> : (
                      <div className="relative w-full h-full overflow-hidden bg-[linear-gradient(135deg,#DDF0EB_0%,#F7F3EC_52%,#C9E4DC_100%)]">
                        <span className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-white/55" />
                        <span className="absolute -bottom-9 -left-4 h-20 w-20 rounded-full bg-[#16665A]/10" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#16665A]">
                          <UtensilsCrossed className="h-7 w-7 stroke-[1.6]" />
                          <span className="max-w-[115px] truncate px-2 text-[9px] font-extrabold uppercase tracking-[0.12em]">{categoryName}</span>
                        </div>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-[#18302D] backdrop-blur-md text-[11px] font-mono font-bold text-[#9AD4C6] border border-white/10 shadow-xs num-tabular">
                      {money(product.basePrice)}
                    </div>
                    {product.featured && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#16665A] text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow-sm">
                        <Flame className="w-2.5 h-2.5" />
                        <span>Best</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className={`font-bold text-xs line-clamp-1 leading-snug ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {product.name}
                      </h4>
                      <p className={`text-[10px] line-clamp-1 mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {product.description}
                      </p>
                    </div>

                    <div className={`flex items-center justify-between mt-2.5 pt-2 border-t ${styles.borderSubtle} text-[10px] font-mono`}>
                      <span className={`flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <Clock className="w-3 h-3 text-[#16665A]" />
                        {product.prepTimeMinutes}m
                      </span>
                      {hasCustom && (
                        <span className="text-[#16665A] text-[10px] font-sans font-bold">
                          Options &gt;
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT: Active Order Cart Drawer */}
      <div className={`w-full lg:w-[390px] xl:w-[430px] shrink-0 ${styles.bgSurface} flex flex-col h-full rounded-2xl border ${styles.borderDefault} overflow-hidden shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        {/* Cart Header */}
        <div className={`p-4 border-b ${styles.borderDefault} flex items-center justify-between ${styles.bgSubtle}`}>
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>Current Ticket</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[var(--rf-green-soft)] text-[var(--rf-primary)] font-bold border border-[var(--rf-primary)]/30">
                {cartItems.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            </div>
            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
              Cashier: <strong className={isDark ? 'text-white' : 'text-slate-800'}>{currentUser.name}</strong>
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Recall Button */}
            <button
              type="button"
              onClick={() => setIsRecallModalOpen(true)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer ${
                heldOrders.length > 0
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : `${isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`
              }`}
              title="View and Recall Parked Orders"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Recall ({heldOrders.length})</span>
            </button>

            {/* Hold Order Button */}
            <button
              type="button"
              onClick={handleHoldOrder}
              disabled={cartItems.length === 0}
              className={`p-1.5 ${isDark ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-800' : 'text-slate-600 hover:text-amber-600 hover:bg-amber-50'} disabled:opacity-30 rounded-xl transition cursor-pointer`}
              title="Park / Hold Ticket"
            >
              <PauseCircle className="w-4 h-4" />
            </button>

            {/* Clear Cart Button */}
            <button
              type="button"
              onClick={() => setIsClearModalOpen(true)}
              disabled={cartItems.length === 0}
              className={`p-1.5 ${isDark ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-800' : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50'} disabled:opacity-30 rounded-xl transition cursor-pointer`}
              title="Clear Ticket"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Customer & Delivery Context Bar */}
        <div className={`px-3 py-2 ${styles.bgSubtle} border-b ${styles.borderDefault} space-y-1.5`}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <UserIcon className="w-3 h-3 absolute left-2 top-2 text-slate-400" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); setSelectedCustomerId(null); }}
                placeholder="Customer Name"
                className={`w-full pl-6 pr-2 py-1 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'} border rounded-xl focus:outline-none focus:border-amber-500`}
              />
            </div>
            <div className="relative w-36">
              <Phone className="w-3 h-3 absolute left-2 top-2 text-slate-400" />
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => { setCustomerPhone(e.target.value); setSelectedCustomerId(null); }}
                placeholder="Phone #"
                className={`w-full pl-6 pr-2 py-1 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'} border rounded-xl focus:outline-none focus:border-amber-500 font-mono`}
              />
            </div>
            <button
              type="button"
              onClick={() => setIsCustomerPickerOpen((isOpen) => !isOpen)}
              className={`px-2 py-1.5 rounded-xl text-[10px] font-bold border shrink-0 ${selectedCustomerId ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : isDark ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-white border-slate-300 text-slate-600'}`}
              title="Select a saved customer"
            >
              <UserCheck className="w-3.5 h-3.5" />
            </button>
            {(selectedCustomerId || customerName || customerPhone) && (
              <button
                type="button"
                onClick={clearCustomer}
                className={`p-1.5 rounded-xl text-[10px] border shrink-0 ${isDark ? 'bg-slate-900 border-slate-700 text-slate-400 hover:text-rose-400' : 'bg-white border-slate-300 text-slate-500 hover:text-rose-600'}`}
                title="Clear selected customer and contact details"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {isCustomerPickerOpen && (
            <div className={`rounded-xl border p-2 space-y-1.5 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
              <input
                type="search"
                value={customerPickerQuery}
                onChange={(event) => setCustomerPickerQuery(event.target.value)}
                placeholder="Search saved customers by name or phone"
                autoFocus
                className={`w-full px-2.5 py-1.5 text-xs border rounded-lg ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'}`}
              />
              <div className="max-h-40 overflow-y-auto rounded-lg">
                {savedCustomerResults.length === 0 ? (
                  <p className="px-2 py-3 text-[11px] text-slate-400">No saved customer matches this search.</p>
                ) : savedCustomerResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => chooseCustomer(customer)}
                    className={`w-full px-2.5 py-2 text-left text-[11px] flex justify-between gap-2 border-b last:border-b-0 ${isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-200' : 'border-slate-100 hover:bg-slate-50 text-slate-700'}`}
                  >
                    <span className="min-w-0"><strong className="block truncate">{customer.name}</strong><span className="text-slate-400 truncate block">{customer.primaryAddress || 'No saved address'}</span></span>
                    <span className="font-mono text-slate-400 shrink-0">{customer.phone}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {customerMatches.length > 0 && (
            <div className={`rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} overflow-hidden`}>
              {customerMatches.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => chooseCustomer(customer)}
                  className={`w-full px-2.5 py-1.5 text-left text-[11px] flex justify-between gap-2 ${isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-50 text-slate-700'}`}
                >
                  <span className="font-semibold truncate">{customer.name}</span>
                  <span className="text-slate-400 font-mono shrink-0">{customer.phone}</span>
                </button>
              ))}
            </div>
          )}

          {/* Delivery Dispatch Info Bar */}
          {orderType === 'delivery' && (
            <div className={`flex items-center justify-between p-2 rounded-2xl ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} border text-xs shadow-2xs`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{activeDeliveryProvider.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'} truncate`}>{activeDeliveryProvider.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      fee: {money(branch.deliveryCharge)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {fullDeliveryAddress || 'Click to enter delivery address & dispatch rider'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={openDeliveryConfiguration}
                className="px-2.5 py-1 text-[11px] font-bold text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl shrink-0 transition cursor-pointer"
              >
                Change
              </button>
            </div>
          )}
        </div>

        {/* Line Items List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <ShoppingBag className="w-10 h-10 stroke-1 mb-2 text-slate-500/40" />
              <p className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Order ticket is empty</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
                Tap items on the menu to add them to this order
              </p>
            </div>
          ) : (
            cartItems.map((item, idx) => (
              <div
                key={item.id}
                className={`p-3 ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'} border rounded-2xl flex items-start justify-between gap-2 text-xs shadow-2xs`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between">
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'} truncate`}>{item.productName}</span>
                    <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'} pl-2 num-tabular`}>
                      {money(item.totalPrice)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {item.variationName && (
                      <span className="text-amber-500 font-medium">[{item.variationName}] </span>
                    )}
                    <span>{money(item.unitPrice)} each</span>
                  </div>

                  {item.selectedModifiers.length > 0 && (
                    <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                      {item.selectedModifiers.map((m, mIdx) => (
                        <div key={mIdx}>+ {m.name} (+{money(m.price)})</div>
                      ))}
                    </div>
                  )}

                  {item.itemNotes && (
                    <p className="text-[10px] text-amber-400 italic mt-1">Note: {item.itemNotes}</p>
                  )}
                  {editingNoteItemId === item.id ? (
                    <div className="mt-2 space-y-1.5">
                      <textarea
                        value={editingNoteValue}
                        onChange={(event) => setEditingNoteValue(event.target.value)}
                        maxLength={500}
                        rows={2}
                        autoFocus
                        placeholder="Kitchen instruction, e.g. no onion or extra spicy"
                        className={`w-full px-2 py-1.5 text-[11px] border rounded-lg ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'}`}
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={saveItemNote} className="text-[10px] font-bold text-amber-500">Save note</button>
                        <button type="button" onClick={() => { setEditingNoteItemId(null); setEditingNoteValue(''); }} className="text-[10px] text-slate-400">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => beginItemNoteEdit(item)} className="mt-1 text-[10px] font-semibold text-amber-500 hover:text-amber-400 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {item.itemNotes ? 'Edit kitchen note' : 'Add kitchen note'}
                    </button>
                  )}
                </div>

                {/* Qty Buttons */}
                <div className="flex items-center gap-1 bg-[#F4F8F5] border border-[#CFE3DC] rounded-xl p-0.5 ml-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateItemQty(idx, -1)}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[#516863] hover:text-white hover:bg-[#16665A] cursor-pointer transition"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className={`w-5 text-center font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateItemQty(idx, 1)}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[#516863] hover:text-white hover:bg-[#16665A] cursor-pointer transition"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Financial Breakup & Summary */}
        <div className={`p-3.5 ${styles.bgSubtle} border-t ${styles.borderDefault} space-y-2 text-xs`}>
          <div className="flex justify-between text-slate-400">
            <span>Subtotal</span>
            <span className={`font-mono font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'} num-tabular`}>{money(subtotal)}</span>
          </div>

          {/* Discount Selector: Toggle between % and Custom Dollar Amount */}
          <div className="p-2.5 bg-[#FFFDFC] border border-[#E8E3DA] rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <div className="flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-[#16665A]" />
                <span className="font-bold text-[11px] text-[#18302D]">Apply Discount:</span>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center bg-[#F4F8F5] border border-[#CFE3DC] p-0.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDiscountMode('percent')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-lg cursor-pointer transition ${
                    discountMode === 'percent'
                      ? 'bg-[#16665A] text-white font-black shadow-sm'
                      : 'bg-transparent text-[#516863] hover:bg-white hover:text-[#16665A]'
                  }`}
                >
                  % Percent
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountMode('amount')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-lg cursor-pointer transition ${
                    discountMode === 'amount'
                      ? 'bg-[#16665A] text-white font-black shadow-sm'
                      : 'bg-transparent text-[#516863] hover:bg-white hover:text-[#16665A]'
                  }`}
                >
                  {branch.currencySymbol || 'PKR'} Amount
                </button>
              </div>
            </div>

            {/* Presets and Custom Input */}
            <div className="flex items-center gap-1.5">
              {discountMode === 'percent' ? (
                <div className="flex items-center gap-1 flex-1">
                  {[0, 5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountValue(pct)}
                      className={`px-1.5 py-1 rounded-xl text-[10px] font-mono cursor-pointer transition flex-1 text-center border ${
                        discountValue === pct
                          ? 'bg-[#16665A] text-white font-bold border-[#16665A] shadow-sm'
                          : 'bg-white border-[#CFE3DC] text-[#35514C] hover:bg-[#E9F4EE] hover:border-[#8FC8BB]'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-1">
                  {[0, 2, 5, 10, 20].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDiscountValue(amt)}
                      className={`px-1.5 py-1 rounded-xl text-[10px] font-mono cursor-pointer transition flex-1 text-center border ${
                        discountValue === amt
                          ? 'bg-[#16665A] text-white font-bold border-[#16665A] shadow-sm'
                          : 'bg-white border-[#CFE3DC] text-[#35514C] hover:bg-[#E9F4EE] hover:border-[#8FC8BB]'
                      }`}
                    >
                      {money(amt)}
                    </button>
                  ))}
                </div>
              )}

              {/* Custom Value Input */}
              <div className="relative w-20">
                <span className="absolute left-1.5 top-1 text-[10px] text-slate-400 font-mono">
                  {discountMode === 'percent' ? '%' : branch.currencySymbol || 'PKR'}
                </span>
                <input
                  type="number"
                  min="0"
                  step={discountMode === 'percent' ? '1' : '0.50'}
                  value={discountValue || ''}
                  onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="Custom"
                  className="w-full pl-5 pr-1.5 py-1 text-xs font-mono font-bold bg-white border border-[#CFE3DC] text-slate-800 rounded-xl text-right focus:outline-none focus:border-[#16665A]"
                />
              </div>
            </div>

            {discountAmount > 0 && (
              <div className={`flex justify-between items-center pt-1 border-t ${styles.borderSubtle} text-[11px]`}>
                <span className="text-emerald-500 font-medium">
                  Savings ({discountPercentCalculated}%):
                </span>
                <span className="font-mono font-bold text-emerald-500 num-tabular">-{money(discountAmount)}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between text-slate-400">
            <span>{branch.taxName || 'Sales Tax'} ({branch.taxRate}%)</span>
            <span className={`font-mono font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'} num-tabular`}>{money(taxAmount)}</span>
          </div>

          {orderType === 'dine_in' && branch.serviceChargeRate > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>Service Charge ({branch.serviceChargeRate}%)</span>
              <span className={`font-mono font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'} num-tabular`}>{money(serviceChargeAmount)}</span>
            </div>
          )}

          {orderType === 'delivery' && (
            <div className="flex justify-between text-slate-400">
              <span className="flex items-center gap-1">
                <span>Delivery Fee</span>
                <span className="text-[10px] text-slate-500">({activeDeliveryProvider.name.split(' ')[0]})</span>
              </span>
              <span className={`font-mono font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'} num-tabular`}>{money(deliveryChargeAmount)}</span>
            </div>
          )}

          {/* Grand Total */}
          <div className={`flex justify-between items-baseline pt-2.5 border-t ${styles.borderDefault}`}>
            <div>
              <span className={`font-black text-sm uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>Payable Total</span>
              <span className="text-[10px] text-slate-400 block font-normal">
                Includes taxes & charges
              </span>
            </div>
            <span className="text-2xl font-black text-[#16665A] font-mono num-tabular">
              {money(grandTotal)}
            </span>
          </div>

          {/* Checkout Settle Button */}
          <div className="pt-1.5">
            <button
              type="button"
              disabled={cartItems.length === 0}
              onClick={handleOpenPayment}
              className="w-full py-3 bg-[#16665A] hover:bg-[#115448] disabled:opacity-100 text-white font-black text-sm rounded-2xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-[0.99]"
            >
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              <span>Charge & Settle ({money(grandTotal)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* DELIVERY DISPATCH CONFIGURATION MODAL */}
      {isDeliveryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className={`${styles.bgElevated} rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border ${styles.borderStrong} animate-in zoom-in-95 duration-150`}>
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500 text-slate-950">
                  <Bike className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Delivery & Dispatch Configuration</h3>
                  <span className="text-[10px] text-slate-400">Select delivery channel and customer destination</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDeliveryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Select Delivery Channel */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                  Select Delivery Channel / Provider:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {activeDeliveryMethods.map((provider) => {
                    const isSelected = deliveryChannel === provider.id;
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => setDeliveryChannel(provider.id)}
                        className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/40 text-amber-500 shadow-xs'
                            : `${isDark ? 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xl">{provider.icon}</span>
                          {provider.commissionRate > 0 ? (
                            <span className="text-[9px] font-mono font-bold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                              {provider.commissionRate}% comm
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                              0% direct
                            </span>
                          )}
                        </div>
                        <div className="mt-2">
                          <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'} leading-tight`}>{provider.name}</h4>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Customer Contact Details */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t ${styles.borderSubtle}`}>
                <div>
                  <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Customer Full Name <span className="font-normal text-slate-400">(optional)</span></label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Michael Scott"
                    className={`w-full px-3 py-2 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded-xl focus:outline-none focus:border-amber-500`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Phone Number <span className="font-normal text-slate-400">(optional)</span></label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. +1 555-019-2834"
                    className={`w-full px-3 py-2 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded-xl focus:outline-none focus:border-amber-500 font-mono`}
                  />
                </div>
              </div>

              {/* Delivery Address */}
              <div className={`space-y-3 pt-2 border-t ${styles.borderSubtle}`}>
                <div>
                  <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
                    Street Address & Building <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={deliveryStreet}
                    onChange={(e) => setDeliveryStreet(e.target.value)}
                    placeholder="e.g. 1725 Slough Avenue, Building B"
                    className={`w-full px-3 py-2 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded-xl focus:outline-none focus:border-amber-500`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
                      Apt / Floor / Landmark
                    </label>
                    <input
                      type="text"
                      value={deliveryApt}
                      onChange={(e) => setDeliveryApt(e.target.value)}
                      placeholder="e.g. 3rd Floor, Suite 100"
                      className={`w-full px-3 py-2 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded-xl focus:outline-none focus:border-amber-500`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
                      Assigned Rider / Courier
                    </label>
                    <select
                      value={selectedRiderId}
                      onChange={(event) => selectRider(event.target.value)}
                      className={`w-full px-3 py-2 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded-xl focus:outline-none focus:border-amber-500`}
                    >
                      <option value="">Unassigned / external courier</option>
                      {riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}{rider.phone ? ` — ${rider.phone}` : ''}</option>)}
                    </select>
                    {!selectedRiderId && (
                      <input
                        type="text"
                        value={riderName}
                        onChange={(event) => setRiderName(event.target.value)}
                        placeholder="Optional external courier name"
                        className={`w-full mt-2 px-3 py-2 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded-xl focus:outline-none focus:border-amber-500`}
                      />
                    )}
                  </div>
                </div>

                <div className={`pt-3 border-t ${styles.borderSubtle}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{riders.length ? `${riders.length} active rider${riders.length === 1 ? '' : 's'} available` : 'No delivery riders added yet'}</span>
                    {canManageStaff && <button type="button" onClick={() => { setIsAddRiderOpen((open) => !open); setRiderError(''); }} className="text-[11px] font-bold text-amber-500">{isAddRiderOpen ? 'Cancel rider setup' : '+ Add delivery rider'}</button>}
                  </div>
                  {isAddRiderOpen && (
                    <div className={`mt-2 p-3 rounded-xl border space-y-2 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                      <input value={newRiderName} onChange={(event) => setNewRiderName(event.target.value)} placeholder="Rider full name *" className={`w-full px-2.5 py-2 text-xs border rounded-lg ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`} />
                      <input value={newRiderPhone} onChange={(event) => setNewRiderPhone(event.target.value)} placeholder="Phone number" className={`w-full px-2.5 py-2 text-xs border rounded-lg ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`} />
                      <input type="password" inputMode="numeric" maxLength={6} value={newRiderPin} onChange={(event) => setNewRiderPin(event.target.value.replace(/\D/g, ''))} placeholder="4–6 digit terminal PIN *" className={`w-full px-2.5 py-2 text-xs border rounded-lg ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`} />
                      {riderError && <p className="text-[10px] text-rose-500">{riderError}</p>}
                      <button type="button" onClick={() => void addDeliveryRider()} className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-bold">Save rider</button>
                    </div>
                  )}
                  {!canManageStaff && <p className="mt-1 text-[10px] text-slate-400">A manager can add riders from Staff & Expenses → Staff Roster.</p>}
                </div>

                <div>
                  <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
                    Rider & Kitchen Delivery Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="e.g. Please leave at door, contact customer via WhatsApp upon arrival"
                    className={`w-full px-3 py-2 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded-xl focus:outline-none focus:border-amber-500`}
                  />
                </div>
              </div>
            </div>

            <div className={`p-4 ${styles.bgSubtle} border-t ${styles.borderDefault} flex items-center justify-end gap-2`}>
              <button
                type="button"
                onClick={() => setIsDeliveryModalOpen(false)}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition cursor-pointer"
              >
                Apply Dispatch Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARKED & HELD ORDERS MODAL (RECALL TICKETS) */}
      {isRecallModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className={`${styles.bgElevated} rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border ${styles.borderStrong} animate-in zoom-in-95 duration-150`}>
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500 text-slate-950">
                  <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Parked & Held Tickets</h3>
                  <span className="text-[10px] text-slate-400">Recall held orders back to the register</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecallModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              {heldOrders.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <PauseCircle className="w-12 h-12 stroke-1 mx-auto mb-2 text-slate-500/40" />
                  <p className={`font-bold text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>No Parked Orders</p>
                  <p className="text-xs text-slate-500 mt-1">
                    You can park active orders using the pause icon in the cart header.
                  </p>
                </div>
              ) : (
                heldOrders.map((held) => (
                  <div
                    key={held.id}
                    className={`p-4 ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'} border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-amber-400 transition`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{held.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">
                          {held.orderType}
                        </span>
                        <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-500" /> {held.time}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {held.items.length} line items: {held.items.map((i) => `${i.quantity}x ${i.productName}`).slice(0, 3).join(', ')}
                        {held.items.length > 3 ? '...' : ''}
                      </p>
                      <div className="text-xs font-black font-mono text-amber-500 mt-1 num-tabular">
                        Total: {money(held.total)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHeldOrder(held.id, e)}
                        className={`p-2 text-slate-400 hover:text-rose-400 ${isDark ? 'hover:bg-rose-500/10' : 'hover:bg-rose-50'} rounded-xl transition cursor-pointer`}
                        title="Discard held ticket"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRecallOrder(held.id)}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <PlayCircle className="w-4 h-4" />
                        <span>Recall to Cart</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className={`p-4 ${styles.bgSubtle} border-t ${styles.borderDefault} flex justify-end`}>
              <button
                type="button"
                onClick={() => setIsRecallModalOpen(false)}
                className={`px-4 py-2 text-xs font-semibold ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'} cursor-pointer`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR CART CONFIRMATION MODAL (IN-APP) */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className={`${styles.bgElevated} rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border ${styles.borderStrong} animate-in zoom-in-95 duration-150`}>
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 stroke-2" />
            </div>
            <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>Clear Current Ticket?</h3>
            <p className="text-xs text-slate-400 mt-1">
              All items currently added to this ticket will be discarded. This cannot be undone.
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className={`px-4 py-2 text-xs font-bold ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'} rounded-xl transition cursor-pointer`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearCart}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs cursor-pointer"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT MODIFIERS MODAL */}
      {customizingProduct && (
        <ProductCustomizationModal
          product={customizingProduct}
          currencySymbol={branch.currencySymbol}
          isOpen={!!customizingProduct}
          onClose={() => setCustomizingProduct(null)}
          onConfirm={addProductToCart}
        />
      )}

      {/* SPLIT / CASH / CARD PAYMENT MODAL */}
      <SplitPaymentModal
        grandTotal={grandTotal}
        currencySymbol={branch.currencySymbol}
        paymentMethods={paymentMethods}
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        onConfirmPayment={handlePaymentCompleted}
      />

      {/* THERMAL 80MM RECEIPT MODAL */}
      <ReceiptModal
        order={lastCompletedOrder}
        branch={branch}
        currentUser={currentUser}
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
      />
    </div>
  );
};
