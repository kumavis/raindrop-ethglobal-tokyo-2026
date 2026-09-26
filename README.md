# Raindrop

**Fund the mission. Let the graph find the people.**

Raindrop is a continuous airdrop steered by trust. Token holders endorse the people they believe are moving a mission forward, and every round newly issued tokens "rain" across the network according to trust scores computed from those endorsements with [EigenTrust](https://nlp.stanford.edu/pubs/eigentrust.pdf). Endorsers keep their coins, endorsements persist until changed, and anyone can spin up a Raindrop network around a cause.

**Read the whitepaper and watch the explainer at [raindrop.money](https://raindrop.money/).**

Built for ETHGlobal Tokyo 2026.

## What's here

| Path | Contents |
|---|---|
| [`paper/paper.md`](paper/paper.md) | The whitepaper, *Raindrop: Funding the mission through the social graph* |
| [`paper/adversarial-review.md`](paper/adversarial-review.md) | An adversarial review: how the mechanism could fail or be exploited |
| [`paper/stablecoin-variant.md`](paper/stablecoin-variant.md) | Design note on funding the rain from stablecoin yield instead of issuance |
| [`paper/`](paper/README.md) | Static-site renderer for the paper (Markdown + KaTeX → `paper/dist/`) |
| [`videos/`](videos/README.md) | Explainer films as self-contained HTML animations, rendered to 1080p MP4 |
| [`.github/workflows/paper-pages.yml`](.github/workflows/paper-pages.yml) | Renders the film and deploys the paper site to [raindrop.money](https://raindrop.money/) (GitHub Pages) on push to `main` |

There are two explainer films: a **mission-first** cut (~95 s) and a **protocol-first** cut (~131 s). The protocol-first film is embedded at the top of the paper site. To preview either film, open its `videos/src/<film>/video.html` in a browser.

## Getting started

Requirements:

- **Node.js** ≥ 18
- **ffmpeg** with `libx264` on your `PATH`, for rendering videos and the paper's poster frame. Install it with `brew install ffmpeg`, `apt install ffmpeg`, or `choco install ffmpeg` / `winget install ffmpeg` on Windows.

From the repo root:

```bash
npm install            # installs both workspaces and downloads Playwright's Chromium
npm run render-videos  # renders both films to videos/dist/<film>/video.mp4
npm run build-paper    # builds the paper site into paper/dist/, embedding the film if rendered
npm run dev-paper      # dev server at http://localhost:4173 with live reload
```

The tooling runs on macOS, Linux and Windows. See [`videos/README.md`](videos/README.md) for render options, such as rendering only the first few seconds for a quick check, and [`paper/README.md`](paper/README.md) for build and preview details.

If you only need the paper, `npm install --workspace paper --ignore-scripts` skips the Chromium download.

## Status

Raindrop is an early design, not a deployed protocol. The paper's *Limitations and open problems* section, the adversarial review and the stablecoin design note describe the main unsolved issues: the opportunity cost of endorsing, bribery, borrowed influence, trust sinks and verifiable computation. Feedback and critique are welcome.
