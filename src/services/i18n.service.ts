import { readFileSync } from 'fs';
import { join } from 'path';

type Translations = Record<string, string>;
type LocaleData = Record<string, unknown>;

const SUPPORTED_LANGS = ['de', 'en'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];
const DEFAULT_LANG: SupportedLang = 'de';

// Flatten nested JSON into dot-notation keys
function flatten(obj: LocaleData, prefix = ''): Translations {
  const result: Translations = {};
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flatten(value as LocaleData, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}

// Load and cache translations
const cache = new Map<SupportedLang, Translations>();

function loadLocale(lang: SupportedLang): Translations {
  const cached = cache.get(lang);
  if (cached) return cached;

  const filePath = join(process.cwd(), 'src', 'locales', `${lang}.json`);
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as LocaleData;
  const translations = flatten(raw);
  cache.set(lang, translations);
  return translations;
}

// Preload all locales
export function initI18n(): void {
  for (const lang of SUPPORTED_LANGS) {
    loadLocale(lang);
  }
}

// Get translation function for a given language
export function getT(lang: string): (key: string) => string {
  const safeLang = isSupported(lang) ? lang : DEFAULT_LANG;
  const translations = loadLocale(safeLang);
  return (key: string) => translations[key] || key;
}

// Get all translations for a language (for injecting into JS)
export function getTranslations(lang: string): Translations {
  const safeLang = isSupported(lang) ? lang : DEFAULT_LANG;
  return loadLocale(safeLang);
}

// Get only the "js" section for client-side use
export function getJsTranslations(lang: string): Record<string, string> {
  const all = getTranslations(lang);
  const result: Record<string, string> = {};
  for (const key in all) {
    if (key.startsWith('js.')) {
      result[key.substring(3)] = all[key];
    }
  }
  return result;
}

export function isSupported(lang: string): lang is SupportedLang {
  return SUPPORTED_LANGS.includes(lang as SupportedLang);
}

export function parseLangFromCookie(cookieHeader: string | undefined): SupportedLang {
  if (!cookieHeader) return DEFAULT_LANG;
  const match = cookieHeader.match(/(?:^|;\s*)lang=([^;]+)/);
  if (match && isSupported(match[1])) return match[1] as SupportedLang;
  return DEFAULT_LANG;
}

export const supportedLangs = SUPPORTED_LANGS;
export const defaultLang = DEFAULT_LANG;
