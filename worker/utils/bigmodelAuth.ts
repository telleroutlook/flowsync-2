/**
 * BigModel (Zhipu AI) JWT Authentication
 *
 * Zhipu AI API key format: id.secret
 * Requires JWT signature to generate temporary token
 */

const encoder = new TextEncoder();

export interface BigModelApiKey {
  id: string;
  secret: string;
}

const assertCrypto = () => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Crypto API unavailable.');
  }
};

const base64UrlEncodeBytes = (bytes: Uint8Array) => {
  if (typeof btoa !== 'function') {
    throw new Error('Base64 encoder unavailable.');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlEncodeJson = (value: unknown) => {
  const json = JSON.stringify(value);
  return base64UrlEncodeBytes(encoder.encode(json));
};

/**
 * Parse Zhipu AI API key
 */
export function parseBigModelApiKey(apiKey: string): BigModelApiKey | null {
  const parts = apiKey.split('.');
  if (parts.length !== 2) {
    return null;
  }
  return { id: parts[0], secret: parts[1] };
}

/**
 * Generate Zhipu AI JWT token
 *
 * @param apiKey - Zhipu AI API key (format: id.secret)
 * @param expSeconds - Expiration time (seconds), default 3600 seconds (1 hour)
 */
export async function generateBigModelToken(apiKey: string, expSeconds = 3600): Promise<string> {
  assertCrypto();
  const parsed = parseBigModelApiKey(apiKey);
  if (!parsed) {
    throw new Error('Invalid BigModel API key format. Expected: id.secret');
  }

  const { id, secret } = parsed;
  const now = Date.now();
  const exp = now + expSeconds * 1000;

  // JWT Header
  const header = {
    alg: 'HS256',
    sign_type: 'SIGN',
  };

  // JWT Payload
  const payload = {
    api_key: id,
    exp,
    timestamp: now,
  };

  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);

  // Signature
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(dataToSign)));
  const signature = base64UrlEncodeBytes(signatureBytes);

  return `${dataToSign}.${signature}`;
}

/**
 * Check if using Zhipu AI API
 */
export function isBigModelApi(baseUrl: string, model?: string): boolean {
  return baseUrl.includes('bigmodel.cn') || (model?.toLowerCase().startsWith('glm') ?? false);
}

/**
 * Get authorization header
 */
export async function getAuthorizationHeader(apiKey: string): Promise<string> {
  // Temporary: Disable JWT generation to test direct API Key support for 'coding' endpoint
  // if (isBigModelApi(baseUrl, model)) {
  //   const token = await generateBigModelToken(apiKey);
  //   return `Bearer ${token}`;
  // }
  return `Bearer ${apiKey}`;
}
