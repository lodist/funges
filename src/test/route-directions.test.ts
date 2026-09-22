import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDrivingSummary,
  fetchWalkingRoute,
  sliceAlongPath,
} from '@/lib/route-directions';

const START: [number, number] = [7.0, 47.0];
const STOP_A: [number, number] = [7.01, 47.0];
const STOP_B: [number, number] = [7.02, 47.0];

function osrmPayload() {
  return {
    code: 'Ok',
    routes: [
      {
        distance: 2200,
        duration: 1800,
        legs: [
          {
            distance: 1100,
            duration: 900,
            steps: [
              { geometry: { coordinates: [START, [7.005, 47.001]] } },
              // Repeats the joint vertex, exactly as OSRM does.
              { geometry: { coordinates: [[7.005, 47.001], STOP_A] } },
            ],
          },
          {
            distance: 1100,
            duration: 900,
            steps: [{ geometry: { coordinates: [STOP_A, STOP_B] } }],
          },
        ],
      },
    ],
    waypoints: [
      { distance: 3, location: START },
      { distance: 350, location: [7.011, 47.002] },
      { distance: 8, location: STOP_B },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWalkingRoute', () => {
  it('splits the response into legs and flags the off-path stop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => osrmPayload() }))
    );

    const route = await fetchWalkingRoute([START, STOP_A, STOP_B]);

    expect(route).not.toBeNull();
    expect(route!.legs).toHaveLength(2);
    // Three vertices, not four: the duplicated joint is dropped.
    expect(route!.legs[0].coordinates).toEqual([
      START,
      [7.005, 47.001],
      STOP_A,
    ]);
    expect(route!.distanceMeters).toBe(2200);
    // Index-aligned with the waypoints; only the 350 m snap is worth drawing.
    expect(route!.offTrail).toEqual([null, [STOP_A, [7.011, 47.002]], null]);
  });

  it('resolves to null instead of throwing when the router fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );

    // Distinct coordinates, so the successful route cached above is not reused.
    await expect(
      fetchWalkingRoute([
        [1, 1],
        [1.1, 1.1],
      ])
    ).resolves.toBeNull();
  });
});

describe('fetchDrivingSummary', () => {
  it('asks the car profile for numbers only and returns them', async () => {
    let requestedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        requestedUrl = url;
        return {
          ok: true,
          json: async () => ({
            code: 'Ok',
            routes: [{ distance: 28_700, duration: 4080, legs: [{}, {}] }],
            waypoints: [{ distance: 4 }, { distance: 9 }, { distance: 2 }],
          }),
        };
      })
    );

    const drive = await fetchDrivingSummary([
      [2, 2],
      [2.1, 2.1],
      [2.2, 2.2],
    ]);

    expect(drive).toEqual({ distanceMeters: 28_700, durationSeconds: 4080 });

    expect(requestedUrl).toContain('routed-car/route/v1/driving');
    // Geometry is never drawn for the drive, so it must not be requested.
    expect(requestedUrl).toContain('steps=false');
  });
});

describe('sliceAlongPath', () => {
  it('cuts by length, not by vertex count', () => {
    // Second segment is nine times the first: halfway by length lands inside it.
    const path: Array<[number, number]> = [
      [0, 0],
      [0.1, 0],
      [1, 0],
    ];

    expect(sliceAlongPath(path, 0.5)).toEqual([
      [0, 0],
      [0.1, 0],
      [0.5, 0],
    ]);
    expect(sliceAlongPath(path, 0)).toEqual([[0, 0]]);
    expect(sliceAlongPath(path, 1)).toEqual(path);
  });
});
