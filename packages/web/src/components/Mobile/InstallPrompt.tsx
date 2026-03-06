import { useState, useEffect } from 'react';

/**
 * PWA install banner shown on the 2nd+ visit when the browser
 * fires `beforeinstallprompt`. Dismissible, persisted via localStorage.
 * Only visible on mobile (md:hidden).
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa-install-dismissed') === 'true',
  );
  const [visitCount] = useState(() => {
    const count = parseInt(localStorage.getItem('pwa-visit-count') || '0', 10) + 1;
    localStorage.setItem('pwa-visit-count', String(count));
    return count;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed || visitCount < 2) return null;

  const handleInstall = async () => {
    // The prompt interface is not fully typed; use a cast
    const promptEvent = deferredPrompt as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-accent/10 border-b border-accent/20 px-4 py-2 flex items-center justify-between z-50 md:hidden"
      role="alert"
    >
      <span className="text-xs text-th-text">📱 Install Flightdeck for faster access</span>
      <div className="flex gap-2">
        <button
          onClick={handleInstall}
          className="text-xs px-3 py-1 bg-accent text-white rounded-md"
        >
          Install
        </button>
        <button onClick={handleDismiss} className="text-xs text-th-text-muted">
          Not now
        </button>
      </div>
    </div>
  );
}
