import {
  CalendarRange,
  ChefHat,
  Database,
  LayoutGrid,
  Map,
  ScanSearch,
  Settings,
} from '@/lib/icons';
import { IDENTIFY_PATH } from '@/lib/isolation';
import { huertaPage } from '@/lib/seo-pages';
import type { Space } from '@/lib/spaces';

const basePath = import.meta.env.BASE_URL || '/';

export interface NavItem {
  url: string;
  icon: typeof Map;
  /** The page's name in the sidebar namespace. */
  label: string;
  /** A fresh document, not a route change. */
  reloadDocument?: boolean;
}

/** A space's main pages, as the phone's nav bar lists them (and the game's
 *  menu, which stands in for the nav while it fills the screen). Six items
 *  is the ceiling: at the 320px minimum width a seventh falls under the 44px
 *  touch floor. Identify holds the thumb's slot because it is the field
 *  action; Data, a planning page, lives in the Settings hub on phones.
 *  Huerta's pages are in the app language's words (German pages under /de),
 *  its own Settings last. */
export const navItems = (space: Space, language: string): NavItem[] =>
  space === 'huerta'
    ? [
        {
          url: basePath + huertaPage('map', language).slice(1),
          icon: Map,
          label: 'huertaMap',
        },
        {
          url: basePath + huertaPage('planner', language).slice(1),
          icon: LayoutGrid,
          label: 'huertaPlanner',
        },
        {
          url: basePath + huertaPage('crops', language).slice(1),
          icon: Database,
          label: 'huertaWeek',
        },
        {
          url: basePath + huertaPage('calendar', language).slice(1),
          icon: CalendarRange,
          label: 'huertaYear',
        },
        {
          url: `${basePath}huerta/settings`,
          icon: Settings,
          label: 'settings',
        },
      ]
    : [
        { url: `${basePath}map`, icon: Map, label: 'map' },
        {
          url: `${basePath}worth-foraging-now`,
          icon: CalendarRange,
          label: 'worthForagingNow',
        },
        // Served with its own headers (lib/isolation).
        {
          url: IDENTIFY_PATH,
          icon: ScanSearch,
          label: 'identify',
          reloadDocument: true,
        },
        { url: `${basePath}recipes`, icon: ChefHat, label: 'recipes' },
        { url: `${basePath}species`, icon: Database, label: 'species' },
        { url: `${basePath}settings`, icon: Settings, label: 'settings' },
      ];
