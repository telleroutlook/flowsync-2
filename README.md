# ChartSync AI

<div align="center">
  <h3>🤖 AI 驱动的企业级数据可视化工具</h3>
  <p>基于 Cloudflare Workers + ECharts 构建</p>
</div>

## ✨ 核心功能

- 📊 **多格式数据支持**：CSV、JSON、Excel、Markdown 文件解析
- 🤖 **AI 智能生成**：自动分析数据并生成 ECharts 图表配置
- ✅ **配置验证**：使用 ECharts 官方校验逻辑确保配置正确
- 🔧 **AI 自动修复**：配置错误时自动触发 AI 修复
- 📤 **多格式导出**：PNG/SVG 图片、PPT 批量导出
- 👥 **企业级功能**：Workspace 隔离、RBAC 权限、审计日志、草稿审批

## 🏗️ 技术架构

### 技术栈
- **前端**：React 19.2.3 + Vite 6.2.0 + TypeScript
- **后端**：Cloudflare Workers + Hono
- **数据库**：Cloudflare D1 (SQLite) + Drizzle ORM
- **图表**：ECharts 5.4.3
- **AI**：OpenAI 兼容 API
- **文件解析**：Papaparse (CSV)、SheetJS (Excel)

### 项目结构
```
chartsync-ai/
├── worker/                    # Cloudflare Worker 后端
│   ├── db/                    # 数据库 Schema
│   ├── routes/                # API 路由
│   │   ├── dataSources.ts     # 数据源管理
│   │   ├── charts.ts          # 图表配置
│   │   ├── chartAi.ts         # AI 生成
│   │   └── ...
│   ├── services/              # 业务逻辑
│   └── index.ts               # Worker 入口
├── components/                # React 组件
│   ├── ChartEditor.tsx        # 主编辑器
│   ├── ChartCanvas.tsx        # ECharts 渲染器
│   └── DataSourcePanel.tsx    # 数据源面板
├── src/
│   ├── hooks/                 # React Hooks
│   └── utils/                 # 工具函数
└── public/                    # 静态资源
```

## 🚀 快速开始

### 前置要求
- Node.js >= 18
- npm >= 9
- Cloudflare 账号
- OpenAI API Key（或兼容 API）

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量

编辑 `wrangler.toml`：

```toml
name = "chartsync-ai"
main = "worker/index.ts"
compatibility_date = "2025-02-04"

[vars]
# OpenAI 配置
OPENAI_BASE_URL = "https://api.openai.com/v1"  # 或其他兼容 API
OPENAI_MODEL = "gpt-4"

# 如果使用智谱 AI，示例：
# OPENAI_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"
# OPENAI_MODEL = "glm-4"

[[d1_databases]]
binding = "DB"
database_name = "chartsync"
database_id = "YOUR_DATABASE_ID"  # 需要先创建
migrations_dir = "migrations_sqlite"

[browser]
binding = "BROWSER"

[[r2_buckets]]
binding = "R2"
bucket_name = "chartsync-uploads"
```

### 3. 创建数据库

```bash
# 创建 D1 数据库
wrangler d1 create chartsync

# 复制返回的 database_id 到 wrangler.toml
```

### 4. 本地开发

```bash
# 启动本地开发服务器
npm run dev

# 在另一个终端启动数据库（可选）
npm run db:studio  # 查看数据库内容
```

访问 http://localhost:8788

### 5. 部署到生产环境

```bash
# 1. 运行数据库迁移（生产环境）
npm run db:migrate:prod

# 2. 构建并部署
npm run deploy
```

## 📖 使用指南

### 基本工作流

1. **上传数据源**
   - 支持格式：CSV、JSON、Excel (XLSX/XLS)、Markdown
   - 文件大小限制：10MB
   - 自动解析并验证数据结构

2. **AI 生成图表**
   - 输入生成需求（如"生成一个展示销售趋势的折线图"）
   - AI 分析数据并生成图表配置
   - 支持一次生成多个图表

3. **审批草稿**
   - AI 生成的配置先创建为草稿
   - 预览图表效果
   - 批准或拒绝草稿

4. **编辑和验证**
   - 手动编辑图表配置
   - 验证配置合法性
   - 自动修复错误

5. **导出图表**
   - 导出为 PNG/SVG 图片
   - 批量导出为 PPT
   - 导出配置 JSON

### API 端点

#### 数据源管理
```
POST   /api/data-sources/upload              上传文件
GET    /api/data-sources/project/:projectId  获取项目数据源列表
DELETE /api/data-sources/:id                 删除数据源
```

#### 图表配置
```
POST   /api/charts                    创建图表
GET    /api/charts/project/:projectId 获取项目图表列表
GET    /api/charts/:id                获取单个图表
PATCH  /api/charts/:id                更新图表
DELETE /api/charts/:id                删除图表
POST   /api/charts/:id/validate       验证图表配置
```

#### AI 生成
```
POST /api/chart-ai/generate   AI 生成图表
POST /api/chart-ai/chat       AI 对话式修改图表
```

## 🔧 开发指南

### 添加新的图表类型

编辑 `worker/services/chartService.ts`：

```typescript
export const SUPPORTED_CHART_TYPES = [
  'line',
  'bar',
  'pie',
  // 添加新类型
  'your_new_type',
] as const;
```

### 自定义 AI Prompt

编辑 `worker/services/chartAiService.ts` 中的 `CHART_GENERATION_SYSTEM_PROMPT`。

### 添加新的文件格式支持

编辑 `worker/services/dataSourceService.ts` 的 `parseDataFile` 函数。

## 📊 数据库 Schema

### 核心表
- **chart_projects**: 图表项目
- **chart_configs**: 图表配置
- **data_sources**: 数据源
- **chart_drafts**: 草稿（审批流程）
- **chart_audit_logs**: 审计日志
- **chart_templates**: 图表模板

详细的 Schema 定义见 `worker/db/schema.ts`。

## 🛡️ 安全性

- ✅ 所有 API 输入通过 Zod 验证
- ✅ 文件上传类型和大小限制
- ✅ Workspace 级别数据隔离
- ✅ RBAC 权限控制
- ✅ 审计日志记录所有操作

## 📝 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系方式

- 问题反馈：GitHub Issues
- 文档：见项目 Wiki

---

**基于 flowsync-2 架构** - 复用了 Workspace、权限、草稿、审计等企业级组件。
