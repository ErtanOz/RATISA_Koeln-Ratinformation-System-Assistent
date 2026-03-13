import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from './useTheme';

type MatchMediaListener = (event: MediaQueryListEvent) => void;

let systemPrefersDark = false;
let listeners = new Set<MatchMediaListener>();

const installMatchMedia = () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: systemPrefersDark,
      media: query,
      onchange: null,
      addEventListener: (_event: 'change', listener: MatchMediaListener) => listeners.add(listener),
      removeEventListener: (_event: 'change', listener: MatchMediaListener) => listeners.delete(listener),
      addListener: (listener: MatchMediaListener) => listeners.add(listener),
      removeListener: (listener: MatchMediaListener) => listeners.delete(listener),
      dispatchEvent: vi.fn(),
    })),
  });
};

const emitSystemTheme = (mode: 'light' | 'dark') => {
  systemPrefersDark = mode === 'dark';
  const event = { matches: systemPrefersDark } as MediaQueryListEvent;
  listeners.forEach((listener) => listener(event));
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    systemPrefersDark = false;
    listeners = new Set<MatchMediaListener>();
    installMatchMedia();

    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';

    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (!(themeColorMeta instanceof HTMLMetaElement)) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.setAttribute('content', '#F3F1EC');
  });

  it('defaults to system preference and reacts to system theme changes', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.preference).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#F3F1EC');

    act(() => emitSystemTheme('dark'));

    await waitFor(() => expect(result.current.resolvedTheme).toBe('dark'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#101820');
  });

  it('persists explicit preferences and rehydrates them on remount', async () => {
    const first = renderHook(() => useTheme(), { wrapper });

    act(() => first.result.current.setPreference('dark'));

    await waitFor(() => expect(first.result.current.resolvedTheme).toBe('dark'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#101820');

    act(() => emitSystemTheme('light'));
    expect(first.result.current.resolvedTheme).toBe('dark');

    first.unmount();

    const second = renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(second.result.current.preference).toBe('dark'));
    expect(second.result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
