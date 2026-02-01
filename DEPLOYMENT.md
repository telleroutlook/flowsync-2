# ChartSync AI 部署检查清单

本文档提供完整的部署流程和检查清单，确保 ChartSync AI 成功部署到 Cloudflare Workers。

## 📋 部署前准备

### 1. 环境检查
- [ ] Node.js >= 18 已安装
- [ ] npm >= 9 已安装
- [ ] Cloudflare 账号已创建
- [ ] Wrangler CLI 已安装 (`npm install -g wrangler`)
- [ ] Wrangler 已登录 (`wrangler login`)

### 2. 配置准备
- [ ] OpenAI API Key（或兼容 API Key）
- [ ] 数据库名称（建议：`chartsync`）
- [ ] R2 Bucket 名称（建议：`chartsync-uploads`）

## 🚀 部署步骤

### Step 1: 创建 D1 数据库

```bash
# 创建 D1 数据库
wrangler d1 create chartsync
```

**输出示例**：
```
✅ Successfully created DB 'chartsync'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**操作**：复制返回的 `database_id`，更新到 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "chartsync"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # 粘贴此处
migrations_dir = "migrations_sqlite"
```

### Step 2: 创建 R2 存储桶（可选，用于文件存储）

```bash
# 创建 R2 存储桶
wrangler r2 bucket create chartsync-uploads
```

### Step 3: 配置环境变量

编辑 `wrangler.toml`，更新 `[vars]` 部分：

```toml
[vars]
# OpenAI 配置（选择一种）

# 选项 1：OpenAI 官方 API
OPENAI_BASE_URL = "https://api.openai.com/v1"
OPENAI_MODEL = "gpt-4"

# 选项 2：智谱 AI
# OPENAI_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"
# OPENAI_MODEL = "glm-4"

# 选项 3：其他兼容 API
# OPENAI_BASE_URL = "https://your-api-endpoint.com/v1"
# OPENAI_MODEL = "your-model-name"
```

### Step 4: 设置 Secrets

```bash
# 设置 OpenAI API Key
wrangler secret put OPENAI_API_KEY

# 输入你的 API Key（粘贴后按 Enter）
```

### Step 5: 运行数据库迁移

```bash
# 应用数据库迁移到生产环境
npm run db:migrate:prod
```

**预期输出**：
```
🌀 Executing on remote database chartsync (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx):
├ Migration 0001_xxx.sql (xxx ms)
├ Migration 0002_xxx.sql (xxx ms)
└ Migration 0003_xxx.sql (xxx ms)
✅ Migrations applied successfully
```

### Step 6: 构建前端资源

```bash
# 构建生产版本
npm run build
```

**预期输出**：
```
✓ built in xxx ms
dist/index.html                   1.2 kB
dist/assets/index-xxx.css        xx kB
dist/assets/index-xxx.js         xxx kB
```

### Step 7: 部署到 Cloudflare Workers

```bash
# 部署
npm run deploy
```

**预期输出**：
```
✅ Successfully deployed!
✅ Published chartsync-ai (X.XX sec)
  https://chartsync-ai.your-subdomain.workers.dev
```

**操作**：复制部署后的 URL，访问测试。

## ✅ 部署后验证

### 1. 基础功能测试
访问部署的 URL，检查：

- [ ] 页面正常加载
- [ ] 无控制台错误（打开浏览器 DevTools）
- [ ] 样式正常显示

### 2. API 健康检查
```bash
# 测试 API 是否正常（替换为你的 URL）
curl https://chartsync-ai.your-subdomain.workers.dev/api/health
```

### 3. 数据库连接测试
- [ ] 登录到 Cloudflare Dashboard
- [ ] 进入 D1 数据库页面
- [ ] 检查表是否正确创建：
  - chart_projects
  - chart_configs
  - data_sources
  - chart_drafts
  - chart_audit_logs
  - chart_templates

### 4. 核心功能测试

#### 4.1 数据源上传测试
- [ ] 准备测试文件（CSV/JSON/Excel）
- [ ] 上传文件
- [ ] 检查数据是否正确解析
- [ ] 查看数据预览是否正常

#### 4.2 AI 图表生成测试
- [ ] 选择已上传的数据源
- [ ] 输入生成需求（如"生成一个销售趋势折线图"）
- [ ] 检查 AI 是否返回配置
- [ ] 审批草稿
- [ ] 查看图表是否正确渲染

#### 4.3 图表编辑测试
- [ ] 点击图表进入编辑模式
- [ ] 修改图表配置
- [ ] 验证配置合法性
- [ ] 保存修改

#### 4.4 导出功能测试
- [ ] 导出图表为 PNG
- [ ] 导出图表为 SVG
- [ ] （未来）批量导出为 PPT

## 🔍 常见问题排查

### 问题 1：数据库迁移失败
**错误**：`Error: Migration failed`

**解决方案**：
```bash
# 检查迁移文件
ls -la migrations_sqlite/

# 手动运行单个迁移
wrangler d1 migrations apply chartsync --remote --local
```

### 问题 2：部署失败
**错误**：`Error: Failed to deploy`

**解决方案**：
```bash
# 检查 wrangler.toml 配置
cat wrangler.toml

# 查看详细日志
wrangler deploy --log-level debug
```

### 问题 3：API 调用失败
**错误**：`500 Internal Server Error`

**解决方案**：
```bash
# 查看 Worker 日志
wrangler tail

# 检查环境变量
wrangler secret list
```

### 问题 4：AI 生成失败
**错误**：`Error: OpenAI API error`

**解决方案**：
1. 检查 `OPENAI_API_KEY` 是否正确设置
2. 检查 `OPENAI_BASE_URL` 和 `OPENAI_MODEL` 是否正确
3. 检查 API 配额是否用尽
4. 查看 Worker 实时日志：`wrangler tail`

## 📊 监控和日志

### 实时日志
```bash
# 查看实时日志
wrangler tail
```

### 数据库管理
```bash
# 打开数据库 Studio（本地）
npm run db:studio

# 查询生产数据库
wrangler d1 execute chartsync --remote --command="SELECT * FROM chart_configs LIMIT 10"
```

## 🔐 安全检查清单

- [ ] `OPENAI_API_KEY` 已通过 secret 设置（非明文）
- [ ] R2 Bucket 访问权限已配置
- [ ] D1 数据库绑定正确
- [ ] Worker 域名已配置（如需要）
- [ ] 速率限制已配置（建议）
- [ ] CORS 配置正确（前端可访问 API）

## 📝 部署完成检查

- [ ] 所有步骤已完成
- [ ] 核心功能测试通过
- [ ] 无错误日志
- [ ] 性能可接受
- [ ] 文档已更新

## 🎯 下一步

部署完成后，可以考虑：

1. **自定义域名**：在 Cloudflare Dashboard 配置自定义域名
2. **监控告警**：配置 Cloudflare Analytics 和告警
3. **性能优化**：启用 Cloudflare 缓存
4. **用户管理**：集成企业认证系统

## 📞 支持

如有问题，请：
1. 查看本文档的"常见问题排查"部分
2. 查看 Worker 实时日志
3. 提交 GitHub Issue

---

**祝部署顺利！** 🎉
