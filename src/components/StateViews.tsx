import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Inline, local error with a retry. Never a page-wide banner. */
export function InlineError({ message, onRetry, compact }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={`hc-inline-error ${compact ? 'is-compact' : ''}`} role="alert">
      <span>{compact ? '読み込めませんでした' : message}</span>
      {onRetry && <button type="button" onClick={onRetry}>もう一度</button>}
    </div>
  );
}

/** Real zero results (the read succeeded). */
export function EmptyState({ title, body, action, onAction, href }: { title: string; body?: string; action?: string; onAction?: () => void; href?: string }) {
  return (
    <div className="hc-empty">
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && href && <a className="primary-button" href={href}>{action}</a>}
      {action && onAction && !href && <button type="button" className="primary-button" onClick={onAction}>{action}</button>}
    </div>
  );
}

/** Placeholder rows shown only after a short delay, so fast reads never flash. */
export function SkeletonList({ rows = 3, delayMs = 300 }: { rows?: number; delayMs?: number }) {
  const visible = useDelayed(delayMs);
  if (!visible) return <div className="hc-skeleton-list is-pending" aria-busy="true" />;
  return (
    <div className="hc-skeleton-list" aria-busy="true" aria-label="読み込み中">
      {Array.from({ length: rows }, (_, index) => <div className="hc-skeleton-card" key={index}><span /><span /><span /></div>)}
    </div>
  );
}

export function useDelayed(delayMs: number) {
  const [visible, setVisible] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);
  return visible;
}

/** Small, transient message for actions (save toggle etc.). */
export function Toast({ message, tone = 'info', onClose }: { message: string | null; tone?: 'info' | 'error'; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, 3600);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className={`hc-toast is-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{message}</span>
      <button type="button" aria-label="閉じる" onClick={onClose}><Icon name="close" size={16} /></button>
    </div>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="hc-section-head"><h2>{title}</h2>{action}</div>;
}
