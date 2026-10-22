import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeMode } from '../types/restaurant';

export interface ThemeStyles {
  isDark: boolean;
  label: string;
  description: string;
  swatches: string[];
  bgApp: string;
  bgSurface: string;
  bgSubtle: string;
  bgCard: string;
  bgElevated: string;
  borderDefault: string;
  borderStrong: string;
  borderSubtle: string;
  borderAccent: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textAccent: string;
  accentPrimary: string;
  accentHover: string;
  accentText: string;
  accentSoft: string;
  badgeBg: string;
  sidebarBg: string;
}

export interface CustomThemeConfig {
  canvas: string;
  surface: string;
  primary: string;
  primaryHover: string;
  text: string;
  mutedText: string;
  border: string;
}

export const DEFAULT_CUSTOM_THEME: CustomThemeConfig = {
  canvas: '#FCFBF8',
  surface: '#FFFDFC',
  primary: '#16665A',
  primaryHover: '#115448',
  text: '#18302D',
  mutedText: '#62716D',
  border: '#E8E3DA',
};

const PRESET_THEME_COLORS: Record<Exclude<ThemeMode, 'custom'>, CustomThemeConfig> = {
  'forest-topbar': DEFAULT_CUSTOM_THEME,
  'midnight-navy': { canvas: '#0E141B', surface: '#17212B', primary: '#D99A35', primaryHover: '#F0B64E', text: '#F4F7F8', mutedText: '#B8C5CB', border: '#304150' },
  'light-clean': { canvas: '#F3F7FD', surface: '#FFFFFF', primary: '#2563EB', primaryHover: '#1D4ED8', text: '#172554', mutedText: '#58677E', border: '#D9E2F0' },
  'bistro-cream': { canvas: '#FAF3EB', surface: '#FFFDFC', primary: '#B85C38', primaryHover: '#934528', text: '#3B2720', mutedText: '#76635C', border: '#E7D7CB' },
  'emerald-clean': { canvas: '#071914', surface: '#10271F', primary: '#24B58B', primaryHover: '#48D3A8', text: '#ECFCF6', mutedText: '#B3D3C7', border: '#285848' },
  'saffron-counter': { canvas: '#F7F7F2', surface: '#FFFFFF', primary: '#F4C542', primaryHover: '#E5B52F', text: '#171717', mutedText: '#5D5D57', border: '#DDDCD2' },
  'espresso-cafe': { canvas: '#F6F0E9', surface: '#FFFDFC', primary: '#6F3D2E', primaryHover: '#512A20', text: '#2D1A16', mutedText: '#725F58', border: '#E3D5CC' },
  'ocean-grill': { canvas: '#F1F8F8', surface: '#FFFFFF', primary: '#007C83', primaryHover: '#005D62', text: '#12393D', mutedText: '#567276', border: '#CEE1E1' },
};

const isDarkColor = (hex: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const [red, green, blue] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = [red, green, blue].map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] < 0.2;
};

const primaryTextColor = (hex: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#FFFFFF';
  const [red, green, blue] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = [red, green, blue].map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const lightness = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return lightness > 0.44 ? '#171717' : '#FFFFFF';
};

export interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  customTheme: CustomThemeConfig;
  setCustomTheme: (config: CustomThemeConfig) => void;
  resetCustomTheme: () => void;
  styles: ThemeStyles;
  isDark: boolean;
}

