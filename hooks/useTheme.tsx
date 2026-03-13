import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ratisa_theme_preference';
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

const THEME_META_COLORS: Record<ResolvedTheme, string> = {
  light: '#F3F1EC',
  dark: '#101820',
};

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

export const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(THEME_MEDIA_QUERY).matches ? 'dark' : 'light';
};

export const resolveTheme = (
  preference: ThemePreference,
  systemTheme: ResolvedTheme = getSystemTheme(),
): ResolvedTheme => (preference === 'system' ? systemTheme : preference);

export const readStoredThemePreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'system';

  try {
    const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(storedPreference)) return storedPreference;
  } catch (error) {
    console.warn('Theme preference could not be read from storage.', error);
  }

  return 'system';
};

export const persistThemePreference = (preference: ThemePreference) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch (error) {
    console.warn('Theme preference could not be stored.', error);
  }
};

export const applyResolvedTheme = (theme: ResolvedTheme) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta instanceof HTMLMetaElement) {
    themeColorMeta.content = THEME_META_COLORS[theme];
  }
};

export const initializeTheme = () => {
  const preference = readStoredThemePreference();
  const resolvedTheme = resolveTheme(preference);
  applyResolvedTheme(resolvedTheme);

  return { preference, resolvedTheme };
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredThemePreference());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);
    const updateSystemTheme = (event?: MediaQueryListEvent) => {
      setSystemTheme(event?.matches ?? mediaQuery.matches ? 'dark' : 'light');
    };

    updateSystemTheme();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateSystemTheme);
      return () => mediaQuery.removeEventListener('change', updateSystemTheme);
    }

    mediaQuery.addListener(updateSystemTheme);
    return () => mediaQuery.removeListener(updateSystemTheme);
  }, []);

  const resolvedTheme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    persistThemePreference(nextPreference);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      setPreference,
    }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }
  return context;
};
