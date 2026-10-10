/* 百合小说分享站 · 静态版
 * 数据来自 manifest.json（构建脚本生成）；全文搜索按需加载 search-index.json。
 * 功能：分类计数 / 分页 / 格式·大小筛选 / 排序 / 封面 / 全文搜索
 */
'use strict';

const MANIFEST_URL = 'manifest.json';
const INDEX_URL = 'search-index.json';
const PAGE_SIZE = 24;
const DEFAULT_CATS = ['日本百合', '国内百合', '儿童病例'];
const SIZES = { s: [0, 500 * 1024], m: [500 * 1024, 2 * 1024 * 1024], l: [2 * 1024 * 1024, Infinity] };

const $ = (s) => document.querySelector(s);
const state = { books: [], index: null, indexLoading: false, cat: '全部', q: '', ext: '', size: '', sort: 'title', page: 1 };

/* ---------- 小工具 ---------- */
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function fmtSize(b) { if (!b) return '未知'; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
function iconFor(ext) { return ext === 'epub' ? '📕' : ext === 'docx' ? '📖' : '📄'; }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function colorFor(s) {
  const c = ['#ff6bd6', '#8b5cf6', '#38bdf8', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185', '#fbbf24'];
  let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return c[h % c.length];
}
function dlOf(b) { return b.path.split('/').map(encodeURIComponent).join('/'); }

/* ---------- 列表排版 ---------- */
const LAYOUT_KEY = 'list-layout';
const PAGE_SIZE_BY_LAYOUT = { list: 20, grid2: 20, grid3: 24, compact: 30 };
function getLayout() { try { return localStorage.getItem(LAYOUT_KEY) || 'list'; } catch (_) { return 'list'; } }
function pageSizeOf() { return PAGE_SIZE_BY_LAYOUT[getLayout()] || 20; }

/* ---------- 封面 ---------- */
function coverHtml(b, big) {
  const cls = big ? 'detail-cover' : 'card-cover';
  if (b.cover) return `<img class="${cls}" src="${b.cover}" alt="" loading="lazy" />`;
  const c = colorFor(b.path || b.id);
  const t = escapeHtml((b.title || '').replace(/^《|》$/g, '').slice(0, 14));
  return `<div class="${cls} gen" style="background:linear-gradient(135deg,${c} 0%,#ffffff 130%)">
            <span>${t}</span>
          </div>`;
}

/* ---------- 分类 ---------- */
function countOf(cat) { return cat === '全部' ? state.books.length : state.books.filter((b) => b.category === cat).length; }
function renderChips() {
  const chips = $('#catChips'); chips.innerHTML = '';
  const found = state.books.map((b) => b.category).filter(Boolean);
  const cats = ['全部', ...new Set([...DEFAULT_CATS, ...found])];
  cats.forEach((c) => {
    const b = el('button', 'chip' + (c === state.cat ? ' active' : ''));
    b.innerHTML = `${escapeHtml(c)}<span class="chip-count">${countOf(c)}</span>`;
    b.addEventListener('click', () => { state.cat = c; state.page = 1; renderList(); });
    chips.appendChild(b);
  });
}

/* ---------- 筛选 ---------- */
function visible() {
  let l = state.books.slice();
  if (state.cat !== '全部') l = l.filter((b) => b.category === state.cat);
  if (state.ext) l = l.filter((b) => b.ext === state.ext);
  if (state.size && SIZES[state.size]) { const [lo, hi] = SIZES[state.size]; l = l.filter((b) => b.size >= lo && b.size < hi); }
  const q = state.q.trim().toLowerCase();
  if (q) {
    l = l.filter((b) => {
      if ([b.title, b.author, b.category, b.name].join(' ').toLowerCase().includes(q)) return true;
      const txt = state.index && state.index[b.id];
      return txt ? txt.toLowerCase().includes(q) : false;
    });
  }
  if (state.sort === 'size') l.sort((a, b) => b.size - a.size);
  else if (state.sort === 'views') l.sort((a, b) => (viewCountOf(b.id) || 0) - (viewCountOf(a.id) || 0) || String(a.title).localeCompare(String(b.title), 'zh'));
  else l.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh'));
  return l;
}

/* ---------- 列表 ---------- */
function renderList() {
  const grid = $('#file-list');
  grid.className = 'layout-' + getLayout();
  const list = visible();
  const total = state.books.length;
  $('#total-count').textContent = total;

  // 分页
  const pages = Math.max(1, Math.ceil(list.length / pageSizeOf()));
  if (state.page > pages) state.page = pages;
  const start = (state.page - 1) * pageSizeOf();
  const pageItems = list.slice(start, start + pageSizeOf());

  // 结果行
  const parts = [`共 ${list.length} 部`];
  if (state.cat !== '全部') parts.push(`分类「${state.cat}」`);
  if (state.ext) parts.push(`格式 ${state.ext}`);
  if (state.size) parts.push(`大小 ${$('#f-size').selectedOptions[0].textContent}`);
  if (state.q.trim()) parts.push(`搜索「${state.q.trim()}」`);
  if (state.indexLoading) parts.push('（全文索引加载中…）');
  $('#result-line').textContent = parts.join(' · ');

  $('#empty').hidden = list.length > 0;
  grid.innerHTML = '';
  pageItems.forEach((b) => {
    const card = el('div', 'file-item');
    card.style.setProperty('--accent', colorFor(b.path || b.id));
    card.innerHTML =
      `<button class="fav-star${isFav(b.id) ? ' on' : ''}" data-fav="${b.id}" title="${isFav(b.id) ? '取消收藏' : '收藏'}">${isFav(b.id) ? '★' : '☆'}</button>` +
      coverHtml(b) +
      `<div class="card-body">
         <div class="card-title">${escapeHtml(b.title)}</div>
         ${b.author ? `<div class="card-author">✍ ${escapeHtml(b.author)}</div>` : ''}
         <div class="card-sub">
           ${b.category ? `<span class="tag">${escapeHtml(b.category)}</span>` : ''}
           <span class="tag fmt">${escapeHtml(b.ext)}</span>
         </div>
         ${b.digest ? `<div class="card-summary">${escapeHtml(b.digest)}…</div>` : ''}
       </div>
       <div class="card-foot">
         <span class="muted">${fmtSize(b.size)}${viewCountOf(b.id) != null ? ' · 👁 ' + viewCountOf(b.id) : ''}</span>
         <button class="btn mini" data-open="${b.id}">详情</button>
         <button class="btn mini read-btn" data-read="${b.id}">📖 阅读</button>
         <a class="btn mini primary" href="${dlOf(b)}" download="${escapeHtml(b.title)}.${b.ext}">下载</a>
       </div>`;
    card.querySelector('[data-open]')?.addEventListener('click', (ev) => { ev.stopPropagation(); openDetail(b); });
    card.querySelector('[data-read]')?.addEventListener('click', (ev) => { ev.stopPropagation(); openReader(b); });
    card.addEventListener('click', () => openDetail(b));
    card.querySelector('[data-fav]')?.addEventListener('click', (ev) => { ev.stopPropagation(); toggleFav(b); });
    grid.appendChild(card);
  });

  // 分页控件
  const pager = $('#pager');
  pager.hidden = list.length <= pageSizeOf();
  $('#pg-info').textContent = `第 ${state.page} / ${pages} 页`;
  $('#pg-prev').disabled = state.page <= 1;
  $('#pg-next').disabled = state.page >= pages;
}

/* ---------- 全文索引(按需加载) ---------- */
async function ensureIndex() {
  if (state.index || state.indexLoading) return;
  state.indexLoading = true;
  try {
    const r = await fetch(INDEX_URL, { cache: 'force-cache' });
    if (r.ok) state.index = await r.json();
  } catch (_) { state.index = {}; }
  state.indexLoading = false;
  renderList();
}

/* ---------- 浏览量 (abacus 免费计数, 详情页内 1 次请求) ---------- */
const ABACUS_NS = 'yuri-novel-views';   // ← 建议改成你自己的命名空间, 避免与他人共用计数
const hitThisSession = new Set();   // 本次会话已统计过的书
const viewCache = {};               // id -> 次数(本会话已获取)
let viewsMap = {};                  // 来自 views.json 的全量快照

function viewCountOf(id) {
  if (viewCache[id] != null) return viewCache[id];
  if (viewsMap[id] != null) return viewsMap[id];
  return null;
}
async function loadViewsFile() {
  try {
    const r = await fetch('views.json', { cache: 'no-cache' });
    if (r.ok) { viewsMap = await r.json(); renderList(); }
  } catch (_) {}
}
async function loadViews(id) {
  if (viewCache[id] != null) return viewCache[id];
  const first = !hitThisSession.has(id);
  const url = `https://abacus.jasoncameron.dev/${first ? 'hit' : 'get'}/${ABACUS_NS}/${encodeURIComponent(id)}`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.status === 404) { viewCache[id] = 0; return 0; }
    if (!r.ok) return null;
    const j = await r.json();
    if (typeof j.value === 'number') {
      viewCache[id] = j.value;
      viewsMap[id] = j.value;
      if (first) hitThisSession.add(id);
      return j.value;
    }
  } catch (_) {}
  return null;
}

