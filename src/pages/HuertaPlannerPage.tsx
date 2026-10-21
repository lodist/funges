import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { GardenModel, type Stage } from '@/components/GardenModel';
import SEO from '@/components/SEO';
import { Badge } from '@/components/ui/badge';
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
import { Check, RotateCcw, RotateCw } from '@/lib/icons';
import {
  autoPlan,
  fit,
  layout,
  loadPlan,
  nextYear,
  notes,
  ready,
  savePlan,
  split,
  summary,
  UNIT,
  type Garden,
  type Plan,
  type Section,
} from '@/lib/planner';
import { growth } from '@/lib/garden-week';
import { cn } from '@/lib/utils';
import { nextMonth, useHuertaYear } from '@/hooks/use-huerta-year';

const START: Garden = { width: 6, length: 4.5, shape: 'rect' };
const CROP = Object.fromEntries(CROPS.map(crop => [crop.id, crop]));
const photo = (id: string) =>
  `${import.meta.env.BASE_URL}huerta/crops/${id}.webp`;
const today = () => new Date().toLocaleDateString('sv');

/** The chips' look (CategoryChips), for the planner's own choices. */
const chip = (on: boolean) =>
  cn(
    'h-9 px-3 text-foreground hover:text-foreground dark:hover:text-foreground',
    'bg-muted hover:bg-muted/80 dark:hover:bg-muted/80',
    on ? 'font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.08)]' : 'font-medium'
  );

/** Huerta's garden planner: your plot in beds, filled for this season at your
 *  place, drawn as a model, and what you planted when. */
