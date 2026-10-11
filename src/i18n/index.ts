import { en } from './en';
import { ru, type MessageKey } from './ru';

export type Lang = 'ru' | 'en';
export type { MessageKey };

const dicts: Record<Lang, Record<MessageKey, string>> = { ru, en };

export function translate(lang: Lang, key: MessageKey, params?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('ris.lang');
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // localStorage недоступен (приватный режим) — берём язык браузера.
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem('ris.lang', lang);
  } catch {
    // не критично
  }
}
