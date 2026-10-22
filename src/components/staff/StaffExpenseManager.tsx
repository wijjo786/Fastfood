import React, { useState } from 'react';
import { Branch, User, Expense, ExpenseCategory, Employee, PayrollAdvance, StaffAttendance, PayrollRun, UserRole } from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';
import {
  Briefcase,
  Receipt,
  UserCheck,
  Clock,
  Plus,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Building,
  UserPlus,
  LogOut,
  LogIn,
  RotateCcw,
  Edit,
  Trash2,
  X,
} from 'lucide-react';

interface StaffExpenseManagerProps {
  branch: Branch;
  currentUser: User;
}

export const StaffExpenseManager: React.FC<StaffExpenseManagerProps> = ({ branch, currentUser }) => {
  const { styles } = useAppTheme();
  const [activeTab, setActiveTab] = useState<'expenses' | 'employees' | 'attendance' | 'payroll'>('expenses');
  const [expenses, setExpenses] = useState<Expense[]>(() => sqliteService.getExpenses(branch.id));
  const [expenseCategories] = useState<ExpenseCategory[]>(() => sqliteService.getExpenseCategories());
  const [employees, setEmployees] = useState<Employee[]>(() => sqliteService.getEmployees(branch.id));
  const [attendances, setAttendances] = useState<StaffAttendance[]>(() =>
    sqliteService.getAttendances(branch.id)
  );
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>(() => sqliteService.getPayrollRuns(branch.id));
  const [payrollAdvances, setPayrollAdvances] = useState<PayrollAdvance[]>(() => sqliteService.getPayrollAdvances(branch.id));

  // Add Expense Modal
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [expCategoryId, setExpCategoryId] = useState(expenseCategories[0]?.id || 'exp-cat-1');
  const [expAmount, setExpAmount] = useState('');
  const [expPayee, setExpPayee] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [expMethod, setExpMethod] = useState<'cash' | 'bank_transfer' | 'card'>('cash');

  // Add / Edit Employee Modal
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empRole, setEmpRole] = useState<UserRole>('cashier');
  const [empPhone, setEmpPhone] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empWage, setEmpWage] = useState('16.00');
  const [empMonthlySalary, setEmpMonthlySalary] = useState('');
  const [empPin, setEmpPin] = useState('1234');
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [payrollMethod, setPayrollMethod] = useState<'cash' | 'bank_transfer'>('bank_transfer');
  const [deductions, setDeductions] = useState<Record<string, string>>({});
  const [advanceEmployee, setAdvanceEmployee] = useState<Employee | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<'cash' | 'bank_transfer'>('bank_transfer');
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [actionError, setActionError] = useState('');
  const permissions = sqliteService.getUserPermissions(currentUser);
  const canManageStaff = permissions.canManageStaff;
  const canManageExpenses = permissions.canViewFinancialReports;
  const showActionError = (error: unknown) => setActionError(error instanceof Error ? error.message : 'The requested action could not be completed.');

  const refreshData = () => {
    setExpenses(sqliteService.getExpenses(branch.id));
    setEmployees(sqliteService.getEmployees(branch.id));
    setAttendances(sqliteService.getAttendances(branch.id));
    setPayrollRuns(sqliteService.getPayrollRuns(branch.id));
    setPayrollAdvances(sqliteService.getPayrollAdvances(branch.id));
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expAmount);
    if (isNaN(amount) || amount <= 0 || !expPayee.trim()) return;

    try {
      await sqliteService.addExpense(expCategoryId, amount, expPayee, expNotes, expMethod, currentUser);
      setIsAddExpenseOpen(false); setExpAmount(''); setExpPayee(''); setExpNotes(''); refreshData();
    } catch (error) { showActionError(error); }
  };

  const handleOpenAddEmp = () => {
    setEditingEmployee(null);
    setEmpName('');
    setEmpRole('cashier');
    setEmpPhone('+1 555-0100');
    setEmpEmail('staff@restoflow.com');
    setEmpWage('16.00');
    setEmpMonthlySalary('');
    setEmpPin('1234');
    setIsEmpModalOpen(true);
  };

  const handleOpenEditEmp = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpName(emp.name);
    setEmpRole(emp.role);
    setEmpPhone(emp.phone);
    setEmpEmail(emp.email);
    setEmpWage(emp.hourlyRate.toString());
    setEmpMonthlySalary(emp.monthlySalary?.toString() || '');
    setEmpPin(emp.pin || '');
    setIsEmpModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) return;

    const wageNum = parseFloat(empWage) || 15.0;

    try { if (editingEmployee) {
      await sqliteService.updateEmployee(
        editingEmployee.id,
        {
          name: empName,
          role: empRole,
          phone: empPhone,
          email: empEmail,
          hourlyRate: wageNum,
          monthlySalary: empMonthlySalary.trim() ? Number(empMonthlySalary) : undefined,
          pin: empPin,
        },
        currentUser
      );
    } else {
      await sqliteService.addEmployee(
        {
          branchId: branch.id,
          name: empName,
          role: empRole,
          phone: empPhone,
          email: empEmail,
          hourlyRate: wageNum,
          monthlySalary: empMonthlySalary.trim() ? Number(empMonthlySalary) : undefined,
          pin: empPin,
          active: true,
          hiredDate: new Date().toISOString().split('T')[0],
        },
        currentUser
      );
    }
    setIsEmpModalOpen(false); refreshData();
    } catch (error) { showActionError(error); }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (window.confirm(`Remove employee "${emp.name}" from store roster?`)) {
      try { await sqliteService.deleteEmployee(emp.id, currentUser); refreshData(); } catch (error) { showActionError(error); }
    }
  };

  const handleClockIn = async (empId: string) => {
    try { await sqliteService.recordClockIn(empId, currentUser); refreshData(); } catch (error) { showActionError(error); }
  };

  const handleClockOut = async (attId: string) => {
    try { await sqliteService.recordClockOut(attId, 0, currentUser); refreshData(); } catch (error) { showActionError(error); }
  };

  const handlePostPayroll = async (event: React.FormEvent) => {
    event.preventDefault();
    const values = Object.fromEntries(Object.entries(deductions).map(([id, value]) => [id, Number(value || 0)]));
    try { await sqliteService.postPayroll(periodStart, periodEnd, payrollMethod, values, currentUser); setIsPayrollModalOpen(false); refreshData(); } catch (error) { showActionError(error); }
  };

  const handleIssueAdvance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!advanceEmployee || Number(advanceAmount) <= 0) return;
    try { await sqliteService.recordPayrollAdvance(advanceEmployee.id, Number(advanceAmount), advanceMethod, advanceNotes, currentUser); setAdvanceEmployee(null); setAdvanceAmount(''); setAdvanceNotes(''); refreshData(); } catch (error) { showActionError(error); }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const money = (amount: number) => formatCurrency(amount, branch.currencySymbol);

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 gap-4 p-4 ${styles.bgApp} overflow-hidden`}>
      {/* Header Bar */}
      <div className={`p-4 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-4 shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-600">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Operating Expenses, Staff Roster & Timecards</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                Finance & HR Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Operating Overheads Vouchers, Staff Timecard Clock-In/Out & Shift Payroll
            </p>
          </div>
        </div>

        {/* Tab Switcher & Actions */}
        <div className="flex items-center gap-2">
          {activeTab === 'expenses' ? (
            <button
              type="button"
              onClick={() => setIsAddExpenseOpen(true)}
              className="px-3.5 py-1.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log New Expense</span>
            </button>
          ) : activeTab === 'employees' ? (
            <button
              type="button"
              onClick={handleOpenAddEmp}
              className="px-3.5 py-1.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Add Employee</span>
            </button>
          ) : activeTab === 'payroll' ? (
            <button type="button" onClick={() => setIsPayrollModalOpen(true)} className="px-3.5 py-1.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer">
              <DollarSign className="w-3.5 h-3.5" />
              <span>Post Current Payroll</span>
            </button>
          ) : null}

          <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('expenses')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'expenses'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 inline mr-1" />
              Expenses Ledger ({expenses.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('payroll')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === 'payroll' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <DollarSign className="w-3.5 h-3.5 inline mr-1" /> Payroll ({payrollRuns.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('attendance')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'attendance'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              Shift Attendance ({attendances.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('employees')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'employees'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 inline mr-1" />
              Employees ({employees.length})
            </button>
          </div>
        </div>
      </div>

      {actionError && <div className="mx-6 mt-4 px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex justify-between gap-3"><span>{actionError}</span><button type="button" onClick={() => setActionError('')} className="font-bold">Dismiss</button></div>}
      {!canManageStaff && !canManageExpenses && <div className="mx-6 mt-4 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs">You are signed in as {currentUser.role.replace('_', ' ')}. Staff and expense posting require a manager, branch administrator, super administrator, or the appropriate configured role permission.</div>}

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`${styles.bgCard} p-4 rounded-2xl border ${styles.borderDefault}`}>
            <span className="text-xs font-medium text-slate-500">Total Operating Expenses</span>
            <div className="text-2xl font-black font-mono text-rose-600 mt-1">{money(totalExpenses)}</div>
            <span className="text-[11px] text-slate-500 mt-1 block">Logged this accounting period</span>
          </div>

          <div className={`${styles.bgCard} p-4 rounded-2xl border ${styles.borderDefault}`}>
            <span className="text-xs font-medium text-slate-500">Staff On Shift Today</span>
            <div className="text-2xl font-black font-mono text-emerald-600 mt-1">
              {attendances.filter((a) => a.status === 'present').length} Clocked In
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Active on floor & kitchen</span>
          </div>

          <div className={`${styles.bgCard} p-4 rounded-2xl border ${styles.borderDefault}`}>
            <span className="text-xs font-medium text-slate-500">Active Employee Roster</span>
            <div className="text-2xl font-black font-mono text-slate-900 mt-1">{employees.length}</div>
            <span className="text-[11px] text-slate-500 mt-1 block">Full-time & part-time crew</span>
          </div>
        </div>

        {/* TAB 1: EXPENSES */}
        {activeTab === 'expenses' && (
          <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.borderDefault} flex items-center justify-between`}>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Operating Expense Vouchers</h3>
                <p className="text-xs text-slate-500">Utilities, petty cash, rent, equipment upkeep & kitchen supplies</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3">Voucher #</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Payee / Vendor</th>
                    <th className="px-4 py-3">Payment Method</th>
                    <th className="px-4 py-3">Notes</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-6 py-3 text-right">Approved By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-6 py-4 font-mono font-bold text-slate-900">{exp.voucherNumber}</td>
                      <td className="px-4 py-4 text-slate-800">
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px]">
                          {exp.categoryName}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-medium text-slate-900">{exp.payee}</td>
                      <td className="px-4 py-4 uppercase text-[11px] font-mono text-slate-500">
                        {exp.paymentMethod.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-4 text-slate-500 text-[11px]">{exp.notes}</td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-sm text-rose-600">
                        {money(exp.amount)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                          {exp.approvedBy}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: SHIFT ATTENDANCE */}
        {activeTab === 'attendance' && (
          <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.borderDefault}`}>
              <h3 className="font-bold text-sm text-slate-900">Today's Staff Clock-In / Clock-Out Logs</h3>
              <p className="text-xs text-slate-500">Track real-time hourly shifts and presence on duty</p>
            </div>

            <div className="divide-y divide-slate-100">
              {attendances.map((att) => (
                <div key={att.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                      {att.employeeName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{att.employeeName}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            att.status === 'present'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {att.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Clocked In: <strong className="text-slate-800 font-mono">{att.clockInTime}</strong>
                        {att.clockOutTime && (
                          <span> • Clocked Out: <strong className="text-slate-800 font-mono">{att.clockOutTime}</strong> ({att.totalHoursWorked} hrs)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    {att.status === 'present' ? (
                      <button
                        type="button"
                        onClick={() => handleClockOut(att.id)}
                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Clock Out Shift</span>
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Completed Shift
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: EMPLOYEES ROSTER */}
        {activeTab === 'employees' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {employees.map((emp) => {
              const isClockedIn = attendances.some((a) => a.employeeId === emp.id && a.status === 'present');
              return (
                <div key={emp.id} className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl p-5 shadow-xs flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-base text-slate-900">{emp.name}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 mt-1 inline-block">
                          {emp.role.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditEmp(emp)}
                          className="p-1 text-slate-500 hover:text-amber-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
                          title="Edit Employee"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEmployee(emp)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                          title="Delete Employee"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span
                          className={`w-2.5 h-2.5 rounded-full ml-1 ${
                            isClockedIn ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-300'
                          }`}
                          title={isClockedIn ? 'Currently on shift' : 'Off shift'}
                        />
                      </div>
                    </div>

                    <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                      <div>Phone: <strong className="text-slate-800">{emp.phone}</strong></div>
                      <div>Hourly rate: <strong className="text-emerald-700 font-mono">{money(emp.hourlyRate)}/hr</strong></div>
                      <div>Monthly salary: <strong className="text-emerald-700 font-mono">{emp.monthlySalary == null ? 'Not configured' : money(emp.monthlySalary)}</strong></div>
                      <div>Terminal PIN: <strong className="font-mono text-slate-700">{emp.pin}</strong></div>
                      <div>Email: <span className="text-slate-500">{emp.email}</span></div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      {isClockedIn ? 'Active on floor' : 'Off duty'}
                    </span>
                    {!isClockedIn && (
                      <div className="flex gap-2"><button
                        type="button"
                        onClick={() => handleClockIn(emp.id)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <LogIn className="w-3 h-3" />
                        <span>Clock In</span>
                      </button><button type="button" onClick={() => setAdvanceEmployee(emp)} className="px-2 py-1 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold">Advance</button></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className={`${styles.bgCard} border ${styles.borderDefault} rounded-2xl overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${styles.borderDefault}`}>
              <h3 className="font-bold text-sm text-slate-900">Posted Payroll Runs</h3>
              <p className="text-xs text-slate-500">Pay is calculated from completed timecards or each employee's configured monthly salary. Open advances are recovered up to net pay.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {payrollRuns.length === 0 ? <div className="p-6 text-xs text-slate-500">No payroll has been posted yet. Posting is an explicit, permission-controlled action.</div> : payrollRuns.map((run) => (
                <div key={run.id} className="p-5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div><div className="font-mono font-bold text-slate-900">{run.payrollNumber}</div><div className="text-slate-500 mt-1">{run.periodStart} to {run.periodEnd} · {run.items.length} staff · {run.paymentMethod.replace('_', ' ')}</div></div>
                  <div className="text-right"><div className="font-mono font-black text-emerald-700 text-sm">Net {money(run.totalNet)}</div><div className="text-slate-500">Gross {money(run.totalGross)} · Deductions {money(run.totalDeductions)}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isPayrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[#E8E3DA] p-6 space-y-4">
            <h3 className="font-bold text-base text-[#18302D]">Review & Post Payroll</h3>
            <form onSubmit={handlePostPayroll} className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3"><label>Period start<input required type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl" /></label><label>Period end<input required type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl" /></label><label>Payment method<select value={payrollMethod} onChange={(e) => setPayrollMethod(e.target.value as 'cash' | 'bank_transfer')} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash drawer</option></select></label></div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {employees.filter((employee) => employee.active).map((employee) => <div key={employee.id} className="p-3 flex items-center justify-between gap-3"><div><div className="font-bold text-slate-800">{employee.name}</div><div className="text-slate-500">{employee.monthlySalary == null ? `${money(employee.hourlyRate)}/hr from completed timecards` : `Monthly salary ${money(employee.monthlySalary)}`}</div></div><label className="text-right">Other deduction / recovery<input min="0" step="0.01" type="number" value={deductions[employee.id] || ''} onChange={(e) => setDeductions((current) => ({ ...current, [employee.id]: e.target.value }))} className="mt-1 w-28 px-2 py-1 border border-slate-300 rounded-lg font-mono" placeholder="0.00" /></label></div>)}
              </div>
              <p className="text-slate-500">Open staff advances are automatically recovered up to each employee's available net pay. This action creates the payroll expense and cannot be repeated for the same period.</p>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setIsPayrollModalOpen(false)} className="px-4 py-2 rounded-xl border border-[#A7D6CC] bg-white text-[#16665A] font-semibold hover:bg-[#E9F4EE]">Cancel</button><button type="submit" className="px-5 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm">Post Payroll</button></div>
            </form>
          </div>
        </div>
      )}

      {advanceEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4"><div className="bg-[#FFFDFC] rounded-2xl shadow-2xl max-w-md w-full border border-[#E8E3DA] p-6"><h3 className="font-bold text-base text-[#18302D]">Issue Staff Advance</h3><p className="text-xs text-slate-500 mt-1">{advanceEmployee.name}; recovery will be applied during payroll.</p><form onSubmit={handleIssueAdvance} className="space-y-3 mt-4 text-xs"><label className="block">Amount ({branch.currency || 'PKR'})<input required min="0.01" step="0.01" type="number" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#CFE3DC] bg-[#FCFBF8] rounded-xl" /></label><label className="block">Method<select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value as 'cash' | 'bank_transfer')} className="mt-1 w-full px-3 py-2 border border-[#CFE3DC] bg-[#FCFBF8] rounded-xl"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash drawer</option></select></label><label className="block">Notes<textarea value={advanceNotes} onChange={(e) => setAdvanceNotes(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#CFE3DC] bg-[#FCFBF8] rounded-xl" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setAdvanceEmployee(null)} className="px-4 py-2 rounded-xl border border-[#A7D6CC] bg-white text-[#16665A] font-semibold hover:bg-[#E9F4EE]">Cancel</button><button type="submit" className="px-5 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm">Issue Advance</button></div></form></div></div>
      )}

      {/* Add Expense Modal */}
      {isAddExpenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#E8E3DA] p-6 space-y-4">
            <h3 className="font-bold text-base text-[#18302D]">Record Operating Expense Voucher</h3>
            <form onSubmit={handleCreateExpense} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Expense Category *</label>
                <select
                  value={expCategoryId}
                  onChange={(e) => setExpCategoryId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                >
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Disbursement Amount ({branch.currency || 'PKR'}) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Payee / Recipient *</label>
                <input
                  type="text"
                  value={expPayee}
                  onChange={(e) => setExpPayee(e.target.value)}
                  placeholder="e.g. City Power & Electric, Local Produce Market"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                <select
                  value={expMethod}
                  onChange={(e) => setExpMethod(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                >
                  <option value="cash">Petty Cash Drawer (Auto-deducts cash float)</option>
                  <option value="bank_transfer">Bank Wire Transfer</option>
                  <option value="card">Company Debit/Credit Card</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Expense Details & Justification</label>
                <textarea
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder="e.g. Monthly refrigeration maintenance and air filter replacement"
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddExpenseOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[#A7D6CC] bg-white text-[#16665A] font-semibold hover:bg-[#E9F4EE]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm cursor-pointer"
                >
                  Post Expense Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {isEmpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#E8E3DA] p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900">
              {editingEmployee ? 'Edit Staff Member' : 'Onboard New Employee'}
            </h3>
            <form onSubmit={handleSaveEmployee} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Full Legal Name *</label>
                <input
                  type="text"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Assigned Role *</label>
                  <select
                    value={empRole}
                    onChange={(e) => setEmpRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800"
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="branch_admin">Branch Admin</option>
                    <option value="manager">Store Manager</option>
                    <option value="cashier">Cashier</option>
                    <option value="waiter">Waiter</option>
                    <option value="kitchen_staff">Kitchen Staff</option>
                    <option value="inventory_officer">Inventory Officer</option>
                    <option value="accountant">Accountant</option>
                    <option value="delivery_rider">Delivery Rider</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Terminal Access PIN {editingEmployee ? '(leave blank to keep current PIN)' : '(4 to 6 digits)'}</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={empPin}
                    onChange={(e) => setEmpPin(e.target.value)}
                    placeholder="1234"
                    required={!editingEmployee}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                    placeholder="+1 555-0100"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Hourly Wage ({branch.currency || 'PKR'})</label>
                  <input
                    type="number"
                    step="0.50"
                    value={empWage}
                    onChange={(e) => setEmpWage(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Monthly Salary ({branch.currency || 'PKR'}, optional)</label>
                <input type="number" min="0" step="0.01" value={empMonthlySalary} onChange={(e) => setEmpMonthlySalary(e.target.value)} placeholder="Leave blank for attendance-based hourly pay" className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900" />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={empEmail}
                  onChange={(e) => setEmpEmail(e.target.value)}
                  placeholder="alex@restoflow.com"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEmpModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[#A7D6CC] bg-white text-[#16665A] font-semibold hover:bg-[#E9F4EE]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm cursor-pointer"
                >
                  {editingEmployee ? 'Save Changes' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
