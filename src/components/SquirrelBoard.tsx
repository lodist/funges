import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  board,
  joinAccount,
  playerName,
  sendBests,
  setName,
  type Entry,
  type Route,
} from '@/game/board';
import { startSignIn, useSession } from '@/lib/huerta-session';
import styles from '@/pages/PlayPage.module.scss';

/**
 * The game's ranking, one board per route: the top runs, this device's name
 * (asked once, kept), and a way to keep it on every device by signing in.
 */
export function SquirrelBoard({
  route,
  onRoute,
}: {
  route: Route;
  onRoute: (route: Route) => void;
}) {
  const { t, i18n } = useTranslation('common');
  const signedIn = useSession();
  const [entries, setEntries] = useState<Entry[] | 'down' | null>(null);
  const [kept, setKept] = useState(playerName);
  const [name, setNameField] = useState(() => playerName() ?? '');
  const [problem, setProblem] = useState<'name' | 'down' | null>(null);
  // After a name is saved or taken from the account: the board once more,
  // past the browser's five minute copy.
  const fresh = useRef(false);

  // A new device, signed in: the account's name and bests, if it has any.
  useEffect(() => {
    if (!signedIn || playerName()) return;
    joinAccount().then(
      answer => {
        fresh.current = true;
        setKept(answer.name);
        setNameField(answer.name);
      },
      () => {} // no player on the account yet: the name is asked here
    );
  }, [signedIn]);

  useEffect(() => {
    let live = true;
    setEntries(null);
    // Bests not sent yet go first, so the board shows them.
    sendBests()
      .catch(() => ({}))
      .then(ranks => {
        const now = fresh.current || Object.keys(ranks).length > 0;
        fresh.current = false;
        return board(route, now);
      })
      .then(
        top => live && setEntries(top),
        () => live && setEntries('down')
      );
    return () => {
      live = false;
    };
  }, [route, kept]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    setName(name).then(
      answer => {
        fresh.current = true;
        setKept(answer.name);
        setNameField(answer.name);
      },
      (error: Error) =>
        setProblem(/ 400$/.test(error.message) ? 'name' : 'down')
    );
  };

  return (
    <div className={styles.board}>
      <SegmentedControl
        label={t('game.route')}
        options={[
          { value: 'classic', label: t('game.classic') },
          { value: 'random', label: t('game.random') },
        ]}
        value={route}
        onChange={onRoute}
      />
      {entries === 'down' ? (
        <p className={styles.hint}>{t('game.boardDown')}</p>
      ) : entries && entries.length === 0 ? (
        <p className={styles.hint}>{t('game.boardEmpty')}</p>
      ) : (
        <ol className={styles.ranks} aria-busy={entries === null}>
          {(entries ?? []).map((entry, i) => (
            <li
              // A ranking is positional: row n is rank n, and names repeat.
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className={entry.name === kept ? styles.me : undefined}
            >
              <span>{i + 1}</span>
              <span>{entry.name}</span>
              <span>{entry.score.toLocaleString(i18n.language)}</span>
            </li>
          ))}
        </ol>
      )}
      <form className={styles.nameForm} onSubmit={save}>
        <Input
          value={name}
          onChange={event => setNameField(event.target.value)}
          maxLength={16}
          aria-label={t('game.yourName')}
          placeholder={t('game.yourName')}
          aria-invalid={problem === 'name'}
          autoComplete='nickname'
        />
        <Button type='submit' disabled={name.trim() === (kept ?? '')}>
          {t('game.save')}
        </Button>
      </form>
      {problem && (
        <p className={styles.hint} role='alert'>
          {t(problem === 'name' ? 'game.nameRule' : 'game.boardDown')}
        </p>
      )}
      {!signedIn && (
        <button
          type='button'
          className={styles.signIn}
          onClick={() => void startSignIn('/play')}
        >
          {t('game.signIn')}
        </button>
      )}
    </div>
  );
}
