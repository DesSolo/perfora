import { memo, type CSSProperties } from 'react';
import type { Block, ImageBlock, Page, TextBlock, TextStyle } from '../core/model';
import { assetUrl } from '../assets/registry';
import { sanitizeHtml } from '../text/sanitize';
import { useT } from '../store/editor';

export interface PageSize {
  width: number;
  height: number;
}

/** Положение блока в мм. Поворот вокруг центра, как в модели. */
export function blockStyle(b: Block): CSSProperties {
  return {
    position: 'absolute',
    left: `${b.x}mm`,
    top: `${b.y}mm`,
    width: `${b.w}mm`,
    height: `${b.h}mm`,
    transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined,
    zIndex: b.z,
  };
}

export function textCss(s: TextStyle): CSSProperties {
  return {
    fontFamily: `'${s.font}', sans-serif`,
    fontSize: `${s.size}pt`,
    fontWeight: s.weight,
    fontStyle: s.italic ? 'italic' : 'normal',
    textAlign: s.align,
    lineHeight: s.lineHeight,
    color: s.color,
  };
}

const FIT_CSS = { contain: 'contain', cover: 'cover', stretch: 'fill' } as const;

const ImageContent = memo(function ImageContent({ block }: { block: ImageBlock }) {
  const t = useT();
  const url = assetUrl(block.assetId);
  if (!url) return <div className="image-missing">{t('block.missingImage')}</div>;
  return <img className="image-content" src={url} alt="" draggable={false} style={{ objectFit: FIT_CSS[block.fit] }} />;
});

const TextContent = memo(function TextContent({ block }: { block: TextBlock }) {
  return (
    <div className="text-content" style={textCss(block.style)} dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html) }} />
  );
});

export function BlockContent({ block }: { block: Block }) {
  return block.type === 'image' ? <ImageContent block={block} /> : <TextContent block={block} />;
}

/** Статичный рендер страницы: миниатюры, а позже предпросмотр и печать. */
export const PageSurface = memo(function PageSurface({ page, size }: { page: Page; size: PageSize }) {
  return (
    <div className="page-surface" style={{ width: `${size.width}mm`, height: `${size.height}mm` }}>
      {page.blocks.map((b) => (
        <div key={b.id} style={blockStyle(b)}>
          <BlockContent block={b} />
        </div>
      ))}
    </div>
  );
});
