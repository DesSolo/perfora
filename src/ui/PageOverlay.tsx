import { memo } from 'react';
import type { Box, Hole } from '../core/geometry/binding';
import type { Guides } from '../core/geometry/snap';
import type { PageSize } from './PageSurface';

/** SVG поверх страницы в системе координат страницы (1 единица = 1 мм). */
function MmSvg({ size, className, children }: { size: PageSize; className: string; children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={`${size.width}mm`}
      height={`${size.height}mm`}
      viewBox={`0 0 ${size.width} ${size.height}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Метка для перфоратора: окружность и перекрестие по центру. Для печати и предпросмотра. */
export const PrintHoleMarks = memo(function PrintHoleMarks({ holes, size }: { holes: Hole[]; size: PageSize }) {
  if (holes.length === 0) return null;
  return (
    <MmSvg size={size} className="page-overlay">
      {holes.map((h, i) => (
        <g key={i} fill="none" stroke="#000" strokeWidth={0.15}>
          <circle cx={h.x} cy={h.y} r={h.r} />
          <path d={`M${h.x - h.r * 0.6} ${h.y}h${h.r * 1.2}M${h.x} ${h.y - h.r * 0.6}v${h.r * 1.2}`} />
        </g>
      ))}
    </MmSvg>
  );
});

export interface OverlayProps {
  size: PageSize;
  /** Толщина линии в мм, чтобы на экране она была ~1px при любом масштабе. */
  hairline: number;
  content: Box | null;
  holes: Hole[];
  showHoles: boolean;
  keepOutPadding: number | null;
  grid: boolean;
  guides: Guides | null;
}

const GRID_STEP = 5;

export const PageOverlay = memo(function PageOverlay({ size, hairline, content, holes, showHoles, keepOutPadding, grid, guides }: OverlayProps) {
  const lines: React.ReactNode[] = [];
  if (grid) {
    for (let x = GRID_STEP; x < size.width; x += GRID_STEP) {
      lines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={size.height} className={x % 10 === 0 ? 'grid-major' : 'grid-minor'} />);
    }
    for (let y = GRID_STEP; y < size.height; y += GRID_STEP) {
      lines.push(<line key={`gy${y}`} x1={0} y1={y} x2={size.width} y2={y} className={y % 10 === 0 ? 'grid-major' : 'grid-minor'} />);
    }
  }

  return (
    <MmSvg size={size} className="page-overlay editor-overlay">
      <g strokeWidth={hairline} fill="none">
        {lines}
        {content && (
          <rect
            className="margin-guide"
            x={content.x}
            y={content.y}
            width={content.w}
            height={content.h}
            strokeDasharray={`${hairline * 4} ${hairline * 3}`}
          />
        )}
        {keepOutPadding !== null &&
          holes.map((h, i) => <circle key={`k${i}`} className="keepout-zone" cx={h.x} cy={h.y} r={h.r + keepOutPadding} />)}
        {showHoles && holes.map((h, i) => <circle key={`h${i}`} className="hole" cx={h.x} cy={h.y} r={h.r} />)}
        {guides?.x.map((x) => <line key={`sx${x}`} className="snap-guide" x1={x} y1={0} x2={x} y2={size.height} />)}
        {guides?.y.map((y) => <line key={`sy${y}`} className="snap-guide" x1={0} y1={y} x2={size.width} y2={y} />)}
      </g>
    </MmSvg>
  );
});
