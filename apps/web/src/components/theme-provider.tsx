import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

type Theme = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  resolved: 'dark',
});

const STORAGE_KEY = 'graflare-theme';

const getStoredTheme = (): Theme => {
  if (globalThis.localStorage === undefined) return 'system';
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
};

const getSystemTheme = (): 'light' | 'dark' =>
  typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

const applyTheme = (resolved: 'light' | 'dark') => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }
};

let currentTheme: Theme = getStoredTheme();
const listeners = new Set<() => void>();

const notifyListeners = () => {
  for (const listener of listeners) listener();
};

const themeSubscribe = (onStoreChange: () => void) => {
  listeners.add(onStoreChange);
  return () => { listeners.delete(onStoreChange); };
};
const themeGetSnapshot = (): Theme => currentTheme;
const themeGetServerSnapshot = (): Theme => 'system';

const systemThemeSubscribe = (onStoreChange: () => void) => {
  if (typeof globalThis.matchMedia !== 'function') return () => {};
  const mq = globalThis.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onStoreChange);
  return () => { mq.removeEventListener('change', onStoreChange); };
};
const systemThemeGetServerSnapshot = (): 'light' | 'dark' => 'dark';

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const theme = useSyncExternalStore(themeSubscribe, themeGetSnapshot, themeGetServerSnapshot);
  const systemTheme = useSyncExternalStore(systemThemeSubscribe, getSystemTheme, systemThemeGetServerSnapshot);

  const resolved = theme === 'system' ? systemTheme : theme;

  const setTheme = useCallback((next: Theme) => {
    currentTheme = next;
    if (globalThis.localStorage !== undefined) {
      globalThis.localStorage.setItem(STORAGE_KEY, next);
    }
    notifyListeners();
  }, []);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, resolved }),
    [theme, setTheme, resolved],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
};

export const useTheme = () => useContext(ThemeContext);
