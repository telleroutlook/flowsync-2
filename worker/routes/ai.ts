import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { jsonError, jsonOk } from './helpers';
import { workspaceMiddleware } from './middleware';
import { recordLog } from '../services/logService';
import { getAuthorizationHeader } from '../utils/bigmodelAuth';
import { createToolRegistry } from '../services/aiToolRegistry';
import { checkRateLimit, getClientIp } from '../services/rateLimitService';
import type { Bindings, Variables } from '../types';
import type { Context } from 'hono';
import { MAX_HISTORY_PART_CHARS } from '../../shared/aiLimits';

export const aiRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();
aiRoute.use('*', workspaceMiddleware);

const MAX_HISTORY_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;
const MAX_SYSTEM_CONTEXT_CHARS = 8000;
const MAX_TOOL_ARGS_CHARS = 8000;
const MAX_TOOL_CALLS = 30;
const MAX_TURNS = 5;
const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 500;

const generateRequestId = () => crypto.randomUUID();

// Rate limiting middleware for AI endpoints
const checkAIRateLimit = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  try {
    const clientIp = getClientIp(c.req.raw);
    const rateLimitResult = await checkRateLimit(c.get('db'), clientIp, 'AI');
    if (!rateLimitResult.allowed) {
      throw new ApiError(
        'RATE_LIMIT_EXCEEDED',
        `Too many AI requests. Please try again after ${rateLimitResult.retryAfter} seconds.`,
        429
      );
    }
  } catch (error) {
    // If it's already an ApiError (rate limit exceeded), rethrow it
    if (error instanceof ApiError) {
      throw error;
    }
    // Log the error but allow the request to proceed (fail-open for reliability)
    console.error('[AI] Rate limit check failed, allowing request', { error });
  }
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const safeJsonParse = (value: string) => {
  try {
    return { ok: true as const, value: JSON.parse(value) as unknown };
  } catch (error) {
    return { ok: false as const, error };
  }
};

const shouldRetryStatus = (status: number) =>
  status === 408 || status === 429 || (status >= 500 && status <= 599);

const getRetryDelay = (attempt: number, retryAfterHeader?: string | null) => {
  if (retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader);
    if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000;
    }
  }
  const jitter = Math.floor(Math.random() * 150);
  return BASE_RETRY_DELAY_MS * Math.pow(2, attempt) + jitter;
};

class StreamAbortError extends Error {
  constructor(message = 'Stream aborted') {
    super(message);
    this.name = 'StreamAbortError';
  }
}

type RetryAttemptInfo = {
  attempt: number;
  elapsedMs: number;
  status?: number;
  error?: string;
  timedOut?: boolean;
  delayMs?: number;
  retryAfter?: string | null;
};

type FetchRetryResult = {
  response: Response;
  attempts: number;
  elapsedMs: number;
  retryHistory: RetryAttemptInfo[];
};

type FetchRetryError = {
  error: unknown;
  attempts: number;
  elapsedMs: number;
  lastErrorType: 'network' | 'timeout' | 'unknown';
  retryHistory: RetryAttemptInfo[];
};

