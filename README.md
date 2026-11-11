# pilotphil.github.io

Pilot Phil 的个人主页。结构很简单：姓名 + GitHub，下面五个 tab。

**在线：<https://pilotphil.github.io/>**

## 目录结构

内容目录按项目归档，主页 tab 是展示分类。每个作品单独建子目录，避免文件混在一起。

```text
.
├── index.html                         # 主页：五个 tab + 内容卡片
├── 404.html
├── assets/                            # 站点级资源（主页共用）
│   ├── css/main.css
│   ├── js/main.js
│   └── img/favicon.svg
├── ice-mechanics/                     # 冰力学
│   ├── README.md
│   └── ice-failure/                   # 海冰三轴失效准则演示
│       ├── index.html
│       └── README.md
├── load-forecast/                     # 冰载荷预报 / NDEM 项目
│   ├── README.md
│   ├── ccm/                           # 2D层冰载荷预报（构建后的静态应用）
│   ├── ccm-src/                       # 该应用的源码（web + core）
│   ├── buoyancy/                      # 冰浮力计算（纯静态 WebGL）
│   ├── collision/                     # 双阶段碰撞检测（纯静态 Canvas 2D）
│   └── ndem/                          # 冲量动力学例子及原理（纯静态 HTML + KaTeX）
├── dsh-plugin/                        # DSH Plugin（外部仓库汇总）
│   └── README.md
├── agent/                             # Agent（施工中）
│   └── README.md
├── robots.txt
├── sitemap.xml
├── THIRD-PARTY-NOTICES.md
└── .nojekyll
```

主页的 NDEM 栏目目前指向 `load-forecast/collision/` 与 `load-forecast/ndem/`；为了不改已有 URL，这两个目录继续留在 `load-forecast/` 下。

约定：

- 每个新作品放在独立子目录里，自带 `README.md`
- 作品自己的图片、数据、脚本放在它自己的子目录，不要丢进 `assets/`
- `assets/` 只放主页共用的 CSS、JS、图标
- DSH 的三个插件目前都在独立 GitHub 仓库维护，主页直接外链；`dsh-plugin/` 用来汇总链接和以后的说明页

## 修改主页

所有文字都在 `index.html` 里。

- **名字**：搜索 `Pilot Phil`，会出现在页头、`<title>` 和页脚
- **GitHub 链接**：搜索 `https://github.com/PilotPhil`，页头一处
- **Tab**：`.tabs` 里的五个 `<button>`，对应下面五个 `[data-panel]` 区块
- **冰力学**：一张卡片，链接到 `/ice-mechanics/ice-failure/`
- **NDEM**：两张卡片，分别链接到 `/load-forecast/collision/` 与 `/load-forecast/ndem/`
- **冰载荷预报**：两张卡片，分别链接到 `/load-forecast/ccm/` 与 `/load-forecast/buoyancy/`
- **DSH Plugin**：三张卡片，分别链接到三个 GitHub 仓库
- **Agent**：目前是 `施工中`，以后把 `.empty` 换成 `.card-grid` 即可

新增一张卡片最简单的方法：复制任意一个 `<a class="card">...</a>`，改标题、说明和链接。

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

海冰三轴失效准则演示在 `ice-mechanics/ice-failure/`，为静态多文件页面，无构建步骤、无外部网络依赖，可离线打开。
新版的失效包络图、判定逻辑和样式均未改动，只在顶栏加了返回主页的链接。

三维部分使用 three.js r152（MIT），许可见 `THIRD-PARTY-NOTICES.md`。
