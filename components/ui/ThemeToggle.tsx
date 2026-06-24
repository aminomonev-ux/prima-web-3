'use client';

import { useState, useTransition } from 'react';
import { fetchJson } from '@/lib/shared/api';

interface ThemeToggleProps {
  /** Initial theme from server (DB preference) */
  initialTheme: 'dark' | 'light';
  /** Optional callback saat theme berubah — untuk parent yang perlu tahu */
  onThemeChange?: (theme: 'dark' | 'light') => void;
}

export default function ThemeToggle({ initialTheme, onThemeChange }: ThemeToggleProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [isPending, startTransition] = useTransition();

  const toggle = (next: 'dark' | 'light') => {
    if (next === theme || isPending) return;

    // Apply immediately to <html> for instant visual feedback
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    // Set cookie for FOUC prevention on next page load
    document.cookie = `prima_theme=${next};path=/;max-age=31536000;SameSite=Lax`;
    setTheme(next);
    onThemeChange?.(next);

    // Persist to DB in background — pakai fetchJson (L11f)
    startTransition(async () => {
      const prev = theme;
      const rollback = () => {
        if (next === 'light') {
          document.documentElement.removeAttribute('data-theme');
        } else {
          document.documentElement.setAttribute('data-theme', 'light');
        }
        document.cookie = `prima_theme=${prev};path=/;max-age=31536000;SameSite=Lax`;
        setTheme(prev);
      };

      try {
        const d = await fetchJson('/api/user/preferences', {
          method: 'PATCH',
          body: JSON.stringify({ themePreference: next }),
        });
        if (!d.ok) rollback();
      } catch {
        rollback();
      }
    });
  };

  return (
    <div
      className="theme-toggle-pill"
      role="group"
      aria-label="Pilih tema tampilan"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--theme-toggle-track, rgba(255,255,255,0.08))',
        borderRadius: '999px',
        padding: '3px',
        gap: '2px',
        border: '1px solid var(--theme-toggle-border, rgba(255,255,255,0.12))',
        position: 'relative',
      }}
    >
      {/* Dark segment */}
      <button
        type="button"
        onClick={() => toggle('dark')}
        aria-pressed={theme === 'dark'}
        data-tooltip="Tema gelap"
        data-tooltip-pos="below"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 12px',
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1,
          transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
          ...(theme === 'dark'
            ? {
                background: '#EF9F27',
                color: '#020F1C',
                boxShadow: '0 1px 4px rgba(239,159,39,0.5)',
              }
            : {
                background: 'transparent',
                color: 'var(--theme-toggle-inactive-text, rgba(255,255,255,0.45))',
                boxShadow: 'none',
              }),
        }}
      >
        {/* Moon icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
        Dark
      </button>

      {/* Light segment */}
      <button
        type="button"
        onClick={() => toggle('light')}
        aria-pressed={theme === 'light'}
        data-tooltip="Tema terang"
        data-tooltip-pos="below"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 12px',
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1,
          transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
          ...(theme === 'light'
            ? {
                background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                color: '#ffffff',
                boxShadow: '0 1px 4px rgba(139,92,246,0.45)',
              }
            : {
                background: 'transparent',
                color: 'var(--theme-toggle-inactive-text, rgba(255,255,255,0.45))',
                boxShadow: 'none',
              }),
        }}
      >
        {/* Sun icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
        Light
      </button>
    </div>
  );
}
