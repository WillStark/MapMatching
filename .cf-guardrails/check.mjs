#!/usr/bin/env node
// cf-guardrails pre-deploy checker. Single file, Node >= 18, zero dependencies.
// Copy this file into a repo (e.g. .cf-guardrails/check.mjs) and run:
//   node check.mjs [dir ...] [--json] [--strict] [--ignore rule1,rule2]
// Exit code: 0 = ok, 1 = errors (or warnings with --strict), 2 = usage error.
// Docs behind every rule are linked in each finding's `doc` field.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- config parsing ----------

export function parseJsonc(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n ?? ''; i++; } else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  // drop trailing commas (string-aware)
  let res = '';
  inStr = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (inStr) { res += c; if (c === '\\') { res += out[++i] ?? ''; } else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; res += c; continue; }
    if (c === ',') {
      let j = i + 1;
      while (j < out.length && /\s/.test(out[j])) j++;
      if (out[j] === '}' || out[j] === ']') continue;
    }
    res += c;
  }
  return JSON.parse(res);
}

// Minimal TOML parser covering what wrangler.toml uses: tables, arrays of tables,
// dotted/quoted keys, strings, numbers, booleans, (multi-line) arrays, inline tables.
export function parseToml(text) {
  const root = {};
  let current = root;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const stripComment = (s) => {
    let inS = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inS) { if (c === '\\' && inS === '"') { i++; continue; } if (c === inS) inS = null; continue; }
      if (c === '"' || c === "'") { inS = c; continue; }
      if (c === '#') return s.slice(0, i);
    }
    return s;
  };
  const depth = (s) => {
    let d = 0; let inS = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inS) { if (c === '\\' && inS === '"') { i++; continue; } if (c === inS) inS = null; continue; }
      if (c === '"' || c === "'") inS = c;
      else if (c === '[' || c === '{') d++;
      else if (c === ']' || c === '}') d--;
    }
    return d;
  };
  const splitKey = (k) => {
    const parts = []; let buf = ''; let inS = null;
    for (const c of k.trim()) {
      if (inS) { if (c === inS) inS = null; else buf += c; continue; }
      if (c === '"' || c === "'") { inS = c; continue; }
      if (c === '.') { parts.push(buf.trim()); buf = ''; continue; }
      buf += c;
    }
    parts.push(buf.trim());
    return parts;
  };
  const descend = (obj, keys, arrayLast) => {
    let o = obj;
    keys.forEach((k, idx) => {
      const last = idx === keys.length - 1;
      if (last && arrayLast) {
        if (!Array.isArray(o[k])) o[k] = [];
        const t = {}; o[k].push(t); o = t; return;
      }
      if (o[k] === undefined) o[k] = {};
      o = Array.isArray(o[k]) ? o[k][o[k].length - 1] : o[k];
    });
    return o;
  };
  for (let i = 0; i < lines.length; i++) {
    let line = stripComment(lines[i]).trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^\[\[(.+)\]\]$/))) { current = descend(root, splitKey(m[1]), true); continue; }
    if ((m = line.match(/^\[(.+)\]$/))) { current = descend(root, splitKey(m[1]), false); continue; }
    const eq = line.indexOf('=');
    if (eq < 0) throw new Error(`TOML: cannot parse line ${i + 1}: ${lines[i]}`);
    const keys = splitKey(line.slice(0, eq));
    let val = line.slice(eq + 1).trim();
    if (val.startsWith('"""') || val.startsWith("'''")) {
      const q = val.slice(0, 3); let body = val.slice(3);
      while (!body.includes(q) && i + 1 < lines.length) body += '\n' + lines[++i];
      const target = descend(current, keys.slice(0, -1), false);
      target[keys[keys.length - 1]] = body.slice(0, body.indexOf(q)).replace(/^\n/, '');
      continue;
    }
    while (depth(val) > 0 && i + 1 < lines.length) val += ' ' + stripComment(lines[++i]).trim();
    const target = descend(current, keys.slice(0, -1), false);
    target[keys[keys.length - 1]] = parseTomlValue(val);
  }
  return root;
}