const fetchWithRetry = async (
  endpoint: string,
  options: RequestInit,
  timeoutMs: number,
  maxRetries: number,
  onRetry?: (info: { attempt: number; delayMs: number; status?: number; error?: string }) => void,
  abortSignal?: AbortSignal
): Promise<FetchRetryResult> => {
  let lastError: unknown;
  let lastErrorType: 'network' | 'timeout' | 'unknown' = 'unknown';
  let totalElapsedMs = 0;
  const retryHistory: RetryAttemptInfo[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (abortSignal?.aborted) {
      throw new StreamAbortError();
    }
    const controller = new AbortController();
    let timedOut = false;
    let externalAborted = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const handleAbort = () => {
      externalAborted = true;
      controller.abort();
    };
    abortSignal?.addEventListener('abort', handleAbort);
    const start = Date.now();
    try {
      const response = await fetch(endpoint, { ...options, signal: controller.signal });
      const elapsed = Date.now() - start;
      totalElapsedMs += elapsed;
      clearTimeout(timeoutId);
      abortSignal?.removeEventListener('abort', handleAbort);
      const attemptInfo: RetryAttemptInfo = { attempt: attempt + 1, elapsedMs: elapsed, status: response.status };
      retryHistory.push(attemptInfo);

      if (response.ok || !shouldRetryStatus(response.status) || attempt === maxRetries) {
        return { response, attempts: attempt + 1, elapsedMs: totalElapsedMs, retryHistory };
      }

      const delayMs = getRetryDelay(attempt, response.headers.get('Retry-After'));
      attemptInfo.delayMs = delayMs;
      attemptInfo.retryAfter = response.headers.get('Retry-After');
      onRetry?.({ attempt: attempt + 1, delayMs, status: response.status });
      await sleep(delayMs);
      continue;
    } catch (error) {
      clearTimeout(timeoutId);
      abortSignal?.removeEventListener('abort', handleAbort);
      const elapsed = Date.now() - start;
      totalElapsedMs += elapsed;
      lastError = error;
      const attemptInfo: RetryAttemptInfo = {
        attempt: attempt + 1,
        elapsedMs: elapsed,
        error: String(error),
        timedOut,
      };

      if (externalAborted) {
        throw new StreamAbortError();
      }
      if (!timedOut && abortSignal?.aborted) {
        throw new StreamAbortError();
      }

      // Classify error type for better retry strategy
      const errorStr = String(error);
      if (timedOut || errorStr.includes('timeout') || errorStr.includes('timed out')) {
        lastErrorType = 'timeout';
      } else if (
        errorStr.includes('ECONNREFUSED') ||
        errorStr.includes('ECONNRESET') ||
        errorStr.includes('ENOTFOUND') ||
        errorStr.includes('ETIMEDOUT') ||
        errorStr.includes('fetch failed') ||
        errorStr.includes('network')
      ) {
        lastErrorType = 'network';
      }

      if (attempt === maxRetries) {
        retryHistory.push(attemptInfo);
        throw {
          error: lastError,
          attempts: attempt + 1,
          elapsedMs: totalElapsedMs,
          lastErrorType,
          retryHistory,
        } satisfies FetchRetryError;
      }

      // Aggressive retry for first network error (Double Tap)
      // If the first request fails due to network/handshake, try again immediately.
      const delayMs = lastErrorType === 'network' && attempt === 0
        ? 10 // Almost immediate retry for first network glitch
        : getRetryDelay(attempt);

      attemptInfo.delayMs = delayMs;
      retryHistory.push(attemptInfo);
      onRetry?.({ attempt: attempt + 1, delayMs, error: String(error) });
      await sleep(delayMs);
    }
  }

  throw {
    error: lastError,
    attempts: maxRetries + 1,
    elapsedMs: totalElapsedMs,
    lastErrorType,
    retryHistory,
  } satisfies FetchRetryError;
};

// Helper function to execute tool calls using the registry
async function executeTool(c: Context<{ Bindings: Bindings; Variables: Variables }>, toolName: string, args: Record<string, unknown>): Promise<string> {
  const registry = createToolRegistry(c);
  const tool = registry.get(toolName);
  if (!tool) {
    return `Unknown tool: ${toolName}`;
  }
  if (tool.category === 'action') {
    return 'Error: Tool not permitted in this session.';
  }
  return await registry.execute(toolName, {
    db: c.get('db'),
    args,
    toolName,
  });
}

const historySchema = z.array(
  z.object({
    role: z.enum(['user', 'model', 'system']),
    parts: z.array(
      z.object({
        text: z.string().min(1).max(MAX_HISTORY_PART_CHARS),
      })
    ),
  })
).max(100);

const requestSchema = z.object({
  history: historySchema,
  message: z.string().min(1).max(MAX_MESSAGE_CHARS),
  systemContext: z.string().max(MAX_SYSTEM_CONTEXT_CHARS).optional(),
  allowThinking: z.boolean().optional(),
});

type ProgressEmitter = (event: string, data: Record<string, unknown>) => void;

