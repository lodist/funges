import type { Decorator } from '@storybook/tanstack-react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { RouterHost } from '@/storybook/RouterHost';
import { SidebarProvider } from '@/components/ui/sidebar';

/**
 * Shared story decorators.
 *
 * These live under `src/` rather than in `.storybook/` so they resolve through
 * the `@` alias and sit inside the same lint and type-check scope as the code
 * they wrap — `tsconfig.app.json` only includes `src`.
 *
 * Nothing in the project had any before this, while `Sheet` and `Sidebar` —
 * plus most feature components — depend on i18n, the router or the sidebar
 * context and fail at render without them. `withI18n` and `withTheme` are
 * applied globally in `preview.tsx`; `withRouter` and `withSidebar` are
 * opt-in per story, since wrapping every story in a router and an open
 * sidebar shell would change what the story is documenting.
 *
 * A broken decorator fails every story that uses it, which is the correct
 * blast radius — they carry no tests of their own.
 *
 * The two global decorators are deliberately hook-free. A decorator body is
 * not a reliable place for hooks here: these two wrap every story in the
 * suite, teardown included, and calling `React.useState` directly in the
 * decorator function surfaced as
 * `Cannot read properties of null (reading 'useState')` across the whole suite
 * once it grew past a handful of files. Neither one actually needs state.
 * `withRouter` does, so it keeps its hooks inside a real component
 * (`RouterHost`) rather than in the decorator body.
 */

/**
 * Real translations, not mocks: stories exercise the same keys and bundles the
 * application ships, so a missing key shows up here rather than in production.
 *
 * The language is pinned at module scope rather than per story. The app's
 * detector reads `localStorage`/`navigator`, which would otherwise make story
 * output — and the a11y snapshot taken from it — vary by machine. Resources
 * are bundled, so this resolves without a network round trip.
 */
void i18n.changeLanguage('en');

export const withI18n: Decorator = Story => (
  <I18nextProvider i18n={i18n}>
    <Story />
  </I18nextProvider>
);

/**
 * Dark mode hangs off a `.dark` class variant rather than a media query, so
 * repainting the canvas (what the `backgrounds` addon does) is not enough —
 * the tokens themselves have to be redefined. The class goes on
 * `documentElement` rather than on a wrapper because Dialog, Sheet, Select and
 * DropdownMenu render their content into a portal on `body`, outside any
 * wrapper a decorator could provide.
 *
 * There is deliberately no wrapper element: `body` already carries
 * `bg-background text-foreground` from the base layer, and an extra div
 * between Storybook's layout wrapper and the story breaks `layout: 'centered'`
 * and full-height stories.
 *
 * The class is set during render rather than in an effect. That is normally a
 * smell, but here it is idempotent, it has to happen before paint to avoid a
 * flash of the wrong theme, and it needs no cleanup — the next story's render
 * sets it again from that story's own global.
 */
export const withTheme: Decorator = (Story, context) => {
  document.documentElement.classList.toggle(
    'dark',
    context.globals.theme === 'dark'
  );

  return <Story />;
};

/**
 * Mounts the story inside a memory-history router. The implementation lives in
 * `RouterHost.tsx` — see the note there on why it is a separate module.
 */
export const withRouter: Decorator = Story => <RouterHost Story={Story} />;

/** The sidebar context that every `Sidebar*` subcomponent reads. */
export const withSidebar: Decorator = Story => (
  <SidebarProvider>
    <Story />
  </SidebarProvider>
);
