export interface BackupDestination {
  id: 'primary-c' | 'secondary-d';
  label: string;
  path: string;
  enabled: boolean;
}

export interface BackupConfiguration {
  autoBackupHours: number;
  retentionCount: number;
  destinations: BackupDestination[];
}

export interface BackupStatusRecord {
  id: number;
  operation: string;
  destinationId: string | null;
  destinationLabel: string;
  filePath: string | null;
  createdAt: string;
  status: 'success' | 'failed';
  errorMessage: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
}

export interface BackupInspectionResult {
  canceled: boolean;
  verified?: boolean;
  sourcePath?: string;
  schemaVersion?: string;
  sizeBytes?: number;
  modifiedAt?: string;
  checksumSha256?: string;
  errorMessage?: string;
}

export interface DesktopBridge {
  isDesktop: true;
  auth: {
    listUsers: () => Promise<Array<{ id: string; name: string; role: import('./restaurant').UserRole; branchId: string; email: string }>>;
    login: (input: { userId?: string; pin: string }) => Promise<{ id: string; name: string; role: import('./restaurant').UserRole; branchId: string; email: string; sessionToken: string }>;
    refresh: (input: { sessionToken?: string }) => Promise<void>;
    logout: (input: { sessionToken?: string }) => Promise<void>;
    recoveryStatus: () => Promise<{ enabled: boolean }>;
    resetOwnerPin: (input: { userId: string; pin: string }) => Promise<{ id: string; name: string; role: import('./restaurant').UserRole; branchId: string; email: string }>;
  };
  storage: {
    getAll: () => Promise<Record<string, unknown>>;
    bootstrap: (values: Record<string, unknown>) => Promise<void>;
  };
  reports: {
    summary: (input: unknown) => Promise<unknown>;
  };
  pos: {
    commitOrder: (input: unknown) => Promise<unknown>;
    updateOrderLifecycle: (input: unknown) => Promise<unknown>;
    heldOrder: (input: unknown) => Promise<unknown>;
  };
  kds: {
    updateItem: (input: unknown) => Promise<unknown>;
  };
  catalog: {
    mutate: (input: unknown) => Promise<unknown>;
  };
  seating: {
    mutate: (input: unknown) => Promise<unknown>;
  };
  procurement: {
    vendor: (input: unknown) => Promise<unknown>;
    purchaseOrder: (input: unknown) => Promise<unknown>;
    postGoodsReceived: (input: unknown) => Promise<unknown>;
  };
  inventory: {
    master: (input: unknown) => Promise<unknown>;
    adjustStock: (input: unknown) => Promise<unknown>;
    quickRestock: (input: unknown) => Promise<unknown>;
    report: (input: unknown) => Promise<unknown>;
    variance: (input: unknown) => Promise<unknown>;
  };
  crm: {
    mutate: (input: unknown) => Promise<unknown>;
  };
  security: {
    mutate: (input: unknown) => Promise<unknown>;
  };
  config: {
    mutate: (input: unknown) => Promise<unknown>;
  };
  staff: {
    employee: (input: unknown) => Promise<unknown>;
    attendance: (input: unknown) => Promise<unknown>;
    advance: (input: unknown) => Promise<unknown>;
    payroll: (input: unknown) => Promise<unknown>;
  };
  finance: { vendorPayment: (input: unknown) => Promise<unknown>; expense: (input: unknown) => Promise<unknown>; cashSession: (input: unknown) => Promise<unknown> };
  backup: {
    getConfig: () => Promise<BackupConfiguration>;
    saveConfig: (config: BackupConfiguration) => Promise<BackupConfiguration>;
    getStatus: () => Promise<BackupStatusRecord[]>;
    runNow: () => Promise<BackupStatusRecord[]>;
    export: () => Promise<{ canceled: boolean; status?: 'success' | 'failed'; filePath?: string; errorMessage?: string }>;
    inspect: () => Promise<BackupInspectionResult>;
    restore: () => Promise<{ canceled: boolean; restored?: boolean; sourcePath?: string }>;
  };
  printer: {
    test: (config: unknown) => Promise<{ success: boolean; message: string }>;
    printText: (config: unknown, text: string) => Promise<{ success: boolean; message: string }>;
    kickDrawer: (config: unknown) => Promise<{ success: boolean; message: string }>;
    listSystem: () => Promise<Array<{ name: string; displayName: string; description: string; isDefault: boolean; status: number }>>;
  };
  app: {
    info: () => Promise<{ isDesktop: true; databasePath: string }>;
    resetOperationalData: () => Promise<{ reset: true; safetyBackups: Array<{ status: 'success' | 'failed' }> }>;
  };
}

declare global {
  interface Window {
    restoFlowDesktop?: DesktopBridge;
  }
}
