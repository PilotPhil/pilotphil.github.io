# 海冰三轴失效准则交互演示

《冰力学》课程作业二：四种海冰失效准则（第一强度理论、Mises、Mohr–Coulomb、Tsai–Wu）
在二维 σ₁–σ₂ 平面与三维主应力空间中的交互演示。

**在线体验：<https://pilotphil.github.io/ice-mechanics/ice-failure/>**

- 顶部开关切换二维（σ₃ = 0）/ 三维（σ₃ 可调），二维包络线即三维失效面在 σ₃ 平面上的切片
- 输入条件可调 σt、σc，四种准则的系数、包络线、三维失效面与判定实时重新标定
- 判定表逐条给出 g 公式、实时 g 值与破坏 / 未破坏结论，点击可看逐项数值代入
- 每行复选框可单独显示 / 隐藏某个准则；支持拖动应力点、工况预设、PNG 截图导出

页面为静态多文件结构，无构建步骤、无外部网络依赖，可离线打开：

```text
ice-failure/
├── index.html
├── styles.css
├── src/
│   ├── criteria.js     # 四种失效准则的定义与判定
│   ├── chart2d.js      # 二维包络线与交互
│   ├── scene3d.js      # 三维失效面
│   └── app.js          # 页面状态、控件与导出
└── vendor/three.min.js # three.js r152
```

三维部分使用 three.js r152（MIT 许可，见根目录 [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md)）。

顶栏右侧保留了一个「主页」链接，用于返回个人主页。
