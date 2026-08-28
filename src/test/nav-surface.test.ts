import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NAV_SURFACE_CLASS } from '@/lib/nav-surface';

/**
 * `NAV_SURFACE_CLASS` is a string of class names, so nothing in the type system
 * stops it from naming a utility that doesn't exist — a rename or removal in
 * `globals.scss` would leave the nav silently unstyled. This test closes that
 * gap by checking the stylesheet actually defines what the constant names.
 */
const globals = readFileSync('src/styles/globals.scss', 'utf8');

// Split first, so an assertion for `elevation-raised` can't be satisfied by
// `elevation-raised-subtle` sitting in the string instead.
const classNames = NAV_SURFACE_CLASS.split(' ').filter(Boolean);

describe('NAV_SURFACE_CLASS', () => {
  it('names only utilities that globals.scss defines', () => {
    expect(classNames.length).toBeGreaterThan(0);
    for (const className of classNames) {
      expect(globals).toMatch(new RegExp(`^\\s*\\.${className}[\\s,{]`, 'm'));
    }
  });

  it('is exactly the raised elevation level', () => {
    // Both nav surfaces are persistent primary nav, so they must not pick up a
    // dismiss-by-tap-outside or blocking-overlay shadow — nor the quieter
    // raised-subtle level, which is for input chrome. See CONTEXT.md.
    expect(classNames).toContain('elevation-raised');
    expect(classNames).not.toContain('elevation-raised-subtle');
    expect(classNames).not.toContain('elevation-floating');
    expect(classNames).not.toContain('elevation-overlay');
  });

  it('uses exactly the regular glass variant', () => {
    // Glass-clear is reserved for full-bleed media backgrounds; nav sits over
    // text content and the map, so it needs the more opaque variant.
    expect(classNames).toContain('glass-regular');
    expect(classNames).not.toContain('glass-clear');
  });
});
