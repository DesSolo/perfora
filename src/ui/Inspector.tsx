import { useEffect, useId, useState, type ReactNode } from 'react';
import { FONTS } from '../core/defaults';
import type { Block, ImageFit, TextAlign, TextBlock, TextStyle } from '../core/model';
import * as ops from '../core/ops';
import { matchPageSize, PAGE_SIZES } from '../core/presets';
import { IMAGE_DPI_OPTIONS } from '../assets/importImage';
import { applyPreset, BUILTIN_PRESETS, matchPreset, presetName } from '../core/bindingPresets';
import { hitsKeepOut, holeCenters, requiredFlip } from '../core/geometry/binding';
import type { Binding, ImpositionSheet, PrintSettings } from '../core/model';
import { printProject, PrintJobControls } from './Print';
import { cropMarks, hasBackSides, maxGrid, printSheetSize, sheetLayout, sheetSize } from '../core/geometry/imposition';
import { useEditor, useProject, useT } from '../store/editor';
import { Icon, type IconName } from './icons';
import { NumberField } from './NumberField';
import { formatGaps, parseGaps } from '../core/gapsText';

function Section({ title, children, collapsible }: { title: string; children: ReactNode; collapsible?: boolean }) {
  if (collapsible) {
    return (
      <details className="inspector-section" open>
        <summary>
          <h3>{title}</h3>
        </summary>
        <div className="section-body">{children}</div>
      </details>
    );
  }
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Кнопка, не забирающая фокус: выделение в редактируемом тексте сохраняется. */
function ToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  icon?: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      className={`icon-btn${active ? ' active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} /> : children}
    </button>
  );
}

function PageSection() {
  const t = useT();
  const project = useProject();
  const apply = useEditor((s) => s.apply);
  const { width, height } = project.page;
  const preset = matchPageSize(width, height);
  const landscape = width > height;
  const setSize = (w: number, h: number) => apply((p) => ops.setPageSize(p, w, h), 'page-size');

  return (
    <Section title={t('inspector.page')} collapsible>
      <label className="field">
        <span>{t('inspector.size')}</span>
        <select
          value={preset?.id ?? 'custom'}
          onChange={(e) => {
            const p = PAGE_SIZES.find((x) => x.id === e.target.value);
            if (p) setSize(landscape ? p.height : p.width, landscape ? p.width : p.height);
          }}
        >
          {PAGE_SIZES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === 'HalfLetter' ? 'Half Letter' : p.id} ({p.width}×{p.height})
            </option>
          ))}
          <option value="custom" disabled={!!preset}>
            {t('inspector.custom')}
          </option>
        </select>
      </label>
      <div className="field-row">
        <NumberField label={t('inspector.width')} value={width} min={10} max={2000} onChange={(v) => setSize(v, height)} />
        <NumberField label={t('inspector.height')} value={height} min={10} max={2000} onChange={(v) => setSize(width, v)} />
      </div>
      <div className="field">
        <span>{t('inspector.orientation')}</span>
        <div className="icon-row">
          <ToolButton
            icon="portrait"
            label={t('inspector.portrait')}
            active={!landscape}
            onClick={() => landscape && setSize(height, width)}
          />
          <ToolButton
            icon="landscape"
            label={t('inspector.landscape')}
            active={landscape}
            onClick={() => !landscape && setSize(height, width)}
          />
        </div>
      </div>
    </Section>
  );
}

function ImportSection() {
  const t = useT();
  const dpi = useEditor((s) => s.imageDpi);
  const downscale = useEditor((s) => s.downscaleImages);
  const set = useEditor((s) => s.setImageImport);
  return (
    <Section title={t('inspector.imageImport')} collapsible>
      <label className="field">
        <span>{t('inspector.dpi')}</span>
        <select value={dpi} disabled={!downscale} onChange={(e) => set({ dpi: Number(e.target.value) })}>
          {IMAGE_DPI_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={downscale} onChange={(e) => set({ downscale: e.target.checked })} />
        <span>{t('inspector.downscale')}</span>
      </label>
    </Section>
  );
}

const ALIGN_ICONS: Record<TextAlign, IconName> = {
  left: 'alignLeft',
  center: 'alignCenter',
  right: 'alignRight',
  justify: 'alignJustify',
};
const ALIGN_LABELS = {
  left: 'text.alignLeft',
  center: 'text.alignCenter',
  right: 'text.alignRight',
  justify: 'text.alignJustify',
} as const;

function TextSection({ block }: { block: TextBlock }) {
  const t = useT();
  const editing = useEditor((s) => s.editingBlockId === block.id);
  const update = useEditor((s) => s.updateBlock);
  const setStyle = (patch: Partial<TextStyle>, key?: string) => update(block.id, { style: { ...block.style, ...patch } }, key);
  const exec = (cmd: string) => document.execCommand(cmd);
  const { style } = block;

  return (
    <Section title={t('inspector.text')}>
      <label className="field">
        <span>{t('inspector.font')}</span>
        <select value={style.font} onChange={(e) => setStyle({ font: e.target.value })} style={{ fontFamily: style.font }}>
          {FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <NumberField label={t('inspector.fontSize')} value={style.size} min={4} max={400} step={0.5} digits={1} onChange={(v) => setStyle({ size: v }, 'size')} />
        <NumberField label={t('inspector.lineHeight')} value={style.lineHeight} min={0.5} max={4} step={0.05} onChange={(v) => setStyle({ lineHeight: v }, 'lh')} />
      </div>
      <label className="field">
        <span>{t('inspector.color')}</span>
        <input type="color" value={style.color} onChange={(e) => setStyle({ color: e.target.value }, 'color')} />
      </label>
      <div className="icon-row wrap">
        {/* В режиме редактирования начертание применяется к выделенному фрагменту, иначе ко всему блоку. */}
        <ToolButton
          label={t('text.bold')}
          active={!editing && style.weight >= 600}
          onClick={() => (editing ? exec('bold') : setStyle({ weight: style.weight >= 600 ? 400 : 700 }))}
        >
          <b>B</b>
        </ToolButton>
        <ToolButton
          label={t('text.italic')}
          active={!editing && style.italic}
          onClick={() => (editing ? exec('italic') : setStyle({ italic: !style.italic }))}
        >
          <i>I</i>
        </ToolButton>
        <ToolButton label={t('text.underline')} disabled={!editing} onClick={() => exec('underline')}>
          <u>U</u>
        </ToolButton>
        <ToolButton icon="bullets" label={t('text.bullets')} disabled={!editing} onClick={() => exec('insertUnorderedList')} />
        <ToolButton icon="numbers" label={t('text.numbers')} disabled={!editing} onClick={() => exec('insertOrderedList')} />
      </div>
      <div className="icon-row">
        {(Object.keys(ALIGN_ICONS) as TextAlign[]).map((a) => (
          <ToolButton key={a} icon={ALIGN_ICONS[a]} label={t(ALIGN_LABELS[a])} active={style.align === a} onClick={() => setStyle({ align: a })} />
        ))}
      </div>
      {!editing && <p className="hint">{t('text.editHint')}</p>}
    </Section>
  );
}

function MarginsSection() {
  const t = useT();
  const project = useProject();
  const apply = useEditor((s) => s.apply);
  const { margins, binding } = project;
  const top = binding.side === 'top';
  const set = (patch: Partial<typeof margins>, key: string) => apply((p) => ops.setMargins(p, patch), `margins-${key}`);
  return (
    <Section title={t('margins.title')} collapsible>
      <div className="field-row">
        <NumberField label={t('margins.inner')} value={margins.inner} min={0} max={500} onChange={(v) => set({ inner: v }, 'inner')} />
        <NumberField label={t(top ? 'margins.outerSides' : 'margins.outer')} value={margins.outer} min={0} max={500} onChange={(v) => set({ outer: v }, 'outer')} />
      </div>
      <div className="field-row">
        {/* При верхнем переплёте верхнее поле заменено внутренним. */}
        <NumberField label={t('margins.top')} value={margins.top} min={0} max={500} disabled={top} onChange={(v) => set({ top: v }, 'top')} />
        <NumberField label={t(top ? 'margins.far' : 'margins.bottom')} value={margins.bottom} min={0} max={500} onChange={(v) => set({ bottom: v }, 'bottom')} />
      </div>
    </Section>
  );
}

function BindingSection() {
  const t = useT();
  const lang = useEditor((s) => s.lang);
  const project = useProject();
  const userPresets = useEditor((s) => s.userPresets);
  const s = useEditor.getState();
  const { binding } = project;
  const { holes } = binding;
  const presets = [...BUILTIN_PRESETS, ...userPresets];
  const current = matchPreset(binding, presets);
  const set = (patch: ops.BindingPatch, key: string) => s.apply((p) => ops.setBinding(p, patch), `binding-${key}`);
  const off = !binding.enabled;

  return (
    <Section title={t('binding.title')} collapsible>
      <label className="check">
        <input type="checkbox" checked={binding.enabled} onChange={(e) => set({ enabled: e.target.checked }, 'enabled')} />
        <span>{t('binding.enabled')}</span>
      </label>
      <label className="field">
        <span>{t('binding.preset')}</span>
        <select
          value={current?.id ?? 'custom'}
          onChange={(e) => {
            const preset = presets.find((p) => p.id === e.target.value);
            if (preset) s.apply((p) => applyPreset(p, preset));
          }}
        >
          <option value="custom" disabled={!!current}>
            {t('binding.custom')}
          </option>
          <optgroup label={t('binding.builtin')}>
            {BUILTIN_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {presetName(p, lang)}
              </option>
            ))}
          </optgroup>
          {userPresets.length > 0 && (
            <optgroup label={t('binding.mine')}>
              {userPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {presetName(p, lang)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {current?.verify && <p className="warning">{t('binding.verify')}</p>}
      <div className="icon-row">
        <button
          className="btn small"
          disabled={!!current}
          onClick={() => {
            const name = window.prompt(t('binding.presetPrompt'))?.trim();
            if (name) s.saveUserPreset(name);
          }}
        >
          {t('binding.savePreset')}
        </button>
        {current?.user && (
          <button className="btn small" onClick={() => s.deleteUserPreset(current.id)}>
            {t('binding.deletePreset')}
          </button>
        )}
      </div>
      <label className="field">
        <span>{t('binding.side')}</span>
        <select value={binding.side} onChange={(e) => set({ side: e.target.value as Binding['side'] }, 'side')}>
          {(['left', 'right', 'top'] as const).map((v) => (
            <option key={v} value={v}>
              {t(`side.${v}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t('binding.mirror')}</span>
        <select value={binding.mirror} onChange={(e) => set({ mirror: e.target.value as Binding['mirror'] }, 'mirror')}>
          {(['duplex', 'none'] as const).map((v) => (
            <option key={v} value={v}>
              {t(`mirror.${v}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <NumberField label={t('holes.count')} value={holes.count} min={0} max={60} step={1} digits={0} disabled={off} onChange={(v) => set({ holes: { count: Math.round(v) } }, 'count')} />
        <NumberField label={t('holes.diameter')} value={holes.diameter} min={0.5} max={50} step={0.5} disabled={off} onChange={(v) => set({ holes: { diameter: v } }, 'diameter')} />
      </div>
      <div className="field-row">
        {!holes.gaps && (
          <NumberField label={t('holes.pitch')} value={holes.pitch} min={0} max={1000} step={0.5} disabled={off} onChange={(v) => set({ holes: { pitch: v } }, 'pitch')} />
        )}
        <NumberField label={t('holes.offset')} value={holes.offsetFromEdge} min={0} max={100} step={0.5} disabled={off} onChange={(v) => set({ holes: { offsetFromEdge: v } }, 'offset')} />
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={!!holes.gaps}
          disabled={off || holes.count < 2}
          onChange={(e) =>
            set({ holes: { gaps: e.target.checked ? Array.from({ length: holes.count - 1 }, () => holes.pitch) : undefined } }, 'uneven')
          }
        />
        <span>{t('holes.uneven')}</span>
      </label>
      {holes.gaps && <GapsField label={t('holes.gaps')} gaps={holes.gaps} disabled={off} onChange={(gaps) => set({ holes: { gaps } }, 'gaps')} />}
      <label className="check">
        <input type="checkbox" checked={holes.centered} disabled={off} onChange={(e) => set({ holes: { centered: e.target.checked } }, 'centered')} />
        <span>{t('holes.centered')}</span>
      </label>
      {!holes.centered && (
        <NumberField label={t('holes.first')} value={holes.firstHoleOffset ?? 0} min={0} max={2000} step={0.5} disabled={off} onChange={(v) => set({ holes: { firstHoleOffset: v } }, 'first')} />
      )}
      <NumberField label={t('holes.keepOut')} value={binding.keepOutPadding} min={0} max={50} step={0.5} disabled={off} onChange={(v) => set({ keepOutPadding: v }, 'keepout')} />
    </Section>
  );
}

/** Промежутки текстом «19-19-70-19-19»: применяются по мере ввода, пока ввод корректен. */
function GapsField({ label, gaps, disabled, onChange }: { label: string; gaps: number[]; disabled?: boolean; onChange: (g: number[]) => void }) {
  const id = useId();
  const [text, setText] = useState(formatGaps(gaps));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(formatGaps(gaps));
  }, [gaps, focused]);
  const valid = parseGaps(text) !== null;
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="19-19-70-19-19"
        value={text}
        disabled={disabled}
        aria-invalid={!valid}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onChange={(e) => {
          setText(e.target.value);
          const g = parseGaps(e.target.value);
          if (g) onChange(g);
        }}
      />
    </label>
  );
}

function PrintSection() {
  const t = useT();
  const project = useProject();
  const s = useEditor.getState();
  const { print, binding } = project;
  const set = (patch: Partial<PrintSettings>) => s.apply((p) => ops.setPrint(p, patch));
  const need = requiredFlip(binding.side, printSheetSize(project));

  return (
    <Section title={t('print.title')} collapsible>
      <label className="field">
        <span>{t('print.holeMarks')}</span>
        <select value={print.holeMarks} onChange={(e) => set({ holeMarks: e.target.value as PrintSettings['holeMarks'] })}>
          {(['off', 'screen-only', 'print'] as const).map((v) => (
            <option key={v} value={v}>
              {t(`holeMarks.${v}`)}
            </option>
          ))}
        </select>
      </label>
      {binding.mirror === 'duplex' && (
        <>
          <label className="field">
            <span>{t('print.duplexFlip')}</span>
            <select value={print.duplexFlip} onChange={(e) => set({ duplexFlip: e.target.value as PrintSettings['duplexFlip'] })}>
              {(['long-edge', 'short-edge'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`flip.${v}`)}
                </option>
              ))}
            </select>
          </label>
          <p className={print.duplexFlip === need ? 'hint' : 'warning'}>{t('print.flipHint', { flip: t(`flip.${need}`).toLowerCase() })}</p>
        </>
      )}
      <PrintJobControls />
      {hasBackSides(project) && <p className="hint">{t('job.hint')}</p>}
      <div className="icon-row">
        <button className="btn" onClick={() => s.setPreviewOpen(true)}>
          {t('print.preview')}
        </button>
        <button className="btn primary" onClick={() => void printProject()}>
          {t('print.print')}
        </button>
      </div>
      <p className="hint">{t('print.hint')}</p>
    </Section>
  );
}

const SHEETS = ['A4', 'Letter', 'custom'] as const;

function ImpositionSection() {
  const t = useT();
  const project = useProject();
  const s = useEditor.getState();
  const { print } = project;
  const im = print.imposition;
  const layout = sheetLayout(project);
  const setIm = (patch: Partial<NonNullable<PrintSettings['imposition']>> | null, key?: string) =>
    s.apply((p) => ops.setPrint(p, { imposition: patch && p.print.imposition ? { ...p.print.imposition, ...patch } : null }), key && `imposition-${key}`);
  const enable = () => {
    const grid = maxGrid('A4', project.page, 0) ?? { cols: 1, rows: 1 };
    s.apply((p) => ops.setPrint(p, { imposition: { sheet: 'A4', gap: 0, ...grid } }));
  };
  const custom = im && typeof im.sheet === 'object' ? im.sheet : null;
  const setSheet = (sheet: ImpositionSheet, key?: string) => setIm({ sheet }, key);

  return (
    <Section title={t('imposition.title')} collapsible>
      <label className="check">
        <input type="checkbox" checked={!!im} onChange={(e) => (e.target.checked ? enable() : setIm(null))} />
        <span>{t('imposition.enabled')}</span>
      </label>
      {im && layout && (
        <>
          <label className="field">
            <span>{t('imposition.sheet')}</span>
            <select
              value={custom ? 'custom' : (im.sheet as string)}
              onChange={(e) => {
                const v = e.target.value as (typeof SHEETS)[number];
                if (v !== 'custom') return setSheet(v);
                const size = sheetSize(im.sheet);
                setSheet({ w: size.width, h: size.height });
              }}
            >
              {SHEETS.map((v) => (
                <option key={v} value={v}>
                  {v === 'custom' ? t('inspector.custom') : v}
                </option>
              ))}
            </select>
          </label>
          {custom && (
            <div className="field-row">
              <NumberField label={t('inspector.width')} value={custom.w} min={10} max={2000} onChange={(w) => setSheet({ ...custom, w }, 'w')} />
              <NumberField label={t('inspector.height')} value={custom.h} min={10} max={2000} onChange={(h) => setSheet({ ...custom, h }, 'h')} />
            </div>
          )}
          <div className="field-row">
            <NumberField label={t('imposition.cols')} value={im.cols} min={1} max={20} step={1} digits={0} onChange={(v) => setIm({ cols: Math.round(v) }, 'cols')} />
            <NumberField label={t('imposition.rows')} value={im.rows} min={1} max={20} step={1} digits={0} onChange={(v) => setIm({ rows: Math.round(v) }, 'rows')} />
          </div>
          <div className="field-row">
            <NumberField label={t('imposition.gap')} value={im.gap} min={0} max={100} step={0.5} onChange={(v) => setIm({ gap: v }, 'gap')} />
            <button
              className="btn small"
              onClick={() => {
                const grid = maxGrid(im.sheet, project.page, im.gap);
                if (grid) setIm(grid);
              }}
            >
              {t('imposition.max')}
            </button>
          </div>
          <p className={layout.fits ? 'hint' : 'warning'} data-testid="imposition-status">
            {layout.fits
              ? t('imposition.status', {
                  w: +layout.sheet.width.toFixed(1),
                  h: +layout.sheet.height.toFixed(1),
                  o: t(layout.landscape ? 'inspector.landscape' : 'inspector.portrait').toLowerCase(),
                  n: layout.cells.length,
                })
              : t('imposition.noFit')}
          </p>
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={print.cropMarks} disabled={!im} onChange={(e) => s.apply((p) => ops.setPrint(p, { cropMarks: e.target.checked }))} />
        <span>{t('imposition.cropMarks')}</span>
      </label>
      {!im && <p className="hint">{t('imposition.cropHint')}</p>}
      {im && layout && print.cropMarks && cropMarks(layout).length === 0 && <p className="warning">{t('imposition.cropNoRoom')}</p>}
    </Section>
  );
}

function CalibrationSection() {
  const t = useT();
  const project = useProject();
  const s = useEditor.getState();
  const { offsetFront, offsetBack } = project.print;
  const set = (key: 'offsetFront' | 'offsetBack', patch: Partial<typeof offsetFront>) =>
    s.apply((p) => ops.setPrint(p, { [key]: { ...p.print[key], ...patch } }), `${key}-${Object.keys(patch)[0]}`);
  return (
    <Section title={t('calib.title')} collapsible>
      <span className="field-caption">{t('calib.offsets')}</span>
      <div className="field-row">
        <NumberField label={t('calib.frontX')} value={offsetFront.x} min={-50} max={50} step={0.1} digits={1} onChange={(x) => set('offsetFront', { x })} />
        <NumberField label={t('calib.frontY')} value={offsetFront.y} min={-50} max={50} step={0.1} digits={1} onChange={(y) => set('offsetFront', { y })} />
      </div>
      <div className="field-row">
        <NumberField label={t('calib.backX')} value={offsetBack.x} min={-50} max={50} step={0.1} digits={1} onChange={(x) => set('offsetBack', { x })} />
        <NumberField label={t('calib.backY')} value={offsetBack.y} min={-50} max={50} step={0.1} digits={1} onChange={(y) => set('offsetBack', { y })} />
      </div>
      <button className="btn" onClick={() => s.setCalibrationOpen(true)}>
        {t('calib.open')}
      </button>
    </Section>
  );
}

function KeepOutWarning({ block }: { block: Block }) {
  const t = useT();
  const project = useProject();
  const index = useEditor((s) => project.pages.findIndex((p) => p.id === s.currentPageId));
  const holes = holeCenters(index, project);
  if (!holes.length || !hitsKeepOut(block, holes, project.binding.keepOutPadding)) return null;
  return <p className="warning">{t('warn.keepOut')}</p>;
}

function BlockSection({ block }: { block: Block }) {
  const t = useT();
  const s = useEditor.getState();
  const update = (patch: Partial<Block>, key: string) => s.updateBlock(block.id, patch, key);
  const locked = !!block.locked;

  return (
    <>
      <Section title={t('inspector.block')}>
        <KeepOutWarning block={block} />
        <span className="field-caption">{t('inspector.position')}</span>
        <div className="field-row">
          <NumberField label="X" value={block.x} disabled={locked} onChange={(v) => update({ x: v }, 'x')} />
          <NumberField label="Y" value={block.y} disabled={locked} onChange={(v) => update({ y: v }, 'y')} />
        </div>
        <div className="field-row">
          <NumberField label="W" value={block.w} min={1} disabled={locked} onChange={(v) => update({ w: v }, 'w')} />
          <NumberField label="H" value={block.h} min={1} disabled={locked} onChange={(v) => update({ h: v }, 'h')} />
        </div>
        <NumberField
          label={t('inspector.rotation')}
          value={block.rotation}
          min={-360}
          max={360}
          digits={1}
          disabled={locked}
          onChange={(v) => update({ rotation: ((v % 360) + 360) % 360 }, 'rot')}
        />
        {block.type === 'image' && (
          <label className="field">
            <span>{t('inspector.fit')}</span>
            <select value={block.fit} onChange={(e) => update({ fit: e.target.value as ImageFit }, 'fit')}>
              {(['contain', 'cover', 'stretch'] as const).map((f) => (
                <option key={f} value={f}>
                  {t(`fit.${f}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="icon-row">
          <ToolButton icon={locked ? 'unlock' : 'lock'} label={t(locked ? 'block.unlock' : 'block.lock')} active={locked} onClick={() => s.toggleLockSelected()} />
          <ToolButton icon="copy" label={t('block.duplicate')} onClick={() => s.duplicateSelected()} />
          <ToolButton icon="trash" label={t('block.delete')} onClick={() => s.deleteSelected()} />
        </div>
      </Section>
      <Section title={t('inspector.layers')}>
        <div className="icon-row">
          <ToolButton icon="front" label={t('z.front')} onClick={() => s.reorderSelected('front')} />
          <ToolButton icon="forward" label={t('z.forward')} onClick={() => s.reorderSelected('forward')} />
          <ToolButton icon="backward" label={t('z.backward')} onClick={() => s.reorderSelected('backward')} />
          <ToolButton icon="back" label={t('z.back')} onClick={() => s.reorderSelected('back')} />
        </div>
      </Section>
      {block.type === 'text' && <TextSection block={block} />}
    </>
  );
}

export function Inspector() {
  const t = useT();
  const project = useProject();
  const currentPageId = useEditor((s) => s.currentPageId);
  const selectedId = useEditor((s) => s.selectedBlockId);
  const block = project.pages.find((p) => p.id === currentPageId)?.blocks.find((b) => b.id === selectedId);

  return (
    <aside className="inspector">
      {block ? <BlockSection block={block} /> : <p className="hint">{t('inspector.noSelection')}</p>}
      <PageSection />
      <MarginsSection />
      <BindingSection />
      <PrintSection />
      <ImpositionSection />
      <CalibrationSection />
      <ImportSection />
    </aside>
  );
}
