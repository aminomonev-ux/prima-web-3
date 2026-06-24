'use client';

import { useEffect } from 'react';

export default function BfcacheGuard({ userId }: { userId: number }) {
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // Router Next.js bisa corrupt setelah bfcache restore
        // Hard reload via window.location adalah satu-satunya cara reliable
        window.location.reload();
      }
    };

    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetch('/api/auth/me', { cache: 'no-store' })
          .then(r => r.json())
          .then(d => {
            if (!d.ok || String(d.userId) !== String(userId)) {
              window.location.href = '/login';
            }
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [userId]);

  return null;
}
