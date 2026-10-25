# 工单管理系统

独立设计与实现的全栈工单管理平台，覆盖工单创建、状态流转、权限控制、消息通知与运营看板，提供在线演示与多角色切换。

## 功能特性

- **状态机驱动详情页**：基于状态机配置统一各状态下的操作按钮、表单字段与流程时间线，新增工单类型通过配置扩展，减少重复分支代码
- **Schema 驱动动态表单**：支持字段显隐、联动校验与只读回填，新增工单类型无需修改页面代码
- **权限矩阵控制**：路由级、按钮级、字段级三位一体权限控制，支持多角色切换演示与敏感字段脱敏
- **虚拟滚动列表**：针对万级工单数据固定行高 + overscan 渲染，首屏 1637ms → 10ms，DOM 节点减少 99.8%
- **SSE 消息中心**：工单流转实时通知，断线重连按序号补发去重，未读数聚合
- **测试与 CI**：pytest / Vitest 覆盖核心用例，Playwright 连真实后端覆盖创建到关单主流程，GitHub Actions 自动化测试

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 / TypeScript / Vite / Zustand / TanStack Query / React Router / Tailwind CSS / ECharts |
| 后端 | Python / FastAPI / asyncpg / PostgreSQL / PyJWT / bcrypt |
| 测试 | pytest / Vitest / Playwright |

## 目录结构

```
├── frontend/   # React + Vite + TypeScript 前端
└── server/     # FastAPI + PostgreSQL 后端
```

## 快速开始

1. 后端：在 `server/` 下参照 `.env.example` 配置 PostgreSQL 连接，然后 `uv sync && uv run fastapi dev`
2. 前端：在 `frontend/` 下 `npm install && npm run dev`

## 测试

- 后端：`cd server && uv run pytest`
- 前端单测：`cd frontend && npm run test`
- 端到端：`cd frontend && npm run test:e2e`