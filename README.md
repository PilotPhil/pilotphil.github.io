# pilotphil.github.io

Pilot Phil 的个人主页。**主页本体只做导航**：六个 tab + 卡片，每个演示项目都在自己的 GitHub 仓库里独立开发和发布，主页只链接过去。

**在线：<https://pilotphil.github.io/>**

## 演示站点

| 栏目 | 项目 | 在线地址 | 仓库 |
| --- | --- | --- | --- |
| 冰力学 | 海冰三轴失效准则演示 | <https://pilotphil.github.io/ice_failure_demo_web/> | [ice_failure_demo_web](https://github.com/PilotPhil/ice_failure_demo_web) |
| NDEM | 双阶段碰撞检测 | <https://pilotphil.github.io/collisionDetection_web/> | [collisionDetection_web](https://github.com/PilotPhil/collisionDetection_web) |
| NDEM | 冲量动力学例子及原理 | <https://pilotphil.github.io/ndem_1D_web/> | [ndem_1D_web](https://github.com/PilotPhil/ndem_1D_web) |
| 冰载荷预报 | 2D层冰载荷预报（CCM Web） | <https://pilotphil.github.io/CCM_web/> | [CCM_web](https://github.com/PilotPhil/CCM_web) |
| 冰载荷预报 | 冰浮力计算 | <https://pilotphil.github.io/buoyancy_demo_web/> | [buoyancy_demo_web](https://github.com/PilotPhil/buoyancy_demo_web) |
| 其他 | 羽毛球电子抽签 | <https://pilotphil.github.io/badminton-chouqian/> | [badminton-chouqian](https://github.com/PilotPhil/badminton-chouqian) |
| DSH Plugin | 四个插件 | — | [dsh-session-status-colors](https://github.com/PilotPhil/dsh-session-status-colors)、[dsh-flowmeter](https://github.com/PilotPhil/dsh-flowmeter)、[dsh-opencodego-usage](https://github.com/PilotPhil/dsh-opencodego-usage)、[dsh-ui-modify](https://github.com/PilotPhil/dsh-ui-modify) |

## 目录结构

```text
.
├── index.html              # 主页：六个 tab + 内容卡片（全部外链到独立站点）
├── 404.html
├── assets/                 # 站点级资源（主页共用）
│   ├── css/main.css
│   ├── js/main.js          # tab 切换（无依赖）
│   └── img/favicon.svg
├── agent/README.md         # Agent 栏目备忘（施工中）
├── dsh-plugin/README.md    # DSH Plugin 仓库索引
├── robots.txt
├── sitemap.xml
├── .nojekyll
└── .gitignore
```

主页仓库里**不再放任何演示代码**。历史上的 `ice-mechanics/`、`load-forecast/` 已拆成独立仓库，旧地址不再保留（可到 git 历史里找回）。

## 修改主页

所有内容都在 `index.html` 里。

- **名字**：搜索 `Pilot Phil`，会出现在页头、`<title>` 和页脚
- **GitHub 链接**：搜索 `https://github.com/PilotPhil`，页头一处
- **Tab**：`.tabs` 里的六个 `<button>`，与下面六个 `[data-panel]` 区块一一对应（`ice` / `ndem` / `load` / `plugin` / `agent` / `other`）
- **卡片**：复制任意一个 `<a class="card">...</a>`，改标题、说明和链接。外链统一带 `target="_blank" rel="noopener"`，箭头用 `↗`
- **锚点**：tab 名称就是 URL hash（例如 `/#load` 直接打开「冰载荷预报」），各演示站点顶栏的「← 主页」就是靠它跳回对应栏目

## 本地预览

```bash
python3 -m http.server 8000
```

打开 <http://localhost:8000/>。主页使用根路径 `/assets/...`，请通过本地服务器访问，不要直接双击 HTML。

## 部署

`main` 分支根目录就是站点根目录，推送后 GitHub Pages 自动发布：

```bash
git add .
git commit -m "Update homepage"
git push origin main
```

## 维护约定

- 新演示项目一律**新建独立仓库**，在仓库里自建 GitHub Pages（推荐 GitHub Actions 部署），不要把代码复制进本仓库
- 新仓库上线后，在 `index.html` 对应 tab 里加一张外链卡片，并按需更新上面的「演示站点」表
- 页面之间的互相跳转只用绝对地址 `https://pilotphil.github.io/...`，不要写相对路径
- 各演示仓库的顶栏保留「← 主页」链接，指回 `https://pilotphil.github.io/#<tab>`
