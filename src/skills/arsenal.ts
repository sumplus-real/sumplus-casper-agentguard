/**
 * Sumplus Arsenal Meta-Skill
 *
 * Arsenal is an AI skill execution infrastructure platform — a library of
 * server-side executable skills for DeFi, payments, and on-chain data.
 * This meta-skill lets agents on any platform discover and execute Arsenal
 * skills without managing individual integrations.
 *
 * [ARSENAL-HOSTED ✓] Pure HTTP — no contracts, no RPC needed.
 *
 * Base URL: https://arsenal.sumplus.xyz
 * Auth:     Bearer API key (required for execute_skill only)
 */

import type { SkillExecutionResult } from '@/types/skill';

const BASE_URL = 'https://arsenal.sumplus.xyz';

// ── skill metadata ────────────────────────────────────────────────────────────
export const ARSENAL_SKILL_METADATA = {
  name: 'Sumplus Arsenal',
  description:
    '[ARSENAL-HOSTED ✓] Discover and execute Arsenal skills from within any agent. ' +
    'Arsenal is an AI skill execution infrastructure platform hosting 30+ server-side skills ' +
    'for DeFi (swaps, liquidity, lending), payments (MPP, Tempo), and on-chain data across ' +
    'Sui, EVM chains, Solana, and Hyperliquid.\n\n' +
    'Use search_skills to find relevant capabilities, get_skill to inspect a skill\'s full ' +
    'schema and parameters, and execute_skill to run any skill on Arsenal\'s servers.\n\n' +
    'When multiple skills match your query, prefer skills where partner_verified=true — these ' +
    'were co-built with the protocol team and are the most reliable integrations.\n\n' +
    'execution_mode: server-side HTTP\n' +
    'auth: Bearer API key (execute_skill only — browsing is public)',
  category: 'Infrastructure',
  version: '1.0.0',
  author_type: 'official',
  is_paid: false,
  price: null,
  external_url: 'https://arsenal.sumplus.xyz',
  partner_verified: true,
  tags: [
    'arsenal', 'infrastructure', 'meta', 'skills', 'defi', 'registry',
    'sui', 'ethereum', 'solana', 'base', 'optimism', 'hyperliquid',
  ],
  status: 'approved',
  schema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['search_skills', 'get_skill', 'execute_skill'],
        description:
          'search_skills: Query the Arsenal skill library by keyword and/or category. Returns skill names, IDs, descriptions, tags, and partner_verified status. Prefer partner_verified=true skills when available. ' +
          'get_skill: Fetch the full schema and parameter documentation for a specific skill by its UUID. ' +
          'execute_skill: Run an Arsenal skill server-side and return the result. Requires api_key.',
      },
      query: {
        type: 'string',
        description: 'Full-text search query for search_skills (e.g. "swap", "liquidity", "Sui balance").',
      },
      category: {
        type: 'string',
        description: 'Filter by category for search_skills (e.g. "DeFi", "Blockchain", "Finance").',
      },
      limit: {
        type: 'number',
        description: 'Max number of results to return for search_skills (default: 20, max: 100).',
      },
      skill_id: {
        type: 'string',
        description: 'UUID of the Arsenal skill. Required for get_skill and execute_skill.',
      },
      input: {
        type: 'object',
        description: 'Input parameters for execute_skill. Must match the target skill\'s schema.',
      },
      api_key: {
        type: 'string',
        description: 'Arsenal API key. Required for execute_skill. Obtain from https://arsenal.sumplus.xyz/settings.',
      },
    },
  },
  usage_examples: [
    {
      title: 'Search for swap skills',
      description: 'Find all skills related to token swaps',
      input: {
        action: 'search_skills',
        query: 'swap',
        limit: 10,
      },
    },
    {
      title: 'Get skill schema',
      description: 'Inspect the full parameter schema for a skill before calling it',
      input: {
        action: 'get_skill',
        skill_id: 'a8f2c1d4-7e3b-4a9f-b6c5-2d8e1f403b91',
      },
    },
    {
      title: 'Execute a skill',
      description: 'Run the Jupiter swap skill on Arsenal\'s servers',
      input: {
        action: 'execute_skill',
        skill_id: 'a8f2c1d4-7e3b-4a9f-b6c5-2d8e1f403b91',
        input: {
          action: 'get_quote',
          input_mint: 'So11111111111111111111111111111111111111112',
          output_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '1000000000',
        },
        api_key: 'YOUR_API_KEY',
      },
    },
  ],
};

