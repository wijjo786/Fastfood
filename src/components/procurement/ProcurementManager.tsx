import React, { useState } from 'react';
import { Branch, User, Vendor, PurchaseOrder, GoodsReceivedNote, PurchaseOrderItem } from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';
import {
  Truck,
  FileText,
  PackageCheck,
  CreditCard,
  Plus,
  DollarSign,
  Building2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  RefreshCw,
  Edit,
  Trash2,
  X,
} from 'lucide-react';

interface ProcurementManagerProps {
  branch: Branch;
  currentUser: User;
}

export const ProcurementManager: React.FC<ProcurementManagerProps> = ({ branch, currentUser }) => {
  const { styles } = useAppTheme();
  const money = (amount: number) => formatCurrency(amount, branch.currencySymbol);
  const [activeTab, setActiveTab] = useState<'vendors' | 'po' | 'grn'>('vendors');
  const [vendors, setVendors] = useState<Vendor[]>(() => sqliteService.getVendors());
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() =>
    sqliteService.getPurchaseOrders(branch.id)
  );
  const [grns, setGrns] = useState<GoodsReceivedNote[]>(() => sqliteService.getGRNs(branch.id));
  const ingredients = sqliteService.getIngredients(branch.id);

  // Vendor Add / Edit Modal State
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vName, setVName] = useState('');
  const [vCompany, setVCompany] = useState('');
  const [vContact, setVContact] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vAddress, setVAddress] = useState('');
  const [vTerms, setVTerms] = useState('Net 15');

  // Vendor Payment Modal
  const [payingVendor, setPayingVendor] = useState<Vendor | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'cash' | 'cheque'>('bank_transfer');
  const [paymentRef, setPaymentRef] = useState('');

  // Receive PO Modal
  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
  const [invoiceRef, setInvoiceRef] = useState('');
  const [receivingQuantities, setReceivingQuantities] = useState<Record<string, string>>({});

  // Create Purchase Order Modal
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [poVendorId, setPoVendorId] = useState(vendors[0]?.id || '');
  const [poStatus, setPoStatus] = useState<'draft' | 'ordered'>('ordered');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState<PurchaseOrderItem[]>([]);
  const [poIngId, setPoIngId] = useState(ingredients[0]?.id || '');
  const [poIngQty, setPoIngQty] = useState('20');
  const [poIngUnitCost, setPoIngUnitCost] = useState('2.50');

  const refreshData = () => {
    setVendors(sqliteService.getVendors());
    setPurchaseOrders(sqliteService.getPurchaseOrders(branch.id));
    setGrns(sqliteService.getGRNs(branch.id));
  };

  const handleOpenAddVendor = () => {
    setEditingVendor(null);
    setVName('');
    setVCompany('');
    setVContact('');
    setVPhone('');
    setVEmail('');
    setVAddress('');
    setVTerms('Net 15');
    setIsVendorModalOpen(true);
  };

  const handleOpenEditVendor = (v: Vendor) => {
    setEditingVendor(v);
    setVName(v.name);
    setVCompany(v.companyName);
    setVContact(v.contactPerson);
    setVPhone(v.phone);
    setVEmail(v.email);
    setVAddress(v.address);
    setVTerms(v.paymentTerms);
    setIsVendorModalOpen(true);
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vName.trim()) return;

    if (editingVendor) {
      await sqliteService.updateVendor(
        editingVendor.id,
        {
          name: vName,
          companyName: vCompany || vName,
          contactPerson: vContact,
          phone: vPhone,
          email: vEmail,
          address: vAddress,
          paymentTerms: vTerms,
        },
        currentUser
      );
    } else {
      await sqliteService.addVendor(
        {
          name: vName,
          companyName: vCompany || vName,
          contactPerson: vContact,
          phone: vPhone,
          email: vEmail,
          address: vAddress,
          paymentTerms: vTerms,
          active: true,
        },
        currentUser
      );
    }

    setIsVendorModalOpen(false);
    refreshData();
  };

  const handleDeleteVendor = async (v: Vendor) => {
    if (window.confirm(`Delete supplier "${v.name}"?`)) {
      await sqliteService.deleteVendor(v.id, currentUser);
      refreshData();
    }
  };

  const handlePayVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingVendor) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    await sqliteService.recordVendorPayment(payingVendor.id, amount, paymentMethod, paymentRef || 'TXN-DIRECT', currentUser);
    setPayingVendor(null);
    setPaymentAmount('');
    setPaymentRef('');
    refreshData();
  };

  const handleConfirmGRN = async () => {
    if (!receivingPO || !invoiceRef.trim()) return;
    const itemsToReceive = receivingPO.items
      .map((item) => ({
        ingredientId: item.ingredientId,
        quantity: Number(receivingQuantities[item.ingredientId] || 0),
      }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);
    if (itemsToReceive.length === 0) return;

    await sqliteService.postGRN(receivingPO.id, invoiceRef, itemsToReceive, currentUser);
    setReceivingPO(null);
    setInvoiceRef('');
    setReceivingQuantities({});
    refreshData();
  };

  const handleOpenReceivePO = (po: PurchaseOrder) => {
    setReceivingPO(po);
    setInvoiceRef('');
    setReceivingQuantities(
      Object.fromEntries(
        po.items.map((item) => [
          item.ingredientId,
          String(Math.max(0, Number(item.quantityOrdered) - Number(item.quantityReceived || 0))),
        ])
      )
    );
  };

  const handleOpenNewPO = () => {
    setEditingPO(null);
    setPoVendorId(vendors[0]?.id || '');
    setPoStatus('ordered');
    setPoItems([]);
    setPoNotes('');
    setIsPOModalOpen(true);
  };

  const handleOpenLowStockReorder = () => {
    const suggestedItems = ingredients
      .filter((ingredient) => Number(ingredient.currentStock) <= Number(ingredient.minThreshold))
      .map((ingredient) => {
        const quantityOrdered = +(Math.max(Number(ingredient.minThreshold), Number(ingredient.minThreshold) * 2 - Number(ingredient.currentStock))).toFixed(2);
        return { ingredientId: ingredient.id, ingredientName: ingredient.name, quantityOrdered, quantityReceived: 0, unit: ingredient.unit, unitCost: Number(ingredient.unitCost || 0), totalCost: +(quantityOrdered * Number(ingredient.unitCost || 0)).toFixed(2) };
      });
    if (!suggestedItems.length) return;
    setEditingPO(null);
    setPoVendorId(vendors[0]?.id || '');
    setPoStatus('draft');
    setPoItems(suggestedItems);
    setPoNotes('Low-stock replenishment suggestion: restore each ingredient to twice its minimum threshold. Review quantities and select the supplier before issuing.');
    setIsPOModalOpen(true);
  };

  const handleOpenEditPO = (po: PurchaseOrder) => {
    setEditingPO(po);
    setPoVendorId(po.vendorId);
    setPoStatus(po.status === 'draft' ? 'draft' : 'ordered');
    setPoItems(po.items.map((item) => ({ ...item })));
    setPoNotes(po.notes || '');
    setIsPOModalOpen(true);
  };

  const handleApprovePO = async (po: PurchaseOrder) => {
    await sqliteService.updatePurchaseOrder({ ...po, status: 'ordered' }, currentUser);
    refreshData();
  };

  // Add Item to Purchase Order builder
  const handleAddPOItem = () => {
    const target = ingredients.find((i) => i.id === poIngId);
    if (!target) return;
    const qty = parseFloat(poIngQty) || 1;
    const cost = parseFloat(poIngUnitCost) || target.unitCost;
    const total = +(qty * cost).toFixed(2);

    setPoItems([
      ...poItems,
      {
        ingredientId: target.id,
        ingredientName: target.name,
        quantityOrdered: qty,
        quantityReceived: 0,
        unit: target.unit,
        unitCost: cost,
        totalCost: total,
      },
    ]);
  };

  const handleRemovePOItem = (index: number) => {
    setPoItems(poItems.filter((_, idx) => idx !== index));
  };

  const handleSavePO = async (e: React.FormEvent) => {
    e.preventDefault();
    const vendor = vendors.find((v) => v.id === poVendorId);
    if (!vendor || poItems.length === 0) return;

    const totalVal = poItems.reduce((acc, i) => acc + i.totalCost, 0);

    if (editingPO) {
      await sqliteService.updatePurchaseOrder(
        {
          ...editingPO,
          vendorId: vendor.id,
          vendorName: vendor.name,
          status: poStatus,
          items: poItems,
          totalAmount: totalVal,
          notes: poNotes || 'Standard stock replenishment order',
        },
        currentUser
      );
    } else {
      await sqliteService.createPurchaseOrder(
        {
          branchId: branch.id,
          vendorId: vendor.id,
          vendorName: vendor.name,
          status: poStatus,
          items: poItems,
          totalAmount: totalVal,
          notes: poNotes || 'Standard stock replenishment order',
        },
        currentUser
      );
    }

    setIsPOModalOpen(false);
    setEditingPO(null);
    setPoItems([]);
    setPoNotes('');
    refreshData();
  };

  const totalOutstanding = vendors.reduce((acc, v) => acc + v.outstandingBalance, 0);
  const hasReceiveQuantity = receivingPO?.items.some((item) => {
    const quantity = Number(receivingQuantities[item.ingredientId] || 0);
    return Number.isFinite(quantity) && quantity > 0;
  }) || false;

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 gap-4 p-4 ${styles.bgApp} overflow-hidden`}>
      {/* Header Bar */}
      <div className={`p-4 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-4 shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Supplier Procurement & Goods Receiving</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Accounts Payable Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Suppliers Directory, Purchase Orders, Goods Received (GRN) & Vendor Balances
            </p>
          </div>
        </div>

        {/* Tab Switcher & Action Controls */}
        <div className="flex items-center gap-2">
          {activeTab === 'vendors' ? (
            <button
              type="button"
              onClick={handleOpenAddVendor}
              className="px-3.5 py-1.5 bg-[var(--rf-primary)] hover:bg-[var(--rf-primary-hover)] text-[var(--rf-primary-text)] font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Supplier</span>
            </button>
          ) : activeTab === 'po' ? (
            <div className="flex gap-2"><button type="button" onClick={handleOpenLowStockReorder} disabled={!ingredients.some((ingredient) => ingredient.currentStock <= ingredient.minThreshold)} className="px-3.5 py-1.5 bg-rose-100 hover:bg-rose-200 disabled:opacity-40 text-rose-800 font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"><AlertCircle className="w-3.5 h-3.5" /><span>Low-Stock Draft</span></button><button type="button" onClick={handleOpenNewPO} className="px-3.5 py-1.5 bg-[var(--rf-primary)] hover:bg-[var(--rf-primary-hover)] text-[var(--rf-primary-text)] font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /><span>+ New Purchase Order</span></button></div>
          ) : null}

          <div className="flex items-center gap-1 bg-[#F4F8F5] border border-[#E8E3DA] p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('vendors')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'vendors'
                  ? 'bg-[#16665A] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-[#16665A]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 inline mr-1" />
              Suppliers ({vendors.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('po')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'po'
                  ? 'bg-[#16665A] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-[#16665A]'
              }`}
            >
              <FileText className="w-3.5 h-3.5 inline mr-1" />
              Purchase Orders ({purchaseOrders.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('grn')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'grn'
                  ? 'bg-[#16665A] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-[#16665A]'
              }`}
            >
              <PackageCheck className="w-3.5 h-3.5 inline mr-1" />
              Goods Received (GRN) ({grns.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`${styles.bgCard} p-4 rounded-2xl border ${styles.borderDefault}`}>
            <span className="text-xs font-medium text-slate-500">Active Supply Vendors</span>
            <div className="text-2xl font-black font-mono text-slate-900 mt-1">{vendors.length}</div>
            <span className="text-[11px] text-slate-500 mt-1 block">Contracted suppliers</span>
          </div>

          <div className={`${styles.bgCard} p-4 rounded-2xl border ${styles.borderDefault}`}>
            <span className="text-xs font-medium text-slate-500">Total Accounts Payable</span>
            <div className="text-2xl font-black font-mono text-rose-600 mt-1">
              {money(totalOutstanding)}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Due under Net terms</span>
          </div>

          <div className={`${styles.bgCard} p-4 rounded-2xl border ${styles.borderDefault}`}>
            <span className="text-xs font-medium text-slate-500">Pending PO Deliveries</span>
            <div className="text-2xl font-black font-mono text-amber-600 mt-1">
              {purchaseOrders.filter((p) => p.status === 'ordered').length}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Awaiting physical receiving</span>
          </div>
        </div>

        {/* TAB 1: VENDORS DIRECTORY */}
        {activeTab === 'vendors' && (
          <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.borderDefault} flex items-center justify-between`}>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Approved Food & Beverage Suppliers</h3>
                <p className="text-xs text-slate-500">Manage vendor contact details, terms, and payables</p>
              </div>
              <button
                type="button"
                onClick={refreshData}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3">Vendor / Company</th>
                    <th className="px-4 py-3">Contact Person</th>
                    <th className="px-4 py-3">Payment Terms</th>
                    <th className="px-4 py-3 text-right">Outstanding Balance</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vendors.map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 text-sm">{vendor.name}</div>
                        <div className="text-[11px] text-slate-500">{vendor.companyName}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{vendor.address}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        <div className="font-medium">{vendor.contactPerson}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" /> {vendor.phone}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] border border-slate-200 font-semibold">
                          {vendor.paymentTerms}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-sm">
                        <span className={vendor.outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {money(vendor.outstandingBalance)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setPayingVendor(vendor);
                              setPaymentAmount(vendor.outstandingBalance.toString());
                            }}
                            disabled={vendor.outstandingBalance <= 0}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                          >
                            Pay
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditVendor(vendor)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Edit Supplier"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVendor(vendor)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Delete Supplier"
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

        {/* TAB 2: PURCHASE ORDERS */}
        {activeTab === 'po' && (
          <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.borderDefault} flex items-center justify-between`}>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Purchase Orders (PO)</h3>
                <p className="text-xs text-slate-500">Track orders issued to food ingredient suppliers</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {purchaseOrders.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">No purchase orders created yet.</div>
              ) : (
                purchaseOrders.map((po) => (
                  <div key={po.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/60 transition">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-slate-900">{po.poNumber}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            po.status === 'received'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {po.status}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 mt-1">Vendor: {po.vendorName}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Created: {new Date(po.createdAt).toLocaleDateString()} • Note: {po.notes}
                      </div>

                      {/* Ordered items breakdown */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {po.items.map((item, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] text-slate-700 font-mono">
                            {item.quantityOrdered} {item.unit} {item.ingredientName} ({money(item.totalCost)})
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-xs text-slate-500 block">Total PO Value</span>
                        <span className="text-lg font-black font-mono text-slate-900">{money(po.totalAmount)}</span>
                      </div>

                      {['draft', 'ordered'].includes(po.status) && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditPO(po)}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      )}
                      {po.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => void handleApprovePO(po)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Issue PO</span>
                        </button>
                      )}
                      {['ordered', 'partially_received'].includes(po.status) && (
                        <button
                          type="button"
                          onClick={() => handleOpenReceivePO(po)}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <PackageCheck className="w-4 h-4" />
                          <span>Receive Goods (GRN)</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: GOODS RECEIVED NOTES (GRN) */}
        {activeTab === 'grn' && (
          <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.borderDefault}`}>
              <h3 className="font-bold text-sm text-slate-900">Goods Received Notes (GRN Audit Trail)</h3>
              <p className="text-xs text-slate-500">
                Verified deliveries that successfully increased inventory in the store database
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {grns.map((grn) => (
                <div key={grn.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-emerald-700">{grn.grnNumber}</span>
                      <span className="text-xs text-slate-500">Ref: PO #{grn.poNumber}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        STOCK REPLENISHED
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-800 mt-1">Vendor: {grn.vendorName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Received by: {grn.receivedBy} • Vendor Invoice #{grn.invoiceReference} • {new Date(grn.receivedAt).toLocaleDateString()}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {grn.items.map((item, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] text-slate-700 font-mono">
                          +{item.quantityReceived} {item.unit} {item.ingredientName} ({money(item.totalCost)})
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">Inventory Value Posted</span>
                    <span className="text-base font-black font-mono text-emerald-700">
                      +{money(grn.totalAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      {isVendorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)] max-w-md w-full overflow-hidden border border-[#E8E3DA] p-6 space-y-4">
            <h3 className="font-extrabold text-base text-[#18302D]">
              {editingVendor ? 'Edit Supplier Details' : 'Add New Food & Beverage Supplier'}
            </h3>
            <form onSubmit={handleSaveVendor} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Supplier Brand / Trade Name *</label>
                <input
                  type="text"
                  value={vName}
                  onChange={(e) => setVName(e.target.value)}
                  placeholder="e.g. Valley Fresh Meat Co."
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Registered Company Name</label>
                <input
                  type="text"
                  value={vCompany}
                  onChange={(e) => setVCompany(e.target.value)}
                  placeholder="e.g. Valley Fresh Foods LLC"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Contact Representative</label>
                  <input
                    type="text"
                    value={vContact}
                    onChange={(e) => setVContact(e.target.value)}
                    placeholder="e.g. Marcus Vance"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={vPhone}
                    onChange={(e) => setVPhone(e.target.value)}
                    placeholder="e.g. +1 555-442-1920"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={vEmail}
                    onChange={(e) => setVEmail(e.target.value)}
                    placeholder="orders@supplier.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Payment Terms</label>
                  <select
                    value={vTerms}
                    onChange={(e) => setVTerms(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                  >
                    <option value="Net 15">Net 15 Days</option>
                    <option value="Net 30">Net 30 Days</option>
                    <option value="COD">Cash On Delivery (COD)</option>
                    <option value="Weekly Cycle">Weekly Friday Settlement</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Delivery Address / Depot</label>
                <input
                  type="text"
                  value={vAddress}
                  onChange={(e) => setVAddress(e.target.value)}
                  placeholder="e.g. 102 Distribution Way, Logistics City"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsVendorModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm cursor-pointer"
                >
                  {editingVendor ? 'Save Changes' : 'Create Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Purchase Order Modal */}
      {isPOModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)] max-w-lg w-full overflow-hidden border border-[#E8E3DA] p-6 space-y-4">
            <h3 className="font-extrabold text-base text-[#18302D]">{editingPO ? `Edit ${editingPO.poNumber}` : 'Create Purchase Order (PO)'}</h3>
            <p className="text-xs text-slate-500">
              {editingPO ? 'Edit this purchase order before any goods have been received.' : 'Draft or issue an official inventory replenishment order to an approved supplier.'}
            </p>

            <form onSubmit={handleSavePO} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Select Supplier *</label>
                <select
                  value={poVendorId}
                  onChange={(e) => setPoVendorId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.paymentTerms})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Purchase Order Status</label>
                <select
                  value={poStatus}
                  onChange={(e) => setPoStatus(e.target.value as 'draft' | 'ordered')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                >
                  <option value="draft">Save as Draft</option>
                  <option value="ordered">Issue to Supplier</option>
                </select>
              </div>

              {/* Add Ingredient Line Item */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 block">Add Ingredient Items to PO</span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3 sm:col-span-1">
                    <select
                      value={poIngId}
                      onChange={(e) => {
                        setPoIngId(e.target.value);
                        const sel = ingredients.find((i) => i.id === e.target.value);
                        if (sel) setPoIngUnitCost(sel.unitCost.toString());
                      }}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
                    >
                      {ingredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} ({ing.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      step="0.1"
                      value={poIngQty}
                      onChange={(e) => setPoIngQty(e.target.value)}
                      placeholder="Qty"
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      step="0.01"
                      value={poIngUnitCost}
                      onChange={(e) => setPoIngUnitCost(e.target.value)}
                      placeholder={`Cost (${branch.currencySymbol || 'PKR'})`}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAddPOItem}
                      className="px-3 py-1.5 bg-[#16665A] text-white font-bold rounded-lg hover:bg-[#115448] cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {poItems.length > 0 && (
                  <div className="divide-y divide-slate-200 pt-2 max-h-36 overflow-y-auto">
                    {poItems.map((item, idx) => (
                      <div key={idx} className="py-1 flex items-center justify-between">
                        <span>{item.quantityOrdered} {item.unit} {item.ingredientName}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{money(item.totalCost)}</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePOItem(idx)}
                            className="text-rose-500 hover:text-rose-700 text-xs cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes / Instructions</label>
                <input
                  type="text"
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  placeholder="e.g. Please deliver to back loading dock before 10 AM"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsPOModalOpen(false); setEditingPO(null); }}
                  className="px-3.5 py-1.5 text-slate-600 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={poItems.length === 0}
                  className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] disabled:opacity-40 text-white font-bold rounded-xl shadow-sm cursor-pointer"
                >
                  {editingPO ? 'Save Purchase Order' : poStatus === 'draft' ? 'Save Draft' : 'Issue Purchase Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Vendor Modal */}
      {payingVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900">Record Vendor Settlement</h3>
            <p className="text-xs text-slate-500">
              Disburse payment to <strong className="text-slate-900">{payingVendor.name}</strong>. This updates their payable ledger balance.
            </p>

            <form onSubmit={handlePayVendor} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Amount ({branch.currencySymbol || 'PKR'})</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 text-base font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Disbursement Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                >
                  <option value="bank_transfer">Bank Wire / Electronic Transfer</option>
                  <option value="cheque">Company Cheque</option>
                  <option value="cash">Petty Cash Voucher</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Bank Reference / Cheque #</label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. WIRE-884299"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayingVendor(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Goods (GRN) Modal */}
      {receivingPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900">Receive Shipment & Post GRN</h3>
            <p className="text-xs text-slate-500">
              Select the quantities delivered for <strong className="text-slate-900">{receivingPO.poNumber}</strong>. Posting a GRN immediately increases stock and records the supplier payable.
            </p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              {receivingPO.items.map((item) => {
                const remaining = Math.max(0, Number(item.quantityOrdered) - Number(item.quantityReceived || 0));
                return (
                  <div key={item.ingredientId} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-slate-200 last:border-0 pb-2 last:pb-0">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate">{item.ingredientName}</div>
                      <div className="text-[10px] text-slate-500">
                        Ordered {item.quantityOrdered} {item.unit} · Previously received {item.quantityReceived} · Remaining {remaining}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-slate-700">
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        step="0.001"
                        disabled={remaining <= 0}
                        value={receivingQuantities[item.ingredientId] || ''}
                        onChange={(event) => setReceivingQuantities((quantities) => ({
                          ...quantities,
                          [item.ingredientId]: event.target.value,
                        }))}
                        className="w-20 px-2 py-1 text-right text-xs bg-white border border-slate-300 rounded-lg text-slate-800 disabled:bg-slate-100"
                        aria-label={`Quantity received for ${item.ingredientName}`}
                      />
                      <span className="w-8 text-[10px] text-slate-500">{item.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Supplier Paper Invoice #</label>
              <input
                type="text"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="e.g. INV-SUPP-9012"
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setReceivingPO(null);
                  setReceivingQuantities({});
                }}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmGRN}
                disabled={!invoiceRef.trim() || !hasReceiveQuantity}
                className="px-5 py-2.5 bg-[#16665A] hover:bg-[#115448] disabled:bg-[#E8E3DA] disabled:text-[#97A6A1] disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
              >
                Post to Stock & Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