export default function HuertaPlannerPage() {
  const { t, i18n } = useTranslation('huerta');
  const [advice, setAdvice] = useState<PlaceAdvice>(SAMPLE_ADVICE);
  const [sample, setSample] = useState(true);
  const [needs, setNeeds] = useState<Record<string, CropNeeds>>({});
  const [plan, setPlan] = useState<Plan | null>(() => loadPlan());
  const [turn, setTurn] = useState(0);
  // The section just planted, while its plants come up.
  const [fresh, setFresh] = useState<number | null>(null);
  const [sel, setSel] = useState(0);
  const year = useHuertaYear();
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
  // A first plan, once this week's statuses are known.
  useEffect(() => {
    if (plan || !settled) return;
    const fresh = { garden: START, sections: autoPlan(layout(START), status) };
    setPlan(fresh);
    // The sample's plan is not kept: the visitor's own place may follow.
    if (!sample) savePlan(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  const update = (next: Plan) => {
    setPlan(next);
    savePlan(next);
  };
  const resize = (garden: Garden) => {
    update({ garden, sections: autoPlan(layout(garden), status) });
    setSel(0);
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
    const f = fit(s);
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
  const s = plan.sections[sel] ?? plan.sections[0];
  const totals = summary(plan.sections);
  const plants = plan.sections.reduce((n, x) => n + (fit(x)?.count ?? 0), 0);
  const beds = new Set(plan.sections.map(x => x.bed)).size;

  return (
    <>
      <SEO
        title={t('planner.title')}
        description={t('planner.description')}
        canonicalUrl={`${import.meta.env.BASE_URL}huerta/planner`}
      />
      <div className='container mx-auto max-w-7xl px-4 py-8'>
        <header className='mb-6 flex flex-col gap-2'>
          <h1 className='text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl'>
            {t('planner.title')}
          </h1>
          <p className='text-muted-foreground'>
            {sample ? (
              <>
                {t('planner.sample', { place: advice.place })}{' '}
                <Link
                  to='/huerta'
                  className='font-medium text-primary-text underline underline-offset-4'
                >
                  {t('planner.choosePlace')}
                </Link>
              </>
            ) : (
              t('planner.for', { place: advice.place })
            )}
          </p>
        </header>

        <section className='overflow-hidden rounded-card bg-card elevation-raised'>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border p-4'>
            {(['width', 'length'] as const).map(key => (
              <label
                key={key}
                className='flex items-center gap-2 text-sm text-muted-foreground'
              >
                {t(`planner.${key}`)}
                <Input
                  id={`planner-${key}`}
                  type='number'
                  min={2}
                  max={12}
                  step={0.5}
                  defaultValue={plan.garden[key]}
                  key={`${key}-${plan.garden[key]}`}
                  className='h-9 w-20'
                  onBlur={e => {
                    const v = Math.min(
                      12,
                      Math.max(2, Number(e.target.value) || plan.garden[key])
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
            <Button
              onClick={() =>
                update({ ...plan, sections: autoPlan(plan.sections, status) })
              }
            >
              {t('planner.auto')}
            </Button>
            <div className='ml-auto flex items-center gap-2'>
              <Button
                variant='outline'
                size='icon'
                aria-label={t('planner.turnLeft')}
                onClick={() => setTurn((turn + 3) % 4)}
              >
                <RotateCcw className='size-4' />
              </Button>
              <Button
                variant='outline'
                size='icon'
                aria-label={t('planner.turnRight')}
                onClick={() => setTurn((turn + 1) % 4)}
              >
                <RotateCw className='size-4' />
              </Button>
            </div>
          </div>

          <div className='grid lg:grid-cols-[minmax(0,1fr)_22rem]'>
            <div className='min-w-0 bg-background/40'>
              {plan.sections.length > 0 ? (
                <GardenModel
                  garden={plan.garden}
                  sections={plan.sections}
                  selected={sel}
                  turn={turn}
                  onSelect={setSel}
                  stage={stageOf}
                  fresh={fresh}
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
              <p className='flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-4 py-3 text-sm text-muted-foreground'>
                <span>
                  {t('planner.beds', { count: beds })} ·{' '}
                  {t('planner.plants', { count: plants })}
                </span>
                <span>{t('planner.good', { count: totals.good })}</span>
                <span
                  className={
                    totals.bad.length ? 'text-destructive-text' : undefined
                  }
                >
                  {totals.bad.length
                    ? t('planner.toFix', { count: totals.bad.length })
                    : t('planner.nothingToFix')}
                </span>
                <span>{t('planner.paleSolid')}</span>
              </p>
            </div>

            {s ? (
              <aside className='flex flex-col gap-5 border-t border-border p-4 lg:border-t-0 lg:border-l'>
                <SectionPanel
                  section={s}
                  index={plan.sections.indexOf(s)}
                  sections={plan.sections}
                  advice={advice}
                  harvest={s.crop ? year?.crops[s.crop]?.harvest : undefined}
                  need={s.crop ? needs[s.crop] : undefined}
                  count={count}
                  onSwap={crop =>
                    update({
                      ...plan,
                      sections: plan.sections.map(x =>
                        x === s ? { ...x, crop, planted: undefined } : x
                      ),
                    })
                  }
                  onPlanted={planted => {
                    update({
                      ...plan,
                      sections: plan.sections.map(x =>
                        x === s ? { ...x, planted } : x
                      ),
                    });
                    if (planted) {
                      setFresh(plan.sections.indexOf(s));
                      setTimeout(() => setFresh(null), 2500);
                    }
                  }}
                  onSplit={() =>
                    update({
                      ...plan,
                      sections: split(plan.sections, plan.sections.indexOf(s)),
                    })
                  }
                />
                <div>
                  <h2 className='type-micro mb-2 text-muted-foreground'>
                    {t('planner.allBeds')}
                  </h2>
                  <ul className='flex flex-col gap-1'>
                    {plan.sections.map((x, i) =>
                      x.crop ? (
                        <li key={`${x.bed}-${x.y0}`}>
                          <button
                            type='button'
                            aria-current={i === sel}
                            onClick={() => setSel(i)}
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
                                {notes(plan.sections, i).some(n => n.bad) ? (
                                  <span className='ml-1 font-bold text-destructive-text'>
                                    !
                                  </span>
                                ) : null}
                              </span>
                              <span className='block text-xs text-muted-foreground'>
                                {placeName(t, x)}
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
            ) : null}
          </div>
        </section>
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

/** "Bed 2, north half". */
const placeName = (t: T, s: Section) =>
  [
    t('planner.bed', { n: s.bed + 1 }),
    s.parts === 1
      ? null
      : t(
          `planner.part.${
            s.parts === 2
              ? s.part
                ? 'southHalf'
                : 'northHalf'
              : s.part === 0
                ? 'northEnd'
                : s.part === s.parts - 1
                  ? 'southEnd'
                  : 'middle'
          }`
        ),
  ]
    .filter(Boolean)
    .join(', ');

function SectionPanel({
  section: s,
  index,
  sections,
  advice,
  need,
  harvest,
  count,
  onSwap,
  onPlanted,
  onSplit,
}: {
  section: Section;
  index: number;
  sections: Section[];
  advice: PlaceAdvice;
  need?: CropNeeds;
  /** The crop's harvest months at the place (bit 0 = January), when known. */
  harvest?: number;
  count: (s: Section) => string;
  onSwap: (crop: string) => void;
  onPlanted: (day: string | undefined) => void;
  onSplit: () => void;
}) {
  const { t, i18n } = useTranslation('huerta');
  const crop = s.crop ? CROP[s.crop] : null;
  const st = s.crop ? advice.crops[s.crop] : undefined;
  const f = fit(s);
  const due = crop
    ? ready(st, need?.days ?? null, new Date(`${advice.day}T12:00:00`))
    : null;
  const month = (m: number) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(
      new Date(2026, m, 1)
    );
  const date = (d: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${d}T12:00:00`));
  const options = useMemo(() => {
    const sorted = [...CROPS].sort((a, z) =>
      t(`crops.${a.id}`).localeCompare(t(`crops.${z.id}`))
    );
    return {
      now: sorted.filter(c => advice.crops[c.id] === 'now'),
      later: sorted.filter(c => advice.crops[c.id] !== 'now'),
    };
  }, [advice, t]);
  const near = notes(sections, index);

  return (
    <div className='flex flex-col gap-4'>
      <h2 className='type-micro text-muted-foreground'>{placeName(t, s)}</h2>
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
              <Badge
                variant={st === 'now' ? 'default' : 'secondary'}
                className='mt-1.5'
              >
                {st === 'now'
                  ? t(`sheet.${crop.how}Now`)
                  : st
                    ? t(`status.${st}`)
                    : '–'}
              </Badge>
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
                : harvest
                  ? t('planner.readyAround', {
                      month: month(
                        nextMonth(harvest, new Date().getMonth()) ?? 0
                      ),
                    })
                  : due?.key === 'readyNextSpring'
                    ? t('planner.readyNextSpring')
                    : due
                      ? t('planner.readyAround', { month: month(due.month) })
                      : '–'}
            </dd>
            <dt className='text-muted-foreground'>{t('planner.nextYear')}</dt>
            <dd className='text-foreground'>
              {t(`planner.next.${nextYear(crop.id)}`)}
            </dd>
          </dl>
          {s.planted ? (
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
              <span className='flex items-center gap-1.5 font-medium text-foreground'>
                <Check className='size-4 text-primary-text' />
                {t(
                  crop.how === 'sow' ? 'planner.sownOn' : 'planner.plantedOn',
                  { date: date(s.planted) }
                )}
              </span>
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
              {t(
                crop.how === 'sow'
                  ? 'planner.sownToday'
                  : 'planner.plantedToday'
              )}
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
        <Button
          variant='outline'
          disabled={s.y1 - s.y0 < 0.6}
          onClick={onSplit}
        >
          {t('planner.split')}
        </Button>
      </div>
    </div>
  );
}
