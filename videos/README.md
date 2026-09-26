# @raindrop/videos

Raindrop explainer films, authored as self-contained HTML animations and rendered to 1080p MP4.

- `src/mission-first/video.html` — mission-led cut (~95s)
- `src/protocol-first/video.html` — protocol-led cut (~131s), built on the [design system](../design-system/assets/README.md)

Open any `video.html` in a browser to preview it live.

The protocol-first film loads the design system straight from `../design-system/`: the token CSS
(palette, Cormorant + Albert Sans, glass, backgrounds, progress bar) and the brand assets (the raindrop
icon and token as rain and value particles, the cloud background and motif, the Sybil split). Keep the
repo layout intact when previewing or rendering it.

## System dependencies

These are not installed by npm and must be on your machine:

- **Node.js** ≥ 18
- **ffmpeg** with `libx264`, on your `PATH` (`brew install ffmpeg` / `apt install ffmpeg`)
- **Network access** to Google Fonts at render time (or set `BLOCK_FONTS=1` to use locally installed fonts: Poppins / IBM Plex Mono for mission-first, Cormorant / Albert Sans for protocol-first)

Playwright's Chromium is downloaded automatically by this package's `postinstall`.
On Linux you may also need its OS libraries: `npx playwright install-deps chromium`.

## Usage

From the repo root:

```bash
npm install
npm run render-videos          # renders both films
```

Or from this directory:

```bash
npm run render:mission-first
npm run render:protocol-first
```

Output lands in `dist/<film>/video.mp4` (gitignored). To render an arbitrary file:

```bash
node render-videos.mjs path/to/film.html   # writes film.mp4 next to the source
```

### Options (environment variables)

| Var           | Default        | Meaning                                         |
| ------------- | -------------- | ----------------------------------------------- |
| `DURATION`    | `DUR` in HTML  | Render only the first N seconds (quick checks)  |
| `FPS`         | `30`           | Frame rate (films are timed for 30)             |
| `CRF`         | `18`           | x264 quality — lower is better/bigger           |
| `PRESET`      | `medium`       | x264 preset                                     |
| `BLOCK_FONTS` | unset          | `1` skips Google Fonts, uses local fonts        |
| `OUT_DIR`     | source dir     | Where MP4s are written                          |

Example quick preview:

```bash
DURATION=5 npm run render:mission-first                          # macOS / Linux
$env:DURATION=5; npm run render:mission-first                    # Windows PowerShell
set DURATION=5 && npm run render:mission-first                   # Windows cmd
```

In PowerShell, `$env:` variables persist for the rest of the session; clear with `Remove-Item Env:DURATION`.

## How it works

The script loads each page in headless Chromium, replaces `requestAnimationFrame` with a
virtual clock, steps it one frame at a time, screenshots each frame, and pipes the JPEGs
into ffmpeg. Rendering is deterministic and independent of machine speed. Films must drive
all animation from `requestAnimationFrame` timestamps and declare `const DUR=<seconds>`.
