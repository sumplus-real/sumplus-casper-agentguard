/**
 * EvoMap - Genome Evolution Protocol for AI Agents
 *
 * A genome defines a bundle of skills that compose a specialized agent persona.
 * Inspired by evomap.ai's GEP (Genome Evolution Protocol).
 */

/** A single gene within a genome - references an Arsenal skill */
export interface Gene {
  /** Unique gene identifier (slug) */
  id: string;
  /** Display name */
  name: string;
  /** Short description of what this gene provides */
  description: string;
  /** Arsenal skill category */
  category: string;
  /** Capabilities this gene provides */
  capabilities: string[];
  /** Arsenal skill ID (UUID) if it exists in the database, null for local-only skills */
  skill_id: string | null;
  /** Skill source reference (e.g., file path, seed file, or "database") */
  source: string;
  /** Whether this skill requires payment */
  is_paid: boolean;
  /** Tags for this gene */
  tags: string[];
}

/** A complete genome definition */
export interface Genome {
  /** Unique genome identifier (slug) */
  id: string;
  /** Human-readable genome name */
  name: string;
  /** Semantic version */
  version: string;
  /** Description of the agent persona this genome creates */
  description: string;
  /** Detailed persona description for agents (system prompt) */
  persona: string;
  /** The genes that compose this genome */
  genes: Gene[];
  /** Domain/category this genome specializes in */
  domain: string;
  /** Chains/networks this genome operates on */
  supported_chains: string[];
  /** Required features for the host agent */
  required_features: string[];
  /** Author */
  author: string;
  /** ISO timestamp */
  created_at: string;
  /** ISO timestamp */
  updated_at: string;
}
