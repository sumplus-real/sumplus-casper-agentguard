/**
 * Shared proxy helper for Maria A2A skill calls.
 *
 * Each maria-* skill calls this to forward structured input to Maria's
 * /api/v2/skill/<name>/invoke endpoint, authenticating with MARIA_SERVICE_KEY
 * and passing caller context headers extracted from the input envelope.
 */

import type { SkillExecutionResult } from '@/types/skill';

const MARIA_BACKEND = process.env.MARIA_BACKEND_URL ?? 'https://maria.sumplus.xyz';

export async function callMaria(
  skillName: string,
  input: Record<string, any>,
): Promise<SkillExecutionResult> {
  const serviceKey = process.env.MARIA_SERVICE_KEY;
  if (!serviceKey) {
    return { success: false, output: { error: 'MARIA_SERVICE_KEY not configured on Arsenal server' } };
  }

  // Strip A2A envelope fields — don't forward them in the body
  const { _delegated_user_token, _calling_agent_id, ...payload } = input;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceKey}`,
  };
  if (_delegated_user_token) headers['X-Delegated-User-Token'] = String(_delegated_user_token);
  if (_calling_agent_id)     headers['X-Calling-Agent-Id']     = String(_calling_agent_id);

  try {
    const res = await fetch(`${MARIA_BACKEND}/api/v2/skill/${skillName}/invoke`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        output: {
          error: data?.detail?.error ?? `HTTP ${res.status}`,
          detail: data?.detail?.detail ?? null,
          maria_skill: skillName,
        },
      };
    }

    return { success: true, output: data };
  } catch (err: any) {
    return { success: false, output: { error: err.message, maria_skill: skillName } };
  }
}
