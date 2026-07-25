import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import i18n from '@/i18n';
import { IdentifyResults } from '@/components/IdentifyResults';
import {
  registerTier2Vocabulary,
  resolvePredictions,
  resetTier2Vocabulary,
} from '@/lib/photo-id';

/**
 * These tests exist for one reason: to go red if a toxic species stops being
 * flagged. Every assertion here guards a failure that throws nothing and looks
 * like a styling change.
 *
 * Real i18n is loaded (following FeatureInfoModal.test.tsx) so a missing or
 * renamed translation key shows up as a raw dotted string in the output rather
 * than passing silently.
 */

const p = (scientificName: string, score = 0.8) => ({ scientificName, score });

/**
 * The candidate rows only — DIRECT children of the candidate list.
 *
 * Each toxic row nests its own "check these features" list, and both nestings
 * are valid semantics. But `within(list).getAllByRole('listitem')` matches
 * descendants too, so it would count the check-feature bullets as candidates.
 * Hence an explicit direct-child query.
 */
const candidateRows = (): HTMLElement[] => {
  const list = screen.getByRole('list', { name: /possible matches/i });
  return Array.from(list.querySelectorAll(':scope > li')) as HTMLElement[];
};

beforeEach(async () => {
  resetTier2Vocabulary();
  await i18n.changeLanguage('en');
});

describe('toxic warning banner', () => {
  // The spike measured an edible ALSO appearing in the top 3 for ~28% of toxic
  // photos. So a user who reads row 1 and stops must still see the warning —
  // which means the banner cannot be derived from candidates[0].
  it.each([0, 1, 2])(
    'renders when the toxic candidate is at rank %i',
    index => {
      const names = ['Cantharellus cibarius', 'Boletus', 'Rubus idaeus'];
      names[index] = 'Amanita phalloides';

      render(
        <IdentifyResults
          candidates={resolvePredictions(names.map(n => p(n)))}
        />
      );

      const alerts = screen.getAllByRole('alert');
      expect(alerts.some(a => /toxic/i.test(a.textContent ?? ''))).toBe(true);
    }
  );

  it('does not render for an all-edible result', () => {
    render(
      <IdentifyResults
        candidates={resolvePredictions([
          p('Cantharellus cibarius'),
          p('Boletus'),
        ])}
      />
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('toxic rows', () => {
  // THE landmine. FeatureInfoModal.tsx filters rows with
  // `.filter(entry => entry.image)`, and it is the natural template for this
  // component. Toxic species have no image asset, so copying that line would
  // silently drop every toxic row from the list.
  it('renders a toxic candidate that has no image asset', () => {
    render(
      <IdentifyResults
        candidates={resolvePredictions([p('Amanita phalloides')])}
      />
    );

    const rows = candidateRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Amanita phalloides');
  });

  // Colour alone fails for colourblind users and in bright outdoor sunlight,
  // which is exactly where this feature gets used. An icon-only redesign of the
  // badge would fail this.
  it('states the danger in text, not only colour', () => {
    render(
      <IdentifyResults
        candidates={resolvePredictions([p('Amanita phalloides')])}
      />
    );

    const [row] = candidateRows();
    expect(within(row).getByText(/do not eat/i)).toBeInTheDocument();
  });

  it('distinguishes lethal from merely inedible', () => {
    render(
      <IdentifyResults
        candidates={resolvePredictions([
          p('Amanita phalloides'), // lethal
          p('Tylopilus felleus'), // inedible, just bitter
        ])}
      />
    );

    const rows = candidateRows();
    // Calling a bitter bolete "deadly" is its own harm: alarm fatigue erodes
    // trust in the warnings that matter.
    expect(rows[0].textContent).toMatch(/deadly/i);
    expect(rows[1].textContent).not.toMatch(/deadly/i);
  });

  it('explains why the species is dangerous', () => {
    render(
      <IdentifyResults
        candidates={resolvePredictions([p('Amanita phalloides')])}
      />
    );

    // Resolved copy, not a raw i18n key — a missing key would render
    // "toxicity.mechanisms.amatoxin" to the user.
    expect(screen.getByText(/amatoxin/i)).toBeInTheDocument();
    expect(screen.queryByText(/toxicity\.mechanisms\./)).toBeNull();
  });
});

describe('critical confusion escalation', () => {
  it('shows a distinct warning when Lepiota and the parasol co-occur', () => {
    render(
      <IdentifyResults
        candidates={resolvePredictions([
          p('Lepiota brunneoincarnata'),
          p('Macrolepiota procera'),
        ])}
      />
    );

    // Two alerts: the generic toxic banner plus the pair-specific escalation.
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(alerts.some(a => /easily confused/i.test(a.textContent ?? ''))).toBe(
      true
    );
  });

  it('does not escalate for an unrelated toxic and edible pair', () => {
    render(
      <IdentifyResults
        candidates={resolvePredictions([
          p('Amanita muscaria'),
          p('Cantharellus cibarius'),
        ])}
      />
    );

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some(a => /easily confused/i.test(a.textContent ?? ''))).toBe(
      false
    );
  });
});

describe('tier 2 and unknown rows', () => {
  // A list silently shrinking from 3 to 2 with no visible cause is its own
  // defect, and it also hides that the model produced something unrecognised.
  it('renders every candidate, including unrecognised ones', () => {
    registerTier2Vocabulary(['Russula emetica']);

    render(
      <IdentifyResults
        candidates={resolvePredictions([
          p('Cantharellus cibarius'),
          p('Russula emetica'),
          p('Something Unrecognised'),
        ])}
      />
    );

    expect(candidateRows()).toHaveLength(3);
  });

  it('marks a tier-2 species as carrying no safety information', () => {
    registerTier2Vocabulary(['Russula emetica']);

    render(
      <IdentifyResults
        candidates={resolvePredictions([p('Russula emetica')])}
      />
    );

    const [row] = candidateRows();
    expect(row.textContent).toContain('Russula emetica');
    // It must not read as an edible result just because it is not flagged toxic.
    expect(within(row).getByText(/no safety information/i)).toBeInTheDocument();
  });
});

describe('framing', () => {
  // The feature narrows candidates; it never confirms edibility. If this copy
  // drifts toward "identified as", the whole safety position changes.
  it('says these are possible matches, not a confirmed identification', () => {
    render(
      <IdentifyResults
        candidates={resolvePredictions([p('Cantharellus cibarius')])}
      />
    );

    expect(
      screen.getByText(/not a confirmed identification/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/do not eat anything based on this app/i)
    ).toBeInTheDocument();
  });

  it('shows both catalog names when a scientific name maps to two', () => {
    render(
      <IdentifyResults candidates={resolvePredictions([p('Sambucus nigra')])} />
    );

    // Sambucus nigra is elderberry AND elderflower; showing one silently would
    // be an arbitrary choice presented as a result.
    const [row] = candidateRows();
    expect(row.textContent).toMatch(/elder/i);
    expect(row.textContent).toContain('/');
  });
});
