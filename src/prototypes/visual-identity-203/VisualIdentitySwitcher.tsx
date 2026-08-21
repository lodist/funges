// PROTOTYPE — #203 color palette & typography directions. Throwaway; see
// README.md in this directory. Mounted on /species by
// src/routes/species.tsx for the duration of this prototype only.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';
import './fonts';
import { VARIANT_CSS, VARIANTS } from './variants';

const STYLE_TAG_ID = 'pvi-203-variant-css';
const PARAM = 'variant';

function readVariantFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get(PARAM) ?? VARIANTS[0].key;
}

function writeVariantToUrl(key: string) {
  const url = new URL(window.location.href);
  if (key === VARIANTS[0].key) {
    url.searchParams.delete(PARAM);
  } else {
    url.searchParams.set(PARAM, key);
  }
  window.history.replaceState(null, '', url);
}

export function VisualIdentitySwitcher() {
  const [variantKey, setVariantKey] = useState(readVariantFromUrl);

  // Inject the variant stylesheet once.
  useEffect(() => {
    if (document.getElementById(STYLE_TAG_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_TAG_ID;
    style.textContent = VARIANT_CSS;
    document.head.appendChild(style);
  }, []);

  // Keep <html> class in sync with the current variant.
  useEffect(() => {
    const root = document.documentElement;
    for (const v of VARIANTS) {
      if (v.className) root.classList.remove(v.className);
    }
    const active = VARIANTS.find(v => v.key === variantKey);
    if (active?.className) root.classList.add(active.className);
    return () => {
      for (const v of VARIANTS) {
        if (v.className) root.classList.remove(v.className);
      }
    };
  }, [variantKey]);

  const goTo = useCallback((index: number) => {
    const wrapped = (index + VARIANTS.length) % VARIANTS.length;
    const next = VARIANTS[wrapped];
    setVariantKey(next.key);
    writeVariantToUrl(next.key);
  }, []);

  const currentIndex = VARIANTS.findIndex(v => v.key === variantKey);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') goTo(currentIndex - 1);
      if (e.key === 'ArrowRight') goTo(currentIndex + 1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentIndex, goTo]);

  // Hidden in production builds — this bar (and the CSS var overrides it
  // toggles) must never reach real users.
  if (import.meta.env.PROD) return null;

  const active = VARIANTS[currentIndex];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderRadius: 9999,
        background: '#18181b',
        color: '#fafafa',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        fontSize: 13,
      }}
    >
      <button
        type='button'
        aria-label='Previous variant'
        onClick={() => goTo(currentIndex - 1)}
        style={switcherButtonStyle}
      >
        <ChevronLeft size={16} />
      </button>
      <span style={{ minWidth: 190, textAlign: 'center' }}>
        <strong>{active.label}</strong> — {active.sublabel}
      </span>
      <button
        type='button'
        aria-label='Next variant'
        onClick={() => goTo(currentIndex + 1)}
        style={switcherButtonStyle}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

const switcherButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 9999,
  background: '#27272a',
  color: '#fafafa',
  border: 'none',
  cursor: 'pointer',
};
