# Design reference

The designer's spec sheets and labelled examples. **These are the source of truth for how components should look and behave.** Build the CSS/HTML versions from them. They aren't production assets: use the files in [`../assets/`](../assets/README.md) for that.

## Labelled examples — `examples/`

Rendered components with real labels, showing text placement and styling.

| File | Shows |
|---|---|
| `glass-button-endorse@2x.png` | Primary glass button with the label "Endorse" (white; rendered in Cormorant, now Manrope, the `button` preset) |
| `glass-tag-ai-safety@2x.png` | Glass tag with the label "AI Safety" (Albert Sans, ink, on mint fill) |
| `glass-card-title-body@2x.png` | Glass card with a title (ink; rendered in Cormorant, now Manrope) and body text (Albert Sans) |
| `progress-bar.svg` | **Visual reference for every progress bar.** Shown on a dark panel (SVG only) |

### Progress bar values (from `progress-bar.svg`)

| Part | Value |
|---|---|
| Track | Full width, 6px tall, 3px radius, white at 15% opacity |
| Fill | 6px tall, 3px radius, rose `#E8B5C7` (`--color-rose`) |
| Glow on fill | Rose at 40% opacity, 8px blur (SVG stdDeviation 4), 1px spread, no offset |
| Position | Near the bottom of the frame (34px clear below it in the 180px example) |

Built as `.progress-bar` in [`../tokens/progress.css`](../tokens/progress.css). **Rose is the default.** On light backgrounds it switches to **ink** (track: ink at 15%, no glow). This happens automatically inside the light `.bg-*` classes, or you can add `.progress-bar--on-light`. This replaces the spec sheet's paper/ink rule.

## Spec sheets — `spec-sheets/`

The spec text below is copied from each sheet.

### Glass UI (buttons, cards, tags)

| Sheet | Spec | Asset | CSS |
|---|---|---|---|
| `glass-button@2x.png` | Frosted pill button with rain-tinted fill, iridescent border, white text. Primary and secondary variants available. | `glass-pill-button-primary.svg`, `-secondary.svg` | Not built yet (`.glass-frosted` + `.glass-iridescent-border` are the ingredients) |
| `glass-card@2x.png` | Stadium-shaped frosted container with title and body text. Background blur, layered glows, rose-tinted ambient shadow. | `glass-card.svg` | Not built yet |
| `glass-tag@2x.png` | Compact pill tag with mint-tinted glass fill. Used for category labels, mission tags, and metadata chips. | `glass-pill-tag.svg` | Not built yet |

### Motifs

| Sheet | Spec | Asset |
|---|---|---|
| `raindrop@2x.png` | The core symbol. Rain falls on endorsed contributors every round. Used as particle effects across all network and funding beats. | ⭐ `logo/raindrop-icon.svg` (core icon) |
| `cloud@2x.png` | Hand-drawn cloud motif. Filled and outline variants. Scattered as background pattern or standalone icon. | `cloud-icon.svg`, `cloud-icon-outline.svg` |
| `network-node@2x.png` | A person in the trust graph. Glass-treated circle with iridescent border and ambient glow. Label shows identity. | `network-node@2x.png` (PNG only, label baked in) |
| `trust-halo@2x.png` | Frosted glass circle with iridescent rose-threaded border, inner ring, and glowing center. Background blur + layered shadows. | `glass-circle-trust-halo/` (light + dark) |
| `token@2x.png` | Compact glass circle with mint tint. Iridescent border, background blur. Used for value transfer animations. | ⭐ `glass-circle-token.svg` (core icon) |
| `ripple@2x.png` | Expanding concentric rings. Appears on rain impact and network propagation events. Fades out as it expands. | `ripple.svg` |
| `trust-edge@2x.png` | Directed connection between nodes. Arrow shows endorsement direction. Width scales with weight. Particles flow along path. | None (build in code) |
| `sybil-split@2x.png` | Single large circle splitting into many small ones. Visualizes the futility of creating fake accounts to game the system. | `sybil-split.svg`, use wherever Sybil attacks or Sybil resistance come up |
| `progress-bar@2x.png` | Full-width bar at the bottom of every frame. Shows playback position. Uses paper/ink color depending on background. | `.progress-bar` in `tokens/progress.css`. Visual reference: `examples/progress-bar.svg` |
