import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/SegmentedControl';
import { GUIDES } from '@/lib/crop-guides';
import {
  addLine,
  addRounds,
  arrange,
  cropLines,
  dropLine,
  growLine,
  lastOf,
  nextFree,
  shrinkLine,
  type CropLine,
} from '@/lib/crop-plan';
import { CROPS, huertaImage, type CropStatus } from '@/lib/huerta';
import { plain } from '@/lib/huerta-api';
import {
  LayoutGrid,
  Minus,
  MoreHorizontal,
  Plus,
  Repeat,
  Search,
} from '@/lib/icons';
import { fit, type Plan, type Section } from '@/lib/planner';

// The usual gaps between sowings; more would not fit a phone's dialog.
const WEEKS = [2, 3, 4] as const;
const MAX_ROUNDS = 8;

/**
 * The garden by crop, beside its drawing: one line per crop and the day it
 * goes in, with how much of it there is and when it is ready. A planned
 * line grows or shrinks a section at a time (into the free section touching
 * it), is sown again in rounds, or comes out of the plan; what is in the
 * ground is changed in its own panel. Arrange lays every crop in one piece
 * (lib/crop-plan). The way to plan a field, where a section at a time is
 * hundreds of taps.
 */
export function CropList({
  plan,
  status,
  sow,
  today,
  readyOf,
  onSections,
  onShow,
}: {
  plan: Plan;
  /** A crop's status when it goes in: this week's, or the planned month's. */
  status: (crop: string) => CropStatus | undefined;
  /** The day crops added now go in (today, or the 1st of a month ahead). */
  sow: string;
  today: string;
  /** The day a section's crop is ready, YYYY-MM-DD; null when not known. */
  readyOf: (index: number) => string | null;
  /** The plan's sections changed (one Undo step). */
  onSections: (sections: Section[]) => void;
  /** A line's sections, selected on the drawing. */
  onShow: (ids: number[]) => void;
}) {
  const { t, i18n } = useTranslation('huerta');
  const [adding, setAdding] = useState(false);
  const [rounds, setRounds] = useState<CropLine | null>(null);
  const { sections, garden } = plan;
  const open = garden.ground === 'rows';
  const name = (crop: string) => t(`crops.${crop}`);
  const lines = cropLines(sections).sort(
    (a, z) =>
      name(a.crop).localeCompare(name(z.crop), i18n.language) ||
      (a.day ?? '').localeCompare(z.day ?? '')
  );
  const date = (day: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${day}T12:00:00`));
  const room = nextFree(sections, []) !== null;

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-2'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h2 className='text-base font-semibold text-foreground'>
            {t('planner.list.title')}
          </h2>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              disabled={lines.length < 2}
              onClick={() =>
                onSections(
                  arrange(sections, {
                    north: garden.north,
                    past: plan.past,
                    today,
                  })
                )
              }
            >
              <LayoutGrid className='size-4' />
              {t('planner.list.arrange')}
            </Button>
            <Button disabled={!room} onClick={() => setAdding(true)}>
              <Plus className='size-4' />
              {t('planner.list.add')}
            </Button>
          </div>
        </div>
        <p className='text-xs text-muted-foreground'>
          {room ? t('planner.list.hint') : t('planner.list.full')}
        </p>
      </div>

      {lines.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('planner.list.empty')}
        </p>
      ) : (
        <ul className='flex flex-col'>
          {lines.map(line => {
            const plants = line.ids.reduce(
              (n, i) => n + (fit(sections[i], open)?.count ?? 0),
              0
            );
            const area = line.ids.reduce((sum, i) => {
              const s = sections[i];
              return sum + (s.x1 - s.x0) * (s.y1 - s.y0);
            }, 0);
            // Eaten fresh, the guides' plants a person, middle of the range.
            const fresh = GUIDES[line.crop]?.perPerson?.fresh;
            const people = fresh
              ? Math.floor(plants / ((fresh[0] + fresh[1]) / 2))
              : 0;
            const ready = readyOf(line.ids[0]);
            const when = line.planted
              ? t('planner.list.inSince', { date: date(line.day!) })
              : line.day
                ? t('planner.list.goesIn', { date: date(line.day) })
                : t('planner.list.goesNow');
            return (
              <li
                key={`${line.crop}|${line.planted}|${line.day}`}
                className='flex gap-3 border-t border-border py-3 first:border-t-0 first:pt-0'
              >
                <img
                  src={huertaImage(`crops/${line.crop}`)}
                  alt=''
                  className='size-11 shrink-0 rounded-lg object-cover'
                />
                <div className='flex min-w-0 flex-1 flex-col gap-1'>
                  <div className='flex items-center justify-between gap-2'>
                    <button
                      type='button'
                      onClick={() => onShow(line.ids)}
                      className='focus-ring min-h-11 min-w-0 rounded-md text-left font-medium text-foreground hover:text-primary-text'
                    >
                      {name(line.crop)}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant='ghost'
                          size='icon'
                          aria-label={t('planner.list.menu', {
                            crop: name(line.crop),
                          })}
                        >
                          <MoreHorizontal className='size-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem onSelect={() => onShow(line.ids)}>
                          {t('planner.list.show')}
                        </DropdownMenuItem>
                        {line.planted ? null : (
                          <>
                            <DropdownMenuItem
                              disabled={!room}
                              onSelect={() => setRounds(line)}
                            >
                              <Repeat className='size-4' />
                              {t('planner.list.rounds')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                onSections(dropLine(sections, line))
                              }
                            >
                              {t('planner.list.remove')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className='-mt-2 text-xs text-muted-foreground'>
                    {[
                      t('planner.list.sections', { count: line.ids.length }),
                      t('planner.list.area', {
                        value: Math.round(area * 10) / 10,
                      }),
                      plants
                        ? t('planner.list.plants', { count: plants })
                        : null,
                      people > 0
                        ? t('planner.list.feeds', { count: people })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {/* The stepper beside the dates, or under them where
                      they would wrap (a phone). */}
                  <div className='flex flex-wrap items-center justify-between gap-x-2'>
                    <p className='min-w-0 flex-1 basis-36 text-xs text-muted-foreground'>
                      {ready
                        ? `${when} · ${t('planner.list.ready', { date: date(ready) })}`
                        : when}
                    </p>
                    {line.planted ? null : (
                      <div className='flex shrink-0 items-center'>
                        <Button
                          variant='outline'
                          size='icon'
                          aria-label={t('planner.list.less')}
                          disabled={lastOf(sections, line.ids) === null}
                          onClick={() => onSections(shrinkLine(sections, line))}
                        >
                          <Minus className='size-4' />
                        </Button>
                        <span className='min-w-7 text-center text-sm font-medium tabular-nums text-foreground'>
                          {line.ids.length}
                        </span>
                        <Button
                          variant='outline'
                          size='icon'
                          aria-label={t('planner.list.more')}
                          disabled={!room}
                          onClick={() => onSections(growLine(sections, line))}
                        >
                          <Plus className='size-4' />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AddCrop
        open={adding}
        onClose={() => setAdding(false)}
        status={status}
        onPick={crop => {
          const added = addLine(sections, crop, sow, garden.north);
          if (added) onSections(added.sections);
          setAdding(false);
        }}
      />
      <Rounds
        line={rounds}
        sow={sow}
        onClose={() => setRounds(null)}
        onAdd={(every, times) => {
          if (!rounds) return 1;
          const done = addRounds(sections, rounds, every, times, today);
          onSections(done.sections);
          return done.rounds;
        }}
      />
    </div>
  );
}

/** Every crop to add, those that go in now first; searched by name. */
function AddCrop({
  open,
  onClose,
  status,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  status: (crop: string) => CropStatus | undefined;
  onPick: (crop: string) => void;
}) {
  const { t, i18n } = useTranslation('huerta');
  const [query, setQuery] = useState('');
  const q = plain(query);
  const shown = CROPS.filter(
    c =>
      !q ||
      plain(t(`crops.${c.id}`)).includes(q) ||
      plain(c.scientific).includes(q)
  ).sort(
    (a, z) =>
      Number(status(z.id) === 'now') - Number(status(a.id) === 'now') ||
      t(`crops.${a.id}`).localeCompare(t(`crops.${z.id}`), i18n.language)
  );
  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) {
          onClose();
          setQuery('');
        }
      }}
    >
      <DialogContent className='flex max-h-[85dvh] flex-col'>
        <DialogHeader>
          <DialogTitle className='pr-8'>
            {t('planner.list.addTitle')}
          </DialogTitle>
          <DialogDescription>{t('planner.list.addText')}</DialogDescription>
        </DialogHeader>
        <div className='relative'>
          <Search className='pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            type='search'
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('find.placeholder')}
            aria-label={t('find.placeholder')}
            className='pl-11'
          />
        </div>
        <ul className='-mx-2 min-h-0 flex-1 overflow-y-auto'>
          {shown.map(c => {
            const st = status(c.id);
            return (
              <li key={c.id}>
                <button
                  type='button'
                  onClick={() => {
                    onPick(c.id);
                    setQuery('');
                  }}
                  className='focus-ring flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted'
                >
                  <img
                    src={huertaImage(`crops/${c.id}`)}
                    alt=''
                    loading='lazy'
                    className='size-10 shrink-0 rounded-lg object-cover'
                  />
                  <span className='min-w-0 flex-1 font-medium text-foreground'>
                    {t(`crops.${c.id}`)}
                  </span>
                  {st && st !== 'now' ? (
                    <Badge
                      variant='outline'
                      className='shrink-0 border-destructive-text text-destructive-text'
                    >
                      {t(`status.${st}`)}
                    </Badge>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** A line sown again in rounds: every so many weeks, so many times. */
function Rounds({
  line,
  sow,
  onClose,
  onAdd,
}: {
  line: CropLine | null;
  sow: string;
  onClose: () => void;
  /** Adds the rounds; how many there was room for (the line counted). */
  onAdd: (every: number, times: number) => number;
}) {
  const { t, i18n } = useTranslation('huerta');
  const [every, setEvery] = useState<number>(3);
  const [times, setTimes] = useState(4);
  const [fitted, setFitted] = useState<number | null>(null);
  const first = line?.day ?? sow;
  const dates = Array.from({ length: times }, (_, r) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
    }).format(new Date(Date.parse(`${first}T12:00:00`) + r * every * 7 * 864e5))
  );
  const close = () => {
    setFitted(null);
    onClose();
  };
  return (
    <Dialog open={line !== null} onOpenChange={next => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className='pr-8'>
            {line
              ? t('planner.list.roundsTitle', {
                  crop: t(`crops.${line.crop}`),
                })
              : null}
          </DialogTitle>
          <DialogDescription>{t('planner.list.roundsText')}</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1'>
            <span className='text-sm text-muted-foreground'>
              {t('planner.list.every')}
            </span>
            <SegmentedControl
              label={t('planner.list.every')}
              options={WEEKS.map(w => ({
                value: w,
                label: t('planner.list.weeks', { count: w }),
              }))}
              value={every}
              onChange={setEvery}
            />
          </div>
          <div className='flex items-center gap-3'>
            <span className='text-sm text-muted-foreground'>
              {t('planner.list.times')}
            </span>
            <Button
              variant='outline'
              size='icon'
              aria-label={t('planner.list.fewer')}
              disabled={times <= 2}
              onClick={() => setTimes(n => n - 1)}
            >
              <Minus className='size-4' />
            </Button>
            <span className='min-w-6 text-center font-medium tabular-nums'>
              {times}
            </span>
            <Button
              variant='outline'
              size='icon'
              aria-label={t('planner.list.moreRounds')}
              disabled={times >= MAX_ROUNDS}
              onClick={() => setTimes(n => n + 1)}
            >
              <Plus className='size-4' />
            </Button>
          </div>
          <p className='text-sm text-foreground'>
            {t('planner.list.dates', { dates: dates.join(', ') })}
          </p>
          {fitted !== null && fitted < times ? (
            <p role='status' className='text-sm text-destructive-text'>
              {t('planner.list.room', { count: fitted })}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          {fitted !== null ? (
            // Added as many as there was room for: nothing more to add.
            <Button onClick={close}>{t('map.close')}</Button>
          ) : (
            <>
              <Button variant='outline' onClick={close}>
                {t('gardens.cancel')}
              </Button>
              <Button
                onClick={() => {
                  const made = onAdd(every, times);
                  if (made < times) setFitted(made);
                  else close();
                }}
              >
                <Repeat className='size-4' />
                {t('planner.list.addRounds')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
