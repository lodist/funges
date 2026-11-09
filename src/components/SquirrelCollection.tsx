import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { artUrl, postcard } from '@/game/draw';
import { ALL, readFound } from '@/game/found';
import { cn } from '@/lib/utils';
import styles from '@/pages/PlayPage.module.scss';

/**
 * The game's collection: a column per landscape (its hour as a postcard once
 * reached, nameless like the stages themselves), then its two finds, its
 * treat and its ride, in colour once caught and a silhouette until then.
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
      <ul className={styles.tally}>
        {tally.map(([label, n, of]) => (
          <li key={label}>
            {t(label)} <b>{`${n}/${of}`}</b>
          </li>
        ))}
      </ul>
      <ul className={styles.album}>
        {ALL.map(place => {
          const seen = found.stages.has(place.stage);
          return (
            <li key={place.stage} className={styles.place}>
              <span
                className={cn(styles.postcard, !seen && styles.unseen)}
                style={seen ? { background: postcard(place.stage) } : undefined}
                role='img'
                aria-label={t(seen ? 'game.landscapeSeen' : 'game.notYet')}
              />
              {[
                ...place.finds,
                place.treat,
                ...(place.ride ? [place.ride] : []),
              ].map(item => (
                <Item key={item} item={item} caught={found.items.has(item)} />
              ))}
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
