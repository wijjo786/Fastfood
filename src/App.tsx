/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Branch, User, Order } from './types/restaurant';
import { sqliteService } from './services/sqliteStorage';
import { APPLICATION_TABS, canAccessApplicationTab } from './services/roleAccess';
import { ThemeProvider, useAppTheme } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { PosTerminal } from './components/pos/PosTerminal';
import { OrderHistory } from './components/orders/OrderHistory';
import { KitchenDisplay } from './components/kds/KitchenDisplay';
import { TableFloorMap } from './components/tables/TableFloorMap';
import { MenuManagement } from './components/menu/MenuManagement';
import { InventoryRecipeManager } from './components/inventory/InventoryRecipeManager';
import { ProcurementManager } from './components/procurement/ProcurementManager';
import { CustomerDeliveryManager } from './components/delivery/CustomerDeliveryManager';
import { StaffExpenseManager } from './components/staff/StaffExpenseManager';
import { CashDrawerShift } from './components/finance/CashDrawerShift';
import { ReportsDashboard } from './components/reports/ReportsDashboard';
import { SettingsManager } from './components/settings/SettingsManager';
import { LoginScreen } from './components/auth/LoginScreen';
import { showUserError, toUserErrorMessage, UserFeedbackDetail } from './utils/userFeedback';

