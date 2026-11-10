# pilotphil.github.io

Pilot Phil 的个人主页。结构很简单：姓名 + GitHub，下面四个 tab。

**在线：<https://pilotphil.github.io/>**

## 结构

```text
.
├── index.html                     # 主页：四个 tab + 内容卡片
├── 404.html
├── assets/
│   ├── css/main.css               # 全部样式
│   ├── js/main.js                 # tab 切换
│   └── img/favicon.svg
├── projects/
│   └── ice-failure/index.html     # 海冰三轴失效准则演示
├── robots.txt
├── sitemap.xml
├── THIRD-PARTY-NOTICES.md
└── .nojekyll
```

## 修改内容

所有内容都在 `index.html` 里。

- **名字**：搜索 `Pilot Phil`，会出现在页头、`<title>` 和页脚
- **GitHub 链接**：搜索 `https://github.com/PilotPhil`，页头一处
- **Tab**：`.tabs` 里的四个 `<button>`，对应下面四个 `[data-panel]` 区块
- **冰力学**：目前只有一张卡片，链接到 `/projects/ice-failure/`
- **DSH Plugin**：三张卡片，分别链接到三个 GitHub 仓库
- **冰载荷预报 / Agent**：目前是 `施工中`，以后把 `.empty` 换成 `.card-grid` 即可

新增一张卡片最简单的方法：复制任意一个 `<a class="card">...</a>`，改标题、说明、链接和仓库名。

## 本地预览

```bash
python3 -m http.server 8000
```

打开 <http://localhost:8000/>。主页使用根路径 `/assets/...`，请通过本地服务器访问，不要直接双击 HTML。

## 部署

`main` 分支根目录就是站点根目录，推送后 GitHub Pages 会自动发布：

```bash
git add .
git commit -m "Update homepage"
git push origin main
```

## 演示页

海冰三轴失效准则演示在 `projects/ice-failure/`，为单文件、无外部依赖的页面，可离线打开。
失效包络图、判定逻辑和样式均保持原样，只在顶栏加了返回主页的链接。

三维部分使用 three.js r152（MIT），许可见 `THIRD-PARTY-NOTICES.md`。
