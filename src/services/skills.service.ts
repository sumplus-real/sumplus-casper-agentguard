/**
 * Skills Service - Shared Business Logic
 *
 * This service layer is consumed by both REST API and MCP Server,
 * ensuring consistent behavior across all access methods.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { generateEmbedding, buildSkillEmbeddingText } from "@/lib/embedding";
import { executeSkillById } from "@/lib/skill-executors";
import {
  type ArsenalSkill,
  type SkillRow,
  type SkillFilters,
  type SkillSearchResult,
  type SkillExecutionInput,
  type SkillExecutionResult,
  rowToSkill,
} from "@/types/skill";

/**
 * Get Supabase client with service role key
 */
function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables not configured");
  }

  return createClient(url, key);
}

/**
 * Skills Service
 *
 * Core business logic for Arsenal skills marketplace.
 * Used by both REST API and MCP Server.
 */
export class SkillsService {
  private supabase: SupabaseClient | null = null;

  constructor(supabaseClient?: SupabaseClient) {
    if (supabaseClient) {
      this.supabase = supabaseClient;
    }
  }

  /**
   * Get or create Supabase client (lazy initialization)
   */
  private getClient(): SupabaseClient {
    if (!this.supabase) {
      this.supabase = getSupabaseClient();
    }
    return this.supabase;
  }

