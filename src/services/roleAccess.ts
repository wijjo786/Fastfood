import { RolePermissions } from '../types/restaurant';

export type ApplicationTab =
  | 'pos'
  | 'orders'
  | 'kds'
  | 'tables'
  | 'menu'
  | 'inventory'
  | 'procurement'
  | 'delivery'
  | 'cash_drawer'
  | 'staff'
  | 'reports'
  | 'settings';

/**
 * Maps each workspace to the same permission enforced by the desktop backend.
 * This improves the operator experience; Electron IPC remains the authority for
 * every protected write and report request.
 */
export const canAccessApplicationTab = (tab: string, permissions: RolePermissions): boolean => {
  switch (tab as ApplicationTab) {
    case 'pos':
    case 'orders':
    case 'delivery':
    case 'cash_drawer':
      return permissions.canAccessPos;
    case 'kds':
    case 'inventory':
      return permissions.canManageInventory;
    case 'tables':
      return permissions.canManageTables;
    case 'menu':
      return permissions.canManageMenu;
    case 'procurement':
      return permissions.canManageProcurement;
    case 'staff':
      return permissions.canManageStaff || permissions.canViewFinancialReports;
    case 'reports':
      return permissions.canViewFinancialReports;
    case 'settings':
      return permissions.canConfigureSettings;
    default:
      return false;
  }
};

export const APPLICATION_TABS: ApplicationTab[] = [
  'pos',
  'orders',
  'kds',
  'tables',
  'menu',
  'inventory',
  'procurement',
  'delivery',
  'cash_drawer',
  'staff',
  'reports',
  'settings',
];
