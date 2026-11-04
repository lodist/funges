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

  it('has each photo on disk, credited', () => {
    for (const photo of Object.values(PROBLEM_PHOTOS)) {
      expect(existsSync(`public/huerta/problems/${photo.file}.webp`)).toBe(
        true
      );
      expect(photo.by && photo.licence && photo.source).toBeTruthy();
    }
  });

  it("takes a crop's own photo before the problem's", () => {
    expect(problemPhoto('tomato', 'blight')?.file).toBe('blight-tomato');
    expect(problemPhoto('potato', 'blight')?.file).toBe('blight');
    expect(problemPhoto('potato', undefined)).toBeUndefined();
  });
});
