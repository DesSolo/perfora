# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Perfora: a client-only SPA for laying out and printing ring/disc-binder inserts. The full spec is in Russian and lives outside the repo; README.md tracks milestone status (M1–M5), what is done, and deliberate deviations from the spec. Update README after each milestone.

## Commands

```bash
make run                         # npm install if needed, then dev server :5173
npm run dev                      # Vite dev server :5173
npm run build                    # tsc --noEmit + vite build
npm run typecheck
npm test                         # Vitest unit tests (src/**/*.test.ts)
npx vitest run src/core/ops.test.ts -t 'дублирование'   # single file / single test
npm run e2e                      # Playwright; starts its own dev server on :5174
PW_CHROMIUM_PATH=/usr/bin/chromium-browser npm run e2e   # this machine has no Playwright browsers; use system Chromium
npx playwright test -g 'страницы'                        # single e2e test
```

Unit tests run in the `node` environment. Tests that need the DOM (DOMPurify) start with `// @vitest-environment jsdom`.

## Architecture

- **All geometry is in millimetres.** Pages and blocks render as DOM with CSS `mm` units. The canvas zooms with `transform: scale(zoom)` and sets `--z` so handles and outlines can keep a constant screen size (`calc(10px / var(--z))`). Pointer px → mm is `delta / (PX_PER_MM * zoom)` (`src/core/units.ts`). Print (M2) is meant to reuse the same `PageSurface` markup at scale 1.
- **`src/core/` is pure TS with no DOM or React.** It holds the model (`model.ts`, following the spec's types), immutable ops built on immer `produce` (`ops.ts`), snapshot history (`history.ts`) and geometry (`geometry/`). Spec rule: holes, mirroring and imposition go here as pure functions with unit tests, separate from UI. Block coordinates are stored unmirrored; mirroring by page parity is applied only at render and print time.
- **Binding geometry** (`core/geometry/binding.ts`): page index 0 is page 1 (front). With `mirror: 'duplex'`, even pages are the back of the sheet *as the reader sees it after flipping around the binding edge*: side binding mirrors left↔right, top binding mirrors to `bottom`. Margins (`inner` is always at the binding edge), hole centres and keep-out are all derived per page index. Print rotates back pages 180° when `print.duplexFlip` ≠ `requiredFlip(side, page)`.
- **Printing**: `PrintRoot` (`ui/Print.tsx`) is portalled into `<body>` and mounted only while `printing` is true. It renders sheet sides from `printSides()` (`core/geometry/imposition.ts`): without imposition one side per page, with it a centred grid where each back page sits in the mirrored cell (axis from `flipAxis`). Calibration offsets translate a whole side; `printTarget: 'calibration'` prints the test sheet instead, without offsets. The side filter/reverse (`printJob`) is session-only store state. `@media print` hides `#root`. `preparePrint()` mounts it and waits for fonts and image decode. The preview modal renders the same `PrintPage` component. In dev, `window.preparePrint` is exposed so e2e can call `page.pdf()` and check `MediaBox`.
- **Snapping**: targets are computed once at gesture start (`snapTargets`). The threshold is `SNAP_PX / (PX_PER_MM * zoom)` mm. Guides live in the store only during a gesture and are cleared in `endGesture`.
- **Undo works on whole-`Project` snapshots** (structural sharing makes them cheap). All mutations go through the store's `apply(fn, coalesceKey?)`. Pointer gestures call `beginGesture` → `previewGesture` (no history) → `endGesture`, which commits one step. Repeated edits with the same `coalesceKey` within 800 ms merge into one step (arrow nudges, numeric inputs).
- **Image blobs are not in the project.** `Project.assets` holds only metadata. Blobs live in `src/assets/registry.ts` (an in-memory Map plus object URLs) and are never freed on block delete, so undo can bring an image back.
- **Persistence** (`src/persist/`): `db.ts` is raw IndexedDB (`projects`, `summaries`, `assets` keyed `${projectId}/${assetId}`); `zip.ts` packs `project.json` + `assets/<id>.<ext>` with fflate; `session.ts` wires the store: autosave on `history.present` change (debounced, skipped mid-gesture), restore on boot (`main.tsx` awaits it before render), open/new/import/export. The project id lives in the store (`projectId`), not in `Project`. `openProject` resets history and clears the asset registry. Anything loaded from outside (IDB, zip) goes through `parseProject` in `core/migrate.ts`; when the schema changes, bump `SCHEMA_VERSION` and add a `MIGRATIONS[n]` step.
- **Text editing**: `TextEditor` (in `ui/EditorPage.tsx`) owns an uncontrolled `contentEditable`. Content is saved on blur *and* on unmount, because deselecting unmounts the editor before blur fires. HTML is always passed through `sanitizeHtml` on write and on render.
- **Memo relies on reference stability.** Blocks and pages keep their identity when unchanged (immer), and the UI depends on this for drag performance. Don't clone the project wholesale in ops.
- **Shortcuts** (`ui/useShortcuts.ts`) match on `e.code`, not `e.key`, so they work in the Russian layout, and they ignore events from inputs and contentEditable.
- **i18n**: `src/i18n/ru.ts` is the source of message keys (`MessageKey`); `en.ts` must have the same keys (the type checker enforces this). UI gets strings through `useT()`.
- In dev the zustand store is exposed as `window.editor`; e2e tests read state through it (`e2e/helpers.ts`).

## Conventions

- Comments and test names are in Russian; keep it that way.
- Binding presets (ring/disc hole layouts) must live in a data file (`presets.json`), not code. Each preset carries a `source`; presets whose dimensions (usually the edge offset) are not from a published standard are marked `verify` until the owner measures a real binder. Uneven layouts (3 + 3 groups) use `holes.gaps`; `holeGaps()` in `core/geometry/binding.ts` is the single place that resolves gaps vs `pitch`.
