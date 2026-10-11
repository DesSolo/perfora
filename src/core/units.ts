import type { Mm } from './model';

export const MM_PER_INCH = 25.4;
/** CSS-пикселей в миллиметре (CSS фиксирует 96 px на дюйм). */
export const PX_PER_MM = 96 / MM_PER_INCH;
export const PT_PER_MM = 72 / MM_PER_INCH;

export const mmToPx = (mm: Mm): number => mm * PX_PER_MM;
export const pxToMm = (px: number): Mm => px / PX_PER_MM;
export const mmToPt = (mm: Mm): number => mm * PT_PER_MM;
export const ptToMm = (pt: number): Mm => pt / PT_PER_MM;

/** Сколько пикселей изображения нужно, чтобы занять `mm` при заданном dpi. */
export const pixelsFor = (mm: Mm, dpi: number): number => Math.ceil((mm / MM_PER_INCH) * dpi);
