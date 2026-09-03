import React, { useState } from 'react';
import { ChevronDown } from '@/lib/icons';
import { useTranslation } from 'react-i18next';
import { useMapStore } from '@/store/mapStore';
import { cn } from '@/lib/utils';
import { getSpeciesImage } from '@/lib/utils';
import { SPECIES_DATA } from '@/data/species';
import SpeciesSelectorFullscreen from './SpeciesSelectorFullscreen';
import { motion, AnimatePresence } from 'framer-motion';

interface SpeciesSelectorProps {
  className?: string;
}

const SpeciesSelector: React.FC<SpeciesSelectorProps> = ({
  className = '',
}) => {
  const { t } = useTranslation('map');
  const { t: tSpecies } = useTranslation('species');
  const { selectedSpecies, speciesOptions } = useMapStore();

  const [isOpen, setIsOpen] = useState(false);

  // One trigger, not two. The tile and the pill were separate branches of the
  // same control: the pill was the unreachable one (the store boots to a
  // species and never clears it back to null), so it shipped untested — a
  // `justify-between` with no `flex` to justify, and a 32px box under the 44px
  // floor. It was still reachable through a stale persisted code, which is the
  // one path that has to keep working, so the tile now degrades into that state
  // instead of a second component doing it badly.
  const selectedSpeciesData = selectedSpecies
    ? speciesOptions.find(opt => opt.code === selectedSpecies)
    : null;

  const speciesName = selectedSpeciesData
    ? tSpecies(`list_of_species.${selectedSpeciesData.code}.name`)
    : null;

  return (
    <div className={cn('relative', className)}>
      <motion.button
        type='button'
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup='dialog'
        aria-expanded={isOpen}
        // The name is announced once. It used to arrive three times — the img
        // alt, the heading and, through the binomial, a third partial read —
        // and none of them said what the button does.
        aria-label={
          speciesName ? `${t('species.select')}: ${speciesName}` : undefined
        }
        // Trailhead (#213): floating map control. The depth is the `raised`
        // role, not a hand-rolled `shadow-[0_2px_10px_rgba(0,0,0,0.18)]` — that
        // value tracked neither the scale nor the dark-theme inset highlight
        // that is the real depth cue there.
        //
        // The fill is opaque `--card`, and it is deliberately NOT the nav
        // glass. Measured: 90%-white glass over the darkest pixel the map can
        // put under it composites to rgb(230,230,230), where the 12px binomial
        // (Stone) reads **4.32:1** — under the 4.5:1 floor. This is what the
        // Glass Scope Rule means by "not text-heavy": two lines of type over an
        // unpredictable ground is the case glass cannot carry. Opaque, the same
        // two lines read **16.02:1** and **5.29:1** on Field Paper and
        // **10.20:1** and **7.84:1** on Night Surface, on every tile the map
        // can produce. The 5% translucency this drops was never visible; the
        // `backdrop-blur-sm` behind it was blurring almost nothing for a
        // compositing layer.
        //
        // Hover is `.elevation-interactive`, the sanctioned escalation to
        // raised-hover: the surface gets heavier, it does not move and it does
        // not swap its fill. Every fill tried for that hover so far has been
        // theme-blind on one side or the other.
        className={cn(
          'elevation-raised elevation-interactive bg-card focus-ring',
          'flex h-16 items-center gap-3 rounded-card py-2 pl-2 pr-3 text-left',
          // `truncate` needs a bound to truncate against. Without one the tile
          // grew with the name and walked toward the map controls at top-right.
          'max-w-[min(18rem,calc(100vw-5.5rem))]'
        )}
        whileTap={{ scale: 0.95 }}
        // Motion (#225): a spring is deliberate for press feedback — it is
        // the one place the scale does not apply. The `duration: 0.2` that
        // used to sit here was discarded by framer-motion (stiffness and
        // damping override it), so it only ever documented a lie.
        // The matching `whileHover` scale had no such licence and is gone;
        // Weight-Not-Movement owns hover.
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        {selectedSpeciesData && (
          <span
            aria-hidden='true'
            className='relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-lg'
          >
            {/* The emoji sits underneath as the fallback rather than beside the
                image as a branch. `getSpeciesImage` only builds a URL and never
                returns null for a missing file, so the old ternary on its
                return value could not reach the emoji — a missing .webp painted
                a broken-image glyph instead. `key` remounts the img per species
                so the hidden flag cannot survive a selection change. */}
            {selectedSpeciesData.emoji}
            <img
              key={selectedSpeciesData.code}
              src={getSpeciesImage(selectedSpeciesData.code) ?? undefined}
              alt=''
              className='absolute inset-0 h-full w-full object-cover object-center'
              loading='lazy'
              onError={e => {
                e.currentTarget.hidden = true;
              }}
            />
            {/* The 10% black wash that used to sit here darkened the one asset
                the whole recognition strategy rests on and carried no text to
                make legible. */}
          </span>
        )}

        <span className='min-w-0 flex-1'>
          {/* A span, not an h3. `h1,h2,h3` take Space Grotesk from a global base
              rule, so a 14px heading here put the display face on a label and
              opened a heading level inside a map control with no section under
              it. Label is Public Sans. */}
          <span className='block truncate text-sm font-semibold leading-tight text-foreground'>
            {speciesName ?? t('species.select')}
          </span>
          {selectedSpeciesData && (
            <span className='mt-1 block truncate text-xs italic leading-tight text-muted-foreground'>
              {SPECIES_DATA.find(
                species => species.id === selectedSpeciesData.code
              )?.scientificName || selectedSpeciesData.code}
            </span>
          )}
        </span>

        {/* The tile had no affordance at all — only the unreachable pill drew a
            chevron. 16px is the system's inline icon size; the pill's 12px was
            below it. */}
        <ChevronDown
          aria-hidden='true'
          className={cn(
            'h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-base',
            isOpen && 'rotate-180'
          )}
        />
      </motion.button>

      {/* Gated here rather than inside the child. AnimatePresence only plays an
          exit when the element it wraps unmounts, and the child's own
          `if (!isOpen) return null` kept it mounted forever — so the panel's
          exit animation had never once run. */}
      <AnimatePresence>
        {isOpen && (
          <SpeciesSelectorFullscreen
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SpeciesSelector;
