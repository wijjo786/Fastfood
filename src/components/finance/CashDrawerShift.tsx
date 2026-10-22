import React, { useState } from 'react';
import { CashSession, Branch, User } from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Lock,
  Unlock,
  Printer,
} from 'lucide-react';

interface CashDrawerShiftProps {
  branch: Branch;
  currentUser: User;
}

export const CashDrawerShift: React.FC<CashDrawerShiftProps> = ({ branch, currentUser }) => {
  const { styles } = useAppTheme();
  const [session, setSession] = useState<CashSession>(() => sqliteService.getCashSession());
  const [movementType, setMovementType] = useState<'payout' | 'drop'>('payout');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');

  const [countedCash, setCountedCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  const [newOpeningFloat, setNewOpeningFloat] = useState('250.00');
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const money = (amount: number) => formatCurrency(amount, branch.currencySymbol);

  const refreshSession = () => {
    setSession(sqliteService.getCashSession());
  };

  const handleRecordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(movementAmount);
    if (isNaN(amt) || amt <= 0 || !movementReason.trim()) return;

    try {
      setActionError(null);
      await sqliteService.recordCashMovement(movementType, amt, movementReason, currentUser);
      setMovementAmount('');
      setMovementReason('');
      refreshSession();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Cash movement could not be recorded.');
    }
  };

  const handleCloseShift = async () => {
    const counted = parseFloat(countedCash);
    if (isNaN(counted) || counted < 0) return;

    try {
      setActionError(null);
      await sqliteService.closeCashSession(counted, closingNotes, currentUser);
      setIsCloseModalOpen(false);
      refreshSession();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Shift could not be closed.');
    }
  };

  const handleReopenShift = async () => {
    const floatVal = parseFloat(newOpeningFloat);
    if (isNaN(floatVal) || floatVal < 0) return;

    try {
      setActionError(null);
      await sqliteService.reopenCashSession(floatVal, currentUser);
      setIsReopenModalOpen(false);
      refreshSession();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'New shift could not be opened.');
    }
  };

  const handlePrintXReport = () => {
    window.print();
  };

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 gap-4 p-4 ${styles.bgApp} overflow-hidden`}>
      {actionError && <div role="alert" className="mx-4 mt-3 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex justify-between gap-3"><span>{actionError}</span><button type="button" onClick={() => setActionError(null)} className="font-bold">Dismiss</button></div>}
      {/* Header */}
      <div className={`p-4 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-4 shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#E9F4EE] border border-[#A7D6CC] text-[#16665A]">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Cash Drawer & Shift Operations</h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  session.status === 'open'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}
              >
                Drawer {session.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Session ID: <span className="font-mono text-slate-700">{session.id}</span> • Opened by {session.cashierName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintXReport}
            className="px-3.5 py-1.5 text-xs font-semibold bg-white hover:bg-[#E9F4EE] text-[#16665A] border border-[#A7D6CC] rounded-xl flex items-center gap-1.5 transition shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print X-Report</span>
          </button>

          {session.status === 'open' ? (
            <button
              type="button"
              onClick={() => setIsCloseModalOpen(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Close Shift & Run Z-Report</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsReopenModalOpen(true)}
              className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Open New Cashier Shift</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Drawer Summary Dashboard */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`${styles.bgCard} border ${styles.borderDefault} p-4 rounded-2xl flex flex-col justify-between`}>
            <span className="text-xs font-medium text-slate-500">Opening Float</span>
            <div className="text-2xl font-black font-mono text-slate-900 mt-1">
              {money(session.openingFloat)}
            </div>
            <span className="text-[10px] text-slate-400 mt-2">Verified at shift start</span>
          </div>

          <div className={`${styles.bgCard} border ${styles.borderDefault} p-4 rounded-2xl flex flex-col justify-between`}>
            <span className="text-xs font-medium text-emerald-700">Cash Sales In Drawer</span>
            <div className="text-2xl font-black font-mono text-emerald-700 mt-1">
              +{money(session.cashSales)}
            </div>
            <span className="text-[10px] text-slate-400 mt-2">Physical bills & coins</span>
          </div>

          <div className={`${styles.bgCard} border ${styles.borderDefault} p-4 rounded-2xl flex flex-col justify-between`}>
            <span className="text-xs font-medium text-sky-700">Card & Digital Payments</span>
            <div className="text-2xl font-black font-mono text-sky-700 mt-1">
              {money(session.cardSales + session.walletSales)}
            </div>
            <span className="text-[10px] text-slate-400 mt-2">EMV Terminals & Wallets</span>
          </div>

          <div className="bg-[#E9F4EE] border border-[#A7D6CC] p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-bold text-[#18302D]">Expected Physical Cash</span>
            <div className="text-2xl font-black font-mono text-[#16665A] mt-1">
              {money(session.expectedCash)}
            </div>
            <span className="text-[10px] text-[#39776C] mt-2">Float + Cash Sales - Payouts</span>
          </div>
        </div>

        {/* Closed shift variance results banner if closed */}
        {session.status === 'closed' && (
          <div
            className={`p-5 rounded-2xl border flex items-center justify-between ${
              (session.variance || 0) === 0
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <div>
              <h4 className="font-bold text-base">Z-Report Closed Shift Reconciliation</h4>
              <p className="text-xs opacity-80 mt-0.5">
                Expected: {money(session.expectedCash)} • Actual Counted: {money(session.actualCashCounted || 0)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs block opacity-75">Cash Variance:</span>
              <span className="text-xl font-mono font-black">
                {(session.variance || 0) > 0
                  ? `+${money(session.variance || 0)} (Overage)`
                  : (session.variance || 0) < 0
                  ? `-${money(Math.abs(session.variance || 0))} (Shortage)`
                  : `${money(0)} (Perfect Match)`}
              </span>
            </div>
          </div>
        )}

        {/* Cash In / Cash Out (Petty Cash Movements) */}
        {session.status === 'open' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl p-5 shadow-xs`}>
              <h3 className="font-bold text-sm text-slate-900 mb-1">Cash Movement / Petty Cash</h3>
              <p className="text-xs text-slate-500 mb-4">
                Record safe cash drops or emergency expense payouts from drawer
              </p>

              <form onSubmit={handleRecordMovement} className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMovementType('payout')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      movementType === 'payout'
                        ? 'bg-rose-50 border-rose-300 text-rose-800'
                        : 'bg-[#FCFBF8] border-[#E8E3DA] text-slate-600 hover:bg-[#F4F8F5]'
                    }`}
                  >
                    <ArrowDownCircle className="w-4 h-4" />
                    <span>Cash Out / Payout</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('drop')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      movementType === 'drop'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-[#FCFBF8] border-[#E8E3DA] text-slate-600 hover:bg-[#F4F8F5]'
                    }`}
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    <span>Safe Drop / Cash In</span>
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Amount ({branch.currency || 'PKR'})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={movementAmount}
                    onChange={(e) => setMovementAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full px-3 py-2 text-sm font-mono font-bold bg-[#FCFBF8] border border-[#CFE3DC] rounded-xl text-slate-900 focus:outline-none focus:border-[#16665A]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Reason & Payee</label>
                  <input
                    type="text"
                    value={movementReason}
                    onChange={(e) => setMovementReason(e.target.value)}
                    placeholder="e.g. Ice bag purchase, safe transfer"
                    required
                    className="w-full px-3 py-2 text-xs bg-[#FCFBF8] border border-[#CFE3DC] rounded-xl text-slate-800 focus:outline-none focus:border-[#16665A]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition"
                >
                  Record Cash Movement
                </button>
              </form>
            </div>

            <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl p-5 shadow-xs flex flex-col justify-between`}>
              <div>
                <h3 className="font-bold text-sm text-slate-900 mb-1">Current Shift Breakdown (X-Report)</h3>
                <p className="text-xs text-slate-500 mb-4">Real-time ledger of cashier drawer</p>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Shift Opened:</span>
                    <span className="font-mono text-slate-800">
                      {new Date(session.openedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Initial Float:</span>
                    <span className="font-mono text-slate-800">{money(session.openingFloat)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Gross Cash Collected:</span>
                    <span className="font-mono text-emerald-700 font-bold">+{money(session.cashSales)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Petty Cash Payouts:</span>
                    <span className="font-mono text-rose-700 font-bold">-{money(session.cashPayouts)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Bank / Safe Drops:</span>
                    <span className="font-mono text-rose-700 font-bold">-{money(session.cashDrops)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-900">
                    <span>Calculated In-Drawer Total:</span>
                    <span className="font-mono text-[#16665A]">{money(session.expectedCash)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 border border-slate-200">
                🔒 Security Note: Cash drawer triggers are audited with timestamp and cashier ID in SQLite.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Close Shift Modal */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] border border-[#E8E3DA] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-800 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900">Close Shift & Reconcile Z-Report</h3>
            <p className="text-xs text-slate-500">
              Count all physical bills and coins in the drawer and enter the total below.
            </p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between">
              <span className="text-slate-500">System Expected Cash:</span>
              <span className="font-mono font-bold text-[#16665A]">
                {money(session.expectedCash)}
              </span>
            </div>

            <div>
              <label className="block text-xs text-slate-700 mb-1">
                Actual Physical Cash Counted ({branch.currency || 'PKR'})
              </label>
              <input
                type="number"
                step="0.01"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-base font-mono font-bold bg-[#FCFBF8] border border-[#CFE3DC] rounded-xl text-slate-900 focus:outline-none focus:border-[#16665A]"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-700 mb-1">Closing Notes / Discrepancy</label>
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="e.g. All coupons accounted for, register cleaned."
                rows={2}
                className="w-full px-3 py-2 text-xs bg-[#FCFBF8] border border-[#CFE3DC] rounded-xl text-slate-800 focus:outline-none focus:border-[#16665A]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCloseModalOpen(false)}
                className="px-4 py-2 text-xs rounded-xl border border-[#A7D6CC] bg-white text-[#16665A] font-semibold hover:bg-[#E9F4EE]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseShift}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
              >
                Confirm Shift Closeout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Shift Modal */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] border border-[#E8E3DA] rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden text-slate-800 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900">Open New Cashier Shift</h3>
            <p className="text-xs text-slate-500">
              Provide the verified starting opening float for this station.
            </p>

            <div>
              <label className="block text-xs text-slate-700 mb-1">Opening Cash Float ({branch.currency || 'PKR'})</label>
              <input
                type="number"
                step="0.01"
                value={newOpeningFloat}
                onChange={(e) => setNewOpeningFloat(e.target.value)}
                className="w-full px-3 py-2 text-base font-mono font-bold bg-[#FCFBF8] border border-[#CFE3DC] rounded-xl text-slate-900 focus:outline-none focus:border-[#16665A]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsReopenModalOpen(false)}
                className="px-4 py-2 text-xs rounded-xl border border-[#A7D6CC] bg-white text-[#16665A] font-semibold hover:bg-[#E9F4EE]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReopenShift}
                className="px-5 py-2.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition"
              >
                Open Shift
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
