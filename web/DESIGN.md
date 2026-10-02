# Avalok design system

This is the single source of truth for how the Avalok web UI looks and how to build it. Read it before any frontend change.

**North star:** calm, premium and data-first. Think Northflank's restraint, Kener's identical dark and light themes, Logdy's dense log tables, and Docker Desktop's command palette. Polish comes from **shadow depth, spacing and simplicity**, not from adding colors.

> **Migration status:** the redesign is landing in phases. See the plan in the PR history.
> - Phase 1 (tokens, type, fonts) is **done**.
> - Components marked *(planned)* below are being added in Phase 2. Until they exist, use the nearest current component and never hand-roll a new one inline.
> - Legacy `var(--bg-*)` / `var(--text-*)` aliases still work but are deprecated.

---

## 1. Tokens: never hardcode a color

Every color comes from a semantic token defined in [`src/index.css`](src/index.css), in two sets: `html.dark` and `html.light`. Use them as Tailwind classes:

| Purpose | Class | Notes |
|---|---|---|
| Page background | `bg-canvas` | The app body only |
| Card, panel, header, sidebar | `bg-surface` | Default container |
| Popover, raised item | `bg-surface-raised` | Use with `shadow-md` / `shadow-lg` |
| Input, table header, log area, code | `bg-surface-sunken` | "Recessed" areas |
| Hover / selected row or item | `bg-hover` / `bg-selected` | |
| Borders | `border-line` / `border-line-strong` | Strong for inputs and overlays |
| Text, primary to faint | `text-fg`, `text-fg-secondary`, `text-fg-muted`, `text-fg-faint` | `faint` is for decoration only (not body text) |
| Brand text, icon, active indicator | `text-accent`, `bg-accent-soft`, `border-accent-line` | |
| Primary button fill | `bg-accent-solid hover:bg-accent-solid-hover text-accent-solid-fg` | Only the Button component should need this |
| Status | `text-success\|warning\|danger\|info`, `bg-*-soft`, `border-*-line` | |
| Modal backdrop | `bg-overlay backdrop-blur-xl` | Frosted, not a heavy dark tint |

**Forbidden in `.tsx`:**
- hex/rgb values;
- raw Tailwind palette classes (`text-emerald-400`, `bg-red-500/10`, `text-white` outside the accent-solid button);
- `dark:` variants (tokens already switch with the theme).

Log source hues (`--color-source-0..9`) are the only exception, through `SourceDot`.

**Status meaning is centralized** in `lib/statusTone.ts` *(planned)*:

| Status | Tone |
|---|---|
| up / connected / ok | `success` |
| degraded / warn | `warning` |
| down / error | `danger` |
| unknown / idle | `neutral` |
| info | `info` |

Never decide status colors per file.

## 2. Typography

The fonts are Inter (UI) and JetBrains Mono (logs, code, IDs, timestamps). Both are self-hosted, so they work offline.

| Class | Size / line height | Use for |
|---|---|---|
| `text-2xs` | 11/16 | Table headers (uppercase + `tracking-wider`), eyebrows, keyboard hints, badge counts |
| `text-xs` | 12/16 | Meta text, badges, helper text, captions |
| `text-sm` | 13/20 | **Default body text**, buttons, inputs, table cells, nav |
| `text-base` | 14/22 | Card titles, modal titles |
| `text-lg` | 16/24 | Section headings |
| `text-xl` | 20/28 | Auth card titles |
| `text-2xl` | 24/32 | Page titles (`PageHeader`) |
| `text-display` | 32/40 | Hero / empty-dashboard greeting only |

- **Weights:** 400 for body, 500 for labels, buttons and nav, 600 for titles. Never use 700 or more.
- **Never use arbitrary sizes** like `text-[10px]` or `text-[13px]`. If something seems to need one, pick the nearest step.
- **Numbers that update or align** (counts, sizes, durations, timestamps, line numbers) get `tabular-nums`.
- **Machine values** (IDs, paths, hashes, YAML) use `font-mono text-xs`.
- **Eyebrow labels**, the small uppercase label above a section like Northflank's "TL;DR": `font-mono text-2xs uppercase tracking-widest text-accent`.

## 3. Spacing, radius, elevation, motion

**Spacing** is on a 4px grid. Use these values consistently:

