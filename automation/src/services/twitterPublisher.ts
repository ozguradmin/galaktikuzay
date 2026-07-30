import type { Env } from '../types';

/**
 * Custom percent encoding conforming to RFC 3986 (required by Twitter OAuth 1.0a).
 */
function rfc3986Encode(str: string): string {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Generate a random 32-character nonce.
 */
function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate HMAC-SHA1 signature using the native Web Crypto API.
 */
async function generateHmacSha1(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(key);
  const messageBuffer = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    messageBuffer
  );

  // Convert ArrayBuffer to Base64
  const bytes = new Uint8Array(signatureBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Build Authorization header for Twitter OAuth 1.0a.
 */
async function buildOAuthHeader(
  method: string,
  url: string,
  env: Env,
  queryParams: Record<string, string> = {}
): Promise<string> {
  const consumerKey = env.TWITTER_API_KEY;
  const consumerSecret = env.TWITTER_API_SECRET;
  const token = env.TWITTER_ACCESS_TOKEN;
  const tokenSecret = env.TWITTER_ACCESS_SECRET;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };

  // Combine query and OAuth parameters
  const allParams = { ...queryParams, ...oauthParams };

  // Sort parameters alphabetically
  const sortedKeys = Object.keys(allParams).sort();
  
  // Format parameter string: key=value joined by &
  const parameterString = sortedKeys
    .map((key) => `${rfc3986Encode(key)}=${rfc3986Encode(allParams[key])}`)
    .join('&');

  // Construct the signature base string
  const signatureBaseString = [
    method.toUpperCase(),
    rfc3986Encode(url),
    rfc3986Encode(parameterString),
  ].join('&');

  // Construct the signing key
  const signingKey = `${rfc3986Encode(consumerSecret)}&${rfc3986Encode(tokenSecret)}`;

  // Generate the signature
  const signature = await generateHmacSha1(signingKey, signatureBaseString);
  oauthParams['oauth_signature'] = signature;

  // Format the Authorization header
  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map((key) => `${rfc3986Encode(key)}="${rfc3986Encode(oauthParams[key])}"`)
    .join(', ');

  return authHeader;
}

/**
 * Post a tweet on X (Twitter) using API v2.
 */
export async function postTweet(
  text: string,
  env: Env
): Promise<{ id: string; text: string } | null> {
  const url = 'https://api.twitter.com/2/tweets';

  try {
    const authHeader = await buildOAuthHeader('POST', url, env);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Twitter API error (${response.status}):`, errText);
      return null;
    }

    const resData = (await response.json()) as any;
    return resData.data || null;
  } catch (error) {
    console.error('Failed to post tweet:', error);
    return null;
  }
}
