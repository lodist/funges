import { expect, test } from '@playwright/test';

/**
 * Smoke test for the ONNX inference worker, in a real browser.
 *
 * This is the "does the plumbing work at all" check the plan asked for before
 * building on onnxruntime-web: module worker + ORT + same-origin WASM paths +
 * Vite's bundling all have to line up, and each fails in an opaque way.
 *
 * It runs a 139-byte MatMul model, not the 306MB BioCLIP tower, so a failure
 * here means the plumbing is wrong rather than the model. The expected output is
 * exact (x @ W with fixed W), so "the session ran" is distinguishable from "the
 * session returned zeros".
 *
 * Cannot be a vitest test: jsdom has no WebAssembly worker environment and no
 * WebGPU, so it would exercise none of what can actually break.
 */

const TINY_MODEL = '/models/tiny_matmul.onnx';

test.describe('bioclip inference session', () => {
  test('creates a session in a worker and runs inference', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    await page.goto('/');

    const result = await page.evaluate(async modelUrl => {
      const { BioclipSession } = await import('/src/lib/bioclip/session.ts');
      const bytes = await (await fetch(modelUrl)).arrayBuffer();
      const { session, info } = await BioclipSession.create(bytes);
      // y = x @ W, W = arange(12).reshape(4,3) -> [[60, 70, 80]]
      const out = await session.embed(new Float32Array([1, 2, 3, 4]), [1, 4]);
      const embedding = Array.from(out);
      session.dispose();
      return { info, embedding };
    }, TINY_MODEL);

    // Headless Chromium has no GPU adapter, so this resolves to 'wasm' in CI.
    // That is the fallback path, and it is the one worth guarding here: WebGPU
    // needs a real device, which is what the staging preview on a phone is for.
    expect(['webgpu', 'wasm']).toContain(result.info.provider);
    console.log(`ORT execution provider: ${result.info.provider}`);

    expect(result.info.inputName).toBe('x');
    expect(result.info.outputName).toBe('y');

    expect(result.embedding).toHaveLength(3);
    expect(result.embedding[0]).toBeCloseTo(60, 3);
    expect(result.embedding[1]).toBeCloseTo(70, 3);
    expect(result.embedding[2]).toBeCloseTo(80, 3);

    // A 404 on an ORT .wasm file surfaces as a console error and a fallback,
    // not a thrown exception — so an otherwise-passing run can still mean the
    // runtime files are not being served from where we think.
    const ortErrors = consoleErrors.filter(e => /ort|wasm|worker/i.test(e));
    expect(ortErrors).toEqual([]);
  });

  test('serves the ORT runtime same-origin, not from a CDN', async ({
    page,
  }) => {
    // The on-device path exists so identification works with no signal. A CDN
    // dependency for a file needed on every cold start defeats that, and ORT's
    // default is a CDN.
    const requested: string[] = [];
    page.on('request', r => {
      const url = r.url();
      if (/\.wasm(\?|$)/.test(url)) requested.push(url);
    });

    await page.goto('/');
    await page.evaluate(async modelUrl => {
      const { BioclipSession } = await import('/src/lib/bioclip/session.ts');
      const bytes = await (await fetch(modelUrl)).arrayBuffer();
      const { session } = await BioclipSession.create(bytes);
      await session.embed(new Float32Array([1, 2, 3, 4]), [1, 4]);
      session.dispose();
    }, TINY_MODEL);

    expect(requested.length).toBeGreaterThan(0);
    const offOrigin = requested.filter(u => !u.startsWith('http://localhost'));
    expect(offOrigin).toEqual([]);
    console.log(`wasm files fetched: ${requested.join(', ')}`);
  });
});
