import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import enPrivacy from '@/i18n/locales/en/privacy.json';

/**
 * PrivacyPolicyPage renders every section by explicit key, so adding
 * translations does not make them appear. The photos section was added in all six
 * languages and rendered nowhere for several commits: the policy claimed nothing
 * about photos while the app had a camera feature.
 *
 * A static source check rather than a render test, deliberately. The failure was
 * not "the component renders wrongly" but "the component never mentions the key",
 * and that is exactly what this looks for. It also cannot be fooled by a section
 * that renders but is conditionally hidden.
 */

const SOURCE = readFileSync('src/pages/PrivacyPolicyPage.tsx', 'utf8');

describe('privacy policy renders the photos section', () => {
  const keys = Object.keys(enPrivacy.photos);

  it('defines the keys a camera feature needs', () => {
    // Not just any keys: a policy that omits the camera or the model download
    // would be incomplete in the two ways users actually ask about.
    expect(keys).toContain('content');
    expect(keys).toContain('camera');
    expect(keys).toContain('model');
  });

  it.each(keys)('references photos.%s in the page source', key => {
    expect(SOURCE).toContain(`photos.${key}`);
  });

  // The strongest claim the feature makes. If this sentence ever softens, the
  // privacy position has changed and that should be a deliberate edit.
  it('still states that photos are never uploaded or retained', () => {
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
});
