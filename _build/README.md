# Building the site

Each ADR's text lives in `<slug>/README.md`; its diagram, if any, in `_build/diagrams/<slug>.svg`, placed where the README has `<!-- DIAGRAM -->`. The build writes `<slug>/index.html`, the home page and the root README.

```bash
cd _build && bun install && bun build.ts
```

To add an ADR: write `<slug>/README.md`, add a diagram if it needs one, add an entry to `docs` in `build.ts`, build, commit everything.
