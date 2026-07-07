/**
 * POST /api/operations
 *
 * Arsenal Operation Registry — semantic operation names mapped to skill executions.
 *
 * Instead of needing to know skill UUIDs, callers can use named operations:
 *   { "operation": "velodrome_swap", "input": { ... } }
 *
 * This is the primary integration point for agent swap_registry patterns
 * where operation names like "velodrome_swap" / "uniswap_swap" are used.
 *
 * GET /api/operations — returns the full registry (operation → skill mapping)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { skillsService } from "@/services/skills.service";
import { resolveUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ── Operation Registry ────────────────────────────────────────────────────────

interface OperationDef {
  skill_id: string;
  /** Default action injected into input if not already present */
  default_action: string;
  description: string;
  chain?: string;
}

/**
 * Named operations → skill execution mapping.
 * Add new operations here when new skills are deployed.
 */
const OPERATION_REGISTRY: Record<string, OperationDef> = {
  // ── Velodrome (Optimism DEX) ───────────────────────────────────────────────
  velodrome_get_quote: {
    skill_id: "9c4cddc5-afa4-4e1f-9877-1b8676debdf1",
    default_action: "get_quote",
    description: "Quote a Velodrome V2 swap on Optimism. Returns amountOut, price_impact, route.",
    chain: "optimism",
  },
  velodrome_swap: {
    skill_id: "9c4cddc5-afa4-4e1f-9877-1b8676debdf1",
    default_action: "build_swap_tx",
    description: "Build unsigned Velodrome V2 swap calldata on Optimism. Returns {to, data, value}.",
    chain: "optimism",
  },
  velodrome_get_pool: {
    skill_id: "9c4cddc5-afa4-4e1f-9877-1b8676debdf1",
    default_action: "get_pool",
    description: "Fetch Velodrome V2 pool info (reserves, price) for a token pair on Optimism.",
    chain: "optimism",
  },
  velodrome_get_tokens: {
    skill_id: "9c4cddc5-afa4-4e1f-9877-1b8676debdf1",
    default_action: "get_tokens",
    description: "List well-known Velodrome tokens on Optimism with addresses and decimals.",
    chain: "optimism",
  },

  // ── Uniswap V3 ────────────────────────────────────────────────────────────
  uniswap_get_quote: {
    skill_id: "86702f0a-5487-4959-b21a-6de879b9decd",
    default_action: "get_quote",
    description: "Quote a Uniswap V3 swap on any supported chain.",
  },
  uniswap_swap: {
    skill_id: "2384dbf7-10a3-4cf7-9935-62f345e38ebc",
    default_action: "build_tx",
    description: "Build unsigned Uniswap V3 swap calldata. Returns {to, data, value}.",
  },

  // ── Token prices ──────────────────────────────────────────────────────────
  token_price: {
    skill_id: "ff0d3b93-8624-49d2-b962-4e0b61c1c6f1",
    default_action: "get_price",
    description: "Fetch token price(s) via CoinGecko.",
  },

  // ── Wallet / multi-chain ──────────────────────────────────────────────────
  wallet_balance: {
    skill_id: "584dc72e-a3dc-4b98-a38f-26a08741f076",
    default_action: "get_balance",
    description: "Get wallet balance on any Alchemy-supported chain.",
  },
};

// ── Request schema ────────────────────────────────────────────────────────────

const OperationSchema = z.object({
  operation: z.string(),
  input: z.record(z.string(), z.any()).default({}),
});

// ── GET — return registry ─────────────────────────────────────────────────────

export async function GET() {
  const registry = Object.entries(OPERATION_REGISTRY).map(([op, def]) => ({
    operation: op,
    skill_id: def.skill_id,
    default_action: def.default_action,
    description: def.description,
    ...(def.chain ? { chain: def.chain } : {}),
  }));

  return NextResponse.json({
    operations: registry,
    count: registry.length,
    _note:
      "POST /api/operations with { operation, input } to execute. " +
      "Input is forwarded to the mapped skill; 'action' is auto-set from default_action unless overridden.",
  });
}

// ── POST — execute by operation name ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    const userId = token ? await resolveUser(token) : null;
    if (!userId) {
      return NextResponse.json({ error: "API key required." }, { status: 401 });
    }

    const body = await req.json();
    const parse = OperationSchema.safeParse(body);

    if (!parse.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parse.error.flatten() },
        { status: 400 }
      );
    }

    const { operation, input } = parse.data;
    const def = OPERATION_REGISTRY[operation];

    if (!def) {
      const available = Object.keys(OPERATION_REGISTRY);
      return NextResponse.json(
        {
          error: `Unknown operation: "${operation}"`,
          available_operations: available,
          hint: `GET /api/operations to see all registered operations with descriptions.`,
        },
        { status: 404 }
      );
    }

    // Inject default_action unless caller explicitly overrides it
    const resolvedInput = { action: def.default_action, ...input };

    const startTime = Date.now();
    const result = await skillsService.executeSkill({
      skill_id: def.skill_id,
      input: resolvedInput,
    });
    const executionTime = Date.now() - startTime;

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          operation,
          error: result.error,
          skill_id: def.skill_id,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      operation,
      skill_id: def.skill_id,
      result: result.output,
      execution_time_ms: executionTime,
    });
  } catch (error: any) {
    console.error("POST /api/operations error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
