import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';
export const ACTIONS_AUDIENCE = 'https://enka-salon.jp/estama-direct-runner';
export const ACTIONS_WORKFLOW = 'nikotaku/newkyasukan/.github/workflows/estama-direct-runner.yml@refs/heads/main';
export type ActionsIdentity = { run_id: string; run_attempt: string; event_name: string; repository_visibility: string };
export function validateActionsClaims(c: Record<string, unknown>, now = Date.now() / 1000): ActionsIdentity {
  if (c.iss !== 'https://token.actions.githubusercontent.com' || c.aud !== ACTIONS_AUDIENCE
    || c.repository !== 'nikotaku/newkyasukan' || c.repository_id !== '1056485219'
    || c.repository_owner_id !== '57981034' || c.ref !== 'refs/heads/main'
    || c.sub !== 'repo:nikotaku/newkyasukan:ref:refs/heads/main'
    || c.workflow_ref !== ACTIONS_WORKFLOW || c.runner_environment !== 'github-hosted'
    || !['workflow_dispatch', 'push'].includes(String(c.event_name))
    || typeof c.exp !== 'number' || c.exp <= now || typeof c.nbf !== 'number' || c.nbf > now + 30
    || typeof c.iat !== 'number' || c.iat > now + 30 || now - c.iat > 600
    || !/^\d+$/.test(String(c.run_id)) || !/^\d+$/.test(String(c.run_attempt))) throw new Error('invalid_actions_identity');
  return c as ActionsIdentity;
}
let cache: { until: number; keys: Array<JsonWebKey & { kid: string }> } | undefined;
export async function verifyActionsIdentity(token: string): Promise<ActionsIdentity> {
  if (!token || token.length > 16000) throw new Error('invalid_actions_identity');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_actions_identity');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('invalid_actions_identity');
  if (!cache || cache.until < Date.now() || !cache.keys.some(k => k.kid === header.kid)) {
    const response = await fetch('https://token.actions.githubusercontent.com/.well-known/jwks', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('identity_provider_unavailable');
    const data = await response.json();
    cache = { until: Date.now() + 300000, keys: data.keys };
  }
  const jwk = cache.keys.find(k => k.kid === header.kid);
  if (!jwk || !verify('RSA-SHA256', Buffer.from(parts.slice(0, 2).join('.')), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error('invalid_actions_identity');
  return validateActionsClaims(JSON.parse(Buffer.from(parts[1], 'base64url').toString()));
}
