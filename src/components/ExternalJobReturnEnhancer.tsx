import { useEffect, useState } from 'react';
import { getRankedJob } from '../lib/recruitRepository';
import './ExternalJobReturnEnhancer.css';

const returnStorageKey = 'hc_jobseeker_safe_job_return';
const jobIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeJobReturnTarget(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (url.pathname.replace(/\/$/, '') !== '/jobs') return null;
    const jobId = url.searchParams.get('job_id');
    if (!jobId || !jobIdPattern.test(jobId)) return null;
    return `/jobs?job_id=${encodeURIComponent(jobId)}`;
  } catch {
    return null;
  }
}

function currentJobTarget(): string | null {
  if (window.location.pathname.replace(/\/$/, '') !== '/jobs') return null;
  const jobId = new URLSearchParams(window.location.search).get('job_id');
  return jobId && jobIdPattern.test(jobId) ? `/jobs?job_id=${encodeURIComponent(jobId)}` : null;
}

function observeUntilResolved(check: () => boolean) {
  if (check()) return () => undefined;
  const observer = new MutationObserver(() => {
    if (check()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function ExternalJobReturnEnhancer() {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const explicitReturn = normalizeJobReturnTarget(params.get('return_to'));
    if (explicitReturn) sessionStorage.setItem(returnStorageKey, explicitReturn);

    const directTarget = currentJobTarget();
    if (!directTarget) return;

    return observeUntilResolved(() => {
      if (document.querySelector('.hc-auth-page')) {
        sessionStorage.setItem(returnStorageKey, directTarget);
        return true;
      }
      if (document.querySelector('.app-shell')) {
        sessionStorage.removeItem(returnStorageKey);
        return true;
      }
      return false;
    });
  }, []);

  useEffect(() => {
    if (window.location.pathname !== '/') return;
    const storedTarget = normalizeJobReturnTarget(sessionStorage.getItem(returnStorageKey));
    if (!storedTarget) {
      sessionStorage.removeItem(returnStorageKey);
      return;
    }

    return observeUntilResolved(() => {
      if (!document.querySelector('.app-shell')) return false;
      sessionStorage.removeItem(returnStorageKey);
      window.location.replace(storedTarget);
      return true;
    });
  }, []);

  useEffect(() => {
    const target = currentJobTarget();
    if (!target) return;
    const jobId = new URLSearchParams(target.split('?')[1]).get('job_id');
    if (!jobId) return;

    let cancelled = false;
    let cardObserver: MutationObserver | null = null;

    const revealTargetJob = async () => {
      try {
        const job = await getRankedJob(jobId);
        if (cancelled) return;
        if (!job) {
          setNotice('この求人は公開を終了したか、現在は表示できません。求人一覧から最新の募集をご確認ください。');
          return;
        }

        const focusCard = () => {
          const card = document.querySelector<HTMLElement>(`.job-card[data-job-id="${jobId}"]`);
          if (!card) return false;

          card.classList.add('hc-deep-linked-job');
          card.tabIndex = -1;
          const detailButton = Array.from(card.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('詳しく見る'));
          detailButton?.click();
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          window.setTimeout(() => card.focus({ preventScroll: true }), 350);
          setNotice(null);
          return true;
        };

        if (focusCard()) return;
        cardObserver = new MutationObserver(() => {
          if (focusCard()) cardObserver?.disconnect();
        });
        cardObserver.observe(document.body, { childList: true, subtree: true });
      } catch {
        if (!cancelled) setNotice(null);
      }
    };

    const stopWaiting = observeUntilResolved(() => {
      const contentReady = Boolean(document.querySelector('.content .job-grid, .content .empty-state, .content .loading-view'));
      if (!contentReady) return false;
      void revealTargetJob();
      return true;
    });

    return () => {
      cancelled = true;
      stopWaiting();
      cardObserver?.disconnect();
    };
  }, []);

  if (!notice) return null;
  return <div className="hc-job-return-notice" role="status">{notice}</div>;
}
