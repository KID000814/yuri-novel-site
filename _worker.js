/**
 * Cloudflare Pages 高级模式 Worker
 *
 * 唯一职责：按访客所在国家/地区做访问控制。
 *   · 日本 (JP) / 韩国 (KR) → 403 提示页
 *   · 其他地区 → 正常返回静态站点
 *
 * 说明：
 *   `*.pages.dev` 子域不支持 Cloudflare WAF 自定义规则，
 *   所以这里用 Worker 读取 request.cf.country 自行判定。
 *   静态资源（HTML/JS/CSS/JSON）全部照常返回，不影响任何功能。
 */

const BLOCKED = new Set(['JP', 'KR']);

const REASON = {
  JP: { flag: '🇯🇵', name: '日本', msg: '日本からのアクセスは現在ご利用いただけません。' },
  KR: { flag: '🇰🇷', name: '한국', msg: '현재 한국에서의 접속은 이용하실 수 없습니다.' },
};

function blockPage(country) {
  const r = REASON[country] || { flag: '🚫', name: country, msg: '' };
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>访问受限 · 百合小说导航站</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(160deg, #f7f5ff 0%, #eef1ff 45%, #f4f7ff 100%);
    font-family: "Yu Gothic UI", "Malgun Gothic", -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: #3a3550; padding: 24px;
  }
  .card {
    max-width: 520px; width: 100%; text-align: center;
    background: rgba(255,255,255,.72); backdrop-filter: blur(10px);
    border: 1px solid rgba(216,210,255,.9); border-radius: 18px;
    padding: 40px 32px; box-shadow: 0 12px 40px rgba(150,130,200,.18);
  }
  .flag { font-size: 54px; line-height: 1; }
  h1 { font-size: 21px; margin: 18px 0 8px; letter-spacing: .5px; }
  p { font-size: 14px; line-height: 1.75; color: #6b6485; margin: 6px 0; }
  .en { font-size: 12.5px; color: #8a83a8; margin-top: 18px; }
  .hr { height: 1px; background: linear-gradient(90deg, transparent, #d8d2ff, transparent); margin: 22px 0; }
  .back { display: inline-block; margin-top: 20px; font-size: 13px; color: #8a6fd8; text-decoration: none; }
  .back:hover { text-decoration: underline; }
</style>
</head>
<body>
  <div class="card">
    <div class="flag">${r.flag}</div>
    <h1>本地区暂不开放访问</h1>
    <p>本站目前限制来自 <b>${r.name}</b> 的访问。</p>
    <p>${r.msg}</p>
    <div class="hr"></div>
    <p class="en">
      Access from your region is currently restricted.<br />
      This site does not host any novel content — it is a bibliography index only.
    </p>
    <a class="back" href="https://yuri-nav.pages.dev/">↩ 返回首页</a>
  </div>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const country = (request.cf && request.cf.country) || '';

    if (BLOCKED.has(country)) {
      return new Response(blockPage(country), {
        status: 403,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store, no-cache, must-revalidate',
          'x-robots-tag': 'noindex, nofollow',
          'vary': 'CF-IPCountry',
        },
      });
    }

    // 正常返回静态资源，并告知 CDN 响应随国家变化
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    headers.set('vary', 'CF-IPCountry');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
