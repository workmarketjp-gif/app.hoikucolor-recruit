import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loading / Error / Success for one server read, never conflated:
 * a failed read is `error` (with retry), not an empty list.
 *
 * `loader` is read through a ref, so callers may pass an inline closure without
 * re-triggering fetches on every render; only `key` changes refetch.
 */
export type Resource<T> =
  | { status: 'loading'; data: T | null; error: null; reload: () => void; setData: (next: T) => void }
  | { status: 'error'; data: T | null; error: string; reload: () => void; setData: (next: T) => void }
  | { status: 'success'; data: T; error: null; reload: () => void; setData: (next: T) => void };

const japaneseText = /[぀-ヿ㐀-鿿]/;

/**
 * User-facing message for a failed read/write. Server messages written for candidates
 * (Japanese) are kept; raw technical messages (JWT/PostgREST, English) are replaced by
 * the screen's own explanation. The error state itself is always shown, never hidden.
 */
export function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : '';
  return message && japaneseText.test(message) ? message : fallback;
}

export function useResource<T>(key: string | null, loader: () => Promise<T>, fallbackError: string): Resource<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'success'; data: T | null; error: string | null }>({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return;
    let active = true;
    // Keep the previous data visible while refetching (no flash to a spinner).
    setState((current) => ({ status: 'loading', data: current.data, error: null }));
    loaderRef.current()
      .then((data) => { if (active) setState({ status: 'success', data, error: null }); })
      .catch((error) => { if (active) setState((current) => ({ status: 'error', data: current.data, error: errorMessage(error, fallbackError) })); });
    return () => { active = false; };
  }, [key, attempt, fallbackError]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const setData = useCallback((next: T) => setState({ status: 'success', data: next, error: null }), []);

  return { ...state, reload, setData } as Resource<T>;
}
