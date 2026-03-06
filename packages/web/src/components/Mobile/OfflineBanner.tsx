import { useState, useEffect } from 'react';

/**
 * Connectivity status banner.
 * Listens to browser online/offline events and shows a warning
 * when the user loses network connectivity.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center z-50"
      role="alert"
    >
      <span className="text-xs text-amber-400">📡 Offline — showing cached data</span>
    </div>
  );
}
