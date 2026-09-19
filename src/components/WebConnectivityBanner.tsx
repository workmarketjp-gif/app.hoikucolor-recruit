import { useEffect, useState } from 'react';
import './WebConnectivityBanner.css';

function readOnlineState() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function WebConnectivityBanner() {
  const [online, setOnline] = useState(readOnlineState);
  const [hasAppError, setHasAppError] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    const update = () => setHasAppError(Boolean(document.querySelector('.error-banner')));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (online && !hasAppError) return null;

  return (
    <div className="connectivity-banner" role="status" aria-live="polite">
      <span>{online ? 'データの取得に失敗しました。再試行してください。' : 'オフラインです。接続を確認して再読み込みしてください。'}</span>
      <button type="button" onClick={() => window.location.reload()}>{online ? '再試行' : '再読み込み'}</button>
    </div>
  );
}
