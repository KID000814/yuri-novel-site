# ✨ 百合小说分享站 · Yuri Novel Site

一个**纯静态、零后端**的小说分享站：批量上传小说 → 自动生成书目 → 在线阅读 / 搜索 / 下载。
部署在 **Cloudflare Pages** 上，**流量免费无限**，文件体积不受 GitHub Pages 的 1GB 限制。

> 📚 你可以用它搭建**任何**小说 / 文档分享站（不限于百合小说）。

---

## ✨ 功能

| 功能 | 说明 |
|---|---|
| 📚 **书目浏览** | 按分类浏览，每页自动分页 |
| 🔍 **搜索** | 按书名 / 作者 / 分类实时搜索 |
| 🎛 **筛选排序** | 按格式（txt/epub/docx）、大小筛选；按书名 / 大小 / 浏览量排序 |
| 🎨 **自定义排版** | 列表（大卡）/ 两列 / 三列 / 紧凑行，电脑手机都支持 |
| 📖 **在线阅读** | 滚动模式 + **翻页模式**（点击左右翻页 / 键盘 ←→）、字号 / 字体 / 夜间模式 |
| 🔖 **阅读记忆** | 记住每本书读到哪（滚动位置或第几页），首页有「继续阅读」入口 |
| 📑 **书签** | 任意位置加书签，带正文摘录，可一键跳回 |
| ⭐ **收藏夹** | 收藏喜欢的书，随时点开 |
| 📚 **阅读记录** | 自动记录看过的书 + 进度 |
| 🎲 **随机推荐** | 每次随机推荐 5 本，可「换一批」 |
| 👁 **浏览量** | 接入免费计数服务（可选） |
| 📈 **访问统计** | 底部显示总访问量 / 访问人数（不蒜子，可选） |
| 🌙 **深色模式** | 全站一键切换 |
| ⚡ **秒开** | Service Worker 缓存，二次访问几乎瞬间；可离线浏览 |
| 📱 **移动端适配** | 手机排版专门优化 |

---

## 📂 目录结构

```
.
├── index.html            # 页面结构
├── app.js                # 前端逻辑（书目渲染 / 搜索 / 阅读器 / 书架）
├── style.css             # 样式（含深色模式、移动端适配）
├── sw.js                 # Service Worker（离线 / 秒开）
├── avatar.svg            # 站点头像（占位图，可换成你自己的）
├── robots.txt            # 搜索引擎爬虫规则
├── sitemap.xml           # 站点地图
├── manifest.json         # ← 由 build/manifest.mjs 生成的书目
├── views.json            # ← 由 build/fetch-views.mjs 生成的浏览量快照（可选）
├── library/              # ← 你的小说放这里（按子文件夹分类，已被 .gitignore 忽略）
│   └── 示例/示例小说 - 示例作者.txt
├── build/
│   ├── manifest.mjs      # 扫描 library/ → 生成 manifest.json
│   └── fetch-views.mjs   # 抓取浏览量 → views.json
└── package.json
```

---

## 🚀 快速开始

```bash
# 1. 安装构建依赖（只有生成书目需要）
npm install

# 2. 本地预览（任选一种）
npm run serve            # 打开 http://localhost:3000
# 或者： python3 -m http.server 3000
```

浏览器打开 `http://localhost:3000` 即可看到站点（默认只有 1 本示例书）。

---

## 📥 添加你自己的小说

1. 把文件放进 `library/` 目录，**用子文件夹分类**：

```
library/
├── 日本百合/xxx.txt
├── 国内百合/yyy.epub
└── 其它/zzz.docx
```

2. 重新生成书目：

```bash
npm run build
```

3. 刷新页面即可看到。

**命名约定（可省略，但能自动识别更准）：**

| 文件名 | 识别结果 |
|---|---|
| `书名 - 作者.txt` | 书名 + 作者 |
| `《书名》作者：某某.txt` | 书名 + 作者 |
| `(类别) [作者] 书名.txt` | 书名 + 作者 |
| `随便什么名字.txt` | 书名 = 文件名 |

> 如果文件名里没有作者，脚本会尝试从**正文前 2000 字**的「作者：xxx」提取。
> 编码会自动识别（UTF-8 / GBK / Shift-JIS）——但**只在构建时识别，不会改动原文件**。

---

## 🌐 部署到 Cloudflare Pages

