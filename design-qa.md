# Finder chrome alignment QA

## Comparison target

- Source visual truth: `/var/folders/jw/5mwwlr9d6t51k0rpdmdw9q600000gn/T/codex-clipboard-5f342a7c-faf5-4095-992f-7034b8a73517.png` (2770 × 1640).
- Rendered implementation: `/tmp/fileman-finder-ui-actual.png` (1440 × 900).
- Implementation viewport: 1440 × 900 CSS px, `deviceScaleFactor: 1`.
- State: light theme, one local tab, list view, mocked local file data.
- Scope: only the requested shell changes—sidebar surface, title/tab row, circular toolbar treatment, and fixed sidebar-bottom actions. File data, sidebar information architecture, and native Finder controls are intentionally out of scope.

## Evidence

The rendered page was captured after loading the renderer with a mocked Fileman bridge. Layout measurements confirm a 48px title bar, a 44px tab strip positioned inside it (`x: 70, y: 1.5`), and a visible 45px sidebar utility bar at the bottom (`y: 830.5`).

The Finder reference and rendered screenshot were compared together with the chrome-only scope above. The comparison confirms that the application intentionally differs in file-manager content and native Finder controls. The requested deviations are present: the light sidebar is pure white, tabs no longer consume a second row, and the four global controls appear as circular translucent buttons at the sidebar bottom.

## Required fidelity surfaces

- Fonts and typography: existing SF-style system stack retained; small sidebar labels remain unchanged.
- Spacing and layout rhythm: tab strip is now contained within the 48px title bar; sidebar content scrolls independently of its fixed bottom controls.
- Colors and visual tokens: light sidebar uses `#ffffff`; controls use translucent white surfaces with low-contrast borders; active actions use the existing system blue.
- Image quality and assets: no image assets were added or replaced.
- Copy and content: existing Fileman labels and device-specific sections were retained intentionally.

## Findings

- [P3] Browser capture cannot show the native macOS traffic-light buttons. This is expected renderer-only behavior and does not affect the Electron window layout.

## Implementation checklist

1. Light-mode sidebar uses a pure white token.
2. Tab strip shares the title-bar row.
3. Theme, file operations, dual-pane, and settings actions are fixed at the sidebar bottom.
4. Typecheck, production build, and tab-action regression tests pass.

final result: passed
