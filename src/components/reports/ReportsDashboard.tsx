import React, { useEffect, useState } from 'react';
import { Branch, User } from '../../types/restaurant';
import { AnalyticsReport, sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';
import {
  TrendingUp,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  CreditCard,
  Banknote,
  Download,
  Printer,
  DollarSign,
  BarChart3,
  Sparkles,
} from 'lucide-react';

interface ReportsDashboardProps {
  branch: Branch;
  currentUser: User;
}

export const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ branch, currentUser }) => {
  const { styles, isDark } = useAppTheme();
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [reportError, setReportError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  useEffect(() => {
    let active = true;
    setReport(null);
    setReportError('');
    if (!sqliteService.getUserPermissions(currentUser).canViewFinancialReports) {
      setReportError('Financial reporting requires the Financial Reports & P&L permission. Sign in with a manager, accountant, branch administrator, or super administrator account.');
      return () => { active = false; };
    }
    void sqliteService.getAnalyticsReport(branch.id, currentUser, { startDate: appliedStartDate || undefined, endDate: appliedEndDate || undefined })
      .then((result) => { if (active) setReport(result); })
      .catch((error: unknown) => { if (active) setReportError(error instanceof Error ? error.message : 'Unable to load the report.'); });
    return () => { active = false; };
  }, [branch.id, currentUser, appliedStartDate, appliedEndDate]);

  const orders = report?.orders || [];
  const totalSales = report?.totalSales || 0;
  const totalTax = report?.totalTax || 0;
  const totalDiscounts = report?.totalDiscounts || 0;
  const dineInCount = report?.channels.dineIn || 0;
  const takeawayCount = report?.channels.takeaway || 0;
  const deliveryCount = report?.channels.delivery || 0;
  const cashTotal = report?.payments.cash || 0;
  const cardTotal = report?.payments.card || 0;
  const walletTotal = report?.payments.digital || 0;
  const topProducts = report?.topProducts || [];
  const operatingExpenses = report?.operatingExpenses || 0;
  const directStockPurchases = report?.directStockPurchases || 0;
  const netOperatingResult = totalSales - operatingExpenses;
  const money = (amount: number) => formatCurrency(amount, branch.currencySymbol);
  const periodLabel = appliedStartDate && appliedEndDate ? `${appliedStartDate} to ${appliedEndDate}` : 'All recorded dates';

  const handleApplyPeriod = () => {
    if ((startDate && !endDate) || (!startDate && endDate)) {
      setReportError('Select both a start and end date, or clear both dates.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setReportError('The report start date cannot be after the end date.');
      return;
    }
    setReportError('');
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  const handleClearPeriod = () => {
    setStartDate('');
    setEndDate('');
    setReportError('');
    setAppliedStartDate('');
    setAppliedEndDate('');
  };

  const handleExportCSV = () => {
    const csvValue = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const summary = [
      ['Metric', 'Value'],
      ['Gross Sales', totalSales], ['Operating Expenses', operatingExpenses], ['Direct Stock Purchases', directStockPurchases], ['Net Operating Result', netOperatingResult],
      ['Sales Tax', totalTax], ['Discounts', totalDiscounts], ['Cash Payments', cashTotal], ['Card Payments', cardTotal], ['Digital Payments', walletTotal],
      [], ['Top Products', 'Quantity', 'Revenue'],
      ...topProducts.map((product) => [product.name, product.qty, product.revenue]),
      [], ['Invoice', 'Type', 'Status', 'Total', 'Tax', 'Cashier', 'Created'],
    ].map((row) => row.map((value) => csvValue(value ?? '')).join(',')).join('\n');
    const rows = orders
      .map(
        (o) =>
          [o.invoiceNumber, o.orderType, o.status, o.grandTotal, o.taxAmount, o.cashierName, o.createdAt].map(csvValue).join(',')
      )
      .join('\n');
    const blob = new Blob([`${summary}\n${rows}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restoflow-sales-report-${branch.code}-${appliedStartDate || 'all'}-${appliedEndDate || 'dates'}.csv`;
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 gap-4 p-4 ${styles.bgApp} overflow-hidden`}>
      {/* Header */}
      <div className={`p-4 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-4 shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#E8F3F0] border border-[#B9D8D0] text-[#16665A] shadow-sm">
            <BarChart3 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'} tracking-tight`}>
                Analytics & Reports
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E9F4EE] text-[#16665A] border border-[#A7D6CC] flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                <span>Live Audit</span>
              </span>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5 font-medium`}>
              Reconciled SQLite Transactional Ledger & Sales Metrics • {branch.name}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-end gap-2">
          <label className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>From
            <input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className="block mt-1 px-2 py-1.5 text-xs rounded-lg border border-[#CFE3DC] bg-white text-slate-800 focus:outline-none focus:border-[#16665A]" />
          </label>
          <label className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>To
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className="block mt-1 px-2 py-1.5 text-xs rounded-lg border border-[#CFE3DC] bg-white text-slate-800 focus:outline-none focus:border-[#16665A]" />
          </label>
          <button type="button" onClick={handleApplyPeriod} className="px-3 py-2 text-xs font-bold bg-[#16665A] hover:bg-[#115448] text-white rounded-xl transition">Run</button>
          {(startDate || endDate || appliedStartDate || appliedEndDate) && <button type="button" onClick={handleClearPeriod} className="px-2 py-2 text-xs font-bold rounded-xl border border-[#A7D6CC] bg-white text-[#16665A] hover:bg-[#E9F4EE]">Clear</button>}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!report}
            className="px-3.5 py-2 text-xs font-bold bg-white hover:bg-[#E9F4EE] text-[#16665A] border border-[#A7D6CC] rounded-xl flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 text-[#16665A]" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 text-xs font-black bg-[#16665A] hover:bg-[#115448] text-white rounded-xl flex items-center gap-1.5 transition shadow-md cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      {reportError ? (
        <div className="flex-1 p-6 overflow-y-auto">
          <div className={`${styles.bgCard} border ${styles.borderDefault} max-w-2xl mx-auto p-6 rounded-3xl shadow-sm`}>
            <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>Report access required</h3>
            <p className={`text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{reportError}</p>
          </div>
        </div>
      ) : (
      <div className="flex-1 p-1 overflow-y-auto space-y-5">
        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`${styles.bgCard} border ${styles.borderDefault} p-5 rounded-2xl shadow-sm hover:shadow-md transition`}>
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Gross Sales Revenue</span>
            <div className={`text-3xl font-black font-mono ${isDark ? 'text-white' : 'text-slate-900'} mt-1 num-tabular tracking-tight`}>
              {money(totalSales)}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-500 mt-2 font-bold">
              <TrendingUp className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Real-time local POS transactions</span>
            </div>
          </div>

          <div className={`${styles.bgCard} border ${styles.borderDefault} p-5 rounded-2xl shadow-sm hover:shadow-md transition`}>
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Tickets Finalized</span>
            <div className="text-3xl font-black font-mono text-[#16665A] mt-1 num-tabular tracking-tight">
        {orders.length}
            </div>
            <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-2 font-medium`}>
              Avg ticket: <strong className={isDark ? 'text-white' : 'text-slate-800'}>{money(orders.length > 0 ? totalSales / orders.length : 0)}</strong>
            </div>
          </div>

          <div className={`${styles.bgCard} border ${styles.borderDefault} p-5 rounded-2xl shadow-sm hover:shadow-md transition`}>
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sales Tax Reconciled</span>
            <div className="text-3xl font-black font-mono text-sky-500 mt-1 num-tabular tracking-tight">
              {money(totalTax)}
            </div>
            <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-2 font-medium`}>
              Configured rate: <strong className={isDark ? 'text-white' : 'text-slate-800'}>{branch.taxRate}%</strong>
            </div>
          </div>

          <div className={`${styles.bgCard} border ${styles.borderDefault} p-5 rounded-2xl shadow-sm hover:shadow-md transition`}>
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Discounts Absorbed</span>
            <div className="text-3xl font-black font-mono text-rose-500 mt-1 num-tabular tracking-tight">
              -{money(totalDiscounts)}
            </div>
            <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-2 font-medium`}>
              Loyalty promos & cashier cuts
            </div>
          </div>
        </div>

        <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Reporting period: <span className={isDark ? 'text-slate-200' : 'text-slate-800'}>{periodLabel}</span></p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`${styles.bgCard} border ${styles.borderDefault} p-5 rounded-3xl shadow-sm`}><span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Operating Expenses</span><div className="text-2xl font-black font-mono text-rose-500 mt-1">{money(operatingExpenses)}</div><p className={`text-[11px] mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Includes approved expenses and posted payroll from the SQLite ledger.</p></div>
          <div className={`${styles.bgCard} border ${styles.borderDefault} p-5 rounded-3xl shadow-sm`}><span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Direct Stock Purchases</span><div className="text-2xl font-black font-mono text-sky-500 mt-1">{money(directStockPurchases)}</div><p className={`text-[11px] mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Quick-restock purchase total. Kept separate from operating expenses to avoid double-counting inventory cost.</p></div>
          <div className={`${styles.bgCard} border ${styles.borderDefault} p-5 rounded-3xl shadow-sm`}><span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Net Operating Result</span><div className={`text-2xl font-black font-mono mt-1 ${netOperatingResult >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{money(netOperatingResult)}</div><p className={`text-[11px] mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sales revenue less posted operating expenses; excludes unrecorded costs and tax remittance.</p></div>
        </div>

        {/* Charts & Distributions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order Channels */}
          <div className={`${styles.bgCard} border ${styles.borderDefault} p-6 rounded-3xl shadow-xs`}>
            <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'} mb-4 tracking-tight`}>
              Order Channel Volume
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <UtensilsCrossed className="w-3.5 h-3.5 text-[#16665A]" /> Dine-In Table
                  </span>
                  <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'} num-tabular`}>
                    {dineInCount} ({orders.length ? Math.round((dineInCount / orders.length) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-[#E9F4EE] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-[#16665A] h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${orders.length ? (dineInCount / orders.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" /> Takeaway Pickup
                  </span>
                  <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'} num-tabular`}>
                    {takeawayCount} ({orders.length ? Math.round((takeawayCount / orders.length) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-[#E9F4EE] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${orders.length ? (takeawayCount / orders.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <Bike className="w-3.5 h-3.5 text-sky-500" /> Delivery Dispatch
                  </span>
                  <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'} num-tabular`}>
                    {deliveryCount} ({orders.length ? Math.round((deliveryCount / orders.length) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-[#E9F4EE] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-sky-500 h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${orders.length ? (deliveryCount / orders.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className={`${styles.bgCard} border ${styles.borderDefault} p-6 rounded-3xl shadow-xs`}>
            <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'} mb-4 tracking-tight`}>
              Tender Settlement Mix
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center p-3 bg-[#FCFBF8] border border-[#E8E3DA] rounded-2xl">
                <span className={`flex items-center gap-2 font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  <Banknote className="w-4 h-4 text-emerald-500" /> Cash Drawer
                </span>
                <span className={`font-mono font-black ${isDark ? 'text-white' : 'text-slate-900'} num-tabular`}>
                  {money(cashTotal)}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 bg-[#FCFBF8] border border-[#E8E3DA] rounded-2xl">
                <span className={`flex items-center gap-2 font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  <CreditCard className="w-4 h-4 text-sky-500" /> Card Settlement
                </span>
                <span className={`font-mono font-black ${isDark ? 'text-white' : 'text-slate-900'} num-tabular`}>
                  {money(cardTotal)}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 bg-[#FCFBF8] border border-[#E8E3DA] rounded-2xl">
                <span className={`flex items-center gap-2 font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  <DollarSign className="w-4 h-4 text-purple-500" /> Digital Wallets & QR
                </span>
                <span className={`font-mono font-black ${isDark ? 'text-white' : 'text-slate-900'} num-tabular`}>
                  {money(walletTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Top Selling Products */}
          <div className={`${styles.bgCard} border ${styles.borderDefault} p-6 rounded-3xl shadow-xs`}>
            <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'} mb-3 tracking-tight`}>
              Top Selling Dishes & Items
            </h3>
            <div className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-100'} text-xs`}>
              {topProducts.length === 0 ? (
                <p className="text-slate-500 py-6 text-center italic">No sales recorded yet</p>
              ) : (
                topProducts.map((p, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'} block`}>
                        {p.name}
                      </span>
                      <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {p.qty} orders served
                      </span>
                    </div>
                    <span className="font-mono font-black text-[#16665A] num-tabular">
                      {money(p.revenue)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
