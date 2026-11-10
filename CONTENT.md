# 内容替换指南

主页目前是一套**可直接上线、但留了占位**的成品。以下这些内容是根据仓库信息推断或暂填的，发布前请逐项确认。

## 一、先确认这几处

| 项目 | 当前值 | 说明 |
| --- | --- | --- |
| 名字 / 品牌 | `Pilot Phil` | 取自 GitHub 用户名，不是确认过的真实姓名 |
| 邮箱 | `632913013@qq.com` | 取自仓库提交记录，已公开；如不希望展示请替换 |
| 坐标 | `中国 · 远程协作` | 占位，可换成城市或学校 |
| 身份 | `独立研究与项目实践` | 占位，可换成本科 / 硕士 / 博士 / 工程师等 |
| 项目 02–04 | 结构动力学工具、DSH Plugin、Agent | 只有方向描述，没有真实链接，状态分别为「整理中 / 开发中 / 实验中」 |
| 笔记 01–03 | 三个计划中的主题 | 尚未发布，标为「即将发布 / 整理中 / 构思中」 |

首屏右侧的失效包络是**示意图（非按比例）**，用于交代四条研究线索的交汇；真正的交互版本在项目 01。

## 二、逐项替换

所有页面内容都在 `index.html` 中，按下面的文本搜索即可定位。

### 1. 名字与品牌

搜索 `Pilot Phil`，会出现在：

- 顶部品牌、首屏大标题、页脚
- `<title>`、`meta description`、Open Graph、JSON-LD
- `assets/img/og.png`（分享图，改名字后需要重新生成）

`index.html` 顶部的 `<head>` 里还有：

```html
<link rel="canonical" href="https://pilotphil.github.io/">
<meta property="og:url" content="https://pilotphil.github.io/">
```

如果以后换域名，这三处（含 `og:image` 和 Twitter image）要一起改。

### 2. 首屏

搜索这些段落并替换：

- `工程力学 / 计算动力学 / 智能体工程` —— 身份关键词
- `把冰在复杂应力下的失效判据、结构动力响应与科研工具，做成可以被亲手验证的东西。` —— 一句话主张
- `独立研究与项目实践`、`中国 · 远程协作`、`研究合作 / 工程交流` —— 三条状态
- `Ice Mechanics` 等五个词 —— 首屏底部的关注领域条

### 3. 关于

搜索 `我关注材料与结构在复杂应力状态下的响应`，这一段在 `.about-copy` 里，共四段：

1. 开头的大字导语（`.lede`）
2. 研究兴趣
3. 工具与方法
4. 这个站点的用途

右侧 `.about-facts` 里是四条事实（Focus / Tools / Now / Base）和六个关键词标签。

### 4. 项目

**项目 01（海冰演示）** 已经是真实可用的，位置：

```text
projects/ice-failure/index.html
```

如果要改标题或简介，搜索 `海冰三轴失效准则演示`。改完后如果界面也变了，建议重新截一张 `assets/img/ice-demo.png`（1600×1000），否则卡片会和实际页面不一致。

**项目 02–04** 在 `.project-grid` 里，每张卡片的结构相同：

```html
<article class="project-card">
  <div class="card-top"><span>02</span><span class="status">整理中</span></div>
  <div class="card-icon">...</div>
  <h3>结构动力学 · 响应谱工具</h3>
  <p>...</p>
  <div class="tag-row">...</div>
</article>
```

要变成真实项目时，二选一：

- 在卡片底部加一个链接：
  ```html
  <a class="text-link" href="/projects/your-project/">查看项目 ↗</a>
  ```
  需要给 `.project-card` 加一点底部间距（或把链接放进 `.tag-row` 后面）。
- 或把 `<article>` 换成 `<a class="project-card" href="..." target="_blank" rel="noopener">`，并在 CSS 里给 `.project-card` 补 `color: inherit; text-decoration: none;`。

项目编号（01–04）和状态文案（整理中 / 开发中 / 实验中）都是手写的，记得同步改。

### 5. 方向

搜索 `四个方向，` 进入 `.focus-list`。每条是一个 `<li class="focus-item">`，包含编号、标题、说明、右侧英文标签。按需增删；编号与首屏、项目不必严格对应。

### 6. 笔记

搜索 `写作与记录`。三条 `.note` 目前只有标题、标签和状态，没有链接。发布文章时：

1. 把标题包进链接：
   ```html
   <h3><a href="/notes/your-post/">文章标题</a></h3>
   ```
2. 删掉 `.note-status`，或者把它改成日期，例如 `<span class="note-status">2026.12</span>`；
3. 在 `assets/css/main.css` 里给 `.note h3 a` 补上 `color: inherit; text-decoration: none;`，并加 hover 下划线。

如果暂时不写笔记，可以整段删除 `<section id="notes">`，同时删掉导航里的「笔记」链接。

### 7. 联系与页脚

搜索 `632913013@qq.com`，共三处：

- 联系区的 `mailto:` 链接
- 复制按钮的 `data-copy="..."`
- 页脚的 `mailto:` 链接

搜索 `https://github.com/PilotPhil`，共五处（顶栏、项目区、联系区、页脚、JSON-LD）。如果添加知乎、Google Scholar、ORCID 等，建议在联系区复制一个 `.contact-link`：

```html
<a class="contact-link" href="https://..." target="_blank" rel="noopener">
  Scholar
  <svg ...>↗</svg>
</a>
```

页脚的 `Elsewhere` 也对应加一行。

## 三、图片与图标

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `assets/img/favicon.svg` | 矢量 | 浏览器标签页图标 |
| `assets/img/apple-touch-icon.png` | 180×180 | iOS 主屏图标 |
| `assets/img/og.png` | 1200×630 | 微信 / Twitter / 社交分享图 |
| `assets/img/ice-demo.png` | 1600×1000 | 项目 01 的界面截图 |

换名字或主张后，`og.png` 里的文字会过期。最简单的做法是用任意设计工具按 1200×630 重做一张，保留暖白底、深蓝和锈橙即可；或者用截图工具把新的 `og` 版面渲染出来。

`favicon.svg` 和 `apple-touch-icon.png` 是同一个「P + 锈橙点」标记，也可以直接换成自己的头像或字母组合。

## 四、样式变量

`assets/css/main.css` 开头集中了配色与字体：

```css
--paper: #f6f4ee;      /* 纸白 */
--ink: #171a1e;        /* 墨色 */
--accent: #0b4f7a;     /* 深蓝 */
--signal: #b8531f;     /* 锈橙 */
--font-serif: ...      /* 宋体标题 */
--font-sans: ...       /* 苹方正文 */
--font-mono: ...       /* 等宽标签 */
```

改一两个变量，整站气质就会变。建议保持「一个强调色 + 一个信号色」，不要超过三种彩色。

## 五、发布前检查

- [ ] 确认公开邮箱没问题（或已替换）
- [ ] 把 `Pilot Phil` 换成真实姓名 / 常用 ID（至少首屏和页脚）
- [ ] 确认项目 02–04 的描述不会让人误以为已经上线
- [ ] 给真实项目补上链接，或先删掉未完成的卡片
- [ ] 更新 `sitemap.xml` 的 `lastmod`
- [ ] 手机上看一遍导航、首屏、项目卡片
- [ ] 改完后用 `python3 -m http.server 8000` 本地过一遍，再推送
