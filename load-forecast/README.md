# 冰载荷预报

船–冰相互作用与冰载荷预报相关的工作。

## 内容

- [CCM Web 船破层冰模拟](ccm/) —— 二维船舶破层冰仿真工作台。React + TypeScript + Canvas，包含参数面板、冰场网格、船体水线、阻力曲线和仿真控制。

  - 在线：<https://pilotphil.github.io/load-forecast/ccm/>
  - 示例工程：`ccm/projects/` 下的 6 个 `.ccm.json`，主页卡片默认载入 `1.5m_5kts_500kPa_3207`
  - 源码：`ccm-src/`（从 `CCM_web` 复制，只保留 `packages/web` 与 `packages/core`，桌面端 `CCM_Re` 和 `.h5` 数据没有带过来）

## 重新构建

```bash
cd ccm-src
pnpm install
pnpm --filter @ccm/web build
```

构建结果直接输出到 `../ccm/`，`index.html` 和资源使用相对路径，因此可以放在任意子路径下部署。

## 为部署做的修改

- Vite `base` 改为 `./`，构建产物输出到 `../ccm/`
- 工程 JSON 的加载路径改为相对当前页面目录，不再写死 `/projects/...`
- 顶部菜单栏加了「← 主页」返回个人主页
- 补了 favicon 和页面 description

仿真核心和界面逻辑未改动。
