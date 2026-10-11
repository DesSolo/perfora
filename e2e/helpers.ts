import type { Page } from '@playwright/test';
import type { Project } from '../src/core/model';

/** Небольшой PNG 40×20 для загрузки в тестах. */
export async function makePng(page: Page, w = 400, h = 200): Promise<Buffer> {
  const b64 = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#e94';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#247';
      ctx.fillRect(w / 4, h / 4, w / 2, h / 2);
      return c.toDataURL('image/png').split(',')[1];
    },
    [w, h],
  );
  return Buffer.from(b64, 'base64');
}

type EditorWindow = { editor: { getState(): { history: { present: Project; past: unknown[] }; currentPageId: string; selectedBlockId: string | null } } };

export function project(page: Page): Promise<Project> {
  return page.evaluate(() => (window as unknown as EditorWindow).editor.getState().history.present);
}

export function selectedId(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as EditorWindow).editor.getState().selectedBlockId);
}