class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const buildSystemInstruction = (systemContext?: string) => {
  const today = new Date().toISOString().split('T')[0];
  return `You are FlowSync AI, a project management assistant. Help users manage tasks and projects efficiently.

${systemContext || ''}

═══════════════════════════════════════════════════════════════
CRITICAL WORKFLOW RULES - FOLLOW THESE IN ORDER
═══════════════════════════════════════════════════════════════

🔍 STEP 1 - UNDERSTAND CONTEXT (Read Tools):
- Use listProjects → listTasks to understand current state
- Use getTask/getProject for specific entity details
- NEVER assume - always READ before WRITE

🔎 STEP 2 - FIND EXISTING ENTITIES (Search Tools):
- ALWAYS use searchTasks BEFORE createTask to check for duplicates
- Search by title/keyword first - if found, use updateTask instead
- Use getTask BEFORE updateTask to see current values

✏️ STEP 3 - MAKE CHANGES (Write Tools):
- All changes create DRAFTS requiring user approval
- ⚠️ CRITICAL: For 5+ tasks, MUST use planChanges (batch operation)
- ⚠️ CRITICAL: Tool call limit is 30 - plan efficiently!
- Use createTask for NEW tasks only (search first!)
- Use updateTask for EXISTING tasks (getTask first!)
- Use planChanges for batch operations (multiple changes at once)
- Explain what will change - users need to understand the draft

💡 STEP 4 - PROVIDE ACTIONABLE SUGGESTIONS (Always Last):
- At the VERY END of your response, add a code block with 3 suggestions
- CRITICAL: Use EXACT format below (no variations):
  \`\`\`suggestions
["显示文本1", "显示文本2", "显示文本3"]
\`\`\`
- Suggestions MUST be plain text that represents meaningful follow-up actions
- Focus on INSIGHTFUL suggestions that:
  * Reveal patterns or trends in the project data
  * Propose optimizations or improvements
  * Suggest analysis or reviews
  * Offer concrete next steps for project management
- AVOID trivial UI operations like "切换视图" (users can click tabs themselves)
- Suggestions MUST be in the SAME LANGUAGE as the user's question
- The code block markers (\`\`\`) are MANDATORY - don't skip them
- This MUST be at the END - nothing after it

═══════════════════════════════════════════════════════════════
TASK OPERATION WORKFLOWS
═══════════════════════════════════════════════════════════════

CREATE NEW TASK:
  searchTasks (confirm doesn't exist) → createTask

UPDATE EXISTING TASK:
  searchTasks (find it) → getTask (read current) → updateTask

DELETE TASK:
  searchTasks (find it) → deleteTask

RESCHEDULE/MOVE TASK:
  getTask (read dates) → calculate new dates → updateTask

BATCH UPDATE 5+ TASKS (Preferred):
  listTasks → planChanges with all updates in ONE call
  Example: listTasks → planChanges({ actions: [updateTask1, updateTask2, ...] })

═══════════════════════════════════════════════════════════════
DATE FORMAT - CRITICAL
═══════════════════════════════════════════════════════════════
- All dates are Unix MILLISECONDS (not seconds!)
- Date.UTC(2025, 4, 19) = May 19, 2025 (month is 0-indexed: 0=Jan, 4=May)
- Current timestamp: ${Date.now()}
- Today: ${today}

DATE CALCULATIONS:
- Add 1 day: current + 86400000
- Add 1 week: current + (7 * 86400000)
- Preserve duration: newDueDate = newStartDate + (oldDueDate - oldStartDate)

═══════════════════════════════════════════════════════════════
RESPONSE GUIDELINES
═══════════════════════════════════════════════════════════════
- Base your response on ACTUAL tool results - don't make things up
- Keep responses concise (2-3 sentences for simple operations)
- If you need more info, ask specific questions
- ALWAYS end with 3 suggestions in JSON format (MANDATORY!)
- Match user's language (Chinese question → Chinese suggestions)

═══════════════════════════════════════════════════════════════
COMMON MISTAKES TO AVOID
═══════════════════════════════════════════════════════════════
❌ Creating tasks without searching first
❌ Updating tasks without reading current values
❌ Forgetting to provide suggestions at the end
❌ Making up data instead of using tool results
❌ Using seconds instead of milliseconds for dates
❌ Providing suggestions in wrong language (match user's language!)
❌ Calling updateTask 17 times individually (EXCEEDS 30-call limit!)
❌ Not using planChanges for batch updates (inefficient!)

✅ Best Practices:
- Search before create
- Read before update
- Always provide 3 context-aware suggestions
- Match the language the user is using
- Be concise and accurate
- For 5+ tasks, use planChanges batch operation`;
};

type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

