# Avalok design system

This is the single source of truth for how the Avalok web UI looks and how to build it. Read it before any frontend change.

**North star:** calm, premium and data-first. Think Northflank's restraint, Kener's identical dark and light themes, Logdy's dense log tables, and Docker Desktop's command palette. Polish comes from **shadow depth, spacing and simplicity**, not from adding colors.

> **Migration status:** the redesign is landing in phases. See the plan in the PR history.
> - Phase 1 (tokens, type, fonts), Phase 2 (component kit) and Phase 3 (app shell, auth, search palette) are **done**.
> - Pages still being migrated to the kit may use old props marked `@deprecated` (`Badge variant`, `Alert variant`, `Modal maxWidth`, `Card hover`, `EmptyState iconBg`, `StatItem accent/bg`). New code uses the replacements listed in the JSDoc.
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

**Status meaning is centralized** in `lib/statusTone.ts`: `statusTone(status)` and `levelTone(level)` return a `Tone`, and `toneText` / `toneSoft` / `toneLine` / `toneDot` turn a tone into classes:

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
| Page container | `<Page>` from `Layout/Page.tsx` (full width, left-aligned, `px-6 lg:px-10 py-8`). Never add `max-w-*` / `mx-auto` to a page |
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
| Any clickable action | `Button`: variants `primary` / `secondary` / `subtle` / `ghost` / `danger` (soft) / `destructive` (solid, final confirm only) / `link`; sizes `sm` 28 / `md` 32 / `lg` 36; `leftIcon`, `rightIcon`, `loading`, `iconOnly` | raw `<button>` with custom classes |
| Icon-only action | `IconButton` with `label` (tooltip + `aria-label`); `active` for toggles; sizes `xs` / `sm` / `md` | an unlabeled icon |
| Text, number or password field | `Input` (`size` `md` 32px default, `lg` 36px for auth) / `InputGroup` (`leading`, `trailing`) / `PasswordInput` (show/hide toggle) / `SearchInput` (clear button, `shortcut` hint), inside `FormField` (`help`, `error`); `invalid` prop for errors | raw `<input>` |
| Choice from a list | `Select`; for 2–4 options use `SegmentedControl` | native `<select>` with custom styling |
| On/off setting | `Toggle` (`role=switch`); multi-select uses `Checkbox`; single choice with descriptions uses `Radio` (both in `Checkbox.tsx`) | unstyled native checkbox |
| Page title area | `PageHeader` (`eyebrow`, `title`, `description`, `actions`, `tabs`) | ad-hoc `<h1>` blocks |
| Page-level sections | `Tabs` (default `underline`; `pill` for compact in-card switching; optional `count`) | hand-built tab rows |
| View mode toggle (table/grid, dark/light/auto) | `SegmentedControl` (icon-only segments need `title`); `LayoutToggle` is a preset of it | custom pill groups |
| Any list of records | `DataTable`: column `sortValue`, `numeric`; props `density`, `loading`, `error` + `onRetry`, `empty`, `stickyHeader`, `isRowSelected`, `onRowClick` (keyboard-accessible) | stacked Cards as rows, hand-built `<table>` |
| Browsable collection with visuals | `CollectionGrid` of `Card` with `onClick` | — |
| Container | `Card` (`padding`, `interactive`, `selected`) + `CardHeader` (`icon`, `title`, `description`, `actions`) / `CardFooter` | `div` with border + rounded + bg |
| Workspace / environment / service / resource in a grid | `EntityCard` (`kind`, `icon`, `badges`, `meta`, `actionLabel`, `onOpen`, `menuItems`, `index` for stagger, `busy`): hover hairline, tile scale, arrow nudge | hand-built entity Cards |
| Settings form layout | `Section` + `SettingsRow` | — |
| Labels, types, statuses | `Badge` with `tone` (`neutral` / `accent` / `success` / `warning` / `danger` / `info`), optional `dot`; providers: neutral tone + `<ProviderIcon>` inside | inline `<span>` pills, hex provider colors |
| Live / connection / health state | `StatusDot` (`live` pings, `ok`, `warn`, `error`, `idle`) with a `label` | bare colored dot |
| KPI numbers | `StatCard` / `StatsGrid` (`tone`, optional `onClick` + `active` to act as a filter) | — |
| Dialog or form overlay | `Modal` (`title`, `description`, `footer`, `size` `sm`/`md`/`lg`/`xl`, `dismissible`); portal, frosted backdrop, Esc, focus trap + restore | `fixed inset-0` divs |
| Destructive confirm | `const confirm = useConfirm(); if (!(await confirm({ title, description, confirmLabel: 'Delete', danger: true }))) return` | `window.confirm()` |
| Success / error feedback after an action | `const toast = useToast(); toast.success('Saved')` / `toast.error(title, detail)` | `alert()`, silent `console.error` |
| Inline error or notice | `Alert` (`tone`, `title`, `action` e.g. Retry button) | bare `text-red-*` div |
| Row / card "⋯" actions | `ActionMenu` (`items`, `label`); stops clicks reaching the clickable row or card | hover-only icon buttons |
| Contextual actions menu | `Dropdown` (`trigger`, `items` with `icon` / `danger` / `shortcut` / `disabled` / `{ separator: true }`, `align`, `header` slot for e.g. the user card); portal + arrow keys / type-ahead | `fixed inset-0` click-catcher menus |
| Hint on hover | `Tooltip` (`content`, `side`) | `title=` only |
| Shortcut hint | `Kbd` | inline styled `<kbd>` |
| Loading | `Skeleton` / `Skeleton.Line` / `.Card` / `.TableRows` shaped like the real content; `Spinner` (centered) or `SpinnerIcon` (inline) only for small waits | "Loading…" text |
| Nothing to show | `EmptyState` (`icon`, `tone`, `title`, `description`, `action`, `compact` inside cards/tables) | blank areas, plain text |
| Tree navigation row | `TreeItem` (`depth`, `expanded` + `onToggle`, `onSelect`, `selected`, `count`, `status`, `actions`) | copy-pasted row markup |
| Resizable panes | `ResizeHandle` (`orientation`, `onResize(delta)`; arrow keys too) | mouse-only drag divs |
| Facet / filter with count | `FilterChip` (`label`, `count`, `active`, `onToggle`, `tone` dot or `leading`) | — |
| Entity / provider icons | `EntityIcon`, `ProviderIcon`, `SourceDot` | hand-built `w-8 h-8 bg-x/10` tiles |
| Global search | `SearchDialog` (Ctrl+K). Results must deep-link to the exact tab or setting | — |

