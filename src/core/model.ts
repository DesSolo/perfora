// Модель проекта. Все линейные величины в миллиметрах.
// Координаты блоков хранятся в системе страницы без зеркалирования.

export type Mm = number;

export const SCHEMA_VERSION = 1;

export interface Project {
  schemaVersion: number;
  name: string;
  page: { width: Mm; height: Mm };
  margins: { inner: Mm; outer: Mm; top: Mm; bottom: Mm };
  binding: Binding;
  print: PrintSettings;
  pages: Page[];
  /** Метаданные картинок; сами Blob хранятся отдельно (assets/registry). */
  assets: Record<string, AssetMeta>;
}

export interface AssetMeta {
  id: string;
  name: string;
  mime: string;
  /** Размер хранимого (уже уменьшенного) изображения в пикселях. */
  width: number;
  height: number;
}

export interface Binding {
  enabled: boolean;
  side: 'left' | 'right' | 'top';
  mirror: 'none' | 'duplex';
  holes: {
    count: number;
    diameter: Mm;
    pitch: Mm;
    offsetFromEdge: Mm;
    firstHoleOffset?: Mm;
    centered: boolean;
  };
  keepOutPadding: Mm;
}

export type ImpositionSheet = 'A4' | 'Letter' | { w: Mm; h: Mm };

export interface PrintSettings {
  holeMarks: 'off' | 'screen-only' | 'print';
  cropMarks: boolean;
  duplexFlip: 'long-edge' | 'short-edge';
  offsetFront: { x: Mm; y: Mm };
  offsetBack: { x: Mm; y: Mm };
  imposition: null | { sheet: ImpositionSheet; cols: number; rows: number; gap: Mm };
}

export interface Page {
  id: string;
  blocks: Block[];
}

export type Block = ImageBlock | TextBlock;

export interface BlockBase {
  id: string;
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
  /** Градусы по часовой стрелке, поворот вокруг центра блока. */
  rotation: number;
  z: number;
  locked?: boolean;
}

export type ImageFit = 'contain' | 'cover' | 'stretch';

export interface ImageBlock extends BlockBase {
  type: 'image';
  assetId: string;
  fit: ImageFit;
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface TextStyle {
  font: string;
  size: number; // pt
  weight: number;
  italic: boolean;
  align: TextAlign;
  lineHeight: number;
  color: string;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  html: string;
  style: TextStyle;
}
