import { NextResponse } from "next/server";
import { DEFI_AGENT_GENOME } from "@/data/defi-agent-genome";

export const dynamic = "force-dynamic";

/**
 * GET /api/evomap/defi-agent
 *
 * Returns the DeFi Expert Agent genome definition.
 * Agents fetch this to "load" the DeFi expert persona
 * and discover which skills they need to acquire/execute.
 */
export async function GET() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://arsenal.sumplus.xyz";

  return NextResponse.json(
    {
      genome: DEFI_AGENT_GENOME,
      _meta: {
        protocol: "GEP (Genome Evolution Protocol)",
        inspired_by: "evomap.ai",
        arsenal_base_url: base,
        load_instructions:
          "To activate this genome, load each gene's skill from Sumplus Arsenal " +
          "using the skill_id (for database skills) or the source reference. " +
          "The persona field contains the system prompt for the agent.",
        skill_acquisition: {
          database_skills: `GET ${base}/api/skills/{skill_id}`,
          all_skills: `GET ${base}/api/skills?search={gene_name}`,
          execute: `POST ${base}/api/execute { "skill_id": "...", "input": {...} }`,
        },
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
