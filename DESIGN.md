# DESIGN.md — Impeccable Design System (TSE 2026 Analytical Workbench)

## 1. Visual World & Register
- **Mode:** `Operate` (Forensic Statistical Ledger & Telemetry Workbench)
- **Theme:** Composed Dark Analytical Surface (OKLCH tinted slate-obsidian, engineered for long-session tabular inspection with WCAG AA+ contrast).
- **Signature Move:** **The 17h00 BRT Split-Horizon Telemetry Ledger** — a unified, non-nested architectural matrix that juxtaposes Pre-17h00 vs. Post-17h00 vote share bars alongside a 6-step Closing-Time Cutoff Timeline Rail (`Até 17h02` through `Após 18h00`).

## 2. Typography (`typeset`)
- **Primary UI & Headings:** `'Plus Jakarta Sans'`, sans-serif (`text-wrap: balance` on headings, `-0.02em` tracking on display titles, `400/500/600/700` weights).
- **Tabular Data, Timestamps & Codes:** `'JetBrains Mono'`, monospace with `font-variant-numeric: tabular-nums` enforced across all numeric cells, percentages, and deltas.
- **Role Scale:**
  - Page Title: `1.125rem` (`18px`), weight `700`, tracking `-0.02em`
  - Section Heading: `0.9375rem` (`15px`), weight `700`, tracking `-0.015em` (No eyebrows or kickers above headings)
  - Primary Metric Numeral: `1.5rem` (`24px`), `'JetBrains Mono'`, weight `700`, tracking `-0.03em`
  - Table Header: `0.6875rem` (`11px`), weight `600`, tracking `0.04em`, uppercase
  - Table Cell / Body: `0.8125rem` (`13px`), line-height `1.45`

## 3. Color System (`colorize` — OKLCH Tokens)
- **Surfaces:**
  - `--bg-canvas`: `oklch(0.13 0.014 255)` (`#080b12`)
  - `--bg-surface`: `oklch(0.165 0.016 255)` (`#0e131f`)
  - `--bg-elevated`: `oklch(0.20 0.018 255)` (`#151c2c`)
  - `--bg-interactive-hover`: `oklch(0.23 0.022 255)` (`#1c2539`)
- **Borders & Hairlines (Elevation declared once via 1px border, never ghost-card border+shadow):**
  - `--border-subtle`: `oklch(0.24 0.018 255)` (`#1e2738`)
  - `--border-strong`: `oklch(0.32 0.022 255)` (`#2e3b52`)
- **Typography Colors (Tinted from surface hue, never pure gray):**
  - `--text-primary`: `oklch(0.96 0.008 255)` (`#f1f5f9`)
  - `--text-secondary`: `oklch(0.76 0.020 255)` (`#a8b5c8` — ≥ 7.2:1 contrast)
  - `--text-muted`: `oklch(0.62 0.022 255)` (`#7e8da4` — ≥ 4.6:1 contrast)
- **Semantic Data Series:**
  - `--cand-13` (Lula 13): `oklch(0.65 0.21 18)` (`#f43f5e`) / tint `oklch(0.22 0.06 18)`
  - `--cand-22` (Flávio Bolsonaro 22): `oklch(0.68 0.16 242)` (`#0ea5e9`) / tint `oklch(0.22 0.05 242)`
  - `--post-17h` (Corte Pós-17h00 BRT): `oklch(0.79 0.16 78)` (`#f59e0b`) / tint `oklch(0.22 0.05 78)`
  - `--bio-verified` (100% Biometria): `oklch(0.74 0.16 162)` (`#10b981`) / tint `oklch(0.21 0.05 162)`
  - `--abstention` (Abstenção): `oklch(0.72 0.15 300)` (`#a855f7`)

## 4. Anti-Slop & Craft Floor Rules Enforced
- **Zero Emoji / Unicode Icons:** All icons are crisp inline SVGs (`1.75px` stroke, consistent `16x16` / `18x18` optical sizing).
- **Zero Nested Cards:** Structural hairlines (`1px solid var(--border-subtle)`) divide ledger cells cleanly inside a single parent surface (`border-radius: 12px`).
- **Zero Eyebrow Kickers:** Headings speak directly without redundant uppercase kickers above them.
- **Browser Surfaces Themed:** Custom `::selection`, `:focus-visible` rings, scrollbars, and `tabular-nums` alignment across every table column.
