import type { MouseEvent } from 'react';
import { useRouter } from '@tanstack/react-router';

/** Every species or crop page, as plain links at the foot of a page: how
 *  search engines get from any one page to all the others. A plain click
 *  stays in the app. */
export function PageLinks({
  title,
  links,
}: {
  title: string;
  links: { href: string; name: string }[];
}) {
  const router = useRouter();
  const go = (event: MouseEvent, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    router.history.push(href);
    window.scrollTo(0, 0);
  };
  return (
    <nav aria-label={title} className='border-t border-border pt-6'>
      <h2 className='text-base font-semibold text-foreground'>{title}</h2>
      <ul className='mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm'>
        {links.map(link => (
          <li key={link.href}>
            <a
              href={link.href}
              onClick={event => go(event, link.href)}
              className='focus-ring inline-flex min-h-11 items-center rounded text-primary-text hover:underline'
            >
              {link.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
