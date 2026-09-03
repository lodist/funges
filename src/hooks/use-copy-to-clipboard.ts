import { useCallback, useEffect, useRef, useState } from 'react';

const RESET_AFTER_MS = 2000;

type CopyState = {
  status: 'idle' | 'copied' | 'error';
  /** Which target was copied, when a surface has more than one. */
  key: string | null;
};

/**
 * Copies text and reports whether it worked. `navigator.clipboard` is absent in
 * insecure contexts and rejects on iOS Safari outside a user gesture, so the
 * failure has to reach the reader instead of the console.
 */
export const useCopyToClipboard = () => {
  const [state, setState] = useState<CopyState>({ status: 'idle', key: null });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (text: string, key: string | null = null) => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState({ status: 'copied', key });
    } catch {
      setState({ status: 'error', key });
    }
    timer.current = setTimeout(
      () => setState({ status: 'idle', key: null }),
      RESET_AFTER_MS
    );
  }, []);

  return { ...state, copy };
};
