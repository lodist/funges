import type { ComponentType, ReactElement } from 'react';
import type { LucideProps } from 'lucide-react';
import {
  AlertTriangle as LucideAlertTriangle,
  ArrowUpRight as LucideArrowUpRight,
  BarChart2 as LucideBarChart2,
  BarChart3 as LucideBarChart3,
  Bitcoin as LucideBitcoin,
  BookOpen as LucideBookOpen,
  Bookmark as LucideBookmark,
  Calendar as LucideCalendar,
  CalendarRange as LucideCalendarRange,
  Camera as LucideCamera,
  Check as LucideCheck,
  CheckCircle as LucideCheckCircle,
  CheckIcon as LucideCheckIcon,
  ChefHat as LucideChefHat,
  ChevronDown as LucideChevronDown,
  ChevronDownIcon as LucideChevronDownIcon,
  ChevronRight as LucideChevronRight,
  ChevronRightIcon as LucideChevronRightIcon,
  ChevronUpIcon as LucideChevronUpIcon,
  CircleIcon as LucideCircleIcon,
  Clock as LucideClock,
  Coffee as LucideCoffee,
  Coins as LucideCoins,
  Copy as LucideCopy,
  Database as LucideDatabase,
  Download as LucideDownload,
  ExternalLink as LucideExternalLink,
  Filter as LucideFilter,
  FlaskConical as LucideFlaskConical,
  Gavel as LucideGavel,
  Github as LucideGithub,
  Globe as LucideGlobe,
  Heart as LucideHeart,
  HelpCircle as LucideHelpCircle,
  ImageIcon as LucideImageIcon,
  Info as LucideInfo,
  Leaf as LucideLeaf,
  Lightbulb as LucideLightbulb,
  List as LucideList,
  Loader2 as LucideLoader2,
  Lock as LucideLock,
  Mail as LucideMail,
  Map as LucideMap,
  MapPin as LucideMapPin,
  MapPinned as LucideMapPinned,
  Minus as LucideMinus,
  MoreHorizontal as LucideMoreHorizontal,
  Mountain as LucideMountain,
  MousePointerClick as LucideMousePointerClick,
  Navigation as LucideNavigation,
  Palette as LucidePalette,
  PanelLeftIcon as LucidePanelLeftIcon,
  Plus as LucidePlus,
  QrCode as LucideQrCode,
  RefreshCw as LucideRefreshCw,
  RouteIcon as LucideRouteIcon,
  RouteOff as LucideRouteOff,
  ScanSearch as LucideScanSearch,
  Search as LucideSearch,
  Settings as LucideSettings,
  Share as LucideShare,
  ShieldCheck as LucideShieldCheck,
  Skull as LucideSkull,
  Sprout as LucideSprout,
  Star as LucideStar,
  Target as LucideTarget,
  Thermometer as LucideThermometer,
  User as LucideUser,
  Users as LucideUsers,
  WifiOff as LucideWifiOff,
  X as LucideX,
  XIcon as LucideXIcon,
} from 'lucide-react';

/**
 * The single import path for icons.
 *
 * Lucide gives an icon no ARIA attributes at all (`defaultAttributes` is
 * `xmlns/width/height/viewBox/fill/stroke/stroke-width/linecap/linejoin`), so
 * whether a glyph is decorative or meaningful was decided 108 times at 108 call
 * sites, and got decided wrong 108 times. Here it is decided once:
 *
 * - no `aria-label`/`aria-labelledby` -> `aria-hidden`, out of the
 *   accessibility tree. Correct for an icon that sits beside its own label,
 *   and the same guarantee across every browser/AT pairing rather than a bet
 *   on how each one maps an unnamed `<svg>`.
 * - with one -> `role='img'`, so the name it carries is actually exposed.
 *
 * A call site can still override either attribute explicitly; `props` is
 * spread last on purpose. `lucide-react` is ESLint-banned everywhere else, so
 * the 109th icon cannot quietly reopen the hole the sweep closed.
 */
export type LucideIcon = ComponentType<LucideProps>;

const decorativeByDefault = (Icon: ComponentType<LucideProps>): LucideIcon => {
  const Wrapped = (props: LucideProps): ReactElement => (
    <Icon
      {...((props['aria-label'] ?? props['aria-labelledby'])
        ? { role: 'img' }
        : { 'aria-hidden': true })}
      {...props}
    />
  );
  Wrapped.displayName = `Icon(${Icon.displayName ?? 'Lucide'})`;
  return Wrapped;
};

