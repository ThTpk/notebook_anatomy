// Turns the bundler's output into the page GitHub Pages serves.
//
//   node sims/build.mjs ./notebook     ->  teardown-out/dist/notebook.html
//   node tools/page.mjs                ->  index.html   (the file Pages serves)
//
// The bundler names the page after its folder and writes no social metadata, so this adds the title, the
// description and the link-card tags, and points them at the published site. Nothing else is touched: index.html
// stays the same single self-contained file you can open from disk.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'teardown-out', 'dist', 'notebook.html');
const OUT = path.join(ROOT, 'index.html');

const SITE = 'https://thtpk.github.io/notebook_anatomy/';
const TITLE = 'Notebook · Anatomy';
const DESC =
  'เว็บ 3D แบบ interactive อธิบายโครงสร้างภายในโน้ตบุ๊ก 13.5 นิ้ว — หมุนได้ทุกมุม แยกชิ้นได้ ' +
  'เลือกดูทีละชิ้นได้ และตัวเลขทุกตัวมาจากแบบจำลองความร้อนชุดเดียวกับที่ทำให้พัดลมหมุน.';

if (!fs.existsSync(SRC)) {
  console.error(`no build at ${SRC} — run: node "$HOME/.claude/skills/teardown/sims/build.mjs" ./notebook`);
  process.exit(1);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const META = [
  `<meta name="description" content="${esc(DESC)}">`,
  `<meta name="theme-color" content="#edeef0">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:title" content="${esc(TITLE)}">`,
  `<meta property="og:description" content="${esc(DESC)}">`,
  `<meta property="og:url" content="${SITE}">`,
  `<meta property="og:image" content="${SITE}preview.png">`,
  `<meta property="og:image:width" content="1600">`,
  `<meta property="og:image:height" content="900">`,
  `<meta name="twitter:card" content="summary_large_image">`,
].join('\n');

let html = fs.readFileSync(SRC, 'utf8');
const viewport = /<meta name="viewport"[^>]*>/;
if (!viewport.test(html)) {
  console.error('no viewport meta in the build — the template changed, check build.mjs');
  process.exit(1);
}
html = html.replace(viewport, (m) => `${m}\n${META}`);
html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(TITLE)}</title>`);

fs.writeFileSync(OUT, html);
console.log(`${OUT}  ${(html.length / 1024).toFixed(0)} KB`);
