import { useEffect, useState } from 'react';
import { CALIBRATION_LINE, offsetFromMeasured, printSheetSize } from '../core/geometry/imposition';
import * as ops from '../core/ops';
import { useEditor, useProject, useT } from '../store/editor';
import { NumberField } from './NumberField';
import { printProject } from './Print';

type Measured = { x: number; y: number };

const NOMINAL: Measured = { x: CALIBRATION_LINE, y: CALIBRATION_LINE };

const fmt = (v: number) => (v > 0 ? `+${v}` : String(v));

function SideFields({ title, value, onChange }: { title: string; value: Measured; onChange: (v: Measured) => void }) {
  const t = useT();
  const off = offsetFromMeasured(value);
  return (
    <fieldset className="calib-side">
      <legend>{title}</legend>
      <div className="field-row">
        <NumberField label={t('calib.left')} value={value.x} min={0} max={100} step={0.5} digits={1} onChange={(x) => onChange({ ...value, x })} />
        <NumberField label={t('calib.top')} value={value.y} min={0} max={100} step={0.5} digits={1} onChange={(y) => onChange({ ...value, y })} />
      </div>
      <p className="hint" data-testid="calib-offset">
        {t('calib.offset', { x: fmt(off.x), y: fmt(off.y) })}
      </p>
    </fieldset>
  );
}

/** Калибровка принтера: печать тестового листа, ввод измерений, расчёт смещений. */
export function CalibrationDialog() {
  const t = useT();
  const open = useEditor((s) => s.calibrationOpen);
  const project = useProject();
  const [front, setFront] = useState(NOMINAL);
  const [back, setBack] = useState(NOMINAL);

  useEffect(() => {
    if (!open) return;
    setFront(NOMINAL);
    setBack(NOMINAL);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useEditor.getState().setCalibrationOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const close = () => useEditor.getState().setCalibrationOpen(false);
  const sheet = printSheetSize(project);
  const apply = () => {
    useEditor.getState().apply((p) => ops.setPrint(p, { offsetFront: offsetFromMeasured(front), offsetBack: offsetFromMeasured(back) }));
    close();
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal calibration" role="dialog" aria-modal="true" aria-label={t('calib.title')}>
        <header className="modal-header">
          <h2>{t('calib.title')}</h2>
          <div className="spacer" />
          <button className="btn" onClick={close}>
            {t('print.close')}
          </button>
        </header>
        <div className="calib-body">
          <ol className="calib-steps">
            <li>
              {t('calib.step1', { w: +sheet.width.toFixed(1), h: +sheet.height.toFixed(1) })}{' '}
              <button className="btn small" onClick={() => void printProject('calibration')}>
                {t('calib.printSheet')}
              </button>
            </li>
            <li>{t('calib.step2', { mm: CALIBRATION_LINE })}</li>
            <li>{t('calib.step3')}</li>
          </ol>
          <div className="calib-sides">
            <SideFields title={t('calib.front')} value={front} onChange={setFront} />
            <SideFields title={t('calib.back')} value={back} onChange={setBack} />
          </div>
          <div className="icon-row">
            <button className="btn primary" onClick={apply}>
              {t('calib.apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