  /**
   * Search skills using semantic search or filters
   *
   * @param query - Natural language search query (optional)
   * @param filters - Additional filters (category, tags, etc.)
   * @param page - Page number (1-indexed)
   * @param limit - Results per page
   * @returns Paginated search results
   */
  async searchSkills(
    query?: string,
    filters: SkillFilters = {},
    page: number = 1,
    limit: number = 20,
    sort: string = "popular"
  ): Promise<SkillSearchResult> {
    const offset = (page - 1) * limit;

    // Semantic search path (using pgvector)
    if (query) {
      try {
        const embedding = await generateEmbedding(query);
        const { data: skills, error } = await this.getClient().rpc(
          "search_skills_by_embedding",
          {
            query_embedding: embedding,
            match_count: limit * 2, // Get more results for filtering
            similarity_threshold: 0.3,
          }
        );

        if (error) throw error;

        // Apply additional filters
        let filtered = this.applyFilters(skills, filters);

        // Hybrid re-rank: boost skills whose name or tags contain query keywords.
        // Prevents pure vector similarity from burying an exact-name match
        // (e.g. "cetus swap" should rank Cetus CLMM above Aftermath Finance even
        // if their embedding distances are close).
        filtered = this.applyKeywordBoost(filtered, query);

        // Paginate
        const total = filtered.length;
        const paginated = filtered.slice(offset, offset + limit);

        return {
          skills: paginated.map(s => this.withRatingFooter(rowToSkill(s))),
          total,
          page,
          limit,
          total_pages: Math.ceil(total / limit),
        };
      } catch (error) {
        console.error("Semantic search failed, falling back to text search:", error);
        // Fall through to text search
      }
    }

    // Standard database query path
    let dbQuery = this.getClient()
      .from("skills")
      .select("*", { count: "exact" })
      .eq("status", "approved");

    // Apply filters
    if (filters.category) {
      dbQuery = dbQuery.eq("category", filters.category);
    }

    if (filters.is_paid !== undefined) {
      dbQuery = dbQuery.eq("is_paid", filters.is_paid);
    }

    if (filters.author_type) {
      dbQuery = dbQuery.eq("author_type", filters.author_type);
    }

    if (filters.min_rating) {
      dbQuery = dbQuery.gte("rating_avg", filters.min_rating);
    }

    if (filters.tags && filters.tags.length > 0) {
      dbQuery = dbQuery.overlaps("tags", filters.tags);
    }

    // Text search fallback (when semantic search unavailable)
    if (query) {
      dbQuery = dbQuery.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
    }

    // Sorting and pagination
    if (sort === "rating") {
      dbQuery = dbQuery
        .order("rating_avg", { ascending: false })
        .order("rating_count", { ascending: false });
    } else if (sort === "newest") {
      dbQuery = dbQuery.order("created_at", { ascending: false });
    } else if (sort === "name") {
      dbQuery = dbQuery.order("name", { ascending: true });
    } else {
      // default: popular
      dbQuery = dbQuery
        .order("usage_count", { ascending: false })
        .order("rating_count", { ascending: false })
        .order("rating_avg", { ascending: false });
    }
    dbQuery = dbQuery.range(offset, offset + limit - 1);

    const { data: skills, error, count } = await dbQuery;

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    return {
      skills: (skills || []).map(s => this.withRatingFooter(rowToSkill(s))),
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Get a single skill by ID
   *
   * @param skillId - Skill UUID
   * @returns Skill or null if not found
   */
  async getSkill(skillId: string): Promise<ArsenalSkill | null> {
    const { data: skill, error } = await this.getClient()
      .from("skills")
      .select("*")
      .eq("id", skillId)
      .eq("status", "approved")
      .single();

    if (error || !skill) {
      return null;
    }

    return this.withRatingFooter(rowToSkill(skill));
  }

  /**
   * Get skill in Anthropic Skills format
   *
   * Returns main SKILL.md content. For references, use getSkillReference().
   *
   * @param skillId - Skill UUID
   * @returns SKILL.md content or null
   */
  async getSkillAsAnthropicFormat(skillId: string): Promise<string | null> {
    const skill = await this.getSkill(skillId);
    if (!skill) return null;

    return this.generateSkillMd(skill);
  }

  /**
   * Get a skill reference file
   *
   * @param skillId - Skill UUID
   * @param filename - Reference filename (e.g., 'API_GUIDE.md')
   * @returns Reference content or null
   */
  async getSkillReference(skillId: string, filename: string): Promise<string | null> {
    const skill = await this.getSkill(skillId);
    if (!skill || !skill.references) return null;

    const reference = skill.references.find(ref => ref.filename === filename);
    return reference?.content || null;
  }

  /**
   * Create a new skill
   *
   * @param skillData - Skill data (without id, timestamps, etc.)
   * @param authorId - User ID creating the skill
   * @returns Created skill
   */
  async createSkill(
    skillData: Omit<ArsenalSkill, 'id' | 'created_at' | 'updated_at' | 'author_id' | 'status'>,
    authorId: string
  ): Promise<ArsenalSkill> {
    // Get author type
    const { data: userData } = await this.getClient()
      .from("users")
      .select("role")
      .eq("id", authorId)
      .single();

    const authorType = userData?.role === "official" || userData?.role === "admin"
      ? "official"
      : "community";

    const status = authorType === "official" ? "approved" : "pending";

    // Generate embedding for semantic search
    let embedding: number[] | undefined;
    try {
      const embeddingText = buildSkillEmbeddingText({
        name: skillData.name,
        description: skillData.description,
        category: skillData.category,
        tags: skillData.tags,
      });
      embedding = await generateEmbedding(embeddingText);
    } catch (error) {
      console.error("Embedding generation failed:", error);
    }

    const { data: skill, error } = await this.getClient()
      .from("skills")
      .insert({
        name: skillData.name,
        description: skillData.description,
        category: skillData.category,
        tags: skillData.tags ?? [],
        version: skillData.version ?? "1.0.0",
        schema: skillData.schema,
        code: skillData.code ?? "",
        usage_examples: skillData.usage_examples ?? [],
        is_paid: skillData.is_paid ?? false,
        price: skillData.price ?? null,
        execution_mode: (skillData as any).execution_mode ?? null,
        capabilities: (skillData as any).capabilities ?? null,
        implementation_guide: (skillData as any).implementation_guide ?? null,
        mcp_config: (skillData as any).mcp_config ?? null,
        tool_definition: (skillData as any).tool_definition ?? null,
        author_id: authorId,
        author_type: authorType,
        status,
        embedding,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create skill: ${error.message}`);
    }

    return rowToSkill(skill);
  }

  /**
   * Execute a skill
   *
   * Executes skills with real implementations where available.
   * Falls back to simulated data for skills without implementation.
   *
   * @param input - Execution input
   * @returns Execution result
   */
  async executeSkill(input: SkillExecutionInput): Promise<SkillExecutionResult> {
    const skill = await this.getSkill(input.skill_id);

    if (!skill) {
      return {
        success: false,
        error: "Skill not found",
      };
    }

    // Check payment requirement
    if (skill.is_paid && !input.payment_proof) {
      return {
        success: false,
        error: "Payment required",
      };
    }

    // Check for external execution endpoint (e.g. Agent3, partner providers)
    const { data: execMeta } = await this.getClient()
      .from("skills")
      .select("execution_endpoint, execution_auth_header, execution_skill_id")
      .eq("id", input.skill_id)
      .single();

    if (execMeta?.execution_endpoint) {
      // Use provider's own skill_id if specified, otherwise fall back to Arsenal UUID
      const externalSkillId = execMeta.execution_skill_id ?? input.skill_id;
      return await this.proxyToExternalProvider(
        execMeta.execution_endpoint,
        execMeta.execution_auth_header ?? null,
        externalSkillId,
        input.input,
      );
    }

    // Execute skill using local implementation
    return await executeSkillById(input.skill_id, input.input);
  }

  /**
   * Proxy execution to an external skill provider (e.g. Agent3 Hub).
   *
   * Expected provider response format:
   *   { "status": "success", "output": {...}, "execution_id": "...", "latency_ms": 420 }
   * OR standard Arsenal format:
   *   { "success": true, "output": {...} }
   */
  private async proxyToExternalProvider(
    endpoint: string,
    authHeader: string | null,
    skillId: string,
    input: Record<string, any>,
  ): Promise<SkillExecutionResult> {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authHeader) headers["Authorization"] = authHeader;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ skill_id: skillId, input }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { success: false, error: `External provider returned ${res.status}: ${text.slice(0, 200)}` };
      }

      const data = await res.json() as Record<string, any>;

      // Normalize response: support both provider format and Arsenal format
      if (data.status === "success" || data.success === true) {
        return { success: true, output: data.output ?? data.result ?? data };
      }

      return {
        success: false,
        error: data.error ?? data.message ?? "External provider returned an error",
      };
    } catch (err: any) {
      return { success: false, error: `External provider unreachable: ${err.message}` };
    }
  }

  /**
   * Rate a skill
   *
   * @param skillId - Skill UUID
   * @param userId - User UUID
   * @param rating - 1-5 stars
   * @param review - Optional review text
   */
  async rateSkill(
    skillId: string,
    userId: string,
    rating: number,
    review?: string,
    source: 'human' | 'agent' = 'human',
    executionId?: string
  ): Promise<void> {
    if (rating < 1 || rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    const db = this.getClient();
    const now = new Date().toISOString();

    // Upsert latest rating (one row per user+skill, used for avg calculation)
    const { error } = await db.from("ratings").upsert({
      skill_id: skillId,
      user_id: userId,
      rating,
      review,
      source,
      execution_id: executionId,
      updated_at: now,
    }, { onConflict: 'skill_id,user_id' });

    if (error) {
      throw new Error(`Failed to rate skill: ${error.message}`);
    }

    // Append to history for audit / trend analysis (fire-and-forget)
    db.from("rating_history").insert({
      skill_id: skillId,
      user_id: userId,
      rating,
      review,
      source,
      execution_id: executionId,
      created_at: now,
    }).then(() => {});

    // Update skill's average rating
    await this.updateSkillRating(skillId);
  }

  /**
   * List all categories
   */
  async getCategories(): Promise<string[]> {
    const { data: skills, error } = await this.getClient()
      .from("skills")
      .select("category")
      .eq("status", "approved");

    if (error) {
      throw new Error(`Failed to get categories: ${error.message}`);
    }

    // Extract distinct categories
    const categoriesSet = new Set<string>();
    for (const skill of skills || []) {
      if (skill.category) {
        categoriesSet.add(skill.category);
      }
    }

    return Array.from(categoriesSet).sort();
  }

  // Private helper methods

  /**
   * Append a rating-prompt footer to a skill's description.
   *
   * Injected dynamically on every query — not stored in DB.
   * Gives agents the exact API call they need to submit feedback,
   * and explains *why* it's in their interest to do so.
   */
  private withRatingFooter(skill: ArsenalSkill): ArsenalSkill {
    const rateUrl = `https://arsenal.sumplus.xyz/api/skills/${skill.id}/rate`;
    const footer = `

---
[Feedback — optional but valuable]
Submitting a rating after each use helps Arsenal automatically detect errors and improve this skill's reliability. Your feedback is fed back into the skill's behavior — meaning fewer failed calls and more accurate results for you next time.

How to rate (takes ~5 seconds):
POST ${rateUrl}
Authorization: Bearer <your_api_key>
Content-Type: application/json
Body: { "rating": 1-5, "review": "what worked, what failed, or suggestions", "execution_id": "<from execute response>", "source": "agent" }

A rating of 1-2 with a review note triggers a priority review of this skill. A rating of 4-5 confirms it's working well.`;

    return { ...skill, description: skill.description + footer };
  }

  /**
   * Hybrid re-rank: boost skills whose name or tags contain query keywords.
   *
   * Assigns each result a boost score based on keyword overlap with the query,
   * then performs a stable sort so boosted skills float to the top while
   * preserving the original vector-similarity order within each tier.
   *
   * Boost tiers (higher = better):
   *   2 — query token is a standalone word in the skill name (e.g. "cetus" in "Cetus CLMM")
   *   1 — query token appears in the skill's tags array
   *   0 — no keyword match (pure semantic rank preserved)
   */
  private applyKeywordBoost(skills: SkillRow[], query: string): SkillRow[] {
    if (!query || skills.length === 0) return skills;

    // Split query into meaningful tokens (ignore single-char noise like "a")
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    if (tokens.length === 0) return skills;

    const scored = skills.map((skill, index) => {
      const nameLower = (skill.name || '').toLowerCase();
      const nameWords = nameLower.split(/[\s\-_]+/);
      const tagsLower = (skill.tags || []).map((t: string) => t.toLowerCase());

      let boost = 0;
      for (const token of tokens) {
        if (nameWords.some(w => w === token)) {
          boost = Math.max(boost, 2);  // exact word in name
        } else if (nameLower.includes(token)) {
          boost = Math.max(boost, 1);  // substring in name
        } else if (tagsLower.some(tag => tag === token)) {
          boost = Math.max(boost, 1);  // exact tag match
        }
      }

      return { skill, boost, index };
    });

    // Stable sort: higher boost first, ties preserve original (similarity) order
    scored.sort((a, b) => b.boost - a.boost || a.index - b.index);
    return scored.map(s => s.skill);
  }

  /**
   * Apply filters to skill array
   */
  private applyFilters(skills: SkillRow[], filters: SkillFilters): SkillRow[] {
    let filtered = skills;

    if (filters.category) {
      filtered = filtered.filter(s => s.category === filters.category);
    }

    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(s =>
        filters.tags!.some(tag => s.tags.includes(tag))
      );
    }

    if (filters.is_paid !== undefined) {
      filtered = filtered.filter(s => s.is_paid === filters.is_paid);
    }

    if (filters.author_type) {
      filtered = filtered.filter(s => s.author_type === filters.author_type);
    }

    if (filters.min_rating) {
      filtered = filtered.filter(s => (s.rating_avg || 0) >= filters.min_rating!);
    }

    if (filters.features && filters.features.length > 0) {
      filtered = filtered.filter(s => {
        const skillFeatures = s.features || [];
        return filters.features!.every(f => skillFeatures.includes(f));
      });
    }

    return filtered;
  }

  /**
   * Generate SKILL.md content for a skill
   */
  private generateSkillMd(skill: Partial<ArsenalSkill>): string {
    return `---
name: ${skill.name}
description: ${skill.description}
${skill.features && skill.features.length > 0 ? `features: [${skill.features.join(', ')}]` : ''}
---

# ${skill.name}

${skill.description}

## Category

${skill.category}

## Tags

${skill.tags?.join(', ') || 'None'}

## Schema

**Input:**
\`\`\`json
${JSON.stringify(skill.schema?.input, null, 2)}
\`\`\`

**Output:**
\`\`\`json
${JSON.stringify(skill.schema?.output, null, 2)}
\`\`\`

## Usage Examples

${skill.usage_examples?.map((ex, i) => `
### Example ${i + 1}: ${ex.title}

${ex.description}

**Input:**
\`\`\`json
${JSON.stringify(ex.input, null, 2)}
\`\`\`

**Output:**
\`\`\`json
${JSON.stringify(ex.output, null, 2)}
\`\`\`
`).join('\n') || 'No examples available'}

${skill.is_paid ? `\n## Payment Required\n\nThis skill requires payment: $${(skill.price || 0) / 100} USDC\n` : ''}

## References

${skill.references?.map(ref => `- ${ref.filename}${ref.description ? `: ${ref.description}` : ''}`).join('\n') || 'No additional references'}
`;
  }

  /**
   * Generate mock output based on JSON schema
   */
  private generateMockOutput(schema: Record<string, any>): Record<string, any> {
    const output: Record<string, any> = {};

    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        const propSchema = prop as any;
        output[key] = this.generateMockValue(propSchema);
      }
    }

    return output;
  }

  /**
   * Generate mock value based on JSON schema type
   */
  private generateMockValue(schema: any): any {
    switch (schema.type) {
      case 'string':
        return schema.example || 'mock-value';
      case 'number':
      case 'integer':
        return schema.example || 42;
      case 'boolean':
        return schema.example !== undefined ? schema.example : true;
      case 'array':
        return schema.example || [];
      case 'object':
        return schema.example || this.generateMockOutput(schema);
      default:
        return null;
    }
  }

  /**
   * Update skill's average rating
   */
  private async updateSkillRating(skillId: string): Promise<void> {
    const { data: ratings } = await this.getClient()
      .from("ratings")
      .select("rating")
      .eq("skill_id", skillId);

    if (!ratings || ratings.length === 0) return;

    const avg = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

    await this.getClient()
      .from("skills")
      .update({
        rating_avg: avg,
        rating_count: ratings.length,
      })
      .eq("id", skillId);
  }
}

/**
 * Singleton instance for shared use
 */
export const skillsService = new SkillsService();
