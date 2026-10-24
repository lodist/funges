import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { taskText, type From } from '@/lib/garden-task-text';
import { comingUp, gardenWeek, jobKey, toSow } from '@/lib/garden-week';
import {
  CROPS,
  huertaImage,
  type CropNeeds,
  type PlaceAdvice,
} from '@/lib/huerta';
import type { PlaceYear } from '@/lib/huerta-wire';
import { Clock, CloudRain, Droplets, Shovel, Snowflake } from '@/lib/icons';
import type { Plan } from '@/lib/planner';
import { cn } from '@/lib/utils';

const CROP = Object.fromEntries(CROPS.map(crop => [crop.id, crop]));
/** The picture beside a job: the weather's own, else the crop's photo. */
const ICON: Record<string, ComponentType<{ className?: string }>> = {
  frost: Snowflake,
  laterFrost: Snowflake,
  water: Droplets,
  rain: CloudRain,
  soil: Shovel,
  tooLate: Clock,
};

interface Job {
  key: string;
  kind: string;
  crop?: string;
  title: string;
  text: string;
  from: From;
  /** The sections it is about: lit up in the drawing when it is tapped. */
  at: number[];
  action?: { label: string; run: () => void; main?: boolean };
}

/** "This week" on My garden: the week at the place in one line, the garden's
 *  jobs (what, where and how, each with its tick), and the next four weeks.
 *  `advice` is the place's week as the Worker gives it; the soil's shift is
 *  applied inside, as for the morning alert. */
