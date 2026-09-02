import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Select trigger is a button, so it has no implicit name and no `<label
 * for>` can give it one. A `placeholder` looks like a name and is not one: it
 * disappears the moment a value is picked, and a filter whose value defaults to
 * something never shows it at all.
 *
 * All three shipped triggers went out without a name. This reads the call
 * sites rather than the rendered tree on purpose — the question is what the
 * author passed, not what the atom computes.
 */
const SOURCES = ['src/pages', 'src/components', 'src/patterns'].flatMap(dir =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(name => name.endsWith('.tsx') && !name.endsWith('.stories.tsx'))
    .map(name => `${dir}/${name}`)
);

const TRIGGERS = SOURCES.flatMap(file => {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/<SelectTrigger\b[^>]*>/g)].map(match => ({
    file,
    line: source.slice(0, match.index).split('\n').length,
    tag: match[0],
  }));
});

describe('every shipped Select trigger carries a name', () => {
  it('finds the triggers at all, so the scan cannot pass by matching nothing', () => {
    expect(TRIGGERS.length).toBeGreaterThan(0);
  });

  it.each(TRIGGERS.map(t => [`${t.file}:${t.line}`, t.tag]))(
    '%s',
    (_where, tag) => {
      expect(tag).toMatch(/aria-label(ledby)?=/);
      expect(tag).not.toMatch(/\bplaceholder=/);
    }
  );
});
