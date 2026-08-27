import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if dismissed before
    const dismissed = localStorage.getItem('installPromptDismissed');
    if (dismissed) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // iOS detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari) {
      setShowInstall(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setShowInstall(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowInstall(false);
    localStorage.setItem('installPromptDismissed', Date.now().toString());
  };

  if (isInstalled || !showInstall) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  return (
    <div style={styles.banner}>
      <div style={styles.content}>
        <div style={styles.icon}>📱</div>
        <div style={styles.text}>
          <div style={styles.title}>Install Trippletone POS</div>
          <div style={styles.subtitle}>
            {isIOS
              ? 'Tap the Share button, then "Add to Home Screen"'
              : 'Add to your home screen for quick access'}
          </div>
        </div>
        <div style={styles.actions}>
          {!isIOS && deferredPrompt && (
            <button onClick={handleInstall} style={styles.installBtn}>
              Install
            </button>
          )}
          <button onClick={handleDismiss} style={styles.dismissBtn}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  banner: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
    color: '#fff',
    padding: '14px 20px',
    zIndex: 9999,
    boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  icon: {
    fontSize: '28px',
    flexShrink: 0,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: 700,
    fontSize: '15px',
  },
  subtitle: {
    fontSize: '12px',
    opacity: 0.8,
    marginTop: '2px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  installBtn: {
    background: '#e94560',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
  },
  dismissBtn: {
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    border: 'none',
    padding: '10px 12px',
    borderRadius: '8px',
    fontSize: '16px',
    cursor: 'pointer',
  },
};
