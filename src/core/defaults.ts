import { newId } from './ids';
import { SCHEMA_VERSION, type ImageBlock, type Page, type Project, type TextBlock, type TextStyle } from './model';

export const FONTS = ['PT Sans', 'PT Serif', 'Caveat', 'JetBrains Mono'] as const;

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: 'PT Sans',
  size: 11,
  weight: 400,
  italic: false,
  align: 'left',
  lineHeight: 1.3,
  color: '#000000',
};

export function createPage(): Page {
  return { id: newId('p'), blocks: [] };
}

export function createProject(name = ''): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    page: { width: 148, height: 210 },
    margins: { inner: 15, outer: 8, top: 8, bottom: 8 },
    binding: {
      enabled: true,
      side: 'left',
      mirror: 'duplex',
      // Как пресет a5-6-70 (Filofax A5).
      holes: { count: 6, diameter: 5.5, pitch: 19, gaps: [19, 19, 70, 19, 19], offsetFromEdge: 7, centered: true },
      keepOutPadding: 2,
    },
    print: {
      holeMarks: 'screen-only',
      cropMarks: false,
      duplexFlip: 'long-edge',
      offsetFront: { x: 0, y: 0 },
      offsetBack: { x: 0, y: 0 },
      imposition: null,
    },
    pages: [createPage()],
    assets: {},
  };
}

export function createTextBlock(partial: Partial<TextBlock> = {}): TextBlock {
  return {
    id: newId('b'),
    type: 'text',
    x: 20,
    y: 20,
    w: 80,
    h: 30,
    rotation: 0,
    z: 0,
    html: '',
    style: { ...DEFAULT_TEXT_STYLE },
    ...partial,
  };
}

export function createImageBlock(assetId: string, partial: Partial<ImageBlock> = {}): ImageBlock {
  return {
    id: newId('b'),
    type: 'image',
    assetId,
    fit: 'contain',
    x: 0,
    y: 0,
    w: 50,
    h: 50,
    rotation: 0,
    z: 0,
    ...partial,
  };
}
