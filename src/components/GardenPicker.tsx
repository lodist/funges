import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MAX_GARDENS,
  addGarden,
  chooseGarden,
  removeGarden,
  updateGarden,
  useGardens,
  type StoredGarden,
} from '@/lib/gardens';
import { Check, ChevronDown, Plus, Trash2 } from '@/lib/icons';
import { cn } from '@/lib/utils';

const NAME_LENGTH = 60;

/** The account's gardens (up to three): which one the page is about, a new
 *  one, its name, and deleting it. */
export function GardenPicker() {
  const { t } = useTranslation('huerta');
  const { gardens, current } = useGardens();
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  const label = (garden: StoredGarden) => garden.name || t('gardens.default');

  const rename = (event: FormEvent) => {
    event.preventDefault();
    updateGarden({ name: name.trim().slice(0, NAME_LENGTH) });
    setDialog(null);
  };
  const remove = async () => {
    if (!current) return;
    try {
      await removeGarden(current.id);
      setDialog(null);
    } catch {
      setFailed(true);
    }
  };

  return (
    <>
      {/* Not modal: a dialog opened from the menu keeps the page usable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' aria-label={t('gardens.label')}>
            {current ? label(current) : t('gardens.default')}
            <ChevronDown className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start'>
          <DropdownMenuLabel>{t('gardens.label')}</DropdownMenuLabel>
          {gardens.map(garden => (
            <DropdownMenuItem
              key={garden.id}
              onSelect={() => chooseGarden(garden.id)}
            >
              <Check
                className={cn(
                  'size-4',
                  garden.id === current?.id ? 'opacity-100' : 'opacity-0'
                )}
              />
              {label(garden)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {gardens.length < MAX_GARDENS ? (
            <DropdownMenuItem onSelect={() => addGarden('')}>
              <Plus className='size-4' />
              {t('gardens.new')}
            </DropdownMenuItem>
          ) : null}
          {current ? (
            <DropdownMenuItem
              onSelect={() => {
                setName(current.name);
                setDialog('rename');
              }}
            >
              {t('gardens.rename')}
            </DropdownMenuItem>
          ) : null}
          {current ? (
            <DropdownMenuItem
              onSelect={() => {
                setFailed(false);
                setDialog('delete');
              }}
            >
              <Trash2 className='size-4' />
              {t('gardens.delete')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialog !== null}
        onOpenChange={open => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          {dialog === 'rename' ? (
            <form onSubmit={rename} className='flex flex-col gap-4'>
              <DialogHeader>
                <DialogTitle>{t('gardens.rename')}</DialogTitle>
              </DialogHeader>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='garden-name'>{t('gardens.name')}</Label>
                <Input
                  id='garden-name'
                  value={name}
                  maxLength={NAME_LENGTH}
                  placeholder={t('gardens.default')}
                  onChange={event => setName(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setDialog(null)}
                >
                  {t('gardens.cancel')}
                </Button>
                <Button type='submit'>{t('gardens.save')}</Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t('gardens.delete')}</DialogTitle>
                <DialogDescription>{t('gardens.deleteText')}</DialogDescription>
              </DialogHeader>
              {failed ? (
                <p role='alert' className='text-sm text-destructive-text'>
                  {t('gardens.offline')}
                </p>
              ) : null}
              <DialogFooter>
                <Button variant='outline' onClick={() => setDialog(null)}>
                  {t('gardens.cancel')}
                </Button>
                <Button variant='destructive' onClick={() => void remove()}>
                  <Trash2 className='size-4' />
                  {t('gardens.delete')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
