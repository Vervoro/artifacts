# Building the site

Each ADR's text lives in `<slug>/README.md`; its diagram, if any, in `_build/diagrams/<slug>.svg`, placed where the README has `<!-- DIAGRAM -->`. Further diagrams on a page are named: `<!-- DIAGRAM:name -->` reads `_build/diagrams/<slug>/name.svg`. The build writes `<slug>/index.html`, the home page and the root README.

```bash
cd _build && bun install && bun build.ts
```

To add an ADR: write `<slug>/README.md`, add a diagram if it needs one, add an entry to `docs` in `build.ts`, build, commit everything. A record's SPEC lives at `<slug>/spec/README.md` and its procedures at `runbooks/<procedure>/README.md`; each gets a `docs` entry with `partOf`, and the record's entry lists them in `links`.

Before committing, check every link between pages (target page and `#anchor`):

```bash
cd _build && bun check-links.ts
```

## Checking that the records agree

The link check only finds broken links. To find records that disagree, run the read-only `consistency-reviewer` agent (`.claude/agents/consistency-reviewer.md`) on demand: after a batch of record changes, before a record is Accepted, or when two records look like they disagree. Give it a commit range, or "all". It reports each disagreement with the owning record and the smallest fix; the owner approves any fix before it is pushed.
