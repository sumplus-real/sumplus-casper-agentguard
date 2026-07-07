/**
 * Arsenal MCP Server
 *
 * Provides Model Context Protocol interface for Arsenal skills marketplace.
 * Supports Resources (skill content) and Tools (operations).
 *
 * Usage:
 * - Claude Desktop: Configure in claude_desktop_config.json
 * - Claude Code: Use MCP protocol for skill discovery and execution
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SkillsService } from "@/services/skills.service";
import type { ArsenalSkill, SkillFilters } from "@/types/skill";

/**
 * Arsenal MCP Server
 *
 * Implements MCP protocol for Arsenal integration with Claude.
 */
export class ArsenalMCPServer {
  private server: Server;
  private skillsService: SkillsService;

  constructor() {
    this.server = new Server(
      {
        name: "arsenal",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.skillsService = new SkillsService();
    this.setupHandlers();
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      // Get all approved skills for resource listing
      const result = await this.skillsService.searchSkills(undefined, {}, 1, 100);

      return {
        resources: result.skills.map((skill) => ({
          uri: `arsenal://skills/${skill.id}`,
          name: skill.name,
          description: skill.description,
          mimeType: "text/markdown",
        })),
      };
    });

    // Read a specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const match = uri.match(/^arsenal:\/\/skills\/([^\/]+)(?:\/(.+))?$/);

      if (!match) {
        throw new Error(`Invalid URI format: ${uri}`);
      }

      const [, skillId, subpath] = match;

      // Reading a reference file
      if (subpath && subpath.startsWith("references/")) {
        const content = await this.skillsService.getSkillReference(skillId, subpath);
        if (!content) {
          throw new Error(`Reference not found: ${subpath}`);
        }

        return {
          contents: [
            {
              uri,
              mimeType: "text/markdown",
              text: content,
            },
          ],
        };
      }

      // Reading main skill content
      const skillMd = await this.skillsService.getSkillAsAnthropicFormat(skillId);
      if (!skillMd) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: skillMd,
          },
        ],
      };
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "searchSkills",
            description:
              "Search Arsenal skills marketplace using natural language or filters. Returns list of skills with metadata.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Natural language search query (e.g., 'swap tokens on Uniswap')",
                },
                category: {
                  type: "string",
                  description: "Filter by category (e.g., 'DeFi', 'NFT', 'DAO')",
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Filter by tags",
                },
                is_paid: {
                  type: "boolean",
                  description: "Filter by payment requirement",
                },
                min_rating: {
                  type: "number",
                  description: "Minimum average rating (1-5)",
                },
                page: {
                  type: "number",
                  description: "Page number (1-indexed, default: 1)",
                },
                limit: {
                  type: "number",
                  description: "Results per page (default: 20)",
                },
              },
            },
          },
          {
            name: "getSkill",
            description: "Get detailed information about a specific skill by ID.",
            inputSchema: {
              type: "object",
              properties: {
                skillId: {
                  type: "string",
                  description: "Skill UUID",
                },
              },
              required: ["skillId"],
            },
          },
          {
            name: "executeSkill",
            description:
              "Execute a skill action. Returns real on-chain data for read operations (quotes, balances) and ready-to-sign transaction payloads for write operations (swaps, lending). Arsenal does not hold keys — pass the returned transactions to the user's wallet for signing.",
            inputSchema: {
              type: "object",
              properties: {
                skillId: {
                  type: "string",
                  description: "Skill UUID to execute",
                },
                input: {
                  type: "object",
                  description: "Input parameters matching skill's input schema",
                },
                paymentProof: {
                  type: "string",
                  description: "Optional x402 payment proof for paid skills",
                },
              },
              required: ["skillId", "input"],
            },
          },
          {
            name: "getCategories",
            description: "Get list of all skill categories.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Type assertion for args (MCP SDK uses unknown type)
      const toolArgs = args as Record<string, any>;

      switch (name) {
        case "searchSkills": {
          const filters: SkillFilters = {
            category: toolArgs.category as string | undefined,
            tags: toolArgs.tags as string[] | undefined,
            is_paid: toolArgs.is_paid as boolean | undefined,
            min_rating: toolArgs.min_rating as number | undefined,
          };

          const result = await this.skillsService.searchSkills(
            toolArgs.query as string | undefined,
            filters,
            (toolArgs.page as number) || 1,
            (toolArgs.limit as number) || 20
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "getSkill": {
          const skill = await this.skillsService.getSkill(toolArgs.skillId as string);
          if (!skill) {
            throw new Error(`Skill not found: ${toolArgs.skillId}`);
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(skill, null, 2),
              },
            ],
          };
        }

        case "executeSkill": {
          const execResult = await this.skillsService.executeSkill({
            skill_id: toolArgs.skillId as string,
            input: toolArgs.input as Record<string, any>,
            payment_proof: toolArgs.paymentProof as string | undefined,
          });

          // Normalise to same shape as POST /api/execute:
          // { success, result: {...}, output: {...} }
          // Both "result" and "output" point to the same data so callers
          // on either path can use the same field name without branching.
          const normalised = {
            success: execResult.success,
            result: execResult.output,   // matches REST /api/execute convention
            output: execResult.output,   // kept for backward compat
            error: execResult.error,
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(normalised, null, 2),
              },
            ],
          };
        }

        case "getCategories": {
          const categories = await this.skillsService.getCategories();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ categories }, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Start the MCP server
   *
   * Uses stdio transport for communication with Claude Desktop/Code.
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error("Arsenal MCP Server started");
  }
}

/**
 * Main entry point
 *
 * Start the server when executed directly.
 */
if (require.main === module) {
  const server = new ArsenalMCPServer();
  server.start().catch((error) => {
    console.error("Failed to start Arsenal MCP Server:", error);
    process.exit(1);
  });
}
