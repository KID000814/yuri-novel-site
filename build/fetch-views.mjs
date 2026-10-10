#!/usr/bin/env node
/**
 * 抓取全部书籍的浏览量 → views.json
 * 说明: 浏览量用 abacus 免费计数服务 (https://abacus.jasoncameron.dev)，按书名 ID 分别计数。
 *       它不支持批量读取，所以只能顺序抓取 —— 书多时较慢，建议偶尔跑一次。
 * 用法: node build/fetch-views.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'manifest.json');
const OUT = path.join(ROOT, 'views.json');
const NS = process.env.ABACUS_NS || 'yuri-novel-views';   // 与 app.js 里的 ABACUS_NS 保持一致
const DELAY = Number(process.env.DELAY_MS || 1300);       // 每次请求间隔(ms)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const books = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let views = {};
try { views = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (_) {}

const todo = books.filter((b) => views[b.i] == null);
console.log(`共 ${books.length} 本, 待抓取 ${todo.length} 本 (约 ${Math.round((todo.length * DELAY) / 60000)} 分钟)`);
let done = 0;
for (const b of todo) {
  let ok = false;
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    try {
      const r = await fetch(`https://abacus.jasoncameron.dev/get/${NS}/${encodeURIComponent(b.i)}`, { signal: AbortSignal.timeout(12000) });
      if (r.status === 404) { views[b.i] = 0; ok = true; }
      else if (r.ok) { const j = await r.json(); if (typeof j.value === 'number') { views[b.i] = j.value; ok = true; } }
      else if (r.status === 429) await sleep(6000);
      else { views[b.i] = 0; ok = true; }
    } catch (_) { await sleep(3000); }
  }
  if (!ok) views[b.i] = 0;
  done++;
  if (done % 100 === 0) { fs.writeFileSync(OUT, JSON.stringify(views)); console.log(`  进度 ${done}/${todo.length}`); }
  await sleep(DELAY);
}
fs.writeFileSync(OUT, JSON.stringify(views));
console.log(`✅ 完成: ${Object.keys(views).length} 本, 其中有浏览量的 ${Object.values(views).filter((v) => v > 0).length} 本`);
