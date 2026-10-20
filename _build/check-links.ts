// Checks every relative link between the site's pages: the target page must exist, and an #anchor must be a heading
// id on it, computed the way build.ts computes them. Also reports duplicate heading ids on a page. Exits 1 on a problem.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

const site = join(import.meta.dir, "..");
const headingId = (text: string) => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;|&#\d+;/g, "").replace(/[^\w\- ]/g, "").trim().replace(/ /g, "-");

const pages: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name.startsWith("_") || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name === "README.md" && dir !== site) pages.push(path);
  }
};
walk(site);

const ids = new Map<string, Set<string>>();
const problems: string[] = [];
for (const page of pages) {
  const md = readFileSync(page, "utf8").replace(/```[\s\S]*?```/g, "");
  const seen = new Set<string>();
  for (const m of md.matchAll(/^#{1,6} (.+)$/gm)) {
    // marked hands the renderer the heading's text with inline markdown; links keep only their label.
    const id = headingId(m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
    if (seen.has(id)) problems.push(`${relative(site, page)}: duplicate heading id #${id}`);
    seen.add(id);
  }
  ids.set(dirname(page), seen);
}

let links = 0;
for (const page of pages) {
  const md = readFileSync(page, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1];
    if (/^[a-z]+:/.test(href)) continue;
    links++;
    const [path, anchor] = href.split("#");
    const dir = path ? normalize(join(dirname(page), path.replace(/README\.md$/, ""))).replace(/\/$/, "") : dirname(page);
    const where = `${relative(site, page)} → ${href}`;
    if (!existsSync(join(dir, "README.md"))) problems.push(`${where}: no such page`);
    else if (anchor && !ids.get(dir)?.has(anchor)) problems.push(`${where}: no heading #${anchor}`);
  }
}

console.log(`${pages.length} pages, ${links} relative links, ${problems.length} problems`);
for (const p of problems) console.log(`  ${p}`);
if (problems.length) process.exit(1);
