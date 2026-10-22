import React, { useState, useEffect } from 'react';
import { Branch, User, ThemeMode } from '../types/restaurant';
import { useAppTheme, THEME_PRESETS } from '../context/ThemeContext';
import { sqliteService } from '../services/sqliteStorage';
import { canAccessApplicationTab } from '../services/roleAccess';
import {
  UtensilsCrossed,
  ReceiptText,
  ChefHat,
  LayoutGrid,
  Boxes,
  Truck,
  Users,
  Briefcase,
  Wallet,
  BarChart3,
  Settings,
  Store,
  Palette,
  Utensils,
  Lock,
  KeyRound,
  X,
  CheckCircle2,
  AlertCircle,
  Shield,
  Delete,
  Maximize2,
  Minimize2,
  Clock,
  Sparkles,
  Check,
  ChevronDown,
  Wifi,
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  currentBranch: Branch;
  currentUser: User;
  onSelectUser: (user: User) => void;
  users: User[];
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  currentBranch,
  currentUser,
  onSelectUser,
  users,
}) => {
  const { theme, setTheme, styles, isDark } = useAppTheme();
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [selectedStaffToLogin, setSelectedStaffToLogin] = useState<User | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Real-time clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const permissions = sqliteService.getUserPermissions(currentUser);
  const navItems = [
    { id: 'pos', label: 'POS', icon: UtensilsCrossed, badge: 'Active' },
    { id: 'orders', label: 'Orders', icon: ReceiptText },
    { id: 'kds', label: 'Kitchen', icon: ChefHat },
    { id: 'tables', label: 'Floor & Tables', icon: LayoutGrid },
    { id: 'menu', label: 'Menu', icon: Utensils },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'procurement', label: 'Suppliers', icon: Truck },
    { id: 'delivery', label: 'CRM & Delivery', icon: Users },
    { id: 'cash_drawer', label: 'Cash', icon: Wallet },
    { id: 'staff', label: 'Staff', icon: Briefcase },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ].filter((tab) => canAccessApplicationTab(tab.id, permissions));

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // PIN Authentication Handlers
  const handleOpenPinLogin = (preselected?: User) => {
    setSelectedStaffToLogin(preselected || null);
    setEnteredPin('');
    setPinError(null);
    setIsPinModalOpen(true);
  };

  const handleNumpadPress = (digit: string) => {
    if (enteredPin.length >= 6) return;
    const nextPin = enteredPin + digit;
    setEnteredPin(nextPin);
    setPinError(null);

    if (nextPin.length >= 4) {
      verifyAndLogin(nextPin);
    }
  };

  const handleNumpadBackspace = () => {
    setEnteredPin((prev) => prev.slice(0, -1));
    setPinError(null);
  };

  const handleNumpadClear = () => {
    setEnteredPin('');
    setPinError(null);
  };

  const verifyAndLogin = (pinToTest: string) => {
    if (selectedStaffToLogin) {
      if (selectedStaffToLogin.pin === pinToTest) {
        onSelectUser(selectedStaffToLogin);
        setIsPinModalOpen(false);
        setEnteredPin('');
        return;
      }
    }

    const authenticated = sqliteService.authenticatePin(pinToTest);
    if (authenticated) {
      onSelectUser(authenticated);
      setIsPinModalOpen(false);
      setEnteredPin('');
      setPinError(null);
    } else {
      if (pinToTest.length >= 4) {
        setPinError('Invalid PIN code. Please try again.');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      handleNumpadPress(e.key);
    } else if (e.key === 'Backspace') {
      handleNumpadBackspace();
    } else if (e.key === 'Escape') {
      setIsPinModalOpen(false);
      setIsThemeModalOpen(false);
    }
  };

  return (
    <header className={`${styles.bgSurface} border-b ${styles.borderDefault} text-slate-800 flex flex-col z-30 shrink-0 shadow-[0_1px_0_rgba(24,48,45,0.04)] transition-colors duration-200 select-none`}>
      {/* Compact operational top bar. The legacy executive chrome remains below only as a
          hidden fallback while the PIN workflow is kept outside and fully active. */}
      <nav className="h-[68px] px-4 lg:px-6 flex items-center gap-3 overflow-hidden">
        <button
          type="button"
          onClick={() => onSelectTab('pos')}
          className="shrink-0 flex items-center gap-2.5 text-left cursor-pointer"
          title="Open POS"
        >
          <span className="w-9 h-9 rounded-xl bg-[#16665A] text-white flex items-center justify-center shadow-sm">
            <UtensilsCrossed className="w-[18px] h-[18px] stroke-[2.5]" />
          </span>
          <span className="hidden sm:block leading-tight">
            <span className="block font-extrabold tracking-tight text-[15px] text-[#18302D]">RestoFlow</span>
            <span className="block text-[9px] uppercase tracking-[0.14em] font-bold text-[#71807C]">Restaurant OS</span>
          </span>
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar px-1">
          {navItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`shrink-0 min-w-[54px] px-2.5 py-2 rounded-xl flex flex-col items-center gap-0.5 text-[9px] leading-none font-bold transition cursor-pointer ${
                  isActive
                    ? 'bg-[#16665A] text-white shadow-sm'
                    : 'text-[#35514C] hover:bg-[#F2F5F3] hover:text-[#16665A]'
                }`}
              >
                <Icon className="w-4 h-4 stroke-[2]" />
                <span className="max-w-[70px] truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F7F3EC] border border-[#E8E3DA] text-[10px] font-semibold text-[#35514C]">
            <Store className="w-3.5 h-3.5 text-[#16665A]" />
            <span className="max-w-[105px] truncate">{currentBranch.name}</span>
          </div>
          <div className="hidden 2xl:flex items-center gap-1 px-2 py-1.5 text-[10px] font-mono text-[#71807C]">
            <Wifi className="w-3 h-3 text-emerald-600" />
            <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsThemeModalOpen((open) => !open)}
              className="p-2 rounded-lg text-[#35514C] hover:bg-[#F2F5F3] hover:text-[#16665A] cursor-pointer"
              title="Change workspace theme"
            >
              <Palette className="w-4 h-4" />
            </button>
            {isThemeModalOpen && (
              <div className={`absolute right-0 top-full mt-2 z-50 w-64 p-2 rounded-2xl border ${styles.borderStrong} ${styles.bgElevated} shadow-xl`}>
                <p className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#71807C]">Workspace theme</p>
                {(Object.keys(THEME_PRESETS) as ThemeMode[]).map((mode) => {
                  const preset = THEME_PRESETS[mode];
                  const selected = theme === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setTheme(mode); setIsThemeModalOpen(false); }}
                      className={`w-full px-2.5 py-2 rounded-xl flex items-center gap-2 text-left transition cursor-pointer ${selected ? 'bg-[#E8F3F0] text-[#16665A]' : 'hover:bg-[#F7F3EC] text-[#35514C]'}`}
                    >
                      <span className="flex -space-x-1 shrink-0">{preset.swatches.map((color) => <i key={color} className="w-3 h-3 rounded-full border border-black/15" style={{ backgroundColor: color }} />)}</span>
                      <span className="min-w-0 flex-1"><span className="block text-xs font-bold truncate">{preset.label}</span><span className="block text-[10px] text-[#71807C] truncate">{preset.description}</span></span>
                      {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-[#35514C] hover:bg-[#F2F5F3] hover:text-[#16665A] cursor-pointer"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => handleOpenPinLogin()}
            className="w-9 h-9 rounded-full bg-[#18302D] text-white text-xs font-extrabold flex items-center justify-center cursor-pointer ring-2 ring-white shadow-sm"
            title={`Switch staff (currently ${currentUser.name})`}
          >
            {currentUser.name.charAt(0).toUpperCase()}
          </button>
        </div>
      </nav>

      <div className="hidden">
      {/* Top Executive App Bar */}
      <div className={`px-4 lg:px-6 py-2 border-b ${styles.borderSubtle} flex items-center justify-between gap-4 text-xs`}>
        {/* LEFT ZONE: Haute Brand Identity & Operational Status */}
        <div className="flex items-center gap-3.5">
          {/* Haute Monogram Crest */}
          <div className="relative group">
            <div className="w-9 h-9 rounded-xl bg-[#16665A] flex items-center justify-center text-white font-black shadow-md shadow-emerald-950/10 transform group-hover:scale-105 transition">
              <UtensilsCrossed className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className={`font-black tracking-widest text-sm ${isDark ? 'text-white' : 'text-slate-950'}`}>
                RESTOFLOW
              </span>
              <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-[#E8F3F0] text-[#16665A] border border-[#B9D8D0]">
                DESKTOP
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="font-semibold">{currentBranch.name}</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-emerald-500 font-bold">
                <Wifi className="w-2.5 h-2.5" />
                <span>Offline SQLite Ready</span>
              </span>
            </div>
          </div>
        </div>

        {/* CENTER ZONE: Live Clock & Date */}
        <div className="hidden xl:flex items-center gap-4 text-xs">
          <div className={`px-3 py-1.5 rounded-xl border ${styles.borderDefault} ${styles.bgSubtle} flex items-center gap-2.5 shadow-2xs`}>
            <Clock className="w-3.5 h-3.5 text-[#16665A]" />
            <span className={`font-mono font-bold text-xs num-tabular ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-slate-400 text-[11px]">
              {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        {/* RIGHT ZONE: Theme Switcher, Fullscreen, & Staff Security */}
        <div className="flex items-center gap-2.5">
          {/* Luxury Theme Palette Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsThemeModalOpen(!isThemeModalOpen)}
              className={`px-3 py-1.5 rounded-xl border ${styles.borderDefault} ${styles.bgSubtle} hover:border-[#16665A]/50 transition flex items-center gap-2 cursor-pointer shadow-2xs`}
              title="Change Luxury Theme Architecture"
            >
              <Palette className="w-3.5 h-3.5 text-[#16665A]" />
              <span className={`font-bold text-xs hidden sm:inline ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                {styles.label.split(' ')[0]}
              </span>
              <div className="flex items-center -space-x-1">
                {styles.swatches.map((color, idx) => (
                  <span
                    key={idx}
                    className="w-2.5 h-2.5 rounded-full border border-black/20"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Theme Palette Popover Menu */}
            {isThemeModalOpen && (
              <div
                className={`absolute right-0 mt-2 w-72 rounded-2xl shadow-2xl border ${styles.borderStrong} ${styles.bgElevated} p-3 z-50 animate-in fade-in zoom-in-95 duration-150`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/30">
                  <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'} flex items-center gap-1.5`}>
                    <Sparkles className="w-3.5 h-3.5 text-[#16665A]" />
                    <span>Curated Theme Palette</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsThemeModalOpen(false)}
                    className="text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {(Object.keys(THEME_PRESETS) as ThemeMode[]).map((mode) => {
                    const preset = THEME_PRESETS[mode];
                    const isSelected = theme === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setTheme(mode);
                          setIsThemeModalOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'border-[#16665A] bg-[#E8F3F0] shadow-xs'
                            : `${styles.borderSubtle} hover:bg-black/5 dark:hover:bg-white/5`
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-bold text-xs truncate ${isSelected ? 'text-[#16665A]' : isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                              {preset.label}
                            </span>
                            {preset.isDark && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-800 text-slate-300">
                                Dark
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {preset.description}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="flex items-center -space-x-1">
                            {preset.swatches.map((color, i) => (
                              <span
                                key={i}
                                className="w-3 h-3 rounded-full border border-black/30"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-[#16665A] stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className={`p-2 rounded-xl border ${styles.borderDefault} ${styles.bgSubtle} text-slate-400 hover:text-[#16665A] hover:border-[#16665A]/50 transition cursor-pointer shadow-2xs`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Kiosk Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Executive Staff Profile Pill with Secure PIN Switch */}
          <div className={`flex items-center gap-2 p-1 pl-2.5 rounded-2xl border ${styles.borderDefault} ${styles.bgSubtle} shadow-2xs`}>
            <div className="w-6 h-6 rounded-xl bg-[#16665A] flex items-center justify-center text-white font-black text-xs shadow-2xs">
              {currentUser.name.charAt(0)}
            </div>

            <div className="hidden sm:flex flex-col text-left">
              <span className={`font-bold text-xs leading-tight truncate max-w-[110px] ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {currentUser.name}
              </span>
              <span className="text-[9px] uppercase tracking-wider font-mono font-extrabold text-[#16665A] leading-none mt-0.5">
                {currentUser.role.replace('_', ' ')}
              </span>
            </div>

            <button
              type="button"
            onClick={() => onSelectUser(currentUser)}
              className="px-2.5 py-1 bg-[#16665A] hover:bg-[#115448] text-white rounded-xl text-[11px] font-extrabold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              title="Switch Staff Member or Lock Terminal with Security PIN"
            >
              <Lock className="w-3 h-3 stroke-[2.5]" />
              <span className="hidden md:inline">Lock Terminal</span>
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM NAVIGATION BAR: Haute Segmented Control */}
      <nav className={`px-4 lg:px-6 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar ${styles.bgSurface}`}>
        {navItems.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-[#16665A] text-white font-black shadow-md shadow-emerald-950/15 scale-[1.02]'
                  : `${isDark ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60' : 'text-slate-600 hover:text-[#18302D] hover:bg-[#F2F5F3]'} border border-transparent hover:border-[#DCE8E3]`
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'stroke-[2.5]' : ''}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      </div>

      {/* SECURE STAFF PIN PAD LOGIN MODAL */}
      {isPinModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <div className={`rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border ${styles.borderStrong} ${styles.bgElevated} animate-in zoom-in-95 duration-150`}>
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500 text-slate-950">
                  <KeyRound className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight text-white">Staff Authentication</h3>
                  <span className="text-[10px] text-slate-400">Enter personal security PIN code</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPinModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center space-y-4">
              {/* Selected Staff Avatar */}
              {selectedStaffToLogin ? (
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 border-2 border-amber-500/40 font-black text-lg flex items-center justify-center mx-auto mb-1.5 shadow-md">
                    {selectedStaffToLogin.name.charAt(0)}
                  </div>
                  <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedStaffToLogin.name}</h4>
                  <span className="text-[10px] uppercase font-bold text-amber-500 font-mono tracking-wider">
                    {selectedStaffToLogin.role.replace('_', ' ')}
                  </span>
                </div>
              ) : (
                <div className="text-center">
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Currently Signed In:{' '}
                    <strong className={isDark ? 'text-white' : 'text-slate-900'}>{currentUser.name}</strong>
                  </span>
                </div>
              )}

              {/* Masked PIN Dots Indicator */}
              <div className="flex items-center justify-center gap-3.5 py-2">
                {[0, 1, 2, 3].map((idx) => {
                  const isFilled = enteredPin.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                        isFilled
                          ? 'bg-amber-500 border-amber-400 scale-125 shadow-md shadow-amber-500/40'
                          : `${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'}`
                      }`}
                    />
                  );
                })}
              </div>

              {/* Error Message */}
              {pinError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2.5 w-full max-w-[250px]">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleNumpadPress(digit)}
                    className={`h-12 rounded-2xl font-black text-lg transition duration-100 shadow-2xs border cursor-pointer active:scale-95 flex items-center justify-center ${
                      isDark
                        ? 'bg-slate-800/80 hover:bg-amber-500 hover:text-slate-950 text-white border-slate-700'
                        : 'bg-slate-100 hover:bg-amber-500 hover:text-slate-950 text-slate-900 border-slate-200'
                    }`}
                  >
                    {digit}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleNumpadClear}
                  className={`h-12 rounded-2xl text-xs font-bold transition border cursor-pointer active:scale-95 flex items-center justify-center ${
                    isDark
                      ? 'bg-slate-800/40 hover:bg-slate-800 text-slate-400 border-slate-700'
                      : 'bg-slate-50 hover:bg-slate-200 text-slate-600 border-slate-200'
                  }`}
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={() => handleNumpadPress('0')}
                  className={`h-12 rounded-2xl font-black text-lg transition duration-100 shadow-2xs border cursor-pointer active:scale-95 flex items-center justify-center ${
                    isDark
                      ? 'bg-slate-800/80 hover:bg-amber-500 hover:text-slate-950 text-white border-slate-700'
                      : 'bg-slate-100 hover:bg-amber-500 hover:text-slate-950 text-slate-900 border-slate-200'
                  }`}
                >
                  0
                </button>

                <button
                  type="button"
                  onClick={handleNumpadBackspace}
                  className={`h-12 rounded-2xl font-bold transition border cursor-pointer active:scale-95 flex items-center justify-center ${
                    isDark
                      ? 'bg-slate-800/40 hover:bg-slate-800 text-slate-400 border-slate-700'
                      : 'bg-slate-50 hover:bg-slate-200 text-slate-600 border-slate-200'
                  }`}
                  title="Backspace"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              {/* Staff Accounts Quick Switch */}
              <div className="w-full pt-3 border-t border-slate-800/60">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 text-center">
                  Select Staff Member:
                </span>
                <div className="flex flex-wrap gap-1.5 justify-center max-h-24 overflow-y-auto no-scrollbar">
                  {users.map((u) => {
                    const isSelected = (selectedStaffToLogin?.id || currentUser.id) === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedStaffToLogin(u);
                          setEnteredPin('');
                          setPinError(null);
                        }}
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-xs'
                            : `${isDark ? 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-slate-950' : 'bg-amber-500'}`} />
                        <span>{u.name}</span>
                        <span className="opacity-70 text-[9px] uppercase">({u.role.replace('_', ' ')})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