function AppContent() {
  const { styles } = useAppTheme();
  // Single Restaurant Establishment Profile
  const [currentBranch, setCurrentBranch] = useState<Branch>(() => sqliteService.getBranches()[0]);
  const [users, setUsers] = useState<User[]>(() => sqliteService.getUsers());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('pos');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [errorDialog, setErrorDialog] = useState<UserFeedbackDetail | null>(null);

  const showNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleResetData = async () => {
    const confirmation = window.prompt('This permanently clears operational records after a verified safety backup. Menu, staff accounts, store settings, and recipes are retained. Type CLEAR OPERATIONAL DATA to continue.');
    if (confirmation !== 'CLEAR OPERATIONAL DATA') return;
    try {
      await sqliteService.resetToFactoryDefaults();
      window.location.reload();
    } catch (error) {
      showUserError(error, 'Operational data could not be cleared. Your current data was kept unchanged.');
    }
  };

  const handleOrderCreated = (order: Order) => {
    showNotification(`Order ${order.invoiceNumber} recorded successfully!`);
  };

  const handleSelectTableForOrder = (tableId: string) => {
    setCurrentTab('pos');
    showNotification(`Selected Table ${tableId} for new ticket`);
  };

  const handleUpdateBranch = async (updated: Branch) => {
    const persisted = await sqliteService.updateBranch(updated.id, updated, currentUser || undefined);
    setCurrentBranch(persisted);
    showNotification('Restaurant store profile and tax settings updated');
  };

  const handleSelectUser = (user: User) => {
    setCurrentUser(user);
    showNotification(`Authenticated as ${user.name} (${user.role.toUpperCase()})`);
  };

  const handleLockTerminal = () => {
    const sessionToken = currentUser?.sessionToken;
    if (sessionToken && window.restoFlowDesktop) {
      void window.restoFlowDesktop.auth.logout({ sessionToken });
    }
    setCurrentUser(null);
  };

  useEffect(() => {
    if (!currentUser) return;
    const inactivityMs = 15 * 60 * 1000;
    let timer = window.setTimeout(handleLockTerminal, inactivityMs);
    const renewSession = () => {
      if (currentUser.sessionToken && window.restoFlowDesktop) {
        void window.restoFlowDesktop.auth.refresh({ sessionToken: currentUser.sessionToken }).catch(() => setCurrentUser(null));
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(handleLockTerminal, inactivityMs);
    };
    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];
    activityEvents.forEach((event) => window.addEventListener(event, renewSession));
    return () => {
      window.clearTimeout(timer);
      activityEvents.forEach((event) => window.removeEventListener(event, renewSession));
    };
  }, [currentUser]);

  useEffect(() => {
    const onFeedback = (event: Event) => {
      const detail = (event as CustomEvent<UserFeedbackDetail>).detail;
      if (!detail) return;
      if (detail.kind === 'error') setErrorDialog(detail);
      else showNotification(detail.message, 'info');
    };
    const onUnexpectedError = (event: ErrorEvent) => {
      event.preventDefault();
      setErrorDialog({ kind: 'error', title: 'Something needs attention', message: toUserErrorMessage(event.error || event.message, 'An unexpected problem occurred. Please try the action again.') });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setErrorDialog({ kind: 'error', title: 'Something needs attention', message: toUserErrorMessage(event.reason, 'An unexpected problem occurred. Please try the action again.') });
    };
    window.addEventListener('restoflow:user-feedback', onFeedback);
    window.addEventListener('error', onUnexpectedError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('restoflow:user-feedback', onFeedback);
      window.removeEventListener('error', onUnexpectedError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  const permissions = sqliteService.getUserPermissions(currentUser);
  const allowedTabs = APPLICATION_TABS.filter((tab) => canAccessApplicationTab(tab, permissions));
  const activeTab = allowedTabs.includes(currentTab as typeof allowedTabs[number])
    ? currentTab
    : (allowedTabs[0] || '');

  useEffect(() => {
    if (currentUser && activeTab && activeTab !== currentTab) {
      setCurrentTab(activeTab);
    }
  }, [activeTab, currentTab, currentUser]);

  const errorDialogOverlay = errorDialog && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-[1px]" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="error-dialog-title" className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-lg font-black text-rose-600">!</div>
          <div className="min-w-0">
            <h2 id="error-dialog-title" className="text-base font-black text-slate-900">{errorDialog.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{errorDialog.message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end"><button type="button" autoFocus onClick={() => setErrorDialog(null)} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800">OK</button></div>
      </div>
    </div>
  );

  if (!currentUser) {
    return <>{<LoginScreen branch={currentBranch} onLoginSuccess={handleSelectUser} />}{errorDialogOverlay}</>;
  }

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden ${styles.bgApp} font-sans select-none ${styles.textPrimary}`}>
      {/* Top Production Navigation */}
      <Navbar
        currentTab={activeTab}
        onSelectTab={(tab) => {
          if (canAccessApplicationTab(tab, permissions)) setCurrentTab(tab);
        }}
        currentBranch={currentBranch}
        currentUser={currentUser}
        onSelectUser={handleLockTerminal}
        users={users}
      />

      {/* Main Production Workspace */}
      <main className="flex-1 flex overflow-hidden relative">
        {!activeTab && (
          <div className="m-auto max-w-md text-center px-6">
            <h1 className="text-lg font-bold">No operational permissions assigned</h1>
            <p className="mt-2 text-sm text-slate-500">Ask a super administrator to assign at least one permission to this role.</p>
          </div>
        )}
        {activeTab === 'pos' && (
          <PosTerminal
            branch={currentBranch}
            currentUser={currentUser}
            onOrderCreated={handleOrderCreated}
          />
        )}
        {activeTab === 'orders' && <OrderHistory branch={currentBranch} currentUser={currentUser} />}
        {activeTab === 'kds' && (
          <KitchenDisplay branch={currentBranch} currentUser={currentUser} />
        )}
        {activeTab === 'tables' && (
          <TableFloorMap
            branch={currentBranch}
            currentUser={currentUser}
            onSelectTableForOrder={handleSelectTableForOrder}
          />
        )}
        {activeTab === 'menu' && (
          <MenuManagement
            branch={currentBranch}
            currentUser={currentUser}
            onRefreshPosMenu={() => showNotification('Menu changes updated across system')}
          />
        )}
        {activeTab === 'inventory' && (
          <InventoryRecipeManager branch={currentBranch} currentUser={currentUser} />
        )}
        {activeTab === 'procurement' && (
          <ProcurementManager branch={currentBranch} currentUser={currentUser} />
        )}
        {activeTab === 'delivery' && (
          <CustomerDeliveryManager branch={currentBranch} currentUser={currentUser} />
        )}
        {activeTab === 'cash_drawer' && (
          <CashDrawerShift branch={currentBranch} currentUser={currentUser} />
        )}
        {activeTab === 'staff' && (
          <StaffExpenseManager branch={currentBranch} currentUser={currentUser} />
        )}
        {activeTab === 'reports' && <ReportsDashboard branch={currentBranch} currentUser={currentUser} />}
        {activeTab === 'settings' && (
          <SettingsManager
            branch={currentBranch}
            onUpdateBranch={handleUpdateBranch}
            onResetFactory={handleResetData}
            currentUser={currentUser}
          />
        )}

        {/* Global Luxury Toast Notification */}
        {notification && (
          <div className={`absolute bottom-6 right-6 z-50 px-4 py-3 rounded-2xl ${styles.bgElevated} border ${styles.borderAccent} shadow-2xl ${styles.textPrimary} text-xs flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200`}>
            <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            </div>
            <span className="font-semibold">{notification.message}</span>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="ml-2 text-slate-400 hover:text-amber-500 transition cursor-pointer"
            >
              ×
            </button>
          </div>
        )}
        {errorDialogOverlay}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
