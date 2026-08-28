import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Search } from '@/lib/icons';

describe('icon a11y contract', () => {
  it('is decorative by default', () => {
    const { container } = render(<Search />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it("becomes role='img' once it carries a name", () => {
    const { container } = render(<Search aria-label='Cerca' />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.getAttribute('aria-label')).toBe('Cerca');
  });

  it('lets a call site override the default', () => {
    const { container } = render(<Search aria-hidden={false} />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe(
      'false'
    );
  });
});