function parseTomlValue(src) {
  let i = 0;
  const ws = () => { while (i < src.length && /[\s,]/.test(src[i]) && src[i] !== undefined) i++; };
  const skipSpace = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  function value() {
    skipSpace();
    const c = src[i];
    if (c === '"') {
      i++; let s = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') { const e = src[++i]; s += ({ n: '\n', t: '\t', '"': '"', '\\': '\\', r: '\r' })[e] ?? e; i++; continue; }
        s += src[i++];
      }
      i++; return s;
    }
    if (c === "'") { i++; const j = src.indexOf("'", i); const s = src.slice(i, j); i = j + 1; return s; }
    if (c === '[') {
      i++; const arr = [];
      for (;;) { ws(); if (src[i] === ']') { i++; return arr; } if (i >= src.length) throw new Error('TOML: unterminated array'); arr.push(value()); }
    }
    if (c === '{') {
      i++; const obj = {};
      for (;;) {
        ws(); if (src[i] === '}') { i++; return obj; }
        if (i >= src.length) throw new Error('TOML: unterminated inline table');
        const eq = src.indexOf('=', i);
        const keyRaw = src.slice(i, eq).trim().replace(/^["']|["']$/g, '');
        i = eq + 1; obj[keyRaw] = value();
      }
    }
    const m = src.slice(i).match(/^[^,\]\}\s]+/);
    const tok = m ? m[0] : ''; i += tok.length;
    if (tok === 'true') return true;
    if (tok === 'false') return false;
    const num = Number(tok.replace(/_/g, ''));
    return Number.isNaN(num) ? tok : num;
  }
  return value();
}

export function loadConfig(file) {
  const text = fs.readFileSync(file, 'utf8');
  return file.endsWith('.toml') ? parseToml(text) : parseJsonc(text);
}

// ---------- file discovery ----------

const SKIP_DIRS = new Set(['.cf-guardrails', '.github', 'node_modules', '.git', '.wrangler', '.open-next', 'dist', 'build', '.next', 'out', 'coverage', '.vercel', '.svelte-kit', '.turbo', 'vendor', 'tmp', '.tmp', 'test', 'tests', '__tests__', 'fixtures']);
const CONFIG_NAMES = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'];
const SRC_EXT = /\.(m?[jt]sx?|cjs)$/;

function walk(dir, onFile, skipFixtures = true) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) && !(e.name === 'fixtures' && !skipFixtures)) continue;
      walk(p, onFile, skipFixtures);
    } else onFile(p);
  }
}

export function findConfigs(root) {
  const found = [];
  const visit = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const cfg = CONFIG_NAMES.map((n) => path.join(dir, n)).find((p) => fs.existsSync(p));
    if (cfg) found.push(cfg);
    for (const e of entries) {
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) visit(path.join(dir, e.name));
    }
  };
  if (CONFIG_NAMES.includes(path.basename(root))) return [root];
  visit(root);
  return found;
}

function sourceFiles(projectDir, otherProjectDirs) {
  const files = [];
  walk(projectDir, (f) => {
    if (!SRC_EXT.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || /\.d\.ts$/.test(f)) return;
    if (otherProjectDirs.some((d) => d !== projectDir && f.startsWith(d + path.sep) && d.startsWith(projectDir))) return;
    try { if (fs.statSync(f).size > 1_000_000) return; } catch { return; }
    if (/\.min\.[cm]?js$/.test(f)) return;
    if (/^(mock|fake|stub)[-_.]|[-_.](mock|fake|stub)\.[cm]?[jt]sx?$/i.test(path.basename(f))) return; // local dev doubles
    files.push(f);
  });
  return files;
}

// ---------- rules ----------

const DOC = {
  limits: 'https://developers.cloudflare.com/workers/wrangler/configuration/#limits',
  sampling: 'https://developers.cloudflare.com/workers/observability/logs/workers-logs/',
  cron: 'https://developers.cloudflare.com/workers/configuration/cron-triggers/',
  queues: 'https://developers.cloudflare.com/queues/configuration/batching-retries/',
  dlq: 'https://developers.cloudflare.com/queues/configuration/dead-letter-queues/',
  alarms: 'https://developers.cloudflare.com/durable-objects/api/alarms/',
  kv: 'https://developers.cloudflare.com/kv/platform/pricing/',
  ratelimit: 'https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/',
  assets: 'https://developers.cloudflare.com/workers/static-assets/',
  previews: 'https://developers.cloudflare.com/workers/configuration/previews/',
  pricing: 'https://developers.cloudflare.com/workers/platform/pricing/',
};

function lineOf(text, index) { return text.slice(0, index).split('\n').length; }

function ignoredInline(lines, lineNo, rule) {
  const here = lines[lineNo - 1] || '';
  const prev = lines[lineNo - 2] || '';
  const re = new RegExp(`cf-guardrails-ignore[: ]+[\\w,-]*\\b${rule}\\b`);
  return re.test(here) || re.test(prev);
}

