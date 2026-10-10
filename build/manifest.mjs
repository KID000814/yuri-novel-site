#!/usr/bin/env node
/**
 * 扫描 library/ 生成 manifest.json（书目）
 *
 * 用法:  node build/manifest.mjs
 * 依赖:  iconv-lite（npm install）
 *
 * 规则:
 *  - library/<分类>/<文件>  → 分类取子文件夹名，根目录下的算「未分类」
 *  - 文件名「书名 - 作者.txt」→ 自动拆出作者
 *  - 文件名无作者时，从正文前 2000 字的「作者：xxx」提取
 *  - 自动识别编码（UTF-8 / GBK / Shift-JIS）并转成 UTF-8
 *  - 只处理 .txt / .epub / .docx；以 . 开头的文件（如 .gitkeep）忽略
 *  - docx / epub 是压缩包，不做文字摘要
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'library');
const OUT = path.join(ROOT, 'manifest.json');
const EXTS = ['.txt', '.epub', '.docx'];

const slug = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 12);

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (!e.name.startsWith('.') && EXTS.includes(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

function parseName(name) {
  let base = name.replace(/\.[^.]+$/, '');
  let m = base.match(/^[（(][^）)]*[）)]\s*\[([^\]]+)\]\s*(.*)$/);
  if (m) return { title: m[2].trim(), author: m[1].trim() };
  m = base.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (m) return { title: m[2].trim(), author: m[1].trim() };
  const b2 = base.replace(/^[A-Za-z0-9]{1,3}[-_—]\s*/, '');
  m = b2.match(/《(.+?)》\s*(?:作者[:：]\s*(.+))?/);
  if (m) return { title: m[1].trim(), author: (m[2] || '').trim() };
  m = b2.match(/^(.*?)\s*[-\u2014]\s*(.+)$/);
  if (m && m[1].length > 1) return { title: m[1].trim(), author: m[2].trim() };
  return { title: b2, author: '' };
}

function decodeHead(buf) {
  let b = buf;
  if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);
  const utf8 = b.toString('utf8');
  if ((utf8.match(/\uFFFD/g) || []).length <= utf8.length * 0.01) return utf8;
  const sj = iconv.decode(b.subarray(0, 4000), 'shift_jis');
  let half = 0, kana = 0;
  for (const ch of sj) {
    const c = ch.codePointAt(0);
    if (c >= 0xFF61 && c <= 0xFF9F) half++;
    else if ((c >= 0x3040 && c <= 0x309F) || (c >= 0x30A0 && c <= 0x30FF)) kana++;
  }
  return iconv.decode(b, half > kana ? 'gbk' : 'shift_jis');
}

function metaFromHead(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(2000);
    const n = fs.readSync(fd, buf, 0, 2000, 0);
    fs.closeSync(fd);
    const clean = decodeHead(buf.subarray(0, n))
      .replace(/[\u0000-\u001F\u007F]+/g, ' ')
      .replace(/[\s\u3000]+/g, ' ')
      .trim();
    const am = clean.match(/作者[：:]\s*([^|丨\\/\s，,。]{1,24})/);
    return { digest: clean.slice(0, 46), author: am ? am[1].trim() : '' };
  } catch (_) { return { digest: '', author: '' }; }
}

if (!fs.existsSync(LIB)) { console.error('❌ 找不到 library/ 目录'); process.exit(1); }

const manifest = [];
for (const f of walk(LIB)) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const seg = rel.split('/');
  const category = seg.length >= 3 ? seg[1] : '未分类';
  const name = seg[seg.length - 1];
  const ext = path.extname(name).slice(1).toLowerCase();
  let { title, author } = parseName(name);
  title = (title || '').replace(/[：:、，,。.；;\s]+$/, '').trim() || title;
  const head = ext === 'txt' ? metaFromHead(f) : { digest: '', author: '' };
  if (!author && head.author) author = head.author;
  manifest.push({ i: slug(rel), t: title, a: author, c: category, p: rel, e: ext, s: fs.statSync(f).size, d: head.digest });
}

manifest.sort((a, b) => a.c.localeCompare(b.c, 'zh') || a.t.localeCompare(b.t, 'zh'));
fs.writeFileSync(OUT, JSON.stringify(manifest));
const byCat = {};
manifest.forEach((m) => { byCat[m.c] = (byCat[m.c] || 0) + 1; });
console.log(`✅ manifest.json: ${manifest.length} 部`);
for (const k in byCat) console.log(`   ${k}: ${byCat[k]}`);
console.log(`   大小: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
