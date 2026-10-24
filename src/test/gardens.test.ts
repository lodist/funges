import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as g from '@/lib/gardens';
import { setSession } from '@/lib/huerta-session';
import type { Plan } from '@/lib/planner';

const PLAN: Plan = {
  garden: { width: 6, length: 4, shape: 'rect' },
  sections: [],
};
const put = (init?: RequestInit) => init?.method === 'PUT';

beforeEach(() => {
  // The sync a moment after each change waits on a timer the tests never run.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  localStorage.clear();
  g.reset();
  setSession({ token: 'f'.repeat(64), email: 'a@b.c' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('gardens on the device', () => {
  it('turn the plan and place from before accounts into the first garden', () => {
    localStorage.setItem('huerta-plan', JSON.stringify(PLAN));
    localStorage.setItem(
      'huerta-place',
      JSON.stringify({ lat: 40.42, lon: -3.7 })
    );
    const [only] = g.gardens();
    expect(only).toMatchObject({
      name: '',
      place: { lat: 40.42, lon: -3.7 },
      plan: PLAN,
      dirty: true,
    });
    expect(localStorage.getItem('huerta-plan')).toBeNull();
    expect(g.currentGarden()?.id).toBe(only.id);
  });

  it('leave a place from before accounts without a plan behind', () => {
    // Opened on two devices, it would otherwise join the account twice.
    localStorage.setItem(
      'huerta-place',
      JSON.stringify({ lat: 40.42, lon: -3.7 })
    );
    expect(g.gardens()).toEqual([]);
    expect(localStorage.getItem('huerta-place')).toBeNull();
  });

  it('are up to three, and the new one is the current one', () => {
    const home = g.addGarden('Home')!;
    g.addGarden('Plot');
    const parents = g.addGarden('Parents')!;
    expect(g.addGarden('Fourth')).toBeNull();
    expect(g.currentGarden()?.id).toBe(parents.id);
    g.chooseGarden(home.id);
    expect(g.currentGarden()?.name).toBe('Home');
  });

  it('a change marks the current garden to send', () => {
    g.addGarden('Home');
    g.updateGarden({ plan: PLAN });
    expect(g.currentGarden()).toMatchObject({ plan: PLAN, dirty: true });
  });

  it('a change with no garden yet makes one', () => {
    g.updateGarden({ place: { lat: 1, lon: 2 } });
    expect(g.gardens()).toHaveLength(1);
    expect(g.currentGarden()?.place).toEqual({ lat: 1, lon: 2 });
  });
});

describe('syncing with the account', () => {
  it('sends what changed, then takes the account’s list', async () => {
    const mine = g.addGarden('Home')!;
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, init) => {
        calls.push(`${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`);
        if (put(init))
          return Response.json({
            ...JSON.parse(String(init!.body)),
            id: mine.id,
          });
        return Response.json([
          { id: mine.id, name: 'Home', place: null, plan: null, updated: 5 },
          { id: 'other', name: 'Plot', place: null, plan: null, updated: 3 },
        ]);
      })
    );
    await g.syncGardens();
    expect(calls).toEqual([`PUT /v1/gardens/${mine.id}`, 'GET /v1/gardens']);
    expect(g.gardens().map(x => [x.name, x.dirty ?? false])).toEqual([
      ['Home', false],
      ['Plot', false],
    ]);
  });

  it('keeps a garden it could not send', async () => {
    const mine = g.addGarden('Home')!;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (_url, init) =>
        put(init) ? new Response('{}', { status: 503 }) : Response.json([])
      )
    );
    await g.syncGardens();
    expect(g.gardens().map(x => x.id)).toEqual([mine.id]);
  });

  it('drops an old garden the full account has no room for', async () => {
    g.addGarden('Old');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (_url, init) =>
        put(init)
          ? new Response('{"error":"full"}', { status: 409 })
          : Response.json([])
      )
    );
    await g.syncGardens();
    expect(g.gardens()).toEqual([]);
  });

  it('waits while signed out', async () => {
    setSession(null);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await g.syncGardens();
    expect(fetch).not.toHaveBeenCalled();
  });
});
