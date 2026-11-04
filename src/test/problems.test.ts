import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { CROPS } from '@/lib/huerta';
import { PROBLEMS, PROBLEM_PHOTOS, problemPhoto } from '@/lib/problems';

const guides = import.meta.glob<{
  grow: Record<string, { problems?: unknown[] }>;
}>('../i18n/locales/*/huerta.json', { eager: true, import: 'default' });

describe('PROBLEMS', () => {
  it('gives every problem text of every crop an id, in every language', () => {
    for (const crop of CROPS)
      for (const [file, guide] of Object.entries(guides))
        expect(
          guide.grow[crop.id]?.problems?.length,
          `${file} ${crop.id}`
        ).toBe(PROBLEMS[crop.id]?.length);
  });

  it('has each photo on disk, a real one credited in full', () => {
    for (const photo of Object.values(PROBLEM_PHOTOS)) {
      expect(existsSync(`public/huerta/problems/${photo.file}.webp`)).toBe(
        true
      );
      if (photo.by) expect(photo.licence && photo.source).toBeTruthy();
      else expect(photo.licence ?? photo.source).toBeUndefined();
    }
  });

  it('names only problems some crop has', () => {
    const ids = new Set(Object.values(PROBLEMS).flat());
    for (const key of Object.keys(PROBLEM_PHOTOS)) {
      const [crop, problem] = key.includes('.') ? key.split('.') : [null, key];
      expect(ids.has(problem), key).toBe(true);
      if (crop) expect(PROBLEMS[crop], key).toContain(problem);
    }
  });

  it("takes a crop's own photo before the problem's", () => {
    expect(problemPhoto('tomato', 'blight')?.file).toBe('blight-tomato');
    expect(problemPhoto('potato', 'blight')?.file).toBe('blight');
    expect(problemPhoto('potato', undefined)).toBeUndefined();
  });
});
