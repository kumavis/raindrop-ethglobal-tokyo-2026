# @raindrop/paper

The Raindrop whitepaper. `paper.md` is the source of truth; `build.mjs` renders it
into a static site at `dist/` using `template.html` (math is pre-rendered with KaTeX).

```sh
npm run build --workspace paper     # production build into dist/ (or: npm run build-paper)
npm run dev --workspace paper       # dev server at http://localhost:4173 with live reload (or: npm run dev-paper)
npm run preview --workspace paper   # build, then serve dist/ exactly as it will be deployed
```

Use the dev server rather than opening `dist/index.html` directly or `python -m http.server`:
it supports the HTTP Range requests browsers need to play and seek MP4 (Safari won't play
without them). In dev the video isn't copied; the page loads it from `media/`, which the
server maps onto `videos/dist/protocol-first/`, so a fresh render shows up on reload.
Set `PORT` to change the port.

The protocol-first film is embedded above the abstract when it has been rendered
(`npm run render:protocol-first --workspace videos`, needs ffmpeg). The production build copies
`videos/dist/protocol-first/video.mp4` into `dist/` and extracts a poster frame at 5s
(override with `VIDEO=path` / `POSTER_AT=seconds`). Without a render, the page builds
without the video. In CI the render is cached and only redone when the film's source changes.

The page is styled with the Raindrop design system: `build.mjs` copies the token CSS and the assets it
uses (listed in `DS_FILES`) from `../design-system/` into `dist/ds/`.

`dist/` is self-contained (KaTeX CSS + fonts are copied in) and can be deployed to any static host.
