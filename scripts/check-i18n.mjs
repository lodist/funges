#!/usr/bin/env node

/**
 * Validate translation completeness across locales.
 *
 * `src/i18n/locales/<lang>/` holds one JSON namespace file per feature
 * area (common.json, species.json, ...). `en` is the source of truth
 * (see fallbackLng in src/i18n/index.ts) — every other locale must ship
 * the same namespace files with the same set of keys, recursively.
 *
 * Exits non-zero and prints every mismatch if a locale is missing a
 * namespace file, or a namespace file is missing/has extra keys
 * relative to `en`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const sourceLocale = 'en';

function collectKeyPaths(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return collectKeyPaths(value, keyPath);
    }
    return [keyPath];
  });
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const locales = fs
  .readdirSync(localesDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

if (!locales.includes(sourceLocale)) {
  console.error(
    `✗ Source locale "${sourceLocale}" not found under ${localesDir}`
  );
  process.exit(1);
}

const namespaces = fs
  .readdirSync(path.join(localesDir, sourceLocale))
  .filter(file => file.endsWith('.json'))
  .sort();

let hasErrors = false;

for (const locale of locales) {
  if (locale === sourceLocale) continue;

  for (const namespace of namespaces) {
    const targetPath = path.join(localesDir, locale, namespace);

    if (!fs.existsSync(targetPath)) {
      console.error(`✗ [${locale}] missing namespace file: ${namespace}`);
      hasErrors = true;
      continue;
    }

    const sourceKeys = new Set(
      collectKeyPaths(loadJson(path.join(localesDir, sourceLocale, namespace)))
    );
    const targetKeys = new Set(collectKeyPaths(loadJson(targetPath)));

    const missing = [...sourceKeys].filter(key => !targetKeys.has(key));
    const extra = [...targetKeys].filter(key => !sourceKeys.has(key));

    if (missing.length > 0) {
      console.error(
        `✗ [${locale}] ${namespace} missing keys: ${missing.join(', ')}`
      );
      hasErrors = true;
    }
    if (extra.length > 0) {
      console.error(
        `✗ [${locale}] ${namespace} has extra keys not in "${sourceLocale}": ${extra.join(', ')}`
      );
      hasErrors = true;
    }
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log(
  `✓ All translation keys are synchronized across ${locales.length} locales (${namespaces.length} namespaces each)`
);
