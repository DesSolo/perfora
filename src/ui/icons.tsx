// Иконки в стиле линий 24×24, без внешних зависимостей.
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6M11 8v6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
  front: 'M8 8h12v12H8zM4 4h10v2M4 4v10h2',
  back: 'M4 4h12v12H4zM18 8h2v12H8v-2',
  forward: 'M12 19V9M7 13l5-5 5 5M5 4h14',
  backward: 'M12 5v10M7 11l5 5 5-5M5 20h14',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  alignJustify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  bullets: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  numbers: 'M10 6h10M10 12h10M10 18h10M4 4h1v4M4 8h2M4 14h2l-2 4h2',
  portrait: 'M7 3h10v18H7z',
  landscape: 'M3 7h18v10H3z',
  spread: 'M3 4h8v16H3zM13 4h8v16h-8z',
  margins: 'M4 4h16v16H4zM8 8h8v8H8z',
  holes: 'M5 3h14v18H5zM9 7.5h.01M9 12h.01M9 16.5h.01',
  keepOut: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 3v2M12 19v2M3 12h2M19 12h2',
  grid: 'M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16',
  magnet: 'M6 4v7a6 6 0 0 0 12 0V4h-4v7a2 2 0 0 1-4 0V4zM6 8h4M14 8h4',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  folder: 'M3 6h6l2 2h10v11H3z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 15V4M7 9l5-5 5 5M5 20h14',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
