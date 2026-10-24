import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CategoryChips } from '@/components/CategoryChips';
import { CROP_DRAG, GardenModel, type Stage } from '@/components/GardenModel';
import { GardenGuide } from '@/components/GardenGuide';
import { GardenPicker } from '@/components/GardenPicker';
import { GardenThisWeek } from '@/components/GardenThisWeek';
import { ScopeHeader } from '@/components/ScopeHeader';
import SEO from '@/components/SEO';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CROPS,
  huertaImage,
  KINDS,
  SAMPLE_ADVICE,
  type CropNeeds,
  type PlaceAdvice,
} from '@/lib/huerta';
import {
  fetchAdvice,
  fetchNeeds,
  huertaApiConfigured,
  savedPlace,
} from '@/lib/huerta-api';
import {
  Check,
  ChevronDown,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
} from '@/lib/icons';
import {
  ACIDITIES,
  forSoil,
  gardenSoil,
  TEXTURES,
  textureOf,
} from '@/lib/soil';
import {
  autoPlan,
  axisOf,
  dueDate,
  fit,
  inMonth,
  layout,
  lengthen,
  loadPlan,
  MAX_SIDE,
  merge,
  MIN_SIDE,
  monthAhead,
  nextYear,
  notes,
  ready,
  removeBed,
  reshape,
  restoreBed,
  savePlan,
  split,
  summary,
  UNIT,
  type Axis,
  type Garden,
  type Ground,
  type Plan,
  type PlanStyle,
  type Section,
} from '@/lib/planner';
import {
  growth,
  due,
  pruneDone,
  readyDay,
  stageOn,
  type GrowthStage,
} from '@/lib/garden-week';
import { prefersReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { nextMonth, useHuertaYear } from '@/hooks/use-huerta-year';

const START: Garden = { width: 6, length: 4.5, shape: 'rect' };
const CROP = Object.fromEntries(CROPS.map(crop => [crop.id, crop]));
const photo = (id: string) =>
  `${import.meta.env.BASE_URL}huerta/crops/${id}.webp`;
const today = () => new Date().toLocaleDateString('sv');
// One action, named for how the crops go in: seed sown in place, or plants,
// sets and tubers planted.
const goesIn = (crops: (string | null | undefined)[]) => {
  const how = new Set(crops.flatMap(c => (c && CROP[c] ? [CROP[c].how] : [])));
  return how.size > 1
    ? 'planner.sownOrPlantedToday'
    : how.has('sow')
      ? 'planner.sownToday'
      : 'planner.plantedToday';
};
const STYLES: PlanStyle[] = [
  'mixed',
  'veg',
  'vegFlowers',
  'fruit',
  'herbsFlowers',
];
const GROUNDS: Ground[] = ['raised', 'ground', 'rows'];
/** The timeline's reach: a year ahead, a week a step. */
const TIMELINE_WEEKS = 52;
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv');
};
/** A stage on the timeline as the drawing's plants show it. */
const drawnAs = (g: GrowthStage): Stage =>
  g === 'seedling' || g === 'young' ? g : 'grown';
/** The tick for the guide's second step: the plan kept or changed. */
const KEPT = 'guide:plan';
const UNDO_STEPS = 20;

/** The chips' look (CategoryChips), for the planner's own choices. */
const chip = (on: boolean) =>
  cn(
    'h-9 px-3 text-foreground hover:text-foreground max-sm:text-sm dark:hover:text-foreground',
    'bg-muted hover:bg-muted/80 dark:hover:bg-muted/80',
    on ? 'font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.08)]' : 'font-medium'
  );

/** Huerta's garden planner: your plot in beds, filled for this season at your
 *  place, drawn as a model, and what you planted when. */
