/* 百合小说导航站 · 静态版
 * 数据来自 manifest.json（构建脚本生成）；全文搜索按需加载 search-index.json。
 * 功能：分类计数 / 分页 / 格式·大小筛选 / 排序 / 封面 / 全文搜索
 */
'use strict';

/* ---------- 全局配置 ---------- */
const MANIFEST_URL = 'manifest.json';
const INDEX_URL = 'search-index.json';
const PAGE_SIZE = 24;
const DEFAULT_CATS = ['女同文学（策展）', '百合会', '文學區', '輕小說/譯文區', 'pixiv小説', 'AO3', 'カクヨム', 'アルファポリス', 'なろう', 'note', 'ScribbleHub', 'Penana', 'Quotev', 'LilyVerse', 'RoyalRoad', 'BookWalker', 'truyenfull', 'Booksie', '晋江文学城', '노벨피아', '长佩文学', '已消失的百合', '百合漫', '轻小说百科', 'Inkitt', 'POPO原创市集', 'Yuristars', 'Author.Today', 'EFP', 'ムーンライトノベルズ', 'linovelib'];
const SIZES = { s: [0, 500 * 1024], m: [500 * 1024, 2 * 1024 * 1024], l: [2 * 1024 * 1024, Infinity] };

const $ = (s) => document.querySelector(s);
const BUILD = 'v' + Date.now();
const state = { books: [], index: null, indexLoading: false, cat: '全部', lang: '全部', q: '', ext: '', size: '', sort: 'title', page: 1 };