export const AlertTriangle = decorativeByDefault(LucideAlertTriangle);
export const ArrowUpRight = decorativeByDefault(LucideArrowUpRight);
export const BarChart2 = decorativeByDefault(LucideBarChart2);
export const BarChart3 = decorativeByDefault(LucideBarChart3);
export const Bitcoin = decorativeByDefault(LucideBitcoin);
export const BookOpen = decorativeByDefault(LucideBookOpen);
export const Bookmark = decorativeByDefault(LucideBookmark);
export const Calendar = decorativeByDefault(LucideCalendar);
export const CalendarRange = decorativeByDefault(LucideCalendarRange);
export const Camera = decorativeByDefault(LucideCamera);
export const Check = decorativeByDefault(LucideCheck);
export const CheckCircle = decorativeByDefault(LucideCheckCircle);
export const CheckIcon = decorativeByDefault(LucideCheckIcon);
export const ChefHat = decorativeByDefault(LucideChefHat);
export const ChevronDown = decorativeByDefault(LucideChevronDown);
export const ChevronDownIcon = decorativeByDefault(LucideChevronDownIcon);
export const ChevronRight = decorativeByDefault(LucideChevronRight);
export const ChevronRightIcon = decorativeByDefault(LucideChevronRightIcon);
export const ChevronUpIcon = decorativeByDefault(LucideChevronUpIcon);
export const CircleIcon = decorativeByDefault(LucideCircleIcon);
export const Clock = decorativeByDefault(LucideClock);
export const Coffee = decorativeByDefault(LucideCoffee);
export const Coins = decorativeByDefault(LucideCoins);
export const Copy = decorativeByDefault(LucideCopy);
export const Database = decorativeByDefault(LucideDatabase);
export const Download = decorativeByDefault(LucideDownload);
export const ExternalLink = decorativeByDefault(LucideExternalLink);
export const Filter = decorativeByDefault(LucideFilter);
export const FlaskConical = decorativeByDefault(LucideFlaskConical);
export const Gavel = decorativeByDefault(LucideGavel);
export const Github = decorativeByDefault(LucideGithub);
export const Globe = decorativeByDefault(LucideGlobe);
export const Heart = decorativeByDefault(LucideHeart);
export const HelpCircle = decorativeByDefault(LucideHelpCircle);
export const ImageIcon = decorativeByDefault(LucideImageIcon);
export const Info = decorativeByDefault(LucideInfo);
export const Leaf = decorativeByDefault(LucideLeaf);
export const Lightbulb = decorativeByDefault(LucideLightbulb);
export const List = decorativeByDefault(LucideList);
export const Loader2 = decorativeByDefault(LucideLoader2);
export const Lock = decorativeByDefault(LucideLock);
export const Mail = decorativeByDefault(LucideMail);
export const Map = decorativeByDefault(LucideMap);
export const MapPin = decorativeByDefault(LucideMapPin);
export const MapPinned = decorativeByDefault(LucideMapPinned);
export const Minus = decorativeByDefault(LucideMinus);
export const MoreHorizontal = decorativeByDefault(LucideMoreHorizontal);
export const Mountain = decorativeByDefault(LucideMountain);
export const MousePointerClick = decorativeByDefault(LucideMousePointerClick);
export const Navigation = decorativeByDefault(LucideNavigation);
export const Palette = decorativeByDefault(LucidePalette);
export const PanelLeftIcon = decorativeByDefault(LucidePanelLeftIcon);
export const Plus = decorativeByDefault(LucidePlus);
export const QrCode = decorativeByDefault(LucideQrCode);
export const RefreshCw = decorativeByDefault(LucideRefreshCw);
export const RouteIcon = decorativeByDefault(LucideRouteIcon);
export const RouteOff = decorativeByDefault(LucideRouteOff);
export const ScanSearch = decorativeByDefault(LucideScanSearch);
export const Search = decorativeByDefault(LucideSearch);
export const Settings = decorativeByDefault(LucideSettings);
export const Share = decorativeByDefault(LucideShare);
export const ShieldCheck = decorativeByDefault(LucideShieldCheck);
export const Skull = decorativeByDefault(LucideSkull);
export const Sprout = decorativeByDefault(LucideSprout);
export const Star = decorativeByDefault(LucideStar);
export const Target = decorativeByDefault(LucideTarget);
export const Thermometer = decorativeByDefault(LucideThermometer);
export const User = decorativeByDefault(LucideUser);
export const Users = decorativeByDefault(LucideUsers);
export const WifiOff = decorativeByDefault(LucideWifiOff);
export const X = decorativeByDefault(LucideX);
export const XIcon = decorativeByDefault(LucideXIcon);