function allEnvs(cfg) {
  const envs = [{ name: null, cfg }];
  for (const [name, e] of Object.entries(cfg.env || {})) envs.push({ name, cfg: e });
  return envs;
}

export function checkProject(configPath, { allProjectDirs = [] } = {}) {
  const findings = [];
  const add = (level, rule, message, extra = {}) => findings.push({ level, rule, message, ...extra });
  let cfg;
  try { cfg = loadConfig(configPath); } catch (e) {
    add('error', 'config-parse', `Could not parse ${path.basename(configPath)}: ${e.message}`);
    return { configPath, name: null, kind: 'unknown', findings };
  }
  const dir = path.dirname(configPath);
  const isPages = 'pages_build_output_dir' in cfg;
  const hasMain = typeof cfg.main === 'string';
  const pagesFunctions = isPages && fs.existsSync(path.join(dir, 'functions'));
  const kind = isPages ? (pagesFunctions ? 'pages+functions' : 'pages-static') : hasMain ? 'worker' : 'assets-only';
  const result = { configPath, name: cfg.name ?? null, kind, findings };

  if (!hasMain && !pagesFunctions) {
    add('info', 'static-only', 'No Worker code (static assets only). Static asset requests are free and unlimited, so these checks do not apply.', { doc: DOC.pricing });
    return result;
  }

  const envs = allEnvs(cfg);
  const inherit = (envCfg, key) => (envCfg[key] !== undefined ? envCfg[key] : cfg[key]);

  // 1. limits (Workers only; Pages Functions do not take a limits block)
  if (hasMain) {
    for (const { name, cfg: e } of envs) {
      const limits = inherit(e, 'limits');
      const where = name ? ` (env.${name})` : '';
      if (!limits || limits.cpu_ms === undefined) {
        add('error', 'limits-cpu', `No limits.cpu_ms${where}. Without it one invocation can burn up to 30 s of CPU by default (max 5 min). Add "limits": { "cpu_ms": 100, "subrequests": 50 } and tune.`, { doc: DOC.limits, file: configPath });
      } else if (limits.subrequests === undefined) {
        add('warn', 'limits-subrequests', `limits.subrequests not set${where}; paid default is 10,000 per invocation. Set the lowest number your code needs (fetch fan-out loops).`, { doc: DOC.limits, file: configPath });
      }
    }
    // 2. log sampling
    for (const { name, cfg: e } of envs) {
      const obs = inherit(e, 'observability');
      if (obs && (obs.enabled === false) && !(obs.logs && obs.logs.enabled)) continue;
      const rate = obs?.head_sampling_rate ?? obs?.logs?.head_sampling_rate;
      if (rate === undefined) {
        add('error', 'log-sampling', `No observability.head_sampling_rate${name ? ` (env.${name})` : ''}. Logs default to 100% of invocations, so a loop multiplies log volume too. Set e.g. 0.1, or observability.enabled=false.`, { doc: DOC.sampling, file: configPath });
      }
    }
  }

  // 3. queues
  for (const { name, cfg: e } of envs) {
    const q = e.queues || (name ? null : null);
    if (!q) continue;
    const where = name ? ` (env.${name})` : '';
    for (const c of q.consumers || []) {
      if (c.type === 'http_pull') continue;
      if (c.max_retries === undefined) add('error', 'queue-max-retries', `Queue consumer "${c.queue}"${where} has no max_retries. Every retry is billed as another read; set an explicit small number (e.g. 3).`, { doc: DOC.queues, file: configPath });
      if (!c.dead_letter_queue) add('error', 'queue-dlq', `Queue consumer "${c.queue}"${where} has no dead_letter_queue. Failing messages are retried then silently dropped; send them to a DLQ you can inspect.`, { doc: DOC.dlq, file: configPath });
    }
    const producers = new Set((q.producers || []).map((p) => p.queue));
    for (const c of q.consumers || []) {
      if (producers.has(c.queue)) add('warn', 'queue-self-loop', `This Worker both produces to and consumes "${c.queue}"${where}. Make sure the consumer can never re-enqueue the message it is processing (the $36k RetainDB loop).`, { doc: DOC.queues, file: configPath });
    }
  }

  // 4. DO bindings in non-production envs
  for (const { name, cfg: e } of envs) {
    if (!name) continue;
    const b = e.durable_objects?.bindings || [];
    if (b.some((x) => !x.script_name)) add('warn', 'do-nonprod-env', `env.${name} binds Durable Objects defined in itself, so every deployed env/preview Worker gets its own DO population (and its own alarms). Strip DO bindings from preview envs or point script_name at a shared Worker.`, { doc: DOC.previews, file: configPath });
  }

  // ---- source-level rules ----
  const files = sourceFiles(dir, allProjectDirs);
  const kvNames = new Set(envs.flatMap(({ cfg: e }) => (e.kv_namespaces || []).map((k) => k.binding)));
  const d1Names = new Set(envs.flatMap(({ cfg: e }) => (e.d1_databases || []).map((k) => k.binding)));
  const hasRatelimits = envs.some(({ cfg: e }) => Array.isArray(e.ratelimits) && e.ratelimits.length);
  const crons = envs.flatMap(({ cfg: e }) => e.triggers?.crons || []);
  const selfServices = envs.flatMap(({ cfg: e }) => (e.services || []).filter((s) => s.service === cfg.name));
  let cursorHint = false;
  const postRoutes = [];
  const rel = (f) => path.relative(dir, f) || f; // paths relative to the project (config) dir

  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split('\n');
    if (text.length / lines.length > 400) continue; // minified/generated bundle
    const at = (idx) => lineOf(text, idx);
    const push = (level, rule, msg, line, doc) => { if (!ignoredInline(lines, line, rule)) add(level, rule, msg, { file: rel(f), line, doc }); };

    if (/\b(cursor|offset|last_?processed|lastProcessed|last_?id|lastId|since|watermark|checkpoint|ON CONFLICT|INSERT OR IGNORE|INSERT OR REPLACE)\b/i.test(text)) cursorHint = true;

    // setAlarm without getAlarm nearby
    for (const m of text.matchAll(/\bsetAlarm\s*\(/g)) {
      const ln = at(m.index);
      const window = lines.slice(Math.max(0, ln - 26), ln + 25).join('\n');
      if (!/\bgetAlarm\s*\(/.test(window)) push('warn', 'do-alarm-guard', 'setAlarm() with no getAlarm() check nearby. Re-arming on every wake/start is the $34k DO alarm loop; check getAlarm() first and stop with ctx.abort({ retryAlarm: false }) or by not re-arming.', ln, DOC.alarms);
    }

    // kv.list in request paths
    const kvRe = new RegExp(`\\b(?:${[...kvNames, 'kv', 'KV'].map((s) => s.replace(/[$]/g, '\\$')).join('|')})\\s*\\.list\\s*\\(`, 'g');
    for (const m of text.matchAll(kvRe)) push('warn', 'kv-list-hot-path', 'KV list() call. List operations are billed like writes ($5/M on paid); keep them off per-request paths (use a direct key or an index key).', at(m.index), DOC.kv);

    // rate limiter implemented with KV/D1 writes
    const kvPut = new RegExp(`\\b(?:${[...kvNames, 'kv', 'KV'].join('|')})\\s*\\.put\\s*\\(|\\.put\\([^)]*expirationTtl`);
    const d1Write = /\b(INSERT|UPDATE|REPLACE)\b[\s\S]{0,200}?rate|rate[\s\S]{0,120}?\b(INSERT|UPDATE|REPLACE)\b/i;
    const reported = new Set();
    for (const m of text.matchAll(/rate[_ -]?limit|ratelimit|\brl[:_]|throttl/gi)) {
      const ln = at(m.index);
      if ([...reported].some((r) => Math.abs(r - ln) < 30)) continue;
      const win = lines.slice(Math.max(0, ln - 15), ln + 15).join('\n');
      if (kvPut.test(win) || d1Write.test(win)) {
        reported.add(ln);
        push('error', 'ratelimit-storage-write', 'Rate limiter appears to count requests with KV/D1 writes. That bills a write per request ($5/M KV, $1/M D1 rows) and is bypassed by many IPs. Use the Workers Rate Limiting binding (and a WAF rate-limiting rule) instead.', ln, DOC.ratelimit);
      }
    }

    // public POST handlers
    for (const m of text.matchAll(/method\s*===?\s*['"]POST['"]|['"]POST['"]\s*===?\s*[\w.]*method|\.post\s*\(\s*['"`/]|export\s+(?:async\s+)?(?:function|const)\s+POST\b|onRequestPost\b/g)) {
      postRoutes.push(`${rel(f)}:${at(m.index)}`);
    }

    // Worker-rendered static HTML
    if (/text\/html/i.test(text)) {
      const m = text.match(/<!DOCTYPE html|<html[\s>]/i);
      if (m) push('warn', 'worker-html', 'Worker builds full HTML pages in code. Every page view is a billable Worker request; static pages served from assets are free and unlimited. Move static pages to the assets directory.', at(m.index), DOC.assets);
    }

    // self-fetch
    for (const m of text.matchAll(/fetch\s*\(\s*(?:request|req)\.url\b|fetch\s*\(\s*new\s+Request\s*\(\s*(?:request|req)\.url/g)) {
      push('warn', 'self-fetch', 'Worker fetches its own request URL. If this can route back into the same Worker it is an infinite loop; use a service binding or call the function directly.', at(m.index), DOC.pricing);
    }
  }

  if (crons.length && !cursorHint) add('warn', 'cron-cursor', `Cron Trigger(s) ${crons.join(', ')} but no cursor/checkpoint/ON CONFLICT pattern found in source. A cron that restarts from the same batch every tick rewrote 4.8B D1 rows ($4,868). Persist progress and make writes idempotent.`, { doc: DOC.cron, file: configPath });
  if (postRoutes.length && !hasRatelimits) add('warn', 'public-post-no-ratelimit', `Public write handler(s) found but no "ratelimits" binding: ${postRoutes.slice(0, 6).join(', ')}${postRoutes.length > 6 ? ', …' : ''}. Add a Rate Limiting binding to every public write endpoint.`, { doc: DOC.ratelimit, file: configPath });
  for (const s of selfServices) add('warn', 'self-service-binding', `Service binding "${s.binding}" points at this Worker itself. Fine for OpenNext's cache, but any code path that calls it unconditionally recurses (each hop is billed).`, { doc: 'https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/', file: configPath });
  void d1Names;
  return result;
}

// ---------- CLI ----------

export function run(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const strict = args.includes('--strict');
  const ii = args.indexOf('--ignore');
  const ignore = new Set(ii >= 0 ? (args[ii + 1] || '').split(',').filter(Boolean) : []);
  const dirs = args.filter((a, idx) => !a.startsWith('--') && !(ii >= 0 && idx === ii + 1));
  if (!dirs.length) dirs.push('.');
  const missing = dirs.filter((d) => !fs.existsSync(d));
  if (missing.length) { console.error(`Not found: ${missing.join(', ')}`); return 2; }
  const configs = dirs.flatMap((d) => findConfigs(path.resolve(d)));
  const projectDirs = configs.map((c) => path.dirname(c));
  const projects = configs.map((c) => checkProject(c, { allProjectDirs: projectDirs }));
  for (const p of projects) p.findings = p.findings.filter((f) => !ignore.has(f.rule));
  const errors = projects.reduce((n, p) => n + p.findings.filter((f) => f.level === 'error').length, 0);
  const warns = projects.reduce((n, p) => n + p.findings.filter((f) => f.level === 'warn').length, 0);
  const failed = errors > 0 || (strict && warns > 0);
  if (json) {
    process.stdout.write(JSON.stringify({ ok: !failed, errors, warnings: warns, projects }, null, 2) + '\n');
  } else {
    if (!configs.length) console.log('No wrangler.toml / wrangler.json / wrangler.jsonc found.');
    for (const p of projects) {
      console.log(`\n${path.relative(process.cwd(), p.configPath) || p.configPath}  [${p.kind}${p.name ? `, ${p.name}` : ''}]`);
      if (!p.findings.length) console.log('  ✓ no findings');
      for (const f of p.findings) {
        const tag = f.level === 'error' ? 'ERROR' : f.level === 'warn' ? 'warn ' : 'info ';
        const loc = f.line ? ` (${f.file}:${f.line})` : '';
        console.log(`  ${tag} ${f.rule}${loc}\n        ${f.message}${f.doc ? `\n        ${f.doc}` : ''}`);
      }
    }
    console.log(`\n${errors} error(s), ${warns} warning(s)${failed ? ' — FAILED' : ''}`);
  }
  return failed ? 1 : 0;
}

// Resolve symlinks on both sides: vendored or skill copies are often symlinked, and a plain path
// comparison would silently skip the check and exit 0.
function isMain() {
  if (!process.argv[1]) return false;
  try { return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1])); }
  catch { return false; }
}

if (isMain()) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node check.mjs [dir ...] [--json] [--strict] [--ignore rule1,rule2]\nExit code: 0 = ok, 1 = errors (or warnings with --strict), 2 = directory not found.');
  } else {
    process.exitCode = run(process.argv);
  }
}
