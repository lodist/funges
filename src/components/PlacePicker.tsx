import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchTowns, type Place, type Town } from '@/lib/huerta-api';
import { Navigation } from '@/lib/icons';

/** Where the garden is: the device's position, or a town searched by name. */
export function PlacePicker({ onPick }: { onPick: (place: Place) => void }) {
  const { t } = useTranslation('huerta');
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [towns, setTowns] = useState<Town[]>([]);
  // The query the shown results answer: "no town" only once its search is done.
  const [answered, setAnswered] = useState('');
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    let current = true;
    searchTowns(query).then(
      found => {
        if (!current) return;
        setTowns(found);
        setAnswered(query);
        setSearchFailed(false);
      },
      () => {
        if (!current) return;
        setTowns([]);
        setAnswered(query);
        setSearchFailed(true);
      }
    );
    return () => {
      current = false;
    };
  }, [query]);

  const locate = () => {
    setLocating(true);
    setFailed(false);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        onPick({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => {
        setLocating(false);
        setFailed(true);
      },
      { maximumAge: 3_600_000, timeout: 15_000 }
    );
  };

  return (
    <section className='flex max-w-xl flex-col gap-5 rounded-card bg-card p-6 elevation-raised sm:p-8'>
      <div>
        <h2 className='text-xl font-semibold'>{t('picker.title')}</h2>
        <p className='mt-1 text-sm text-muted-foreground'>{t('picker.help')}</p>
      </div>
      <div className='flex flex-col items-start gap-1'>
        <Button onClick={locate} disabled={locating}>
          <Navigation />
          {locating ? t('picker.locating') : t('picker.locate')}
        </Button>
        {failed ? (
          <p className='text-sm text-destructive-text'>
            {t('picker.locateFailed')}
          </p>
        ) : null}
      </div>
      <div className='flex flex-col gap-2'>
        <label htmlFor='huerta-town' className='text-sm font-medium'>
          {t('picker.search')}
        </label>
        <Input
          id='huerta-town'
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('picker.placeholder')}
          autoComplete='off'
        />
        {towns.length > 0 ? (
          <ul className='flex flex-col gap-1'>
            {towns.map(town => (
              <li key={`${town.name}_${town.lat}_${town.lon}`}>
                <Button
                  variant='ghost'
                  className='w-full justify-between'
                  onClick={() => onPick(town)}
                >
                  <span>{town.name}</span>
                  <span className='text-xs text-muted-foreground'>
                    {[town.province, town.country].filter(Boolean).join(', ')}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        ) : answered === query && searchFailed ? (
          <p className='text-sm text-destructive-text'>
            {t('picker.searchFailed')}
          </p>
        ) : answered === query && query.trim().length >= 3 ? (
          <p className='text-sm text-muted-foreground'>
            {t('picker.noResults')}
          </p>
        ) : null}
      </div>
    </section>
  );
}