export const THEME_PRESETS: Record<ThemeMode, ThemeStyles> = {
  'forest-topbar': {
    isDark: false,
    label: 'Classic Forest Green',
    description: 'The balanced daytime POS: porcelain surfaces and confident forest actions',
    swatches: ['#FCFBF8', '#18302D', '#16665A'],
    bgApp: 'bg-[#FCFBF8]', bgSurface: 'bg-[#FFFDFC]', bgSubtle: 'bg-[#F7F3EC]',
    bgCard: 'bg-white shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]', bgElevated: 'bg-white shadow-[0_18px_50px_-24px_rgba(24,48,45,0.34)]',
    borderDefault: 'border-[#E8E3DA]', borderStrong: 'border-[#D8D1C6]', borderSubtle: 'border-[#F0ECE5]', borderAccent: 'border-[#16665A]/35',
    textPrimary: 'text-[#18302D]', textSecondary: 'text-[#35514C]', textMuted: 'text-[#71807C]', textAccent: 'text-[#16665A]',
    accentPrimary: 'bg-[#16665A]', accentHover: 'hover:bg-[#115448]', accentText: 'text-white font-bold',
    accentSoft: 'bg-[#E8F3F0] border border-[#B9D8D0] text-[#145A4F]', badgeBg: 'bg-[#F2F5F3] text-[#35514C] border border-[#DCE8E3]',
    sidebarBg: 'bg-[#FFFDFC] border-r border-[#E8E3DA]',
  },
  'midnight-navy': {
    isDark: true,
    label: 'Midnight Service',
    description: 'A low-light service mode with deep navy panels and champagne actions',
    swatches: ['#090B0E', '#11141A', '#F59E0B'],
    bgApp: 'bg-[#090B0E]',
    bgSurface: 'bg-[#11141A]',
    bgSubtle: 'bg-[#161B22]',
    bgCard: 'bg-[#131720]',
    bgElevated: 'bg-[#181D27]',
    borderDefault: 'border-slate-800/90',
    borderStrong: 'border-slate-700',
    borderSubtle: 'border-slate-800/40',
    borderAccent: 'border-amber-400/40',
    textPrimary: 'text-slate-100',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-500',
    textAccent: 'text-amber-400',
    accentPrimary: 'bg-amber-500',
    accentHover: 'hover:bg-amber-400',
    accentText: 'text-slate-950 font-bold',
    accentSoft: 'bg-amber-500/10 border border-amber-500/30 text-amber-300',
    badgeBg: 'bg-slate-800/80 text-slate-300 border border-slate-700/80',
    sidebarBg: 'bg-[#11141A] border-r border-slate-800',
  },
  'light-clean': {
    isDark: false,
    label: 'Coastal Ledger',
    description: 'Cool white workspace with a crisp cobalt action system for busy counters',
    swatches: ['#F5F8FC', '#FFFFFF', '#2563EB'],
    bgApp: 'bg-[#F4F6F8]',
    bgSurface: 'bg-white',
    bgSubtle: 'bg-slate-50',
    bgCard: 'bg-white shadow-[0_2px_12px_-2px_rgba(0,0,0,0.04)]',
    bgElevated: 'bg-white shadow-xl',
    borderDefault: 'border-slate-200/90',
    borderStrong: 'border-slate-300',
    borderSubtle: 'border-slate-100',
    borderAccent: 'border-blue-400/40',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-700',
    textMuted: 'text-slate-500',
    textAccent: 'text-blue-700',
    accentPrimary: 'bg-blue-600',
    accentHover: 'hover:bg-blue-700',
    accentText: 'text-white font-bold',
    accentSoft: 'bg-blue-50 border border-blue-200 text-blue-900',
    badgeBg: 'bg-slate-100 text-slate-700 border border-slate-200',
    sidebarBg: 'bg-white border-r border-slate-200',
  },
  'bistro-cream': {
    isDark: false,
    label: 'Terracotta Bistro',
    description: 'Warm linen surfaces and terracotta actions for artisan or family dining',
    swatches: ['#F7F4EE', '#FFFDFB', '#C25E2E'],
    bgApp: 'bg-[#F7F4EE]',
    bgSurface: 'bg-[#FFFDFB]',
    bgSubtle: 'bg-[#F5F1E9]',
    bgCard: 'bg-[#FFFDFB] shadow-[0_2px_12px_-2px_rgba(40,30,20,0.05)]',
    bgElevated: 'bg-[#FFFDFB] shadow-xl',
    borderDefault: 'border-[#E6DFD3]',
    borderStrong: 'border-[#D4CBBF]',
    borderSubtle: 'border-[#EFE9DF]',
    borderAccent: 'border-orange-500/40',
    textPrimary: 'text-stone-900',
    textSecondary: 'text-stone-700',
    textMuted: 'text-stone-500',
    textAccent: 'text-orange-700',
    accentPrimary: 'bg-orange-600',
    accentHover: 'hover:bg-orange-700',
    accentText: 'text-white font-bold',
    accentSoft: 'bg-orange-50 border border-orange-200 text-orange-950',
    badgeBg: 'bg-[#EFE9DF] text-stone-800 border border-[#DDD5C7]',
    sidebarBg: 'bg-[#FFFDFB] border-r border-[#E6DFD3]',
  },
  'emerald-clean': {
    isDark: true,
    label: 'Jade After Hours',
    description: 'A calm dark-green service mode for late-night operations and lounges',
    swatches: ['#06120D', '#0B1A13', '#10B981'],
    bgApp: 'bg-[#06120D]',
    bgSurface: 'bg-[#0B1A13]',
    bgSubtle: 'bg-[#0F231A]',
    bgCard: 'bg-[#0D1E16]',
    bgElevated: 'bg-[#12281E]',
    borderDefault: 'border-emerald-900/60',
    borderStrong: 'border-emerald-700/60',
    borderSubtle: 'border-emerald-950/70',
    borderAccent: 'border-emerald-500/40',
    textPrimary: 'text-emerald-50',
    textSecondary: 'text-emerald-200/90',
    textMuted: 'text-emerald-400/60',
    textAccent: 'text-emerald-400',
    accentPrimary: 'bg-emerald-600',
    accentHover: 'hover:bg-emerald-500',
    accentText: 'text-slate-950 font-bold',
    accentSoft: 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300',
    badgeBg: 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60',
    sidebarBg: 'bg-[#0B1A13] border-r border-emerald-900/60',
  },
  'saffron-counter': {
    isDark: false,
    label: 'Saffron Counter',
    description: 'High-energy yellow, black, and white for quick-service counters and cafés',
    swatches: ['#F7F7F2', '#171717', '#F4C542'],
    bgApp: 'bg-[#F7F7F2]', bgSurface: 'bg-white', bgSubtle: 'bg-[#F1F0E9]',
    bgCard: 'bg-white shadow-[0_8px_24px_-18px_rgba(23,23,23,0.25)]', bgElevated: 'bg-white shadow-xl',
    borderDefault: 'border-[#DDDCD2]', borderStrong: 'border-[#C9C8BC]', borderSubtle: 'border-[#ECEBE4]', borderAccent: 'border-[#F4C542]/55',
    textPrimary: 'text-[#171717]', textSecondary: 'text-[#333333]', textMuted: 'text-[#5D5D57]', textAccent: 'text-[#8A6500]',
    accentPrimary: 'bg-[#F4C542]', accentHover: 'hover:bg-[#E5B52F]', accentText: 'text-[#171717] font-bold',
    accentSoft: 'bg-[#FFF4C7] border border-[#F4C542]/55 text-[#5A4300]', badgeBg: 'bg-[#F1F0E9] text-[#333333] border border-[#DDDCD2]',
    sidebarBg: 'bg-white border-r border-[#DDDCD2]',
  },
  'espresso-cafe': {
    isDark: false,
    label: 'Espresso Café',
    description: 'Coffee, cocoa, and cream for cafés, bakeries, and relaxed dining',
    swatches: ['#F6F0E9', '#2D1A16', '#6F3D2E'],
    bgApp: 'bg-[#F6F0E9]', bgSurface: 'bg-[#FFFDFC]', bgSubtle: 'bg-[#F2EAE2]',
    bgCard: 'bg-[#FFFDFC] shadow-[0_8px_24px_-18px_rgba(45,26,22,0.24)]', bgElevated: 'bg-[#FFFDFC] shadow-xl',
    borderDefault: 'border-[#E3D5CC]', borderStrong: 'border-[#D0BDB1]', borderSubtle: 'border-[#F0E7E1]', borderAccent: 'border-[#6F3D2E]/40',
    textPrimary: 'text-[#2D1A16]', textSecondary: 'text-[#503630]', textMuted: 'text-[#725F58]', textAccent: 'text-[#6F3D2E]',
    accentPrimary: 'bg-[#6F3D2E]', accentHover: 'hover:bg-[#512A20]', accentText: 'text-white font-bold',
    accentSoft: 'bg-[#F4E7DF] border border-[#DAB9A9] text-[#5A3024]', badgeBg: 'bg-[#F2EAE2] text-[#503630] border border-[#E3D5CC]',
    sidebarBg: 'bg-[#FFFDFC] border-r border-[#E3D5CC]',
  },
  'ocean-grill': {
    isDark: false,
    label: 'Ocean Grill',
    description: 'Fresh sea-glass teal for seafood, grill, and contemporary casual dining',
    swatches: ['#F1F8F8', '#12393D', '#007C83'],
    bgApp: 'bg-[#F1F8F8]', bgSurface: 'bg-white', bgSubtle: 'bg-[#E8F3F3]',
    bgCard: 'bg-white shadow-[0_8px_24px_-18px_rgba(18,57,61,0.24)]', bgElevated: 'bg-white shadow-xl',
    borderDefault: 'border-[#CEE1E1]', borderStrong: 'border-[#AFCECF]', borderSubtle: 'border-[#E4F0F0]', borderAccent: 'border-[#007C83]/40',
    textPrimary: 'text-[#12393D]', textSecondary: 'text-[#34585C]', textMuted: 'text-[#567276]', textAccent: 'text-[#007C83]',
    accentPrimary: 'bg-[#007C83]', accentHover: 'hover:bg-[#005D62]', accentText: 'text-white font-bold',
    accentSoft: 'bg-[#E2F1F1] border border-[#A7D3D4] text-[#005D62]', badgeBg: 'bg-[#E8F3F3] text-[#34585C] border border-[#CEE1E1]',
    sidebarBg: 'bg-white border-r border-[#CEE1E1]',
  },
  custom: {
    isDark: false,
    label: 'Custom Workspace',
    description: 'Your saved desktop colors for this Windows device',
    swatches: ['#FCFBF8', '#FFFDFC', '#16665A'],
    bgApp: 'bg-[var(--rf-canvas)]', bgSurface: 'bg-[var(--rf-surface)]', bgSubtle: 'bg-[color-mix(in_srgb,var(--rf-canvas)_88%,var(--rf-primary)_12%)]',
    bgCard: 'bg-[var(--rf-surface)] shadow-[0_8px_24px_-18px_rgba(24,48,45,0.32)]', bgElevated: 'bg-[var(--rf-surface)] shadow-[0_18px_50px_-24px_rgba(24,48,45,0.34)]',
    borderDefault: 'border-[var(--rf-line)]', borderStrong: 'border-[var(--rf-line)]', borderSubtle: 'border-[var(--rf-line)]', borderAccent: 'border-[var(--rf-primary)]/35',
    textPrimary: 'text-[var(--rf-ink)]', textSecondary: 'text-[var(--rf-muted)]', textMuted: 'text-[var(--rf-muted)]', textAccent: 'text-[var(--rf-primary)]',
    accentPrimary: 'bg-[var(--rf-primary)]', accentHover: 'hover:bg-[var(--rf-primary-hover)]', accentText: 'text-white font-bold',
    accentSoft: 'bg-[color-mix(in_srgb,var(--rf-canvas)_88%,var(--rf-primary)_12%)] border border-[var(--rf-line)] text-[var(--rf-primary)]', badgeBg: 'bg-[var(--rf-surface)] text-[var(--rf-muted)] border border-[var(--rf-line)]',
    sidebarBg: 'bg-[var(--rf-surface)] border-r border-[var(--rf-line)]',
  },
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'forest-topbar',
  setTheme: () => {},
  customTheme: DEFAULT_CUSTOM_THEME,
  setCustomTheme: () => {},
  resetCustomTheme: () => {},
  styles: THEME_PRESETS['forest-topbar'],
  isDark: false,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('restoflow_theme');
      if (saved && saved in THEME_PRESETS) return saved as ThemeMode;
    } catch {
      // fallback
    }
    return 'forest-topbar';
  });

  const [customTheme, setCustomThemeState] = useState<CustomThemeConfig>(() => {
    try {
      const saved = localStorage.getItem('restoflow_custom_theme');
      if (!saved) return DEFAULT_CUSTOM_THEME;
      const candidate = JSON.parse(saved) as Partial<CustomThemeConfig>;
      return { ...DEFAULT_CUSTOM_THEME, ...candidate };
    } catch {
      return DEFAULT_CUSTOM_THEME;
    }
  });

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    try {
      localStorage.setItem('restoflow_theme', mode);
    } catch {
      // storage unavailable
    }
  };

  const setCustomTheme = (config: CustomThemeConfig) => {
    setCustomThemeState(config);
    try {
      localStorage.setItem('restoflow_custom_theme', JSON.stringify(config));
    } catch {
      // storage unavailable
    }
  };

  const resetCustomTheme = () => setCustomTheme(DEFAULT_CUSTOM_THEME);

  const styles = THEME_PRESETS[theme] || THEME_PRESETS['forest-topbar'];
  const isDark = theme === 'custom' ? isDarkColor(customTheme.canvas) : styles.isDark;

  // Sync dark class on document element for tailwind
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  const activeThemeColors = theme === 'custom' ? customTheme : PRESET_THEME_COLORS[theme];
  const themeStyle = {
    '--rf-canvas': activeThemeColors.canvas,
    '--rf-surface': activeThemeColors.surface,
    '--rf-green': activeThemeColors.primary,
    '--rf-primary': activeThemeColors.primary,
    '--rf-green-hover': activeThemeColors.primaryHover,
    '--rf-primary-hover': activeThemeColors.primaryHover,
    '--rf-primary-text': primaryTextColor(activeThemeColors.primary),
    '--rf-green-soft': `color-mix(in srgb, ${activeThemeColors.canvas} 86%, ${activeThemeColors.primary} 14%)`,
    '--rf-ink': activeThemeColors.text,
    '--rf-muted': activeThemeColors.mutedText,
    '--rf-line': activeThemeColors.border,
  } as React.CSSProperties;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, customTheme, setCustomTheme, resetCustomTheme, styles, isDark }}>
      <div
        className={`rf-theme theme-${theme} min-h-screen ${styles.bgApp} ${styles.textPrimary} transition-colors duration-300 antialiased`}
        style={themeStyle}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(ThemeContext);
