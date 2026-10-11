import { useEffect } from 'react';
import { useEditor } from '../store/editor';
import { printProject } from './Print';
import { flushSave } from '../persist/session';
import { translate } from '../i18n';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/**
 * Горячие клавиши редактора. Сочетания определяются по e.code, чтобы работать
 * в любой раскладке (Ctrl+Я на русской — это тот же KeyZ).
 */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // Печать через свой путь: дождаться шрифтов и картинок до открытия диалога.
      if (mod && e.code === 'KeyP') {
        e.preventDefault();
        void printProject();
        return;
      }
      // Ctrl+S: сохранение и так автоматическое, просто дописываем сразу.
      if (mod && e.code === 'KeyS') {
        e.preventDefault();
        void flushSave().then(() => {
          const st = useEditor.getState();
          if (st.saveStatus !== 'error') st.setNotice(translate(st.lang, 'save.saved'));
        });
        return;
      }
      if (mod && e.code === 'KeyO') {
        e.preventDefault();
        useEditor.getState().setProjectsOpen(true);
        return;
      }
      if (isTyping(e.target)) return;
      const s = useEditor.getState();

      if (mod && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.code === 'KeyY') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.code === 'KeyD') {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }
      if (mod) return;

      const step = e.shiftKey ? 10 : 1;
      switch (e.code) {
        case 'Delete':
        case 'Backspace':
          if (s.selectedBlockId) {
            e.preventDefault();
            s.deleteSelected();
          }
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!s.selectedBlockId) return;
          e.preventDefault();
          const dx = e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0;
          const dy = e.code === 'ArrowUp' ? -step : e.code === 'ArrowDown' ? step : 0;
          s.nudgeSelected(dx, dy);
          break;
        }
        case 'Enter': {
          const id = s.selectedBlockId;
          const page = s.history.present.pages.find((p) => p.id === s.currentPageId);
          const b = page?.blocks.find((x) => x.id === id);
          if (b?.type === 'text' && !b.locked) {
            e.preventDefault();
            s.setEditing(b.id);
          }
          break;
        }
        case 'Escape':
          s.selectBlock(null);
          break;
      }
    };

    // Вставка картинок из буфера обмена.
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void useEditor.getState().addImages(files);
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, []);
}
