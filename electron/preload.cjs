const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restoFlowDesktop', {
  isDesktop: true,
  auth: {
    listUsers: () => ipcRenderer.invoke('auth:list-users'),
    login: (input) => ipcRenderer.invoke('auth:login', input),
    refresh: (input) => ipcRenderer.invoke('auth:refresh', input),
    logout: (input) => ipcRenderer.invoke('auth:logout', input),
    recoveryStatus: () => ipcRenderer.invoke('auth:recovery-status'),
    resetOwnerPin: (input) => ipcRenderer.invoke('auth:reset-owner-pin', input),
  },
  storage: {
    getAll: () => ipcRenderer.invoke('storage:get-all'),
    bootstrap: (values) => ipcRenderer.invoke('storage:bootstrap', values),
  },
  reports: {
    summary: (input) => ipcRenderer.invoke('reports:summary', input),
  },
  pos: {
    commitOrder: (input) => ipcRenderer.invoke('pos:commit-order', input),
    updateOrderLifecycle: (input) => ipcRenderer.invoke('pos:update-order-lifecycle', input),
    heldOrder: (input) => ipcRenderer.invoke('pos:held-order', input),
  },
  kds: {
    updateItem: (input) => ipcRenderer.invoke('kds:update-item', input),
  },
  catalog: {
    mutate: (input) => ipcRenderer.invoke('catalog:mutate', input),
  },
  seating: {
    mutate: (input) => ipcRenderer.invoke('seating:mutate', input),
  },
  procurement: {
    vendor: (input) => ipcRenderer.invoke('procurement:vendor', input),
    purchaseOrder: (input) => ipcRenderer.invoke('procurement:purchase-order', input),
    postGoodsReceived: (input) => ipcRenderer.invoke('procurement:post-grn', input),
  },
  inventory: {
    master: (input) => ipcRenderer.invoke('inventory:master', input),
    adjustStock: (input) => ipcRenderer.invoke('inventory:adjust-stock', input),
    quickRestock: (input) => ipcRenderer.invoke('inventory:quick-restock', input),
    report: (input) => ipcRenderer.invoke('inventory:report', input),
    variance: (input) => ipcRenderer.invoke('inventory:variance', input),
  },
  crm: {
    mutate: (input) => ipcRenderer.invoke('crm:mutate', input),
  },
  security: {
    mutate: (input) => ipcRenderer.invoke('security:mutate', input),
  },
  config: {
    mutate: (input) => ipcRenderer.invoke('config:mutate', input),
  },
  staff: {
    employee: (input) => ipcRenderer.invoke('staff:employee', input),
    attendance: (input) => ipcRenderer.invoke('staff:attendance', input),
    advance: (input) => ipcRenderer.invoke('staff:advance', input),
    payroll: (input) => ipcRenderer.invoke('staff:payroll', input),
  },
  finance: { vendorPayment: (input) => ipcRenderer.invoke('finance:vendor-payment', input), expense: (input) => ipcRenderer.invoke('finance:expense', input), cashSession: (input) => ipcRenderer.invoke('finance:cash-session', input) },
  backup: {
    getConfig: () => ipcRenderer.invoke('backup:get-config'),
    saveConfig: (config) => ipcRenderer.invoke('backup:save-config', config),
    getStatus: () => ipcRenderer.invoke('backup:get-status'),
    runNow: () => ipcRenderer.invoke('backup:run-now'),
    export: () => ipcRenderer.invoke('backup:export'),
    inspect: () => ipcRenderer.invoke('backup:inspect'),
    restore: () => ipcRenderer.invoke('backup:restore'),
  },
  printer: {
    test: (config) => ipcRenderer.invoke('printer:test', config),
    printText: (config, text) => ipcRenderer.invoke('printer:print-text', config, text),
    kickDrawer: (config) => ipcRenderer.invoke('printer:kick-drawer', config),
    listSystem: () => ipcRenderer.invoke('printer:list-system'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    resetOperationalData: () => ipcRenderer.invoke('admin:reset-operational-data'),
  },
});