const runAIRequest = async (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  input: z.infer<typeof requestSchema>,
  requestId: string,
  emit?: ProgressEmitter,
  abortSignal?: AbortSignal
) => {
  const assertNotAborted = () => {
    if (abortSignal?.aborted) {
      throw new StreamAbortError();
    }
  };
  const { history, message, systemContext, allowThinking } = input;
  const allowThinkingEnabled = allowThinking === true;

  // Create tool registry and get OpenAI-compatible tools
  const toolRegistry = createToolRegistry(c);
  const tools = toolRegistry.getOpenAITools({ categories: ['read', 'write'] });

  assertNotAborted();
  emit?.('stage', { name: 'received' });

  const hasApiKey = !!c.env.OPENAI_API_KEY;
  if (!hasApiKey) {
    throw new ApiError('MISSING_API_KEY', 'Missing API key.', 500);
  }

  assertNotAborted();
  const baseUrl = (c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const model = c.env.OPENAI_MODEL || 'gpt-4';

  emit?.('stage', { name: 'prepare_request' });

  const systemInstruction = buildSystemInstruction(systemContext);

  assertNotAborted();
  await recordLog(c.get('db'), 'ai_request', {
    requestId,
    message,
    history: history.slice(-MAX_HISTORY_MESSAGES),
    messageLength: message.length,
    systemContextLength: systemContext?.length || 0,
    baseUrl,
    endpoint,
    model,
    allowThinking: allowThinkingEnabled
  });

  const boundedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  let messages: ChatMessage[] = [
    { role: 'system', content: systemInstruction },
    ...boundedHistory.map((item): ChatMessage => ({
      role: item.role === 'model' ? 'assistant' : (item.role === 'user' ? 'user' : 'system'),
      content: item.parts.map((part) => part.text).join(''),
    })),
    { role: 'user', content: message },
  ];

  let currentTurn = 0;
  let finalText = '';
  let allFunctionCalls: Array<{ name: string; args: unknown }> = [];
  let lastToolCallSignature: string | null = null;
  let totalToolCalls = 0;
  const upstreamCalls: Array<{
    turn: number;
    attempts: number;
    elapsedMs: number;
    status: number;
    retryHistory: RetryAttemptInfo[];
  }> = [];

  while (currentTurn < MAX_TURNS) {
    assertNotAborted();
    currentTurn++;

    emit?.('stage', { name: 'upstream_request', turn: currentTurn });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    headers['Authorization'] = await getAuthorizationHeader(c.env.OPENAI_API_KEY);

    let response: Response;
    let attempts = 0;
    let elapsedMs = 0;
    let retryHistory: RetryAttemptInfo[] = [];

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.5,
    };

    if (!allowThinkingEnabled) {
      requestBody['thinking'] = { type: 'disabled' };
    }

    try {
      const result = await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        },
        REQUEST_TIMEOUT_MS,
        MAX_RETRIES,
        (info) => {
          emit?.('retry', {
            attempt: info.attempt,
            delayMs: info.delayMs,
            status: info.status,
            error: info.error,
          });
        },
        abortSignal
      );
      response = result.response;
      attempts = result.attempts;
      elapsedMs = result.elapsedMs;
      retryHistory = result.retryHistory;
    } catch (errorInfo) {
      if (errorInfo instanceof StreamAbortError) {
        throw errorInfo;
      }
      const failure = errorInfo as FetchRetryError;
      const err = failure.error;
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      // Re-classify error type for logging
      const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('timed out');
      const isNetwork = errorMsg.includes('ECONN') || errorMsg.includes('network') || errorMsg.includes('fetch failed');
      const errorType = isTimeout ? 'timeout' : (isNetwork ? 'network' : 'unknown');
      
      const errorDetail = `Type: ${errorType}, Attempts: ${failure.attempts}, Elapsed: ${failure.elapsedMs}ms, Error: ${errorMsg}`;

      await recordLog(c.get('db'), 'error', {
        requestId,
        message: 'Upstream request failed (Network/Timeout).',
        detail: errorDetail + (errorStack ? `\nStack: ${errorStack}` : ''),
        baseUrl,
        endpoint,
        model,
        lastErrorType: failure.lastErrorType,
        retryHistory: failure.retryHistory,
        turn: currentTurn,
      });
      console.error('[ai] upstream request failed', {
        requestId,
        message: errorMsg,
        lastErrorType: failure.lastErrorType,
        attempts: failure.attempts,
        elapsedMs: failure.elapsedMs,
        retryHistory: failure.retryHistory,
        baseUrl,
        endpoint,
        model,
      });
      throw new ApiError('OPENAI_ERROR', `Request failed: ${errorMsg}`, 502);
    }

    assertNotAborted();
    emit?.('stage', { name: 'upstream_response', turn: currentTurn, attempts, elapsedMs });

    if (!response.ok) {
      const errorText = await response.text();
      const statusText = response.statusText;
      const headers = Object.fromEntries(response.headers.entries());
      
      await recordLog(c.get('db'), 'error', {
        requestId,
        message: `Upstream returned error status: ${response.status}`,
        detail: `Status: ${response.status} ${statusText}\nHeaders: ${JSON.stringify(headers)}\nBody: ${errorText}`,
        status: response.status,
        attempts,
        elapsedMs,
        retryHistory,
        baseUrl,
        endpoint,
        model,
        turn: currentTurn,
      });
      console.error('[ai] upstream non-OK response', {
        requestId,
        status: response.status,
        statusText,
        attempts,
        elapsedMs,
        retryHistory,
        baseUrl,
        endpoint,
        model,
        bodySnippet: errorText.slice(0, 400),
      });
      throw new ApiError('OPENAI_ERROR', `Provider Error (${response.status}): ${errorText.slice(0, 200)}`, 502);
    }

    upstreamCalls.push({
      turn: currentTurn,
      attempts,
      elapsedMs,
      status: response.status,
      retryHistory,
    });

    const responseJson = await response.json().catch(() => null);
    const responseSchema = z.object({
      choices: z.array(
        z.object({
          message: z.object({
            content: z.string().nullable().optional(),
            tool_calls: z
              .array(
                z.object({
                  id: z.string().optional(),
                  function: z.object({
                    name: z.string().optional(),
                    arguments: z.string().optional(),
                  }).optional(),
                })
              )
              .optional(),
          }).optional(),
        })
      ).optional(),
    });
    const parsedResponse = responseSchema.safeParse(responseJson);
    if (!parsedResponse.success) {
      await recordLog(c.get('db'), 'error', {
        requestId,
        message: 'Invalid upstream response shape.',
        detail: parsedResponse.error.message,
      });
      throw new ApiError('INVALID_UPSTREAM_RESPONSE', 'Invalid response from model.', 502);
    }

    const payload = parsedResponse.data;
    const messagePayload = payload.choices?.[0]?.message;
    if (!messagePayload) {
      throw new ApiError('NO_RESPONSE', 'No response from model.', 502);
    }

    const modelText = messagePayload.content || '';
    const toolCallsFromAPI = messagePayload.tool_calls || [];
    const toolCallSignature = toolCallsFromAPI
      .map((toolCall) => `${toolCall.function?.name || ''}|${toolCall.function?.arguments || ''}`)
      .join(';');

    if (modelText) {
      finalText = modelText;
      emit?.('assistant_text', { text: modelText });
    }

    messages.push({
      role: 'assistant',
      content: modelText,
      tool_calls: toolCallsFromAPI.length > 0 ? toolCallsFromAPI.map(tc => ({
        id: tc.id || `call_${Date.now()}`,
        type: 'function' as const,
        function: {
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || '{}',
        },
      })) : undefined,
    });

    if (toolCallsFromAPI.length === 0) {
      finalText = modelText;
      break;
    }

    if (lastToolCallSignature && toolCallSignature === lastToolCallSignature) {
      break;
    }
    lastToolCallSignature = toolCallSignature;

    for (const toolCall of toolCallsFromAPI) {
      assertNotAborted();
      const toolName = toolCall.function?.name;
      const toolArgs = toolCall.function?.arguments || '{}';

      totalToolCalls += 1;

      emit?.('tool_start', { name: toolName || '' });

      if (totalToolCalls > MAX_TOOL_CALLS) {
        await recordLog(c.get('db'), 'error', {
          requestId,
          message: 'Tool call limit exceeded.',
          detail: `Max tool calls: ${MAX_TOOL_CALLS}`,
        });
        throw new ApiError('TOOL_LIMIT', 'Too many tool calls in a single request.', 400);
      }

      let toolResult: string;
      let parsedArgs: Record<string, unknown> | null = null;
      try {
        assertNotAborted();
        if (toolArgs.length > MAX_TOOL_ARGS_CHARS) {
          throw new Error('Tool arguments too large.');
        }
        const parsed = safeJsonParse(toolArgs);
        if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null) {
          throw new Error('Invalid JSON arguments.');
        }
        parsedArgs = parsed.value as Record<string, unknown>;
        await recordLog(c.get('db'), 'tool_execution', {
          requestId,
          tool: toolName || '',
          args: parsedArgs,
        });
        assertNotAborted();
        toolResult = await executeTool(c, toolName || '', parsedArgs);
      } catch (error) {
        toolResult = `Error: ${error instanceof Error ? error.message : String(error)}`;
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id || '',
        content: toolResult,
      });

      allFunctionCalls.push({ name: toolName || '', args: parsedArgs ?? {} });
      emit?.('tool_end', { name: toolName || '' });
    }
  }

  assertNotAborted();
  await recordLog(c.get('db'), 'ai_response', {
    requestId,
    text: finalText,
    toolCalls: allFunctionCalls,
    turns: currentTurn,
    toolCallsTotal: allFunctionCalls.length,
    upstreamCalls,
  });

  assertNotAborted();
  emit?.('stage', { name: 'done', turns: currentTurn, toolCalls: allFunctionCalls.length });

  return {
    text: finalText,
    toolCalls: allFunctionCalls.length > 0 ? allFunctionCalls : undefined,
    meta: {
      requestId,
      turns: currentTurn,
    },
  };
};

