import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { IdentifyPanel } from '@/components/IdentifyPanel';
import { getAnyCachedModel } from '@/lib/modelCache';

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
// jsdom has no IndexedDB, so the real cache would reject. Defaults to "nothing
// cached" for the tests above; the staging test overrides it.
vi.mock('@/lib/modelCache', () => ({
  getAnyCachedModel: vi.fn().mockResolvedValue(null),
  downloadModel: vi.fn(),
  removeModel: vi.fn(),
}));

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

/**
 * Picking a photo STAGES it. It does not identify.
 *
 * That distinction is the whole point of collecting angles before the run: the
 * user is crouched in front of the find and can take the underside and the stem
 * base in one go. If picking a photo went straight to a result, the second angle
 * would have to be asked for afterwards — and once a ranked list with a
 * confident-looking percentage is on screen, it rarely gets taken.
 */
describe('IdentifyPanel photo staging', () => {
  it('waits for an explicit Identify rather than running on pick', async () => {
    vi.mocked(getAnyCachedModel).mockResolvedValue({
      blob: new Blob([new Uint8Array(4)]),
      info: { variant: 'int8', version: 'test', bytes: 4 },
    } as never);

    render(<IdentifyPanel open onClose={() => {}} />);

    // Capture phase, reached because a model is cached. Queried from the DOM
    // rather than via a test id: the input is deliberately sr-only inside its
    // label, and production markup should not carry hooks for tests.
    await screen.findByText(/drop a photo here|take a photo/i);
    // Radix renders the dialog into a portal, so this is on document.body.
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    });

    // The run button appears only once something is staged.
    expect(await screen.findByText('Identify this find')).toBeInTheDocument();

    // The staged photo can be removed, and the button actually has its glyph.
    // It shipped once as an empty pill: the icon element rendered nothing while
    // the button still painted, which is invisible to any test that only checks
    // the button exists.
    const remove = screen.getByLabelText('Remove this photo');
    expect(remove.querySelector('svg')).not.toBeNull();
    // And nothing started on its own.
    expect(screen.queryByText(/^Identifying/)).not.toBeInTheDocument();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('accepts up to three gallery photos in one selection', async () => {
    vi.mocked(getAnyCachedModel).mockResolvedValue({
      blob: new Blob([new Uint8Array(4)]),
      info: { variant: 'int8', version: 'test', bytes: 4 },
    } as never);

    render(<IdentifyPanel open onClose={() => {}} />);

    await screen.findByText(/drop a photo here|take a photo/i);
    const galleryInput = document.querySelector<HTMLInputElement>(
      'input[type="file"][multiple]'
    )!;
    expect(galleryInput).not.toBeNull();

    fireEvent.change(galleryInput, {
      target: {
        files: [
          new File(['1'], 'one.jpg', { type: 'image/jpeg' }),
          new File(['2'], 'two.jpg', { type: 'image/jpeg' }),
          new File(['3'], 'three.jpg', { type: 'image/jpeg' }),
          new File(['4'], 'ignored.jpg', { type: 'image/jpeg' }),
        ],
      },
    });

    expect(await screen.findAllByLabelText('Remove this photo')).toHaveLength(
      3
    );
  });
});
