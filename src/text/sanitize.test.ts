// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isBlankHtml, sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
  it('оставляет разрешённую разметку', () => {
    const html = '<p><b>Мука</b> <i>200 г</i></p><ul><li>яйца</li></ul><ol><li>шаг</li></ol>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('вырезает скрипты, обработчики и атрибуты', () => {
    expect(sanitizeHtml('<p onclick="x()" style="color:red">a<script>alert(1)</script></p>')).toBe('<p>a</p>');
    expect(sanitizeHtml('<img src=x onerror=alert(1)>b')).toBe('b');
  });

  it('разворачивает неразрешённые теги, сохраняя текст', () => {
    expect(sanitizeHtml('<span style="font-size:40px">x</span><a href="http://e">y</a>')).toBe('xy');
  });

  it('распознаёт пустой текст', () => {
    expect(isBlankHtml('<p><br></p>&nbsp; ')).toBe(true);
    expect(isBlankHtml('<p>a</p>')).toBe(false);
  });
});
