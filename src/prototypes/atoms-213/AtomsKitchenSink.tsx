// PROTOTYPE — throwaway. Answers #213: "what should the ~22 shadcn/Radix
// atoms look like, redesigned against concrete AllTrails UI patterns?"
// See ./README.md for the two directions, their AllTrails sources, and how
// to give feedback. Not linked from the app nav — visit /atoms-213 directly.
//
// Every atom below is the REAL component from src/components/ui/* — this
// file changes zero lines of production code. Only the classNames passed in
// change per variant (see ./recipes.ts), which is also how a chosen
// direction would get folded in for real.

import { useState } from 'react';
import {
  Search,
  Heart,
  MapPin,
  Leaf,
  ChevronDown,
  Settings2,
  ArrowUpDown,
  ShieldAlert,
  Check,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

import { useSearch } from '@tanstack/react-router';
import { getSpeciesImage, cn } from '@/lib/utils';
import { recipes, VARIANTS, type Variant } from './recipes';
import PrototypeSwitcher from './PrototypeSwitcher';

const SPECIES = [
  {
    id: 'chant',
    name: 'Chanterelle',
    latin: 'Cantharellus cibarius',
    edibility: 'edible' as const,
    season: 'Jul – Oct',
    habitat: 'Deciduous woods',
    blurb:
      'Funnel-shaped, apricot-yellow, with blunt false gills running down the stem.',
  },
  {
    id: 'morel',
    name: 'Morel',
    latin: 'Morchella esculenta',
    edibility: 'caution' as const,
    season: 'Apr – May',
    habitat: 'Burned or disturbed ground',
    blurb: 'Distinctive honeycomb cap. Must be cooked thoroughly — toxic raw.',
  },
  {
    id: 'chicken-of-the-woods',
    name: 'Chicken of the Woods',
    latin: 'Laetiporus sulphureus',
    edibility: 'edible' as const,
    season: 'May – Oct',
    habitat: 'Oak, cherry, willow trunks',
    blurb: 'Bright orange shelf fungus. Only forage young, tender growth.',
  },
] as const;

const EDIBILITY_LABEL: Record<(typeof SPECIES)[number]['edibility'], string> = {
  edible: 'Edible',
  caution: 'Caution',
};

function EdibilityBadge({
  level,
  r,
}: {
  level: 'edible' | 'caution' | 'avoid';
  r: (typeof recipes)['trailhead'];
}) {
  const tone =
    level === 'edible'
      ? r.badgeSuccess
      : level === 'caution'
        ? r.badgeWarning
        : r.badgeDestructive;
  const label = level === 'avoid' ? 'Avoid' : EDIBILITY_LABEL[level];
  return (
    <Badge variant='outline' className={cn(r.badgeBase, tone)}>
      {label}
    </Badge>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className='mb-14'>
      <h2 className='font-display text-xl font-bold mb-1'>{title}</h2>
      {subtitle && (
        <p className='text-sm text-muted-foreground mb-5 max-w-2xl'>
          {subtitle}
        </p>
      )}
      {!subtitle && <div className='mb-5' />}
      {children}
    </section>
  );
}

export default function AtomsKitchenSink() {
  // Cast: this app's TanStack Router search-param inference doesn't flow
  // through cleanly here — not worth chasing down for throwaway code.
  const { variant } = useSearch({ from: '/atoms-213' }) as { variant: Variant };
  const r = recipes[variant];
  const [selectedChip, setSelectedChip] = useState('Edible');
  const [dogFriendly, setDogFriendly] = useState(true);

  return (
    <div className='max-w-5xl mx-auto pb-32'>
      <header className='mb-10 pt-2'>
        <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2'>
          Prototype · Issue #213
        </p>
        <h1 className='font-display text-3xl font-bold mb-2'>
          Atom library, redesigned
        </h1>
        <p className='text-muted-foreground max-w-2xl'>
          Same ~20 real shadcn/Radix atoms from{' '}
          <code className='text-xs bg-muted px-1.5 py-0.5 rounded'>
            src/components/ui/
          </code>
          , two AllTrails-grounded directions. Switch with the bar at the bottom
          — every control below re-renders in place.
        </p>
        <div className='mt-3 text-sm font-medium'>
          Currently viewing:{' '}
          <span className='text-primary'>
            {VARIANTS.find(v => v.id === variant)?.label}
          </span>{' '}
          <span className='text-muted-foreground font-normal'>
            — {VARIANTS.find(v => v.id === variant)?.blurb}
          </span>
        </div>
      </header>

      <Section
        title='Search & filters'
        subtitle="AllTrails' search bar (full pill, leading icon) and the horizontally-scrolling filter-chip row above trail results."
      >
        <div className='relative mb-4 max-w-md'>
          <Search className='absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground' />
          <Input
            placeholder='Search species by name…'
            className={cn(r.input, 'pl-11')}
          />
        </div>
        <div className='flex gap-2 overflow-x-auto pb-1'>
          {[
            'Edible',
            'In season',
            'Woodland',
            'Coastal',
            'Beginner-friendly',
          ].map(label => {
            const selected = selectedChip === label;
            return (
              <Badge
                asChild
                key={label}
                variant='outline'
                className={selected ? r.chipSelected : r.chip}
              >
                <button
                  type='button'
                  aria-pressed={selected}
                  onClick={() => setSelectedChip(label)}
                  className='inline-flex items-center gap-1.5'
                >
                  {selected && <Check className='size-3.5' />}
                  {label}
                </button>
              </Badge>
            );
          })}
        </div>
      </Section>

      <Section
        title='Species cards'
        subtitle="AllTrails' trail card: photo bleeding to the card edge, a colour-coded status pill overlaid on the photo, a heart/save toggle in the corner."
      >
        <div className='grid sm:grid-cols-2 lg:grid-cols-3 gap-5'>
          {SPECIES.map(s => {
            const img = getSpeciesImage(s.id);
            return (
              <Card key={s.id} className={r.card}>
                <div className={r.cardImageWrap}>
                  {img && (
                    <img
                      src={img}
                      alt={s.name}
                      className='h-full w-full object-cover'
                    />
                  )}
                  <div className='absolute top-3 left-3'>
                    <EdibilityBadge level={s.edibility} r={r} />
                  </div>
                  <button
                    type='button'
                    className={r.saveButton}
                    aria-label='Save'
                  >
                    <Heart className='size-4' />
                  </button>
                </div>
                <CardHeader className={r.cardBody}>
                  <CardTitle className='font-display'>{s.name}</CardTitle>
                  <CardDescription className='italic'>
                    {s.latin}
                  </CardDescription>
                </CardHeader>
                <CardContent className='px-4 gap-2'>
                  <p className='text-sm text-muted-foreground'>{s.blurb}</p>
                  <div className='flex flex-wrap gap-1.5 pt-1'>
                    <Badge
                      variant='outline'
                      className={
                        r.badgeBase +
                        ' ' +
                        'bg-muted text-muted-foreground border-transparent'
                      }
                    >
                      {s.season}
                    </Badge>
                    <Badge
                      variant='outline'
                      className={
                        r.badgeBase +
                        ' ' +
                        'bg-muted text-muted-foreground border-transparent'
                      }
                    >
                      {s.habitat}
                    </Badge>
                  </div>
                </CardContent>
                <CardFooter className='px-4 pb-4 pt-3 gap-2'>
                  <Button className={cn(r.btnPrimary, 'flex-1')}>
                    <MapPin className='size-4' />
                    View on map
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section
        title='Buttons'
        subtitle="AllTrails' 'Hit the Trail' primary pill vs. a bordered, display-type trail-marker button."
      >
        <div className='flex flex-wrap items-center gap-3'>
          <Button className={r.btnPrimary}>Log a find</Button>
          <Button variant='outline' className={r.btnSecondary}>
            Share
          </Button>
          <Button variant='ghost' className={r.btnGhost}>
            Skip
          </Button>
          <Button className={r.btnDestructive}>Report issue</Button>
          <Button disabled className={r.btnPrimary}>
            Disabled
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size='icon' variant='outline' className={r.btnIcon}>
                <Settings2 className='size-4' />
              </Button>
            </TooltipTrigger>
            <TooltipContent className={r.tooltipContent}>
              Filter options
            </TooltipContent>
          </Tooltip>
        </div>
      </Section>

      <Section
        title='Log a find — form atoms'
        subtitle='Input, Textarea, Select, Checkbox, RadioGroup, Switch, Label — assembled as the sheet/dialog form below would use them.'
      >
        <div className='grid sm:grid-cols-2 gap-6 max-w-2xl'>
          <div className='space-y-1.5'>
            <Label htmlFor='ks-species'>Species</Label>
            <Select defaultValue='chant'>
              <SelectTrigger
                id='ks-species'
                className={cn(r.selectTrigger, 'w-full')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={r.selectContent}>
                {SPECIES.map(s => (
                  <SelectItem key={s.id} value={s.id} className={r.selectItem}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='ks-qty'>Quantity found</Label>
            <Input id='ks-qty' placeholder='e.g. 6' className={r.input} />
          </div>
          <div className='sm:col-span-2 space-y-1.5'>
            <Label htmlFor='ks-notes'>Notes</Label>
            <Textarea
              id='ks-notes'
              placeholder='Growing near the base of an old oak…'
              className={r.textarea}
            />
          </div>
          <div className='space-y-2'>
            <Label>Condition</Label>
            <RadioGroup
              defaultValue='Fresh'
              className='gap-2.5'
              // radio-group.tsx hardcodes the selected centre dot as
              // `fill-primary` with no className passthrough — the only
              // way to recolour it is overriding the --primary CSS var it
              // reads from, scoped to this subtree only.
              style={
                r.radioIndicatorColor
                  ? ({
                      '--primary': r.radioIndicatorColor,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              {['Fresh', 'Past prime', 'Not sure'].map(opt => (
                <div key={opt} className='flex items-center gap-2'>
                  <RadioGroupItem
                    value={opt}
                    id={`ks-cond-${opt}`}
                    className={r.radio}
                  />
                  <Label htmlFor={`ks-cond-${opt}`} className='font-normal'>
                    {opt}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className='space-y-2'>
            <Label>Options</Label>
            <div className='flex items-center gap-2'>
              <Checkbox id='ks-confirm' defaultChecked className={r.checkbox} />
              <Label htmlFor='ks-confirm' className='font-normal'>
                I identified this myself
              </Label>
            </div>
            <div className='flex items-center gap-2'>
              <Switch
                id='ks-share'
                checked={dogFriendly}
                onCheckedChange={setDogFriendly}
                className={r.switchRoot}
              />
              <Label htmlFor='ks-share' className='font-normal'>
                Share location with community map
              </Label>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title='Overlays'
        subtitle='AllTrails puts nearly every action in a bottom sheet on mobile (rounded top, drag handle) — rarely a centered dialog. Both directions are shown here; note which one the Sheet vs. Dialog choice below leans toward.'
      >
        <div className='flex flex-wrap gap-3'>
          <Sheet>
            <SheetTrigger asChild>
              <Button className={r.btnPrimary}>Add to list (sheet)</Button>
            </SheetTrigger>
            <SheetContent side='bottom' className={r.sheetContent}>
              {/* Sheet's built-in close button has no className passthrough
                  (unlike Dialog's showCloseButton escape hatch), so it's
                  restyled in place via this page-scoped CSS instead of a
                  React prop — see recipes.ts `sheetCloseCss`. */}
              <style>{`[data-slot="sheet-content"] > button:last-of-type { ${r.sheetCloseCss} }`}</style>
              <div className={r.sheetHandle} />
              <SheetHeader>
                <SheetTitle className='font-display'>Add to a list</SheetTitle>
                <SheetDescription>
                  Save Chanterelle to one of your foraging lists.
                </SheetDescription>
              </SheetHeader>
              <div className='px-4 pb-6 flex flex-col gap-2'>
                {['Weekend spots', 'Backyard finds', 'Wishlist'].map(l => (
                  <button key={l} type='button' className={r.sheetListItem}>
                    {l}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant='outline' className={r.btnSecondary}>
                Delete find (dialog)
              </Button>
            </DialogTrigger>
            <DialogContent className={r.dialogContent} showCloseButton={false}>
              <DialogClose asChild>
                <button type='button' className={r.dialogClose}>
                  <X className='size-4' />
                  <span className='sr-only'>Close</span>
                </button>
              </DialogClose>
              <DialogHeader>
                <DialogTitle className='flex items-center gap-2'>
                  <ShieldAlert className={cn('size-4', r.dangerIcon)} />
                  Delete this find?
                </DialogTitle>
                <DialogDescription>
                  This removes it from your log. This can't be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant='outline' className={r.btnSecondary}>
                  Cancel
                </Button>
                <Button className={r.btnDestructive}>Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' className={r.btnSecondary}>
                <ArrowUpDown className='size-4' />
                Sort
                <ChevronDown className='size-3.5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className={r.selectContent}>
              {['Nearest', 'Recently added', 'A–Z'].map(opt => (
                <DropdownMenuItem key={opt} className={r.selectItem}>
                  {opt}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Section>

      <Section title='Misc' subtitle='Separator and loading skeleton.'>
        <div className='max-w-md space-y-4'>
          <div className='flex items-center gap-3'>
            <Leaf className='size-4 text-primary' />
            <span className='text-sm'>Foraging log</span>
          </div>
          <Separator className={r.separator} />
          <div className='flex items-center gap-3'>
            <Skeleton className={cn('size-14', r.skeleton)} />
            <div className='flex-1 space-y-2'>
              <Skeleton className={cn('h-4 w-2/3', r.skeleton)} />
              <Skeleton className={cn('h-3 w-1/3', r.skeleton)} />
            </div>
          </div>
        </div>
      </Section>

      <PrototypeSwitcher current={variant} />
    </div>
  );
}

export type { Variant };
