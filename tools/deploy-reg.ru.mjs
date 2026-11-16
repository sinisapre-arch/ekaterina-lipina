/**
 * Builds and uploads the public site to reg.ru shared hosting.
 *
 * Why this exists
 * ---------------
 * reg.ru's nginx puts `Cache-Control: max-age=3888000` (45 days) on every
 * static file, and that header wins over the Cache-Control rules in .htaccess
 * (nginx rewrites the upstream header). So a visitor who saw the site before
 * the last deploy keeps the old JS, CSS, images and fonts for weeks.
 *
 * The fix is to never serve a static file under a stable URL. This build
 * rewrites every local reference (HTML href/src/srcset, CSS url(), JS asset
 * paths) to carry `?v=<sha1 of the file>`. Change a file and its URL changes,
 * so every visitor fetches the new bytes; unchanged files keep their URL and
 * stay cached.
 *
 * Usage
 * -----
 *   $env:REGRU_PASS = '<ftp password>'
 *   node tools/deploy-reg.ru.mjs            # build + upload
 *   node tools/deploy-reg.ru.mjs --dry      # build + report, no upload
 *
 * The password is read from the environment so it never lands in this file,
 * in the repository or in the shell history.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.deploy-build');

const HOST = process.env.REGRU_HOST || 'server16.hosting.reg.ru';
const USER = process.env.REGRU_USER || 'u3712559';
const REMOTE_DIR = process.env.REGRU_DIR || '/www/esya-artist.ru';
const DRY = process.argv.includes('--dry');

/* Source photography and the 5 MB cutouts stay off the server. */
const ROOT_FILES = ['index.html', 'portfolio.html', 'favicon.svg', '.htaccess'];
const ASSET_DIRS = ['assets/css', 'assets/fonts', 'assets/js', 'assets/video'];
const IMG_SKIP = new Set(['stand-light-cutout.png', 'seated-light-cutout.png']);
const TEXT_EXT = new Set(['.html', '.css', '.js']);

function walk(dir, rel = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), childRel));
    else out.push(childRel);
  }
  return out;
}

/* ---------- collect the deployable file set ---------- */
const files = [];
for (const f of ROOT_FILES) {
  if (fs.existsSync(path.join(ROOT, f))) files.push(f);
}
for (const d of ASSET_DIRS) {
  for (const rel of walk(path.join(ROOT, d), d)) files.push(rel);
}
for (const rel of walk(path.join(ROOT, 'assets/img'), 'assets/img')) {
  if (rel.split('/').length > 3) continue;            // no subfolders (source photography)
  if (IMG_SKIP.has(path.basename(rel))) continue;
  files.push(rel);
}

const unique = [...new Set(files)];

/* ---------- content hash per file ---------- */
const hashOf = new Map();
for (const rel of unique) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  hashOf.set(rel, createHash('sha1').update(buf).digest('hex').slice(0, 8));
}

/* ---------- copy + rewrite ---------- */
fs.rmSync(OUT, { recursive: true, force: true });

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let rewritten = 0;
for (const rel of unique) {
  const src = path.join(ROOT, rel);
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (!TEXT_EXT.has(path.extname(rel))) {
    fs.copyFileSync(src, dest);
    continue;
  }

  let text = fs.readFileSync(src, 'utf8');
  const dir = path.dirname(rel);
  const isCss = path.extname(rel) === '.css';

  /* Every other asset, addressed the way this file addresses it:
     CSS resolves url() against its own folder, HTML and JS against the
     page root. */
  for (const [other, hash] of hashOf) {
    if (other === rel) continue;
    const alias = isCss
      ? path.relative(dir, other).split(path.sep).join('/')
      : other;
    /* Match only whole references, so "img/x.webp" cannot hijack
       "assets/img/x.webp". */
    const re = new RegExp(`(?<![A-Za-z0-9_./-])${escapeRe(alias)}(?![A-Za-z0-9_./-])`, 'g');
    const hits = text.match(re);
    if (hits) rewritten += hits.length;
    text = text.replace(re, `${alias}?v=${hash}`);

    /* Root-level files are also reachable as "/favicon.svg". */
    if (!isCss && !other.includes('/')) {
      const abs = `/${other}`;
      const reAbs = new RegExp(`(?<![A-Za-z0-9_./-])${escapeRe(abs)}(?![A-Za-z0-9_./-])`, 'g');
      const hitsAbs = text.match(reAbs);
      if (hitsAbs) rewritten += hitsAbs.length;
      text = text.replace(reAbs, `${abs}?v=${hash}`);
    }
  }

  fs.writeFileSync(dest, text, 'utf8');
}

/* ---------- report ---------- */
const total = unique.reduce((n, rel) => n + fs.statSync(path.join(OUT, rel)).size, 0);
console.log(`build files: ${unique.length}`);
console.log(`build size:  ${(total / 1048576).toFixed(2)} MB`);
console.log(`references rewritten: ${rewritten}`);
console.log(`sample versioned url:  assets/js/site.js?v=${hashOf.get('assets/js/site.js')}`);

if (DRY) {
  console.log('\n--dry run: nothing uploaded');
  process.exit(0);
}

/* ---------- upload ---------- */
const pass = process.env.REGRU_PASS;
if (!pass) {
  console.error('REGRU_PASS is not set in the environment.');
  process.exit(1);
}

let ok = 0;
const failed = [];
for (const rel of unique) {
  const url = `ftp://${HOST}${REMOTE_DIR}/${rel}`;
  try {
    execFileSync('curl.exe', [
      '--silent', '--show-error', '--fail', '--ftp-create-dirs',
      '--user', `${USER}:${pass}`,
      '--upload-file', path.join(OUT, rel),
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    ok++;
  } catch (err) {
    failed.push(rel);
    console.error(`FAILED ${rel}`);
  }
}

console.log(`\nuploaded: ${ok}`);
console.log(`failed:   ${failed.length}`);
if (failed.length) {
  failed.forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}
