# Design assets

Brand assets for Raindrop. Every asset ships as an SVG (use this by default) and an `@2x` PNG (for slides, social posts, and anywhere SVG isn't supported). Sizes and paths are also recorded under `components` in [`../tokens.json`](../tokens.json).

## Logos — `logo/`

| File | Variant |
|---|---|
| `logo-dark.svg` | Dark |
| `logo-ink.svg` | Ink |
| `logo-rose.svg` | Rose |
| `logo-white.svg` | White |

## Backgrounds — `backgrounds/`

| File | Size | CSS |
|---|---|---|
| `cloud-background.png` / `@2x` | 1920×1080 / 3840×2160 | `.bg-cloud` in [`../tokens/backgrounds.css`](../tokens/backgrounds.css) |

The other backgrounds (solid, gradient, frosted) are pure CSS in `backgrounds.css`.

## Glass components — `components/`

Buttons, tags, cards and motifs in the frosted-glass style. The CSS equivalents of the effect (`.glass-frosted`, `.glass-matte`, `.glass-iridescent-border`) are in [`../tokens/glass.css`](../tokens/glass.css).

| Component | File | Body size | Export canvas | Role |
|---|---|---|---|---|
| Glass pill button, primary | `glass-pill-button-primary.svg` | 126×54 | 198×126 | Primary CTA |
| Glass pill button, secondary | `glass-pill-button-secondary.svg` | 150×54 | 222×126 | Secondary CTA |
| Glass pill tag | `glass-pill-tag.svg` | 98×37 | 142×81 | Tags, badges, labels |
| Glass card | `glass-card.svg` | 360×123 | 432×195 | Content cards |
| Glass circle, trust halo | `glass-circle-trust-halo.svg` | 160×160 | 232×232 | Trust / endorsement motif |
| Glass circle, token | `glass-circle-token.svg` | 56×56 | 98×98 | Token motif |
| Cloud icon | `cloud-icon.svg` | 220×140 | 220×140 | Cloud motif |
| Cloud icon, outline | `cloud-icon-outline.svg` | 231×154 | 231×154 | Cloud motif, line variant |

**Usage notes**

- **Export canvas includes the glow.** The glass exports are padded (36px each side; 21–22px for the token) so the outer glow isn't clipped. Position by the body size, not the canvas: centre the SVG on the element, or offset it by the padding.
- **No label text is baked in.** Buttons, tags and cards are blank shapes. Put the label in code over the SVG, using the `button` or `body-small` typography tokens.
