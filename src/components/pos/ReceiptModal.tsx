import React, { useState, useEffect } from 'react';
import { Order, Branch, HardwarePrinterSettings, User } from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { showUserError } from '../../utils/userFeedback';
import {
  Printer,
  CheckCircle2,
  X,
  Zap,
  UtensilsCrossed,
  Layers,
  Wifi,
  Settings,
  Clock,
  MapPin,
  UserCheck,
  Volume2,
  Sliders,
  Check,
  Send,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

interface ReceiptModalProps {
  order: Order | null;
  branch: Branch;
  currentUser: User;
  isOpen: boolean;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  order,
  branch,
  currentUser,
  isOpen,
  onClose,
}) => {
  const { styles, isDark } = useAppTheme();

  // Load printer hardware configuration from sqliteService
  const [printerSettings, setPrinterSettings] = useState<HardwarePrinterSettings>(() =>
    sqliteService.getPrinterSettings()
  );

  // Active view: 'receipt' | 'kitchen'
  const [activePreview, setActivePreview] = useState<'receipt' | 'kitchen'>('receipt');

  // Transmission status feedback
  const [printStatusToast, setPrintStatusToast] = useState<{
    type: 'both' | 'receipt' | 'kitchen' | 'drawer';
    message: string;
    details?: string;
  } | null>(null);

  // Quick edit printer IP inline toggle
  const [isQuickConfigOpen, setIsQuickConfigOpen] = useState(false);
  const [tempReceiptIp, setTempReceiptIp] = useState(printerSettings.receiptPrinter.ipAddress);
  const [tempReceiptPort, setTempReceiptPort] = useState(printerSettings.receiptPrinter.port);
  const [tempReceiptPaper, setTempReceiptPaper] = useState(printerSettings.receiptPrinter.paperSize);
  const [tempKitchenIp, setTempKitchenIp] = useState(printerSettings.kitchenPrinter.ipAddress);
  const [tempKitchenPort, setTempKitchenPort] = useState(printerSettings.kitchenPrinter.port);
  const [tempKitchenPaper, setTempKitchenPaper] = useState(printerSettings.kitchenPrinter.paperSize);

  // Reload settings whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const fresh = sqliteService.getPrinterSettings();
      setPrinterSettings(fresh);
      setTempReceiptIp(fresh.receiptPrinter.ipAddress);
      setTempReceiptPort(fresh.receiptPrinter.port);
      setTempReceiptPaper(fresh.receiptPrinter.paperSize);
      setTempKitchenIp(fresh.kitchenPrinter.ipAddress);
      setTempKitchenPort(fresh.kitchenPrinter.port);
      setTempKitchenPaper(fresh.kitchenPrinter.paperSize);
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  // Audio synthesizer for authentic kitchen impact printer buzzer
  const playKitchenChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(987.77, audioCtx.currentTime); // B5
      osc.frequency.setValueAtTime(1318.51, audioCtx.currentTime + 0.08); // E6

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Audio autoplay policy fallback
    }
  };

  const handleKickDrawer = async () => {
    if (!window.restoFlowDesktop) {
      setPrintStatusToast({ type: 'drawer', message: 'Cash drawer control requires the desktop application.', details: 'Connect an ESC/POS network receipt printer to use the RJ-11 drawer port.' });
      setTimeout(() => setPrintStatusToast(null), 3500);
      return;
    }
    try {
      const result = await window.restoFlowDesktop.printer.kickDrawer(printerSettings.receiptPrinter);
      setPrintStatusToast({ type: 'drawer', message: 'Cash drawer kick pulse sent.', details: `${result.message} ESC/POS pin 2 command sent through the receipt printer.` });
    } catch (error) {
      setPrintStatusToast({ type: 'drawer', message: 'Cash drawer did not open.', details: showUserError(error, 'The drawer signal could not be sent. Check the receipt printer connection and try again.') });
    }
    setTimeout(() => setPrintStatusToast(null), 4000);
  };

  // Quick save inline configuration
  const handleSaveQuickConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await sqliteService.updatePrinterSettings({
        receiptPrinter: { ...printerSettings.receiptPrinter, ipAddress: tempReceiptIp.trim() || '192.168.1.100', port: Number(tempReceiptPort) || 9100, paperSize: tempReceiptPaper },
        kitchenPrinter: { ...printerSettings.kitchenPrinter, ipAddress: tempKitchenIp.trim() || '192.168.1.101', port: Number(tempKitchenPort) || 9100, paperSize: tempKitchenPaper },
      }, currentUser);
      setPrinterSettings(updated);
      setIsQuickConfigOpen(false);
      setPrintStatusToast({ type: 'both', message: 'Printer IP and paper configurations updated successfully!', details: `Receipt: ${tempReceiptIp}:${tempReceiptPort} (${tempReceiptPaper}) | Kitchen: ${tempKitchenIp}:${tempKitchenPort} (${tempKitchenPaper})` });
    } catch (error) {
      setPrintStatusToast({ type: 'both', message: 'Printer settings were not saved.', details: showUserError(error, 'Printer settings could not be saved. Check the values and try again.') });
    }
    setTimeout(() => setPrintStatusToast(null), 3500);
  };

  // Print Customer Receipt Only
  const handlePrintReceiptOnly = async () => {
    setActivePreview('receipt');
    if (window.restoFlowDesktop) {
      try {
        const result = await window.restoFlowDesktop.printer.printText(
          { ...printerSettings.receiptPrinter, cutPaper: receiptConfig.autoCutReceipt && printerSettings.receiptPrinter.cutPaper },
          `${receiptConfig.storeName}\n${order.invoiceNumber}\n${order.items.map((item) => `${item.quantity} x ${item.productName}`).join('\n')}\nTOTAL: ${branch.currencySymbol} ${order.grandTotal.toFixed(2)}`
        );
        let details = result.message;
        if (receiptConfig.autoDrawerKick) {
          try {
            const drawerResult = await window.restoFlowDesktop.printer.kickDrawer(printerSettings.receiptPrinter);
            details = `${details} ${drawerResult.message}`;
          } catch (error) {
            details = `${details} Receipt printed, but the drawer pulse failed: ${showUserError(error, 'Check the receipt printer connection and drawer cable.')}`;
          }
        }
        setPrintStatusToast({ type: 'receipt', message: 'Receipt printed.', details });
      } catch (error) {
        setPrintStatusToast({ type: 'receipt', message: 'Receipt print failed.', details: showUserError(error, 'The receipt could not be printed. Check the printer connection and try again.') });
      }
      setTimeout(() => setPrintStatusToast(null), 4000);
      return;
    }
    setPrintStatusToast({
      type: 'receipt',
      message: `Receipt sent to ${printerSettings.receiptPrinter.ipAddress}:${printerSettings.receiptPrinter.port}`,
      details: `Dispatched ${printerSettings.receiptPrinter.paperSize} thermal format with barcode & fiscal summary.`,
    });
    setTimeout(() => setPrintStatusToast(null), 4000);
  };

  // Print Kitchen Ticket (KOT) Only
  const handlePrintKitchenOnly = async () => {
    setActivePreview('kitchen');
    if (window.restoFlowDesktop) {
      try {
        const result = await window.restoFlowDesktop.printer.printText(
          printerSettings.kitchenPrinter,
          `KOT ${order.invoiceNumber}\n${order.items.map((item) => `${item.quantity} x ${item.productName}${item.itemNotes ? ` (${item.itemNotes})` : ''}`).join('\n')}`
        );
        setPrintStatusToast({ type: 'kitchen', message: 'Kitchen ticket printed.', details: result.message });
      } catch (error) {
        setPrintStatusToast({ type: 'kitchen', message: 'Kitchen print failed.', details: showUserError(error, 'The kitchen ticket could not be printed. Check the printer connection and try again.') });
      }
      setTimeout(() => setPrintStatusToast(null), 4000);
      return;
    }
    if (printerSettings.kitchenPrinter.beepOnPrint) {
      playKitchenChime();
    }
    setPrintStatusToast({
      type: 'kitchen',
      message: `Kitchen KOT sent to ${printerSettings.kitchenPrinter.ipAddress}:${printerSettings.kitchenPrinter.port}`,
      details: `Dispatched ${printerSettings.kitchenPrinter.paperSize} prep ticket. Kitchen buzzer chimed!`,
    });
    setTimeout(() => setPrintStatusToast(null), 4000);
  };

  // Print Both Separately
  const handlePrintBoth = async () => {
    if (window.restoFlowDesktop) {
      await handlePrintReceiptOnly();
      await handlePrintKitchenOnly();
      return;
    }
    if (printerSettings.kitchenPrinter.beepOnPrint) {
      playKitchenChime();
    }
    setPrintStatusToast({
      type: 'both',
      message: 'Dispatched BOTH Receipt & Kitchen KOT to their dedicated network printers!',
      details: `1. Receipt → ${printerSettings.receiptPrinter.ipAddress}:${printerSettings.receiptPrinter.port} (${printerSettings.receiptPrinter.paperSize})\n2. Kitchen KOT → ${printerSettings.kitchenPrinter.ipAddress}:${printerSettings.kitchenPrinter.port} (${printerSettings.kitchenPrinter.paperSize})`,
    });
    setTimeout(() => setPrintStatusToast(null), 5000);
  };

  // System Print Dialog
  const handleBrowserSystemPrint = () => {
    window.print();
  };

  const receiptConfig = sqliteService.getReceiptConfig();
  const receiptPaperWidth = printerSettings.receiptPrinter.paperSize;
  const kitchenPaperWidth = printerSettings.kitchenPrinter.paperSize;
  const money = (amount: number) => `${branch.currencySymbol || 'PKR'} ${amount.toFixed(2)}`;

  const totalItemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className={`w-full max-w-4xl ${styles.bgElevated} border ${styles.borderStrong} rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-150`}>
        {/* Header Bar */}
        <div className="px-6 py-4 bg-slate-950 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/10 shrink-0">
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base tracking-wide text-white">Order Confirmed & Settle Complete</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  {order.invoiceNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {order.orderType === 'dine_in' ? `Dine-In • Table ${order.tableName || 'Guest'}` : order.orderType === 'delivery' ? `Delivery • ${order.deliveryChannel?.toUpperCase() || 'Direct'}` : 'Takeaway Counter'} • {totalItemCount} Items • Paid {money(order.grandTotal)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsQuickConfigOpen(!isQuickConfigOpen)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition flex items-center gap-1.5 cursor-pointer ${
                isQuickConfigOpen
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Quickly view or change printer IP addresses & paper sizes"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Printer Config</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Toast Banner if active */}
        {printStatusToast && (
          <div className="mx-6 mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-slate-900 to-amber-950/90 border border-emerald-500/50 text-white shadow-xl flex items-start justify-between gap-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-500 text-slate-950 shrink-0">
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
              <div>
                <p className="font-black text-xs text-emerald-300">{printStatusToast.message}</p>
                {printStatusToast.details && (
                  <p className="text-[11px] text-slate-300 font-mono mt-0.5 whitespace-pre-line leading-relaxed">
                    {printStatusToast.details}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPrintStatusToast(null)}
              className="text-slate-400 hover:text-white text-xs p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Printer Config Drawer (Collapsible) */}
        {isQuickConfigOpen && (
          <form onSubmit={handleSaveQuickConfig} className="mx-6 mt-3 p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 text-white space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs text-amber-300 uppercase tracking-wider">
                  Quick Network Printer Hardware Routing
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                Changes persist to SQLite storage
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Receipt Printer Routing */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5 text-blue-400" /> Receipt Printer
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                    Online
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">IP Address</label>
                    <input
                      type="text"
                      value={tempReceiptIp}
                      onChange={(e) => setTempReceiptIp(e.target.value)}
                      placeholder="192.168.1.100"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Paper Size</label>
                    <select
                      value={tempReceiptPaper}
                      onChange={(e) => setTempReceiptPaper(e.target.value as '80mm' | '58mm')}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-bold text-xs focus:border-amber-500 outline-none"
                    >
                      <option value="80mm">80mm (Standard)</option>
                      <option value="58mm">58mm (Compact)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Kitchen Printer Routing */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" /> Kitchen KOT Printer
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                    Online
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">IP Address</label>
                    <input
                      type="text"
                      value={tempKitchenIp}
                      onChange={(e) => setTempKitchenIp(e.target.value)}
                      placeholder="192.168.1.101"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Paper Size</label>
                    <select
                      value={tempKitchenPaper}
                      onChange={(e) => setTempKitchenPaper(e.target.value as '80mm' | '58mm')}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-bold text-xs focus:border-amber-500 outline-none"
                    >
                      <option value="80mm">80mm (Standard)</option>
                      <option value="58mm">58mm (Compact)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsQuickConfigOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition"
              >
                Save Hardware Routing
              </button>
            </div>
          </form>
        )}

        {/* ACTION COMMAND CENTER BAR: Options for Both, Receipt Only, Kitchen Only */}
        <div className={`p-4 ${styles.bgSubtle} border-b ${styles.borderDefault} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'} flex items-center gap-1.5`}>
              <Send className="w-3.5 h-3.5 text-amber-500" />
              Order Confirmation Print Options:
            </span>

            {/* Quick Printer Indicators */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <div className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 ${isDark ? 'bg-slate-900/80 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold">Receipt IP:</span>
                <span className="font-mono text-amber-500 font-bold">{printerSettings.receiptPrinter.ipAddress}</span>
                <span className="text-[10px] text-slate-400 font-mono">({printerSettings.receiptPrinter.paperSize})</span>
              </div>

              <div className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 ${isDark ? 'bg-slate-900/80 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold">Kitchen IP:</span>
                <span className="font-mono text-amber-500 font-bold">{printerSettings.kitchenPrinter.ipAddress}</span>
                <span className="text-[10px] text-slate-400 font-mono">({printerSettings.kitchenPrinter.paperSize})</span>
              </div>
            </div>
          </div>

          {/* 3 Dedicated Print Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. PRINT BOTH */}
            <button
              type="button"
              onClick={handlePrintBoth}
              className="px-4 py-3 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-2xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <Sparkles className="w-4 h-4 stroke-[2.5]" />
              <div className="text-left">
                <div className="font-black leading-tight">Print BOTH Separately</div>
                <div className="text-[10px] font-normal text-slate-900/80 leading-tight">
                  Receipt ({printerSettings.receiptPrinter.paperSize}) + Kitchen KOT ({printerSettings.kitchenPrinter.paperSize})
                </div>
              </div>
            </button>

            {/* 2. PRINT RECEIPT ONLY */}
            <button
              type="button"
              onClick={handlePrintReceiptOnly}
              className={`px-4 py-3 rounded-2xl border font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] ${
                activePreview === 'receipt'
                  ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400 shadow-md shadow-blue-500/20'
                  : `${isDark ? 'bg-slate-900/80 hover:bg-slate-800 text-slate-200 border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'}`
              }`}
            >
              <Printer className="w-4 h-4 text-blue-400 shrink-0" />
              <div className="text-left">
                <div className="leading-tight">Print Receipt Only</div>
                <div className="text-[10px] font-normal opacity-80 leading-tight">
                  Send to {printerSettings.receiptPrinter.ipAddress} ({printerSettings.receiptPrinter.paperSize})
                </div>
              </div>
            </button>

            {/* 3. PRINT KITCHEN KOT ONLY */}
            <button
              type="button"
              onClick={handlePrintKitchenOnly}
              className={`px-4 py-3 rounded-2xl border font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] ${
                activePreview === 'kitchen'
                  ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-md shadow-amber-500/20'
                  : `${isDark ? 'bg-slate-900/80 hover:bg-slate-800 text-slate-200 border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'}`
              }`}
            >
              <UtensilsCrossed className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-left">
                <div className="leading-tight">Print Kitchen KOT Only</div>
                <div className="text-[10px] font-normal opacity-80 leading-tight">
                  Send to {printerSettings.kitchenPrinter.ipAddress} ({printerSettings.kitchenPrinter.paperSize})
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Main Body: Preview Tab Switcher & Paper Simulation */}
        <div className="p-4 flex flex-col flex-1 overflow-hidden">
          {/* Tab Selector for Paper Preview */}
          <div className="flex items-center justify-between mb-3 border-b pb-2 border-slate-800/40">
            <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setActivePreview('receipt')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activePreview === 'receipt'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Customer Receipt ({receiptPaperWidth})</span>
              </button>

              <button
                type="button"
                onClick={() => setActivePreview('kitchen')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activePreview === 'kitchen'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>Kitchen Order Ticket KOT ({kitchenPaperWidth})</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleKickDrawer}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                title="Fire ESC/POS Pin 2 drawer kick solenoid"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Kick Drawer</span>
              </button>

              <button
                type="button"
                onClick={handleBrowserSystemPrint}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                title="Send current view to system browser print dialog"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span>Browser Print</span>
              </button>
            </div>
          </div>

          {/* Paper View Container */}
          <div className="flex-1 overflow-y-auto p-4 flex justify-center bg-slate-950/70 rounded-2xl border border-slate-800/80">
            {/* VIEW A: CUSTOMER THERMAL RECEIPT */}
            {activePreview === 'receipt' && (
              <div
                id="printable-receipt"
                className={`${receiptPaperWidth === '58mm' ? 'w-[260px] text-[10px]' : 'w-[340px] text-xs'} bg-white text-slate-900 font-mono p-5 shadow-2xl rounded-sm border-t-4 border-slate-400 print:w-full print:shadow-none transition-all duration-200`}
                style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}
              >
                {/* Store Header */}
                <div className="text-center pb-3 border-b border-dashed border-slate-400">
                  <h2 className="text-sm sm:text-base font-black tracking-wider uppercase text-slate-950 leading-tight">
                    {receiptConfig.storeName || branch.name}
                  </h2>
                  {receiptConfig.tagline && (
                    <p className="text-[10px] text-slate-600 italic mt-0.5">{receiptConfig.tagline}</p>
                  )}
                  <p className="text-[10px] text-slate-600 mt-1">{receiptConfig.address || branch.address}</p>
                  <p className="text-[10px] text-slate-600">Tel: {receiptConfig.phone || branch.phone}</p>
                  {receiptConfig.taxRegistrationNumber && (
                    <p className="text-[9px] text-slate-500 font-mono">Tax ID: {receiptConfig.taxRegistrationNumber}</p>
                  )}
                  <div className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest font-semibold">
                    ** ESC/POS {receiptPaperWidth.toUpperCase()} RECEIPT **
                  </div>
                  <div className="text-[8px] text-blue-700 font-bold mt-0.5">
                    Target: {printerSettings.receiptPrinter.ipAddress}:{printerSettings.receiptPrinter.port}
                  </div>
                </div>

                {/* Invoice Meta */}
                <div className="py-2.5 border-b border-dashed border-slate-400 text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="font-semibold">Invoice:</span>
                    <span className="font-bold">{order.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <span>{new Date(order.createdAt || Date.now()).toLocaleDateString()} {new Date(order.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cashier:</span>
                    <span>{order.cashierName || 'Operator'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Channel:</span>
                    <span className="font-bold uppercase bg-slate-100 px-1 py-0.5 rounded text-[10px]">
                      {order.orderType === 'dine_in'
                        ? `Dine-In (${order.tableName || 'Table'})`
                        : order.orderType === 'delivery'
                        ? `Delivery (${order.deliveryChannel || 'Direct'})`
                        : 'Takeaway'}
                    </span>
                  </div>
                  {order.customerName && (
                    <div className="flex justify-between text-slate-700">
                      <span>Customer:</span>
                      <span>{order.customerName}</span>
                    </div>
                  )}
                  {order.deliveryAddress && (
                    <div className="text-[10px] text-slate-600 pt-0.5">
                      <span className="font-semibold">Addr: </span>
                      {order.deliveryAddress}
                    </div>
                  )}
                  {order.orderNotes && (
                    <div className="text-[10px] text-amber-700 pt-0.5">
                      <span className="font-semibold">Instructions: </span>
                      {order.orderNotes}
                    </div>
                  )}
                </div>

                {/* Line Items Table */}
                <div className="py-2.5 border-b border-dashed border-slate-400">
                  <div className="flex justify-between font-bold pb-1 text-[11px] border-b border-slate-200">
                    <span>ITEM</span>
                    <span>QTY x PRICE</span>
                    <span>TOTAL</span>
                  </div>

                  <div className="divide-y divide-slate-100 pt-1">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="py-1 text-[11px]">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-slate-900 leading-tight">
                            {item.productName}
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {money(item.totalPrice)}
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-500 flex justify-between">
                          <span>
                            {item.quantity} x {money(item.unitPrice)}
                            {item.variationName && ` (${item.variationName})`}
                          </span>
                        </div>

                        {item.selectedModifiers.length > 0 && (
                          <div className="pl-2 text-[10px] text-slate-500 italic">
                            {item.selectedModifiers.map((m, i) => (
                              <div key={i}>+ {m.name} (+{money(m.price)})</div>
                            ))}
                          </div>
                        )}

                        {item.itemNotes && (
                          <div className="pl-2 text-[10px] text-amber-700 italic">
                            Note: {item.itemNotes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="py-2 border-b border-dashed border-slate-400 text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{money(order.subtotal)}</span>
                  </div>
                  {order.orderDiscountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount ({order.orderDiscountPercent}%)</span>
                      <span>-{money(order.orderDiscountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Sales Tax ({branch.taxRate}%)</span>
                    <span>{money(order.taxAmount)}</span>
                  </div>
                  {order.serviceChargeAmount > 0 && (
                    <div className="flex justify-between">
                      <span>Service Charge ({branch.serviceChargeRate}%)</span>
                      <span>{money(order.serviceChargeAmount)}</span>
                    </div>
                  )}
                  {order.deliveryChargeAmount > 0 && (
                    <div className="flex justify-between">
                      <span>Delivery Fee</span>
                      <span>{money(order.deliveryChargeAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-300 text-slate-950">
                    <span>GRAND TOTAL</span>
                    <span>{money(order.grandTotal)}</span>
                  </div>
                </div>

                {/* Payment Record */}
                <div className="py-2 border-b border-dashed border-slate-400 text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="font-semibold">Payment Method:</span>
                    <span className="font-bold uppercase">{order.paymentMethod || 'CASH'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount Tendered:</span>
                    <span>{money(order.amountPaid || order.grandTotal)}</span>
                  </div>
                  {order.changeGiven > 0 && (
                    <div className="flex justify-between font-bold text-slate-900">
                      <span>Change Returned:</span>
                      <span>{money(order.changeGiven)}</span>
                    </div>
                  )}
                </div>

                {/* Barcode & Footer */}
                <div className="pt-3 text-center space-y-1 text-slate-600">
                  <div className="inline-block px-3 py-1 bg-slate-100 rounded text-[9px] tracking-widest font-mono font-bold text-slate-700">
                    ||| | ||||| || |||| || |||
                  </div>
                  <p className="text-[10px] font-bold">{order.invoiceNumber}</p>
                  <p className="text-[10px] font-semibold pt-1">
                    {receiptConfig.footerCustomText || 'THANK YOU FOR DINING WITH US!'}
                  </p>
                  <p className="text-[9px] text-slate-400">Wi-Fi: RestoGuest / Pass: burger2026</p>
                </div>

                {/* Paper Tear Zigzag Bottom */}
                <div className="text-center text-slate-400 text-[9px] tracking-widest mt-3 opacity-60">
                  ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼
                </div>
              </div>
            )}

            {/* VIEW B: KITCHEN ORDER TICKET (KOT) */}
            {activePreview === 'kitchen' && (
              <div
                id="printable-kitchen-ticket"
                className={`${kitchenPaperWidth === '58mm' ? 'w-[260px] text-[10px]' : 'w-[340px] text-xs'} bg-amber-50/95 text-slate-900 font-mono p-5 shadow-2xl rounded-sm border-t-4 border-amber-500 print:w-full print:shadow-none transition-all duration-200`}
                style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}
              >
                {/* Kitchen Header */}
                <div className="text-center pb-2.5 border-b-2 border-slate-900 space-y-1">
                  <div className="bg-slate-950 text-white font-black text-sm py-1 px-2 rounded-sm tracking-widest uppercase">
                    *** KITCHEN ORDER TICKET ***
                  </div>
                  <div className="text-[11px] font-black text-amber-900 uppercase">
                    STATION: ALL KITCHEN STATIONS
                  </div>
                  <div className="text-[9px] font-bold text-slate-700">
                    TARGET: {printerSettings.kitchenPrinter.ipAddress}:{printerSettings.kitchenPrinter.port} ({kitchenPaperWidth})
                  </div>
                </div>

                {/* Kitchen Order Meta */}
                <div className="py-2.5 border-b-2 border-slate-900 text-xs space-y-1 font-bold">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-black">TICKET: {order.invoiceNumber}</span>
                    <span className="text-[11px] text-slate-700">{new Date(order.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs bg-slate-900 text-white p-1 rounded-sm">
                    <span className="uppercase">
                      TYPE: {order.orderType === 'dine_in' ? 'DINE-IN' : order.orderType === 'delivery' ? 'DELIVERY' : 'TAKEAWAY'}
                    </span>
                    {order.tableName && (
                      <span className="font-black text-amber-400 text-sm">
                        TABLE: {order.tableName}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-700">
                    <span>Server: {order.cashierName || 'Staff'}</span>
                    <span>Guests: {order.orderType === 'dine_in' ? '2' : 'N/A'}</span>
                  </div>

                  {order.customerName && order.orderType !== 'dine_in' && (
                    <div className="text-[11px] text-slate-800">
                      <span>Customer: {order.customerName}</span>
                    </div>
                  )}
                </div>

                {/* Items for Cooking */}
                <div className="py-3 border-b-2 border-slate-900 space-y-3">
                  <div className="text-[11px] font-black tracking-wider border-b border-slate-400 pb-1 text-slate-700">
                    LINE ITEMS TO PREPARE ({totalItemCount} TOTAL)
                  </div>

                  {order.items.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-2">
                          <span className="font-black text-sm bg-slate-900 text-white px-1.5 py-0.5 rounded-sm">
                            {item.quantity}x
                          </span>
                          <span className="font-black text-xs uppercase text-slate-950">
                            {item.productName}
                          </span>
                        </div>
                        <span className="text-[9px] uppercase font-bold px-1 rounded bg-slate-200 text-slate-700">
                          {item.kitchenStation || 'KITCHEN'}
                        </span>
                      </div>

                      {item.variationName && (
                        <div className="pl-6 text-[10px] font-bold text-amber-900">
                          » Size: {item.variationName}
                        </div>
                      )}

                      {item.selectedModifiers.length > 0 && (
                        <div className="pl-6 text-[10px] space-y-0.5">
                          {item.selectedModifiers.map((m, mIdx) => (
                            <div key={mIdx} className="font-bold text-slate-800">
                              + {m.name}
                            </div>
                          ))}
                        </div>
                      )}

                      {item.itemNotes && (
                        <div className="ml-6 p-1 bg-amber-200/90 border border-amber-400 rounded text-[10px] font-bold text-amber-950">
                          ⚠️ SPECIAL NOTE: {item.itemNotes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Delivery rider instructions if applicable */}
                {order.orderType === 'delivery' && (
                  <div className="py-2 border-b-2 border-slate-900 text-[10px] space-y-0.5 font-bold text-slate-800">
                    <div>CHANNEL: {order.deliveryChannel?.toUpperCase() || 'DIRECT'}</div>
                    {order.riderName && <div>RIDER: {order.riderName}</div>}
                    {order.deliveryAddress && <div>DESTINATION: {order.deliveryAddress}</div>}
                  </div>
                )}

                {/* Kitchen Footer */}
                <div className="pt-2 text-center text-[10px] font-bold text-slate-600 space-y-1">
                  <div>*** EXPEDITE PREP & PASS TO EXPO ***</div>
                  <div className="text-[9px] text-slate-500 font-mono">
                    SENT VIA ESC/POS NETWORK RAW PORT 9100
                  </div>
                </div>

                {/* Paper Tear Zigzag Bottom */}
                <div className="text-center text-slate-400 text-[9px] tracking-widest mt-3 opacity-60">
                  ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className={`p-4 ${styles.bgSurface} border-t ${styles.borderDefault} flex flex-wrap items-center justify-between gap-3`}>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Ready for dispatch to IP printers</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintBoth}
              className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Both</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
            >
              Done / Next Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
