import React, { useState, useEffect } from 'react';
import { User, Branch } from '../../types/restaurant';
import { sqliteService } from '../../services/sqliteStorage';
import { useAppTheme } from '../../context/ThemeContext';
import { showUserError } from '../../utils/userFeedback';
import {
  Lock,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Delete,
  Sparkles,
  Info,
  Clock,
  MapPin,
  ChevronRight,
} from 'lucide-react';

interface LoginScreenProps {
  branch: Branch;
  onLoginSuccess: (user: User) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  branch,
  onLoginSuccess,
}) => {
  const { styles, isDark } = useAppTheme();
  const [users, setUsers] = useState<User[]>(() => sqliteService.getUsers());
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [ownerRecoveryEnabled, setOwnerRecoveryEnabled] = useState(false);
  const [recoveryPin, setRecoveryPin] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  // Live clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync users if modified in storage
  useEffect(() => {
    const desktop = window.restoFlowDesktop;
    if (!desktop) {
      setUsers(sqliteService.getUsers());
      return;
    }
    void desktop.auth.listUsers().then((staff) => {
      setUsers(staff.map((user) => ({ ...user, pin: '' })));
    }).catch((error) => {
      showUserError(error, 'Staff profiles could not be loaded. Restart the application and try again.');
      setErrorMessage('Staff profiles could not be loaded.');
    });
    void desktop.auth.recoveryStatus().then((status) => setOwnerRecoveryEnabled(status.enabled));
  }, []);

  // Web Audio keypad synthesizer
  const playBeep = (freq = 800) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch {
      // Audio autoplay policy fallback
    }
  };

  const playSuccessChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.16); // G5
      osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.24); // C6

      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } catch {
      // Audio autoplay policy fallback
    }
  };

  const handleNumpadPress = (digit: string) => {
    if (isSuccess || enteredPin.length >= 6) return;
    playBeep(900 + enteredPin.length * 50);
    const nextPin = enteredPin + digit;
    setEnteredPin(nextPin);
    setErrorMessage(null);

    // If 4 digits entered, validate immediately
    if (nextPin.length === 4) {
      void validateAndAuthorize(nextPin);
    }
  };

  const handleBackspace = () => {
    if (isSuccess) return;
    playBeep(450);
    setEnteredPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleClear = () => {
    if (isSuccess) return;
    playBeep(350);
    setEnteredPin('');
    setErrorMessage(null);
  };

  const validateAndAuthorize = async (pinToTest: string) => {
    // PINs may be shared.  Require the unique staff profile so a PIN cannot
    // accidentally authorize the first account that happens to use it.
    if (!selectedStaff) {
      setErrorMessage('Select your staff profile before entering a PIN.');
      setEnteredPin('');
      return;
    }
    const desktop = window.restoFlowDesktop;
    if (desktop) {
      try {
        const user = await desktop.auth.login({ userId: selectedStaff?.id, pin: pinToTest });
        setIsSuccess(true);
        playSuccessChime();
        setTimeout(() => onLoginSuccess({ ...user, pin: '' }), 400);
      } catch {
        setErrorMessage(selectedStaff ? `Access Denied: Incorrect PIN code for ${selectedStaff.name}.` : 'Access Denied: Unrecognized security PIN code.');
        setEnteredPin('');
      }
      return;
    }

    const authResult = sqliteService.authenticateUserWithPin(selectedStaff.id, pinToTest);
    if (authResult.success && authResult.user) {
      setIsSuccess(true);
      playSuccessChime();
      setTimeout(() => {
        onLoginSuccess(authResult.user!);
      }, 400);
    } else {
      setErrorMessage(`Access Denied: Incorrect PIN code for ${selectedStaff.name}.`);
      setEnteredPin('');
    }
  };

  const handleOwnerRecovery = async () => {
    if (!selectedStaff || selectedStaff.role !== 'super_admin') {
      setRecoveryMessage('Select the super-admin profile before resetting its PIN.');
      return;
    }
    if (!/^\d{4,6}$/.test(recoveryPin) || recoveryPin !== recoveryConfirm) {
      setRecoveryMessage('Enter matching 4 to 6 digit PIN values.');
      return;
    }
    try {
      await window.restoFlowDesktop?.auth.resetOwnerPin({ userId: selectedStaff.id, pin: recoveryPin });
      setRecoveryMessage('Owner PIN updated. Signing in now…');
      setEnteredPin(recoveryPin);
      setRecoveryConfirm('');
      const nextPin = recoveryPin;
      setRecoveryPin('');
      await validateAndAuthorize(nextPin);
    } catch (error) {
      setRecoveryMessage(showUserError(error, 'Owner PIN recovery could not be completed. Please try again.'));
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleNumpadPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enteredPin, selectedStaff, isSuccess]);

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin':
        return '#16665a';
      case 'manager':
        return '#2563eb';
      case 'cashier':
        return '#059669';
      case 'waiter':
        return '#0891b2';
      case 'kitchen_staff':
        return '#ea580c';
      case 'inventory_officer':
        return '#7c3aed';
      case 'accountant':
        return '#475569';
      default:
        return '#16665a';
    }
  };

  return (
    <div className={`min-h-screen w-screen ${styles.bgApp} flex flex-col justify-between p-4 sm:p-6 select-none overflow-y-auto`}>
      {/* Top Header Bar */}
      <header className="max-w-7xl mx-auto w-full px-5 py-3.5 rounded-2xl bg-[#FFFDFC] border border-[#E8E3DA] shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {/* Haute Monogram Crest */}
          <div className="relative group">
            <div className="w-11 h-11 rounded-xl bg-[#16665A] text-white flex items-center justify-center shadow-sm">
              <span className="font-black tracking-tight text-base">RF</span>
            </div>
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white ring-1 ring-emerald-400/50" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[#18302D]">
                RestoFlow
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-widest bg-[#E8F3F0] text-[#16665A] border border-[#B9D8D0] uppercase">
                Desktop POS
              </span>
            </div>
            <p className="text-xs text-[#71807C] flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3 h-3 text-[#16665A] shrink-0" />
              <span>{branch.name} • Terminal Station #01</span>
            </p>
          </div>
        </div>

        {/* Real-time Clock & Security Status */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-[#F7F3EC] border border-[#E8E3DA] text-right">
            <div className="text-xs font-mono font-black text-[#16665A] flex items-center gap-1.5 justify-end">
              <Clock className="w-3.5 h-3.5 text-[#16665A]" />
              <span>{currentTime.toLocaleTimeString()}</span>
            </div>
            <div className="text-[10px] text-[#71807C] font-medium">
              {currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

        </div>
      </header>

      {ownerRecoveryEnabled && (
        <section className="my-4 p-4 rounded-2xl bg-[#FFF8E8] border border-[#EBCB83] text-xs max-w-6xl mx-auto w-full">
          <div className="font-bold text-[#8A5B00]">Owner recovery mode</div>
          <p className="text-[#6C5A31] mt-1">This temporary local mode can reset only a selected super-admin PIN. It is disabled during normal application launches.</p>
          <div className="mt-3 flex flex-wrap gap-2 items-end">
            <label className="block text-[#6C5A31]">New PIN<input type="password" inputMode="numeric" maxLength={6} value={recoveryPin} onChange={(event) => setRecoveryPin(event.target.value.replace(/\D/g, ''))} className="block mt-1 w-32 px-3 py-2 rounded-lg bg-white border border-[#D8D1C6] text-[#18302D] font-mono" /></label>
            <label className="block text-[#6C5A31]">Confirm PIN<input type="password" inputMode="numeric" maxLength={6} value={recoveryConfirm} onChange={(event) => setRecoveryConfirm(event.target.value.replace(/\D/g, ''))} className="block mt-1 w-32 px-3 py-2 rounded-lg bg-white border border-[#D8D1C6] text-[#18302D] font-mono" /></label>
            <button type="button" onClick={() => void handleOwnerRecovery()} className="px-4 py-2 rounded-lg bg-[#16665A] hover:bg-[#115448] text-white font-bold">Reset selected super-admin PIN</button>
          </div>
          {recoveryMessage && <p className="mt-2 text-[#8A5B00] font-medium">{recoveryMessage}</p>}
        </section>
      )}

      {/* Center Main Stage: 2-Column Authentication Console */}
      <main className="my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch max-w-6xl mx-auto w-full">
        {/* Left Side: Staff Accounts Directory (Col 1-7) */}
        <section className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#FFFDFC] border border-[#E8E3DA] shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)] space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#18302D]">
                Welcome back
              </h2>
              <p className="text-xs text-[#71807C] mt-1">
                Select your unique staff profile, then enter its 4 to 6 digit PIN. PINs may be shared between accounts.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-[#F2F5F3] text-[#35514C] border border-[#DCE8E3]">
              {users.length} Registered Accounts
            </span>
          </div>

          {/* Staff Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1 no-scrollbar">
            {users.map((u) => {
              const isSelected = selectedStaff?.id === u.id;
              const roleColor = getRoleColor(u.role);
              return (
                <div
                  key={u.id}
                  onClick={() => {
                    setSelectedStaff(u);
                    setEnteredPin('');
                    setErrorMessage(null);
                  }}
                  className={`p-4 rounded-2xl border transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#E8F3F0] text-[#18302D] border-[#16665A] ring-4 ring-[#16665A]/15 shadow-lg scale-[1.01]'
                      : 'bg-white hover:bg-[#F7F3EC] text-[#18302D] border-[#E8E3DA] hover:border-[#B9D8D0]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl font-black text-sm flex items-center justify-center shrink-0 shadow-md ${
                        isSelected ? 'bg-[#16665A] text-white' : 'text-white'
                      }`}
                      style={{ backgroundColor: isSelected ? undefined : roleColor }}
                    >
                      {u.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className={`font-bold text-xs sm:text-sm truncate leading-tight ${isSelected ? 'text-[#18302D] font-extrabold' : 'text-[#18302D]'}`}>
                        {u.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`text-[9px] uppercase font-mono font-extrabold px-1.5 py-0.5 rounded ${
                            isSelected ? 'bg-[#16665A]/10 text-[#16665A]' : 'bg-[#F2F5F3] text-[#35514C]'
                          }`}
                        >
                          {u.role.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pl-1">
                    {isSelected ? (
                      <div className="w-6 h-6 rounded-full bg-[#16665A] text-white flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                      </div>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#A0ABA7]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedStaff && (
            <div className="pt-3 flex items-center justify-between text-xs text-[#71807C] border-t border-[#E8E3DA]">
              <span>Authenticating account: <strong className="text-[#16665A]">{selectedStaff.name}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setSelectedStaff(null);
                  setEnteredPin('');
                  setErrorMessage(null);
                }}
                className="text-[#71807C] hover:text-[#16665A] underline cursor-pointer text-xs"
              >
                Clear selection
              </button>
            </div>
          )}
        </section>

        {/* Right Side: Virtual Security PIN Pad (Col 8-12) */}
        <aside className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-sm p-6 sm:p-7 rounded-2xl bg-[#18302D] border border-[#254844] shadow-[0_20px_50px_-24px_rgba(24,48,45,0.55)] flex flex-col items-center space-y-4">
            {/* Header Badge */}
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-[#E8F3F0]/10 text-[#9AD4C6] border border-[#9AD4C6]/30 flex items-center justify-center mx-auto mb-2 shadow-inner">
                <KeyRound className="w-6 h-6 stroke-[2.2]" />
              </div>
              <h3 className="font-extrabold text-sm text-white">
                {selectedStaff ? `PIN for ${selectedStaff.name}` : 'Select a staff profile'}
              </h3>
              <p className="text-[11px] text-[#B8CBC6] mt-0.5">
                {selectedStaff ? `Role: ${selectedStaff.role.toUpperCase()}` : 'Choose your account before entering a PIN'}
              </p>
            </div>

            {/* Masked PIN 4-Dots Display */}
            <div className="flex items-center justify-center gap-4 py-2">
              {[0, 1, 2, 3].map((idx) => {
                const isFilled = enteredPin.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                      isFilled
                        ? 'bg-[#46B39E] border-[#B9E1D7] scale-125 shadow-lg shadow-[#46B39E]/40'
                        : 'bg-[#254844] border-[#3A615B]'
                    }`}
                  />
                );
              })}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="w-full p-2.5 bg-rose-400/10 border border-rose-300/30 text-rose-200 text-xs font-bold rounded-xl flex items-center gap-2 animate-in shake">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="leading-tight">{errorMessage}</span>
              </div>
            )}

            {/* Success Feedback */}
            {isSuccess && (
              <div className="w-full p-2.5 bg-[#46B39E]/10 border border-[#46B39E]/40 text-[#B9E1D7] text-xs font-bold rounded-xl flex items-center gap-2 animate-in zoom-in-95">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#9AD4C6]" />
                <span>Authorized! Initializing workstation...</span>
              </div>
            )}

            {/* 10-Key Virtual Keypad */}
            <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={isSuccess}
                  onClick={() => handleNumpadPress(digit)}
                  className="h-12 rounded-xl bg-[#254844] hover:bg-[#46B39E] hover:text-[#18302D] text-white font-black text-lg transition duration-100 shadow border border-[#3A615B] active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                disabled={isSuccess}
                onClick={handleClear}
                className="h-12 rounded-xl bg-[#254844]/50 hover:bg-[#254844] text-[#B8CBC6] hover:text-white text-xs font-bold transition border border-[#3A615B] active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                Clear
              </button>

              <button
                type="button"
                disabled={isSuccess}
                onClick={() => handleNumpadPress('0')}
                className="h-12 rounded-xl bg-[#254844] hover:bg-[#46B39E] hover:text-[#18302D] text-white font-black text-lg transition duration-100 shadow border border-[#3A615B] active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                0
              </button>

              <button
                type="button"
                disabled={isSuccess}
                onClick={handleBackspace}
                className="h-12 rounded-xl bg-[#254844]/50 hover:bg-[#254844] text-[#B8CBC6] hover:text-white font-bold transition border border-[#3A615B] active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-50"
                title="Backspace"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Manual Unlock / Sign In Trigger if 4 digits ready */}
            <button
              type="button"
              disabled={enteredPin.length < 4 || isSuccess || !selectedStaff}
              onClick={() => validateAndAuthorize(enteredPin)}
              className="w-full py-3 bg-[#46B39E] hover:bg-[#69C6B3] disabled:opacity-30 text-[#18302D] font-black text-xs rounded-xl shadow-lg shadow-black/15 transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <Lock className="w-4 h-4 stroke-[2.5]" />
              <span>Authorize & Sign In</span>
            </button>
          </div>
        </aside>
      </main>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto w-full px-1 pt-3 flex flex-wrap items-center justify-between text-[11px] text-[#71807C] gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#16665A]" />
          <span>RestoFlow Security Gateway • Role-Based Access Control (RBAC) Active</span>
        </div>
        <div>
          <span>Electron-SQLite Architecture • Offline Local Resilience v2.4</span>
        </div>
      </footer>
    </div>
  );
};