export function GardenThisWeek({
  plan,
  advice,
  needs,
  year,
  today,
  where,
  onSow,
  onDone,
  onShow,
  onReplan,
}: {
  plan: Plan;
  advice: PlaceAdvice;
  needs: Record<string, CropNeeds>;
  year: PlaceYear | null;
  today: string;
  /** A section's name: "Bed 2, north half". */
  where: (index: number) => string;
  /** Mark sections sown or planted today. */
  onSow: (at: number[]) => void;
  /** Tick a job off, by its key. */
  onDone: (key: string) => void;
  /** Select sections and bring the drawing into view. */
  onShow: (at: number[]) => void;
  /** Plan it for me, for just these sections. */
  onReplan: (at: number[]) => void;
}) {
  const { t, i18n } = useTranslation('huerta');
  const name = (id: string) => t(`crops.${id}`);
  const date = (day: string, month: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month }).format(
      new Date(`${day}T12:00:00`)
    );
  const beds = (at: number[]) => at.map(where).join('; ');
  const holding = (crops: string[]) =>
    plan.sections.flatMap((s, i) =>
      s.crop && crops.includes(s.crop) ? [i] : []
    );
  // How it goes in, as its sheet says: depth, then spacing.
  const how = (id: string) => {
    const c = CROP[id];
    return [
      c.depth === null
        ? t('sheet.depthPot')
        : t('sheet.depthCm', { value: c.depth }),
      c.spacing === null
        ? t('sheet.scatter')
        : c.rows === null
          ? t('sheet.apart', { value: c.spacing })
          : t('sheet.apartRows', { value: c.spacing, rows: c.rows }),
    ].join(', ');
  };
  const value = (n: number | null, unit: 'celsius' | 'mm' | 'litres') =>
    n === null ? '–' : t(`units.${unit}`, { value: Math.round(n) });
  const facts = [
    t(`frost.${advice.frost}`),
    `${t('week.short.soil')} ${value(advice.soil, 'celsius')}`,
    `${t('week.short.nights')} ${value(advice.nights, 'celsius')}`,
    `${t('week.short.rain')} ${value(advice.rain, 'mm')}`,
    `${t('week.short.water')} ${value(advice.water, 'litres')}`,
  ];

  const jobs = gardenWeek(plan, advice, needs, today, year)
    // When a crop will be ready is under Coming up.
    .filter(task => !(task.kind === 'stage' && task.step === 'harvestSoon'))
    .flatMap((task): Job[] => {
      if (task.kind === 'plantNow')
        return task.crops.map(crop => {
          const { at, since } = toSow(plan, crop, today);
          const sow = CROP[crop].how === 'sow';
          return {
            key: `plantNow:${crop}`,
            kind: task.kind,
            crop,
            title: since
              ? t('week.todo.forgot.title', {
                  crop: name(crop),
                  date: date(since),
                })
              : t(`week.todo.${sow ? 'sow' : 'plant'}.title`, {
                  crop: name(crop),
                }),
            text: since ? t('week.todo.forgot.text') : how(crop),
            from: 'plan',
            at,
            action: {
              label: t(sow ? 'planner.sownToday' : 'planner.plantedToday'),
              run: () => onSow(at),
              main: true,
            },
          };
        });
      const { title, text, from } = taskText(task, t, i18n.language);
      if (task.kind === 'tooLate') {
        const at = task.crops.flatMap(crop => toSow(plan, crop, today).at);
        return [
          {
            key: 'tooLate',
            kind: task.kind,
            title,
            text,
            from,
            at,
            action: { label: t('planner.auto'), run: () => onReplan(at) },
          },
        ];
      }
      const key = jobKey(task, plan, today);
      return [
        {
          key: key ?? task.kind,
          kind: task.kind,
          crop: 'crop' in task ? task.crop : undefined,
          title,
          text,
          from,
          at:
            'crop' in task
              ? holding([task.crop])
              : 'crops' in task
                ? holding(task.crops)
                : [],
          action: key
            ? { label: t('week.todo.done'), run: () => onDone(key) }
            : undefined,
        },
      ];
    });
  const coming = comingUp(plan, advice, needs, today, year);

  return (
    <section aria-labelledby='garden-week' className='flex flex-col gap-4'>
      <div>
        <h2 id='garden-week' className='text-xl font-semibold'>
          {t('week.todo.title')}
        </h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          {facts.join(' · ')}
        </p>
      </div>

      {jobs.length ? (
        <ul className='flex flex-col gap-3'>
          {jobs.map(job => {
            const Icon = ICON[job.kind];
            const body = (
              <>
                {Icon || !job.crop ? (
                  <span className='grid size-10 place-items-center rounded-lg bg-muted text-primary-text'>
                    {Icon ? <Icon className='size-5' /> : null}
                  </span>
                ) : (
                  <img
                    src={huertaImage(`crops/${job.crop}`)}
                    alt=''
                    className='size-10 rounded-lg object-cover'
                  />
                )}
                <span className='min-w-0'>
                  <span className='block font-semibold text-foreground'>
                    {job.title}
                  </span>
                  <span className='block text-sm text-muted-foreground'>
                    {job.text}
                  </span>
                  <span className='mt-1 block text-xs text-muted-foreground'>
                    {[t(`week.todo.from.${job.from}`), beds(job.at)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </>
            );
            return (
              <li
                key={job.key}
                className='flex flex-wrap items-center gap-3 rounded-card bg-card p-3 elevation-raised'
              >
                <Shows at={job.at} onShow={onShow}>
                  {body}
                </Shows>
                {job.action ? (
                  <Button
                    variant={job.action.main ? 'default' : 'outline'}
                    className='ml-auto'
                    onClick={job.action.run}
                  >
                    {job.action.label}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className='text-muted-foreground'>{t('week.todo.nothing')}</p>
      )}

      {coming.length ? (
        <div>
          <h3 className='type-micro mb-2 text-muted-foreground'>
            {t('week.coming.title')}
          </h3>
          <ul className='flex flex-col gap-1'>
            {coming.map(c => (
              <li key={`${c.kind}:${c.crop}:${'day' in c ? c.day : ''}`}>
                <button
                  type='button'
                  onClick={() => onShow(c.at)}
                  className='focus-ring grid w-full grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted'
                >
                  <span className='text-muted-foreground tabular-nums'>
                    {c.kind === 'wait'
                      ? t('week.coming.waiting')
                      : date(c.day, 'short')}
                  </span>
                  <span className='min-w-0'>
                    <span className='block font-medium text-foreground'>
                      {c.kind === 'ready'
                        ? t('week.coming.ready', { crop: name(c.crop) })
                        : c.kind === 'sow'
                          ? t(`week.coming.${CROP[c.crop].how}`, {
                              crop: name(c.crop),
                            })
                          : t('week.coming.wait', {
                              crop: name(c.crop),
                              reason: t(`status.${c.status}`),
                            })}
                    </span>
                    <span className='block text-xs text-muted-foreground'>
                      {beds(c.at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {coming.some(c => c.kind === 'ready') ? (
            <p className='mt-2 px-2 text-xs text-muted-foreground'>
              {t('week.coming.note')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** A job's picture and words: a button that lights up its sections, or
 *  plain text when it is about none (the weather). */
function Shows({
  at,
  onShow,
  children,
}: {
  at: number[];
  onShow: (at: number[]) => void;
  children: ReactNode;
}) {
  const layout =
    'grid min-w-0 flex-1 basis-64 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 text-left';
  return at.length ? (
    <button
      type='button'
      onClick={() => onShow(at)}
      className={cn('focus-ring rounded-lg', layout)}
    >
      {children}
    </button>
  ) : (
    <div className={layout}>{children}</div>
  );
}
