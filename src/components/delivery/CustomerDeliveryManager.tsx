import React, { useState } from 'react';
import {
  Branch,
  User,
  Customer,
  DeliveryZone,
  Order,
  DeliveryChannel,
  DeliveryOutcome,
  OrderStatus,
  Product,
  DeliveryMethodConfig,
} from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';
import {
  Users,
  Bike,
  MapPin,
  Award,
  Phone,
  Search,
  Plus,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Tag,
  Star,
  RefreshCw,
  Edit,
  Trash2,
  X,
  AlertTriangle,
  RotateCcw,
  Truck,
  Building2,
  ShieldAlert,
  Flame,
  Check,
  PackageX,
  FileSpreadsheet,
} from 'lucide-react';

interface CustomerDeliveryManagerProps {
  branch: Branch;
  currentUser: User;
}

interface ProviderMeta extends DeliveryMethodConfig {
  label: string;
  badgeBg: string;
  textColor: string;
  borderColor: string;
  icon: string;
  defaultCommissionPercent: number;
}


export const CustomerDeliveryManager: React.FC<CustomerDeliveryManagerProps> = ({
  branch,
  currentUser,
}) => {
  const { styles } = useAppTheme();
  const money = (amount: number) => formatCurrency(amount, branch.currencySymbol);
  const [activeTab, setActiveTab] = useState<'dispatch' | 'customers' | 'zones' | 'analytics' | 'methods'>('dispatch');
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethodConfig[]>(() => sqliteService.getDeliveryMethods());
  const [customers, setCustomers] = useState<Customer[]>(() => sqliteService.getCustomers());
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(() =>
    sqliteService.getDeliveryZones(branch.id)
  );
  const [orders, setOrders] = useState<Order[]>(() => sqliteService.getOrders(branch.id));
  const [menuProducts] = useState<Product[]>(() => sqliteService.getProducts().filter((product) => product.isAvailable !== false));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Customer Add / Edit Modal State
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newTag, setNewTag] = useState<'VIP' | 'Regular' | 'Corporate' | 'Delivery'>('Regular');
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zoneMinOrder, setZoneMinOrder] = useState('0');
  const [zoneDeliveryFee, setZoneDeliveryFee] = useState('0');
  const [zoneMinutes, setZoneMinutes] = useState('30');
  const [zoneActive, setZoneActive] = useState(true);

  // Delivery Outcome / Loss Modal State (Return / Damage / Lost)
  const [isOutcomeModalOpen, setIsOutcomeModalOpen] = useState(false);
  const [selectedOrderForOutcome, setSelectedOrderForOutcome] = useState<Order | null>(null);
  const [targetOutcome, setTargetOutcome] = useState<DeliveryOutcome>('returned');
  const [lossAmountInput, setLossAmountInput] = useState('');
  const [lossReasonInput, setLossReasonInput] = useState('');
  const [lossAbsorbedBy, setLossAbsorbedBy] = useState<'restaurant' | 'rider' | 'aggregator'>('restaurant');
  const [outcomeNotes, setOutcomeNotes] = useState('');

  // New Delivery Order Modal State
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [newOrderCustomerName, setNewOrderCustomerName] = useState('');
  const [newOrderPhone, setNewOrderPhone] = useState('');
  const [newOrderAddress, setNewOrderAddress] = useState('');
  const [newOrderChannel, setNewOrderChannel] = useState<DeliveryChannel>(() => sqliteService.getDeliveryMethods().find((method) => method.id === 'foodpanda' && method.enabled)?.id || sqliteService.getDeliveryMethods().find((method) => method.enabled)?.id || 'own_fleet');
  const [newOrderProductId, setNewOrderProductId] = useState(() => sqliteService.getProducts().find((product) => product.isAvailable !== false)?.id || '');
  const [newOrderQuantity, setNewOrderQuantity] = useState('1');
  const [newOrderRider, setNewOrderRider] = useState('Rider Mike');
  const [deliveryError, setDeliveryError] = useState('');
  const [newMethodName, setNewMethodName] = useState('');
  const [newMethodCommission, setNewMethodCommission] = useState('0');
  const [newMethodIcon, setNewMethodIcon] = useState('🚚');
  const [methodError, setMethodError] = useState('');
  const showDeliveryError = (error: unknown) => setDeliveryError(error instanceof Error ? error.message : 'The requested delivery action could not be completed.');

  const activeDeliveryMethods = deliveryMethods.filter((method) => method.enabled);
  const providerMeta = (channel: DeliveryChannel): ProviderMeta => {
    const index = Math.max(0, deliveryMethods.findIndex((method) => method.id === channel));
    const method = deliveryMethods.find((entry) => entry.id === channel);
    const colors = [
      ['bg-blue-100', 'text-blue-800', 'border-blue-300'],
      ['bg-pink-100', 'text-pink-800', 'border-pink-300'],
      ['bg-emerald-100', 'text-emerald-800', 'border-emerald-300'],
      ['bg-purple-100', 'text-purple-800', 'border-purple-300'],
    ][index % 4];
    return {
      id: method?.id || channel,
      name: method?.name || channel.replace(/^custom:/, '').replace(/[_-]/g, ' '),
      label: method?.name || channel.replace(/^custom:/, '').replace(/[_-]/g, ' '),
      icon: method?.icon || '🚚', commissionRate: method?.commissionRate || 0,
      enabled: method?.enabled !== false, displayOrder: method?.displayOrder || index + 1, system: method?.system,
      badgeBg: colors[0], textColor: colors[1], borderColor: colors[2], defaultCommissionPercent: method?.commissionRate || 0,
    };
  };

  const refreshData = () => {
    setCustomers(sqliteService.getCustomers());
    setDeliveryZones(sqliteService.getDeliveryZones(branch.id));
    setOrders(sqliteService.getOrders(branch.id));
    setDeliveryMethods(sqliteService.getDeliveryMethods());
  };

  // Filter Delivery Orders
  const deliveryOrders = orders.filter((o) => o.orderType === 'delivery');

  const filteredDeliveryOrders = deliveryOrders.filter((ord) => {
    // Provider filter
    const channel = ord.deliveryChannel || 'own_fleet';
    if (selectedProviderFilter !== 'all' && channel !== selectedProviderFilter) {
      return false;
    }
    // Status filter
    if (selectedStatusFilter !== 'all') {
      if (selectedStatusFilter === 'delivered' && ord.status !== 'delivered') return false;
      if (selectedStatusFilter === 'returned' && ord.deliveryOutcome !== 'returned') return false;
      if (selectedStatusFilter === 'damaged' && ord.deliveryOutcome !== 'damaged') return false;
      if (selectedStatusFilter === 'lost' && ord.deliveryOutcome !== 'lost') return false;
      if (selectedStatusFilter === 'active' && ['delivered', 'cancelled'].includes(ord.status)) return false;
    }
    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchInvoice = ord.invoiceNumber.toLowerCase().includes(q);
      const matchCust = ord.customerName && ord.customerName.toLowerCase().includes(q);
      const matchPhone = ord.customerPhone && ord.customerPhone.includes(q);
      const matchRider = ord.riderName && ord.riderName.toLowerCase().includes(q);
      return matchInvoice || matchCust || matchPhone || matchRider;
    }
    return true;
  });

  // Profit & Loss Calculations
  const totalGrossDeliverySales = deliveryOrders.reduce((sum, o) => sum + o.grandTotal, 0);
  const totalLossAmount = deliveryOrders.reduce((sum, o) => sum + (o.deliveryLossAmount || 0), 0);
  const totalDeliveredOrders = deliveryOrders.filter((o) => o.status === 'delivered').length;
  const totalReturnedOrders = deliveryOrders.filter((o) => o.deliveryOutcome === 'returned').length;
  const totalDamagedOrders = deliveryOrders.filter((o) => o.deliveryOutcome === 'damaged').length;
  const totalLostOrders = deliveryOrders.filter((o) => o.deliveryOutcome === 'lost').length;
  const totalIncidents = totalReturnedOrders + totalDamagedOrders + totalLostOrders;
  const incidentRate = deliveryOrders.length > 0 ? (totalIncidents / deliveryOrders.length) * 100 : 0;
  const netRealizedRevenue = totalGrossDeliverySales - totalLossAmount;

  // Outcome Modal Handler
  const handleOpenOutcomeModal = (order: Order, outcome: DeliveryOutcome) => {
    setSelectedOrderForOutcome(order);
    setTargetOutcome(outcome);
    setLossAmountInput(order.grandTotal.toFixed(2));
    if (outcome === 'damaged') {
      setLossReasonInput('Food spilled or box crushed during transit');
    } else if (outcome === 'returned') {
      setLossReasonInput('Customer refused delivery or address not reachable');
    } else if (outcome === 'lost') {
      setLossReasonInput('Courier uncontactable or package missing');
    }
    setLossAbsorbedBy('restaurant');
    setOutcomeNotes('');
    setIsOutcomeModalOpen(true);
  };

  const handleSaveOutcome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForOutcome) return;

    const lossNum = parseFloat(lossAmountInput) || 0;
    try { await sqliteService.updateDeliveryOutcome(
      selectedOrderForOutcome.id,
      targetOutcome,
      {
        lossAmount: lossNum,
        lossReason: lossReasonInput,
        absorbedBy: lossAbsorbedBy,
        notes: outcomeNotes,
      },
      currentUser
    ); setIsOutcomeModalOpen(false); setSelectedOrderForOutcome(null); refreshData(); } catch (error) { showDeliveryError(error); }
  };

  const handleMarkDeliveredSuccess = async (order: Order) => {
    try { await sqliteService.updateDeliveryOutcome(
      order.id,
      'delivered',
      {
        lossAmount: 0,
        notes: 'Delivered successfully and collected',
      },
      currentUser
    ); refreshData(); } catch (error) { showDeliveryError(error); }
  };

  // Create New Delivery Order
  const handleCreateDeliveryOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const product = menuProducts.find((entry) => entry.id === newOrderProductId);
    const quantity = Number(newOrderQuantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      showDeliveryError(new Error('Choose an available menu item and a valid quantity.'));
      return;
    }
    const subtotal = +(Number(product.basePrice) * quantity).toFixed(2);
    const taxAmount = branch.taxEnabled === false ? 0 : branch.taxInclusive
      ? +(subtotal - subtotal / (1 + branch.taxRate / 100)).toFixed(2)
      : +(subtotal * branch.taxRate / 100).toFixed(2);
    const deliveryCharge = branch.deliveryCharge;
    const commissionRate = providerMeta(newOrderChannel).commissionRate;

    try { await sqliteService.createOrder(
      {
        branchId: branch.id,
        orderType: 'delivery',
        deliveryChannel: newOrderChannel,
        status: 'confirmed',
        customerName: newOrderCustomerName,
        customerPhone: newOrderPhone,
        deliveryAddress: newOrderAddress,
        riderName: newOrderRider || undefined,
        deliveryCommissionRate: commissionRate,
        deliveryCommissionAmount: +(((subtotal + (branch.taxInclusive ? 0 : taxAmount) + deliveryCharge) * commissionRate) / 100).toFixed(2),
        items: [
          {
            id: `itm-${Date.now()}`,
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            unitPrice: product.basePrice,
            quantity,
            selectedModifiers: [],
            kitchenStatus: 'pending',
            kitchenStation: product.kitchenStation,
            totalPrice: subtotal,
          },
        ],
        subtotal,
        itemDiscounts: 0,
        orderDiscountPercent: 0,
        orderDiscountAmount: 0,
        taxAmount,
        serviceChargeAmount: 0,
        deliveryChargeAmount: deliveryCharge,
        grandTotal: +(subtotal + (branch.taxInclusive ? 0 : taxAmount) + deliveryCharge).toFixed(2),
        amountPaid: 0,
        changeGiven: 0,
        cashierId: currentUser.id,
        cashierName: currentUser.name,
      },
      currentUser
    ); setIsNewOrderModalOpen(false); refreshData(); } catch (error) { showDeliveryError(error); }
  };

  // Customer Management
  const handleOpenAddCustomer = () => {
    setEditingCustomer(null);
    setNewName('');
    setNewPhone('');
    setNewAddress('');
    setNewTag('Regular');
    setIsCustomerModalOpen(true);
  };

  const handleOpenEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setNewName(c.name);
    setNewPhone(c.phone);
    setNewAddress(c.primaryAddress || '');
    setNewTag(c.tags[0] || 'Regular');
    setIsCustomerModalOpen(true);
  };

  const handleDeleteCustomer = async (c: Customer) => {
    if (window.confirm(`Delete customer "${c.name}" from CRM directory?`)) {
      try { await sqliteService.deleteCustomer(c.id, currentUser); refreshData(); } catch (error) { showDeliveryError(error); }
    }
  };

  const handleAdjustLoyalty = async (customer: Customer) => {
    const pointsInput = window.prompt(`Adjust loyalty points for ${customer.name}. Use a positive or negative whole number.`, '0');
    if (pointsInput === null) return;
    const points = Number(pointsInput);
    if (!Number.isInteger(points) || points === 0) { showDeliveryError(new Error('Enter a non-zero whole number of loyalty points.')); return; }
    const reason = window.prompt('Reason for this loyalty adjustment:', 'Manual customer-service adjustment');
    if (reason === null) return;
    try { await sqliteService.adjustLoyalty(customer.id, points, reason, currentUser); refreshData(); } catch (error) { showDeliveryError(error); }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;

    try { if (editingCustomer) {
      await sqliteService.updateCustomer(
        editingCustomer.id,
        {
          name: newName,
          phone: newPhone,
          primaryAddress: newAddress,
          tags: [newTag],
        },
        currentUser
      );
    } else {
      await sqliteService.addCustomer(
        {
          name: newName,
          phone: newPhone,
          primaryAddress: newAddress,
          tags: [newTag],
          notes: 'Customer directory profile',
        },
        currentUser
      );
    }
    setIsCustomerModalOpen(false); refreshData(); } catch (error) { showDeliveryError(error); }
  };

  const handleOpenAddZone = () => {
    setEditingZone(null); setZoneName(''); setZoneMinOrder('0'); setZoneDeliveryFee('0'); setZoneMinutes('30'); setZoneActive(true); setIsZoneModalOpen(true);
  };

  const handleOpenEditZone = (zone: DeliveryZone) => {
    setEditingZone(zone); setZoneName(zone.name); setZoneMinOrder(zone.minOrderAmount.toString()); setZoneDeliveryFee(zone.deliveryFee.toString()); setZoneMinutes(zone.estimatedMinutes.toString()); setZoneActive(zone.active); setIsZoneModalOpen(true);
  };

  const handleSaveZone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!zoneName.trim()) return;
    const details = { name: zoneName.trim(), minOrderAmount: Number(zoneMinOrder), deliveryFee: Number(zoneDeliveryFee), estimatedMinutes: Number(zoneMinutes), active: zoneActive };
    try {
      if (editingZone) await sqliteService.updateDeliveryZone(editingZone.id, details, currentUser);
      else await sqliteService.addDeliveryZone({ ...details, branchId: branch.id }, currentUser);
      setIsZoneModalOpen(false); refreshData();
    } catch (error) { showDeliveryError(error); }
  };

  const handleDeleteZone = async (zone: DeliveryZone) => {
    if (!window.confirm(`Delete delivery zone "${zone.name}"?`)) return;
    try { await sqliteService.deleteDeliveryZone(zone.id, currentUser); refreshData(); } catch (error) { showDeliveryError(error); }
  };

  const canConfigureDeliveryMethods = sqliteService.getUserPermissions(currentUser).canConfigureSettings;
  const handleAddDeliveryMethod = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newMethodName.trim();
    const commissionRate = Number(newMethodCommission);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (name.length < 2 || name.length > 80 || slug.length < 2 || !Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      setMethodError('Enter a delivery method name and a commission from 0 to 100%.');
      return;
    }
    const id = `custom:${slug}`;
    if (deliveryMethods.some((method) => method.id === id || method.name.toLowerCase() === name.toLowerCase())) {
      setMethodError('A delivery method with that name already exists.');
      return;
    }
    try {
      const updated = await sqliteService.updateDeliveryMethods([...deliveryMethods, { id, name, icon: newMethodIcon.trim() || '🚚', commissionRate, enabled: true, displayOrder: deliveryMethods.length + 1 }], currentUser);
      setDeliveryMethods(updated); setNewMethodName(''); setNewMethodCommission('0'); setNewMethodIcon('🚚'); setMethodError('');
    } catch (error) { setMethodError(error instanceof Error ? error.message : 'The delivery method could not be added.'); }
  };

  const handleDeliveryMethodChange = async (method: DeliveryMethodConfig, change: Partial<DeliveryMethodConfig>) => {
    try {
      const updated = await sqliteService.updateDeliveryMethods(deliveryMethods.map((entry) => entry.id === method.id ? { ...entry, ...change } : entry), currentUser);
      setDeliveryMethods(updated); setMethodError('');
      if (!updated.some((entry) => entry.id === newOrderChannel && entry.enabled)) setNewOrderChannel(updated.find((entry) => entry.enabled)?.id || 'own_fleet');
    } catch (error) { setMethodError(error instanceof Error ? error.message : 'The delivery method could not be updated.'); }
  };

  const handleDeleteDeliveryMethod = async (method: DeliveryMethodConfig) => {
    if (method.system) { setMethodError('Built-in Own Fleet and Foodpanda methods cannot be removed.'); return; }
    try {
      const updated = await sqliteService.updateDeliveryMethods(deliveryMethods.filter((entry) => entry.id !== method.id), currentUser);
      setDeliveryMethods(updated); setMethodError('');
    } catch (error) { setMethodError(error instanceof Error ? error.message : 'The delivery method could not be removed.'); }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.primaryAddress && c.primaryAddress.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 gap-4 p-4 ${styles.bgApp} overflow-hidden`}>
      {/* Top Header Bar */}
      <div className={`p-4 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-4 shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#E8F3F0] border border-[#B9D8D0] text-[#16665A]">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Multi-Channel Delivery & Return Loss Accounting</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
                Dispatch Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Foodpanda, Uber Eats, Own Fleet • Returns, Damage & Lost Order Profit/Loss Ledger
            </p>
          </div>
        </div>

        {/* Action Controls & Tab Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsNewOrderModalOpen(true)}
            className="px-3.5 py-1.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Dispatch Delivery Order</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('dispatch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'dispatch' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-3.5 h-3.5 inline mr-1" />
              Dispatch ({deliveryOrders.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'analytics' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1" />
              P&L Ledger
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('customers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'customers' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 inline mr-1" />
              CRM Directory ({customers.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('zones')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'zones' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 inline mr-1" />
              Zones
            </button>
            {canConfigureDeliveryMethods && (
              <button
                type="button"
                onClick={() => setActiveTab('methods')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'methods' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck className="w-3.5 h-3.5 inline mr-1" />
                Delivery Methods
              </button>
            )}
          </div>
        </div>
      </div>

      {deliveryError && <div className="px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex justify-between gap-3"><span>{deliveryError}</span><button type="button" onClick={() => setDeliveryError('')} className="font-bold">Dismiss</button></div>}

      {/* Main Container */}
      <div className="flex-1 min-h-0 p-1 overflow-y-auto space-y-5">
        {/* KPI Summary Cards: P&L, Incident Rates, Provider Volumes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Gross Delivery Sales
            </span>
            <div className="text-2xl font-black font-mono text-slate-900 mt-1">
              {money(totalGrossDeliverySales)}
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block">{deliveryOrders.length} total delivery tickets</span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Net Realized Revenue
            </span>
            <div className="text-2xl font-black font-mono text-emerald-700 mt-1">
              {money(netRealizedRevenue)}
            </div>
            <span className="text-[10px] text-emerald-600 font-medium mt-0.5 block">
              After deducting losses & damages
            </span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-rose-200 bg-rose-50/20 shadow-xs">
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Total Losses & Damages
            </span>
            <div className="text-2xl font-black font-mono text-rose-600 mt-1">
              {money(totalLossAmount)}
            </div>
            <span className="text-[10px] text-rose-600 font-medium mt-0.5 block">
              {totalIncidents} incidents (Returns/Damage/Lost)
            </span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Incident Failure Rate
            </span>
            <div className="text-2xl font-black font-mono text-slate-900 mt-1">
              {incidentRate.toFixed(1)}%
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block">
              {totalDeliveredOrders} successfully fulfilled
            </span>
          </div>
        </div>

        {/* TAB 1: DISPATCH CONSOLE */}
        {activeTab === 'dispatch' && (
          <div className="space-y-4">
            {/* Filter Strip: By configured delivery method and status */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by ticket #, customer, address, or rider..."
                    className="w-full text-xs font-medium text-slate-800 focus:outline-none"
                  />
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-500 mr-1">Status:</span>
                  {(
                    [
                      { id: 'all', label: 'All Status' },
                      { id: 'active', label: 'Active Out' },
                      { id: 'delivered', label: 'Delivered' },
                      { id: 'returned', label: 'Returned' },
                      { id: 'damaged', label: 'Damaged' },
                      { id: 'lost', label: 'Lost' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStatusFilter(st.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        selectedStatusFilter === st.id
                          ? 'bg-slate-900 text-white shadow-2xs font-bold'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Provider Badges Filter Strip */}
              <div className="pt-3 border-t border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-xs font-bold text-slate-500 shrink-0">Delivery System:</span>
                <button
                  type="button"
                  onClick={() => setSelectedProviderFilter('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                    selectedProviderFilter === 'all'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All Systems
                </button>

                {activeDeliveryMethods.map((method) => {
                  const provKey = method.id;
                  const meta = providerMeta(provKey);
                  const isSel = selectedProviderFilter === provKey;
                  const count = deliveryOrders.filter((o) => (o.deliveryChannel || 'own_fleet') === provKey).length;
                  return (
                    <button
                      key={provKey}
                      type="button"
                      onClick={() => setSelectedProviderFilter(provKey)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold border transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                        isSel
                          ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-2xs'
                          : `${meta.badgeBg} ${meta.textColor} ${meta.borderColor} hover:opacity-90`
                      }`}
                    >
                      <span>{meta.icon}</span>
                      <span>{meta.label}</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-white/70 text-slate-900 text-[10px] font-mono font-bold">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Orders Dispatch Cards */}
            <div className="space-y-3">
              {filteredDeliveryOrders.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                  <Truck className="w-12 h-12 stroke-1 text-slate-300 mx-auto mb-2" />
                  <h4 className="font-bold text-slate-700 text-sm">No delivery orders match the criteria</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Click "+ Dispatch Delivery Order" to create an order on Foodpanda, Own Fleet, or other platforms.
                  </p>
                </div>
              ) : (
                filteredDeliveryOrders.map((ord) => {
                  const channel = ord.deliveryChannel || 'own_fleet';
                  const prov = providerMeta(channel);
                  const outcome = ord.deliveryOutcome;
                  const isFinished = ['delivered', 'cancelled'].includes(ord.status);

                  return (
                    <div
                      key={ord.id}
                      className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-xs transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      {/* Left Side: Order Info & Provider Badge */}
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-black text-sm text-slate-900">
                            {ord.invoiceNumber}
                          </span>

                          {/* Provider Badge */}
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 border ${prov.badgeBg} ${prov.textColor} ${prov.borderColor}`}
                          >
                            <span>{prov.icon}</span>
                            <span>{prov.label}</span>
                          </span>

                          {/* Outcome / Status Badge */}
                          {outcome === 'delivered' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Delivered
                            </span>
                          ) : outcome === 'returned' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                              <RotateCcw className="w-3.5 h-3.5" />
                              Returned Order
                            </span>
                          ) : outcome === 'damaged' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Damaged / Spilled
                            </span>
                          ) : outcome === 'lost' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-900 border border-red-300 flex items-center gap-1">
                              <PackageX className="w-3.5 h-3.5" />
                              Lost / Undelivered
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-300 animate-pulse">
                              🛵 Out for Delivery
                            </span>
                          )}
                        </div>

                        {/* Customer & Address Details */}
                        <div className="text-xs text-slate-700">
                          <strong>Customer:</strong> {ord.customerName} ({ord.customerPhone}) •{' '}
                          <strong>Rider:</strong> {ord.riderName || 'Pending Assignment'}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{ord.deliveryAddress || 'Pickup Point'}</span>
                        </div>

                        {/* Loss Details if returned/damaged */}
                        {ord.deliveryLossAmount && ord.deliveryLossAmount > 0 ? (
                          <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex flex-wrap items-center justify-between gap-2 mt-2">
                            <span>
                              <strong>Loss Recorded:</strong> {money(ord.deliveryLossAmount)} (Reason: {ord.deliveryLossReason || 'N/A'})
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-950 uppercase">
                              Absorbed by: {ord.deliveryLossAbsorbedBy?.toUpperCase() || 'RESTAURANT'}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      {/* Right Side: Financial Amounts & Action Buttons */}
                      <div className="flex flex-col md:items-end justify-between gap-3 shrink-0">
                        <div className="text-left md:text-right">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                            Order Value
                          </span>
                          <span className="text-xl font-black font-mono text-slate-900">
                            {money(ord.grandTotal)}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            Delivery Fee: {money(ord.deliveryChargeAmount)}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {!isFinished ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleMarkDeliveredSuccess(ord)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Mark Delivered</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenOutcomeModal(ord, 'returned')}
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                title="Customer returned / refused order"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Return</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenOutcomeModal(ord, 'damaged')}
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                title="Food damaged / spilled in transit"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Damage</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenOutcomeModal(ord, 'lost')}
                                className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-800 border border-red-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                title="Lost / Stolen by rider"
                              >
                                <PackageX className="w-3.5 h-3.5" />
                                <span>Lost</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenOutcomeModal(ord, outcome || 'returned')}
                              className="px-2.5 py-1 text-slate-600 hover:text-slate-900 text-xs font-semibold hover:bg-slate-100 rounded-lg transition"
                            >
                              Adjust P&L Outcome
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: P&L LEDGER & PLATFORM COMPARISON */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Platform Commission & Damage/Loss Financial Ledger
                  </h3>
                  <p className="text-xs text-slate-500">
                    Detailed channel breakdown for the configured delivery methods
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                    <tr>
                      <th className="px-6 py-3">Delivery Platform</th>
                      <th className="px-4 py-3 text-center">Total Orders</th>
                      <th className="px-4 py-3 text-right">Gross Sales</th>
                      <th className="px-4 py-3 text-right">Avg Commission %</th>
                      <th className="px-4 py-3 text-right">Commission Est.</th>
                      <th className="px-4 py-3 text-right">Damage / Lost Loss</th>
                      <th className="px-6 py-3 text-right">Net Profitability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {deliveryMethods.map((method) => {
                      const provKey = method.id;
                      const meta = providerMeta(provKey);
                      const provOrders = deliveryOrders.filter((o) => (o.deliveryChannel || 'own_fleet') === provKey);
                      const gross = provOrders.reduce((sum, o) => sum + o.grandTotal, 0);
                      const losses = provOrders.reduce((sum, o) => sum + (o.deliveryLossAmount || 0), 0);
                      const commissionEst = (gross * meta.defaultCommissionPercent) / 100;
                      const net = gross - commissionEst - losses;

                      return (
                        <tr key={provKey} className="hover:bg-slate-50 transition">
                          <td className="px-6 py-4 font-bold text-slate-900">
                            <span className="flex items-center gap-2">
                              <span>{meta.icon}</span>
                              <span>{meta.label}</span>
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center font-mono">{provOrders.length}</td>
                          <td className="px-4 py-4 text-right font-mono font-bold">{money(gross)}</td>
                          <td className="px-4 py-4 text-right font-mono text-slate-500">
                            {meta.defaultCommissionPercent}%
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-amber-700">
                            {money(commissionEst)}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-rose-600 font-bold">
                            {money(losses)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-black text-emerald-700 text-sm">
                            {money(net)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'methods' && canConfigureDeliveryMethods && (
          <div className="max-w-3xl space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-900">Delivery methods</h3>
              <p className="mt-1 text-xs text-slate-500">Own Fleet and Foodpanda are built in. Add only the channels your store actually uses; disabled methods cannot be selected for new delivery tickets.</p>
              {methodError && <div className="mt-3 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs">{methodError}</div>}
              <div className="mt-4 space-y-2">
                {deliveryMethods.map((method) => (
                  <div key={method.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <span className="text-lg">{method.icon}</span>
                    <div className="min-w-36 flex-1"><div className="font-bold text-sm text-slate-900">{method.name}</div><div className="text-[10px] text-slate-500">{method.system ? 'Built-in method' : 'Custom method'}</div></div>
                    <label className="text-xs text-slate-600">Commission <input type="number" min="0" max="100" step="0.01" value={method.commissionRate} onChange={(event) => handleDeliveryMethodChange(method, { commissionRate: Number(event.target.value) })} className="ml-1 w-20 rounded border border-slate-300 px-2 py-1 font-mono" />%</label>
                    <button type="button" onClick={() => handleDeliveryMethodChange(method, { enabled: !method.enabled })} disabled={method.system} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${method.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'} ${method.system ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>{method.enabled ? 'Enabled' : 'Disabled'}</button>
                    {!method.system && <button type="button" onClick={() => handleDeleteDeliveryMethod(method)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer">Remove</button>}
                  </div>
                ))}
              </div>
            </div>
            <form onSubmit={handleAddDeliveryMethod} className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-900">Add custom delivery method</h3>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-[80px_1fr_120px_auto] gap-3">
                <input value={newMethodIcon} onChange={(event) => setNewMethodIcon(event.target.value)} maxLength={16} aria-label="Icon" className="rounded-xl border border-slate-300 px-3 py-2" />
                <input value={newMethodName} onChange={(event) => setNewMethodName(event.target.value)} maxLength={80} placeholder="e.g. Website orders" required className="rounded-xl border border-slate-300 px-3 py-2" />
                <input type="number" min="0" max="100" step="0.01" value={newMethodCommission} onChange={(event) => setNewMethodCommission(event.target.value)} aria-label="Commission percent" className="rounded-xl border border-slate-300 px-3 py-2 font-mono" />
                <button type="submit" className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-600 cursor-pointer">Add method</button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: CUSTOMERS CRM DIRECTORY */}
        {activeTab === 'customers' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Customer CRM Directory & Loyalty Profiles</h3>
                <p className="text-xs text-slate-500">Customer contact information, delivery addresses and order history</p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddCustomer}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Customer</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="px-6 py-3">Customer Name</th>
                    <th className="px-4 py-3">Phone & Address</th>
                    <th className="px-4 py-3">Category Tag</th>
                    <th className="px-4 py-3 text-right">Loyalty Points</th>
                    <th className="px-4 py-3 text-right">Lifetime Spent</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{cust.name}</span>
                          {cust.tags.includes('VIP') && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        <div className="font-mono">{cust.phone}</div>
                        <div className="text-[11px] text-slate-500">{cust.primaryAddress || 'No address logged'}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {cust.tags[0] || 'Regular'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-amber-600">
                        {cust.loyaltyPoints} pts
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-slate-900">
                        {money(cust.totalSpent)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditCustomer(cust)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdjustLoyalty(cust)}
                            className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition cursor-pointer"
                            title="Adjust loyalty points"
                          >
                            <Award className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomer(cust)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: DELIVERY ZONES */}
        {activeTab === 'zones' && (
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h3 className="font-bold text-sm text-slate-900">Delivery Zone Rules</h3><p className="text-xs text-slate-500">Set minimum order values, fees, travel time, and availability by service area.</p></div>
              <button type="button" onClick={handleOpenAddZone} className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add Zone</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {deliveryZones.map((zone) => (
              <div key={zone.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-600 uppercase">Zone Rule</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${zone.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      {zone.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <h4 className="font-bold text-base text-slate-900 mt-2">{zone.name}</h4>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Delivery Fee Surcharge:</span>
                      <strong className="font-mono text-slate-900">{money(zone.deliveryFee)}</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Min Order Amount:</span>
                      <strong className="font-mono text-slate-900">{money(zone.minOrderAmount)}</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Est. Transit Time:</span>
                      <strong className="font-mono text-slate-900">{zone.estimatedMinutes} mins</strong>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button type="button" onClick={() => handleOpenEditZone(zone)} className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg" title="Edit zone"><Edit className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => handleDeleteZone(zone)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Delete zone"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: RECORD RETURN / DAMAGE / LOST WITH P&L IMPACT */}
      {isOutcomeModalOpen && selectedOrderForOutcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)] max-w-md w-full overflow-hidden border border-[#E8E3DA]">
            <div className="px-6 py-4 bg-[#F7F3EC] border-b border-[#E8E3DA] flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Record Delivery Return, Damage or Loss
              </h3>
              <button
                type="button"
                onClick={() => setIsOutcomeModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOutcome} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-mono font-bold text-slate-900">
                  Order #{selectedOrderForOutcome.invoiceNumber}
                </div>
                <div className="text-slate-600">
                  Customer: <strong>{selectedOrderForOutcome.customerName}</strong> • Provider:{' '}
                  <strong>{providerMeta(selectedOrderForOutcome.deliveryChannel || 'own_fleet').label}</strong>
                </div>
                <div className="text-slate-600">
                  Total Order Value: <strong className="font-mono">{money(selectedOrderForOutcome.grandTotal)}</strong>
                </div>
              </div>

              {/* Outcome Picker */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">Incident Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'returned', label: '🔄 Returned' },
                    { id: 'damaged', label: '💥 Damaged' },
                    { id: 'lost', label: '❌ Lost / Stolen' },
                  ].map((oc) => (
                    <button
                      key={oc.id}
                      type="button"
                      onClick={() => setTargetOutcome(oc.id as DeliveryOutcome)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        targetOutcome === oc.id
                          ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {oc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Loss amount */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">Financial Loss Amount ({branch.currencySymbol || 'PKR'}) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={lossAmountInput}
                  onChange={(e) => setLossAmountInput(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold text-sm"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Amount deducted from store revenue in delivery profit & loss calculations
                </span>
              </div>

              {/* Loss Reason */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">Reason for Return / Damage / Loss *</label>
                <input
                  type="text"
                  value={lossReasonInput}
                  onChange={(e) => setLossReasonInput(e.target.value)}
                  placeholder="e.g. Rider bicycle tipped over, soup spilled"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              {/* Who Absorbs Loss */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">Loss Absorbed By</label>
                <select
                  value={lossAbsorbedBy}
                  onChange={(e) => setLossAbsorbedBy(e.target.value as 'restaurant' | 'rider' | 'aggregator')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                >
                  <option value="restaurant">🏪 Restaurant (Write-off in Cost of Goods)</option>
                  <option value="rider">🛵 Rider Pay Deduction (Courier at fault)</option>
                  <option value="aggregator">🏢 Delivery-platform claim / reimbursement</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOutcomeModalOpen(false)}
                  className="px-4 py-2 border border-[#B9D8D0] bg-white rounded-xl text-[#35514C] hover:bg-[#E8F3F0] hover:text-[#16665A] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Log Loss to Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DISPATCH NEW DELIVERY ORDER */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">Dispatch Delivery Ticket</h3>
              <button
                type="button"
                onClick={() => setIsNewOrderModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDeliveryOrder} className="p-6 space-y-4 text-xs">
              {/* Channel / Provider */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">Delivery System / Aggregator *</label>
                <select
                  value={newOrderChannel}
                  onChange={(e) => setNewOrderChannel(e.target.value as DeliveryChannel)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                >
                  {activeDeliveryMethods.map((method) => (
                    (() => {
                      const pk = method.id;
                      const meta = providerMeta(pk);
                      return (
                    <option key={pk} value={pk}>
                      {meta.icon} {meta.label}
                    </option>
                      );
                    })()
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={newOrderCustomerName}
                  onChange={(e) => setNewOrderCustomerName(e.target.value)}
                  placeholder="e.g. Jessica Taylor"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Customer Phone *</label>
                  <input
                    type="text"
                    value={newOrderPhone}
                    onChange={(e) => setNewOrderPhone(e.target.value)}
                    placeholder="555-0199"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Assigned Rider</label>
                  <input
                    type="text"
                    value={newOrderRider}
                    onChange={(e) => setNewOrderRider(e.target.value)}
                    placeholder="Courier name or ID"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Delivery Street Address *</label>
                <input
                  type="text"
                  value={newOrderAddress}
                  onChange={(e) => setNewOrderAddress(e.target.value)}
                  placeholder="Apt 4B, 88 Grand Ave, Downtown"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Menu Item *</label>
                <select value={newOrderProductId} onChange={(e) => setNewOrderProductId(e.target.value)} required className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold">
                  {menuProducts.map((product) => <option key={product.id} value={product.id}>{product.name} — {branch.currencySymbol} {product.basePrice.toFixed(2)}</option>)}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Quantity *</label>
                <input type="number" min="1" max="1000" step="1" value={newOrderQuantity} onChange={(e) => setNewOrderQuantity(e.target.value)} required className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold" />
                <p className="mt-1 text-[10px] text-slate-500">For multiple items, variations, or modifiers, create the ticket from POS Terminal.</p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewOrderModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm transition cursor-pointer"
                >
                  Create & Dispatch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CUSTOMER ADD / EDIT */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                {editingCustomer ? 'Edit Customer Profile' : 'Add New Customer Profile'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  placeholder="e.g. David Hasselhoff"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Phone Number *</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  required
                  placeholder="e.g. +1 (555) 012-3456"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Primary Delivery Address</label>
                <textarea
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  rows={2}
                  placeholder="Street, Building, Unit / Floor..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Customer Classification</label>
                <select
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value as 'VIP' | 'Regular' | 'Corporate' | 'Delivery')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                >
                  <option value="Regular">Regular Patron</option>
                  <option value="VIP">⭐ VIP Guest</option>
                  <option value="Corporate">🏢 Corporate Account</option>
                  <option value="Delivery">🛵 Delivery Priority</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm transition cursor-pointer"
                >
                  Save Customer Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isZoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between"><h3 className="font-bold text-base text-slate-900">{editingZone ? 'Edit Delivery Zone' : 'Add Delivery Zone'}</h3><button type="button" onClick={() => setIsZoneModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"><X className="w-5 h-5" /></button></div>
            <form onSubmit={handleSaveZone} className="p-6 space-y-4 text-xs">
              <label className="block font-medium text-slate-700">Zone Name *<input required value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="e.g. Gulberg, DHA Phase 5" className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block font-medium text-slate-700">Minimum Order<input required type="number" min="0" step="0.01" value={zoneMinOrder} onChange={(event) => setZoneMinOrder(event.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono" /></label>
                <label className="block font-medium text-slate-700">Delivery Fee<input required type="number" min="0" step="0.01" value={zoneDeliveryFee} onChange={(event) => setZoneDeliveryFee(event.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono" /></label>
              </div>
              <label className="block font-medium text-slate-700">Estimated Minutes<input required type="number" min="1" max="720" value={zoneMinutes} onChange={(event) => setZoneMinutes(event.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono" /></label>
              <label className="flex items-center gap-2 font-medium text-slate-700"><input type="checkbox" checked={zoneActive} onChange={(event) => setZoneActive(event.target.checked)} /> Zone is active for orders</label>
              <div className="pt-3 border-t border-[#E8E3DA] flex justify-end gap-2"><button type="button" onClick={() => setIsZoneModalOpen(false)} className="px-4 py-2 border border-[#B9D8D0] bg-white rounded-xl text-[#35514C] hover:bg-[#E8F3F0] hover:text-[#16665A] font-semibold cursor-pointer">Cancel</button><button type="submit" className="px-5 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm cursor-pointer">Save Zone</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
