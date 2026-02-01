import type { DrizzleDB } from '../db';
import { chartDrafts, chartConfigs } from '../db/schema';
import { generateId, now } from './utils';
import { eq } from 'drizzle-orm';

/**
 * System prompt for AI chart generation
 */
const CHART_GENERATION_SYSTEM_PROMPT = `你是 ChartSync AI，一个专业的数据可视化和图表生成助手。

## 核心任务
根据用户提供的数据和描述，生成符合 ECharts 规范的图表配置 JSON。

## 工作流程

### 第 1 步：数据分析
- 分析数据的结构（字段类型、数据范围、关系）
- 识别时间序列、分类数据、数值数据
- 检测数据模式和趋势
- 确定最适合的图表类型

### 第 2 步：图表选择
根据数据特征选择最佳图表类型：
- **时间序列数据** → 折线图、面积图
- **分类对比** → 柱状图、条形图
- **占比分析** → 饼图、环形图
- **多维关系** → 散点图、气泡图
- **地理数据** → 地图

### 第 3 步：配置生成
生成完整的 ECharts Option 对象，包含：
- title: 图表标题（简洁明了）
- tooltip: 提示框配置
- legend: 图例配置（多系列时）
- xAxis/yAxis: 坐标轴配置
- series: 数据系列配置
- visualMap: 视觉映射（如需要）
- toolbox: 工具箱（缩放、保存等）

## ECharts 配置规范

### 必须包含的字段
{
  "title": { "text": "图表标题" },
  "tooltip": { "trigger": "axis" | "item" },
  "legend": { "data": ["系列1", "系列2"] },
  "xAxis": { "type": "category" | "value" | "time", "data": [...] },
  "yAxis": { "type": "value" | "category" },
  "series": [
    {
      "name": "系列名称",
      "type": "line" | "bar" | "pie" | ...,
      "data": [...],
      "smooth": true,
      "itemStyle": { "color": "..." }
    }
  ]
}

### 最佳实践
1. 使用简洁的配色方案（最多 5 种颜色）
2. 数据标签清晰可读
3. 坐标轴标签完整
4. 图例位置合理
5. 支持响应式（grid 配置）

## 输出格式

返回 JSON 对象，包含：
{
  "charts": [
    {
      "title": "图表标题",
      "description": "图表描述（为什么选择这种图表类型）",
      "chartType": "line|bar|pie|scatter|...",
      "echartsConfig": { /* 完整的 ECharts Option 对象 */ }
    }
  ]
}

## 常见错误避免
❌ 缺少必要的字段（title、series、data）
❌ data 数组为空
❌ 坐标轴类型与数据不匹配
❌ 颜色配置过于复杂
❌ 忽略数据格式（日期、数值）

现在，请根据用户提供的数据和需求生成图表配置。`;

/**
 * Generate charts using AI
 */
