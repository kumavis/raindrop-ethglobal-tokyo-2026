# @raindrop/paper

The Raindrop whitepaper. `paper.md` is the source of truth; `build.mjs` renders it
into a static site at `dist/` using `template.html` (math is pre-rendered with KaTeX).

```sh
npm run build --workspace paper   # or: npm run build-paper (from repo root)
npm run dev --workspace paper     # rebuild on changes to paper.md / template.html
```

`dist/` is self-contained (KaTeX CSS + fonts are copied in) and can be deployed to any static host.