| Context | Value |
|---|---|
| Page container | `px-6 lg:px-10 py-8 max-w-[1440px] mx-auto` |
| Between page sections | `gap-8` / `mb-8` |
| Card grids | `gap-4` |
| Card padding | `p-5` (dense: `p-4`) |
| Modal body / header / footer | `p-5` / `px-5 py-4` / `px-5 py-4` |
| Form fields stack | `gap-4`; label to input `gap-1.5` |
| Inline items (icon + text, button groups) | `gap-2` |
| Table cells | `px-4 py-3` (compact: `px-3 py-2`) |

**Radius** has only three values, plus `rounded-full` for dots, avatars and pills:
- `rounded-control` (6px): buttons, inputs, badges, menu items, tabs;
- `rounded-card` (10px): cards, tables, panels, skeletons;
- `rounded-overlay` (14px): modals, popovers, command palette.

**Elevation:**
- `shadow-xs`: controls;
- `shadow-sm`: cards at rest;
- `shadow-md`: hover/raised;
- `shadow-lg`: popovers and modals.

Dark-mode shadows include a subtle top highlight, so cards read as lifted rather than outlined. Prefer elevation to extra borders or color.

**Motion:**
- `transition-colors duration-150` for hover;
- `transition-[box-shadow,transform]` for lift effects;
- never `transition-all`.

Entrance animations are utility classes: `.animate-fade-up` (pages, auth card), `.animate-fade-in` (backdrops) and `.animate-scale-in` (modals, menus). Reduced motion is respected globally.

**Focus:** a global `:focus-visible` ring already exists. Never remove it (`outline-none` without a replacement is forbidden). Every interactive element must be a real `<button>`, `<a>` or `<input>`, or have `role` + `tabIndex={0}` + Enter/Space handling.

## 4. Which component to use

Everything lives in [`src/components/ui/`](src/components/ui/). **If a pattern appears twice, it belongs here.** Never restyle a primitive with `className` overrides of color, size or radius; add a variant instead.

| Need | Use | Never |
|---|---|---|
| Any clickable action | `Button` (`primary` / `secondary` / `ghost` / `danger` / `subtle`, sizes `sm` / `md` / `lg`) | raw `<button>` with custom classes |
| Icon-only action | `IconButton` with required `label` (becomes tooltip + `aria-label`) | an unlabeled icon |
| Text, number or password field | `Input` / `InputGroup` *(planned)* / `SearchInput` *(planned)*, inside `FormField` | raw `<input>` |
| Choice from a list | `Select`; for 2–4 options use `SegmentedControl` *(planned)* | native `<select>` with custom styling |
| On/off setting | `Toggle`; multi-select uses `Checkbox` *(planned)* | unstyled native checkbox |
| Page title area | `PageHeader` (eyebrow, title, description, actions, tabs) | ad-hoc `<h1>` blocks |
| Page-level sections | `Tabs` (underline) | hand-built tab rows |
| View mode toggle (table/grid, dark/light/auto) | `SegmentedControl` *(planned; `LayoutToggle` until then)* | custom pill groups |
| Any list of records | `DataTable` (sortable, sticky header, density, built-in loading/empty/error) | stacked Cards as rows, hand-built `<table>` |
| Browsable collection with visuals | `CollectionGrid` of `Card interactive` | — |
| Container | `Card` (+ `CardHeader` / `CardFooter` *(planned)*) | `div` with border + rounded + bg |
| Settings form layout | `Section` + `SettingsRow` | — |
| Labels, types, statuses | `Badge` with a tone (`neutral` / `accent` / `success` / `warning` / `danger` / `info`) | inline `<span>` pills, hex provider colors |
| Live / connection / health state | `StatusDot` *(planned)* with a text label | bare colored dot |
| KPI numbers | `StatCard` / `StatsGrid` | — |
| Dialog or form overlay | `Modal` (portal, frosted backdrop, Esc, focus trap; header/body/footer) | `fixed inset-0` divs |
| Destructive confirm | `useConfirm()` / `ConfirmDialog` *(planned)* | `window.confirm()` |
| Success / error feedback after an action | `useToast()` *(planned)* | `alert()`, silent `console.error` |
| Inline error or notice | `Alert` (tone, optional retry action) | bare `text-red-*` div |
| Contextual actions menu | `Dropdown` → `Menu` *(planned: portal + keyboard)* | `fixed inset-0` click-catcher menus |
| Hint on hover | `Tooltip` *(planned)* | `title=` only |
| Shortcut hint | `Kbd` *(planned)* | inline styled `<kbd>` |
| Loading | `Skeleton` *(planned; `.skeleton` class until then)* shaped like the real content; `Spinner` only for small inline waits | "Loading…" text |
| Nothing to show | `EmptyState` (icon, title, description, action) | blank areas, plain text |
| Tree navigation row | `TreeItem` *(planned)* | copy-pasted row markup |
| Resizable panes | `ResizeHandle` *(planned)* | mouse-only drag divs |
| Facet / filter with count | `FilterChip` *(planned)* | — |
| Entity / provider icons | `EntityIcon`, `ProviderIcon`, `SourceDot` | hand-built `w-8 h-8 bg-x/10` tiles |
| Global search | `SearchDialog` (Ctrl+K). Results must deep-link to the exact tab or setting | — |

