# Frontend rules (web/)

Before any UI change, read **[DESIGN.md](DESIGN.md)**. It is the design system: tokens, type scale, which component to use for what, page patterns and the workflow. Keep it updated when you add or change a `ui/` component.

Non-negotiables:
- **Colors:**
  - only semantic token classes (`bg-surface`, `text-fg-muted`, `border-line`, `text-danger`, `bg-success-soft`, …);
  - no hex, no raw Tailwind palette classes, no `dark:` variants.
- **Text:** only the scale (`text-2xs` to `text-display`); never `text-[Npx]`.
- **Radius:** only `rounded-control`, `rounded-card`, `rounded-overlay` and `rounded-full`.
- **Components:** use the existing `src/components/ui/*` component; if none fits, add a variant there rather than hand-rolling inline.
- **Overlays:** portal to `document.body` with a frosted backdrop (`bg-overlay backdrop-blur-xl`).
- **Data states:** every data view has loading (skeleton), error (Alert with retry) and empty (EmptyState) states.
- **Keyboard:** every interactive element is keyboard reachable with a visible focus ring. No hover-only actions, no `window.confirm`, no `transition-all`.
- **Themes:** check dark **and** light.
- **Build:** use `./build.sh` (repo root). Don't run the app locally; it's reviewed on a remote machine.