/* ---------- 小工具 ---------- */
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function fmtSize(b) { if (!b) return '未知'; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
function iconFor(ext) { return ext === 'epub' ? '📕' : ext === 'docx' ? '📖' : '📄'; }
function hl(text, q) {
  const t = escapeHtml(text == null ? '' : String(text));
  const k = (q || '').trim();
  if (!k) return t;
  try {
    const safe = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return t.replace(new RegExp('(' + safe + ')', 'gi'), '<mark class="hl">$1</mark>');
  } catch (_) { return t; }
}
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function colorFor(s) {
  const c = ['#ff6bd6', '#8b5cf6', '#38bdf8', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185', '#fbbf24'];
  let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return c[h % c.length];
}
function dlOf(b) { return b.path.split('/').map(encodeURIComponent).join('/'); }


/* ---------- 百合阅读站入口(按分类智能匹配) ---------- */
const ZB_JP = [
  { k: 'narou', name: '小説家になろう', icon: '📖', url: (q) => `https://yomou.syosetu.com/search.php?word=${encodeURIComponent(q)}` },
  { k: 'kakuyomu', name: 'カクヨム', icon: '📗', url: (q) => `https://kakuyomu.jp/search?q=${encodeURIComponent(q)}` },
];
const ZB_CN = [
  { k: 'jjwxc', name: '晋江文学城', icon: '📘', url: (q) => `https://www.jjwxc.net/search.php?kw=${encodeURIComponent(q)}` },
  { k: 'gongzi', name: '长佩文学', icon: '📙', url: (q) => `https://www.gongzicp.com/search?keyword=${encodeURIComponent(q)}` },
];
const ZB_ALL = [
  { k: 'yamibo', name: '百合会', icon: '🌸', url: () => 'https://www.yamibo.com/' },
  { k: 'weread', name: '微信读书', icon: '📚', url: (q) => `https://weread.qq.com/web/search/global?keyword=${encodeURIComponent(q)}` },
];
function zbQuery(b) { return (b.title || '').trim(); }
function zbListFor(b) {
  const jp = /日本/.test(b.category || '');
  return [...(jp ? ZB_JP : ZB_CN), ...ZB_ALL];
}
function zbLinkHtml(b, cls) {
  const q = zbQuery(b);
  // ① 有原文直链(なろう等) → 排第一(真正有效的直达链接)
  const src = b.url
    ? `<a class="zb-link zb-src ${cls || ''}" href="${b.url}" target="_blank" rel="noopener noreferrer">📖 ${escapeHtml(b.srcName || '阅读原文')}</a>`
    : '';
  return src + zbListFor(b).map((p) =>
    `<a class="zb-link ${cls || ''}" href="${p.url(q)}" target="_blank" rel="noopener noreferrer" title="去${p.name}找《${escapeHtml(q)}》">${p.icon} ${p.name}</a>`
  ).join('');
}

/* ---------- 中文标题对照表 ---------- */
let ZH_MAP = {};
async function loadZhMap() {
  try {
    const r = await fetch('titles-zh.json', { cache: 'no-cache' });
    if (r.ok) ZH_MAP = await r.json();
  } catch (_) {}
}

/* ---------- 从 なろう 官方 API 加载书目(经 Cloudflare Worker 代理) ---------- */
let NAROU_LOADED = 0;

// 由「来源 + ID」推导作品链接（省掉数据里的 670KB 链接字段）
const URL_RULES = {
  'なろう': (n) => 'https://ncode.syosetu.com/' + String(n).replace(/^nr-/, '') + '/',
  'カクヨム': (n) => 'https://kakuyomu.jp/works/' + String(n).replace(/^ky-/, ''),
  'linovelib': (n) => 'https://www.linovelib.com/novel/' + String(n).replace(/^lvn-/, '') + '.html',
  'RoyalRoad': (n) => 'https://www.royalroad.com/fiction/' + String(n).replace(/^rr-/, ''),
  'Inkitt': (n) => 'https://www.inkitt.com/stories/' + String(n).replace(/^ink-/, ''),
  'truyenfull': (n) => 'https://truyenfull.vn/' + String(n).replace(/^tf-/, '') + '/',
  'Quotev': (n) => 'https://www.quotev.com/story/' + String(n).replace(/^qv-/, ''),
  'BookWalker': (n) => 'https://bookwalker.jp/series/' + String(n).replace(/^bwk-/, '') + '/',
  'Booksie': (n) => 'https://www.booksie.com/' + String(n).replace(/^bk-/, '') ,
  'ScribbleHub': (n) => 'https://www.scribblehub.com/series/' + String(n).replace(/^sh-/, '') + '/',
  'Author.Today': (n) => 'https://author.today/work/' + String(n).replace(/^at-/, ''),
  'EFP': (n) => 'https://www.efpfanfic.net/viewstory.php?sid=' + String(n).replace(/^efp-/, ''),
  '晋江文学城': (n) => 'https://www.jjwxc.net/onebook.php?novelid=' + n,
  '百合会': (n) => 'https://www.yamibo.com/novel/' + n,
  '文學區': (n) => 'https://bbs.yamibo.com/thread-' + String(n).replace(/^f/, '') + '-1-1.html',
  '輕小說/譯文區': (n) => 'https://bbs.yamibo.com/thread-' + String(n).replace(/^f/, '') + '-1-1.html',
  '轻小说/译文区': (n) => 'https://bbs.yamibo.com/thread-' + String(n).replace(/^f/, '') + '-1-1.html',
  '长佩文学': (n) => 'https://www.gongzicp.com/novel-' + String(n).replace(/^gz/, '') + '.html',
  'POPO原创市集': (n) => 'https://www.popo.tw/books/' + String(n).replace(/^pp/, ''),
  // 已消失的百合: 混合 ID（f### = yamibo 论坛, 19位数字 = カクヨム）
  '已消失的百合': (n) => {
    const s = String(n);
    if (/^f\d+$/.test(s)) return 'https://bbs.yamibo.com/thread-' + s.replace(/^f/, '') + '-1-1.html';
    if (/^\d{15,}$/.test(s)) return 'https://kakuyomu.jp/works/' + s;
    if (/^\d+$/.test(s)) return 'https://www.yamibo.com/novel/' + s;
    return '';
  },
  'LilyVerse': (n) => 'https://lilyverse.cc/novels/' + String(n).replace(/^lv-/, ''),
  '轻小说百科': (n) => 'https://lnovel.org/books-' + String(n).replace(/^ln-/, ''),
  '百合漫': (n) => 'https://baiheman.com/novel/' + String(n).replace(/^bhm-/, ''),
  'Yuristars': (n) => 'https://app.lilyverse.co/novels/' + String(n).replace(/^yst-/, ''),
  'note': (n) => 'https://note.com/notes/' + String(n).replace(/^nt-/, ''),
  'AO3': (n) => 'https://archiveofourown.org/works/' + String(n).replace(/^ao3-/, ''),
  'pixiv小説': (n) => 'https://www.pixiv.net/novel/show.php?id=' + String(n).replace(/^px-/, ''),
  '노벨피아': (n) => 'https://novelpia.com/novel/' + String(n).replace(/^np-/, ''),
  'Penana': (n) => 'https://www.penana.com/story/' + String(n).replace(/^pen-/, ''),
  '女同文学（策展）': (n) => 'https://www.google.com/search?q=' + encodeURIComponent(String(n || '').replace(/^lit-/, '')) + '+lesbian+novel',
  'Project Gutenberg': (n) => 'https://www.gutenberg.org/ebooks/' + String(n).replace(/^pg-/, ''),
  'Open Library': (n) => 'https://openlibrary.org/works/' + String(n).replace(/^ol-/, ''),
  'Sapphic Books': (n) => 'https://sapphicbooks.com/',
  'NovelFlow': (n) => 'https://www.novelflow.app/novel/' + String(n).replace(/^nf-/, ''),
  'GoodNovel': (n) => 'https://www.goodnovel.com/book/' + String(n).replace(/^gn-/, ''),
  'Readeve': (n) => 'https://www.readeve.com/book/' + String(n).replace(/^rv-/, ''),
  '豆瓣阅读': (n) => 'https://read.douban.com/ebook/' + String(n).replace(/^db-/, '') + '/',
  'Wattpad': (n) => 'https://www.wattpad.com/story/' + String(n).replace(/^wp-/, ''),
  'アルファポリス': (n) => 'https://www.alphapolis.co.jp/novel/' + String(n).replace(/^ap-/, ''),
};
function bookUrl(src, id) {
  const f = URL_RULES[src];
  return f && id ? f(String(id)) : '';
}

function mapNarou(list) {
  return (list || []).map((x) => {
    const ncode = String(x.n || x.ncode || '');
    const title = String(x.t || x.title || '');
    const src = x.s || x.src || 'なろう';
    const origSrc = x._orig || src;   // 已消失的作品用原来源推导链接
    const url = x.u || x.url || bookUrl(origSrc, ncode);
    const len = Number(x.l || x.length || 0);
    return {
      id: ncode,
      title,
      author: x.a || x.author || '',
      category: src,
      ext: 'web',
      size: len * 500,
      digest: x.summary || '',
      bio: '',
      url,
      srcName: '在' + src + '阅读',
      zh: x.z || x.zh || ZH_MAP[ncode] || ZH_MAP[ncode.toUpperCase()] || '',
      tags: Array.isArray(x.g) ? x.g : [],
      lang: x.lang || '',
      meta: len > 0 ? len.toLocaleString() + ' 字' : '',
    };
  }).filter((b) => b.title && b.url);
}

function applyCatalog(list, note) {
  const mapped = mapNarou(list);
  if (!mapped.length) return false;
  applyBooks(mapped);
  NAROU_LOADED = mapped.length;
  const rl = $('#result-line');
  if (rl) rl.textContent = note || ('なろう（小説家になろう）· 共 ' + mapped.length + ' 部百合作品');
  return true;
}

/* ① 静态快照(永远可用) → ② 后台尝试实时 API(拿更多) */
async function loadNarou() {
    // 骨架屏：加载数据前先占位
    try {
      const g = document.getElementById('file-list');
      if (g && !g.children.length) {
        g.innerHTML = Array.from({ length: 6 }).map(function () {
          return '<div class="nv-item skel"><div class="sk-line w70"></div><div class="sk-line w45"></div><div class="sk-btn"></div></div>';
        }).join('');
      }
    } catch (_) {}
    // ② 回退: 老的单文件
  const box = $('#empty');
  // ① 本地快照
      // 并发拉取分片 + 可见状态
      const st = document.getElementById('result-line');
      if (st) st.textContent = '⏳ 正在加载书目数据…';
try {
        const PARTS = ["data/part-00.json", "data/part-01.json", "data/part-02.json", "data/part-03.json", "data/part-04.json", "data/part-05.json", "data/part-06.json", "data/part-07.json", "data/part-08.json", "data/part-09.json", "data/part-10.json", "data/part-11.json", "data/part-12.json", "data/part-13.json", "data/part-14.json", "data/part-15.json", "data/part-16.json", "data/part-17.json", "data/part-18.json", "data/part-19.json", "data/part-20.json", "data/part-21.json", "data/part-22.json", "data/part-23.json", "data/part-24.json", "data/part-25.json", "data/part-26.json", "data/part-27.json", "data/part-28.json", "data/part-29.json", "data/part-30.json", "data/part-31.json", "data/part-32.json", "data/part-33.json", "data/part-34.json", "data/part-35.json", "data/part-36.json", "data/part-37.json", "data/part-38.json", "data/part-39.json", "data/part-40.json", "data/part-41.json", "data/part-42.json", "data/part-43.json", "data/part-44.json", "data/part-45.json", "data/part-46.json", "data/part-47.json", "data/part-48.json", "data/part-49.json", "data/part-50.json", "data/part-51.json", "data/part-52.json", "data/part-53.json", "data/part-54.json", "data/part-55.json", "data/part-56.json", "data/part-57.json", "data/part-58.json", "data/part-59.json", "data/part-60.json", "data/part-61.json", "data/part-62.json", "data/part-63.json", "data/part-64.json", "data/part-65.json", "data/part-66.json", "data/part-67.json", "data/part-68.json", "data/part-69.json", "data/part-70.json", "data/part-71.json", "data/part-72.json", "data/part-73.json", "data/part-74.json", "data/part-75.json", "data/part-76.json", "data/part-77.json", "data/part-78.json", "data/part-79.json", "data/part-80.json", "data/part-81.json", "data/part-82.json", "data/part-83.json", "data/part-84.json", "data/part-85.json", "data/part-86.json", "data/part-87.json", "data/part-88.json", "data/part-89.json", "data/part-90.json", "data/part-91.json", "data/part-92.json", "data/part-93.json", "data/part-94.json", "data/part-95.json", "data/part-96.json", "data/part-97.json", "data/part-98.json", "data/part-99.json", "data/part-100.json", "data/part-101.json", "data/part-102.json", "data/part-103.json", "data/part-104.json", "data/part-105.json", "data/part-106.json", "data/part-107.json", "data/part-108.json", "data/part-109.json", "data/part-110.json", "data/part-111.json", "data/part-112.json", "data/part-113.json", "data/part-114.json", "data/part-115.json", "data/part-116.json", "data/part-117.json", "data/part-118.json", "data/part-119.json"];
        if (st) st.textContent = '⏳ 正在加载全部书目…';
        const results = await Promise.all(PARTS.map(function (f) {
          return fetch(f + '?v=' + BUILD).then(function (r) { return r.ok ? r.json() : null; })
            .catch(function (e) { return { __err: f + ':' + String((e && e.message) || e).slice(0, 25) }; });
        }));
        let all = [];
        const errs = [];
        let okN = 0;
        for (const jj of results) {
          if (!jj) { errs.push('空响应'); continue; }
          if (jj.__err) { errs.push(jj.__err); continue; }
          okN++;
          if (jj.list) all = all.concat(jj.list);
        }
        if (all.length) {
          const seen = Object.create(null);
          const uniq = [];
          for (const x of all) { if (!seen[x.n]) { seen[x.n] = 1; uniq.push(x); } }
          applyCatalog(uniq, '共 ' + uniq.length.toLocaleString() + ' 部百合/GL 作品');
        } else if (st) {
          st.textContent = '⚠️ 数据加载失败（成功 ' + okN + '/' + PARTS.length + ' 片）' + (errs.length ? ' · ' + errs.slice(0, 2).join(' | ') : '');
        }
      } catch (e) {
        if (st) st.textContent = '⚠️ 加载异常: ' + String((e && e.message) || e).slice(0, 70);
      }

}
function zbOpen(b, plat) {
  const list = zbListFor(b);
  const p = list.find((x) => x.k === plat) || list[0];
  if (p) window.open(p.url(zbQuery(b)), '_blank', 'noopener');
}

/* ---------- 百合/GL 站点大全 ---------- */
async function loadSites() {
  const box = $('#sites-list');
  if (!box) return;
  try {
    const r = await fetch('sites.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('sites ' + r.status);
    const groups = await r.json();
    const all = groups.reduce((a, g) => a.concat(g.sites || []), []);
    const vpnN = all.filter((x) => x.vpn).length;
    const cnt = $('#vpn-count');
    if (cnt) cnt.textContent = `（共 ${all.length} 站 · 其中 ${vpnN} 站需网络工具）`;
    box.innerHTML = groups.map((g) => `
      <div class="site-group">
        <div class="site-region">${escapeHtml(g.region)}</div>
        <div class="site-cards">
          ${(g.sites || []).map((x) => {
            const home = x.url || '#';
            const yuri = x.yurl || home;
            return `<div class="site-card${x.vpn ? ' need-vpn' : ''}">
              <b>${escapeHtml(x.name)}${x.vpn ? ' <span class="vpn-badge">🌐 需网络工具</span>' : ''}</b>
              ${x.yuri ? `<span class="site-yuri">🌸 百合专区：${escapeHtml(x.yuri)}</span>` : ''}
              <span class="site-desc">${escapeHtml(x.desc || '')}</span>
              <div class="site-actions">
                <a class="sa-yuri" href="${yuri}" target="_blank" rel="noopener noreferrer">🌸 进百合专区</a>
                <a class="sa-home" href="${home}" target="_blank" rel="noopener noreferrer">🏠 站首页</a>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`).join('');
  } catch (_) {
    box.innerHTML = '<p class="empty">站点清单加载失败，请刷新重试</p>';
  }
}

/* ---------- 列表排版 ---------- */
const LAYOUT_KEY = 'list-layout';
const COLS_KEY = 'list-cols';
const COMPACT_KEY = 'list-compact';
const PAGE_SIZE_BY_COLS = { 1: 50, 2: 60, 3: 60, 4: 80, 5: 100, 6: 120 };
function getCols() { try { const v = parseInt(localStorage.getItem(COLS_KEY) || '1', 10); return (v >= 1 && v <= 6) ? v : 1; } catch (_) { return 1; } }
function getCompact() { try { return localStorage.getItem(COMPACT_KEY) === '1'; } catch (_) { return false; } }
function pageSizeOf() { return PAGE_SIZE_BY_COLS[getCols()] || 50; }

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
let __catCount = null;
let __visCache = { key: '', list: null };   // ← 之前漏了声明, 导致 strict 模式报错
function buildCatCount() {
  const m = {};
  for (let i = 0; i < state.books.length; i++) {
    const c = state.books[i].category;
    if (c) m[c] = (m[c] || 0) + 1;
  }
  m['全部'] = state.books.length;
  __catCount = m;
}
function countOf(cat) {
  if (!__catCount) buildCatCount();
  return __catCount[cat] || 0;
}
function renderChips() {
  const chips = $('#catChips');
  chips.innerHTML = '';
  // 大分类: 百合(全部)
  const parent = el('button', 'chip chip-parent' + (state.cat === '全部' ? ' active' : ''));
  parent.innerHTML = `🌼 百合<span class="chip-count">${state.books.length}</span>`;
  parent.addEventListener('click', () => { state.cat = '全部'; state.page = 1; renderList(); });
  chips.appendChild(parent);
  // 子分类
  const found = state.books.map((b) => b.category).filter(Boolean);
    const cats = [...new Set([...DEFAULT_CATS, ...found])]
      .filter((c) => c && c !== '全部' && (countOf(c) > 0 || c === state.cat));
  if (cats.length) {
    chips.appendChild(el('span', 'chip-sep', '子分类'));
    cats.forEach((c) => {
      const b = el('button', 'chip chip-sub' + (c === state.cat ? ' active' : ''));
      b.innerHTML = `${escapeHtml(c)}<span class="chip-count">${countOf(c)}</span>`;
      b.addEventListener('click', () => { state.cat = c; state.page = 1; renderList(); });
      chips.appendChild(b);
    });
  }
  // ★ 语种筛选 ✗
  const langBox = $('#langChips');
  if (langBox) {
    langBox.innerHTML = '';
    const langCount = {};
    state.books.forEach((b) => { const L = b.lang || ''; if (L) langCount[L] = (langCount[L] || 0) + 1; });
    const langs = Object.keys(langCount).sort((a, b) => langCount[b] - langCount[a]);
    if (langs.length) {
      const all = el('button', 'chip chip-parent' + (state.lang === '全部' ? ' active' : ''));
      all.innerHTML = `🌏 全部语种<span class="chip-count">${state.books.length}</span>`;
      all.addEventListener('click', () => { state.lang = '全部'; state.page = 1; renderList(); });
      langBox.appendChild(all);
      langs.forEach((L) => {
        const b = el('button', 'chip chip-lang' + (L === state.lang ? ' active' : ''));
        b.innerHTML = `${escapeHtml(L)}<span class="chip-count">${langCount[L]}</span>`;
        b.addEventListener('click', () => { state.lang = L; state.page = 1; renderList(); });
        langBox.appendChild(b);
      });
    }
  }
}


/* ---------- 筛选 ---------- */
function visible() {
  let l = state.books.slice();
  if (state.lang && state.lang !== '全部') l = l.filter((b) => (b.lang || '') === state.lang);
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
  const cols = getCols(), compact = getCompact();
  grid.className = '';
  grid.style.setProperty('--cols', String(cols));
  const effCols = (window.innerWidth <= 640) ? Math.min(cols, 2) : cols;
  grid.style.gridTemplateColumns = 'repeat(' + effCols + ', minmax(0, 1fr))';
  grid.style.setProperty('--gap', cols >= 4 ? '8px' : '10px');
  grid.dataset.cols = String(cols);
  grid.dataset.compact = compact ? '1' : '0';
  const list = visible();
  const total = state.books.length;
  $('#total-count').textContent = total;
  try { updateTabCounts(); } catch (_) {}

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
    const item = el('div', 'nv-item');
    const t = b.url
      ? `<a class="nv-title" href="${b.url}" target="_blank" rel="noopener noreferrer" title="点击直达作品页">${hl(b.title, state.q)}</a>`
      : `<span class="nv-title">${escapeHtml(b.title)}</span>`;
    const src = b.category || b.src || '';
    const links = b.url
      ? `<div class="nv-links"><a class="zb-link zb-src" href="${b.url}" target="_blank" rel="noopener noreferrer">📖 ${escapeHtml(src)} 直达阅读</a></div>`
      : '';
      const gone = src === '已消失的百合';
      const tagList = Array.isArray(b.tags) ? b.tags : [];
      const tags = tagList.length
        ? tagList.map((g) => `<span class="nv-tag${/^同人$/.test(g) ? ' doujin' : (/完结/.test(g) ? ' done' : (/连载/.test(g) ? ' on' : ''))}">${escapeHtml(g)}</span>`).join('')
        : '';
      item.innerHTML =
        `<div class="nv-head">${t}</div>` +
        (b.author ? `<div class="nv-author-line">✍ ${hl(b.author, state.q)}</div>` : '') +
        (b.zh ? `<div class="nv-zh">${escapeHtml(b.zh)}</div>` : '') +
        `<div class="nv-meta-line">` +
          (src ? `<span class="nv-src${gone ? ' nv-gone' : ''}">${gone ? '🕯 ' : ''}出自 ${escapeHtml(src)}</span>` : '') +
          (tags ? tags : '') +
          (b.meta ? `<span class="nv-note">${escapeHtml(b.meta)}</span>` : '') +
        `</div>` + links;
    grid.appendChild(item);
  });

  // 分页控件
  const pager = $('#pager');
  pager.hidden = list.length <= pageSizeOf();
  $('#pg-info').textContent = `第 ${state.page} / ${pages} 页`;
  $('#pg-prev').disabled = state.page <= 1;
  $('#pg-next').disabled = state.page >= pages;
  const jp = $('#pg-jump');
  if (jp) {
    jp.max = String(pages);
    jp.placeholder = '1-' + pages;
    if (document.activeElement !== jp) jp.value = String(state.page);
  }
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
const ABACUS_NS = 'yuri-novel-views';
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
    (b.meta ? `<div class="dm-item"><b>规模</b> ${escapeHtml(b.meta)}</div>` : '') +
    `<div class="dm-item"><b>浏览量</b> <span id="detail-views">读取中…</span></div>`;
  $('#detail-tags').innerHTML = '';
  $('#detail-summary').textContent =
    (b.digest ? '【内容大概】\n' + b.digest + '\n\n' : '') +
    (b.bio ? '【作者简介】\n' + b.bio + '\n\n' : '') +
    '本站只提供书目索引，不提供下载与在线阅读。请点击上方平台前往正版渠道阅读或购买，支持作者。';
  const zbBox = $('#detail-zb');
  if (zbBox) zbBox.innerHTML = zbLinkHtml(b);
  rdPushHistory(b);                      // 记录浏览
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

function openReader() {
  rdToast('本站不提供在线阅读，请点击「正版平台」前往正版渠道 📗');
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
// 窗口尺寸变化时重排列数
let __rsz;
window.addEventListener('resize', () => {
  clearTimeout(__rsz);
  __rsz = setTimeout(() => { try { renderList(); } catch (_) {} }, 200);
});

// "/" 快捷键聚焦搜索
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault();
    const i = $('#search');
    if (i) { i.focus(); i.select(); }
  }
});
// 回到顶部按钮
(function initTop() {
  const btn = document.createElement('button');
  btn.id = 'scroll-top'; btn.type = 'button'; btn.title = '回到顶部';
  btn.textContent = '↑';
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(btn);
  const onScroll = () => { btn.classList.toggle('show', window.scrollY > 600); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

const jpEl = $('#pg-jump');
if (jpEl) {
  const goPage = () => {
    const n = parseInt(jpEl.value, 10);
    if (!n || n < 1) return;
    state.page = n;
    renderList();
    scrollToListTop();
  };
  jpEl.addEventListener('change', goPage);
  jpEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); goPage(); } });
}

const scEl = $('#search-clear');
function syncSearchClear() {
  const i = $('#search');
  if (scEl && i) scEl.hidden = !i.value;
}
if (scEl) {
  scEl.addEventListener('click', () => {
    const i = $('#search');
    if (i) { i.value = ''; state.q = ''; state.page = 1; renderList(); i.focus(); }
    scEl.hidden = true;
  });
}
$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.target.value = ''; state.q = ''; state.page = 1; syncSearchClear(); renderList(); }
  if (e.key === 'Enter') { state.page = 1; renderList(); }
});
let __searchTimer;
$('#search').addEventListener('input', (e) => {
  const v = e.target.value;
  state.q = v; state.page = 1; syncSearchClear();
  clearTimeout(__searchTimer);
  __searchTimer = setTimeout(() => renderList(), 180);   // 防抖: 输入停顿 180ms 才渲染
});
$('#f-ext')?.addEventListener('change', (e) => { state.ext = e.target.value; state.page = 1; renderList(); });
$('#f-size')?.addEventListener('change', (e) => { state.size = e.target.value; state.page = 1; renderList(); });
$('#f-sort').addEventListener('change', (e) => { state.sort = e.target.value; renderList(); });
const colsEl = $('#f-cols');
if (colsEl) {
  colsEl.value = String(getCols());
  colsEl.addEventListener('change', (e) => {
    try { localStorage.setItem(COLS_KEY, e.target.value); } catch (_) {}
    state.page = 1; renderList();
  });
}
const cpEl = $('#f-compact');
if (cpEl) {
  cpEl.checked = getCompact();
  cpEl.addEventListener('change', (e) => {
    try { localStorage.setItem(COMPACT_KEY, e.target.checked ? '1' : '0'); } catch (_) {}
    state.page = 1; renderList();
  });
}
// 翻页：只把「列表顶部」滚到视野内，不跳页面顶部
function scrollToListTop() {
  try {
    const grid = $('#file-list');
    if (!grid) return;
    const y = grid.getBoundingClientRect().top + window.scrollY - 90;
    if (Math.abs(window.scrollY - y) > 8) window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  } catch (_) {}
}
$('#pg-prev').addEventListener('click', () => {
  if (state.page > 1) { state.page--; renderList(); scrollToListTop(); }
});
$('#pg-next').addEventListener('click', () => {
  const pages = Math.max(1, Math.ceil(visible().length / pageSizeOf()));
  if (state.page < pages) { state.page++; renderList(); scrollToListTop(); }
});
$('#detail-close').addEventListener('click', closeDetail);
$('#detail-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDetail(); });

// 在线阅读已移除：仅当阅读器界面存在时才绑定事件
if (document.getElementById("reader")) {
  /* ---------- 阅读器事件 ---------- */
  // (在线阅读已移除：本站只做正版指引)
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

}
/* ---------- 书架事件 ---------- */
$('#open-shelf').addEventListener('click', () => openShelf('hist'));
$('#shelf-close').addEventListener('click', closeShelf);
$('#tab-hist').addEventListener('click', () => openShelf('hist'));
// (书签功能已移除：无在线阅读)
$('#tab-fav').addEventListener('click', () => openShelf('fav'));
$('#detail-fav').addEventListener('click', () => { if (state.current) toggleFav(state.current); });
$('#shelf-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeShelf(); });
$('#shelf-clear').addEventListener('click', () => {
  const msg = shelfTab === 'hist' ? '确定清空全部浏览记录？' : '确定清空全部收藏？';
  if (!window.confirm(msg)) return;
  if (shelfTab === 'hist') rdSet('rd-history', []); else rdSet('rd-favs', []);
  renderShelf();
});
$('#shelf-list').addEventListener('click', (e) => {
  const item = e.target.closest('.shelf-item');
  if (!item) return;
  if (item.dataset.act === 'open') {
    const b = state.books.find((x) => x.id === item.dataset.id);
    if (!b) { rdToast('这本书找不到了'); return; }
    closeShelf(); openDetail(b);
  } else if (item.dataset.act === 'mark') {
    const m = rdGet('rd-marks', [])[Number(item.dataset.idx)];
    if (!m) return;
    const b = state.books.find((x) => x.id === m.id);
    if (!b) { rdToast('这本书找不到了'); return; }
    rdPendingPos = m;
    closeShelf(); openDetail(b);
  }
});
// 点击阅读区翻页: 左侧 1/3 上一页, 其余下一页
if (document.getElementById('reader-content')) $('#reader-content').addEventListener('click', (e) => {
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
if (document.getElementById('reader-content')) $('#reader-content').addEventListener('scroll', () => {
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
  if (b) { btn.hidden = false; btn.textContent = `🕘 最近浏览《${b.title}》`; btn.onclick = () => openDetail(b); }
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
if (document.getElementById('rd-font')) $('#rd-font').addEventListener('change', (e) => {
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
  const th = $('#tab-hist'); if (th) th.classList.toggle('active', shelfTab === 'hist');
  const tf = $('#tab-fav'); if (tf) tf.classList.toggle('active', shelfTab === 'fav');
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
const RD_CAT_KEY = 'random-cat';
function randomCat() { try { return localStorage.getItem(RD_CAT_KEY) || '全部'; } catch (_) { return '全部'; } }
function pickRandom(n) {
  const __cat = randomCat();
  const all = (__cat && __cat !== '全部') ? state.books.filter((bb) => bb.category === __cat) : state.books;
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
  box.innerHTML = list.map((b) => {
      const t = b.url
        ? `<a class="nv-title" href="${b.url}" target="_blank" rel="noopener noreferrer" title="点击直达作品页">${hl(b.title, state.q)}</a>`
        : `<span class="nv-title">${escapeHtml(b.title)}</span>`;
      const src = b.category || '';
      return `<div class="nv-item">` +
        `<div class="nv-head">${t}</div>` +
        (b.author ? `<div class="nv-author-line">✍ ${hl(b.author, state.q)}</div>` : '') +
        (b.zh ? `<div class="nv-zh">${escapeHtml(b.zh)}</div>` : '') +
        `<div class="nv-meta-line">` +
          (src ? `<span class="nv-src">出自 ${escapeHtml(src)}</span>` : '') +
          (b.meta ? `<span class="nv-note">${escapeHtml(b.meta)}</span>` : '') +
        `</div>` +
        (b.url ? `<div class="nv-links"><a class="zb-link zb-src" href="${b.url}" target="_blank" rel="noopener noreferrer">📖 ${escapeHtml(src)} 直达阅读</a></div>` : '') +
      `</div>`;
    }).join('');

  const find = (id) => list.find((x) => x.id === id);
  box.querySelectorAll('[data-open-btn]').forEach((n) => n.addEventListener('click', (e) => { e.stopPropagation(); const b = find(n.dataset.openBtn); if (b) openDetail(b); }));
  box.querySelectorAll('[data-zb]').forEach((n) => n.addEventListener('click', (e) => { e.stopPropagation(); const b = find(n.dataset.zb); if (b) zbOpen(b, 'wx'); }));
  box.querySelectorAll('.rnd-item').forEach((n) => n.addEventListener('click', () => { const b = find(n.dataset.open); if (b) openDetail(b); }));
}
// 随机分类选择器
function initRandomCat() {
  const sel = $('#random-cat');
  if (!sel) return;
  const cats = ['全部', ...new Set(state.books.map((b) => b.category).filter(Boolean))];
  const cur = randomCat();
  sel.innerHTML = cats.map((c) => {
    const n = c === '全部' ? state.books.length : state.books.filter((b) => b.category === c).length;
    return '<option value="' + escapeHtml(c) + '"' + (c === cur ? ' selected' : '') + '>' + escapeHtml(c) + '（' + n + '）</option>';
  }).join('');
  if (!cats.includes(cur)) { sel.value = '全部'; try { localStorage.setItem(RD_CAT_KEY, '全部'); } catch (_) {} }
}
if ($('#random-cat')) {
  $('#random-cat').addEventListener('change', (e) => {
    try { localStorage.setItem(RD_CAT_KEY, e.target.value); } catch (_) {}
    renderRandom();
  });
}
if ($('#random-refresh')) $('#random-refresh').addEventListener('click', renderRandom);

/* ---------- 星光特效(降载) ---------- */
let sparklePaused = false;
document.addEventListener('visibilitychange', () => { sparklePaused = document.hidden; });
(function sparkles() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.getElementById('sparkles');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  let w = cv.width = cv.offsetWidth, h = cv.height = cv.offsetHeight;
  const n = Math.max(8, Math.min(18, Math.floor(window.innerWidth / 70)));
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
      bio: v('bio', 'b') || '',
      url: b.url || '', zh: b.zh || '', meta: b.meta || '', srcName: b.srcName || '',
      tags: b.tags || [],
        lang: b.lang || '',
    };
    o.name = b.name || String(o.path || '').split('/').pop();
    return o;
  });
}
function applyBooks(list) {
  __catCount = null; __visCache = { key: '', list: null };
  setTimeout(() => { try { updateTabCounts(); } catch (_) {} }, 20);
  setTimeout(() => { try { initRandomCat(); renderRandom(); } catch (_) {} }, 30);
  state.books = normalize(list);
  renderChips();
  renderList();
  renderRandom();
  updateContinueBtn();
}
/* ---------- 视图切换（书目 / 站点）---------- */
const VIEW_KEY = 'nav-view';
function switchView(name) {
  const books = document.getElementById('view-books');
  const sites = document.getElementById('view-sites');
  if (!books || !sites) return;
  books.hidden = name !== 'books';
  sites.hidden = name !== 'sites';
  document.querySelectorAll('#viewTabs .vtab').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  try { localStorage.setItem(VIEW_KEY, name); } catch (_) {}
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('#viewTabs .vtab').forEach((b) => {
  b.addEventListener('click', () => switchView(b.dataset.view));
});
try {
  const v = localStorage.getItem(VIEW_KEY);
  if (v === 'sites') switchView('sites');
} catch (_) {}
// 标签上的数量
function updateTabCounts() {
  const b = document.getElementById('vt-books');
  const s = document.getElementById('vt-sites');
  if (b) b.textContent = state.books.length ? state.books.length.toLocaleString() : '…';
  if (s) {
    const n = document.querySelectorAll('#sites-list .site-card').length;
    s.textContent = n ? n : '…';
  }
}
/* 已移除轮询定时器（性能优化）*/

async function boot() {
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
  loadSites();
  await loadZhMap();
  loadNarou();
  try {
    const m = location.hash.match(/^#read=(.+)$/);
    if (m) {
      const b = state.books.find((x) => x.id === decodeURIComponent(m[1]));
      if (b) setTimeout(() => openReader(b), 120);
    }
  } catch (_) {}
}

/* ---------- Service Worker (离线/秒开) ---------- */
/* Service Worker 已停用（缓存导致用户看到旧版本）*/

/* 启动 */
boot();
