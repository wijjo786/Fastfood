import React, { useState, useEffect, useMemo } from 'react';
import {
  Order,
  KitchenStation,
  Branch,
  User,
  OrderItem,
  OrderStatus,
  OrderType,
  KdsColumn,
} from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { showUserError } from '../../utils/userFeedback';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChefHat,
  Printer,
  RotateCcw,
  Sparkles,
  Flame,
  Search,
  Check,
  ArrowRight,
  ArrowLeft,
  Filter,
  Plus,
  Settings2,
  Eye,
  EyeOff,
  Bell,
  BellOff,
  LayoutGrid,
  Columns,
  Layers,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  X,
  ChevronRight,
  TrendingUp,
  Volume2,
} from 'lucide-react';

interface KitchenDisplayProps {
  branch: Branch;
  currentUser: User;
}

// DEFAULT KANBAN BOARD STAGES (New Orders → Preparing → Cooking → Ready → Completed)
const DEFAULT_KDS_COLUMNS: KdsColumn[] = [
  {
    id: 'col-new',
    key: 'new',
    title: 'New Orders',
    statusMatch: ['confirmed', 'draft'],
    color: '#d97706',
    headerBg: 'bg-amber-500 text-slate-950',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
    badgeText: 'New Ticket',
    icon: '📥',
    enabled: true,
    order: 1,
  },
  {
    id: 'col-preparing',
    key: 'preparing',
    title: 'Preparing',
    statusMatch: ['preparing'],
    color: '#0284c7',
    headerBg: 'bg-sky-600 text-white',
    badgeBg: 'bg-sky-100 text-sky-900 border-sky-300',
    badgeText: 'Mise en Place',
    icon: '🥣',
    enabled: true,
    order: 2,
  },
  {
    id: 'col-cooking',
    key: 'cooking',
    title: 'Cooking',
    statusMatch: ['cooking'],
    color: '#ea580c',
    headerBg: 'bg-orange-600 text-white',
    badgeBg: 'bg-orange-100 text-orange-900 border-orange-300',
    badgeText: 'On Grill / Oven',
    icon: '🔥',
    enabled: true,
    order: 3,
  },
  {
    id: 'col-ready',
    key: 'ready',
    title: 'Ready',
    statusMatch: ['ready'],
    color: '#059669',
    headerBg: 'bg-emerald-600 text-white',
    badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    badgeText: 'Plated / Pickup',
    icon: '🛎️',
    enabled: true,
    order: 4,
  },
  {
    id: 'col-completed',
    key: 'completed',
    title: 'Completed',
    statusMatch: ['served', 'completed', 'delivered', 'out_for_delivery'],
    color: '#475569',
    headerBg: 'bg-slate-800 text-white',
    badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
    badgeText: 'Served / Done',
    icon: '✅',
    enabled: true,
    order: 5,
  },
];

const LOCAL_STORAGE_KDS_COLS = 'restoflow_kds_board_columns_v2';
const LOCAL_STORAGE_AUDIO_ENABLED = 'restoflow_kds_audio_enabled';