export default function HuertaPlannerPage() {
  const { t, i18n } = useTranslation('huerta');
  const [placeAdvice, setAdvice] = useState<PlaceAdvice>(SAMPLE_ADVICE);
  const [sample, setSample] = useState(true);
  const [needs, setNeeds] = useState<Record<string, CropNeeds>>({});
  const [plan, setPlan] = useState<Plan | null>(() => loadPlan());
  // The sections just planted, while their plants come up.
  const [fresh, setFresh] = useState<number[]>([]);
  // The sections selected: tapping one adds it, tapping it again takes it out.
  const [sel, setSel] = useState<number[]>([]);
  // A deleted bed's patch of earth, when one is picked instead of a section.
  const [patch, setPatch] = useState<number | null>(null);
  const isMobile = useIsMobile();
  // The garden's setup on a phone: folded until opened.
  const [setupOpen, setSetupOpen] = useState(false);
  // Earlier plans, for Undo; kept while the page is open.
  const [past, setPast] = useState<Plan[]>([]);
  // The drawing's column, brought into view when a job is tapped.
  const modelRef = useRef<HTMLDivElement>(null);
  // What Plan it for me plans for: this week (0), or a month ahead (1-12).
  const [forMonths, setForMonths] = useState(0);
  // The timeline: how many weeks ahead the drawing shows (0: today).
  const [weeks, setWeeks] = useState(0);
  const later = useDeferredValue(weeks);
  // On a phone the page is two views, this week's jobs or the garden, not one
  // long scroll; unset until chosen (the garden first while the first plan
  // waits to be kept).
  const [tab, setTab] = useState<'week' | 'garden' | null>(null);
  const year = useHuertaYear();
  // This week's statuses for the garden's own soil (lib/soil).
  const soil = gardenSoil(plan?.garden, year?.soil);
  const advice = forSoil(placeAdvice, needs, soil.texture, today());
  // The visitor's own advice, when they chose a place; else the sample at once.
  const [settled, setSettled] = useState(
    () => !(huertaApiConfigured && savedPlace())
  );

  useEffect(() => {
    if (!huertaApiConfigured) return;
    let live = true;
    const place = savedPlace();
    if (place)
      fetchAdvice(place)
        .then(a => {
          if (live && a) {
            setAdvice(a);
            setSample(false);
          }
        })
        .catch(() => {})
        .finally(() => live && setSettled(true));
    fetchNeeds()
      .then(n => live && setNeeds(n))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const status = (id: string) => advice.crops[id];
  // The month planned for, and a crop's status then: this week's, or the
  // place's calendar for a later month.
  const target = monthAhead(today(), forMonths);
  const planStatus = (id: string) =>
    forMonths
      ? inMonth(year?.crops[id]?.sow, Number(target.slice(5, 7)) - 1)
      : status(id);
  const monthName = (day: string, withYear = false) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: 'long',
      ...(withYear ? { year: 'numeric' } : {}),
    }).format(new Date(`${day}T12:00:00`));
  // A first plan, once this week's statuses are known.
  useEffect(() => {
    if (plan || !settled) return;
    const fresh = {
      garden: START,
      sections: autoPlan(layout(START), status, { sow: today() }),
    };
    setPlan(fresh);
    // The sample's plan is not kept: the visitor's own place may follow.
    if (!sample) savePlan(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  const update = (next: Plan) => {
    if (plan) setPast(p => [...p.slice(1 - UNDO_STEPS), plan]);
    // A change of the gardener's own: the plan has been looked at (the
    // guide's second step).
    const seen = next.done?.[KEPT]
      ? next
      : { ...next, done: { ...next.done, [KEPT]: today() } };
    setPlan(seen);
    savePlan(seen);
  };
  const undo = () => {
    const last = past[past.length - 1];
    if (!last) return;
    setPast(p => p.slice(0, -1));
    setPlan(last);
    savePlan(last);
    setPatch(null);
  };
  // A new size, shape, direction or way of growing keeps what it can.
  const resize = (garden: Garden) => {
    if (!plan) return;
    update(reshape(plan, garden, status, today()));
    only(0);
  };
  const pick = (i: number) => {
    setSel(cur => (cur.includes(i) ? cur.filter(k => k !== i) : [...cur, i]));
    setPatch(null);
  };
  const only = (i: number) => {
    setSel(i >= 0 ? [i] : []);
    setPatch(null);
  };
  // Sections changed together: `change` maps each chosen one.
  const edit = (ids: number[], change: (s: Section) => Section) => {
    if (!plan || !ids.length) return;
    update({
      ...plan,
      sections: plan.sections.map((x, i) => (ids.includes(i) ? change(x) : x)),
    });
  };
  // A crop put into sections: chosen, not yet planted, dated for when it
  // can go in at the place.
  const place = (ids: number[], crop: string) =>
    edit(ids, x => ({
      ...x,
      crop,
      planted: undefined,
      sow:
        forMonths && planStatus(crop) === 'now'
          ? target
          : dueDate(status(crop), year?.crops[crop]?.sow, today()),
    }));
  // Marked planted today, or not.
  const plantOn = (ids: number[], planted: string | undefined) => {
    const withCrop = ids.filter(i => plan?.sections[i]?.crop);
    edit(withCrop, x => ({ ...x, planted }));
    if (planted) {
      setFresh(withCrop);
      setTimeout(() => setFresh([]), 2500);
    }
  };
  // A job on This week ticked off.
  const tick = (key: string) =>
    plan &&
    update({
      ...plan,
      done: pruneDone({ ...plan.done, [key]: today() }, today()),
    });
  // The sections a job is about, selected and brought into view.
  const show = (ids: number[]) => {
    setSel(ids);
    setPatch(null);
    setTab('garden');
    // After the garden view is drawn, on a phone.
    requestAnimationFrame(() =>
      modelRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      })
    );
  };
  const name = (id: string) => t(`crops.${id}`);
  // A planted crop's stage, from the warmth it has had at the place since.
  const stageOf = (s: Section): Stage => {
    const need = s.crop ? needs[s.crop] : undefined;
    if (!s.crop || !s.planted || !need?.days || !year?.temps) return 'grown';
    const done = growth(s.crop, need, year.temps, s.planted, today());
    return done < 0.3 ? 'seedling' : done < 0.75 ? 'young' : 'grown';
  };
  const count = (s: Section) => {
    const f = fit(s, plan?.garden.ground === 'rows');
    return f
      ? t(`planner.unit.${(s.crop && UNIT[s.crop]) ?? 'plants'}`, {
          count: f.count,
        })
      : t('planner.scattered');
  };

  if (!plan)
    return (
      <div className='container mx-auto max-w-7xl px-4 py-8'>
        <SkeletonGroup>
          <Skeleton className='h-10 w-72' />
          <Skeleton className='mt-6 h-[28rem] w-full rounded-card' />
        </SkeletonGroup>
      </div>
    );
  const chosen = sel.filter(i => plan.sections[i]);
  const s =
    patch === null && chosen.length === 1
      ? plan.sections[chosen[0]]
      : undefined;
  const north = plan.garden.north ?? 0;
  const axis = axisOf(plan.garden);
  const totals = summary(plan.sections, north);
  const open = plan.garden.ground === 'rows';
  const plants = plan.sections.reduce(
    (n, x) => n + (fit(x, open)?.count ?? 0),
    0
  );
  // The sections in a good pair, and in a pair to keep apart.
  const pairs = (bad: boolean) =>
    plan.sections
      .map((_, i) => i)
      .filter(i => notes(plan.sections, i, north).some(n => n.bad === bad));
  const allPlanted = chosen.every(i => plan.sections[i].planted);
  const tabs = isMobile && !sample;
  const view = tabs
    ? (tab ??
      (plan.done?.[KEPT] || plan.sections.some(x => x.planted)
        ? 'week'
        : 'garden'))
    : null;
  // The timeline's day: each section's stage then, and the drawing that day.
  const temps = year?.temps;
  const stages =
    later && temps
      ? plan.sections.map(x =>
          // Planned, its day come, but too late for it: it won't go in.
          !x.planted &&
          due(x, today()) &&
          (status(x.crop ?? '') === 'too_late' ||
            status(x.crop ?? '') === 'not_here')
            ? 'bare'
            : stageOn(
                x,
                needs,
                temps,
                year?.crops[x.crop ?? '']?.harvest ?? 0,
                addDays(today(), 7 * later),
                today()
              )
        )
      : null;
  const drawn = stages
    ? plan.sections.map((x, i) =>
        stages[i] === 'bare' ? { ...x, crop: null } : x
      )
    : plan.sections;
  const cropsAt = (want: GrowthStage[]) =>
    [
      ...new Set(
        plan.sections
          .filter((x, i) => x.crop && stages && want.includes(stages[i]))
          .map(x => name(x.crop!))
      ),
    ].join(', ');
  const readyThen = cropsAt(['ready']);
  const growingThen = cropsAt(['seedling', 'young', 'grown']);
  const beds = new Set(plan.sections.map(x => x.bed)).size;

  return (
    <>
      <SEO
        title={t('planner.title')}
        description={t('planner.description')}
        canonicalUrl={`${import.meta.env.BASE_URL}huerta/planner`}
      />
      <div className='container mx-auto max-w-7xl px-4 py-8'>
        <header className='mb-8 flex flex-col gap-6'>
          <ScopeHeader
            title={t('planner.title')}
            scopeLabel={
              sample
                ? t('planner.sample', { place: advice.place })
                : forMonths
                  ? t('planner.forMonth', {
                      month: monthName(target),
                      place: advice.place,
                    })
                  : t('planner.for', { place: advice.place })
            }
            action={
              <div className='flex flex-wrap gap-2'>
                {huertaApiConfigured ? <GardenPicker /> : null}
                {sample ? (
                  <Button variant='outline' asChild>
                    <Link to='/huerta'>{t('planner.choosePlace')}</Link>
                  </Button>
                ) : null}
              </div>
            }
          />
        </header>

        <div className='mb-8 flex flex-col gap-6 empty:hidden'>
          {plan.sections.some(x => x.planted) ? null : (
            <GardenGuide
              done={[Boolean(savedPlace()), Boolean(plan.done?.[KEPT])]}
              empty={!plan.sections.some(x => x.crop)}
              onKeep={() => tick(KEPT)}
            />
          )}
          {tabs ? (
            <CategoryChips
              chips={(['week', 'garden'] as const).map(value => ({
                value,
                label: t(`planner.tab.${value}`),
              }))}
              value={view!}
              onChange={value => setTab(value as 'week' | 'garden')}
              className='justify-start'
            />
          ) : null}
          {sample || view === 'garden' ? null : (
            <GardenThisWeek
              plan={plan}
              advice={placeAdvice}
              needs={needs}
              year={year}
              today={today()}
              where={i => placeName(t, plan.sections[i], plan.garden)}
              onSow={ids => plantOn(ids, today())}
              onDone={tick}
              onShow={show}
              onReplan={ids =>
                update({
                  ...plan,
                  sections: autoPlan(plan.sections, status, {
                    north,
                    style: plan.garden.style,
                    axis,
                    only: ids,
                    sow: today(),
                  }),
                })
              }
            />
          )}
        </div>

        {view === 'week' ? null : (
          <section className='overflow-hidden rounded-card bg-card elevation-raised'>
            <div className='flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border p-3 max-sm:text-sm sm:gap-x-4 sm:gap-y-3 sm:p-4'>
              {/* On a phone the setup folds into one line that says what it is,
                so the garden comes first. */}
              {isMobile ? (
                <Button
                  variant='ghost'
                  aria-expanded={setupOpen}
                  onClick={() => setSetupOpen(open => !open)}
                  className={cn(chip(setupOpen), 'max-w-full')}
                >
                  <SlidersHorizontal className='size-4' />
                  <span className='truncate'>
                    {t('planner.setup', {
                      width: plan.garden.width,
                      length: plan.garden.length,
                      ground: t(
                        `planner.ground.${plan.garden.ground ?? 'raised'}`
                      ),
                    })}
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 transition-transform duration-base',
                      setupOpen && 'rotate-180'
                    )}
                  />
                </Button>
              ) : null}
              {!isMobile || setupOpen ? (
                <>
                  {(['width', 'length'] as const).map(key => (
                    <label
                      key={key}
                      className='flex items-center gap-2 text-sm text-muted-foreground'
                    >
                      {t(`planner.${key}`)}
                      <Input
                        id={`planner-${key}`}
                        type='number'
                        min={MIN_SIDE}
                        max={MAX_SIDE}
                        step={0.5}
                        defaultValue={plan.garden[key]}
                        key={`${key}-${plan.garden[key]}`}
                        className='h-9 w-18 max-sm:text-sm sm:w-20'
                        onBlur={e => {
                          const v = Math.min(
                            MAX_SIDE,
                            Math.max(
                              MIN_SIDE,
                              Number(e.target.value) || plan.garden[key]
                            )
                          );
                          if (v !== plan.garden[key])
                            resize({ ...plan.garden, [key]: v });
                        }}
                      />
                      {t('planner.metres')}
                    </label>
                  ))}
                  <div
                    className='flex gap-2'
                    role='group'
                    aria-label={t('planner.shapeLabel')}
                  >
                    {(['rect', 'L'] as const).map(shape => (
                      <Button
                        key={shape}
                        variant='ghost'
                        aria-pressed={plan.garden.shape === shape}
                        className={chip(plan.garden.shape === shape)}
                        onClick={() => resize({ ...plan.garden, shape })}
                      >
                        {t(`planner.shape.${shape}`)}
                      </Button>
                    ))}
                  </div>
                  <Select
                    value={plan.garden.ground ?? 'raised'}
                    onValueChange={v =>
                      resize({ ...plan.garden, ground: v as Ground })
                    }
                  >
                    <SelectTrigger
                      aria-label={t('planner.groundLabel')}
                      className='h-9 w-auto max-sm:text-sm'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUNDS.map(g => (
                        <SelectItem key={g} value={g}>
                          {t(`planner.ground.${g}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div
                    className='flex items-center gap-2'
                    role='group'
                    aria-label={t('planner.runLabel')}
                  >
                    <span className='text-sm text-muted-foreground'>
                      {t('planner.runLabel')}
                    </span>
                    {([false, true] as const).map(across => (
                      <Button
                        key={String(across)}
                        variant='ghost'
                        aria-pressed={Boolean(plan.garden.across) === across}
                        className={chip(Boolean(plan.garden.across) === across)}
                        onClick={() => resize({ ...plan.garden, across })}
                      >
                        {t(`planner.run.${across ? 'across' : 'along'}`)}
                      </Button>
                    ))}
                  </div>
                  {(
                    [
                      ['soil', TEXTURES, soil.texture],
                      ['acidity', ACIDITIES, soil.acidity],
                    ] as const
                  ).map(([key, values, value]) => (
                    <Select
                      key={key}
                      value={value}
                      onValueChange={v =>
                        update({
                          ...plan,
                          garden: { ...plan.garden, [key]: v },
                        })
                      }
                    >
                      <SelectTrigger
                        aria-label={t(`planner.${key}Label`)}
                        className='h-9 w-auto max-sm:text-sm'
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {values.map(v => (
                          <SelectItem key={v} value={v}>
                            {t(`planner.${key}.${v}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ))}
                  {year?.soil ? (
                    <p className='basis-full text-xs text-muted-foreground'>
                      {t('planner.soilHint', {
                        place: year.place,
                        texture: t(`planner.soilWord.${textureOf(year.soil)}`),
                        ph: year.soil.ph.toLocaleString(i18n.language),
                      })}
                    </p>
                  ) : null}
                </>
              ) : null}
              <Select
                value={String(forMonths)}
                onValueChange={v => setForMonths(Number(v))}
                disabled={!year}
              >
                <SelectTrigger
                  aria-label={t('planner.forLabel')}
                  className='h-9 w-auto max-sm:text-sm'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='0'>{t('planner.thisWeek')}</SelectItem>
                  {Array.from({ length: 12 }, (_, k) => k + 1).map(k => {
                    const first = monthAhead(today(), k);
                    const label = monthName(
                      first,
                      first.slice(0, 4) !== today().slice(0, 4)
                    );
                    return (
                      <SelectItem key={k} value={String(k)}>
                        {label.charAt(0).toLocaleUpperCase(i18n.language) +
                          label.slice(1)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className='max-sm:px-4 max-sm:text-sm'>
                    {t('planner.auto')}
                    <ChevronDown className='size-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start'>
                  <DropdownMenuLabel>
                    {t('planner.styleLabel')}
                  </DropdownMenuLabel>
                  {STYLES.map(style => (
                    <DropdownMenuItem
                      key={style}
                      onSelect={() =>
                        update({
                          ...plan,
                          garden: { ...plan.garden, style },
                          // Everything not planted, or only the sections chosen.
                          sections: autoPlan(plan.sections, planStatus, {
                            north: plan.garden.north,
                            style,
                            axis: axisOf(plan.garden),
                            only:
                              patch === null && chosen.length
                                ? chosen
                                : undefined,
                            sow: forMonths ? target : today(),
                          }),
                        })
                      }
                    >
                      <Check
                        className={cn(
                          'size-4',
                          (plan.garden.style ?? 'mixed') === style
                            ? 'text-primary-text'
                            : 'invisible'
                        )}
                      />
                      {t(`planner.style.${style}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant='outline'
                onClick={undo}
                disabled={!past.length}
                className='max-sm:px-4 max-sm:text-sm'
                aria-label={t('planner.undo')}
              >
                <Undo2 className='size-4' />
                <span className='max-sm:sr-only'>{t('planner.undo')}</span>
              </Button>
            </div>

            <div className='grid lg:grid-cols-[minmax(0,1fr)_22rem]'>
              <div ref={modelRef} className='min-w-0 bg-background/40'>
                {/* Every bed deleted: still the ground, to put one back. */}
                {plan.sections.length > 0 || plan.bare?.length ? (
                  <GardenModel
                    garden={plan.garden}
                    sections={drawn}
                    selected={patch === null ? chosen : []}
                    onSelect={pick}
                    onDropCrop={(i, crop) =>
                      place(chosen.includes(i) ? chosen : [i], crop)
                    }
                    onClear={() => {
                      setSel([]);
                      setPatch(null);
                    }}
                    stage={
                      stages ? x => drawnAs(stages[drawn.indexOf(x)]) : stageOf
                    }
                    fresh={fresh}
                    bare={plan.bare}
                    onBare={setPatch}
                    onTurnNorth={delta =>
                      update({
                        ...plan,
                        garden: {
                          ...plan.garden,
                          north:
                            ((((plan.garden.north ?? 0) + delta) % 360) + 360) %
                            360,
                        },
                      })
                    }
                    label={
                      s?.crop
                        ? { name: name(s.crop), count: count(s) }
                        : undefined
                    }
                    title={t('planner.model')}
                  />
                ) : (
                  <p className='p-8 text-muted-foreground'>
                    {t('planner.noRoom')}
                  </p>
                )}
                {temps ? (
                  <Timeline
                    weeks={weeks}
                    onWeeks={setWeeks}
                    line={
                      [
                        readyThen &&
                          t('planner.timeline.ready', { crops: readyThen }),
                        growingThen &&
                          t('planner.timeline.growing', { crops: growingThen }),
                      ]
                        .filter(Boolean)
                        .join(' · ') || t('planner.timeline.empty')
                    }
                  />
                ) : null}
                <Palette
                  goes={id => planStatus(id) === 'now'}
                  label={how =>
                    forMonths
                      ? t(how === 'sow' ? 'planner.sowIn' : 'planner.plantIn', {
                          month: monthName(target),
                        })
                      : t(`sheet.${how}Now`)
                  }
                  count={patch === null ? chosen.length : 0}
                  onPick={crop => place(chosen, crop)}
                  onDrop={(i, crop) =>
                    place(chosen.includes(i) ? chosen : [i], crop)
                  }
                />
                <div className='flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-4 py-2 text-sm text-muted-foreground'>
                  <span>
                    {t(open ? 'planner.strips' : 'planner.beds', {
                      count: beds,
                    })}{' '}
                    · {t('planner.plants', { count: plants })}
                  </span>
                  <Button
                    variant='link'
                    className='h-auto p-0 text-muted-foreground'
                    title={t('planner.goodHint')}
                    disabled={!totals.good}
                    onClick={() => setSel(pairs(false))}
                  >
                    {t('planner.goodPairs', { count: totals.good })}
                  </Button>
                  <Button
                    variant='link'
                    className={cn(
                      'h-auto p-0',
                      totals.bad.length
                        ? 'text-destructive-text'
                        : 'text-muted-foreground'
                    )}
                    title={t('planner.badHint')}
                    disabled={!totals.bad.length}
                    onClick={() => setSel(pairs(true))}
                  >
                    {totals.bad.length
                      ? t('planner.badPairs', { count: totals.bad.length })
                      : t('planner.noBadPairs')}
                  </Button>
                  <span>{t('planner.faded')}</span>
                </div>
              </div>

              {
                <aside className='flex flex-col gap-5 border-t border-border p-4 lg:border-t-0 lg:border-l'>
                  {patch === null && chosen.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      {t('planner.noneSelected')}
                    </p>
                  ) : null}
                  {patch === null && chosen.length > 1 ? (
                    <div className='flex flex-col gap-3'>
                      <h2 className='type-micro text-muted-foreground'>
                        {t('planner.selected', { count: chosen.length })}
                      </h2>
                      <ul className='flex flex-col gap-1 text-sm'>
                        {chosen.map(i => (
                          <li
                            key={`${plan.sections[i].x0}-${plan.sections[i].y0}`}
                            className='flex justify-between gap-3'
                          >
                            <span className='text-foreground'>
                              {plan.sections[i].crop
                                ? name(plan.sections[i].crop!)
                                : '–'}
                            </span>
                            <span className='text-right text-muted-foreground'>
                              {placeName(t, plan.sections[i], plan.garden)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className='text-sm text-muted-foreground'>
                        {t('planner.palette.toSelected', {
                          count: chosen.length,
                        })}
                      </p>
                      <div className='flex flex-wrap gap-2'>
                        {/* All in the ground already: the way back instead. */}
                        {allPlanted ? (
                          <Button
                            variant='outline'
                            onClick={() => plantOn(chosen, undefined)}
                          >
                            {t('planner.notPlanted')}
                          </Button>
                        ) : (
                          <Button onClick={() => plantOn(chosen, today())}>
                            {t(goesIn(chosen.map(i => plan.sections[i].crop)))}
                          </Button>
                        )}
                        <Button variant='ghost' onClick={() => setSel([])}>
                          {t('planner.clearSelection')}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {patch !== null ? (
                    <div className='flex flex-col gap-3'>
                      <h2 className='type-micro text-muted-foreground'>
                        {t('planner.bare')}
                      </h2>
                      <p className='text-sm text-muted-foreground'>
                        {t('planner.bareText')}
                      </p>
                      <Button
                        className='self-start'
                        onClick={() => {
                          const first = plan.sections.length;
                          const back = restoreBed(plan, patch);
                          update({
                            ...back,
                            sections: autoPlan(back.sections, status, {
                              north,
                              keepChosen: true,
                              style: plan.garden.style,
                              axis,
                              sow: today(),
                            }),
                          });
                          only(first);
                        }}
                      >
                        {t('planner.putBed')}
                      </Button>
                    </div>
                  ) : null}
                  {s ? (
                    <SectionPanel
                      section={s}
                      index={plan.sections.indexOf(s)}
                      sections={plan.sections}
                      garden={plan.garden}
                      advice={advice}
                      harvest={
                        s.crop ? year?.crops[s.crop]?.harvest : undefined
                      }
                      temps={temps}
                      need={s.crop ? needs[s.crop] : undefined}
                      count={count}
                      onSwap={crop => place(chosen, crop)}
                      onPlanted={planted => plantOn(chosen, planted)}
                      onDay={day =>
                        edit(
                          chosen.filter(i => plan.sections[i]?.crop),
                          x => ({ ...x, planted: day })
                        )
                      }
                      onSplit={() =>
                        update({
                          ...plan,
                          sections: split(
                            plan.sections,
                            plan.sections.indexOf(s),
                            axis
                          ),
                        })
                      }
                      onMerge={dir => {
                        const i = plan.sections.indexOf(s);
                        const next = merge(plan.sections, i, dir, axis);
                        update({ ...plan, sections: next });
                        only(
                          next.findIndex(
                            x =>
                              x.bed === s.bed &&
                              x.part === Math.max(0, s.part + Math.min(0, dir))
                          )
                        );
                      }}
                      onLength={delta =>
                        update({
                          ...plan,
                          sections: lengthen(
                            plan.sections,
                            plan.sections.indexOf(s),
                            delta,
                            axis
                          ),
                        })
                      }
                      onDeleteBed={() => {
                        update(removeBed(plan, s.bed));
                        only(0);
                      }}
                    />
                  ) : null}
                  <div>
                    <h2 className='type-micro mb-2 text-muted-foreground'>
                      {t('planner.allBeds')}
                    </h2>
                    <ul className='flex flex-col gap-1'>
                      {plan.sections.map((x, i) =>
                        x.crop ? (
                          <li key={`${x.bed}-${x.x0}-${x.y0}`}>
                            <button
                              type='button'
                              aria-current={
                                patch === null && chosen.includes(i)
                              }
                              onClick={() => pick(i)}
                              className='focus-ring grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted aria-[current=true]:bg-muted'
                            >
                              <img
                                src={photo(x.crop)}
                                alt=''
                                className='size-8 rounded-md object-cover'
                              />
                              <span className='min-w-0'>
                                <span className='block truncate font-medium text-foreground'>
                                  {name(x.crop)}
                                  {notes(plan.sections, i, north).some(
                                    n => n.bad
                                  ) ? (
                                    <span className='ml-1 font-bold text-destructive-text'>
                                      !
                                    </span>
                                  ) : null}
                                </span>
                                <span className='block text-xs text-muted-foreground'>
                                  {placeName(t, x, plan.garden)}
                                </span>
                              </span>
                              <span className='flex items-center gap-1 text-xs text-muted-foreground tabular-nums'>
                                {x.planted ? (
                                  <Check className='size-3.5 text-primary-text' />
                                ) : null}
                                {count(x)}
                              </span>
                            </button>
                          </li>
                        ) : null
                      )}
                    </ul>
                  </div>
                </aside>
              }
            </div>
          </section>
        )}
        <p className='mt-4 text-sm text-muted-foreground'>
          {t('planner.footnote', {
            date: new Intl.DateTimeFormat(i18n.language, {
              day: 'numeric',
              month: 'long',
            }).format(new Date(`${advice.day}T12:00:00`)),
          })}
        </p>
      </div>
    </>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

/** The crops, to drag onto a bed or tap into the selected sections; those
 *  that go in now come first. */
function Palette({
  goes,
  label,
  count,
  onPick,
  onDrop,
}: {
  /** It goes in in the month planned for. */
  goes: (crop: string) => boolean;
  /** What a crop that goes in then says: "Sow now", "Plant in March". */
  label: (how: 'sow' | 'plant') => string;
  /** Sections selected: a tapped crop goes into them. */
  count: number;
  onPick: (crop: string) => void;
  /** A crop dropped on section `index` by touch (a mouse drops on the model). */
  onDrop: (index: number, crop: string) => void;
}) {
  const { t } = useTranslation('huerta');
  const [kind, setKind] = useState<string>('all');
  const [term, setTerm] = useState('');
  const lifted = useTouchDrag(onDrop);
  const crops = useMemo(() => {
    const text = term.trim().toLowerCase();
    return CROPS.filter(
      c =>
        (kind === 'all' || c.kind === kind) &&
        (t(`crops.${c.id}`).toLowerCase().includes(text) ||
          c.scientific.toLowerCase().includes(text))
    ).sort(
      (a, z) =>
        Number(goes(z.id)) - Number(goes(a.id)) ||
        t(`crops.${a.id}`).localeCompare(t(`crops.${z.id}`))
    );
  }, [kind, term, goes, t]);
  return (
    <div className='border-t border-border p-4'>
      {/* The hint drops under the title and search on a phone. */}
      <div className='mb-3 flex flex-wrap items-center gap-x-4 gap-y-1'>
        <h2 className='text-base font-semibold text-foreground'>
          {t('planner.palette.title')}
        </h2>
        <p className='order-last basis-full text-sm text-muted-foreground sm:order-none sm:flex-1 sm:basis-auto sm:text-right'>
          {count
            ? t('planner.palette.toSelected', { count })
            : t('planner.palette.hint')}
        </p>
        <label className='relative ml-auto sm:ml-0'>
          <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            type='search'
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder={t('map.search')}
            aria-label={t('map.search')}
            className='h-9 w-40 rounded-full pl-8 text-sm sm:w-48'
          />
        </label>
      </div>
      <CategoryChips
        chips={KINDS.map(value => ({
          value,
          label: t(`kinds.${value}`),
          icon: huertaImage(`kinds/${value}`),
        }))}
        value={kind}
        onChange={setKind}
        // One row on a phone, scrolled sideways, narrower chips and no bar, so
        // the crops stay near the garden.
        className='flex-nowrap justify-start gap-1.5 overflow-x-auto sm:flex-wrap sm:gap-2 [&>*]:shrink-0 max-sm:[&>button]:px-3 max-sm:[&_img]:size-5 max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden'
      />
      <ul
        ref={lifted.list}
        // Two rows scrolled sideways on a phone; a grid that scrolls down above.
        className='mt-3 grid auto-cols-[9.5rem] grid-flow-col grid-rows-2 gap-2 overflow-x-auto p-0.5 max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden sm:max-h-[22rem] sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:grid-rows-none sm:overflow-x-visible sm:overflow-y-auto'
      >
        {crops.map(c => (
          <li key={c.id} className='min-w-0'>
            <button
              type='button'
              data-crop={c.id}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData(CROP_DRAG, c.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => count && onPick(c.id)}
              className='focus-ring flex w-full cursor-grab touch-manipulation items-center gap-2 rounded-lg bg-card p-1.5 text-left text-sm elevation-raised select-none hover:bg-muted active:cursor-grabbing [-webkit-touch-callout:none]'
            >
              <img
                src={photo(c.id)}
                alt=''
                draggable={false}
                // Not the long press's target: a held photo opens the
                // browser's image menu, which cancels the touch.
                className='pointer-events-none size-9 rounded-md object-cover'
              />
              <span className='min-w-0'>
                <span className='block truncate font-medium text-foreground'>
                  {t(`crops.${c.id}`)}
                </span>
                <span
                  className={cn(
                    'block truncate text-xs',
                    goes(c.id)
                      ? 'font-medium text-primary-text'
                      : 'text-muted-foreground'
                  )}
                >
                  {goes(c.id) ? label(c.how) : t('planner.later')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {crops.length ? null : (
        <p className='py-4 text-sm text-muted-foreground'>
          {t('map.noResults')}
        </p>
      )}
      {lifted.lifted
        ? createPortal(
            // Placed by transform from its corner; the inner offsets keep it
            // above the finger, where the bed under it stays in sight.
            <img
              ref={lifted.ghost}
              src={photo(lifted.lifted)}
              alt=''
              className='pointer-events-none fixed top-0 left-0 z-50 -mt-17 -ml-7 size-14 rounded-lg object-cover shadow-lg ring-2 ring-primary will-change-transform'
              style={{
                transform: `translate(${lifted.at.current[0]}px, ${lifted.at.current[1]}px)`,
              }}
            />,
            document.body
          )
        : null}
    </div>
  );
}

/** How long a finger holds a crop before it lifts: shorter is a scroll. */
const LIFT_MS = 280;

/** Drag by touch, which HTML drag and drop does not do on phones: hold a crop
 *  tile until it lifts (a buzz, where the phone has one), move it over a bed,
 *  let go. A finger that moves before it lifts scrolls the strip as before.
 *  Returns the list's ref and where the lifted crop is. */
function useTouchDrag(onDrop: (index: number, crop: string) => void) {
  const list = useRef<HTMLUListElement>(null);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  // The crop lifted (one render when it lifts, one when it drops); the
  // finger's moves go straight to the lifted image's style, so a move costs
  // no render: a render of the garden per move (up to 1,500 plants) took
  // ~140 ms on a phone, and the browser then took the gesture as a scroll.
  const [lifted, setLifted] = useState<string | null>(null);
  const ghost = useRef<HTMLImageElement>(null);
  const at = useRef<[number, number]>([0, 0]);
  useEffect(() => {
    const ul = list.current;
    if (!ul) return;
    let hold = 0;
    let start: { crop: string; x: number; y: number } | null = null;
    let dragging = false;
    let over: number | null = null;
    // The model's outline for the bed under the finger (GardenModel), moved
    // by its attributes: a render of the garden per new bed took half a
    // second on a phone.
    const outline = (bed: number | null) => {
      over = bed;
      const mark = document.querySelector('[data-touch-over]');
      const poly =
        bed === null
          ? null
          : document.querySelector(`polygon[data-sec="${bed}"]`);
      if (!mark) return;
      mark.setAttribute('points', poly?.getAttribute('points') ?? '');
      mark.setAttribute('visibility', poly ? 'visible' : 'hidden');
    };
    const follow = (x: number, y: number) => {
      at.current = [x, y];
      if (ghost.current)
        ghost.current.style.transform = `translate(${x}px, ${y}px)`;
    };
    const bedAt = (x: number, y: number) => {
      const bed = document.elementFromPoint(x, y)?.closest('[data-sec]');
      return bed ? Number(bed.getAttribute('data-sec')) : null;
    };
    const end = () => {
      window.clearTimeout(hold);
      start = null;
      dragging = false;
      setLifted(null);
      if (over !== null) outline(null);
    };
    // A long press on a tile is ours: no image or text menu.
    const menu = (e: Event) => {
      if ((e.target as Element).closest('[data-crop]')) e.preventDefault();
    };
    const down = (e: TouchEvent) => {
      const tile = (e.target as Element).closest<HTMLElement>('[data-crop]');
      if (!tile || e.touches.length > 1) return;
      const f = e.touches[0];
      start = { crop: tile.dataset.crop!, x: f.clientX, y: f.clientY };
      hold = window.setTimeout(() => {
        if (!start) return;
        dragging = true;
        navigator.vibrate?.(15);
        follow(start.x, start.y);
        setLifted(start.crop);
      }, LIFT_MS);
    };
    const move = (e: TouchEvent) => {
      if (!start) return;
      const f = e.touches[0];
      if (dragging) {
        e.preventDefault(); // the page holds still under the lifted crop
        follow(f.clientX, f.clientY);
        const bed = bedAt(f.clientX, f.clientY);
        if (bed !== over) outline(bed);
      } else if (Math.hypot(f.clientX - start.x, f.clientY - start.y) > 8)
        end();
    };
    const up = (e: TouchEvent) => {
      if (dragging && start) {
        e.preventDefault(); // no tap after a drop
        const f = e.changedTouches[0];
        const bed = bedAt(f.clientX, f.clientY);
        if (bed !== null) drop.current(bed, start.crop);
      }
      end();
    };
    ul.addEventListener('touchstart', down, { passive: true });
    ul.addEventListener('touchmove', move, { passive: false });
    ul.addEventListener('touchend', up);
    ul.addEventListener('touchcancel', end);
    ul.addEventListener('contextmenu', menu);
    return () => {
      ul.removeEventListener('contextmenu', menu);
      window.clearTimeout(hold);
      ul.removeEventListener('touchstart', down);
      ul.removeEventListener('touchmove', move);
      ul.removeEventListener('touchend', up);
      ul.removeEventListener('touchcancel', end);
    };
  }, []);
  return { list, lifted, ghost, at };
}

/** Under the drawing: a slider from today to a year ahead (the drawing shows
 *  the garden on that day) and a line saying what is ready and growing then. */
function Timeline({
  weeks,
  onWeeks,
  line,
}: {
  weeks: number;
  onWeeks: (weeks: number) => void;
  line: string;
}) {
  const { t, i18n } = useTranslation('huerta');
  const day = addDays(today(), 7 * weeks);
  const long = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${day}T12:00:00`));
  const tick = (months: number) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(
      new Date(`${monthAhead(today(), months)}T12:00:00`)
    );
  return (
    <div className='border-t border-border px-4 py-3'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
        <label
          htmlFor='planner-when'
          className='text-sm font-semibold text-foreground'
        >
          {weeks ? long : t('planner.timeline.now')}
        </label>
        {weeks ? (
          <Button
            variant='link'
            className='h-auto p-0 text-sm'
            onClick={() => onWeeks(0)}
          >
            {t('planner.timeline.back')}
          </Button>
        ) : (
          <span className='text-sm text-muted-foreground'>
            {t('planner.timeline.hint')}
          </span>
        )}
      </div>
      <input
        id='planner-when'
        type='range'
        min={0}
        max={TIMELINE_WEEKS}
        step={1}
        value={weeks}
        onChange={e => onWeeks(Number(e.target.value))}
        aria-valuetext={weeks ? long : t('planner.timeline.now')}
        className='h-11 w-full cursor-pointer accent-primary'
      />
      <div className='flex justify-between text-xs text-muted-foreground'>
        <span>{t('planner.timeline.now')}</span>
        <span>{tick(6)}</span>
        <span>{tick(12)}</span>
      </div>
      {weeks ? (
        <p className='mt-2 text-sm text-muted-foreground'>{line}</p>
      ) : null}
    </div>
  );
}

const COMPASS = ['north', 'east', 'south', 'west'] as const;
/** The compass side of a bed's first section: its top end, or its left end
 *  when beds run across. */
function firstEnd(g: Garden) {
  const bearing = (g.north ?? 0) + (axisOf(g) === 'y' ? 0 : 270);
  return Math.round((((bearing % 360) + 360) % 360) / 90) % 4;
}

/** "Bed 2, north half" (or "Strip 2" in an open plot). */
const placeName = (t: T, s: Section, g: Garden) => {
  const first = COMPASS[firstEnd(g)],
    last = COMPASS[(firstEnd(g) + 2) % 4];
  return [
    t(g.ground === 'rows' ? 'planner.strip' : 'planner.bed', { n: s.bed + 1 }),
    s.parts === 1
      ? null
      : t(
          `planner.part.${
            s.parts === 2
              ? `${s.part ? last : first}Half`
              : s.part === 0
                ? `${first}End`
                : s.part === s.parts - 1
                  ? `${last}End`
                  : 'middle'
          }`
        ),
  ]
    .filter(Boolean)
    .join(', ');
};

function SectionPanel({
  section: s,
  index,
  sections,
  garden,
  advice,
  need,
  harvest,
  temps,
  count,
  onSwap,
  onPlanted,
  onDay,
  onSplit,
  onMerge,
  onLength,
  onDeleteBed,
}: {
  section: Section;
  index: number;
  sections: Section[];
  garden: Garden;
  advice: PlaceAdvice;
  need?: CropNeeds;
  /** The crop's harvest months at the place (bit 0 = January), when known. */
  harvest?: number;
  /** The place's monthly mean temperatures, when known. */
  temps?: number[];
  count: (s: Section) => string;
  onSwap: (crop: string) => void;
  onPlanted: (day: string | undefined) => void;
  /** The day it went in, put right. */
  onDay: (day: string) => void;
  onSplit: () => void;
  onMerge: (dir: -1 | 1) => void;
  onLength: (delta: number) => void;
  onDeleteBed: () => void;
}) {
  const { t, i18n } = useTranslation('huerta');
  const crop = s.crop ? CROP[s.crop] : null;
  const st = s.crop ? advice.crops[s.crop] : undefined;
  // Planned for a later day: it waits for that, whatever this week says.
  const later = !s.planted && s.sow && s.sow > today() ? s.sow : null;
  const f = fit(s, garden.ground === 'rows');
  const due = crop
    ? ready(st, need?.days ?? null, new Date(`${advice.day}T12:00:00`))
    : null;
  const month = (m: number) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(
      new Date(2026, m, 1)
    );
  // Put where it can't go in any more: no ready day to promise.
  const gone = !s.planted && !later && (st === 'too_late' || st === 'not_here');
  // The day it is ready, from the warmth since its planted (or planned) day.
  const readyOn =
    crop && !crop.note && !gone && temps && need?.days
      ? readyDay(
          crop.id,
          need,
          temps,
          s.planted ?? (s.sow && s.sow > today() ? s.sow : today())
        )
      : null;
  const options = useMemo(() => {
    const sorted = [...CROPS].sort((a, z) =>
      t(`crops.${a.id}`).localeCompare(t(`crops.${z.id}`))
    );
    return {
      now: sorted.filter(c => advice.crops[c.id] === 'now'),
      later: sorted.filter(c => advice.crops[c.id] !== 'now'),
    };
  }, [advice, t]);
  const near = notes(sections, index, garden.north ?? 0);
  const axis: Axis = axisOf(garden);
  const length = axis === 'y' ? s.y1 - s.y0 : s.x1 - s.x0;

  return (
    <div className='flex flex-col gap-4'>
      <h2 className='type-micro text-muted-foreground'>
        {placeName(t, s, garden)}
      </h2>
      {crop ? (
        <>
          <div className='grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3'>
            <img
              src={photo(crop.id)}
              alt=''
              className='size-16 rounded-xl object-cover'
            />
            <div className='min-w-0'>
              <p className='text-lg leading-tight font-semibold text-foreground'>
                {t(`crops.${crop.id}`)}
              </p>
              <p className='text-xs text-muted-foreground italic'>
                {crop.scientific}
              </p>
              {s.planted ? null : (
                // Its planned month when it goes in later; a red outline
                // when it was put where it can't go in now.
                <Badge
                  variant={later || st !== 'now' ? 'outline' : 'default'}
                  className={cn(
                    'mt-1.5',
                    later && 'font-semibold text-primary-text',
                    !later &&
                      st !== 'now' &&
                      'border-destructive-text text-destructive-text'
                  )}
                >
                  {later
                    ? t(
                        crop.how === 'sow'
                          ? 'planner.sowIn'
                          : 'planner.plantIn',
                        { month: month(Number(later.slice(5, 7)) - 1) }
                      )
                    : st === 'now'
                      ? t(`sheet.${crop.how}Now`)
                      : st
                        ? t(`status.${st}`)
                        : '–'}
                </Badge>
              )}
            </div>
          </div>
          <dl className='grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm'>
            <dt className='text-muted-foreground'>{t('planner.howMany')}</dt>
            <dd className='text-foreground'>{count(s)}</dd>
            <dt className='text-muted-foreground'>{t('planner.spacing')}</dt>
            <dd className='text-foreground'>
              {!f
                ? t('sheet.scatter')
                : Math.round(f.spacing * 100) === Math.round(f.across * 100)
                  ? t('planner.eachWay', { value: Math.round(f.spacing * 100) })
                  : t('sheet.apartRows', {
                      value: Math.round(f.spacing * 100),
                      rows: Math.round(f.across * 100),
                    })}
            </dd>
            <dt className='text-muted-foreground'>{t('planner.when')}</dt>
            <dd className='text-foreground'>
              {crop.note
                ? t(`sheet.ready.${crop.note}`)
                : gone
                  ? '–'
                  : readyOn
                    ? t('planner.readyOn', {
                        date: new Intl.DateTimeFormat(i18n.language, {
                          day: 'numeric',
                          month: 'long',
                        }).format(new Date(`${readyOn}T12:00:00`)),
                      })
                    : harvest
                      ? t('planner.readyAround', {
                          month: month(
                            nextMonth(harvest, new Date().getMonth()) ?? 0
                          ),
                        })
                      : due?.key === 'readyNextSpring'
                        ? t('planner.readyNextSpring')
                        : due
                          ? t('planner.readyAround', {
                              month: month(due.month),
                            })
                          : '–'}
            </dd>
            <dt className='text-muted-foreground'>{t('planner.nextYear')}</dt>
            <dd className='text-foreground'>
              {t(`planner.next.${nextYear(crop.id)}`)}
            </dd>
          </dl>
          {s.planted ? (
            <div className='flex flex-wrap items-center gap-x-3 gap-y-2 text-sm'>
              <label className='flex items-center gap-2 font-medium text-foreground'>
                <Check className='size-4 text-primary-text' />
                {t(
                  crop.how === 'sow'
                    ? 'planner.sownOnInput'
                    : 'planner.plantedOnInput'
                )}
                <Input
                  type='date'
                  value={s.planted}
                  max={today()}
                  onChange={e => e.target.value && onDay(e.target.value)}
                  className='h-8 w-auto px-2 text-sm'
                />
              </label>
              <Button
                variant='link'
                className='h-auto p-0'
                onClick={() => onPlanted(undefined)}
              >
                {t('planner.notPlanted')}
              </Button>
            </div>
          ) : (
            <Button onClick={() => onPlanted(today())} className='self-start'>
              {t(goesIn([crop.id]))}
            </Button>
          )}
          <div>
            <h3 className='type-micro mb-2 text-muted-foreground'>
              {t('planner.neighbours')}
            </h3>
            {near.length ? (
              <ul className='flex flex-col gap-2 text-sm'>
                {near.map(n => (
                  <li
                    key={n.with + n.key}
                    className='grid grid-cols-[1rem_minmax(0,1fr)] gap-2'
                  >
                    <span
                      aria-hidden='true'
                      className={cn(
                        'font-bold',
                        n.bad ? 'text-destructive-text' : 'text-primary-text'
                      )}
                    >
                      {n.bad ? '!' : '✓'}
                    </span>
                    <span>
                      <span className='text-foreground'>
                        {n.key === 'shade'
                          ? t('planner.rule.shade', {
                              tall: t(`crops.${n.tall}`),
                              short: t(`crops.${n.short}`),
                            })
                          : t(`planner.rule.${n.key}`)}
                      </span>
                      <span className='block text-xs text-muted-foreground'>
                        {t('planner.nextTo', { crop: t(`crops.${n.with}`) })} ·{' '}
                        {t(`planner.basis.${n.basis}`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('planner.noNeighbours')}
              </p>
            )}
          </div>
        </>
      ) : null}
      <div className='flex flex-col gap-2'>
        <label
          htmlFor='planner-swap'
          className='type-micro text-muted-foreground'
        >
          {t('planner.swap')}
        </label>
        <Select value={s.crop ?? undefined} onValueChange={onSwap}>
          <SelectTrigger
            id='planner-swap'
            aria-label={t('planner.swap')}
            className='w-full'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>
                {t('planner.goesInNow', { place: advice.place })}
              </SelectLabel>
              {options.now.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {t(`crops.${c.id}`)}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>{t('planner.later')}</SelectLabel>
              {options.later.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {t(`crops.${c.id}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' disabled={length < 0.6} onClick={onSplit}>
            {t('planner.split')}
          </Button>
          <Button
            variant='outline'
            disabled={s.part === 0}
            onClick={() => onMerge(-1)}
          >
            {t('planner.mergePrev')}
          </Button>
          <Button
            variant='outline'
            disabled={s.part === s.parts - 1}
            onClick={() => onMerge(1)}
          >
            {t('planner.mergeNext')}
          </Button>
        </div>
        <div className='flex items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>{t('planner.length')}</span>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('planner.shorter')}
            disabled={s.parts < 2 || length <= 0.31}
            onClick={() => onLength(-0.1)}
          >
            <Minus className='size-4' />
          </Button>
          <span className='min-w-14 text-center text-foreground tabular-nums'>
            {t('planner.lengthValue', { value: length.toFixed(1) })}
          </span>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('planner.longer')}
            disabled={s.parts < 2}
            onClick={() => onLength(0.1)}
          >
            <Plus className='size-4' />
          </Button>
        </div>
        <Button
          variant='ghost'
          className='self-start text-destructive-text'
          onClick={onDeleteBed}
        >
          <Trash2 className='size-4' />
          {t(
            garden.ground === 'rows'
              ? 'planner.deleteStrip'
              : 'planner.deleteBed'
          )}
        </Button>
      </div>
    </div>
  );
}