aiRoute.post('/api/ai', zValidator('json', requestSchema), async (c) => {
  const requestId = generateRequestId();
  const input = c.req.valid('json');

  try {
    // Check rate limit before processing
    await checkAIRateLimit(c);

    const result = await runAIRequest(c, input, requestId);
    return jsonOk(c, result);
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(c, error.code, error.message, error.status);
    }
    await recordLog(c.get('db'), 'error', {
      requestId,
      message: 'OpenAI request failed.',
      detail: error instanceof Error ? error.message : String(error),
    });
    console.error('[ai] request failed', {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError(c, 'OPENAI_ERROR', 'OpenAI request failed.', 502);
  }
});

aiRoute.post('/api/ai/stream', zValidator('json', requestSchema), async (c) => {
  const requestId = generateRequestId();
  const input = c.req.valid('json');
  const encoder = new TextEncoder();
  const startTime = Date.now();
  const runAbortController = new AbortController();
  let closed = false;
  let finalizing = false;
  const sendQueue: Array<{ event: string; data: Record<string, unknown> }> = [];
  let sending = false;

  const stream = new ReadableStream({
    async start(controller) {
      const flushQueue = () => {
        if (sending) return;
        sending = true;
        try {
          while (sendQueue.length > 0) {
            if (closed) break;
            const item = sendQueue.shift();
            if (!item) break;
            const payload = {
              ...item.data,
              elapsedMs: Date.now() - startTime,
            };
            controller.enqueue(encoder.encode(`event: ${item.event}\ndata: ${JSON.stringify(payload)}\n\n`));
          }
        } catch {
          closed = true;
          runAbortController.abort();
          controller.close();
        } finally {
          sending = false;
        }
      };

      const send = (event: string, data: Record<string, unknown>) => {
        if (closed) return;
        sendQueue.push({ event, data });
        flushQueue();
      };

      // Check rate limit before processing
      try {
        await checkAIRateLimit(c);
      } catch (error) {
        if (error instanceof ApiError) {
          send('error', { code: error.code, message: error.message, status: error.status });
        }
        controller.close();
        return;
      }

      // Wrap the emit callback to prevent errors from propagating
      const safeEmit: ProgressEmitter = (event, data) => {
        if (closed || finalizing) return;
        try {
          send(event, data);
        } catch {
          // Silently fail on emit error
        }
      };

      runAIRequest(c, input, requestId, safeEmit, runAbortController.signal)
        .then((result) => {
          if (!closed) {
            finalizing = true;
            runAbortController.abort();
            try {
              send('result', result as unknown as Record<string, unknown>);
              send('done', { requestId });
              closed = true;
              controller.close();
            } catch {
              closed = true;
              controller.close();
            }
          }
        })
        .catch((error) => {
          if (!closed) {
            finalizing = true;
            runAbortController.abort();
            try {
              if (error instanceof StreamAbortError) {
                closed = true;
                controller.close();
                return;
              }
              if (error instanceof ApiError) {
                send('error', { code: error.code, message: error.message, status: error.status });
              } else {
                send('error', { code: 'OPENAI_ERROR', message: 'OpenAI request failed.', status: 502 });
              }
              console.error('[ai] stream failed', {
                requestId,
                message: error instanceof Error ? error.message : String(error),
              });
              closed = true;
              controller.close();
            } catch {
              closed = true;
              controller.close();
            }
          }
        });
    },
    cancel() {
      if (!closed) {
        closed = true;
      }
      runAbortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});
