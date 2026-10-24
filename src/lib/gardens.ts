/**
 * The account's gardens, up to three: each a name, a place and a plan. Kept on
 * the device (so the pages work offline) and sent to the Huerta Worker a
 * moment after each change. The newer copy wins whole; half-plans are never
 * merged.
 */
import { useSyncExternalStore } from 'react';
import { apiFetch, session } from '@/lib/huerta-session';
import type { Plan } from '@/lib/planner';

export interface GardenPlace {
  lat: number;
  lon: number;
}

export interface StoredGarden {
  id: string;
  /** '' until named: shown as "My garden". */
  name: string;
  place: GardenPlace | null;
  plan: Plan | null;
  /** When it last changed, ms. */
  updated: number;
  /** Changed here and not yet on the account. */
  dirty?: boolean;
}

export const MAX_GARDENS = 3;
const LIST = 'huerta-gardens';
const CURRENT = 'huerta-garden';
const SYNC_DELAY = 2000;

const read = <T>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: kept for this visit only.
  }
};

let list: StoredGarden[] | null = null;
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version++;
  listeners.forEach(listener => listener());
};
/** Read the device again (tests; another tab). */
export const reset = () => {
  list = null;
  changed();
};

function save(next: StoredGarden[]) {
  list = next;
  write(LIST, next);
  changed();
}

export function gardens(): StoredGarden[] {
  if (list) return list;
  list = read<StoredGarden[]>(LIST) ?? [];
  // A plan from before accounts, with its place, becomes the first garden. A
  // place alone is left behind: a device opened before accounts would
  // otherwise add an empty garden to the account each.
  const plan = read<Plan>('huerta-plan');
  const place = read<GardenPlace>('huerta-place');
  if (!list.length && plan) {
    list = [
      {
        id: crypto.randomUUID(),
        name: '',
        place,
        plan,
        updated: Date.now(),
        dirty: true,
      },
    ];
    write(LIST, list);
    write(CURRENT, list[0].id);
  }
  try {
    localStorage.removeItem('huerta-plan');
    localStorage.removeItem('huerta-place');
  } catch {
    // Blocked storage: nothing was there.
  }
  return list;
}

export function currentGarden(): StoredGarden | null {
  const all = gardens();
  const id = read<string>(CURRENT);
  return all.find(garden => garden.id === id) ?? all[0] ?? null;
}

export function chooseGarden(id: string) {
  write(CURRENT, id);
  changed();
}

/** A new garden, now the current one, at the current one's place; null when
 *  the account has three. */
export function addGarden(name: string): StoredGarden | null {
  const all = gardens();
  if (all.length >= MAX_GARDENS) return null;
  const garden: StoredGarden = {
    id: crypto.randomUUID(),
    name,
    place: currentGarden()?.place ?? null,
    plan: null,
    updated: Date.now(),
    dirty: true,
  };
  save([...all, garden]);
  chooseGarden(garden.id);
  later();
  return garden;
}

/** Change the current garden, making one when there is none yet. */
export function updateGarden(
  patch: Partial<Pick<StoredGarden, 'name' | 'place' | 'plan'>>
) {
  const id = currentGarden()?.id ?? addGarden('')!.id;
  save(
    gardens().map(garden =>
      garden.id === id
        ? { ...garden, ...patch, updated: Date.now(), dirty: true }
        : garden
    )
  );
  later();
}

/** Delete a garden on the account and here; rejects when offline. */
export async function removeGarden(id: string) {
  const response = await apiFetch(
    `/v1/gardens/${id}`,
    {},
    { method: 'DELETE' }
  );
  if (!response.ok) throw new Error(`delete garden ${response.status}`);
  save(gardens().filter(garden => garden.id !== id));
}

let timer: ReturnType<typeof setTimeout> | undefined;
function later() {
  clearTimeout(timer);
  timer = setTimeout(() => void syncGardens().catch(() => {}), SYNC_DELAY);
}

/** Send what changed here, then take the account's list. */
export async function syncGardens() {
  if (!session()) return;
  for (const garden of gardens().filter(g => g.dirty)) {
    const { id, name, place, plan, updated } = garden;
    const response = await apiFetch(
      `/v1/gardens/${id}`,
      {},
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, place, plan, updated }),
      }
    );
    // ponytail: a garden from before accounts that a full account has no room
    // for is dropped; a "replace which?" dialog if that ever happens for real.
    if (response.status === 409) save(gardens().filter(g => g.id !== id));
    else if (response.ok) {
      const kept = (await response.json()) as StoredGarden;
      save(
        gardens().map(g =>
          // Unless it changed again while on its way.
          g.id === id && g.updated === updated ? { ...kept, dirty: false } : g
        )
      );
    }
  }
  const response = await apiFetch('/v1/gardens');
  if (!response.ok) return;
  const account = (await response.json()) as StoredGarden[];
  const here = gardens();
  const newerHere = (a: StoredGarden) =>
    here.find(g => g.id === a.id && g.dirty && g.updated > a.updated);
  const unsent = here.filter(g => g.dirty && !account.some(a => a.id === g.id));
  save([...account.map(a => newerHere(a) ?? a), ...unsent]);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => version;
const currentId = () => currentGarden()?.id ?? '';

/** The gardens and the current one, re-rendered on any change to them. */
export function useGardens() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return { gardens: gardens(), current: currentGarden() };
}

/** The current garden's id, re-rendered only when another is chosen. */
export const useCurrentGardenId = () =>
  useSyncExternalStore(subscribe, currentId, () => '');
