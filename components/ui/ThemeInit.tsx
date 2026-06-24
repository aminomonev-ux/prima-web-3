'use client';

import { useEffect } from 'react';

/**
 * ThemeInit — restore data-theme dari DB preference saat hard-refresh.
 * Tidak ada UI — hanya apply data-theme ke <html> + sinkronisasi cookie.
 * Tambahkan ke setiap module page (blud, kinerja, usulan, dll) yang belum
 * punya ThemeToggle sendiri.
 */
export default function ThemeInit({ themePreference }: { themePreference: 'dark' | 'light' }) {
  useEffect(() => {
    if (themePreference === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    // Sinkronisasi cookie agar FOUC prevention konsisten
    document.cookie = `prima_theme=${themePreference};path=/;max-age=31536000;SameSite=Lax`;
  }, [themePreference]);

  return null;
}