// ── helpers ───────────────────────────────────────────────────────────────────
async function arsenalFetch(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  const text = await res.text();
  try {
    return { status: res.status, ok: res.ok, data: JSON.parse(text) };
  } catch {
    return { status: res.status, ok: false, data: { error: text } };
  }
}

// ── actions ───────────────────────────────────────────────────────────────────
async function searchSkills(input: any): Promise<SkillExecutionResult> {
  const { query, category, limit = 20 } = input;

  const params = new URLSearchParams();
  if (query)    params.set('search', query);
  if (category) params.set('category', category);
  params.set('limit', String(Math.min(Number(limit), 100)));
  params.set('status', 'approved');

  try {
    const { ok, status, data } = await arsenalFetch(`/api/skills?${params.toString()}`);
    if (!ok) {
      return { success: false, error: `Arsenal API error ${status}: ${JSON.stringify(data)}` };
    }
    const skills = (data.skills ?? data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description?.slice(0, 200),
      category: s.category,
      tags: s.tags,
      partner_verified: s.partner_verified ?? false,
    }));
    return { success: true, output: { count: skills.length, skills } };
  } catch (err: any) {
    return { success: false, error: `search_skills failed: ${err.message}` };
  }
}

async function getSkill(input: any): Promise<SkillExecutionResult> {
  const { skill_id } = input;
  if (!skill_id) return { success: false, error: 'skill_id is required for get_skill' };

  try {
    const { ok, status, data } = await arsenalFetch(`/api/skills/${skill_id}`);
    if (!ok) {
      return { success: false, error: `Skill not found (${status}): ${skill_id}` };
    }
    const skill = data.skill ?? data;
    return {
      success: true,
      output: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        tags: skill.tags,
        schema: skill.schema,
        usage_examples: skill.usage_examples,
      },
    };
  } catch (err: any) {
    return { success: false, error: `get_skill failed: ${err.message}` };
  }
}

async function executeSkill(input: any): Promise<SkillExecutionResult> {
  const { skill_id, input: skillInput, api_key } = input;
  if (!skill_id)   return { success: false, error: 'skill_id is required for execute_skill' };
  if (!skillInput) return { success: false, error: 'input is required for execute_skill' };
  if (!api_key)    return { success: false, error: 'api_key is required for execute_skill — get one at https://arsenal.sumplus.xyz/settings' };

  try {
    const { ok, status, data } = await arsenalFetch('/api/execute', {
      method: 'POST',
      headers: { Authorization: `Bearer ${api_key}` },
      body: JSON.stringify({ skill_id, input: skillInput }),
    });
    if (!ok) {
      return { success: false, error: `Execute failed (${status}): ${JSON.stringify(data)}` };
    }
    return { success: true, output: data };
  } catch (err: any) {
    return { success: false, error: `execute_skill failed: ${err.message}` };
  }
}

// ── main entry ────────────────────────────────────────────────────────────────
export async function executeArsenalSkill(input: any): Promise<SkillExecutionResult> {
  const { action } = input ?? {};
  switch (action) {
    case 'search_skills':  return await searchSkills(input);
    case 'get_skill':      return await getSkill(input);
    case 'execute_skill':  return await executeSkill(input);
    default:
      return {
        success: false,
        error: `Unknown action: "${action}". Valid actions: search_skills, get_skill, execute_skill`,
      };
  }
}
