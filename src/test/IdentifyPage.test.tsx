import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import IdentifyPage from '@/pages/IdentifyPage';
import { BioclipSession } from '@/lib/bioclip/session';
import { getAnyCachedModel } from '@/lib/modelCache';

/**
 * The photo ID page. The model, the worker and the label matrix are mocked:
 * these tests are about what the page asks of the reader and when, not about
 * inference. jsdom has no image decoder, so every picked photo fails to
 * decode and is marked unreadable — which is exactly the path that has to keep
 * the photo visible and removable rather than silently dropping it.
 */

// The worker chain pulls ORT plus a 4MB asset import into the test if left.
vi.mock('@/lib/bioclip/session', () => ({
  BioclipSession: { create: vi.fn() },
}));
vi.mock('@/lib/bioclip/variant', () => {
  const int8 = {
    variant: 'int8',
    version: 'test',
    url: 'https://example.invalid/m.onnx',
    approxBytes: 307_000_000,
  };
  return {
    detectVariant: vi.fn().mockResolvedValue({ spec: int8, provider: 'wasm' }),
    isWebgpuUntrusted: vi.fn().mockReturnValue(false),
    markWebgpuUntrusted: vi.fn(),
    MODEL_VARIANTS: {
      int8,
      int4: {
        variant: 'int4',
        version: 'test4',
        url: 'https://example.invalid/m4.onnx',
        approxBytes: 280_000_000,
      },
    },
  };
});
vi.mock('@/lib/bioclip/classify', () => ({
  loadTextMatrix: vi.fn(),
  rankPredictions: vi.fn(),
  averageEmbeddings: vi.fn(),
}));
vi.mock('@/lib/bioclip/selfCheck', () => ({ runSelfCheck: vi.fn() }));
// jsdom has no IndexedDB. Defaults to "nothing cached"; tests that need the
// capture step put a model in place.
vi.mock('@/lib/modelCache', () => ({
  getAnyCachedModel: vi.fn().mockResolvedValue(null),
  downloadModel: vi.fn(),
  removeModel: vi.fn(),
}));

const cachedInt8 = () =>
  vi.mocked(getAnyCachedModel).mockResolvedValue({
    blob: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) },
    info: { variant: 'int8', version: 'test', bytes: 4 },
  } as never);

const galleryInput = () =>
  document.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;

beforeEach(() => {
  vi.mocked(getAnyCachedModel).mockResolvedValue(null);
  vi.mocked(BioclipSession.create).mockClear();
});

describe('IdentifyPage safety framing', () => {
  it('shows the never-eat warning as soon as the page opens', async () => {
    render(<IdentifyPage />);

    expect(
      await screen.findByText(/do not eat anything based on this app/i)
    ).toBeInTheDocument();
  });

  // The consequence is the half that changes behaviour. "Do not eat anything
  // based on this app" alone reads as boilerplate.
  it('states the consequence, not just the instruction', async () => {
    render(<IdentifyPage />);

    expect(
      await screen.findByText(/misidentification can be fatal/i)
    ).toBeInTheDocument();
  });
});

describe('IdentifyPage first visit', () => {
  it('offers the one-time download before any photo can be taken', async () => {
    render(<IdentifyPage />);

    // The size this device will actually download, from the probe's choice.
    expect(
      await screen.findByRole('button', { name: /download \(307 mb\)/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /identify this find/i })
    ).toBeNull();
  });
});

/**
 * Picking a photo STAGES it. It does not identify.
 *
 * That distinction is the whole point of the plate: the reader is crouched in
 * front of the find and can take the underside in the same moment. If picking
 * went straight to a result, the second angle would have to be asked for
 * afterwards, when the job already feels finished.
 */
describe('IdentifyPage plate', () => {
  it('waits for an explicit Identify rather than running on pick', async () => {
    cachedInt8();
    render(<IdentifyPage />);

    const run = await screen.findByRole('button', {
      name: /identify this find/i,
    });
    expect(run).toBeDisabled();

    fireEvent.change(galleryInput(), {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(run).toBeEnabled());
    // The staged photo can be removed, and the button actually has its glyph.
    const remove = await screen.findByLabelText('Remove this photo');
    expect(remove.querySelector('svg')).not.toBeNull();
    // And nothing started on its own.
    expect(screen.queryByText(/^Identifying/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /possible matches/i })
    ).toBeNull();
  });

  it('accepts up to two gallery photos in one selection', async () => {
    cachedInt8();
    render(<IdentifyPage />);

    await screen.findByRole('button', { name: /identify this find/i });
    fireEvent.change(galleryInput(), {
      target: {
        files: [
          new File(['1'], 'one.jpg', { type: 'image/jpeg' }),
          new File(['2'], 'two.jpg', { type: 'image/jpeg' }),
          new File(['3'], 'three.jpg', { type: 'image/jpeg' }),
        ],
      },
    });

    expect(await screen.findAllByLabelText('Remove this photo')).toHaveLength(
      2
    );
  });

  it('keeps the second frame waiting until the first holds a photo', async () => {
    cachedInt8();
    render(<IdentifyPage />);

    await screen.findByRole('button', { name: /identify this find/i });
    // The first frame is a control; the second is only an outline so far, so
    // a photo meant for the top cannot land in the underside's frame.
    expect(screen.getByRole('button', { name: /top and cap/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /underside/i })).toBeNull();

    fireEvent.change(galleryInput(), {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    });

    expect(
      await screen.findByRole('button', { name: /underside/i })
    ).toBeEnabled();
  });
});

/**
 * The session is built when the page opens with a model on the device, not
 * after the first photo: reading ~300 MB and building the graph takes seconds
 * on a phone, and the camera is where that time can pass unnoticed.
 *
 * int8 is built on the CPU backend: WebGPU has no kernel for its matmuls, so a
 * WebGPU session is no faster and drifts from the numbers the gate measured.
 */
describe('IdentifyPage session', () => {
  it('builds once on open, on the CPU backend for int8', async () => {
    cachedInt8();
    render(<IdentifyPage />);

    await waitFor(() => expect(BioclipSession.create).toHaveBeenCalledTimes(1));
    expect(BioclipSession.create).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      { forceWasm: true }
    );
  });
});
