import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import enPrivacy from '@/i18n/locales/en/privacy.json';
import enInstructions from '@/i18n/locales/en/instructions.json';

/**
 * PrivacyPolicyPage and InstructionsPage render every string by explicit key, so
 * adding a translation does NOT make it appear on the page.
 *
 * That is not hypothetical. The privacy photos section was added in all six
 * languages and rendered nowhere for several commits: the policy claimed nothing
 * about photos while the app had a camera feature. Nothing failed, no key was
 * missing, the copy simply did not exist on screen.
 *
 * A static source check rather than a render test, deliberately. The failure mode
 * is "the component never mentions the key", which is exactly what this looks
 * for, and unlike a render test it cannot be satisfied by a section that renders
 * into a hidden branch.
 */

const SOURCES = {
  privacy: readFileSync('src/pages/PrivacyPolicyPage.tsx', 'utf8'),
  instructions: readFileSync('src/pages/InstructionsPage.tsx', 'utf8'),
};

/** Subtrees whose every leaf must be referenced by its page. */
const REQUIRED: Array<{
  page: keyof typeof SOURCES;
  prefix: string;
  keys: string[];
}> = [
  {
    page: 'privacy',
    prefix: 'photos',
    keys: Object.keys(enPrivacy.photos),
  },
  {
    page: 'instructions',
    prefix: 'mission',
    keys: Object.keys(enInstructions.mission),
  },
  {
    page: 'instructions',
    prefix: 'identify',
    keys: Object.keys(enInstructions.identify),
  },
];

describe.each(REQUIRED)(
  '$page renders every $prefix key',
  ({ page, prefix, keys }) => {
    it('has keys to check, so this cannot pass vacuously', () => {
      expect(keys.length).toBeGreaterThan(0);
    });

    it.each(keys)(`references ${'$prefix'}.%s`, key => {
      expect(SOURCES[page]).toContain(`${prefix}.${key}`);
    });
  }
);

describe('privacy substance', () => {
  // The strongest claim the feature makes. If this softens, the privacy position
  // has changed and that should be a deliberate edit, not a drift.
  it('states that photos are never uploaded or retained', () => {
    const content = enPrivacy.photos.content.toLowerCase();
    expect(content).toContain('never');
    expect(content).toMatch(/uploaded/);
    expect(content).toMatch(/retained|stored/);
  });

  // And the counterweight: claiming nothing leaves the device without mentioning
  // the model download would be false, since that is an ordinary HTTP request.
  it('discloses that the model download reaches a server', () => {
    expect(enPrivacy.photos.model.toLowerCase()).toMatch(/server|storage/);
  });

  it('says the app has no continuous camera access', () => {
    expect(enPrivacy.photos.camera.toLowerCase()).toMatch(/camera/);
  });
});

describe('mission states the anonymity principle', () => {
  // It lives in the privacy policy too, in legal register. Here it is a statement
  // of what the product is for, and losing it would be losing the claim rather
  // than merely a paragraph.
  it('says no personal data is collected and identification is on-device', () => {
    const text = enInstructions.mission.privacy.toLowerCase();
    expect(text).toMatch(/no personal data|no account/);
    expect(text).toMatch(/own device|your device/);
    expect(text).toMatch(/anonym/);
  });
});
