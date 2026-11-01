# VetDietDerm Design System

Light-theme rules for `apps/clinic-web`, `apps/owner-web`, and shared components in `packages/ui`. The interface is Russian. Clinic work is dense and desk-first. The owner cabinet is touch-first, including Telegram.

This document is the target. Token values in `packages/ui/src/styles.css` still use an earlier teal OKLCH theme. New UI follows the tokens below.

## Principles

- Clinical surfaces stay quiet. Color marks action, selection, and status.
- Body text stays `#172630`. Do not set running text in light gray.
- Primary `#008A75` is a fill and a focus color. It is not a body-text color.
- Touch targets for buttons and fields are 44–48 px. Compact type is allowed inside data tables, not on controls.
- One primary action per view. Secondary actions use the accent surface or a border.

## Color

### Core palette

| Role | Token | Hex | Use |
| --- | --- | --- | --- |
| Text | `--text` | `#172630` | Headings, body, labels, icons on light surfaces |
| Primary | `--primary` | `#008A75` | Primary buttons, links at 16 px semibold, focus ring, selected state |
| Accent | `--accent` | `#E7F4F0` | Selected row, info chip, secondary button fill |
| Background | `--background` | `#F7FAF9` | Page canvas |
| Border | `--border` | `#D5E3DF` | Card, field, and divider edges |
| Surface | `--surface` | `#FFFFFF` | Cards, dialogs, inputs, menus |
| On primary | `--on-primary` | `#FFFFFF` | Label and icon on a primary fill |

Accent text and icons use `--text` (`#172630`). Do not place primary-colored text on the accent fill: that pair is 3.80:1 and fails body-text contrast.

### Status

Status colors sit beside the core palette. They are for alerts, validation, and clinical severity. They do not replace primary.

| Role | Text / icon | Surface | Fill (white label) |
| --- | --- | --- | --- |
| Danger | `#B42318` | `#FDECEC` | `#B42318` |
| Warning | `#7A4E00` | `#FFF6E8` | — |
| Success | `#0F6E45` | `#E7F6EE` | — |

Success confirmation can also use the primary fill. Do not invent a second green for ordinary buttons.

### Contrast

Measured against the page background `#F7FAF9` unless noted.

| Pair | Ratio | Rule |
| --- | --- | --- |
| `#172630` on `#F7FAF9` | 14.74:1 | Default text |
| `#172630` on `#E7F4F0` | 13.71:1 | Text on accent |
| `#172630` on `#FFFFFF` | 15.48:1 | Text on cards and fields |
| `#FFFFFF` on `#008A75` | 4.29:1 | Button label only, 14 px semibold or larger |
| `#008A75` on `#F7FAF9` | 4.09:1 | Focus ring and large semibold labels. Not body text |
| `#B42318` on `#F7FAF9` | 6.26:1 | Error text |
| `#D5E3DF` on `#F7FAF9` | 1.26:1 | Structure only. Never the only state cue |

Placeholder text uses `#172630` at 65% opacity or darker. It must stay at or above 4.5:1. Do not use Tailwind `text-gray-400` or equivalent for labels, hints, or table cells.

Borders separate regions. Focus, error, and selection also change fill, ring, or text.

### Dark theme

Dark mode already ships through `.dark` in `packages/ui/src/styles.css`. This document does not redefine it. New light-theme work must not remove the dark toggle.

## Typography

Font: Geist Sans, then `Arial, Helvetica, sans-serif`. Clinic already loads Geist in `apps/clinic-web/src/app/layout.tsx`. Owner web still falls back to the system stack in `apps/owner-web/src/app/globals.css`.

Numbers in tables, doses, and timers use `font-variant-numeric: tabular-nums`.

| Style | Size | Weight | Line height | Use |
| --- | --- | --- | --- | --- |
| Page title | 24 px | 600 | 32 px | One per screen |
| Section title | 18 px | 600 | 26 px | Card or region heading |
| Body | 16 px | 400 | 24 px | Owner cabinet, forms, clinical narrative |
| UI | 14 px | 400 | 20 px | Clinic tables, dense metadata, button labels |
| Label | 14 px | 600 | 20 px | Field labels |
| Caption | 14 px | 400 | 20 px | Hints under a field. Same color as body text |

