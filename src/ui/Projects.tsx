import { useEffect, useRef, useState } from 'react';
import type { ProjectSummary } from '../persist/db';
import { createNew, exportCurrent, importProjectFile, listSaved, openSaved, removeSaved } from '../persist/session';
import { useEditor, useT } from '../store/editor';
import { Icon } from './icons';

export function SaveStatus() {
  const t = useT();
  const status = useEditor((s) => s.saveStatus);
  if (status === 'idle') return null;
  return (
    <span className={`save-status ${status}`} role="status" title={t('save.auto')} data-testid="save-status" data-status={status}>
      {t(status === 'saving' ? 'save.saving' : status === 'saved' ? 'save.saved' : 'save.error')}
    </span>
  );
}

function formatDate(ms: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
}

export function ProjectsDialog() {
  const t = useT();
  const open = useEditor((s) => s.projectsOpen);
  const lang = useEditor((s) => s.lang);
  const currentId = useEditor((s) => s.projectId);
  const saveStatus = useEditor((s) => s.saveStatus);
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => useEditor.getState().setProjectsOpen(false);

  // Список перечитывается при открытии и после каждой записи, чтобы текущий проект был наверху.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    listSaved()
      .then((l) => alive && setList(l))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [open, saveStatus]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal projects" role="dialog" aria-modal="true" aria-label={t('projects.title')}>
        <header className="modal-header">
          <h2>{t('projects.title')}</h2>
          <div className="spacer" />
          <button className="btn" onClick={() => void createNew().then(close)}>
            <Icon name="plus" /> {t('projects.new')}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> {t('projects.import')}
          </button>
          <button className="btn" onClick={() => void exportCurrent()}>
            <Icon name="download" /> {t('projects.export')}
          </button>
          <button className="btn" onClick={close}>
            {t('print.close')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            data-testid="project-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importProjectFile(file).then((ok) => ok && close());
            }}
          />
        </header>
        <p className="hint">{t('projects.storageHint')}</p>
        <h3 className="projects-heading">{t('projects.recent')}</h3>
        {list && list.length === 0 && <p className="hint projects-empty">{t('projects.empty')}</p>}
        <ul className="project-list">
          {list?.map((p) => {
            const current = p.id === currentId;
            const name = p.name || t('project.untitled');
            return (
              <li key={p.id} className={`project-item${current ? ' current' : ''}`} data-testid="project-item">
                <button
                  className="project-open"
                  onClick={() => {
                    if (current) close();
                    else void openSaved(p.id).then((ok) => ok && close());
                  }}
                >
                  <span className="project-title">
                    {name}
                    {current && <span className="badge">{t('projects.current')}</span>}
                  </span>
                  <span className="project-meta">
                    {formatDate(p.updatedAt, lang)} · {t('projects.pages', { n: p.pageCount })} · {t('projects.size', { w: p.width, h: p.height })}
                  </span>
                </button>
                {!current && (
                  <button
                    className="icon-btn danger"
                    title={t('projects.delete')}
                    aria-label={t('projects.delete')}
                    onClick={() => {
                      if (!window.confirm(t('projects.confirmDelete', { name }))) return;
                      void removeSaved(p.id).then(() => setList((l) => l?.filter((x) => x.id !== p.id) ?? null));
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
