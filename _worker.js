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
    const __u = new URL(request.url);

    // ── 临时通用代理（测试 CF 边缘能否直连外国站）──
    if (__u.pathname === '/api/fetch') {
      const target = __u.searchParams.get('u');
      if (!target) return new Response('missing ?u=', { status: 400 });
            const allow = [
                     'jjwxc.net', 'gongzicp.com', 'popo.tw',
                     'yamibo.com', 'qidian.com', 'qdmm.com',
                     'zongheng.com', '17k.com', 'tadu.com',
                     'qimao.com', 'zhangyue.com', 'sfacg.com',
                     'ciweimao.com', 'hanmoto.com', 'linovelib.com',
                     'wenku8.net', 'douban.com', 'lofter.com',
                     'weibo.com', 'bilibili.com', '69shuba.com',
                     'novelhall.com', 'ranobes.net', 'syosetu.com',
                     'syosetu.org', 'kakuyomu.jp', 'alphapolis.co.jp',
                     'pixiv.net', 'note.com', 'novelup.plus',
                     'hameln.com', 'aozora.gr.jp', 'novel18.syosetu.com',
                     'yomou.syosetu.com', 'novelpia.com', 'joara.com',
                     'munpia.com', 'novelmania.co.kr', 'ridibooks.com',
                     'series.naver.com', 'archiveofourown.org', 'fanfiction.net',
                     'fictionpress.com', 'royalroad.com', 'inkitt.com',
                     'wattpad.com', 'tapas.io', 'scribblehub.com',
                     'quotev.com', 'tumblr.com', 'webnovel.com',
                     'goodnovel.com', 'dreame.com', 'novelupdates.com',
                     'mangadex.org', 'mangaupdates.com', 'anilist.co',
                     'bato.to', 'mangago.me', 'fanmtl.com',
                     'neovel.io', 'spacebattles.com', 'sufficientvelocity.com',
                     'questionablequesting.com', 'alternatehistory.com', 'author.today',
                     'litnet.com', 'ficbook.net', 'ranobehub.org',
                     'ranobelib.me', 'novel.tl', 'readawrite.com',
                     'dek-d.com', 'noveltoon.com', 'fictionlog.co',
                     'tunwalai.com', 'truyenfull.vn', 'truyenfull.vision',
                     'wikidich.com', 'truyenconvert.net', 'metruyenchu.com',
                     'spiritfanfics.com', 'nyquil.org', 'novelasligeras.net',
                     'skyatria.com', 'fanfiktion.de', 'efpfanfic.net',
                     'fanfiction-fr.net', 'fikaton.pl', 'cabaca.id',
                     'storial.co', 'truyenwiki.com', 'sstruyen.vn',
                     'truyenvn.vip', 'truyencv.com', 'truyenmoi.com',
                     'thaionline.net', 'karya.co.id', 'pratilipi.com',
                     'belletristica.com', 'geschichten-online.de', 'francefanfiction.fr',
                     'fanfiction.es', 'nyah.com.br', 'fanfictionitalia.net',
                     'opowiadania.pl', 'kurgusitesi.com', 'riwayat.net',
                     'hindawi.org', 'fanfiction.gr', 'webnovel.cz',
                     'prodaman.ru', 'rulate.ru', 'jaomix.ru',
                     'bookscafe.net', 'knigogid.ru', 'myanimelist.net',
                     'bookwalker.jp', 'booklive.jp', 'cmoa.jp',
                     'honto.jp', 'yes24.com', 'aladin.co.kr',
                     'kyobobook.co.kr', 'weread.qq.com', 'zhihu.com',
                     'jianshu.com', 'm.webnovel.com'
      ,
                     'api.postype.com', 'postype.com',
                     'www.postype.com',
                     'page.kakao.com',
                     'bookcube.com',
                     'one-store.com',
                     'brunch.co.kr',
                     'tistory.com',
                     'tokyo-sogensha.jp',
                     'shueisha.co.jp',
                     'ichijinsha.co.jp',
                     'houbunsha.co.jp',
                     'kadokawa.co.jp',
                     'yenpress.com',
                     'sevenseasentertainment.com',
                     'j-novel.club',
                     'crossinfworld.com',
                     'tentaibooks.com',
                     'okazu.yuricon.com',
                     'yuricon.com',
                     'dynasty-scans.com',
                     'anime-planet.com',
                     'goodreads.com',
                     'anidb.net',
                     'bangumi.tv',
                     'bgm.tv',
                     'moegirl.org.cn',
                     'zh.moegirl.org.cn',
                     'yuri.website',
                     'stage1st.com',
                     'bbs.saraba1st.com',
                     'nga.178.com',
                     'tieba.baidu.com',
                     'reddit.com',
                     'www.reddit.com',
                     'namu.wiki',
                     'en.namu.wiki',
                     'r.jina.ai',
                     'api.allorigins.win',
                     'allorigins.win',
                     'web.archive.org',
                     'archive.org',
                     'corsproxy.io',
                     'api.codetabs.com',
                     'cors-anywhere.herokuapp.com',
                     'proxy.cors.sh',
                     'thingproxy.freeboard.io',
                     'api.scraperapi.com',
                     'api.scrapingant.com',
                     'www.textise.net',
                     '12ft.io',
                     'translate.google.com',
                     'translate.googleapis.com',
                     'www.google.com',
                     'truyenfull.live',
                     'truyenhd.com',
                     'truyentranhz.net',
                     'www.readawrite.com',
                     'www.dek-d.com',
                     'www.noveltoon.com',
                     'www.cabaca.id',
                     'noveltoon.id',
                     'www.pratilipi.com',
                     'www.hindawi.org',
                     'kotobati.com',
                     'alnoorbook.com',
                     'rulit.me',
                     'litmir.me',
                     'royallib.com',
                     'loveread.ec',
                     'litres.ru',
                     'booksie.com',
                     'www.booksie.com',
                     'movellas.com',
                     'www.movellas.com',
                     'commaful.com',
                     'honeyfeed.fm',
                     'www.honeyfeed.fm',
                     'novelcat.com',
                     'www.novelcat.com',
                     'fizzo.org',
                     'www.fizzo.org',
                     'innovel.com',
                     'www.innovel.com',
                     'matrubharti.com',
                     'www.matrubharti.com',
                     'nojoto.com',
                     'www.nojoto.com',
                     'storyweaver.org.in',
                     '1000kitap.com',
                     'www.1000kitap.com',
                     'ookbee.com',
                     'www.ookbee.com',
                     'joylada.com',
                     'www.joylada.com',
                     'nettruyen.com',
                     'www.nettruyen.com',
                     'truyenqq.com',
                     'www.truyenqq.com',
                     'mangatoon.mobi',
                     'www.mangatoon.mobi',
                     'substack.com',
                     'www.substack.com',
                     'radishfiction.com',
                     'www.radishfiction.com',
                     'bookmate.com',
                     'www.bookmate.com',
                     'www.litres.ru',
                     'proza.ru',
                     'www.proza.ru',
                     'ridero.ru',
                     'www.ridero.ru',
                     'litgorod.ru',
                     'www.litgorod.ru',
                     'recanto.com.br',
                     'www.recanto.com.br',
                     'simania.co.il',
                     'www.simania.co.il',
                     'fidibo.com',
                     'www.fidibo.com',
                     'taghche.com',
                     'www.taghche.com',
                     'ketabrah.ir',
                     'www.ketabrah.ir',
                     'bookme.co.il',
                     'www.bookme.co.il',
                     'www.wattpad.com',
                     'www.fictionpress.com',
                     'storybird.com',
                     'www.storybird.com',
                     'penana.com',
                     'www.penana.com',
                     'www.quotev.com',
                     'www.fanfiction.gr',
                     'www.fanfiktion.de',
                     'www.efpfanfic.net',
                     'www.spiritfanfics.com',
                     'www.nyah.com.br',
                     'writing.com',
                     'www.writing.com',
                     'fictionpad.com',
                     'www.fictionpad.com',
                     'storywrite.com',
                     'www.storywrite.com',
                     'bookrix.com',
                     'www.bookrix.com',
                     'tablo.io',
                     'www.tablo.io',
                     'channillo.com',
                     'www.channillo.com',
                     'fictionaut.com',
                     'www.fictionaut.com',
                     'protagonize.com',
                     'www.protagonize.com',
                     'storium.com',
                     'www.storium.com',
                     'smashwords.com',
                     'www.smashwords.com',
                     'leanpub.com',
                     'www.leanpub.com',
                     'reedsy.com',
                     'www.reedsy.com',
                     'storiesonline.net',
                     'www.storiesonline.net',
                     'adultfanfiction.net',
                     'www.adultfanfiction.net',
                     'novelba.com',
                     'www.novelba.com',
                     'erys.net',
                     'www.erys.net',
                     'sangtacviet.com',
                     'www.sangtacviet.com',
                     'truyentot.com',
                     'www.truyentot.com',
                     'truyentranh.net',
                     'mebmarket.com',
                     'www.mebmarket.com',
                     'kuku.fm',
                     'www.kuku.fm',
                     'pocketfm.com',
                     'www.pocketfm.com',
                     'audible.com',
                     'www.audible.com',
                     'kitapyurdu.com',
                     'www.kitapyurdu.com',
                     'www.kotobati.com',
                     'noor-book.com',
                     'www.noor-book.com',
                     'almaktaba.org',
                     'www.almaktaba.org',
                     'storytel.com',
                     'www.storytel.com',
                     'hongshu.com',
                     'www.hongshu.com',
                     'yunqi.qq.com',
                     'www.yunqi.qq.com',
                     'www.17k.com',
                     'www.zhangyue.com',
                     'www.qimao.com',
                     'www.tadu.com',
                     'www.fanfiction.net',
                     'www.archiveofourown.org',
                     'mibba.com',
                     'www.mibba.com',
                     'teenink.com',
                     'www.teenink.com',
                     'figment.com',
                     'www.figment.com',
                     'alphapnovel.com',
                     'www.alphapnovel.com',
                     'meganoovel.com',
                     'www.meganoovel.com',
                     'lightreader.com',
                     'tapread.com',
                     'www.tapread.com',
                     'moboreader.com',
                     'www.moboreader.com',
                     'anystories.com',
                     'www.anystories.com',
                     'novelah.com',
                     'www.novelah.com',
                     'galatea.com',
                     'www.galatea.com',
                     'kissnovel.com',
                     'www.kissnovel.com',
                     'neopage.jp',
                     'www.neopage.jp',
                     'novelpia.jp',
                     'www.novelpia.jp',
                     'talkyda.com',
                     'www.talkyda.com',
                     'nobless.com',
                     'www.nobless.com',
                     'www.storial.co',
                     'yuedu.163.com',
                     'www.yuedu.163.com',
                     'motie.com',
                     'www.motie.com',
                     'www.kadokawa.co.jp',
                     'comic-walker.com',
                     'www.comic-walker.com',
                     'piccoma.com',
                     'www.piccoma.com',
                     'meccha-comic.jp',
                     'www.meccha-comic.jp',
                     'manga-bang.com',
                     'www.manga-bang.com',
                     'ficly.com',
                     'www.ficly.com',
                     'storymash.com',
                     'www.storymash.com',
                     'textnovel.com',
                     'www.textnovel.com',
                     'alphanovel.com',
                     'www.alphanovel.com',
                     'meganovel.com',
                     'www.meganovel.com',
                     'novelstar.com',
                     'www.novelstar.com',
                     'ireader.com',
                     'www.ireader.com',
                     'yousuu.com',
                     'www.yousuu.com',
                     'bookteller.com.cn',
                     'www.bookteller.com.cn',
                     'www.dreame.com',
                     'www.goodnovel.com',
                     'www.inkitt.com'];

      let host;
      try { host = new URL(target).hostname.toLowerCase(); } catch (e) { return new Response('bad url', { status: 400 }); }
      if (!allow.some((d) => host === d || host.endsWith('.' + d))) return new Response('host not allowed', { status: 403 });
      try {
        const r = await fetch(target, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,ja;q=0.7',
            'Cookie': 'view_adult=true',
          },
        });
        const h = new Headers(r.headers);
        h.set('access-control-allow-origin', '*');
        h.set('cache-control', 'no-store');
        h.delete('set-cookie');
        return new Response(r.body, { status: r.status, headers: h });
      } catch (e) {
        return new Response('ERR ' + String((e && e.message) || e), { status: 502 });
      }
    }


    const country = (request.cf && request.cf.country) || '';

    if (BLOCKED.has(country)) {
      return new Response(blockPage(country), {
        status: 403,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store, no-cache, must-revalidate',
          'x-robots-tag': 'noindex, nofollow',
        },
      });
    }

    // 正常返回静态资源
    return env.ASSETS.fetch(request);
  },
};
