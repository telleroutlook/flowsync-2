import { storageGet } from '../src/utils/storage';

// Helper to extract CSRF token from cookies
const getCsrfToken = (): string | undefined => {
  const cookies = document.cookie.split(';');
  const csrfCookie = cookies.find(cookie => cookie.trim().startsWith('csrf_token='));
  return csrfCookie?.split('=')[1]?.trim();
};

export function buildAuthHeaders(includeCsrf = false, workspaceId?: string): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = storageGet('authToken');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // Use provided workspaceId or fall back to localStorage
  const effectiveWorkspaceId = workspaceId ?? storageGet('activeWorkspaceId');
  if (effectiveWorkspaceId) headers.set('X-Workspace-Id', effectiveWorkspaceId);

  // Add CSRF token header for state-changing operations (POST/PATCH/DELETE)
  if (includeCsrf) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set('x-csrf-token', csrfToken);
    }
  }

  return headers;
}

export class AIService {
  private buildHeaders() {
    // All AI requests are POST, so always include CSRF token
    return buildAuthHeaders(true);
  }

  async sendMessage(
    history: { role: string; parts: { text: string }[] }[],
    newMessage: string,
    systemContext?: string,
    allowThinking?: boolean,
    abortSignal?: AbortSignal
  ): Promise<{ text: string; toolCalls?: { name: string; args: unknown }[]; meta?: { requestId?: string; turns?: number } }> {
    const REQUEST_TIMEOUT_MS = 180000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let externalAborted = false;
    const handleExternalAbort = () => {
      externalAborted = true;
      controller.abort();
    };
    if (abortSignal) {
      if (abortSignal.aborted) {
        externalAborted = true;
        controller.abort();
      } else {
        abortSignal.addEventListener('abort', handleExternalAbort);
      }
    }

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ history, message: newMessage, systemContext, allowThinking }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as | {
        success: boolean;
        data?: { text: string; toolCalls?: { name: string; args: unknown }[]; meta?: { requestId?: string; turns?: number } };
        error?: { code: string; message: string };
      } | null;

      if (!response.ok || !payload?.success || !payload?.data) {
        const message = payload?.error?.message || 'OpenAI request failed.';
        throw new Error(message);
      }

      return payload.data;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (externalAborted) {
          throw new Error('REQUEST_CANCELLED');
        }
        throw new Error('Request timed out, please try again later.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (abortSignal) {
        abortSignal.removeEventListener('abort', handleExternalAbort);
      }
    }
  }
}

export const aiService = new AIService();