All overlays (modals, menus, popovers, palettes) render with `createPortal(…, document.body)`.

## 5. Page patterns

Every page follows the same skeleton:

```tsx
<div className="px-6 lg:px-10 py-8 max-w-[1440px] mx-auto animate-fade-up">
  <PageHeader eyebrow="WORKSPACE" title="Services" description="…" actions={<Button>…</Button>} />
  {error ? <Alert tone="danger" action={retry}>…</Alert>
   : loading ? <Skeleton … />          // same shape as the loaded content; header always visible
   : items.length === 0 ? <EmptyState … action={<Button>Create…</Button>} />
   : <DataTable … /> /* or CollectionGrid, toggled by SegmentedControl */}
</div>
```

- **Every fetch has three visible states:** loading, error and empty. A failed fetch must never look like "no data".
- **The same kind of data always uses the same pattern** across pages: same columns order, same badge tones, same row actions.
- **Row and card actions are always visible** (muted icon or `⋯` menu), never hover-only.
- **Mutations:**
  - the button shows `loading`;
  - success shows a toast;
  - failure shows an inline `Alert` or toast;
  - deletes go through `useConfirm()`.
- **Settings and admin** use `Tabs`, with `Section` / `SettingsRow` inside. Search deep-links target these tabs.

**Log viewer conventions:**
- a dense mono table: `#`, Time, Level badge, Source, Message;
- a sticky header;
- facet sidebar with counts;
- follow turns itself off on scroll-up, with a "N new lines ↓" pill;
- the connection shown as `StatusDot` + label;
- toolbar icons stay neutral, using accent only when the toggle is active.

## 6. Dark and light are equal citizens

- Design each change in **both** themes. If it only looks right in one, it's not done.
- Status text in light mode uses the deeper `-700`-equivalent tokens automatically, so just use the token.
- Test contrast: body text must reach 4.5:1 on its surface.
- Check this on the theme toggle (Header) for dark, light and auto.

## 7. How to work

- **Build** only with `./build.sh` from the repo root. It type-checks, builds the web app and embeds it into `bin/`. Lint with `npm run lint` in `web/`.
- **Don't run the app locally**; it is reviewed on the remote machine. Large changes are delivered in reviewable phases.
- **Guardrails before every commit** (each should return nothing in `src/**/*.tsx`):
  - `text-\[\d+px\]`: arbitrary text sizes
  - `(text|bg|border)-(red|emerald|green|amber|yellow|blue|sky|rose|cyan|zinc|gray|neutral|slate)-\d`: raw palette
  - `#[0-9a-fA-F]{6}`: hex (logo SVGs excepted)
  - `confirm\(`, `transition-all`, `outline-none` without a focus replacement
- **New UI need:**
  1. Check this table first.
  2. If nothing fits, extend a `ui/` component with a variant, or add a new one.
  3. Then use it, and update this file.
- **Layout gotchas:**
  - `#root` must never get `display:flex` (it breaks the full-width layout).
  - Wordmark sizes are 22px in the sidebar and 18px in the header.
  - The logo is always `AvalokWordmark`. It swaps `avalok-light-mode.png` and `avalok-dark-mode.png` (both 1184×270, transparent, same framing) by theme. Use `onDark` for dark-only surfaces. Never CSS-`invert` the logo: that turns the blue dot orange.
- **When server-facing behavior changes,** also update `docs/content/docs/server/*.md`.
