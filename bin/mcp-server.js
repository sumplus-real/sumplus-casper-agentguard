#!/usr/bin/env node

/**
 * Arsenal MCP Server Executable
 *
 * This script starts the Arsenal MCP Server for use with Claude Desktop/Code.
 *
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "arsenal": {
 *       "command": "node",
 *       "args": ["/path/to/sumplus-arsenal/bin/mcp-server.js"],
 *       "env": {
 *         "NEXT_PUBLIC_SUPABASE_URL": "your-url",
 *         "SUPABASE_SERVICE_ROLE_KEY": "your-key",
 *         "OPENAI_BASE_URL": "your-embedding-api-url",
 *         "OPENAI_API_KEY": "your-embedding-api-key"
 *       }
 *     }
 *   }
 * }
 */

// Load environment variables
require('dotenv').config();

// Import and start the server
const { ArsenalMCPServer } = require('../src/mcp/server.ts');

const server = new ArsenalMCPServer();
server.start().catch((error) => {
  console.error('Failed to start Arsenal MCP Server:', error);
  process.exit(1);
});