Do not go below 14 px for text a person must read. 12 px is limited to non-essential chrome such as a version mark.

## Spacing

Use only this scale: 4, 8, 12, 16, 24, 32 px.

| Token | Value | Typical use |
| --- | --- | --- |
| `space-1` | 4 px | Icon-to-label gap, compact stack |
| `space-2` | 8 px | Related controls, chip padding |
| `space-3` | 12 px | Field inner padding, card header gap |
| `space-4` | 16 px | Default stack, card padding on clinic |
| `space-6` | 24 px | Section gap, card padding on owner |
| `space-8` | 32 px | Page section separation |

Page inset is 16 px on narrow screens and 24 px from 768 px up. Do not invent 6, 10, 20, or 40 px gaps.

## Radius and elevation

| Element | Radius |
| --- | --- |
| Cards, dialogs, sheets | 16 px |
| Buttons, inputs, selects | 12 px |
| Chips and badges | 999 px |
| Focus ring | 3 px offset, 2 px solid `#008A75` |

Cards use a 1 px `#D5E3DF` border on `#FFFFFF`. Shadow is optional and soft: `0 8px 24px -12px rgb(23 38 48 / 12%)`. Do not stack a heavy shadow and a strong border on the same card.

## Components

### Page structure

- Page title: 24 px, semibold, `#172630`, one line when possible.
- Section title: 18 px, semibold, with 24 px space before the section.
- Supporting actions sit on the same row as the title, aligned to the end. Height matches the control rules below.

### Buttons

| | Rule |
| --- | --- |
| Height | 44 px default, 48 px for the main action on a phone screen |
| Label | 14 px, weight 600, on the primary fill |
| Horizontal padding | 16 px, 12 px when the button contains only an icon plus a short label |
| Radius | 12 px |
| Primary | Fill `#008A75`, label `#FFFFFF` |
| Secondary | Fill `#E7F4F0`, label `#172630`, no extra border |
| Quiet | Transparent, label `#172630`, hover fill `#E7F4F0` |
| Danger | Fill `#B42318`, label `#FFFFFF`. One per confirmation dialog |

Icon-only buttons are 44 × 44 px and need an accessible name. Disabled controls drop to 50% opacity and do not change layout.

### Fields

| | Rule |
| --- | --- |
| Height | 44 px minimum, 48 px on the owner cabinet |
| Text | 16 px on touch screens so mobile browsers do not zoom, 14 px allowed on clinic desktop |
| Padding | 12 px horizontal |
| Radius | 12 px |
| Fill | `#FFFFFF` |
| Border | 1 px `#D5E3DF` |
| Label | 14 px semibold above the field, 4 px gap |
| Hint and error | 14 px under the field, 4 px gap. Errors use `#B42318` and stay visible without relying on color alone |

Focus replaces the border with a 2 px `#008A75` ring. Error focus uses `#B42318`. Placeholder text is an example, not the label.

### Cards

- Radius 16 px, padding 16 px on clinic and 24 px on the owner cabinet.
- Title inside a card is a section title (18 px semibold) when the card is a region, or 16 px semibold when it is a list row.
- Nested panels use the accent fill `#E7F4F0` or the page background. They do not add a second shadow.

### Lists and tables

- Row height at least 44 px when the row is clickable.
- Selected row fill is `#E7F4F0`. Text stays `#172630`.
- Dividers use `#D5E3DF`. Zebra striping is unnecessary on this background.

## Motion

Transitions stay at 150–200 ms, ease-out. Use them for hover, focus, dialogs, and disclosure. Do not animate clinical numbers, dosages, or status changes that a clinician must read immediately.

## Implementation map

Shared tokens belong in `packages/ui/src/styles.css` (`:root`). Both apps import that file. Component primitives live in `packages/ui/src` (`button.tsx`, `input.tsx`, and the rest of the set).

Current primitives are shorter than this system: default button and input height is 36 px (`h-9`), large button is 40 px (`h-10`), control radius follows `--radius: 0.75rem` (12 px) while cards are not yet fixed at 16 px. Bring controls up to 44–48 px when touching those components. Do not restyle unrelated screens in the same change.
