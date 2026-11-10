# pilotphil.github.io

个人主页 · 工程与技术作品集。纯静态、零构建，直接由 GitHub Pages 托管。

**在线访问：<https://pilotphil.github.io/>**

## 站点结构

```text
.
├── index.html                     # 主页（关于 / 项目 / 方向 / 笔记 / 联系）
├── 404.html                       # 404 页面
├── assets/
│   ├── css/main.css               # 全站样式与设计变量
│   ├── js/main.js                 # 导航、滚动显示、复制邮箱
│   └── img/                       # favicon、社交分享图、项目截图
├── projects/
│   └── ice-failure/index.html     # 海冰三轴失效准则交互演示（原首页）
├── robots.txt
├── sitemap.xml
├── CONTENT.md                     # 内容替换指南
├── THIRD-PARTY-NOTICES.md         # three.js 许可
└── .nojekyll                      # 关闭 Jekyll 处理
```

## 本地预览

在仓库根目录执行：

```bash
python3 -m http.server 8000
```

然后打开 <http://localhost:8000/>。

主页使用根路径引用资源（`/assets/...`），请通过本地服务器访问，不要直接双击 `index.html`。

## 部署

仓库 `main` 分支根目录即站点根目录，推送后 GitHub Pages 会自动发布，通常 1–2 分钟内生效：

```bash
git add .
git commit -m "Build personal homepage"
git push origin main
```

## 设计说明

- 暖白纸感底色、墨色正文、深蓝强调，加一点锈橙作为信号色
- 宋体标题 / 苹方正文 / 等宽字体标签，形成学术图版的气质
- 无框架、无外部字体、无追踪脚本、无 Cookie，首屏不依赖网络字体
- 响应式布局，支持键盘导航与 `prefers-reduced-motion`
- 所有个人信息、项目状态与笔记均为可替换的占位内容，见 [CONTENT.md](CONTENT.md)

## 交互演示

《冰力学》课程作业：四种海冰失效准则（第一强度理论、Mises、Mohr–Coulomb、Tsai–Wu）
在二维 σ₁–σ₂ 平面与三维主应力空间中的交互演示。

**在线体验：<https://pilotphil.github.io/projects/ice-failure/>**

演示页为单文件、无外部依赖，可离线双击打开；三维部分使用 three.js r152。
详见 [projects/ice-failure/README.md](projects/ice-failure/README.md)。

## 第三方组件

three.js r152（MIT 许可），许可见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