All overlays (modals, menus, popovers, palettes) render with `createPortal(…, document.body)`.

`useConfirm()` and `useToast()` come from `ui/Feedback.tsx`; `<FeedbackProvider>` is mounted once in `main.tsx`.

## 5. Page patterns

Every page follows the same skeleton:

```tsx
<Page>
  <PageHeader eyebrow="WORKSPACE" title="Services" description="…" actions={<Button>…</Button>} />
  {error ? <Alert tone="danger" action={retry}>…</Alert>
   : loading ? <Skeleton … />          // same shape as the loaded content; header always visible
   : items.length === 0 ? <EmptyState … action={<Button>Create…</Button>} />
   : <DataTable … /> /* or CollectionGrid, toggled by SegmentedControl */}
</Page>
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

**App shell** (`components/Layout/`):
- `Header`: 56px, `bg-surface` with a bottom border, wordmark at 18px, breadcrumbs (the last one is `text-fg`), search trigger (`Ctrl K`), theme `SegmentedControl`, and a user `Dropdown`. It stays neutral, never brand-colored.
- `AppSidebar`: 232px wide (56px collapsed), with "Observe" / "Manage" groups. The active item has `bg-selected`, an accent icon and a 2px accent bar. The footer holds `StatusIndicator` (a real `/api/health` poll) and the collapse button.
- `AuthLayout`: the only screens with the `bg-premium` glow. The app shell itself sits on `bg-canvas`.
- `SearchDialog`: the command palette. New pages and settings must be added to its list with a deep-link `data` value (e.g. `admin:settings:<key>`).

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
