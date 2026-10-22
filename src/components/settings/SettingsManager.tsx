import React, { useEffect, useState } from 'react';
import {
  Branch,
  User,
  UserRole,
  RolePermissions,
  ReceiptConfig,
  CustomRole,
  HardwarePrinterSettings,
  PaymentMethod,
  PaymentMethodConfig,
  ThemeMode,
} from '../../types/restaurant';
import type { BackupConfiguration, BackupInspectionResult, BackupStatusRecord } from '../../types/desktop';
import { CustomThemeConfig, DEFAULT_CUSTOM_THEME, THEME_PRESETS, useAppTheme } from '../../context/ThemeContext';
import { sqliteService } from '../../services/sqliteStorage';
import { showUserError } from '../../utils/userFeedback';
import {
  Settings,
  Store,
  Printer,
  ShieldCheck,
  Save,
  Download,
  RotateCcw,
  Users,
  Lock,
  CheckCircle,
  KeyRound,
  Plus,
  Edit,
  Trash2,
  X,
  QrCode,
  Eye,
  FileText,
  Sliders,
  Check,
  Building,
  CreditCard,
  Percent,
  Wifi,
  Cpu,
  UtensilsCrossed,
  Volume2,
  RefreshCw,
  Play,
  Send,
  Radio,
  CheckCircle2,
  Sparkles,
  Palette,
} from 'lucide-react';

interface SettingsManagerProps {
  branch: Branch;
  onUpdateBranch: (updatedBranch: Branch) => void | Promise<void>;
  onResetFactory: () => void;
  currentUser: User;
}

const PERMISSION_CONFIG_ITEMS: { key: keyof RolePermissions; label: string; desc: string }[] = [
  { key: 'canAccessPos', label: 'Access POS Terminal', desc: 'Can ring up orders, take customer tickets and collect payments' },
  { key: 'canApplyDiscounts', label: 'Apply Discounts & Promotions', desc: 'Can grant custom % or fixed dollar discount overrides' },
  { key: 'canIssueRefunds', label: 'Issue Refunds & Voids', desc: 'Can void confirmed orders and issue cash or card refunds' },
  { key: 'canManageMenu', label: 'Manage Menu, Dishes & Prices', desc: 'Can add, edit, or remove products, categories, and variations' },
  { key: 'canManageTables', label: 'Manage Floor & Seating Plan', desc: 'Can add tables, remove sections, transfer and seat guests' },
  { key: 'canManageInventory', label: 'Stock, Raw Ingredients & Recipes', desc: 'Can count physical stock, log wastage, and update BOM recipes' },
  { key: 'canManageProcurement', label: 'Vendors, PO & Goods Receiving', desc: 'Can create purchase orders and receive vendor shipments' },
  { key: 'canViewFinancialReports', label: 'Financial Reports & P&L', desc: 'Can view gross profit margins, revenue ledger and register audits' },
  { key: 'canManageStaff', label: 'Staff Roster, PINs & Expenses', desc: 'Can onboard employees, change staff PINs, and log operating expenses' },
  { key: 'canConfigureSettings', label: 'System & Printer Settings', desc: 'Can configure thermal printers, store taxes and security roles' },
];

const SYSTEM_ROLE_CODES = new Set(['super_admin', 'branch_admin', 'manager', 'cashier', 'waiter', 'kitchen_staff', 'inventory_officer', 'accountant', 'delivery_rider']);

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