```bash
# 安装 wrangler
npm i -D wrangler

# 登录
npx wrangler login

# 部署（首次会自动创建项目）
npx wrangler pages deploy . --project-name=my-novel-site --branch=main
```

也可以直接在 **Cloudflare Dashboard → Workers & Pages → Create → Pages → 直接上传**，把整个目录拖进去。

> ⚠️ **部署时请忽略 `node_modules/`**（`wrangler pages deploy` 默认会跳过，或用 `.wranglerignore` / `.gitignore` 控制）。
> 若书籍很多（几 GB），建议使用 `wrangler pages deploy`，它支持增量上传，只有变动的文件会重新传。

**Cloudflare Pages 免费额度：** 单文件 ≤ 25MB、≤ 20000 个文件、**流量不限**。

---

## ⚙️ 配置（部署前建议改）

| 位置 | 内容 |
|---|---|
| `index.html` | `<title>` / `description` / `keywords` / `og:*` / `canonical` / JSON-LD 里的**域名和站点名** |
| `index.html` | 顶部头像区文案（`儿童病例` / `全世界同名`） |
| `robots.txt` / `sitemap.xml` | 把 `YOUR-SITE.pages.dev` 换成你的真实域名 |
| `avatar.svg` | 换成你自己的头像（改 `index.html` 里的 `src`） |
| `app.js` | `ABACUS_NS`（浏览量命名空间）—— **改成你自己的**，否则会和本项目的计数混在一起 |
| `app.js` | `DEFAULT_CATS`（默认显示哪些分类标签） |

---

## 🧠 技术说明

### 为什么快？
- **纯静态**：没有后端、没有数据库，全部是静态文件 + CDN
- **书目驱动**：前端只读一个 `manifest.json`（约 600KB，Cloudflare 自动 Brotli 压缩后 ~130KB）
- **Service Worker**：静态资源「先出缓存、后台更新」，二次访问秒开，可离线
- **本地缓存书目**：`localStorage` 缓存书目，先渲染再后台更新

### `manifest.json` 格式

```json
[
  {
    "i": "a1b2c3d4e5f6",          // id（路径的 md5 前 12 位）
    "t": "无法告白",              // 书名
    "a": "兔汤有点儿咸",           // 作者
    "c": "国内百合",              // 分类（library/ 下的子文件夹名）
    "p": "library/国内百合/无法告白.txt",   // 文件相对路径
    "e": "txt",                   // 扩展名
    "s": 1415611,                 // 字节数
    "d": "书名：无法告白 作者：…"   // 摘要（正文前 46 字，仅 txt）
  }
]
```

### 用户数据存在哪？
**全部在浏览器本地（`localStorage`）**：阅读进度、书签、收藏、阅读记录、排版偏好、字号、夜间模式。
换设备 / 清缓存会丢失 —— 这是纯静态站的固有限制。想跨设备同步需要登录系统 + 数据库。

### 浏览量 / 访问统计
- **浏览量**：用 [abacus](https://abacus.jasoncameron.dev) 免费计数（无需注册）。它**不支持批量读取**，所以：
  - 打开某本书详情时 +1 并显示
  - `views.json` 是**定期抓取**的全量快照（`npm run views`），用于卡片显示和「按浏览量排序」
- **访问统计**：底部用[不蒜子](https://busuanzi.ibruce.info)。不想用可以删掉 `index.html` 里对应的 `<script>` 和 `.stats` 那块。

---

## ⚠️ 免责声明（重要）

- **本仓库只包含网站代码，不包含任何小说内容。** 示例书是自己撰写的演示文本。
- **请勿把有版权的小说提交到公开仓库** —— 会导致仓库被封禁。
- 使用者需自行承担内容合规责任。若分享他人作品，请：
  - 注明来源与作者
  - 提供正版购买链接
  - 遵守当地法律与平台规则
- 本项目代码以 MIT 协议开源，**不构成对任何内容分享行为的授权或背书**。

---

## 📄 License

代码部分：[MIT](./LICENSE)

## 🙏 致谢

- [Cloudflare Pages](https://pages.cloudflare.com/) —— 免费静态托管
- [abacus](https://abacus.jasoncameron.dev/) —— 免费计数
- [不蒜子](https://busuanzi.ibruce.info/) —— 免费访问统计
- [iconv-lite](https://github.com/ashtuchkin/iconv-lite) —— 编码转换
