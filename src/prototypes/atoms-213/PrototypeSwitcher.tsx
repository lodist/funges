// PROTOTYPE — throwaway. Floating variant switcher for /atoms-213.

import { useNavigate } from '@tanstack/react-router';
import { VARIANTS, type Variant } from './recipes';
import { cn } from '@/lib/utils';

export default function PrototypeSwitcher({ current }: { current: Variant }) {
  const navigate = useNavigate({ from: '/atoms-213' });

  return (
    <div className='fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1 rounded-full border border-border bg-card/95 backdrop-blur px-1.5 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.18)]'>
      {VARIANTS.map(v => (
        <button
          key={v.id}
          type='button'
          onClick={() => navigate({ search: { variant: v.id } })}
          title={v.blurb}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
            current === v.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
