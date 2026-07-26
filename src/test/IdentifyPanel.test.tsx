import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { IdentifyPanel } from '@/components/IdentifyPanel';

/**
 * One test, one job: the never-eat warning must be on screen from the moment the
 * dialog opens.
 *
 * It used to close the results list, so it only existed once a ranked list of
 * species had already been offered. Moving it under the title made
 * IdentifyResults.test.tsx go red, which was the right outcome — that assertion
 * guards the safety framing and had to move with the copy rather than be dropped.
 *
 * Rendered with `open` and no cached model: jsdom has no IndexedDB, so the cache
 * lookup rejects and the panel falls through to its download gate. That is fine
 * here, and is in fact the strongest case to assert — the warning has to be
 * visible before a photo is ever taken, not only alongside results.
 */

// The worker chain is irrelevant to this assertion and pulls ORT plus a 4MB
// asset import into the test if left alone.
vi.mock('@/lib/bioclip/session', () => ({
  BioclipSession: { create: vi.fn() },
}));
vi.mock('@/lib/bioclip/variant', () => ({
  detectVariant: vi.fn().mockResolvedValue({
    spec: {
      variant: 'int8',
      version: 'test',
      url: 'https://example.invalid/m.onnx',
      approxBytes: 307_000_000,
    },
    provider: 'wasm',
  }),
  markWebgpuUntrusted: vi.fn(),
  MODEL_VARIANTS: {
    int8: {
      variant: 'int8',
      version: 'test',
      url: 'https://example.invalid/m.onnx',
      approxBytes: 307_000_000,
    },
    int4: {
      variant: 'int4',
      version: 'test4',
      url: 'https://example.invalid/m4.onnx',
      approxBytes: 280_000_000,
    },
  },
}));
vi.mock('@/lib/bioclip/classify', () => ({
  loadTextMatrix: vi.fn(),
  rankPredictions: vi.fn(),
}));
vi.mock('@/lib/bioclip/selfCheck', () => ({ runSelfCheck: vi.fn() }));

describe('IdentifyPanel safety framing', () => {
  it('shows the never-eat warning as soon as the dialog opens', async () => {
    render(<IdentifyPanel open onClose={() => {}} />);

    expect(
      await screen.findByText(/do not eat anything based on this app/i)
    ).toBeInTheDocument();
  });

  // The consequence is the half that changes behaviour. "Do not eat anything
  // based on this app" alone reads as boilerplate; the reason it matters is that
  // getting it wrong can kill you.
  it('states the consequence, not just the instruction', async () => {
    render(<IdentifyPanel open onClose={() => {}} />);

    expect(
      await screen.findByText(/misidentification can be fatal/i)
    ).toBeInTheDocument();
  });
});