const mixHex = (first: string, second: string, weight = 0.5) => {
  if (!isHexColor(first) || !isHexColor(second)) return first;
  const a = [1, 3, 5].map((offset) => Number.parseInt(first.slice(offset, offset + 2), 16));
  const b = [1, 3, 5].map((offset) => Number.parseInt(second.slice(offset, offset + 2), 16));
  return `#${a.map((value, index) => Math.round(value * (1 - weight) + b[index] * weight).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

const luminance = (hex: string) => {
  if (!isHexColor(hex)) return 0;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrastRatio = (first: string, second: string) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

const roleCodeFromTitle = (value: string, isNewCustomRole = false) => {
  let code = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!code) return `custom_role_${Date.now().toString(36)}`;
  if (!/^[a-z]/.test(code)) code = `role_${code}`;
  if (code.length < 3) code = `role_${code}`;
  if (isNewCustomRole && SYSTEM_ROLE_CODES.has(code)) code = `custom_${code}`;
  return code.slice(0, 40).replace(/_+$/g, '');
};

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  branch,
  onUpdateBranch,
  onResetFactory,
  currentUser,
}) => {
  const { styles, isDark, theme, setTheme, customTheme, setCustomTheme, resetCustomTheme } = useAppTheme();
  const [activeTab, setActiveTab] = useState<'hardware_printers' | 'printer' | 'payments' | 'roles' | 'store' | 'appearance' | 'backup'>('hardware_printers');
  const [themeDraft, setThemeDraft] = useState<CustomThemeConfig>(customTheme);
  const [themeSavedSuccess, setThemeSavedSuccess] = useState(false);

  useEffect(() => {
    setThemeDraft(customTheme);
  }, [customTheme]);

  // Receipt and kitchen printer state (raw network ESC/POS or Windows system queue).
  const [hardwarePrinters, setHardwarePrinters] = useState<HardwarePrinterSettings>(() =>
    sqliteService.getPrinterSettings()
  );
  const [hardwareSavedSuccess, setHardwareSavedSuccess] = useState(false);
  const [testReceiptFeedback, setTestReceiptFeedback] = useState<string | null>(null);
  const [testKitchenFeedback, setTestKitchenFeedback] = useState<string | null>(null);
  const [systemPrinters, setSystemPrinters] = useState<Array<{ name: string; displayName: string; description: string; isDefault: boolean; status: number }>>([]);
  const [isLoadingSystemPrinters, setIsLoadingSystemPrinters] = useState(false);

  // Single Restaurant Profile State
  const [storeName, setStoreName] = useState(branch.name);
  const [storeCode, setStoreCode] = useState(branch.code);
  const [storeAddress, setStoreAddress] = useState(branch.address);
  const [storePhone, setStorePhone] = useState(branch.phone);
  const [taxRate, setTaxRate] = useState(branch.taxRate.toString());
  const [taxEnabled, setTaxEnabled] = useState(branch.taxEnabled ?? true);
  const [taxName, setTaxName] = useState(branch.taxName || 'Sales Tax');
  const [taxInclusive, setTaxInclusive] = useState(branch.taxInclusive ?? false);
  const [serviceRate, setServiceRate] = useState(branch.serviceChargeRate.toString());
  const [deliveryFee, setDeliveryFee] = useState(branch.deliveryCharge.toString());
  const [currencySymbol, setCurrencySymbol] = useState(branch.currencySymbol);

  // Thermal Receipt Configuration State
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(() =>
    sqliteService.getReceiptConfig()
  );

  // Custom Security Roles State
  const [customRoles, setCustomRoles] = useState<CustomRole[]>(() =>
    sqliteService.getCustomRoles()
  );
  const [selectedRole, setSelectedRole] = useState<CustomRole>(customRoles[0] || {
    id: 'role-super_admin',
    name: 'Super Administrator',
    code: 'super_admin',
    description: 'Full root access',
    color: '#d97706',
    permissions: {
      canAccessPos: true,
      canApplyDiscounts: true,
      canIssueRefunds: true,
      canManageMenu: true,
      canManageTables: true,
      canManageInventory: true,
      canManageProcurement: true,
      canViewFinancialReports: true,
      canManageStaff: true,
      canConfigureSettings: true,
    },
  });

  // Role Add / Edit Modal State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#2563eb');
  const [newRolePermissions, setNewRolePermissions] = useState<RolePermissions>({
    canAccessPos: true,
    canApplyDiscounts: false,
    canIssueRefunds: false,
    canManageMenu: false,
    canManageTables: true,
    canManageInventory: false,
    canManageProcurement: false,
    canViewFinancialReports: false,
    canManageStaff: false,
    canConfigureSettings: false,
  });

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [printerSavedSuccess, setPrinterSavedSuccess] = useState(false);
  const [roleSavedSuccess, setRoleSavedSuccess] = useState(false);

  // Staff Accounts & Security PIN State
  const [staffUsers, setStaffUsers] = useState<User[]>(() => sqliteService.getUsers());
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<UserRole>('cashier');
  const [staffPin, setStaffPin] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<User | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<CustomRole | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>(() => sqliteService.getPaymentMethods());
  const [newPaymentMethodName, setNewPaymentMethodName] = useState('');
  const [paymentMethodsSaved, setPaymentMethodsSaved] = useState(false);
  const [backupConfig, setBackupConfig] = useState<BackupConfiguration | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatusRecord[]>([]);
  const [backupInspection, setBackupInspection] = useState<BackupInspectionResult | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  const handleSaveCustomTheme = () => {
    const values = Object.values(themeDraft);
    if (!values.every((value) => /^#[0-9a-f]{6}$/i.test(value))) {
      setSecurityError('Each custom theme color must use a six-digit hex value, for example #16665A.');
      return;
    }
    setCustomTheme(themeDraft);
    setTheme('custom');
    setThemeSavedSuccess(true);
    setTimeout(() => setThemeSavedSuccess(false), 2500);
  };

  const handleGenerateBalancedTheme = () => {
    if (!isHexColor(themeDraft.primary)) {
      setSecurityError('Choose a valid primary color before generating a balanced theme.');
      return;
    }
    const darkCanvas = luminance(themeDraft.canvas) < 0.26;
    setThemeDraft((current) => ({
      ...current,
      primaryHover: mixHex(current.primary, '#000000', 0.18),
      surface: darkCanvas ? mixHex(current.canvas, '#FFFFFF', 0.08) : mixHex(current.canvas, '#FFFFFF', 0.5),
      text: darkCanvas ? '#F4F7F6' : '#18302D',
      mutedText: darkCanvas ? '#BDD0CB' : mixHex('#18302D', current.canvas, 0.48),
      border: darkCanvas ? mixHex(current.canvas, '#FFFFFF', 0.18) : mixHex(current.canvas, current.primary, 0.14),
    }));
  };

  const refreshBackupStatus = async () => {
    const desktop = window.restoFlowDesktop;
    if (!desktop) return;
    const [config, status] = await Promise.all([desktop.backup.getConfig(), desktop.backup.getStatus()]);
    setBackupConfig(config);
    setBackupStatus(status);
  };

  useEffect(() => {
    void refreshBackupStatus().catch((error: unknown) => {
      setBackupMessage(showUserError(error, 'Backup status could not be loaded. Please try again.'));
    });
  }, []);

  // Save Store Profile
  const handleSaveStoreProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: Branch = {
      ...branch,
      name: storeName,
      code: storeCode,
      address: storeAddress,
      phone: storePhone,
      taxRate: parseFloat(taxRate) || 0,
      taxEnabled,
      taxName: taxName.trim() || 'Sales Tax',
      taxInclusive,
      serviceChargeRate: parseFloat(serviceRate) || 0,
      deliveryCharge: parseFloat(deliveryFee) || 0,
      currencySymbol,
    };
    try {
      await onUpdateBranch(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (error) { setSecurityError(error instanceof Error ? error.message : 'Could not save store settings.'); }
  };

  // Save Receipt Configuration
  const handleSaveReceiptConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saved = await sqliteService.updateReceiptConfig(receiptConfig, currentUser);
      setReceiptConfig(saved); setPrinterSavedSuccess(true);
      setTimeout(() => setPrinterSavedSuccess(false), 3000);
    } catch (error) { setSecurityError(error instanceof Error ? error.message : 'Could not save receipt settings.'); }
  };

  const handleTestPrintReceipt = () => {
    window.print();
  };

  // Save printer settings
  const handleSaveHardwarePrinters = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const saved = await sqliteService.updatePrinterSettings(hardwarePrinters, currentUser);
      setHardwarePrinters(saved); setHardwareSavedSuccess(true);
      setTimeout(() => setHardwareSavedSuccess(false), 3000);
    } catch (error) { setSecurityError(error instanceof Error ? error.message : 'Could not save printer settings.'); }
  };

  const handleTestPrintReceiptPrinter = async () => {
    if (window.restoFlowDesktop) {
      try {
        const result = await window.restoFlowDesktop.printer.test(hardwarePrinters.receiptPrinter);
        setTestReceiptFeedback(`✓ ${result.message}`);
      } catch (error) {
        setTestReceiptFeedback(`Printer test failed: ${showUserError(error, 'Check the receipt printer connection and try again.')}`);
      }
      return;
    }
    setTestReceiptFeedback('Printer tests require the RestoFlow desktop application.');
  };

  const handleTestPrintKitchenPrinter = async () => {
    if (window.restoFlowDesktop) {
      try {
        const result = await window.restoFlowDesktop.printer.test(hardwarePrinters.kitchenPrinter);
        setTestKitchenFeedback(`✓ ${result.message}`);
      } catch (error) {
        setTestKitchenFeedback(`Printer test failed: ${showUserError(error, 'Check the kitchen printer connection and try again.')}`);
      }
      return;
    }
    setTestKitchenFeedback('Printer tests require the RestoFlow desktop application.');
  };

  const loadSystemPrinters = async () => {
    if (!window.restoFlowDesktop) {
      setSecurityError('Installed Windows printers can only be listed from the desktop application.');
      return;
    }
    setIsLoadingSystemPrinters(true);
    try {
      setSystemPrinters(await window.restoFlowDesktop.printer.listSystem());
    } catch (error) {
      setSecurityError(showUserError(error, 'Installed Windows printers could not be listed. Please try again.'));
    } finally {
      setIsLoadingSystemPrinters(false);
    }
  };

  // Role Management
  const handleTogglePermission = async (permKey: keyof RolePermissions) => {
    const updatedPermissions = {
      ...selectedRole.permissions,
      [permKey]: !selectedRole.permissions[permKey],
    };
    const updatedRole = {
      ...selectedRole,
      permissions: updatedPermissions,
    };
    try {
      const saved = await sqliteService.updateCustomRole(selectedRole.id, { permissions: updatedPermissions }, currentUser);
      setSelectedRole(saved);
      setCustomRoles(sqliteService.getCustomRoles());
      setRoleSavedSuccess(true);
      setTimeout(() => setRoleSavedSuccess(false), 2000);
    } catch (error) { setSecurityError(error instanceof Error ? error.message : 'Could not update role permissions.'); }
  };

  const handleOpenAddRole = () => {
    setEditingRole(null);
    setNewRoleName('');
    setNewRoleCode('');
    setNewRoleDesc('Operational security permissions');
    setNewRoleColor('#059669');
    setNewRolePermissions({
      canAccessPos: true,
      canApplyDiscounts: false,
      canIssueRefunds: false,
      canManageMenu: false,
      canManageTables: true,
      canManageInventory: false,
      canManageProcurement: false,
      canViewFinancialReports: false,
      canManageStaff: false,
      canConfigureSettings: false,
    });
    setIsRoleModalOpen(true);
  };

  const handleOpenEditRole = (role: CustomRole) => {
    setEditingRole(role);
    setNewRoleName(role.name);
    setNewRoleCode(role.code);
    setNewRoleDesc(role.description);
    setNewRoleColor(role.color);
    setNewRolePermissions({ ...role.permissions });
    setIsRoleModalOpen(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    const roleCode = roleCodeFromTitle(newRoleCode || newRoleName, !editingRole);
    try {
      if (editingRole) {
        const updated = await sqliteService.updateCustomRole(editingRole.id, { name: newRoleName, code: roleCode, description: newRoleDesc, color: newRoleColor, permissions: newRolePermissions }, currentUser);
        setCustomRoles(sqliteService.getCustomRoles()); setSelectedRole(updated);
      } else {
        const created = await sqliteService.addCustomRole({ name: newRoleName, code: roleCode, description: newRoleDesc, color: newRoleColor, permissions: newRolePermissions }, currentUser);
        setCustomRoles(sqliteService.getCustomRoles()); setSelectedRole(created);
      }
      setIsRoleModalOpen(false);
    } catch (error) { setSecurityError(error instanceof Error ? error.message : 'Could not save the custom role.'); }
  };

  const handleConfirmDeleteRole = async () => {
    if (!roleToDelete || customRoles.length <= 1) return;
    try {
      await sqliteService.deleteCustomRole(roleToDelete.id, currentUser);
      const remaining = sqliteService.getCustomRoles();
      setCustomRoles(remaining);
      setSelectedRole(remaining[0]);
      setRoleToDelete(null);
    } catch (error) { setSecurityError(error instanceof Error ? error.message : 'Could not delete the custom role.'); }
  };

  // Staff Account & PIN Handlers
  const handleOpenAddStaff = () => {
    setEditingStaff(null);
    setStaffName('');
    setStaffRole('cashier');
    setStaffPin(Math.floor(1000 + Math.random() * 9000).toString());
    setStaffEmail('');
    setIsStaffModalOpen(true);
  };

  const handleOpenEditStaff = (u: User) => {
    setEditingStaff(u);
    setStaffName(u.name);
    setStaffRole(u.role);
    setStaffPin(u.pin || '');
    setStaffEmail(u.email);
    setIsStaffModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || (!editingStaff && !staffPin.trim())) return;

    try {
      if (editingStaff) await sqliteService.updateUser(editingStaff.id, { name: staffName.trim(), role: staffRole, ...(staffPin.trim() ? { pin: staffPin.trim() } : {}), email: staffEmail.trim() || `${staffName.toLowerCase().replace(/\s+/g, '.')}@restoflow.internal` }, currentUser);
      else await sqliteService.addUser({ name: staffName.trim(), role: staffRole, pin: staffPin.trim(), email: staffEmail.trim() || `${staffName.toLowerCase().replace(/\s+/g, '.')}@restoflow.internal`, branchId: branch.id }, currentUser);
      setStaffUsers(sqliteService.getUsers());
      setIsStaffModalOpen(false);
    } catch (error) { setSecurityError(error instanceof Error ? error.message : 'Could not save the user account.'); }
  };

  const handleConfirmDeleteStaff = async () => {
    if (!staffToDelete || staffUsers.length <= 1) return;
    try {
      await sqliteService.deleteUser(staffToDelete.id, currentUser);
      setStaffUsers(sqliteService.getUsers());
      setStaffToDelete(null);
    } catch (error) { setSecurityError(error instanceof Error ? error.message : 'Could not delete the user account.'); }
  };

  const handleSavePaymentMethods = async () => {
    try {
      const saved = await sqliteService.updatePaymentMethods(paymentMethods, currentUser);
      setPaymentMethods(saved);
      setPaymentMethodsSaved(true);
      setTimeout(() => setPaymentMethodsSaved(false), 2500);
    } catch (error) {
      showUserError(error, 'Payment methods could not be saved. Please review the configuration and try again.');
    }
  };

  const handleAddCustomPaymentMethod = () => {
    const name = newPaymentMethodName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = `custom:${slug}` as PaymentMethod;
    if (!slug || paymentMethods.some((method) => method.id === id)) return;
    setPaymentMethods((methods) => [...methods, {
      id, name, enabled: true, requiresReference: false, settlementGroup: 'custom', displayOrder: methods.length + 1,
    }]);
    setNewPaymentMethodName('');
  };

  // Browser-only legacy JSON export. Desktop uses an integrity-checked SQLite snapshot instead.
  const exportLegacyJsonBackup = () => {
    const backup = {
      version: '2.0',
      system: 'RestoFlow Production POS & ERP',
      timestamp: new Date().toISOString(),
      restaurant: branch,
      receiptConfig,
      customRoles,
      products: sqliteService.getProducts(),
      categories: sqliteService.getCategories(),
      tables: sqliteService.getTables(branch.id),
      orders: sqliteService.getOrders(branch.id),
      ingredients: sqliteService.getIngredients(branch.id),
      recipes: sqliteService.getRecipes(),
      vendors: sqliteService.getVendors(),
      customers: sqliteService.getCustomers(),
      employees: sqliteService.getEmployees(branch.id),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restoflow_backup_${Date.now()}.json`;
    a.click();
  };

  const handleSaveBackupConfig = async () => {
    if (!backupConfig || !window.restoFlowDesktop) return;
    setIsBackupBusy(true);
    setBackupMessage(null);
    try {
      const saved = await window.restoFlowDesktop.backup.saveConfig(backupConfig);
      setBackupConfig(saved);
      setBackupMessage('Automatic backup settings saved.');
    } catch (error) {
      setBackupMessage(showUserError(error, 'Backup settings could not be saved. Check the folder settings and try again.'));
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleRunBackupNow = async () => {
    if (!window.restoFlowDesktop) return;
    setIsBackupBusy(true);
    setBackupMessage(null);
    try {
      const results = await window.restoFlowDesktop.backup.runNow();
      const successful = results.filter((result) => result.status === 'success').length;
      setBackupMessage(`${successful}/${results.length} backup destination(s) completed successfully.`);
      await refreshBackupStatus();
    } catch (error) {
      setBackupMessage(showUserError(error, 'The backup could not be completed. Check the selected drive and available space, then try again.'));
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleExportBackup = async () => {
    if (!window.restoFlowDesktop) {
      exportLegacyJsonBackup();
      return;
    }
    setIsBackupBusy(true);
    setBackupMessage(null);
    try {
      const result = await window.restoFlowDesktop.backup.export();
      if (!result.canceled) setBackupMessage(result.status === 'success' ? `Backup exported to ${result.filePath}.` : showUserError(new Error(result.errorMessage || ''), 'The backup export could not be completed. Choose another location and try again.'));
      await refreshBackupStatus();
    } catch (error) {
      setBackupMessage(showUserError(error, 'The backup export could not be completed. Choose another location and try again.'));
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleInspectBackup = async () => {
    if (!window.restoFlowDesktop) return;
    setIsBackupBusy(true);
    setBackupMessage(null);
    setBackupInspection(null);
    try {
      const result = await window.restoFlowDesktop.backup.inspect();
      if (!result.canceled) {
        setBackupInspection(result);
        setBackupMessage(result.verified ? 'Backup verified successfully. You can now choose it again in Restore Backup when ready.' : showUserError(new Error(result.errorMessage || ''), 'The selected backup could not be verified. Choose a valid backup file and try again.'));
      }
      await refreshBackupStatus();
    } catch (error) {
      setBackupMessage(showUserError(error, 'The selected backup could not be verified. Choose a valid backup file and try again.'));
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!window.restoFlowDesktop) return;
    if (!window.confirm('Restore replaces the current database. A validated backup will be created first. Continue?')) return;
    setIsBackupBusy(true);
    setBackupMessage(null);
    try {
      const result = await window.restoFlowDesktop.backup.restore();
      if (result.restored) window.location.reload();
    } catch (error) {
      setBackupMessage(showUserError(error, 'Restore could not be completed. Your active database was kept unchanged.'));
    } finally {
      setIsBackupBusy(false);
    }
  };

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 gap-4 p-4 ${styles.bgApp} overflow-hidden`}>
      {/* Header Bar */}
      <div className={`p-4 rounded-2xl ${styles.bgSurface} border ${styles.borderDefault} flex flex-wrap items-center justify-between gap-4 shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#E9F4EE] border border-[#A7D6CC] text-[#16665A]">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              System Settings & Thermal Printer Configuration
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Receipt Template Engine, Security Roles Access Control & Store Profile
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 bg-[#F4F8F5] border border-[#E8E3DA] p-1 rounded-xl flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('hardware_printers')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'hardware_printers' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-[#16665A]'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Printer Hardware</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('printer')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'printer' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-[#16665A]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Receipt Template</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('roles')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'roles' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-[#16665A]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Roles & Permissions</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'payments' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-[#16665A]'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
            <span>Payment Methods</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('store')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'store' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-[#16665A]'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Store Profile & Tax</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'appearance' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-[#16665A]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Appearance</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'backup' ? 'bg-[#16665A] text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-[#16665A]'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Data Backup</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 p-6 overflow-y-auto">
        {securityError && <div role="alert" className="mb-4 px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex justify-between gap-3"><span>{securityError}</span><button type="button" onClick={() => setSecurityError(null)} className="font-bold">Dismiss</button></div>}
        {/* TAB 0: HARDWARE & NETWORK PRINTERS (RECEIPT & KITCHEN IP & PAPER SIZES) */}
        {activeTab === 'hardware_printers' && (
          <div className="space-y-6">
            {/* Success Toast */}
            {hardwareSavedSuccess && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-2.5">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <span>Printer settings successfully saved to system!</span>
                </div>
                <span className="font-mono text-[11px] text-emerald-500">Connection saved</span>
              </div>
            )}

            {/* Top Command Banner */}
            <div className={`p-5 rounded-3xl ${styles.bgSurface} border ${styles.borderDefault} shadow-xs flex flex-wrap items-center justify-between gap-4`}>
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-[#E9F4EE] text-[#16665A] border border-[#A7D6CC]">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>Receipt & Kitchen Printer Configuration</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Use a raw Network ESC/POS printer (static IPv4 / port 9100) or an installed Windows USB/system printer. Both 80mm and 58mm rolls are supported.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void loadSystemPrinters()}
                  disabled={isLoadingSystemPrinters}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 cursor-pointer ${
                    isLoadingSystemPrinters
                      ? 'bg-[#E9F4EE] text-slate-400 border-[#CFE3DC]'
                      : 'bg-white hover:bg-[#E9F4EE] text-[#16665A] border-[#A7D6CC]'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSystemPrinters ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
                  <span>{isLoadingSystemPrinters ? 'Loading Printers...' : 'Refresh Windows Printers'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveHardwarePrinters()}
                  className="px-5 py-2.5 bg-[#16665A] hover:bg-[#115448] text-white font-black text-xs rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4 stroke-[2.5]" />
                  <span>Save Printer Settings</span>
                </button>
              </div>
            </div>

            {/* TWO PRIMARY HARDWARE PRINTER CARDS (RECEIPT & KITCHEN) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* CARD 1: RECEIPT PRINTER (CASHIER / COUNTER) */}
              <div className={`p-6 rounded-3xl ${styles.bgSurface} border ${styles.borderDefault} shadow-xs space-y-5 flex flex-col justify-between`}>
                <div className="space-y-5">
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-700/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/30">
                        <Printer className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <div>
                        <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          Receipt Thermal Printer
                        </h4>
                        <span className="text-[11px] text-slate-400">Front counter cashier billing station</span>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {hardwarePrinters.receiptPrinter.connectionType === 'usb' ? 'Windows queue' : 'Network ESC/POS'}
                    </span>
                  </div>

                  {/* Device Name */}
                  <div>
                    <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>
                      Printer Device Name / Model
                    </label>
                    <input
                      type="text"
                      value={hardwarePrinters.receiptPrinter.name}
                      onChange={(e) =>
                        setHardwarePrinters({
                          ...hardwarePrinters,
                          receiptPrinter: {
                            ...hardwarePrinters.receiptPrinter,
                            name: e.target.value,
                          },
                        })
                      }
                      className={`w-full px-3.5 py-2 text-xs font-medium rounded-xl border ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      } focus:outline-none focus:border-amber-500`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Connection Type</label>
                    <select value={hardwarePrinters.receiptPrinter.connectionType} onChange={(e) => setHardwarePrinters({ ...hardwarePrinters, receiptPrinter: { ...hardwarePrinters.receiptPrinter, connectionType: e.target.value as 'network_ip' | 'usb' } })} className={`w-full px-3 py-2 text-xs font-bold rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} focus:outline-none focus:border-amber-500`}>
                      <option value="network_ip">Network ESC/POS (raw TCP)</option>
                      <option value="usb">Windows USB / system printer</option>
                    </select>
                  </div>

                  {/* IP Address and Port Inputs */}
                  <div className={hardwarePrinters.receiptPrinter.connectionType === 'network_ip' ? 'grid grid-cols-1 sm:grid-cols-3 gap-3' : 'hidden'}>
                    <div className="sm:col-span-2">
                      <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1.5 flex items-center justify-between`}>
                        <span>IP Address (LAN / Wi-Fi) *</span>
                        <span className="text-[10px] text-amber-500 font-mono">IPv4</span>
                      </label>
                      <div className="relative">
                        <Wifi className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          required
                          value={hardwarePrinters.receiptPrinter.ipAddress}
                          onChange={(e) =>
                            setHardwarePrinters({
                              ...hardwarePrinters,
                              receiptPrinter: {
                                ...hardwarePrinters.receiptPrinter,
                                ipAddress: e.target.value,
                              },
                            })
                          }
                          placeholder="192.168.1.100"
                          className={`w-full pl-9 pr-3 py-2 text-xs font-mono font-bold rounded-xl border ${
                            isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                          } focus:outline-none focus:border-amber-500`}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] text-slate-500">Presets:</span>
                        {['192.168.1.100', '192.168.0.100', '10.0.0.50'].map((ip) => (
                          <button
                            key={ip}
                            type="button"
                            onClick={() =>
                              setHardwarePrinters({
                                ...hardwarePrinters,
                                receiptPrinter: {
                                  ...hardwarePrinters.receiptPrinter,
                                  ipAddress: ip,
                                },
                              })
                            }
                            className="text-[10px] font-mono text-slate-400 hover:text-amber-500 underline cursor-pointer"
                          >
                            {ip}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>
                        Socket Port
                      </label>
                      <input
                        type="number"
                        value={hardwarePrinters.receiptPrinter.port}
                        onChange={(e) =>
                          setHardwarePrinters({
                            ...hardwarePrinters,
                            receiptPrinter: {
                              ...hardwarePrinters.receiptPrinter,
                              port: Number(e.target.value) || 9100,
                            },
                          })
                        }
                        className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        } focus:outline-none focus:border-amber-500`}
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">Default 9100</span>
                    </div>
                  </div>

                  <div className={hardwarePrinters.receiptPrinter.connectionType === 'usb' ? '' : 'hidden'}>
                    <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Installed Windows Printer *</label>
                    <select value={hardwarePrinters.receiptPrinter.systemPrinterName || ''} onChange={(e) => setHardwarePrinters({ ...hardwarePrinters, receiptPrinter: { ...hardwarePrinters.receiptPrinter, systemPrinterName: e.target.value } })} className={`w-full px-3 py-2 text-xs font-medium rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} focus:outline-none focus:border-amber-500`}>
                      <option value="">Select a Windows printer</option>
                      {hardwarePrinters.receiptPrinter.systemPrinterName && !systemPrinters.some((printer) => printer.name === hardwarePrinters.receiptPrinter.systemPrinterName) && <option value={hardwarePrinters.receiptPrinter.systemPrinterName}>{hardwarePrinters.receiptPrinter.systemPrinterName} (not currently listed)</option>}
                      {systemPrinters.map((printer) => <option key={printer.name} value={printer.name}>{printer.displayName}{printer.isDefault ? ' (default)' : ''}</option>)}
                    </select>
                    <p className="mt-1 text-[10px] text-slate-500">Use “Refresh Windows Printers” after installing or connecting a USB printer. Windows controls the driver, cutter, and drawer capabilities.</p>
                  </div>

                  {/* PAPER SIZE SELECTOR (80mm vs 58mm) */}
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                      Receipt Paper Roll Width:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* 80mm */}
                      <button
                        type="button"
                        onClick={() =>
                          setHardwarePrinters({
                            ...hardwarePrinters,
                            receiptPrinter: {
                              ...hardwarePrinters.receiptPrinter,
                              paperSize: '80mm',
                            },
                          })
                        }
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          hardwarePrinters.receiptPrinter.paperSize === '80mm'
                            ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/40 text-amber-500'
                            : `${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm">80mm Width</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            STANDARD
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          3 1/8" Thermal roll • 48 columns • Full item descriptions
                        </p>
                      </button>

                      {/* 58mm */}
                      <button
                        type="button"
                        onClick={() =>
                          setHardwarePrinters({
                            ...hardwarePrinters,
                            receiptPrinter: {
                              ...hardwarePrinters.receiptPrinter,
                              paperSize: '58mm',
                            },
                          })
                        }
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          hardwarePrinters.receiptPrinter.paperSize === '58mm'
                            ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/40 text-amber-500'
                            : `${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm">58mm Width</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                            COMPACT
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          2 1/4" Compact roll • 32 columns • Space saving
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Hardware Toggles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-700/40 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hardwarePrinters.receiptPrinter.cutPaper}
                        onChange={(e) =>
                          setHardwarePrinters({
                            ...hardwarePrinters,
                            receiptPrinter: {
                              ...hardwarePrinters.receiptPrinter,
                              cutPaper: e.target.checked,
                            },
                          })
                        }
                        className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4"
                      />
                      <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Auto-cut receipt after printing</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hardwarePrinters.receiptPrinter.autoPrintOnOrder}
                        onChange={(e) =>
                          setHardwarePrinters({
                            ...hardwarePrinters,
                            receiptPrinter: {
                              ...hardwarePrinters.receiptPrinter,
                              autoPrintOnOrder: e.target.checked,
                            },
                          })
                        }
                        className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4"
                      />
                      <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Enable receipt printer</span>
                    </label>
                  </div>
                </div>

                {/* Test Print Connection Action */}
                <div className="pt-4 border-t border-slate-700/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {hardwarePrinters.receiptPrinter.connectionType === 'usb' ? `Print a Windows-driver test to ${hardwarePrinters.receiptPrinter.systemPrinterName || 'the selected printer'}` : `Send raw ESC/POS test packet to ${hardwarePrinters.receiptPrinter.ipAddress}:${hardwarePrinters.receiptPrinter.port}`}
                    </span>
                    <button
                      type="button"
                      onClick={handleTestPrintReceiptPrinter}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Test Receipt Print</span>
                    </button>
                  </div>

                  {testReceiptFeedback && (
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-mono animate-in fade-in">
                      {testReceiptFeedback}
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 2: KITCHEN PRINTER (KOT / IMPACT / BACK OF HOUSE) */}
              <div className={`p-6 rounded-3xl ${styles.bgSurface} border ${styles.borderDefault} shadow-xs space-y-5 flex flex-col justify-between`}>
                <div className="space-y-5">
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-700/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        <UtensilsCrossed className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <div>
                        <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          Kitchen KOT Ticket Printer
                        </h4>
                        <span className="text-[11px] text-slate-400">Back of house cook station & expeditor</span>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      {hardwarePrinters.kitchenPrinter.connectionType === 'usb' ? 'Windows queue' : 'Network ESC/POS'}
                    </span>
                  </div>

                  {/* Device Name */}
                  <div>
                    <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>
                      Kitchen Printer Device Name / Model
                    </label>
                    <input
                      type="text"
                      value={hardwarePrinters.kitchenPrinter.name}
                      onChange={(e) =>
                        setHardwarePrinters({
                          ...hardwarePrinters,
                          kitchenPrinter: {
                            ...hardwarePrinters.kitchenPrinter,
                            name: e.target.value,
                          },
                        })
                      }
                      className={`w-full px-3.5 py-2 text-xs font-medium rounded-xl border ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      } focus:outline-none focus:border-amber-500`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Connection Type</label>
                    <select value={hardwarePrinters.kitchenPrinter.connectionType} onChange={(e) => setHardwarePrinters({ ...hardwarePrinters, kitchenPrinter: { ...hardwarePrinters.kitchenPrinter, connectionType: e.target.value as 'network_ip' | 'usb' } })} className={`w-full px-3 py-2 text-xs font-bold rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} focus:outline-none focus:border-amber-500`}>
                      <option value="network_ip">Network ESC/POS (raw TCP)</option>
                      <option value="usb">Windows USB / system printer</option>
                    </select>
                  </div>

                  {/* IP Address and Port Inputs */}
                  <div className={hardwarePrinters.kitchenPrinter.connectionType === 'network_ip' ? 'grid grid-cols-1 sm:grid-cols-3 gap-3' : 'hidden'}>
                    <div className="sm:col-span-2">
                      <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1.5 flex items-center justify-between`}>
                        <span>Kitchen IP Address (LAN / Wi-Fi) *</span>
                        <span className="text-[10px] text-amber-500 font-mono">IPv4</span>
                      </label>
                      <div className="relative">
                        <Wifi className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          required
                          value={hardwarePrinters.kitchenPrinter.ipAddress}
                          onChange={(e) =>
                            setHardwarePrinters({
                              ...hardwarePrinters,
                              kitchenPrinter: {
                                ...hardwarePrinters.kitchenPrinter,
                                ipAddress: e.target.value,
                              },
                            })
                          }
                          placeholder="192.168.1.101"
                          className={`w-full pl-9 pr-3 py-2 text-xs font-mono font-bold rounded-xl border ${
                            isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                          } focus:outline-none focus:border-amber-500`}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] text-slate-500">Presets:</span>
                        {['192.168.1.101', '192.168.0.101', '10.0.0.51'].map((ip) => (
                          <button
                            key={ip}
                            type="button"
                            onClick={() =>
                              setHardwarePrinters({
                                ...hardwarePrinters,
                                kitchenPrinter: {
                                  ...hardwarePrinters.kitchenPrinter,
                                  ipAddress: ip,
                                },
                              })
                            }
                            className="text-[10px] font-mono text-slate-400 hover:text-amber-500 underline cursor-pointer"
                          >
                            {ip}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>
                        Socket Port
                      </label>
                      <input
                        type="number"
                        value={hardwarePrinters.kitchenPrinter.port}
                        onChange={(e) =>
                          setHardwarePrinters({
                            ...hardwarePrinters,
                            kitchenPrinter: {
                              ...hardwarePrinters.kitchenPrinter,
                              port: Number(e.target.value) || 9100,
                            },
                          })
                        }
                        className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        } focus:outline-none focus:border-amber-500`}
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">Default 9100</span>
                    </div>
                  </div>

                  <div className={hardwarePrinters.kitchenPrinter.connectionType === 'usb' ? '' : 'hidden'}>
                    <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1.5`}>Installed Windows Printer *</label>
                    <select value={hardwarePrinters.kitchenPrinter.systemPrinterName || ''} onChange={(e) => setHardwarePrinters({ ...hardwarePrinters, kitchenPrinter: { ...hardwarePrinters.kitchenPrinter, systemPrinterName: e.target.value } })} className={`w-full px-3 py-2 text-xs font-medium rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} focus:outline-none focus:border-amber-500`}>
                      <option value="">Select a Windows printer</option>
                      {hardwarePrinters.kitchenPrinter.systemPrinterName && !systemPrinters.some((printer) => printer.name === hardwarePrinters.kitchenPrinter.systemPrinterName) && <option value={hardwarePrinters.kitchenPrinter.systemPrinterName}>{hardwarePrinters.kitchenPrinter.systemPrinterName} (not currently listed)</option>}
                      {systemPrinters.map((printer) => <option key={printer.name} value={printer.name}>{printer.displayName}{printer.isDefault ? ' (default)' : ''}</option>)}
                    </select>
                    <p className="mt-1 text-[10px] text-slate-500">Windows prints through the selected queue. Raw ESC/POS cutter, buzzer, and drawer pulse commands are unavailable for this connection type.</p>
                  </div>

                  {/* PAPER SIZE SELECTOR (80mm vs 58mm) */}
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                      Kitchen KOT Paper Roll Width:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* 80mm */}
                      <button
                        type="button"
                        onClick={() =>
                          setHardwarePrinters({
                            ...hardwarePrinters,
                            kitchenPrinter: {
                              ...hardwarePrinters.kitchenPrinter,
                              paperSize: '80mm',
                            },
                          })
                        }
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          hardwarePrinters.kitchenPrinter.paperSize === '80mm'
                            ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/40 text-amber-500'
                            : `${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm">80mm Width</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            STANDARD
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          3 1/8" Kitchen paper • Large bold fonts for line cooks
                        </p>
                      </button>

                      {/* 58mm */}
                      <button
                        type="button"
                        onClick={() =>
                          setHardwarePrinters({
                            ...hardwarePrinters,
                            kitchenPrinter: {
                              ...hardwarePrinters.kitchenPrinter,
                              paperSize: '58mm',
                            },
                          })
                        }
                        className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          hardwarePrinters.kitchenPrinter.paperSize === '58mm'
                            ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/40 text-amber-500'
                            : `${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm">58mm Width</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                            COMPACT
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          2 1/4" Compact paper • Bar / Drink station ticket
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Station Routing & Audible Buzzer */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-700/40 text-xs">
                    <div>
                      <label className={`block text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
                        Station Routing Filter
                      </label>
                      <select
                        value={hardwarePrinters.kitchenPrinter.kitchenStationFilter || 'all'}
                        onChange={(e) =>
                          setHardwarePrinters({
                            ...hardwarePrinters,
                            kitchenPrinter: {
                              ...hardwarePrinters.kitchenPrinter,
                              kitchenStationFilter: e.target.value as any,
                            },
                          })
                        }
                        className={`w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        } focus:outline-none focus:border-amber-500`}
                      >
                        <option value="all">All Stations (Universal KOT)</option>
                        <option value="grill">Grill Station</option>
                        <option value="pizza">Pizza & Oven Station</option>
                        <option value="drinks">Bar & Drinks Station</option>
                      </select>
                    </div>

                    <div className="space-y-2 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hardwarePrinters.kitchenPrinter.beepOnPrint !== false}
                          onChange={(e) =>
                            setHardwarePrinters({
                              ...hardwarePrinters,
                              kitchenPrinter: {
                                ...hardwarePrinters.kitchenPrinter,
                                beepOnPrint: e.target.checked,
                              },
                            })
                          }
                          className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4"
                        />
                        <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Chime buzzer on new order</span>
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hardwarePrinters.kitchenPrinter.cutPaper}
                          onChange={(e) =>
                            setHardwarePrinters({
                              ...hardwarePrinters,
                              kitchenPrinter: {
                                ...hardwarePrinters.kitchenPrinter,
                                cutPaper: e.target.checked,
                              },
                            })
                          }
                          className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4"
                        />
                        <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Auto-cut kitchen ticket</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Test Print Connection Action */}
                <div className="pt-4 border-t border-slate-700/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {hardwarePrinters.kitchenPrinter.connectionType === 'usb' ? `Print a Windows-driver test to ${hardwarePrinters.kitchenPrinter.systemPrinterName || 'the selected printer'}` : `Send raw KOT test packet to ${hardwarePrinters.kitchenPrinter.ipAddress}:${hardwarePrinters.kitchenPrinter.port}`}
                    </span>
                    <button
                      type="button"
                      onClick={handleTestPrintKitchenPrinter}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Test Kitchen Print</span>
                    </button>
                  </div>

                  {testKitchenFeedback && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono animate-in fade-in">
                      {testKitchenFeedback}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ORDER CONFIRMATION PRINTING WORKFLOW CARD */}
            <div className={`p-6 rounded-3xl ${styles.bgSurface} border ${styles.borderDefault} shadow-xs space-y-4`}>
              <div className="flex items-center gap-2 pb-2 border-b border-slate-700/40">
                <Sliders className="w-4 h-4 text-amber-500" />
                <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Order Confirmation Printing Workflow & Dispatch Behavior
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {[
                  {
                    id: 'prompt_choice' as const,
                    title: 'Prompt Choice Dialog',
                    badge: 'RECOMMENDED',
                    desc: 'Shows modal on order confirm with buttons to Print Both, Receipt Only, or Kitchen KOT Only.',
                  },
                  {
                    id: 'always_both' as const,
                    title: 'Always Print Both',
                    badge: 'HIGH VOLUME',
                    desc: 'Instantly fires both Receipt to counter IP and Kitchen KOT to kitchen IP simultaneously.',
                  },
                  {
                    id: 'receipt_only' as const,
                    title: 'Receipt Only by Default',
                    badge: 'COUNTER',
                    desc: 'Dispatches only customer receipt unless kitchen print is explicitly selected.',
                  },
                  {
                    id: 'kitchen_only' as const,
                    title: 'Kitchen KOT by Default',
                    badge: 'EXPEDITE',
                    desc: 'Dispatches only kitchen prep ticket (Receipt printed only when requested by guest).',
                  },
                ].map((opt) => {
                  const isSelected = hardwarePrinters.printOptionsOnOrder === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setHardwarePrinters({
                          ...hardwarePrinters,
                          printOptionsOnOrder: opt.id,
                        })
                      }
                      className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/40 text-amber-500'
                          : `${isDark ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-900' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`font-bold text-xs ${isSelected ? 'text-amber-400' : isDark ? 'text-white' : 'text-slate-900'}`}>
                            {opt.title}
                          </span>
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${isSelected ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                            {opt.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{opt.desc}</p>
                      </div>

                      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold">
                        {isSelected ? (
                          <span className="text-amber-500 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Selected
                          </span>
                        ) : (
                          <span className="text-slate-500">Tap to select</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* LIVE PAPER ROLL WIDTH COMPARISON (80mm vs 58mm) */}
            <div className={`p-6 rounded-3xl ${styles.bgSurface} border ${styles.borderDefault} shadow-xs space-y-4`}>
              <div className="flex items-center justify-between pb-2 border-b border-slate-700/40">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-amber-500" />
                  <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Live Paper Width Comparison & Simulated Rendering
                  </h4>
                </div>
                <span className="text-xs text-slate-400">
                  Receipt: <strong className="text-amber-400">{hardwarePrinters.receiptPrinter.paperSize}</strong> • Kitchen: <strong className="text-amber-400">{hardwarePrinters.kitchenPrinter.paperSize}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start justify-items-center py-4 bg-slate-950/70 rounded-2xl p-6 border border-slate-800">
                {/* Simulated Receipt */}
                <div className="flex flex-col items-center space-y-2">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5 text-blue-400" />
                    Receipt ({hardwarePrinters.receiptPrinter.paperSize} Width @ {hardwarePrinters.receiptPrinter.ipAddress})
                  </span>
                  <div
                    className={`${hardwarePrinters.receiptPrinter.paperSize === '58mm' ? 'w-[250px] text-[10px]' : 'w-[320px] text-xs'} bg-white text-slate-900 font-mono p-4 rounded-sm shadow-xl border-t-4 border-blue-500 space-y-2 transition-all duration-200`}
                  >
                    <div className="text-center pb-2 border-b border-dashed border-slate-400">
                      <div className="font-black text-sm uppercase">{branch.name}</div>
                      <div className="text-[10px] text-slate-500">Tel: {branch.phone}</div>
                      <div className="text-[9px] text-blue-700 font-bold mt-0.5">IP: {hardwarePrinters.receiptPrinter.ipAddress}:{hardwarePrinters.receiptPrinter.port}</div>
                    </div>
                    <div className="py-1 border-b border-dashed border-slate-400 text-[10px] space-y-0.5">
                      <div className="flex justify-between">
                        <span>INV: #INV-2026-9042</span>
                        <span>DINE-IN T-01</span>
                      </div>
                    </div>
                    <div className="py-1 border-b border-dashed border-slate-400 text-[10px] space-y-1">
                      <div className="flex justify-between">
                        <span>2x SMOKEHOUSE BURGER</span>
                        <span className="font-bold">{currencySymbol || 'PKR'} 29.00</span>
                      </div>
                      <div className="flex justify-between">
                        <span>1x TRUFFLE FRIES</span>
                        <span className="font-bold">{currencySymbol || 'PKR'} 5.99</span>
                      </div>
                    </div>
                    <div className="pt-1 text-[10px] space-y-0.5 font-bold">
                      <div className="flex justify-between">
                        <span>SUBTOTAL</span>
                        <span>{currencySymbol || 'PKR'} 34.99</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-950">
                        <span>TOTAL</span>
                        <span>{currencySymbol || 'PKR'} 38.45</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Simulated Kitchen Ticket */}
                <div className="flex flex-col items-center space-y-2">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
                    Kitchen KOT ({hardwarePrinters.kitchenPrinter.paperSize} Width @ {hardwarePrinters.kitchenPrinter.ipAddress})
                  </span>
                  <div
                    className={`${hardwarePrinters.kitchenPrinter.paperSize === '58mm' ? 'w-[250px] text-[10px]' : 'w-[320px] text-xs'} bg-amber-50/95 text-slate-900 font-mono p-4 rounded-sm shadow-xl border-t-4 border-amber-500 space-y-2 transition-all duration-200`}
                  >
                    <div className="text-center pb-2 border-b-2 border-slate-900 space-y-0.5">
                      <div className="bg-slate-950 text-white font-black text-xs py-0.5 uppercase tracking-wider">
                        *** KITCHEN ORDER TICKET ***
                      </div>
                      <div className="text-[9px] font-bold text-slate-600">
                        IP: {hardwarePrinters.kitchenPrinter.ipAddress}:{hardwarePrinters.kitchenPrinter.port}
                      </div>
                    </div>
                    <div className="py-1 border-b-2 border-slate-900 text-xs font-bold space-y-0.5">
                      <div className="flex justify-between">
                        <span>TICKET: #INV-2026-9042</span>
                        <span>12:45 PM</span>
                      </div>
                      <div className="bg-slate-900 text-white px-1 py-0.5 text-[10px] flex justify-between">
                        <span>DINE-IN</span>
                        <span className="text-amber-400">TABLE T-01</span>
                      </div>
                    </div>
                    <div className="py-2 border-b-2 border-slate-900 space-y-2">
                      <div>
                        <div className="flex items-baseline gap-1.5 font-black text-xs">
                          <span className="bg-slate-900 text-white px-1 py-0.5 rounded-sm">2x</span>
                          <span>SMOKEHOUSE BURGER</span>
                        </div>
                        <div className="pl-6 text-[10px] text-amber-950 font-bold">
                          ⚠️ NOTE: Medium rare patties
                        </div>
                      </div>
                      <div>
                        <div className="flex items-baseline gap-1.5 font-black text-xs">
                          <span className="bg-slate-900 text-white px-1 py-0.5 rounded-sm">1x</span>
                          <span>TRUFFLE FRIES</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-center text-[9px] font-bold text-slate-600 pt-1">
                      EXPEDITE & PASS TO EXPO
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: COMPREHENSIVE THERMAL RECEIPT PRINTER CONFIGURATION & LIVE PREVIEW */}
        {activeTab === 'printer' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Form Settings (Left 7 Cols) */}
            <form onSubmit={handleSaveReceiptConfig} className="lg:col-span-7 space-y-6">
              {printerSavedSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  Thermal printer receipt layout saved successfully!
                </div>
              )}

              {/* 1. Header Information */}
              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <h3 className="font-bold text-sm text-slate-900">Receipt Header & Store Brand</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Business / Store Legal Name *</label>
                    <input
                      type="text"
                      value={receiptConfig.storeName}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, storeName: e.target.value })}
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Sub-Header Slogan / Tagline</label>
                    <input
                      type="text"
                      value={receiptConfig.tagline}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, tagline: e.target.value })}
                      placeholder="e.g. Artisanal Burgers & Craft Kitchen"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tax / GST / VAT Registration Number</label>
                    <input
                      type="text"
                      value={receiptConfig.taxRegistrationNumber}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, taxRegistrationNumber: e.target.value })}
                      placeholder="e.g. VAT-99120-88"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Official Contact Phone</label>
                    <input
                      type="text"
                      value={receiptConfig.phone}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Physical Store Address</label>
                  <input
                    type="text"
                    value={receiptConfig.address}
                    onChange={(e) => setReceiptConfig({ ...receiptConfig, address: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Header Custom Announcement / Greeting</label>
                  <input
                    type="text"
                    value={receiptConfig.headerCustomText}
                    onChange={(e) => setReceiptConfig({ ...receiptConfig, headerCustomText: e.target.value })}
                    placeholder="e.g. WELCOME TO RESTOFLOW KITCHEN"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
              </div>

              {/* 2. Format & Body Line Items */}
              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
                  <Sliders className="w-4 h-4 text-amber-600" />
                  <h3 className="font-bold text-sm text-slate-900">Print Formatting & Body Visibility</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Paper Roll Width</label>
                    <select
                      value={receiptConfig.paperWidth}
                      onChange={(e) =>
                        setReceiptConfig({ ...receiptConfig, paperWidth: e.target.value as '80mm' | '58mm' })
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                    >
                      <option value="80mm">Standard 80mm ESC/POS Roll (Wide)</option>
                      <option value="58mm">Compact 58mm ESC/POS Roll (Narrow)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Font Size / Line Density</label>
                    <select
                      value={receiptConfig.fontDensity}
                      onChange={(e) =>
                        setReceiptConfig({
                          ...receiptConfig,
                          fontDensity: e.target.value as 'compact' | 'standard' | 'large',
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                    >
                      <option value="compact">Compact (Dense / Paper Saver)</option>
                      <option value="standard">Standard (Balanced Legibility)</option>
                      <option value="large">Large (High Legibility)</option>
                    </select>
                  </div>
                </div>

                {/* Granular Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptConfig.showCashierName}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, showCashierName: e.target.checked })}
                      className="rounded text-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-medium">Show Cashier / Server Name</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptConfig.showOrderType}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, showOrderType: e.target.checked })}
                      className="rounded text-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-medium">Show Order Type (Dine-in/Takeaway/Delivery)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptConfig.showTableNumber}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, showTableNumber: e.target.checked })}
                      className="rounded text-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-medium">Show Table Number & Guests Count</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptConfig.showItemModifiers}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, showItemModifiers: e.target.checked })}
                      className="rounded text-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-medium">Show Itemized Modifiers & Add-ons</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptConfig.showItemSku}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, showItemSku: e.target.checked })}
                      className="rounded text-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-medium">Show Product SKU / Barcode</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptConfig.showQrCode}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, showQrCode: e.target.checked })}
                      className="rounded text-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-medium">Print QR Code for Feedback / Reorder</span>
                  </label>
                </div>

                {receiptConfig.showQrCode && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">QR Code Target URL</label>
                      <input
                        type="url"
                        value={receiptConfig.qrCodeUrl}
                        onChange={(e) => setReceiptConfig({ ...receiptConfig, qrCodeUrl: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">QR Code Caption Label</label>
                      <input
                        type="text"
                        value={receiptConfig.qrCodeLabel}
                        onChange={(e) => setReceiptConfig({ ...receiptConfig, qrCodeLabel: e.target.value })}
                        placeholder="Scan for Google review or reorder"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Footer & Hardware Kick */}
              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
                  <Printer className="w-4 h-4 text-amber-600" />
                  <h3 className="font-bold text-sm text-slate-900">Receipt Footer & Hardware Pulses</h3>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Thank You Note / Closing Message</label>
                  <input
                    type="text"
                    value={receiptConfig.footerCustomText}
                    onChange={(e) => setReceiptConfig({ ...receiptConfig, footerCustomText: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Return / Dispute Policy Text</label>
                    <textarea
                      value={receiptConfig.returnPolicyText || 'Fresh food once served cannot be refunded. For queries call 555-0100.'}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, returnPolicyText: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Guest WiFi / Social Media Handle</label>
                    <textarea
                      value={receiptConfig.wifiDetails || 'WiFi: RestoGuest / Pass: burger123\nInstagram: @restoflow_kitchen'}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, wifiDetails: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptConfig.autoCutReceipt}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, autoCutReceipt: e.target.checked })}
                      className="rounded text-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-bold">Auto-Cut Paper Command (ESC i)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiptConfig.autoDrawerKick}
                      onChange={(e) => setReceiptConfig({ ...receiptConfig, autoDrawerKick: e.target.checked })}
                      className="rounded text-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-bold">Kick Cash Drawer on Bill Print</span>
                  </label>
                </div>
              </div>

              {/* Save & Test Buttons */}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestPrintReceipt}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Test Print Receipt Sample</span>
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#16665A] hover:bg-[#115448] text-white font-black text-xs rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Printer Configuration</span>
                </button>
              </div>
            </form>

            {/* LIVE REALISTIC THERMAL RECEIPT PREVIEW (Right 5 Cols) */}
            <div className="lg:col-span-5 sticky top-4">
              <div className="bg-slate-800 p-4 rounded-3xl shadow-xl flex flex-col items-center">
                <div className="flex items-center justify-between w-full px-2 mb-3 text-white text-xs">
                  <span className="font-bold flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-amber-400" />
                    Live 80mm ESC/POS Preview
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {receiptConfig.paperWidth} • {receiptConfig.fontDensity.toUpperCase()}
                  </span>
                </div>

                {/* Thermal Receipt Paper Roll Simulation */}
                <div
                  className={`bg-white text-slate-900 p-6 rounded-lg shadow-2xl font-mono text-[11px] leading-relaxed transition-all select-none border border-slate-300 ${
                    receiptConfig.paperWidth === '58mm' ? 'max-w-[260px] text-[10px]' : 'max-w-[340px]'
                  }`}
                  style={{
                    filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.3))',
                    backgroundImage: 'repeating-linear-gradient(0deg, #fff, #fff 2px, #fafafa 2px, #fafafa 4px)',
                  }}
                >
                  {/* Paper Tear Zigzag Top */}
                  <div className="text-center text-slate-400 text-[10px] tracking-widest -mt-4 mb-3 opacity-60">
                    ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲
                  </div>

                  {/* Header */}
                  <div className="text-center space-y-0.5">
                    <h2 className="text-sm font-black tracking-tight uppercase">
                      {receiptConfig.storeName || 'RESTOFLOW'}
                    </h2>
                    {receiptConfig.tagline && (
                      <p className="text-[10px] text-slate-600 italic">{receiptConfig.tagline}</p>
                    )}
                    <p className="text-[10px] text-slate-600">{receiptConfig.address}</p>
                    <p className="text-[10px] text-slate-600 font-mono">Tel: {receiptConfig.phone}</p>
                    {receiptConfig.taxRegistrationNumber && (
                      <p className="text-[9px] text-slate-500 font-mono">Tax ID: {receiptConfig.taxRegistrationNumber}</p>
                    )}
                    {receiptConfig.headerCustomText && (
                      <p className="text-[10px] font-bold text-slate-800 border-t border-b border-dashed border-slate-400 py-1 my-1.5 uppercase">
                        {receiptConfig.headerCustomText}
                      </p>
                    )}
                  </div>

                  {/* Invoice Meta */}
                  <div className="py-2 border-b border-dashed border-slate-400 text-[10px] space-y-0.5">
                    <div className="flex justify-between">
                      <span>INVOICE: #INV-2026-9042</span>
                      <span>14-OCT-2026 12:45</span>
                    </div>
                    {receiptConfig.showCashierName && (
                      <div className="flex justify-between">
                        <span>CASHIER: {currentUser.name}</span>
                        <span>POS-TERM-01</span>
                      </div>
                    )}
                    {receiptConfig.showOrderType && (
                      <div className="flex justify-between font-bold">
                        <span>TYPE: DINE-IN</span>
                        {receiptConfig.showTableNumber && <span>TABLE: T-03 (4 GUESTS)</span>}
                      </div>
                    )}
                  </div>

                  {/* Sample Items Table */}
                  <div className="py-2 border-b border-dashed border-slate-400 space-y-1.5">
                    <div className="flex justify-between font-black text-[10px] uppercase border-b border-slate-200 pb-0.5">
                      <span>QTY ITEM</span>
                      <span>PRICE</span>
                    </div>

                    <div>
                      <div className="flex justify-between">
                        <span>2x SMOKEHOUSE BURGER</span>
                        <span>{currencySymbol || 'PKR'} 29.00</span>
                      </div>
                      {receiptConfig.showItemModifiers && (
                        <div className="text-[9px] text-slate-500 pl-3">
                          <div>+ Aged Cheddar Extra</div>
                          <div>+ Crispy Bacon Strips</div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex justify-between">
                        <span>1x STONE PIZZA MARGHERITA</span>
                        <span>{currencySymbol || 'PKR'} 16.50</span>
                      </div>
                      {receiptConfig.showItemModifiers && (
                        <div className="text-[9px] text-slate-500 pl-3">+ Fresh Basil & Mozzarella</div>
                      )}
                    </div>

                    <div>
                      <div className="flex justify-between">
                        <span>2x BERRY CRAFT SHAKE</span>
                        <span>{currencySymbol || 'PKR'} 13.00</span>
                      </div>
                    </div>
                  </div>

                  {/* Financials Subtotal, Tax, Total */}
                  <div className="py-2 border-b border-dashed border-slate-400 text-[10px] space-y-1">
                    <div className="flex justify-between">
                      <span>SUBTOTAL</span>
                      <span>{currencySymbol || 'PKR'} 58.50</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SALES TAX ({branch.taxRate}%)</span>
                      <span>{currencySymbol || 'PKR'} 4.97</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SERVICE CHARGE ({branch.serviceChargeRate}%)</span>
                      <span>{currencySymbol || 'PKR'} 2.93</span>
                    </div>
                    <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-300">
                      <span>TOTAL DUE</span>
                      <span>{currencySymbol || 'PKR'} 66.40</span>
                    </div>
                    <div className="flex justify-between text-slate-600 pt-0.5">
                      <span>TENDERED (CASH)</span>
                      <span>{currencySymbol || 'PKR'} 70.00</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>CHANGE GIVEN</span>
                      <span>{currencySymbol || 'PKR'} 3.60</span>
                    </div>
                  </div>

                  {/* Footer & QR */}
                  <div className="text-center pt-3 space-y-1 text-[10px]">
                    <p className="font-bold">{receiptConfig.footerCustomText}</p>
                    {receiptConfig.returnPolicyText && (
                      <p className="text-[9px] text-slate-500">{receiptConfig.returnPolicyText}</p>
                    )}
                    {receiptConfig.wifiDetails && (
                      <p className="text-[9px] text-slate-600 whitespace-pre-line font-bold">
                        {receiptConfig.wifiDetails}
                      </p>
                    )}

                    {receiptConfig.showQrCode && (
                      <div className="py-2 flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-900 text-white rounded p-1 flex items-center justify-center font-bold text-[9px]">
                          <QrCode className="w-12 h-12 text-white" />
                        </div>
                        <span className="text-[9px] text-slate-600 mt-1">
                          {receiptConfig.qrCodeLabel}
                        </span>
                      </div>
                    )}

                    <div className="text-[8px] text-slate-400 font-mono tracking-widest pt-2">
                      *** END OF BILL ***
                    </div>
                  </div>

                  {/* Paper Tear Zigzag Bottom */}
                  <div className="text-center text-slate-400 text-[10px] tracking-widest -mb-4 mt-4 opacity-60">
                    ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: OFFLINE PAYMENT METHOD CONFIGURATION */}
        {activeTab === 'payments' && (
          <div className="max-w-3xl bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5 text-xs">
            <div>
              <h3 className="font-bold text-sm text-slate-900">POS Payment Methods</h3>
              <p className="text-slate-500 mt-1">Cash, bank transfer, Easypaisa, JazzCash, and custom methods are available offline. Transaction references can be required per method.</p>
            </div>
            {paymentMethodsSaved && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-bold">Payment methods saved.</div>}
            <div className="space-y-2">
              {paymentMethods.map((method, index) => (
                <div key={method.id} className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] items-center gap-3 p-3 border border-slate-200 rounded-xl">
                  <div><span className="font-bold text-slate-900">{method.name}</span><span className="block text-[10px] text-slate-500 uppercase tracking-wide">{method.settlementGroup.replace('_', ' ')}</span></div>
                  <label className="inline-flex items-center gap-1.5 text-slate-700 font-semibold"><input type="checkbox" checked={method.enabled} disabled={method.id === 'cash'} onChange={(event) => setPaymentMethods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} />Enabled</label>
                  <label className="inline-flex items-center gap-1.5 text-slate-700 font-semibold"><input type="checkbox" checked={method.requiresReference} onChange={(event) => setPaymentMethods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, requiresReference: event.target.checked } : item))} />Reference</label>
                  {method.id.startsWith('custom:') && <button type="button" onClick={() => setPaymentMethods((items) => items.filter((item) => item.id !== method.id))} className="text-rose-600 font-bold">Remove</button>}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <input type="text" value={newPaymentMethodName} onChange={(event) => setNewPaymentMethodName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleAddCustomPaymentMethod(); } }} placeholder="Custom method name, e.g. Credit Account" className="flex-1 min-w-52 px-3 py-2 border border-slate-300 rounded-xl" />
              <button type="button" onClick={handleAddCustomPaymentMethod} className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm">Add Custom Method</button>
            </div>
            <div className="flex justify-end"><button type="button" onClick={handleSavePaymentMethods} className="px-5 py-2.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm">Save Payment Methods</button></div>
          </div>
        )}

        {/* TAB 3: ROLES & ACCESSIBILITY CONFIGURATION */}
        {activeTab === 'roles' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Roles List (Left 4 Cols) */}
            <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Security Roles</h3>
                  <p className="text-xs text-slate-500">Configured operational access profiles</p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAddRole}
                  className="px-3 py-1.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ New Role</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {customRoles.map((role) => {
                  const isSelected = selectedRole.id === role.id;
                  return (
                    <div
                      key={role.id}
                      onClick={() => setSelectedRole(role)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#16665A] text-white border-[#115448] font-bold shadow-sm'
                          : 'bg-[#FCFBF8] hover:bg-[#E9F4EE] text-slate-800 border-[#E8E3DA]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: role.color }}
                        />
                        <div>
                          <div className="text-xs font-bold leading-tight">{role.name}</div>
                          <div
                            className={`text-[10px] ${
                              isSelected ? 'text-slate-900/80' : 'text-slate-500'
                            }`}
                          >
                            {role.code}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditRole(role);
                          }}
                          className="p-1 hover:bg-black/10 rounded-lg transition"
                          title="Edit Role Properties"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        {customRoles.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRoleToDelete(role);
                            }}
                            className="p-1 hover:bg-rose-500/20 rounded-lg transition text-rose-700 cursor-pointer"
                            title="Delete Role"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Granular Accessibility Matrix (Right 8 Cols) */}
            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: selectedRole.color }}
                    />
                    <h3 className="font-bold text-base text-slate-900">
                      Permissions for: {selectedRole.name}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedRole.description}</p>
                </div>

                {roleSavedSuccess && (
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1 animate-in fade-in">
                    <Check className="w-3.5 h-3.5" /> Permissions Saved
                  </span>
                )}
              </div>

              {/* Permission Toggles Grid */}
              <div className="space-y-3">
                {PERMISSION_CONFIG_ITEMS.map((item) => {
                  const isGranted = !!selectedRole.permissions[item.key];
                  return (
                    <div
                      key={item.key}
                      onClick={() => handleTogglePermission(item.key)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                        isGranted
                          ? 'bg-emerald-50/60 border-emerald-300'
                          : 'bg-slate-50/60 border-slate-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="pr-4">
                        <span className="font-bold text-xs text-slate-900 block">{item.label}</span>
                        <span className="text-[11px] text-slate-500 mt-0.5 block">{item.desc}</span>
                      </div>

                      <div
                        className={`w-12 h-6 flex items-center rounded-full p-1 transition cursor-pointer shrink-0 ${
                          isGranted ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
                        }`}
                      >
                        <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECTION 2: STAFF ACCOUNTS & CUSTOM LOGIN PINS */}
            <div className="lg:col-span-12 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[#E9F4EE] text-[#16665A]">
                      <KeyRound className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <h3 className="font-bold text-base text-slate-900">
                      Staff Accounts & Security Login PINs
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Create employee accounts, assign their operational roles, and set custom 4-digit security PINs for terminal authentication
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPins(!showPins)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{showPins ? 'Hide PINs' : 'Reveal PINs'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenAddStaff}
                    className="px-3.5 py-1.5 bg-[#16665A] hover:bg-[#115448] text-white text-xs font-black rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>+ Add Staff Member</span>
                  </button>
                </div>
              </div>

              {/* Staff Accounts Grid / Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200 font-bold">
                      <th className="p-3">Staff Name</th>
                      <th className="p-3">Assigned Role</th>
                      <th className="p-3">Login Security PIN</th>
                      <th className="p-3">Email / ID</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {staffUsers.map((u) => {
                      const matchedRole = customRoles.find((r) => r.code === u.role);
                      const isCurrent = currentUser.id === u.id;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70 transition">
                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-black text-xs flex items-center justify-center">
                                {u.name.charAt(0)}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-xs block">{u.name}</span>
                                {isCurrent && (
                                  <span className="text-[9px] font-mono font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded">
                                    Current User
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="p-3">
                            <span
                              className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-2xs inline-block"
                              style={{ backgroundColor: matchedRole?.color || '#475569' }}
                            >
                              {matchedRole?.name || u.role.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>

                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-900">
                                {showPins ? u.pin : '••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenEditStaff(u)}
                                className="text-[10px] text-amber-700 hover:underline font-semibold"
                              >
                                Edit PIN
                              </button>
                            </div>
                          </td>

                          <td className="p-3 text-slate-500 font-mono text-[11px]">
                            {u.email || `${u.name.toLowerCase().replace(/\s+/g, '.')}@internal`}
                          </td>

                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditStaff(u)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                title="Edit Staff & PIN"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              {staffUsers.length > 1 && !isCurrent && (
                                <button
                                  type="button"
                                  onClick={() => setStaffToDelete(u)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                  title="Delete Staff Account"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
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

        {/* APPEARANCE: PRESETS & CUSTOM WORKSPACE THEME */}
        {activeTab === 'appearance' && (
          <div className="max-w-5xl space-y-6 text-xs">
            <div className="bg-[#FFFDFC] rounded-2xl border border-[#E8E3DA] p-6 shadow-sm space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-[#18302D]">Workspace Appearance</h3>
                  <p className="text-xs text-slate-500 mt-1">Choose a saved visual preset or create a local custom workspace theme. Changes are saved on this Windows device and do not alter restaurant data.</p>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-[#E9F4EE] border border-[#A7D6CC] text-[#16665A] font-bold">
                  Active: {THEME_PRESETS[theme].label}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {(Object.keys(THEME_PRESETS).filter((mode) => mode !== 'custom') as ThemeMode[]).map((mode) => {
                  const preset = THEME_PRESETS[mode];
                  const selected = theme === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTheme(mode)}
                      className={`p-4 rounded-2xl border text-left transition cursor-pointer ${selected ? 'bg-[#E9F4EE] border-[#16665A] shadow-sm' : 'bg-white border-[#E8E3DA] hover:bg-[#F4F8F5] hover:border-[#A7D6CC]'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`font-bold ${selected ? 'text-[#16665A]' : 'text-[#18302D]'}`}>{preset.label}</span>
                        {selected && <Check className="w-4 h-4 text-[#16665A]" />}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5 min-h-8">{preset.description}</p>
                      <div className="flex items-center gap-1.5 mt-3">
                        {preset.swatches.map((color) => <span key={color} className="w-5 h-5 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: color }} />)}
                        {preset.isDark && <span className="ml-1 text-[10px] font-bold text-slate-500">DARK</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
              <div className="bg-[#FFFDFC] rounded-2xl border border-[#E8E3DA] p-6 shadow-sm space-y-5">
                <div>
                  <h3 className="font-bold text-sm text-[#18302D]">Custom Theme Editor</h3>
                  <p className="text-xs text-slate-500 mt-1">Set your own colors for core surfaces and actions. Saving automatically activates the custom theme.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    ['canvas', 'Application canvas'], ['surface', 'Cards & dialogs'], ['primary', 'Primary buttons'], ['primaryHover', 'Primary hover'],
                    ['text', 'Main text'], ['mutedText', 'Supporting text'], ['border', 'Borders & dividers'],
                  ] as Array<[keyof CustomThemeConfig, string]>).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 p-3 bg-[#FCFBF8] border border-[#E8E3DA] rounded-xl">
                      <input type="color" value={isHexColor(themeDraft[key]) ? themeDraft[key] : '#000000'} onChange={(event) => setThemeDraft((current) => ({ ...current, [key]: event.target.value.toUpperCase() }))} className="w-9 h-9 p-0.5 rounded-lg border border-[#CFE3DC] bg-white cursor-pointer" aria-label={label} />
                      <span className="min-w-0 flex-1"><span className="block font-semibold text-[#18302D]">{label}</span><input type="text" value={themeDraft[key]} onChange={(event) => setThemeDraft((current) => ({ ...current, [key]: event.target.value }))} pattern="#[0-9A-Fa-f]{6}" className="mt-1 w-full bg-transparent font-mono text-[11px] text-slate-500 outline-none" aria-label={`${label} hex value`} /></span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-[#E8E3DA]">
                  <button type="button" onClick={() => { resetCustomTheme(); setThemeDraft(DEFAULT_CUSTOM_THEME); }} className="px-4 py-2 rounded-xl border border-[#A7D6CC] bg-white text-[#16665A] font-semibold hover:bg-[#E9F4EE]">Reset Custom Colors</button>
                  <button type="button" onClick={handleGenerateBalancedTheme} className="px-4 py-2 rounded-xl border border-[#A7D6CC] bg-white text-[#16665A] font-semibold hover:bg-[#E9F4EE]">Generate Balanced Colors</button>
                  <button type="button" onClick={handleSaveCustomTheme} className="px-4 py-2 rounded-xl bg-[#16665A] hover:bg-[#115448] text-white font-bold shadow-sm">Save & Apply Custom Theme</button>
                </div>
                {themeSavedSuccess && <div className="p-3 bg-[#E9F4EE] border border-[#A7D6CC] rounded-xl text-[#16665A] font-bold">Custom workspace theme saved and applied.</div>}
              </div>

              <div className="rounded-2xl border border-[#E8E3DA] overflow-hidden shadow-sm bg-white">
                <div className="p-3 flex items-center justify-between border-b" style={{ backgroundColor: themeDraft.surface, borderColor: themeDraft.border, color: themeDraft.text }}>
                  <span className="font-bold">Live workspace preview</span><span className="text-[10px] font-mono" style={{ color: themeDraft.mutedText }}>RestoFlow</span>
                </div>
                <div className="p-4 space-y-3" style={{ backgroundColor: themeDraft.canvas, color: themeDraft.text }}>
                  <div className="flex items-center gap-2"><span className="w-8 h-8 rounded-lg grid place-items-center text-white font-black" style={{ backgroundColor: themeDraft.primary }}>R</span><div><p className="font-bold">Point of Sale</p><p className="text-[10px]" style={{ color: themeDraft.mutedText }}>Terminal online · Main Store</p></div></div>
                  <div className="rounded-xl p-3 border shadow-sm" style={{ backgroundColor: themeDraft.surface, borderColor: themeDraft.border }}>
                    <div className="flex justify-between text-[11px]"><span style={{ color: themeDraft.mutedText }}>Current ticket</span><span className="font-bold">Rs 2,450.00</span></div>
                    <div className="mt-3 h-2 rounded-full" style={{ backgroundColor: mixHex(themeDraft.primary, themeDraft.canvas, 0.84) }}><div className="h-2 w-3/5 rounded-full" style={{ backgroundColor: themeDraft.primary }} /></div>
                    <div className="flex gap-2 mt-3"><button type="button" className="px-3 py-2 rounded-lg text-[10px] font-bold" style={{ backgroundColor: themeDraft.primary, color: luminance(themeDraft.primary) > 0.44 ? '#171717' : '#FFFFFF' }}>Charge order</button><button type="button" className="px-3 py-2 rounded-lg border text-[10px] font-bold" style={{ borderColor: themeDraft.border, color: themeDraft.text }}>Save ticket</button></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg p-2 border" style={{ backgroundColor: themeDraft.surface, borderColor: themeDraft.border }}><span style={{ color: themeDraft.mutedText }}>Low stock</span><p className="font-bold mt-1">4 items</p></div><div className="rounded-lg p-2 border" style={{ backgroundColor: themeDraft.surface, borderColor: themeDraft.border }}><span style={{ color: themeDraft.mutedText }}>Today sales</span><p className="font-bold mt-1">Rs 18,750</p></div></div>
                </div>
                <div className="p-3 text-[11px] border-t" style={{ backgroundColor: themeDraft.surface, borderColor: themeDraft.border, color: themeDraft.mutedText }}>
                  {contrastRatio(themeDraft.primary, '#FFFFFF') >= 4.5 && contrastRatio(themeDraft.text, themeDraft.surface) >= 4.5 ? '✓ Strong contrast for primary actions and text.' : '⚠ Review contrast: choose a darker primary or stronger text color.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STORE PROFILE & TAXES */}
        {activeTab === 'store' && (
          <form onSubmit={handleSaveStoreProfile} className="max-w-3xl bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 text-xs">
            {savedSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Store details and tax settings saved!
              </div>
            )}

            <div>
              <h3 className="font-bold text-sm text-slate-900">Restaurant Identity & Tax Profile</h3>
              <p className="text-xs text-slate-500">Legal entity information, billing currency and sales tax percentages</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Store / Restaurant Name *</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Store Code / Branch Code</label>
                <input
                  type="text"
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Currency Symbol</label>
                <input
                  type="text"
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Physical Address</label>
              <textarea
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tax Label</label>
                <input
                  type="text"
                  value={taxName}
                  onChange={(e) => setTaxName(e.target.value)}
                  disabled={!taxEnabled}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  disabled={!taxEnabled}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Service Charge Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={serviceRate}
                  onChange={(e) => setServiceRate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Standard Delivery Fee ({currencySymbol || 'PKR'})</label>
                <input
                  type="number"
                  step="0.1"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-5 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700">
                <input type="checkbox" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} />
                Apply tax to POS sales
              </label>
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700">
                <input type="checkbox" checked={taxInclusive} disabled={!taxEnabled} onChange={(e) => setTaxInclusive(e.target.checked)} />
                Tax is included in displayed menu prices
              </label>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save Store Configuration</span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 4: BACKUP & RESTORE */}
        {activeTab === 'backup' && (
          <div className="max-w-3xl space-y-6 text-xs">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Offline SQLite Backup & Recovery</h3>
                <p className="text-xs text-slate-500">
                  Desktop backups are verified SQLite snapshots. Each configured destination is attempted independently.
                </p>
              </div>

              {window.restoFlowDesktop && backupConfig && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="space-y-1.5">
                      <span className="font-bold text-slate-700 block">Automatic backup interval (hours)</span>
                      <input
                        type="number"
                        min="1"
                        max="168"
                        value={backupConfig.autoBackupHours}
                        onChange={(event) => setBackupConfig({ ...backupConfig, autoBackupHours: Number(event.target.value) })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="font-bold text-slate-700 block">Successful backups retained per drive</span>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={backupConfig.retentionCount}
                        onChange={(event) => setBackupConfig({ ...backupConfig, retentionCount: Number(event.target.value) })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono font-bold"
                      />
                    </label>
                  </div>
                  <div className="space-y-2">
                    {backupConfig.destinations.map((destination, index) => (
                      <label key={destination.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl">
                        <input
                          type="checkbox"
                          checked={destination.enabled}
                          onChange={(event) => {
                            const destinations = backupConfig.destinations.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item);
                            setBackupConfig({ ...backupConfig, destinations });
                          }}
                        />
                        <span className="font-bold text-slate-800">{destination.label}</span>
                        <span className="font-mono text-[11px] text-slate-500 truncate">{destination.path}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={isBackupBusy} onClick={handleRunBackupNow} className="px-4 py-2 bg-[#18302D] hover:bg-[#115448] disabled:opacity-50 text-white font-bold rounded-xl transition cursor-pointer">Run Backup Now</button>
                    <button type="button" disabled={isBackupBusy} onClick={handleSaveBackupConfig} className="px-4 py-2 bg-[#16665A] hover:bg-[#115448] disabled:opacity-50 text-white font-bold rounded-xl transition cursor-pointer">Save Backup Settings</button>
                  </div>
                </div>
              )}

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Manual Backup Export</span>
                  <span className="text-[11px] text-slate-500">Choose a location for a verified, complete SQLite snapshot.</span>
                </div>
                <button
                  type="button"
                  disabled={isBackupBusy}
                  onClick={() => void handleExportBackup()}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Backup</span>
                </button>
              </div>

              {window.restoFlowDesktop && (
                <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl flex flex-wrap gap-3 items-center justify-between">
                  <div>
                    <span className="font-bold text-sky-950 block">Verify Backup Before Restore</span>
                    <span className="text-[11px] text-sky-800">Checks SQLite integrity and RestoFlow compatibility without changing the active database.</span>
                  </div>
                  <button type="button" disabled={isBackupBusy} onClick={() => void handleInspectBackup()} className="px-4 py-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white font-bold rounded-xl transition cursor-pointer">Verify Backup File</button>
                </div>
              )}

              {backupInspection && !backupInspection.canceled && (
                <div className={`p-4 rounded-xl border ${backupInspection.verified ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'}`}>
                  {backupInspection.verified ? (
                    <div className="space-y-1">
                      <span className="font-bold block">Verified SQLite backup</span>
                      <span className="block text-[11px] break-all">Schema {backupInspection.schemaVersion} · {(Number(backupInspection.sizeBytes || 0) / 1024 / 1024).toFixed(2)} MB · modified {backupInspection.modifiedAt ? new Date(backupInspection.modifiedAt).toLocaleString() : 'unknown'}</span>
                      <span className="block text-[10px] font-mono break-all">SHA-256: {backupInspection.checksumSha256}</span>
                    </div>
                  ) : <span className="font-bold">Verification failed: {backupInspection.errorMessage || 'The selected file is not a compatible backup.'}</span>}
                </div>
              )}

              {window.restoFlowDesktop && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap gap-3 items-center justify-between">
                  <div>
                    <span className="font-bold text-amber-950 block">Safe Database Restore</span>
                    <span className="text-[11px] text-amber-800">Verify the file first if desired. Restore validates it again and requires a fresh pre-restore backup.</span>
                  </div>
                  <button type="button" disabled={isBackupBusy} onClick={() => void handleRestoreBackup()} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl transition cursor-pointer">Restore Backup</button>
                </div>
              )}

              {backupMessage && <p className="p-3 rounded-xl bg-slate-100 text-slate-700 font-medium">{backupMessage}</p>}

              {window.restoFlowDesktop && backupStatus.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 font-bold text-slate-700">Recent Backup Status</div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {backupStatus.slice(0, 8).map((record) => (
                      <div key={record.id} className="px-4 py-2.5 flex gap-3 justify-between items-start">
                        <span className={`font-bold ${record.status === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>{record.status === 'success' ? 'Success' : 'Failed'}</span>
                        <span className="text-slate-700 flex-1 truncate">{record.destinationLabel} · {record.operation}</span>
                        <span className="font-mono text-[10px] text-slate-500">{new Date(record.createdAt).toLocaleString()}</span>
                        {record.errorMessage && <span className="text-[10px] text-rose-700 max-w-48">{record.errorMessage}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-rose-900">Clear Operational Test Data</h3>
              <p className="text-xs text-rose-700">
                Creates a verified safety backup, then clears operational transactions and resets stock, drawer, balances, loyalty, payroll, and table occupancy. Store settings, menu, recipes, and staff accounts remain.
              </p>
              <button
                type="button"
                onClick={() => void onResetFactory()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer"
              >
                Clear Operational Data
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT CUSTOM ROLE MODAL */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#E8E3DA]">
            <div className="px-6 py-4 bg-[#F4F8F5] border-b border-[#E8E3DA] flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                {editingRole ? 'Edit Security Role' : 'Create Custom Role'}
              </h3>
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Role Title / Designation *</label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Lead Bartender, Shift Supervisor"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="Operational responsibilities"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Role Badge Color</label>
                <div className="flex items-center gap-2">
                  {['#d97706', '#2563eb', '#059669', '#7c3aed', '#dc2626', '#0891b2', '#ea580c', '#475569'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewRoleColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition ${
                        newRoleColor === c ? 'border-slate-900 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Configure Permissions for Role (Writing & Editing Role) */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs">
                    Configure Role Permissions ({Object.values(newRolePermissions).filter(Boolean).length} Granted):
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const allOn = Object.values(newRolePermissions).every(Boolean);
                      setNewRolePermissions({
                        canAccessPos: !allOn,
                        canApplyDiscounts: !allOn,
                        canIssueRefunds: !allOn,
                        canManageMenu: !allOn,
                        canManageTables: !allOn,
                        canManageInventory: !allOn,
                        canManageProcurement: !allOn,
                        canViewFinancialReports: !allOn,
                        canManageStaff: !allOn,
                        canConfigureSettings: !allOn,
                      });
                    }}
                    className="text-[10px] text-[#16665A] hover:underline font-bold"
                  >
                    Toggle All
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {PERMISSION_CONFIG_ITEMS.map((item) => {
                    const isGranted = newRolePermissions[item.key] === true;
                    return (
                      <div
                        key={item.key}
                        onClick={() =>
                          setNewRolePermissions((prev) => ({
                            ...prev,
                            [item.key]: !prev[item.key],
                          }))
                        }
                        className={`p-2 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                          isGranted
                            ? 'bg-[#E9F4EE] border-[#A7D6CC] text-[#18302D] font-bold'
                            : 'bg-[#FCFBF8] border-[#E8E3DA] text-slate-600 hover:bg-[#F4F8F5]'
                        }`}
                      >
                        <span className="text-[11px] truncate">{item.label}</span>
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-white ${
                            isGranted ? 'bg-emerald-600' : 'bg-slate-300'
                          }`}
                        >
                          {isGranted && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-4 py-2 border border-[#A7D6CC] bg-white rounded-xl text-[#16665A] hover:bg-[#E9F4EE] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm transition cursor-pointer"
                >
                  {editingRole ? 'Save Role' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT STAFF MEMBER & PIN MODAL */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-[#E8E3DA] animate-in fade-in duration-150">
            <div className="px-6 py-4 bg-[#18302D] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-[#E9F4EE] text-[#16665A]">
                  <KeyRound className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {editingStaff ? 'Edit Staff Account & PIN' : 'Add New Staff Member'}
                  </h3>
                  <span className="text-[10px] text-slate-400">Configure role accessibility and personal login PIN</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStaffModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Staff Full Name *</label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="e.g. Sarah Connor, Alex Rivera"
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Assign Operational Role *</label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold"
                >
                  {customRoles.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.name} ({r.description})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Security Login PIN (4 Digits) *</label>
                  <button
                    type="button"
                    onClick={() => setStaffPin(Math.floor(1000 + Math.random() * 9000).toString())}
                    className="text-[10px] font-bold text-[#16665A] hover:underline flex items-center gap-1"
                  >
                    Generate Random PIN
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={staffPin}
                  onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 1234"
                  required
                  className="w-full px-3 py-2 bg-[#FCFBF8] border border-[#CFE3DC] rounded-xl text-slate-900 font-mono text-center tracking-widest text-lg font-black focus:outline-none focus:border-[#16665A]"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Staff member will type this PIN to unlock the POS terminal and switch user accounts.
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Email / Staff ID (Optional)</label>
                <input
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="e.g. sarah@restoflow.com"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="px-4 py-2 border border-[#A7D6CC] bg-white rounded-xl text-[#16665A] hover:bg-[#E9F4EE] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16665A] hover:bg-[#115448] text-white font-bold rounded-xl shadow-sm transition cursor-pointer"
                >
                  {editingStaff ? 'Update Staff Member' : 'Create Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE ROLE MODAL */}
      {roleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border border-[#E8E3DA]">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 stroke-2" />
            </div>
            <h3 className="font-bold text-base text-slate-900">
              Delete Security Role "{roleToDelete.name}"?
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Staff assigned to this role will default to base cashier access. This action cannot be undone.
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setRoleToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-[#16665A] bg-white border border-[#A7D6CC] hover:bg-[#E9F4EE] rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRole}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs cursor-pointer"
              >
                Yes, Delete Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE STAFF MODAL */}
      {staffToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18302D]/45 backdrop-blur-sm p-4">
          <div className="bg-[#FFFDFC] rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border border-[#E8E3DA]">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 stroke-2" />
            </div>
            <h3 className="font-bold text-base text-slate-900">
              Delete Staff Account "{staffToDelete.name}"?
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Their security PIN will be deactivated and removed from terminal access.
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setStaffToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-[#16665A] bg-white border border-[#A7D6CC] hover:bg-[#E9F4EE] rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStaff}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs cursor-pointer"
              >
                Yes, Deactivate Staff
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
