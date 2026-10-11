import { useRef } from 'react';
import { THEMES, useEditor, useProject, useT, type Theme } from '../store/editor';
import { fitCurrent } from './Canvas';
import { printProject } from './Print';
import type { ViewPrefs } from '../store/editor';
import type { IconName } from './icons';
import type { MessageKey } from '../i18n';
import { Icon } from './icons';
import { SaveStatus } from './Projects';

export function Topbar() {
  const t = useT();
  const project = useProject();
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const zoom = useEditor((s) => s.zoom);
  const lang = useEditor((s) => s.lang);
  const theme = useEditor((s) => s.theme);
  const s = useEditor.getState();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <header className="topbar">
      <button className="icon-btn" title={t('projects.open')} aria-label={t('projects.title')} onClick={() => s.setProjectsOpen(true)}>
        <Icon name="folder" />
      </button>
      <span className="brand">{t('app.title')}</span>
      <input
        className="project-name"
        aria-label={t('project.name')}
        placeholder={t('project.untitled')}
        value={project.name}
        onChange={(e) => {
          const name = e.target.value;
          s.apply((p) => ({ ...p, name }), 'name');
        }}
      />
      <SaveStatus />
      <div className="icon-row">
        <button className="icon-btn" title={`${t('action.undo')} (Ctrl+Z)`} disabled={!canUndo} onClick={() => s.undo()}>
          <Icon name="undo" />
        </button>
        <button className="icon-btn" title={`${t('action.redo')} (Ctrl+Shift+Z)`} disabled={!canRedo} onClick={() => s.redo()}>
          <Icon name="redo" />
        </button>
      </div>
      <div className="icon-row">
        <button className="btn" onClick={() => s.addText()}>
          <Icon name="text" /> {t('action.addText')}
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="image" /> {t('action.addImage')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="image-input"
          onChange={(e) => {
            void s.addImages([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      <div className="spacer" />
      <ViewToggles />
      <div className="icon-row zoom">
        <button className="icon-btn" title={t('action.zoomOut')} onClick={() => s.setZoom(zoom / 1.25)}>
          <Icon name="zoomOut" />
        </button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        <button className="icon-btn" title={t('action.zoomIn')} onClick={() => s.setZoom(zoom * 1.25)}>
          <Icon name="zoomIn" />
        </button>
        <button
          className="icon-btn"
          title={t('action.zoomFit')}
          onClick={() => {
            const el = document.querySelector<HTMLElement>('.canvas');
            if (el) s.setZoom(fitCurrent(el));
          }}
        >
          <Icon name="fit" />
        </button>
      </div>
      <div className="icon-row">
        <button className="icon-btn" title={t('print.preview')} onClick={() => s.setPreviewOpen(true)}>
          <Icon name="eye" />
        </button>
        <button className="btn primary" title={`${t('print.print')} (Ctrl+P)`} onClick={() => void printProject()}>
          <Icon name="print" /> {t('print.print')}
        </button>
      </div>
      <button
        className="icon-btn"
        title={t(`theme.${theme}`)}
        aria-label={t(`theme.${theme}`)}
        onClick={() => s.setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])}
      >
        <Icon name={THEME_ICONS[theme]} />
      </button>
      <button className="btn lang" title={t('action.language')} onClick={() => s.setLang(lang === 'ru' ? 'en' : 'ru')}>
        {lang === 'ru' ? 'EN' : 'RU'}
      </button>
    </header>
  );
}

const THEME_ICONS: Record<Theme, IconName> = { system: 'themeAuto', light: 'sun', dark: 'moon' };

const TOGGLES: { key: Exclude<keyof ViewPrefs, 'spread'>; icon: IconName; label: MessageKey }[] = [
  { key: 'margins', icon: 'margins', label: 'view.margins' },
  { key: 'holes', icon: 'holes', label: 'view.holes' },
  { key: 'keepOut', icon: 'keepOut', label: 'view.keepOut' },
  { key: 'grid', icon: 'grid', label: 'view.grid' },
  { key: 'snap', icon: 'magnet', label: 'view.snap' },
];

function ViewToggles() {
  const t = useT();
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  return (
    <div className="icon-row" role="group">
      <button
        className={`icon-btn${view.spread ? ' active' : ''}`}
        title={t(view.spread ? 'view.single' : 'view.spread')}
        aria-label={t('view.spread')}
        aria-pressed={view.spread}
        onClick={() => setView({ spread: !view.spread })}
      >
        <Icon name="spread" />
      </button>
      <span className="divider" />
      {TOGGLES.map(({ key, icon, label }) => (
        <button
          key={key}
          className={`icon-btn${view[key] ? ' active' : ''}`}
          title={t(label)}
          aria-label={t(label)}
          aria-pressed={view[key]}
          onClick={() => setView({ [key]: !view[key] })}
        >
          <Icon name={icon} />
        </button>
      ))}
    </div>
  );
}