export const KitchenDisplay: React.FC<KitchenDisplayProps> = ({ branch, currentUser }) => {
  const { styles, isDark } = useAppTheme();
  const canIssueRefunds = sqliteService.getUserPermissions(currentUser).canIssueRefunds;
  const [selectedStation, setSelectedStation] = useState<KitchenStation>('all');
  const [selectedOrderType, setSelectedOrderType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'board' | 'grid'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_AUDIO_ENABLED) !== 'false';
    } catch {
      return true;
    }
  });

  // Dynamic KDS Columns ("or it can be added from system")
  const [boardColumns, setBoardColumns] = useState<KdsColumn[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KDS_COLS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 3) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_KDS_COLUMNS;
  });

  // Configure Board Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [newColIcon, setNewColIcon] = useState('🍳');
  const [newColColor, setNewColColor] = useState('#7c3aed');
  const [newColStatusMatch, setNewColStatusMatch] = useState<OrderStatus>('preparing');

  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const refreshOrders = () => {
    const list = sqliteService.getOrders(branch.id);
    setAllOrders(list);
  };

  useEffect(() => {
    refreshOrders();
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
      refreshOrders();
    }, 3000);
    return () => clearInterval(timer);
  }, [branch.id]);

  // Save columns to local storage
  const saveBoardColumns = (columns: KdsColumn[]) => {
    setBoardColumns(columns);
    try {
      localStorage.setItem(LOCAL_STORAGE_KDS_COLS, JSON.stringify(columns));
    } catch {
      // Ignore
    }
  };

  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    try {
      localStorage.setItem(LOCAL_STORAGE_AUDIO_ENABLED, String(nextVal));
    } catch {
      // Ignore
    }
  };

  const getElapsedMinutes = (createdAt: string) => {
    const diffMs = currentTime - new Date(createdAt).getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  const filterItemsForStation = (items: OrderItem[]) => {
    if (selectedStation === 'all') return items;
    return items.filter((i) => i.kitchenStation === selectedStation);
  };

  // Status mapping and stage advance: New Orders → Preparing → Cooking → Ready → Completed
  const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
    switch (currentStatus) {
      case 'confirmed':
      case 'draft':
        return 'preparing';
      case 'preparing':
        return 'cooking';
      case 'cooking':
        return 'ready';
      case 'ready':
        return 'completed';
      default:
        return null;
    }
  };

  const getPreviousStatus = (currentStatus: OrderStatus): OrderStatus | null => {
    switch (currentStatus) {
      case 'completed':
      case 'served':
      case 'delivered':
        return null;
      case 'ready':
        return 'cooking';
      case 'cooking':
        return 'preparing';
      case 'preparing':
        return 'confirmed';
      default:
        return null;
    }
  };

  const handleAdvanceOrderStatus = async (order: Order) => {
    const next = getNextStatus(order.status);
    if (!next) return;
    try { setLifecycleError(null); await sqliteService.updateOrderStatus(order.id, next, currentUser); refreshOrders(); }
    catch (error) { setLifecycleError(error instanceof Error ? error.message : 'Order stage could not be updated.'); }
  };

  const handleRevertOrderStatus = async (order: Order) => {
    const prev = getPreviousStatus(order.status);
    if (!prev) return;
    try { setLifecycleError(null); await sqliteService.updateOrderStatus(order.id, prev, currentUser); refreshOrders(); }
    catch (error) { setLifecycleError(error instanceof Error ? error.message : 'Order stage could not be updated.'); }
  };

  const handleMoveOrderToStatus = async (order: Order, targetStatus: OrderStatus) => {
    try { setLifecycleError(null); await sqliteService.updateOrderStatus(order.id, targetStatus, currentUser); refreshOrders(); }
    catch (error) { setLifecycleError(error instanceof Error ? error.message : 'Order stage could not be updated.'); }
  };

  const handleRefundOrder = async (order: Order) => {
    if (!window.confirm(`Refund ${order.invoiceNumber}? This will reverse recorded stock and payment movements once.`)) return;
    try {
      await sqliteService.updateOrderStatus(order.id, 'refunded', currentUser);
      refreshOrders();
    } catch (error) {
      showUserError(error, 'The refund could not be recorded. Please review the order and try again.');
    }
  };

  const handleToggleItemDone = async (order: Order, item: OrderItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setLifecycleError(null);
      await sqliteService.updateKitchenItemStatus(order.id, item.id, item.kitchenStatus === 'ready' ? 'pending' : 'ready', currentUser);
      refreshOrders();
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : 'Kitchen item could not be updated.');
    }
  };

  // Add Custom Column / Stage
  const handleAddCustomColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColTitle.trim()) return;

    const newColumn: KdsColumn = {
      id: `col-custom-${Date.now()}`,
      key: newColTitle.toLowerCase().replace(/\s+/g, '_'),
      title: newColTitle.trim(),
      statusMatch: [newColStatusMatch],
      color: newColColor,
      headerBg: 'bg-indigo-600 text-white',
      badgeBg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      badgeText: newColTitle.trim(),
      icon: newColIcon || '🍳',
      enabled: true,
      order: boardColumns.length + 1,
      isCustom: true,
    };

    const updated = [...boardColumns, newColumn];
    saveBoardColumns(updated);
    setIsAddColumnModalOpen(false);
    setNewColTitle('');
  };

  const handleToggleColumnEnabled = (colId: string) => {
    const updated = boardColumns.map((col) =>
      col.id === colId ? { ...col, enabled: !col.enabled } : col
    );
    saveBoardColumns(updated);
  };

  const handleResetDefaultColumns = () => {
    saveBoardColumns(DEFAULT_KDS_COLUMNS);
    setIsConfigModalOpen(false);
  };

  // Filter and match orders
  const filteredOrders = useMemo(() => {
    return allOrders.filter((order) => {
      // Station filter
      if (selectedStation !== 'all') {
        const hasStationItem = order.items.some((i) => i.kitchenStation === selectedStation);
        if (!hasStationItem) return false;
      }

      // Order type filter
      if (selectedOrderType !== 'all') {
        if (order.orderType !== selectedOrderType) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchInvoice = order.invoiceNumber.toLowerCase().includes(q);
        const matchCust = order.customerName && order.customerName.toLowerCase().includes(q);
        const matchTable = order.tableName && order.tableName.toLowerCase().includes(q);
        const matchItem = order.items.some((i) => i.productName.toLowerCase().includes(q));
        if (!matchInvoice && !matchCust && !matchTable && !matchItem) return false;
      }

      return true;
    });
  }, [allOrders, selectedStation, selectedOrderType, searchQuery]);

  // Statistics
  const newCount = allOrders.filter((o) => ['confirmed', 'draft'].includes(o.status)).length;
  const preparingCount = allOrders.filter((o) => o.status === 'preparing').length;
  const cookingCount = allOrders.filter((o) => o.status === 'cooking').length;
  const readyCount = allOrders.filter((o) => o.status === 'ready').length;
  const completedTodayCount = allOrders.filter((o) => ['completed', 'served', 'delivered'].includes(o.status)).length;

  const activeOrdersTotal = newCount + preparingCount + cookingCount + readyCount;

  // Active columns to display
  const activeColumns = boardColumns.filter((c) => c.enabled);

  // Render individual Order Ticket Card
  const renderTicketCard = (order: Order, column: KdsColumn) => {
    const elapsedMins = getElapsedMinutes(order.createdAt);
    const stationItems = filterItemsForStation(order.items);
    const isUrgent = elapsedMins >= 10;
    const isWarning = elapsedMins >= 5 && elapsedMins < 10;
    const isCompleted = ['completed', 'served', 'delivered'].includes(order.status);

    const nextStatus = getNextStatus(order.status);
    const prevStatus = getPreviousStatus(order.status);

    return (
      <div
        key={order.id}
        className={`${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} rounded-3xl border-2 transition-all shadow-sm hover:shadow-xl flex flex-col justify-between overflow-hidden text-xs select-none ${
          isUrgent && !isCompleted
            ? 'border-rose-500 ring-2 ring-rose-400/30'
            : isWarning && !isCompleted
            ? 'border-amber-400'
            : isCompleted
            ? `${isDark ? 'border-slate-800 opacity-60' : 'border-slate-300 opacity-80'}`
            : `${isDark ? 'hover:border-slate-700' : 'hover:border-slate-400'}`
        }`}
      >
        {/* Card Header: Ticket Meta, Time, & Elapsed Alert */}
        <div className={`p-3.5 ${isDark ? 'bg-slate-950/70 border-b border-slate-800' : 'bg-slate-50 border-b border-slate-200'}`}>
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`font-mono font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'} tracking-tight num-tabular`}>
                #{order.invoiceNumber.split('-').pop() || order.invoiceNumber}
              </span>

              {/* Order Type Badge */}
              {order.orderType === 'dine_in' ? (
                <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center gap-1 truncate">
                  <UtensilsCrossed className="w-2.5 h-2.5" />
                  <span>{order.tableName || 'Dine-In'}</span>
                </span>
              ) : order.orderType === 'delivery' ? (
                <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1 truncate">
                  <Bike className="w-2.5 h-2.5" />
                  <span>{order.deliveryChannel?.replace('_', ' ').toUpperCase() || 'Delivery'}</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1 truncate">
                  <ShoppingBag className="w-2.5 h-2.5" />
                  <span>Takeaway</span>
                </span>
              )}
            </div>

            {/* Elapsed Timer Pill */}
            <div
              className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold flex items-center gap-1 shrink-0 num-tabular ${
                isCompleted
                  ? `${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-700'}`
                  : isUrgent
                  ? 'bg-rose-500 text-white animate-pulse'
                  : isWarning
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              <Clock className="w-2.5 h-2.5" />
              <span>{elapsedMins}m</span>
            </div>
          </div>

          {/* Customer / Cashier Subtext */}
          <div className={`flex items-center justify-between text-[11px] mt-1.5 pt-1 border-t ${styles.borderSubtle}`}>
            <span className={`truncate font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {order.customerName || (order.orderType === 'dine_in' ? 'Table Guest' : 'Customer')}
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {order.orderNotes && (
            <div className="mt-1.5 px-2 py-1 rounded-lg bg-amber-100/80 border border-amber-200 text-[10px] font-semibold text-amber-900">
              Dispatch note: {order.orderNotes}
            </div>
          )}
        </div>

        {/* Card Body: Dish Line Items & Check-Offs */}
        <div className="p-3.5 space-y-2 flex-1">
          {stationItems.map((item) => {
            const isChecked = item.kitchenStatus === 'ready';
            return (
              <div
                key={item.id}
                onClick={(e) => void handleToggleItemDone(order, item, e)}
                className={`p-2.5 rounded-2xl border transition cursor-pointer flex items-start gap-2.5 ${
                  isChecked
                    ? `${isDark ? 'bg-emerald-950/20 border-emerald-800/40 opacity-40' : 'bg-emerald-50/80 border-emerald-300 opacity-60'}`
                    : `${isDark ? 'bg-slate-950/40 border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`
                }`}
              >
                {/* Checkbox button */}
                <div
                  className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition ${
                    isChecked
                      ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                      : `${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'}`
                  }`}
                >
                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1">
                    <span
                      className={`font-bold text-xs truncate ${
                        isChecked ? 'line-through text-slate-500' : isDark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      <strong className="text-amber-500 font-mono text-sm mr-1.5 font-black">
                        {item.quantity}x
                      </strong>
                      {item.productName}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 uppercase shrink-0">
                      [{item.kitchenStation}]
                    </span>
                  </div>

                  {item.variationName && (
                    <div className="text-[10px] text-slate-500 font-medium">
                      Size: {item.variationName}
                    </div>
                  )}

                  {item.selectedModifiers.length > 0 && (
                    <div className="text-[10px] text-slate-500 space-y-0.5 mt-0.5">
                      {item.selectedModifiers.map((m, mIdx) => (
                        <div key={mIdx}>+ {m.name}</div>
                      ))}
                    </div>
                  )}

                  {item.itemNotes && (
                    <div className="text-[10px] text-amber-800 font-semibold bg-amber-100/80 px-1.5 py-0.5 rounded mt-1 border border-amber-200">
                      Note: {item.itemNotes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Card Footer: Fast Stage Transition Buttons */}
        <div className={`p-2.5 ${isDark ? 'bg-slate-950/80 border-t border-slate-800' : 'bg-slate-50/90 border-t border-slate-200'} flex items-center justify-between gap-1.5`}>
          {/* Revert / Previous Stage button */}
          {prevStatus ? (
            <button
              type="button"
              onClick={() => handleRevertOrderStatus(order)}
              className={`p-1.5 ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'} rounded-lg transition cursor-pointer`}
              title={`Move back to ${prevStatus}`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* Direct Stage Advance Button */}
          {nextStatus ? (
            <button
              type="button"
              onClick={() => handleAdvanceOrderStatus(order)}
              className={`flex-1 py-1.5 px-3 rounded-xl font-bold text-xs shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                nextStatus === 'preparing'
                  ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-900/20 shadow-md'
                  : nextStatus === 'cooking'
                  ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-900/20 shadow-md'
                  : nextStatus === 'ready'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20 shadow-md'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-amber-900/20 shadow-md'
              }`}
            >
              <span>Advance: {nextStatus.toUpperCase()}</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          ) : (
            <div className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Order Completed</span>
            </div>
          )}

          {canIssueRefunds && order.amountPaid > 0 && !['cancelled', 'refunded'].includes(order.status) && (
            <button
              type="button"
              onClick={() => handleRefundOrder(order)}
              className="px-2 py-1.5 rounded-lg text-[10px] font-black text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer"
              title="Reverse payment and stock"
            >
              Refund
            </button>
          )}

          {/* Quick jump to specific column dropdown */}
          <div className="relative group">
            <select
              value={order.status}
              onChange={(e) => handleMoveOrderToStatus(order, e.target.value as OrderStatus)}
              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
              title="Jump to status"
            >
              <option value="confirmed">New Orders</option>
              <option value="preparing">Preparing</option>
              <option value="cooking">Cooking</option>
              <option value="ready">Ready</option>
              <option value="completed">Completed</option>
            </select>
            <button
              type="button"
              className={`p-1.5 ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'} rounded-lg transition`}
              title="Jump stage"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 gap-4 p-4 ${styles.bgApp} overflow-hidden`}>
      {lifecycleError && <div role="alert" className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex justify-between gap-3"><span>{lifecycleError}</span><button type="button" onClick={() => setLifecycleError(null)} className="font-bold">Dismiss</button></div>}
      {/* KDS TOP CONTROL HEADER */}
      <div className={`p-4 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-3 shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        {/* Left: Brand, Active Counter & Statistics */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#E8F3F0] border border-[#B9D8D0] text-[#16665A]">
            <ChefHat className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'} tracking-tight`}>Kitchen Display Board</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#16665A] text-white shadow-sm num-tabular">
                {activeOrdersTotal} Active Tickets
              </span>
            </div>
            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              New Orders → Preparing → Cooking → Ready → Completed
            </p>
          </div>
        </div>

        {/* Middle Stats Chips */}
        <div className="hidden xl:flex items-center gap-2 text-xs">
          <div className={`px-3 py-1 ${isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-900'} border rounded-xl font-bold flex items-center gap-1.5`}>
            <span>📥 New:</span>
            <span className="font-mono text-sm num-tabular">{newCount}</span>
          </div>
          <div className={`px-3 py-1 ${isDark ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' : 'bg-sky-50 border-sky-200 text-sky-900'} border rounded-xl font-bold flex items-center gap-1.5`}>
            <span>🥣 Prep:</span>
            <span className="font-mono text-sm num-tabular">{preparingCount}</span>
          </div>
          <div className={`px-3 py-1 ${isDark ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-orange-50 border-orange-200 text-orange-900'} border rounded-xl font-bold flex items-center gap-1.5`}>
            <span>🔥 Cook:</span>
            <span className="font-mono text-sm num-tabular">{cookingCount}</span>
          </div>
          <div className={`px-3 py-1 ${isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-900'} border rounded-xl font-bold flex items-center gap-1.5`}>
            <span>🛎️ Ready:</span>
            <span className="font-mono text-sm num-tabular">{readyCount}</span>
          </div>
          <div className={`px-3 py-1 ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'} border rounded-xl font-bold flex items-center gap-1.5`}>
            <span>✅ Completed:</span>
            <span className="font-mono text-sm num-tabular">{completedTodayCount}</span>
          </div>
        </div>

        {/* Right Action Tools: Search, Sound, View Mode & Board Config */}
        <div className="flex items-center gap-2">
          {/* Quick Search */}
          <div className="relative w-44">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter ticket, table..."
              className={`w-full pl-8 pr-2.5 py-1.5 text-xs ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-800 placeholder-slate-400'} border rounded-xl focus:outline-none focus:border-amber-500`}
            />
          </div>

          {/* Sound Alert Toggle */}
          <button
            type="button"
            onClick={handleToggleSound}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              soundEnabled
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                : `${isDark ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-400'}`
            }`}
            title={soundEnabled ? 'Kitchen Bell Alert Enabled' : 'Kitchen Bell Muted'}
          >
            {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>

          {/* View Mode Toggle: Board (Kanban) vs Grid */}
          <div className={`flex items-center ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-300'} p-0.5 rounded-xl border`}>
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'board'
                  ? 'bg-[#16665A] text-white shadow-sm font-bold'
                  : `${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`
              }`}
              title="Kanban Board View (Workflow Columns)"
            >
              <Columns className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[#16665A] text-white shadow-sm font-bold'
                  : `${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`
              }`}
              title="Compact Expediter Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Board Columns Configuration Button */}
          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className={`px-3 py-1.5 ${isDark ? 'bg-slate-850 hover:bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'} font-bold text-xs rounded-xl border transition flex items-center gap-1.5 cursor-pointer`}
            title="Configure Board Columns and Custom Stages"
          >
            <Settings2 className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">Board Stages</span>
          </button>
        </div>
      </div>

      {/* SUB-BAR: STATIONS & ORDER TYPES FILTER */}
      <div className={`px-4 py-3 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-3 text-xs`}>
        {/* Kitchen Station Filters */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <span className={`font-semibold mr-1 flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <Filter className="w-3.5 h-3.5 text-amber-500" /> Station:
          </span>
          {(['all', 'grill', 'pizza', 'drinks', 'packing'] as KitchenStation[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setSelectedStation(st)}
              className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                selectedStation === st
                  ? 'bg-[#16665A] text-white font-black shadow-sm'
                  : `${isDark ? 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}`
              }`}
            >
              {st === 'all' ? 'All Stations' : st.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Order Channel Filters (Dine-in, Takeaway, Delivery) */}
        <div className="flex items-center gap-1">
          <span className={`font-semibold mr-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Channel:</span>
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'dine_in', label: 'Dine-In' },
            { id: 'takeaway', label: 'Takeaway' },
            { id: 'delivery', label: 'Delivery' },
          ].map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setSelectedOrderType(type.id)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                selectedOrderType === type.id
                  ? 'bg-[#16665A] text-white font-black shadow-sm'
                  : `${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-850' : 'text-slate-600 hover:bg-slate-200'}`
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN KDS WORKSPACE: KANBAN BOARD VIEW OR COMPACT GRID */}
      <div className="flex-1 min-h-0 overflow-hidden p-1">
        {viewMode === 'board' ? (
          /* HORIZONTAL KANBAN BOARD VIEW */
          <div className="h-full flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            {activeColumns.map((col) => {
              // Match orders belonging to this column
              const colOrders = filteredOrders.filter((order) =>
                col.statusMatch.includes(order.status)
              );

              return (
                <div
                  key={col.id}
                  className={`w-80 sm:w-88 shrink-0 flex flex-col h-full ${
                    isDark ? 'bg-slate-900/60 border-slate-800/80 shadow-slate-950/40' : 'bg-slate-100/80 border-slate-200/80'
                  } border rounded-2xl overflow-hidden shadow-md backdrop-blur-sm`}
                >
                  {/* Column Header */}
                  <div
                    className={`px-4 py-3 flex items-center justify-between border-b border-black/10 ${col.headerBg}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{col.icon}</span>
                      <h3 className="font-black text-sm tracking-tight truncate">{col.title}</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full font-mono font-black text-xs bg-black/25 text-white shadow-xs num-tabular">
                        {colOrders.length}
                      </span>
                    </div>
                  </div>

                  {/* Orders Scrollable Lane */}
                  <div className="flex-1 p-3 overflow-y-auto space-y-3">
                    {colOrders.length === 0 ? (
                      <div className={`h-48 flex flex-col items-center justify-center text-center p-4 border-2 border-dashed ${
                        isDark ? 'border-slate-800 bg-slate-950/20 text-slate-500' : 'border-slate-300 bg-white/40 text-slate-400'
                      } rounded-2xl`}>
                        <span className="text-2xl mb-1.5 opacity-40">{col.icon}</span>
                        <span className={`font-bold text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>No {col.title}</span>
                        <span className="text-[10px] text-slate-500 mt-0.5">Tickets will appear here automatically</span>
                      </div>
                    ) : (
                      colOrders.map((order) => renderTicketCard(order, col))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* COMPACT EXPEDITER GRID VIEW */
          <div className="h-full overflow-y-auto">
            {filteredOrders.length === 0 ? (
              <div className="py-20 text-center text-slate-400">
                <ChefHat className="w-16 h-16 stroke-1 mx-auto mb-2 text-slate-300" />
                <h3 className="font-bold text-base text-slate-700">No Orders in Kitchen</h3>
                <p className="text-xs text-slate-400 mt-1">
                  All orders for this station and filter have been cleared.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredOrders.map((order) => {
                  const matchedCol =
                    boardColumns.find((c) => c.statusMatch.includes(order.status)) || boardColumns[0];
                  return renderTicketCard(order, matchedCol);
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONFIGURE BOARD STAGES MODAL */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className={`${styles.bgElevated} rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border ${styles.borderStrong} animate-in zoom-in-95 duration-150`}>
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500 text-slate-950">
                  <Settings2 className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Configure Kitchen Board Stages</h3>
                  <span className="text-[10px] text-slate-400">Reorder, enable, or create custom stages</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              <div>
                <p className={`mb-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Customize the stages and visibility of your kitchen workflow board. You can reorder, toggle stages on/off, or add custom cooking stations.
                </p>

                <div className="space-y-2">
                  {boardColumns.map((col) => (
                    <div
                      key={col.id}
                      className={`p-3 ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'} border rounded-2xl flex items-center justify-between gap-3`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{col.icon}</span>
                        <div>
                          <div className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'} flex items-center gap-2`}>
                            <span>{col.title}</span>
                            {col.isCustom && (
                              <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                                Custom Stage
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Status: {col.statusMatch.join(', ')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleColumnEnabled(col.id)}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                            col.enabled
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : `${isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-200 text-slate-500'}`
                          }`}
                        >
                          {col.enabled ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Hidden</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`pt-3 border-t ${styles.borderSubtle} flex items-center justify-between`}>
                <button
                  type="button"
                  onClick={handleResetDefaultColumns}
                  className={`text-xs ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'} font-bold flex items-center gap-1 cursor-pointer`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Defaults</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsAddColumnModalOpen(true)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Custom Stage</span>
                </button>
              </div>
            </div>

            <div className={`p-4 ${styles.bgSubtle} border-t ${styles.borderDefault} flex justify-end`}>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer border border-slate-700 transition"
              >
                Apply Board Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CUSTOM STAGE MODAL */}
      {isAddColumnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className={`${styles.bgElevated} rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border ${styles.borderStrong} animate-in zoom-in-95 duration-150`}>
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-sm text-white">Add Custom Kitchen Stage</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddColumnModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomColumn} className="p-6 space-y-4 text-xs">
              <div>
                <label className={`block font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Stage Title *</label>
                <input
                  type="text"
                  value={newColTitle}
                  onChange={(e) => setNewColTitle(e.target.value)}
                  placeholder="e.g. Baking, Packaging, QC Expediter"
                  required
                  autoFocus
                  className={`w-full px-3 py-2 ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded-xl font-bold text-xs focus:outline-none focus:border-amber-500`}
                />
              </div>

              <div>
                <label className={`block font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Select Stage Icon</label>
                <div className="flex items-center gap-2">
                  {['🍳', '🥖', '🥗', '📦', '🥡', '🍕', '☕', '🍗'].map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setNewColIcon(icon)}
                      className={`text-lg p-1.5 rounded-xl border transition cursor-pointer ${
                        newColIcon === icon
                          ? 'bg-amber-500/20 border-amber-400 scale-110 shadow-2xs'
                          : `${isDark ? 'bg-slate-900 border-slate-800 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={`block font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Map to Order Status *</label>
                <select
                  value={newColStatusMatch}
                  onChange={(e) => setNewColStatusMatch(e.target.value as OrderStatus)}
                  className={`w-full px-3 py-2 ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded-xl font-bold`}
                >
                  <option value="confirmed">New Orders (Confirmed)</option>
                  <option value="preparing">Preparing (Mise en place)</option>
                  <option value="cooking">Cooking (Active Heat)</option>
                  <option value="ready">Ready (Plated)</option>
                  <option value="completed">Completed / Served</option>
                </select>
              </div>

              <div className={`pt-3 border-t ${styles.borderSubtle} flex justify-end gap-2`}>
                <button
                  type="button"
                  onClick={() => setIsAddColumnModalOpen(false)}
                  className={`px-4 py-2 border ${styles.borderDefault} rounded-xl ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'} font-semibold cursor-pointer`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Add Stage to Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
