import { newId } from '../core/ids';
import type { AssetMeta } from '../core/model';
import { pixelsFor } from '../core/units';

export interface ImageImportOptions {
  dpi: number;
  /** false — хранить оригинал без пересжатия. */
  downscale: boolean;
  /** Наибольший размер (мм), в который картинка может быть вписана на странице. */
  maxPlacement: { w: number; h: number };
}

export interface ImportedImage {
  meta: AssetMeta;
  blob: Blob;
}

export const IMAGE_DPI_OPTIONS = [150, 200, 300] as const;

/** Во сколько раз уменьшить картинку, чтобы её хватило на dpi при вписывании в область. Не больше 1. */
export function downscaleFactor(px: { w: number; h: number }, area: { w: number; h: number }, dpi: number): number {
  const fit = Math.min(area.w / px.w, area.h / px.h); // мм на пиксель исходника при вписывании
  const placed = { w: px.w * fit, h: px.h * fit };
  const need = { w: pixelsFor(placed.w, dpi), h: pixelsFor(placed.h, dpi) };
  return Math.min(1, Math.max(need.w / px.w, need.h / px.h));
}

export async function importImage(file: File, opts: ImageImportOptions): Promise<ImportedImage> {
  const id = newId('a');
  const name = file.name || 'image';

  // SVG масштабируется без потерь, оставляем как есть.
  if (file.type === 'image/svg+xml') {
    const { w, h } = await svgSize(file);
    return { meta: { id, name, mime: file.type, width: w, height: h }, blob: file };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const src = { w: bitmap.width, h: bitmap.height };
    const k = opts.downscale ? downscaleFactor(src, opts.maxPlacement, opts.dpi) : 1;
    if (k >= 0.999 && file.type !== 'image/heic') {
      return { meta: { id, name, mime: file.type || 'image/png', width: src.w, height: src.h }, blob: file };
    }
    const w = Math.max(1, Math.round(src.w * k));
    const h = Math.max(1, Math.round(src.h * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    // PNG/WebP/GIF могут быть прозрачными — оставляем PNG, остальное в JPEG.
    const mime = /png|webp|gif/.test(file.type) ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), mime, 0.92),
    );
    return { meta: { id, name, mime, width: w, height: h }, blob };
  } finally {
    bitmap.close();
  }
}

async function svgSize(file: File): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { w: img.naturalWidth || 100, h: img.naturalHeight || 100 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isImageFile(f: File): boolean {
  return f.type.startsWith('image/');
}