export async function generateChartsWithAI(
  db: DrizzleDB,
  env: { OPENAI_API_KEY: string; OPENAI_BASE_URL?: string; OPENAI_MODEL?: string },
  options: {
    dataSourceId: string;
    dataSourceContent: {
      data: Record<string, unknown>[];
      metadata: {
        columns: string[];
        rowCount: number;
        sample: Record<string, unknown>[];
      };
    };
    projectId: string;
    workspaceId: string;
    prompt: string;
    chartCount?: number;
  }
) {
  const { dataSourceId, dataSourceContent, projectId, workspaceId, prompt, chartCount = 1 } = options;

  // Prepare data context for AI
  const dataContext = {
    fileName: `Data Source ${dataSourceId}`,
    columns: dataSourceContent.metadata.columns,
    rowCount: dataSourceContent.metadata.rowCount,
    sampleRows: dataSourceContent.metadata.sample.slice(0, 5),
    allData: dataSourceContent.data.slice(0, 100), // Limit data size for context
  };

  // Build user prompt
  const userPrompt = `
数据信息：
\`\`\`json
${JSON.stringify(dataContext, null, 2)}
\`\`\`

用户需求：
${prompt}

请生成 ${chartCount} 个不同类型的图表配置。
`;

  try {
    // Call OpenAI-compatible API
    const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;
    const model = env.OPENAI_MODEL || 'gpt-4';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: CHART_GENERATION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const result: { choices: Array<{ message?: { content: string } }> } = await response.json();
    const content = result.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse AI response
    const generated = JSON.parse(content);
    const charts = generated.charts || [];

    // Create draft
    const timestamp = now();
    const draft = await db
      .insert(chartDrafts)
      .values({
        id: generateId(),
        workspaceId,
        projectId,
        status: 'pending',
        draftType: 'create_charts',
        actions: charts.map((chart: any) => ({
          type: 'create',
          data: {
            title: chart.title,
            description: chart.description || null,
            chartType: chart.chartType,
            echartsConfig: chart.echartsConfig,
            generatedBy: 'ai',
            generationPrompt: prompt,
            dataSourceId: options.dataSourceId,
          },
        })),
        generatedBy: 'ai',
        prompt,
        createdAt: timestamp,
        reason: null,
      })
      .returning();

    if (!draft[0]) {
      throw new Error('Failed to create draft');
    }

    return draft[0];
  } catch (error) {
    console.error('AI chart generation failed:', error);
    throw error;
  }
}

/**
 * Chat with AI to modify charts
 */
export async function chatToModifyChart(
  db: DrizzleDB,
  env: { OPENAI_API_KEY: string; OPENAI_BASE_URL?: string; OPENAI_MODEL?: string },
  options: {
    chartId: string;
    message: string;
    history?: Array<{ role: string; content: string }>;
    workspaceId: string;
  }
) {
  const { chartId, message, history = [], workspaceId } = options;

  // Get current chart
  const charts = await db.select().from(chartConfigs).where(eq(chartConfigs.id, chartId)).limit(1);
  const chart = charts[0];

  if (!chart) {
    throw new Error('Chart not found');
  }

  // Prepare chart context
  const chartContext = {
    title: chart.title,
    description: chart.description,
    chartType: chart.chartType,
    currentConfig: chart.echartsConfig,
    validationErrors: chart.validationErrors,
  };

  // Build messages
  const messages: Array<{ role: string; content: string }> = [
    {
      role: 'system',
      content: `你是 ChartSync AI，帮助用户修改和优化 ECharts 图表配置。
根据用户的反馈，修改图表配置。只返回修改后的 echartsConfig 对象，格式为 JSON。`,
    },
    ...history,
    {
      role: 'user',
      content: `
当前图表：
\`\`\`json
${JSON.stringify(chartContext, null, 2)}
\`\`\`

用户反馈：
${message}

请提供修改后的图表配置。
`,
    },
  ];

  try {
    // Call OpenAI API
    const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;
    const model = env.OPENAI_MODEL || 'gpt-4';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const result: { choices: Array<{ message?: { content: string } }> } = await response.json();
    const content = result.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse response
    const modified = JSON.parse(content);

    // Create draft for modification
    const timestamp = now();
    const draft = await db
      .insert(chartDrafts)
      .values({
        id: generateId(),
        workspaceId,
        projectId: chart.projectId,
        status: 'pending',
        draftType: 'modify_charts',
        actions: [
          {
            type: 'update',
            entityId: chartId,
            data: {
              echartsConfig: modified.echartsConfig || modified,
              title: modified.title,
              description: modified.description,
            },
          },
        ],
        generatedBy: 'ai',
        prompt: message,
        createdAt: timestamp,
        reason: null,
      })
      .returning();

    if (!draft[0]) {
      throw new Error('Failed to create draft');
    }

    return draft[0];
  } catch (error) {
    console.error('AI chat modification failed:', error);
    throw error;
  }
}