/* ---------- 详情 ---------- */
function openDetail(b) {
  state.current = b;
  $('#detail-title').textContent = b.title || '未命名';
  const holder = $('#detail-cover');
  if (b.cover) {
    holder.className = 'detail-cover';
    holder.style.background = '';
    holder.innerHTML = `<img src="${b.cover}" alt="" />`;
  } else {
    const c = colorFor(b.path || b.id);
    holder.className = 'detail-cover gen';
    holder.style.background = `linear-gradient(135deg,${c} 0%,#ffffff 130%)`;
    holder.innerHTML = `<span>${escapeHtml((b.title || '').slice(0, 14))}</span>`;
  }
  $('#detail-meta').innerHTML =
    (b.author ? `<div class="dm-item"><b>作者</b> ${escapeHtml(b.author)}</div>` : '') +
    (b.category ? `<div class="dm-item"><b>分类</b> ${escapeHtml(b.category)}</div>` : '') +
    `<div class="dm-item"><b>格式</b> ${escapeHtml(b.ext)}</div>` +
    `<div class="dm-item"><b>大小</b> ${fmtSize(b.size)}</div>` +
    `<div class="dm-item"><b>浏览量</b> <span id="detail-views">读取中…</span></div>`;
  $('#detail-tags').innerHTML = '';
  $('#detail-summary').textContent = (b.digest ? b.digest + '…' : '') + '\n\n（点下方按钮下载阅读全文；喜欢请支持正版。）';
  $('#detail-download').setAttribute('href', dlOf(b));
  $('#detail-download').setAttribute('download', `${b.title}.${b.ext}`);
  syncFavBtn();
  $('#detail-modal').hidden = false;
  const vEl = $('#detail-views');
  if (vEl && viewCache[b.id] != null) vEl.textContent = viewCache[b.id];
  loadViews(b.id).then((n) => { const el = $('#detail-views'); if (el) el.textContent = (n == null ? '—' : n); });
}
/* ---------- 在线阅读 ---------- */
const RD_FONT_KEY = 'rd-font';
let rdBook = null;

