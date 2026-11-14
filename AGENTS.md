# Repository Guidelines

## Project Structure & Module Organization

FilemanElectron is a macOS-focused Electron 29 application using Vue 3, TypeScript, Pinia, and electron-vite. The renderer lives in `src/`: UI components are in `src/components/`, state in `src/stores/`, composables in `src/composables/`, and shared styling in `src/style.css` and `src/styles/`. The Electron main and preload processes are `electron/main.ts` and `electron/preload.ts`; services and filesystem adapters are under `electron/src/`. Put cross-process types and ZIP path helpers in `shared/`.

Unit-style checks are in `tests/`; browser regression tests are in `e2e/`. Packaging scripts live in `scripts/`, native iOS code in `native/iosafc/`, and product requirements in `prd/`. Consult `疑难问题解决记录/` before changing Monaco, PDF preview, selection, or global CSS.

## Build, Test, and Development Commands

```bash
npm install                 # installs dependencies and builds the iOS addon when available
npm run dev                 # launches Electron with the Vite renderer
npm run typecheck           # runs vue-tsc; required static check
npm run build               # emits main, preload, and renderer bundles to out/
npm run test:fuzzy-match    # runs one focused Node assertion test
npm run test:e2e            # starts the renderer and runs Playwright tests
npm run dist:mac            # builds and packages the macOS DMG
```

Use the matching `test:<area>` script from `package.json` for focused utility work. Playwright uses `zh-CN`; keep its visible-text assertions Chinese unless the test explicitly changes locale.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, single quotes, semicolons omitted, and strict types; `tsconfig.json` rejects unused locals and parameters. Name Vue components in PascalCase (`FilePane.vue`), composables `useXxx.ts`, and utilities in camelCase. Prefer `@/` for renderer imports and `@shared/` for shared code. No formatter or linter is configured, so match surrounding code. Use CSS variables/Tailwind semantic utilities instead of hard-coded colors.

## Testing Guidelines

Add or update focused `tests/<feature>.test.ts` assertions for non-UI logic and `e2e/<feature>.spec.ts` for user-facing flows. There is no enforced coverage target. Run `npm run typecheck` plus the relevant test script before submitting; run `npm run test:e2e` for UI, IPC, or interaction changes.

## Commit & Pull Request Guidelines

Recent commits use concise Conventional Commit-style prefixes, commonly `feat:` followed by a Chinese summary. Follow that pattern, for example `fix: 修正 ZIP 路径返回上级`. Keep commits scoped. PRs should describe the behavior change, link the relevant requirement or issue, list validation commands, and include screenshots or recordings for visible UI changes. Do not commit generated `out/`, `dist/`, Playwright reports, or unrelated local edits.
