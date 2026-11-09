import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { artUrl } from '@/game/draw';
import { ALL, readFound } from '@/game/found';
import { cn } from '@/lib/utils';
import styles from '@/pages/PlayPage.module.scss';

/**
 * The game's collection: a card per landscape, its picture and its name once
 * reached, then its two finds, its treat and its ride, in colour once caught
 * and a silhouette until then. The tally above.
 */
export function SquirrelCollection() {
  const { t } = useTranslation('common');
  const [found] = useState(readFound);
  const finds = ALL.flatMap(place => place.finds);
  const treats = ALL.map(place => place.treat);
  const rides = ALL.flatMap(place => (place.ride ? [place.ride] : []));
  const caught = (items: string[]) =>
    items.filter(item => found.items.has(item)).length;
  const tally: [string, number, number][] = [
    [
      'game.landscapes',
      ALL.filter(place => found.stages.has(place.stage)).length,
      ALL.length,
    ],
    ['game.finds', caught(finds), finds.length],
    ['game.treats', caught(treats), treats.length],
    ['game.rides', caught(rides), rides.length],
  ];

  return (
    <div className={styles.collection}>
      <p className={styles.hint}>{t('game.goal')}</p>
      <dl className={styles.tally}>
        {tally.map(([label, n, of]) => (
          <div key={label}>
            <dd>
              {n}
              <span>{`/${of}`}</span>
            </dd>
            <dt>{t(label)}</dt>
          </div>
        ))}
      </dl>
      <ul className={styles.cards}>
        {ALL.map(place => {
          const seen = found.stages.has(place.stage);
          return (
            <li key={place.stage} className={styles.card}>
              <img
                className={cn(styles.view, !seen && styles.unseen)}
                src={artUrl(`${place.stage}/postcard`)?.url}
                alt=''
                loading='lazy'
              />
              {seen ? (
                <p className={styles.place}>
                  {t(`game.places.${place.stage}`)}
                </p>
              ) : (
                <p className={cn(styles.place, styles.unknown)}>
                  <span aria-hidden>{'?'}</span>
                  <span className='sr-only'>{t('game.notYet')}</span>
                </p>
              )}
              <div className={styles.items}>
                {[
                  ...place.finds,
                  place.treat,
                  ...(place.ride ? [place.ride] : []),
                ].map(item => (
                  <Item key={item} item={item} caught={found.items.has(item)} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Item({ item, caught }: { item: string; caught: boolean }) {
  const { t } = useTranslation('common');
  const art = artUrl(item);
  const name = caught
    ? t(`game.items.${item.split('/')[1]}`)
    : t('game.notYet');
  return (
    <span
      className={cn(styles.item, !caught && styles.missing)}
      role='img'
      aria-label={name}
      title={name}
      style={
        art && {
          backgroundImage: `url(${art.url})`,
          // A strip of frames: the first one.
          backgroundSize:
            art.frames > 1 ? `${art.frames * 100}% auto` : undefined,
        }
      }
    />
  );
}