function rdFontSize(v) {
  const cur = Number(localStorage.getItem(RD_FONT_KEY) || 18);
  const next = Math.min(34, Math.max(12, cur + v));
  localStorage.setItem(RD_FONT_KEY, String(next));
  applyRdFont();
  if (rdGetMode() === 'page') {
    const c = $('#reader-content');
    if (c) c.style.columnWidth = Math.max(120, c.clientWidth - RD_GAP) + 'px';
    setTimeout(() => rdGoto(rdPage), 60);
  }
}
function applyRdFont() {
  const size = Number(localStorage.getItem(RD_FONT_KEY) || 18);
  const c = $('#reader-content');
  if (c) c.style.fontSize = size + 'px';
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function ensureMammoth() {
  if (window.mammoth) return;
  await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js');
}

function openReader(b) {
  rdBook = b;
  state.current = b;
  rdPushHistory(b);
  closeDetail();
  const rd = $('#reader');
  $('#reader-title').textContent = b.title || '阅读';
  const dl = $('#rd-download');
  dl.setAttribute('href', dlOf(b));
  dl.setAttribute('download', `${b.title}.${b.ext}`);
  const content = $('#reader-content');
  rd.hidden = false;
  document.body.classList.add('reading');
  content.scrollTop = 0;
  applyRdFont();
  applyRdFamily();
  try { history.replaceState(null, '', '#read=' + encodeURIComponent(b.id)); } catch (_) {}

  const url = dlOf(b);
  if (b.ext === 'txt') {
    content.textContent = '⏳ 加载中…';
    fetch(url, { cache: 'force-cache' }).then((r) => r.text()).then((t) => {
      content.textContent = t.replace(/^\uFEFF/, '');
      const pend = rdPendingPos; rdPendingPos = null;
      if (pend) { setTimeout(() => rdApplyPos(pend), 60); }
      else {
        content.scrollTop = Number(localStorage.getItem('rd-pos-' + b.id) || 0);
        setTimeout(rdUpdateProgress, 60);
        setTimeout(rdApplyMode, 80);
      }
    }).catch(() => { content.textContent = '⚠️ 加载失败，请点击「下载」阅读。'; });
  } else if (b.ext === 'docx') {
    content.innerHTML = '⏳ 正在解析 Word 文档…';
    ensureMammoth()
      .then(() => fetch(url).then((r) => r.arrayBuffer()))
      .then((buf) => window.mammoth.convertToHtml({ arrayBuffer: buf }))
      .then((res) => { content.innerHTML = `<div class="docx-body">${res.value}</div>`; content.scrollTop = Number(localStorage.getItem('rd-pos-' + b.id) || 0); })
      .catch(() => { content.textContent = '⚠️ Word 解析失败（可能没有网络加载解析库），请点击「下载」阅读。'; });
  } else {
    content.textContent = `${b.ext.toUpperCase()} 格式暂不支持网页内阅读，请点击右上角「下载」后阅读。`;
  }
}

function closeReader() {
  rdSaveNow();
  updateContinueBtn();
  $('#reader').hidden = true;
  document.body.classList.remove('reading');
  rdBook = null;
  try { if (location.hash.startsWith('#read=')) history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
}

function closeDetail() { $('#detail-modal').hidden = true; }

/* ---------- 事件 ---------- */
$('#search').addEventListener('input', (e) => { state.q = e.target.value; state.page = 1;  renderList(); });
$('#f-ext').addEventListener('change', (e) => { state.ext = e.target.value; state.page = 1; renderList(); });
$('#f-size').addEventListener('change', (e) => { state.size = e.target.value; state.page = 1; renderList(); });
$('#f-sort').addEventListener('change', (e) => { state.sort = e.target.value; renderList(); });
$('#f-layout').addEventListener('change', (e) => {
  try { localStorage.setItem(LAYOUT_KEY, e.target.value); } catch (_) {}
  state.page = 1;
  renderList();
});
try { $('#f-layout').value = getLayout(); } catch (_) {}
$('#pg-prev').addEventListener('click', () => { if (state.page > 1) { state.page--; renderList(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
$('#pg-next').addEventListener('click', () => { state.page++; renderList(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('#detail-close').addEventListener('click', closeDetail);
$('#detail-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDetail(); });

/* ---------- 阅读器事件 ---------- */
$('#detail-read').addEventListener('click', () => { if (state.current) openReader(state.current); });
$('#rd-close').addEventListener('click', closeReader);
$('#rd-font-plus').addEventListener('click', () => rdFontSize(2));
$('#rd-font-minus').addEventListener('click', () => rdFontSize(-2));
$('#rd-theme').addEventListener('click', (e) => {
  const dark = document.body.classList.toggle('dark-reader');
  e.currentTarget.textContent = dark ? '☀️' : '🌙';
  try { localStorage.setItem('rd-dark', dark ? '1' : '0'); } catch (_) {}
});
// 阅读模式切换 (滚动 / 翻页)
$('#rd-mode').addEventListener('click', () => {
  const next = rdGetMode() === 'page' ? 'scroll' : 'page';
  try { localStorage.setItem(RD_MODE_KEY, next); } catch (_) {}
  rdPage = 0;
  rdApplyMode();
});
$('#rd-prev').addEventListener('click', () => rdGoto(rdPage - 1));
$('#rd-next').addEventListener('click', () => rdGoto(rdPage + 1));
$('#rd-mark').addEventListener('click', rdAddMark);

/* ---------- 书架事件 ---------- */
$('#open-shelf').addEventListener('click', () => openShelf('hist'));
$('#shelf-close').addEventListener('click', closeShelf);
$('#tab-hist').addEventListener('click', () => openShelf('hist'));
$('#tab-mark').addEventListener('click', () => openShelf('mark'));
$('#tab-fav').addEventListener('click', () => openShelf('fav'));
$('#detail-fav').addEventListener('click', () => { if (state.current) toggleFav(state.current); });
$('#shelf-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeShelf(); });
$('#shelf-clear').addEventListener('click', () => {
  const msg = shelfTab === 'hist' ? '确定清空全部阅读记录？' : '确定清空全部书签？';
  if (!window.confirm(msg)) return;
  rdSet(shelfTab === 'hist' ? 'rd-history' : 'rd-marks', []);
  renderShelf();
});
$('#shelf-list').addEventListener('click', (e) => {
  const item = e.target.closest('.shelf-item');
  if (!item) return;
  if (item.dataset.act === 'open') {
    const b = state.books.find((x) => x.id === item.dataset.id);
    if (!b) { rdToast('这本书找不到了'); return; }
    closeShelf(); openReader(b);
  } else if (item.dataset.act === 'mark') {
    const m = rdGet('rd-marks', [])[Number(item.dataset.idx)];
    if (!m) return;
    const b = state.books.find((x) => x.id === m.id);
    if (!b) { rdToast('这本书找不到了'); return; }
    rdPendingPos = m;
    closeShelf(); openReader(b);
  }
});
// 点击阅读区翻页: 左侧 1/3 上一页, 其余下一页
$('#reader-content').addEventListener('click', (e) => {
  if (!rdBook || rdGetMode() !== 'page') return;
  if (window.getSelection && String(window.getSelection()) !== '') return;   // 有选中文字则不翻页
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  if (x < rect.width * 0.32) rdGoto(rdPage - 1);
  else rdGoto(rdPage + 1);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeReader(); closeDetail(); return; }
  if (rdBook && rdGetMode() === 'page') {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); rdGoto(rdPage + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); rdGoto(rdPage - 1); }
  }
});
window.addEventListener('resize', () => {
  if (rdBook && rdGetMode() === 'page') {
    const c = $('#reader-content');
    c.style.columnWidth = Math.max(120, c.clientWidth - RD_GAP) + 'px';
    setTimeout(() => rdGoto(rdPage), 60);
  }
});
/* ---------- 阅读进度 & 记忆(节流保存) ---------- */
let rdSaveTimer = null;
function rdUpdateProgress() {
  const c = $('#reader-content'), p = $('#rd-progress');
  if (!c || !p) return;
  const max = c.scrollHeight - c.clientHeight;
  p.textContent = (max > 0 ? Math.round((c.scrollTop / max) * 100) : 100) + '%';
}
function rdSaveNow() {
  if (!rdBook) return;
  try {
    const c = $('#reader-content');
    if (rdGetMode() === 'page') {
      const total = rdTotalPages();
      localStorage.setItem('rd-pg-' + rdBook.id, String(rdPage));
      localStorage.setItem('rd-pct-' + rdBook.id, String(Math.round(((rdPage + 1) / total) * 100)));
    } else {
      const max = c.scrollHeight - c.clientHeight;
      const pct = max > 0 ? Math.round((c.scrollTop / max) * 100) : 100;
      localStorage.setItem('rd-pos-' + rdBook.id, String(c.scrollTop));
      localStorage.setItem('rd-pct-' + rdBook.id, String(pct));
    }
    localStorage.setItem('rd-last', rdBook.id);
  } catch (_) {}
}
$('#reader-content').addEventListener('scroll', () => {
  if (!rdBook) return;
  rdUpdateProgress();
  if (rdSaveTimer) return;                       // 节流: 最多每 700ms 存一次
  rdSaveTimer = setTimeout(() => { rdSaveTimer = null; rdSaveNow(); }, 700);
});

/* "继续阅读"按钮 */
function updateContinueBtn() {
  const btn = $('#continue-read');
  if (!btn) return;
  let id = null; try { id = localStorage.getItem('rd-last'); } catch (_) {}
  const b = id ? state.books.find((x) => x.id === id) : null;
  if (b) { btn.hidden = false; btn.textContent = `📖 继续阅读《${b.title}》（已读到 ${currentPct(b)}%）`; btn.onclick = () => openReader(b); }
  else btn.hidden = true;
}
function currentPct(b) {
  try { return localStorage.getItem('rd-pct-' + b.id) || '—'; } catch (_) { return '—'; }
}

/* ---------- 翻页模式 ---------- */
const RD_MODE_KEY = 'rd-mode';
const RD_GAP = 48;
let rdPage = 0;
function rdGetMode() { try { return localStorage.getItem(RD_MODE_KEY) || 'scroll'; } catch (_) { return 'scroll'; } }
function rdTotalPages() {
  const c = $('#reader-content');
  if (!c || rdGetMode() !== 'page') return 1;
  const W = c.clientWidth;
  if (W <= 0) return 1;
  return Math.max(1, Math.round(c.scrollWidth / W));
}
function rdUpdatePageInfo() {
  const c = $('#reader-content');
  const total = rdTotalPages();
  rdPage = Math.min(Math.max(0, rdPage), total - 1);
  const info = $('#rd-pageinfo');
  if (info) info.textContent = `第 ${rdPage + 1} / ${total} 页`;
  const prev = $('#rd-prev'), next = $('#rd-next');
  if (prev) prev.disabled = rdPage <= 0;
  if (next) next.disabled = rdPage >= total - 1;
  const p = $('#rd-progress');
  if (p) p.textContent = Math.round(((rdPage + 1) / total) * 100) + '%';
  if (rdBook) { try { localStorage.setItem('rd-pg-' + rdBook.id, String(rdPage)); localStorage.setItem('rd-pct-' + rdBook.id, String(Math.round(((rdPage + 1) / total) * 100))); } catch (_) {} }
}
function rdGoto(n) {
  const c = $('#reader-content');
  const total = rdTotalPages();
  rdPage = Math.min(Math.max(0, n), total - 1);
  c.scrollLeft = rdPage * c.clientWidth;      // 每页宽度 = 可视宽度, 恰好整屏一页
  rdUpdatePageInfo();
}
function rdApplyMode() {
  const c = $('#reader-content');
  if (!c) return;
  const m = rdGetMode();
  const btn = $('#rd-mode');
  const nav = $('#rd-pagenav');
  if (m === 'page') {
    const W = c.clientWidth;
    c.style.columnGap = RD_GAP + 'px';
    c.style.columnWidth = Math.max(120, W - RD_GAP) + 'px';
    c.classList.add('paged');
    if (nav) nav.hidden = false;
    if (btn) btn.textContent = '📜 滚动';
    setTimeout(() => {
      const saved = rdBook ? Number(localStorage.getItem('rd-pg-' + rdBook.id) || 0) : 0;
      rdGoto(saved || 0);
    }, 40);
  } else {
    c.classList.remove('paged');
    c.style.columnWidth = '';
    if (nav) nav.hidden = true;
    if (btn) btn.textContent = '📄 翻页';
    const p = $('#rd-progress');
    if (p) p.textContent = '0%';
  }
}
// 恢复上次的深色偏好(阅读器内)
try {
  if (localStorage.getItem('rd-dark') === '1') { document.body.classList.add('dark-reader'); $('#rd-theme').textContent = '☀️'; }
} catch (_) {}

/* ---------- 全站深色模式 ---------- */
const THEME_KEY = 'site-dark';
function applyTheme() {
  let dark = false;
  try { dark = localStorage.getItem(THEME_KEY) === '1'; } catch (_) {}
  document.body.classList.toggle('dark', dark);
  const t = $('#theme-toggle');
  if (t) t.textContent = dark ? '☀️' : '🌙';
}
$('#theme-toggle').addEventListener('click', () => {
  const dark = !document.body.classList.contains('dark');
  try { localStorage.setItem(THEME_KEY, dark ? '1' : '0'); } catch (_) {}
  applyTheme();
});
applyTheme();

/* ---------- 阅读字体 ---------- */
const RD_FAMILY = {
  hei: '"Microsoft YaHei","PingFang SC","Hiragino Sans GB",sans-serif',
  song: '"SimSun","Songti SC","Noto Serif SC",serif',
  kai: '"KaiTi","Kaiti SC",serif',
  xihei: '"Microsoft YaHei Light","PingFang SC",sans-serif',
};
function applyRdFamily() {
  let v = '';
  try { v = localStorage.getItem('rd-family') || ''; } catch (_) {}
  const c = $('#reader-content');
  if (c) c.style.fontFamily = RD_FAMILY[v] || '';
  const sel = $('#rd-font');
  if (sel) sel.value = v;
}
$('#rd-font').addEventListener('change', (e) => {
  try { localStorage.setItem('rd-family', e.target.value); } catch (_) {}
  applyRdFamily();
  if (rdBook && rdGetMode() === 'page') {
    const c = $('#reader-content');
    c.style.columnWidth = Math.max(120, c.clientWidth - RD_GAP) + 'px';
    setTimeout(() => rdGoto(rdPage), 60);
  }
});
applyRdFamily();

/* ---------- 阅读记录 & 书签 ---------- */
function rdGet(key, def) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? def : v; } catch (_) { return def; } }
function rdSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (_) { return false; } }
function fmtAgo(t) {
  if (!t) return '';
  const d = new Date(t), s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  if (s < 86400 * 30) return Math.floor(s / 86400) + ' 天前';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
let rdPendingPos = null;
function rdPushHistory(b) {
  let h = rdGet('rd-history', []);
  h = h.filter((x) => x.id !== b.id);
  h.unshift({ id: b.id, title: b.title, at: Date.now() });
  rdSet('rd-history', h.slice(0, 200));
}
function currentPos(b) {
  const c = $('#reader-content');
  const text = c.textContent || '';
  const mode = rdGetMode();
  let ratio = 0, page = 0;
  if (mode === 'page') {
    const total = rdTotalPages();
    page = rdPage;
    ratio = total > 1 ? rdPage / (total - 1) : 0;
  } else {
    const max = c.scrollHeight - c.clientHeight;
    ratio = max > 0 ? c.scrollTop / max : 0;
  }
  const off = Math.round(ratio * Math.max(0, text.length - 60));
  const snippet = text.slice(off, off + 54).replace(/[\s\u3000]+/g, ' ').trim();
  return { mode, page, ratio, snippet };
}
function rdAddMark() {
  if (!rdBook) return;
  const marks = rdGet('rd-marks', []);
  marks.unshift({ id: rdBook.id, title: rdBook.title, at: Date.now(), ...currentPos(rdBook) });
  rdSet('rd-marks', marks.slice(0, 500));
  rdToast('🔖 已加书签');
}
function rdToast(msg) {
  let t = $('#rd-toast');
  if (!t) { t = document.createElement('div'); t.id = 'rd-toast'; t.className = 'rd-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(rdToast._t);
  rdToast._t = setTimeout(() => t.classList.remove('show'), 1600);
}
function rdApplyPos(pos) {
  if (!pos) return;
  const want = pos.mode === 'page' ? 'page' : 'scroll';
  try { localStorage.setItem(RD_MODE_KEY, want); } catch (_) {}
  rdApplyMode();
  if (want === 'page') setTimeout(() => rdGoto(pos.page || 0), 90);
  else {
    const c = $('#reader-content');
    c.scrollTop = Math.round((pos.ratio || 0) * Math.max(0, c.scrollHeight - c.clientHeight));
    setTimeout(rdUpdateProgress, 40);
  }
}
/* ---------- 个人收藏 ---------- */
function rdFavs() { return rdGet('rd-favs', []); }
function isFav(id) { return rdFavs().some((x) => x.id === id); }
function toggleFav(b) {
  let f = rdFavs();
  if (f.some((x) => x.id === b.id)) { f = f.filter((x) => x.id !== b.id); rdToast('已取消收藏'); }
  else { f.unshift({ id: b.id, title: b.title, at: Date.now() }); rdToast('⭐ 已收藏'); }
  rdSet('rd-favs', f.slice(0, 1000));
  renderList();
  if (!$('#shelf-modal').hidden) renderShelf();
  syncFavBtn();
}
function syncFavBtn() {
  const btn = $('#detail-fav');
  if (!btn) return;
  const b = state.current;
  if (b && isFav(b.id)) { btn.textContent = '★ 已收藏'; btn.classList.add('on'); }
  else { btn.textContent = '⭐ 收藏'; btn.classList.remove('on'); }
}

let shelfTab = 'hist';
function openShelf(tab) {
  shelfTab = tab || 'hist';
  $('#tab-hist').classList.toggle('active', shelfTab === 'hist');
  $('#tab-mark').classList.toggle('active', shelfTab === 'mark');
  $('#tab-fav').classList.toggle('active', shelfTab === 'fav');
  renderShelf();
  $('#shelf-modal').hidden = false;
}
function closeShelf() { $('#shelf-modal').hidden = true; }
function renderShelf() {
  const list = $('#shelf-list');
  if (shelfTab === 'hist') {
    const h = rdGet('rd-history', []);
    if (!h.length) { list.innerHTML = '<p class="empty">还没有阅读记录～点开一本书就会记录在这里</p>'; return; }
    list.innerHTML = h.map((x) => {
      const b = state.books.find((y) => y.id === x.id);
      const pct = localStorage.getItem('rd-pct-' + x.id) || '0';
      const title = b ? b.title : (x.title || '(已下架)');
      return `<div class="shelf-item" data-act="open" data-id="${x.id}">
        <div class="shelf-title">${escapeHtml(title)}</div>
        <div class="shelf-sub">已读 ${escapeHtml(String(pct))}% · ${escapeHtml(fmtAgo(x.at))}</div>
      </div>`;
    }).join('');
  } else if (shelfTab === 'fav') {
    const f = rdFavs();
    if (!f.length) { list.innerHTML = '<p class="empty">还没有收藏～点书卡右上角的 ☆ 或详情里的「⭐ 收藏」</p>'; return; }
    list.innerHTML = f.map((x) => {
      const b = state.books.find((y) => y.id === x.id);
      const title = b ? b.title : (x.title || '(已下架)');
      const sub = b ? `${escapeHtml(String(b.category))} · ${fmtSize(b.size)}` : '已下架';
      return `<div class="shelf-item" data-act="open" data-id="${x.id}">
        <div class="shelf-title">⭐ ${escapeHtml(title)}</div>
        <div class="shelf-sub">${sub} · 收藏于 ${escapeHtml(fmtAgo(x.at))}</div>
      </div>`;
    }).join('');
  } else {
    const m = rdGet('rd-marks', []);
    if (!m.length) { list.innerHTML = '<p class="empty">还没有书签～阅读时点顶部的「🔖 加书签」</p>'; return; }
    list.innerHTML = m.map((x, i) => {
      const pos = x.mode === 'page' ? `第 ${(x.page || 0) + 1} 页` : `${Math.round((x.ratio || 0) * 100)}%`;
      return `<div class="shelf-item" data-act="mark" data-idx="${i}">
        <div class="shelf-title">${escapeHtml(x.title || '')} <span class="shelf-pos">${escapeHtml(pos)}</span></div>
        <div class="shelf-sub">${escapeHtml(x.snippet || '')}</div>
        <div class="shelf-sub dim">${escapeHtml(fmtAgo(x.at))}</div>
      </div>`;
    }).join('');
  }
}

/* ---------- 随机推荐 ---------- */
const RD_PICK = 5;
function pickRandom(n) {
  const all = state.books;
  if (!all.length) return [];
  if (all.length <= n) return all.slice();
  const picked = new Set(), out = [];
  while (out.length < n) {
    const i = Math.floor(Math.random() * all.length);
    if (picked.has(i)) continue;
    picked.add(i);
    out.push(all[i]);
  }
  return out;
}
function renderRandom() {
  const box = $('#random-list');
  if (!box) return;
  const list = pickRandom(RD_PICK);
  if (!list.length) { box.innerHTML = '<p class="empty">还没有作品～</p>'; return; }
  box.innerHTML = list.map((b) => `
    <div class="rnd-item" data-open="${b.id}">
      <div class="rnd-title">${escapeHtml(b.title)}</div>
      <div class="rnd-sub">${escapeHtml(b.category || '未分类')} · ${escapeHtml(b.ext)} · ${fmtSize(b.size)}${b.author ? ' · ✍ ' + escapeHtml(b.author) : ''}</div>
      <div class="rnd-actions">
        <button class="btn mini" data-open-btn="${b.id}">详情</button>
        <button class="btn mini read-btn" data-read="${b.id}">📖 直接阅读</button>
      </div>
    </div>`).join('');
  const find = (id) => list.find((x) => x.id === id);
  box.querySelectorAll('[data-open-btn]').forEach((n) => n.addEventListener('click', (e) => { e.stopPropagation(); const b = find(n.dataset.openBtn); if (b) openDetail(b); }));
  box.querySelectorAll('[data-read]').forEach((n) => n.addEventListener('click', (e) => { e.stopPropagation(); const b = find(n.dataset.read); if (b) openReader(b); }));
  box.querySelectorAll('.rnd-item').forEach((n) => n.addEventListener('click', () => { const b = find(n.dataset.open); if (b) openDetail(b); }));
}
if ($('#random-refresh')) $('#random-refresh').addEventListener('click', renderRandom);

/* ---------- 星光特效(降载) ---------- */
(function sparkles() {
  const cv = document.getElementById('sparkles');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  let w = cv.width = cv.offsetWidth, h = cv.height = cv.offsetHeight;
  const n = Math.max(12, Math.min(36, Math.floor(window.innerWidth / 40)));
  const stars = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 2 + 0.5, vy: -(Math.random() * 0.5 + 0.15), a: Math.random() * 0.6 + 0.2 }));
  (function tick() {
    ctx.clearRect(0, 0, w, h);
    stars.forEach((s) => { s.y += s.vy; if (s.y < -4) s.y = h + 4; ctx.globalAlpha = s.a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); });
    requestAnimationFrame(tick);
  })();
})();

/* ---------- 启动 (本地缓存秒开 + 后台更新) ---------- */
const MKEY = 'manifest-cache-v3';
function normalize(list) {
  return (Array.isArray(list) ? list : []).map((b) => {
    const v = (a, c) => (b[a] != null ? b[a] : b[c]);
    const o = {
      id: v('id', 'i'), title: v('title', 't'), author: v('author', 'a'),
      category: v('category', 'c'), path: v('path', 'p'), ext: v('ext', 'e'),
      size: v('size', 's'), cover: v('cover', 'v') || '', digest: v('digest', 'd') || '',
    };
    o.name = b.name || String(o.path || '').split('/').pop();
    return o;
  });
}
function applyBooks(list) {
  state.books = normalize(list);
  renderChips();
  renderList();
  renderRandom();
  updateContinueBtn();
}
(async function load() {
  // 1) 先用本地缓存立即渲染(秒开)
  let cache = null;
  try { cache = JSON.parse(localStorage.getItem(MKEY) || 'null'); } catch (_) { cache = null; }
  if (cache && cache.data && cache.data.length) applyBooks(cache.data);

  // 2) 后台拉最新书目, 有变化才更新
  try {
    const r = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('manifest ' + r.status);
    const text = await r.text();
    if (!cache || cache.len !== text.length) {
      const data = JSON.parse(text);
      try { localStorage.setItem(MKEY, JSON.stringify({ at: Date.now(), len: text.length, data })); } catch (_) {}
      applyBooks(data);
    }
  } catch (e) {
    if (!state.books.length) $('#empty').textContent = '⚠️ 读取失败，请稍后刷新重试。';
  }

  // 3) #read=<id> 深链(分享/刷新)
  loadViewsFile();
  try {
    const m = location.hash.match(/^#read=(.+)$/);
    if (m) {
      const b = state.books.find((x) => x.id === decodeURIComponent(m[1]));
      if (b) setTimeout(() => openReader(b), 120);
    }
  } catch (_) {}
})();

/* ---------- Service Worker (离线/秒开) ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
