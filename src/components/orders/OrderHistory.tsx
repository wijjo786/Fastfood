import React, { useMemo, useState } from 'react';
import { Branch, Order, OrderStatus, OrderType, User } from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { formatCurrency } from '../../utils/currency';
import { ReceiptModal } from '../pos/ReceiptModal';
import { Bike, Eye, Printer, RefreshCw, Search, ShoppingBag, UtensilsCrossed, X } from 'lucide-react';

interface OrderHistoryProps {
  branch: Branch;
  currentUser: User;
}

const typeLabel: Record<OrderType, string> = { dine_in: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' };
const statusLabel = (status: OrderStatus) => status.replace(/_/g, ' ');

export const OrderHistory: React.FC<OrderHistoryProps> = ({ branch, currentUser }) => {
  const [orders, setOrders] = useState<Order[]>(() => sqliteService.getOrders(branch.id));
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | OrderType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [reversalOrder, setReversalOrder] = useState<Order | null>(null);
  const [reversalChoice, setReversalChoice] = useState<'cancel_before_preparation' | 'cancel_after_preparation' | 'customer_return'>('cancel_before_preparation');
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState('');
  const money = (amount: number) => formatCurrency(amount, branch.currencySymbol);
  const canIssueRefunds = sqliteService.getUserPermissions(currentUser).canIssueRefunds;

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (typeFilter !== 'all' && order.orderType !== typeFilter) return false;
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (startDate && order.createdAt < `${startDate}T00:00:00.000Z`) return false;
      if (endDate && order.createdAt > `${endDate}T23:59:59.999Z`) return false;
      if (!needle) return true;
      return [order.invoiceNumber, order.customerName, order.customerPhone, order.cashierName, order.tableName, order.riderName]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [orders, query, typeFilter, statusFilter, startDate, endDate]);

  const refresh = () => setOrders(sqliteService.getOrders(branch.id));
  const channelIcon = (type: OrderType) => type === 'dine_in' ? <UtensilsCrossed className="h-3.5 w-3.5" /> : type === 'takeaway' ? <ShoppingBag className="h-3.5 w-3.5" /> : <Bike className="h-3.5 w-3.5" />;
  const openReversal = (order: Order) => { setReversalOrder(order); setReversalChoice('cancel_before_preparation'); setReversalReason(''); setReversalError(''); };
  const submitReversal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reversalOrder) return;
    const preparedWaste = reversalChoice !== 'cancel_before_preparation';
    if (preparedWaste && !reversalReason.trim()) { setReversalError('Explain the prepared-food loss or customer return.'); return; }
    try {
      await sqliteService.reverseOrder(reversalOrder.id, reversalChoice === 'customer_return' ? 'refunded' : 'cancelled', preparedWaste ? 'prepared_waste' : 'restore_stock', reversalReason, currentUser);
      setReversalOrder(null); setSelectedOrder(null); refresh();
    } catch (error) { setReversalError(error instanceof Error ? error.message : 'The order could not be reversed.'); }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full gap-4 p-4 overflow-hidden bg-[#FCFBF8]">
      <div className="p-4 rounded-2xl bg-[#FFFDFC] border border-[#E8E3DA] flex flex-wrap items-center justify-between gap-4 shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-[#18302D]">Orders</h2>
          <p className="mt-0.5 text-xs text-[#71807C]">All local dine-in, takeaway, delivery, cancelled, and refunded tickets for {branch.name}</p>
        </div>
        <button type="button" onClick={refresh} className="px-3 py-1.5 text-xs font-bold text-[#35514C] bg-white hover:bg-[#E8F3F0] hover:text-[#16665A] border border-[#D8E7E1] rounded-xl flex items-center gap-1.5 cursor-pointer"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
      </div>

      <div className="flex-1 min-h-0 p-1 overflow-y-auto space-y-4">
        <div className="bg-[#FFFDFC] border border-[#E8E3DA] rounded-2xl p-4 flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-52 text-[10px] font-bold text-slate-500 uppercase tracking-wide">Search invoice, guest, phone, table, rider, cashier
            <div className="relative mt-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="INV-..., customer name, phone" className="w-full rounded-xl border border-slate-300 py-2 pl-8 pr-3 text-xs text-slate-900" /></div>
          </label>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Order type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | OrderType)} className="block mt-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"><option value="all">All types</option><option value="dine_in">Dine-in</option><option value="takeaway">Takeaway</option><option value="delivery">Delivery</option></select></label>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | OrderStatus)} className="block mt-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"><option value="all">All statuses</option>{(['confirmed', 'preparing', 'cooking', 'ready', 'served', 'completed', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'] as OrderStatus[]).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">From<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} className="block mt-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900" /></label>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">To<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="block mt-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900" /></label>
        </div>

        <div className="text-xs text-slate-500"><strong className="text-slate-800">{filteredOrders.length}</strong> of {orders.length} stored tickets</div>
        <div className="bg-[#FFFDFC] border border-[#E8E3DA] rounded-2xl overflow-x-auto shadow-sm">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200"><tr><th className="px-5 py-3">Ticket</th><th className="px-4 py-3">Date & time</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Guest / Context</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((order) => <tr key={order.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-mono font-bold text-slate-900">{order.invoiceNumber}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(order.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3"><span className="inline-flex gap-1 items-center text-slate-700">{channelIcon(order.orderType)}{typeLabel[order.orderType]}</span></td>
                <td className="px-4 py-3 text-slate-700"><strong>{order.customerName || (order.orderType === 'dine_in' ? order.tableName || 'Walk-in table' : 'Walk-in')}</strong><span className="block text-[10px] text-slate-500">{order.orderType === 'delivery' ? `${order.deliveryChannel || 'Delivery'}${order.riderName ? ` · ${order.riderName}` : ''}` : order.cashierName}</span></td>
                <td className="px-4 py-3"><span className={`capitalize rounded-full px-2 py-0.5 text-[10px] font-bold ${['cancelled', 'refunded'].includes(order.status) ? 'bg-rose-100 text-rose-800' : order.status === 'delivered' || order.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>{statusLabel(order.status)}</span></td>
                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{money(order.grandTotal)}</td>
                <td className="px-5 py-3 text-right"><button type="button" onClick={() => setSelectedOrder(order)} className="mr-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-700 hover:bg-slate-100 cursor-pointer"><Eye className="h-3.5 w-3.5" />Details</button><button type="button" onClick={() => setReceiptOrder(order)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-amber-700 hover:bg-amber-50 cursor-pointer"><Printer className="h-3.5 w-3.5" />Receipt</button></td>
              </tr>)}
              {!filteredOrders.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">No stored orders match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4"><div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#E8E3DA] bg-[#FFFDFC] p-6 shadow-[0_24px_64px_-28px_rgba(24,48,45,0.55)]">
          <div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-slate-900">{selectedOrder.invoiceNumber}</h3><p className="text-xs text-slate-500">{new Date(selectedOrder.createdAt).toLocaleString()} · {typeLabel[selectedOrder.orderType]} · {statusLabel(selectedOrder.status)}</p></div><button type="button" onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button></div>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[#DCE8E3] bg-[#F2F5F3] p-3 text-xs text-[#516863]"><span>Cashier <strong className="block text-[#18302D]">{selectedOrder.cashierName}</strong></span><span>Guest <strong className="block text-[#18302D]">{selectedOrder.customerName || 'Walk-in'}</strong></span>{selectedOrder.tableName && <span>Table <strong className="block text-[#18302D]">{selectedOrder.tableName}</strong></span>}{selectedOrder.deliveryAddress && <span>Delivery <strong className="block text-[#18302D]">{selectedOrder.deliveryAddress}</strong></span>}</div>
          {selectedOrder.foodLossReason && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"><strong>Prepared-food loss:</strong> {money(selectedOrder.foodLossAmount || 0)} · {selectedOrder.foodLossReason}</div>}
          <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">{selectedOrder.items.map((item) => <div key={item.id} className="flex justify-between gap-4 py-2 text-xs"><span>{item.quantity} × {item.productName}{item.variationName ? ` · ${item.variationName}` : ''}{item.itemNotes ? <small className="block text-slate-500">{item.itemNotes}</small> : null}</span><strong className="font-mono">{money(item.totalPrice)}</strong></div>)}</div>
          <div className="mt-4 ml-auto max-w-56 space-y-1 text-right text-xs"><div className="flex justify-between gap-6"><span>Subtotal</span><span>{money(selectedOrder.subtotal)}</span></div><div className="flex justify-between gap-6"><span>Tax</span><span>{money(selectedOrder.taxAmount)}</span></div><div className="flex justify-between gap-6"><span>Discount</span><span>-{money(selectedOrder.orderDiscountAmount)}</span></div><div className="flex justify-between gap-6 border-t pt-2 font-bold text-sm"><span>Total</span><span>{money(selectedOrder.grandTotal)}</span></div></div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {canIssueRefunds && ['dine_in', 'takeaway'].includes(selectedOrder.orderType) && !['cancelled', 'refunded'].includes(selectedOrder.status) && <button type="button" onClick={() => openReversal(selectedOrder)} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white">Cancel / return / waste</button>}
            <button type="button" onClick={() => setReceiptOrder(selectedOrder)} className="rounded-xl bg-[#16665A] hover:bg-[#115448] px-4 py-2 text-xs font-bold text-white shadow-sm cursor-pointer">View / reprint receipt</button><button type="button" onClick={() => setSelectedOrder(null)} className="rounded-xl border border-[#B9D8D0] bg-white hover:bg-[#E8F3F0] px-4 py-2 text-xs font-bold text-[#35514C] cursor-pointer">Close</button>
          </div>
        </div></div>
      )}
      {reversalOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-slate-900">Resolve {reversalOrder.invoiceNumber}</h3><p className="mt-1 text-xs text-slate-500">Choose the outcome accurately. Payment reversal applies when payment was recorded.</p></div><button type="button" onClick={() => setReversalOrder(null)} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button></div>
            {reversalError && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{reversalError}</div>}
            <form onSubmit={submitReversal} className="mt-4 space-y-3 text-xs">
              <label className={`block cursor-pointer rounded-xl border p-3 ${reversalChoice === 'cancel_before_preparation' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}><input type="radio" checked={reversalChoice === 'cancel_before_preparation'} onChange={() => setReversalChoice('cancel_before_preparation')} className="mr-2" /><strong>Cancel before preparation</strong><span className="mt-1 block text-slate-600">Cancels the ticket and returns its deducted raw stock. Use only when food was not prepared.</span></label>
              <label className={`block cursor-pointer rounded-xl border p-3 ${reversalChoice === 'cancel_after_preparation' ? 'border-rose-500 bg-rose-50' : 'border-slate-200'}`}><input type="radio" checked={reversalChoice === 'cancel_after_preparation'} onChange={() => setReversalChoice('cancel_after_preparation')} className="mr-2" /><strong>Cancelled after preparation — record food waste</strong><span className="mt-1 block text-slate-600">Cancels the ticket but retains the consumed stock as a documented food loss.</span></label>
              <label className={`block cursor-pointer rounded-xl border p-3 ${reversalChoice === 'customer_return' ? 'border-rose-500 bg-rose-50' : 'border-slate-200'}`}><input type="radio" checked={reversalChoice === 'customer_return'} onChange={() => setReversalChoice('customer_return')} className="mr-2" /><strong>Customer return / refund — record food waste</strong><span className="mt-1 block text-slate-600">Refunds the ticket and records the prepared food as a loss; raw stock is not restored.</span></label>
              {reversalChoice !== 'cancel_before_preparation' && <label className="block font-medium text-slate-700">Loss reason *<textarea required value={reversalReason} maxLength={500} onChange={(event) => setReversalReason(event.target.value)} placeholder="e.g. customer changed mind after food was prepared" className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900" /></label>}
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setReversalOrder(null)} className="rounded-xl px-4 py-2 text-slate-600 hover:bg-slate-100">Close</button><button type="submit" className="rounded-xl bg-rose-600 px-4 py-2 font-bold text-white">Confirm outcome</button></div>
            </form>
          </div>
        </div>
      )}
      <ReceiptModal order={receiptOrder} branch={branch} currentUser={currentUser} isOpen={Boolean(receiptOrder)} onClose={() => setReceiptOrder(null)} />
    </div>
  );
};
