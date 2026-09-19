import { useEffect, useState } from 'react';
import './WebConnectivityBanner.css';

function readOnlineState() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function WebConnectivityBanner() {
  const [online, setOnline] = useState(readOnlineState);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="connectivity-banner" role="status" aria-live="polite">
      <span>オフラインです。接続を確認して再読み込みしてください。</span>
      <button type="button" onClick={() => window.location.reload()}>再読み込み</button>
    </div>
  );
}
