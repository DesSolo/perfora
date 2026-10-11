import DOMPurify from 'dompurify';

/** Разрешённые теги текстового блока: абзацы, переносы, начертания, плоские списки. */
export const ALLOWED_TAGS = ['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li'];

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [] });
}

export function isBlankHtml(html: string): boolean {
  return sanitizeHtml(html).replace(/<[^>]*>|&nbsp;|\s/g, '') === '';
}
