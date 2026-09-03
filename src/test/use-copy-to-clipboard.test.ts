import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

// Copying an address is the one action on the support page whose result the
// reader cannot see: the clipboard is invisible. Both call sites shipped with
// the failure swallowed — one had no catch at all, the other logged to the
// console — so a forager on iOS Safari or on plain http tapped Copy, got
// nothing, and pasted whatever was there before. On a crypto address that is
// money.

const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
    writable: true,
  });

describe('useCopyToClipboard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports success and which target was copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.status).toBe('idle');

    await act(() => result.current.copy('bc1qaddress', 'bitcoin'));

    expect(writeText).toHaveBeenCalledWith('bc1qaddress');
    expect(result.current.status).toBe('copied');
    expect(result.current.key).toBe('bitcoin');
  });

  it('reports a rejected write instead of swallowing it', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });

    const { result } = renderHook(() => useCopyToClipboard());
    await act(() => result.current.copy('bc1qaddress', 'bitcoin'));

    expect(result.current.status).toBe('error');
    expect(result.current.key).toBe('bitcoin');
  });

  it('reports an absent clipboard — insecure context, not just a rejection', async () => {
    setClipboard(undefined);

    const { result } = renderHook(() => useCopyToClipboard());
    await act(() => result.current.copy('bc1qaddress'));

    expect(result.current.status).toBe('error');
  });

  it('returns to idle after the reset window', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });

    const { result } = renderHook(() => useCopyToClipboard());
    await act(() => result.current.copy('bc1qaddress', 'bitcoin'));

    act(() => void vi.advanceTimersByTime(1999));
    expect(result.current.status).toBe('copied');

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.status).toBe('idle');
    expect(result.current.key).toBeNull();
  });

  it('gives a second copy its own full window', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });

    const { result } = renderHook(() => useCopyToClipboard());
    await act(() => result.current.copy('bc1qaddress', 'bitcoin'));

    act(() => void vi.advanceTimersByTime(1500));
    await act(() => result.current.copy('0xaddress', 'ethereum'));

    // the first toast's timer must not cut this one short
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.status).toBe('copied');
    expect(result.current.key).toBe('ethereum');
  });

  it('drops its pending timer on unmount', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });

    const { result, unmount } = renderHook(() => useCopyToClipboard());
    await act(() => result.current.copy('bc1qaddress'));

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
