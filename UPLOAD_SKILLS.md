# Uploading Skills to Arsenal

This guide explains how to upload skills to Sumplus Arsenal using the admin API endpoint instead of manual SQL.

## Quick Start

### 1. Prepare your skills JSON file

Create a JSON file following this structure:

```json
{
  "skills": [
    {
      "name": "Your Skill Name",
      "description": "Detailed description of what this skill does...",
      "category": "Blockchain",
      "tags": ["tag1", "tag2", "tag3"],
      "schema": {
        "input": {
          "type": "object",
          "properties": {
            "param1": {
              "type": "string",
              "description": "Description of param1"
            }
          },
          "required": ["param1"]
        },
        "output": {
          "type": "object",
          "properties": {
            "result": {
              "type": "string"
            }
          }
        }
      },
      "code": "// Implementation code or pseudocode",
      "usage_examples": [
        {
          "description": "Example use case",
          "input": {
            "param1": "example value"
          },
          "expected_output": {
            "result": "expected result"
          }
        }
      ],
      "is_paid": false,
      "price": null,
      "author_type": "official",
      "status": "approved"
    }
  ],
  "auto_embed": true
}
```

### 2. Upload via API

```bash
curl -X POST http://localhost:3000/api/admin/upload-skills \
  -H "Content-Type: application/json" \
  -d @your-skills.json
```

### 3. Verify upload

Check the response:

```json
{
  "total": 3,
  "success_count": 3,
  "failed_count": 0,
  "success": [
    {
      "name": "Your Skill Name",
      "id": "uuid-here"
    }
  ],
  "failed": []
}
```

---

## Field Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill display name (max 200 chars) |
| `description` | string | Detailed description |
| `category` | string | One of: Blockchain, Finance, Data, Productivity, AI/ML, Communication, Security, Analytics |
| `schema` | object | JSON Schema for input and output (must have `input` and `output` keys) |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tags` | string[] | `[]` | Searchable tags for discovery |
| `code` | string | `""` | Implementation code or pseudocode |
| `usage_examples` | array | `[]` | Array of example input/output pairs |
| `is_paid` | boolean | `false` | Whether skill requires payment |
| `price` | number\|null | `null` | USD price per execution (required if `is_paid=true`) |
| `author_type` | string | `"official"` | `"official"` or `"community"` |
| `status` | string | `"approved"` | `"pending"`, `"approved"`, or `"rejected"` |
| `auto_embed` | boolean | `true` | Auto-generate embeddings for semantic search |

---

## Examples

### Example 1: Simple Free Skill

```json
{
  "skills": [
    {
      "name": "Hello World",
      "description": "Returns a greeting message",
      "category": "Productivity",
      "tags": ["test", "example"],
      "schema": {
        "input": {
          "type": "object",
          "properties": {
            "name": {"type": "string"}
          }
        },
        "output": {
          "type": "object",
          "properties": {
            "message": {"type": "string"}
          }
        }
      },
      "code": "export function execute(input) { return { message: `Hello, ${input.name}!` }; }",
      "usage_examples": [
        {
          "input": {"name": "Alice"},
          "expected_output": {"message": "Hello, Alice!"}
        }
      ]
    }
  ]
}
```

### Example 2: Paid Blockchain Skill

```json
{
  "skills": [
    {
      "name": "ETH Balance Checker",
      "description": "Check Ethereum balance across multiple addresses",
      "category": "Blockchain",
      "tags": ["ethereum", "balance", "wallet"],
      "schema": {
        "input": {
          "type": "object",
          "properties": {
            "addresses": {
              "type": "array",
              "items": {"type": "string"}
            }
          },
          "required": ["addresses"]
        },
        "output": {
          "type": "object",
          "properties": {
            "balances": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "address": {"type": "string"},
                  "balance": {"type": "string"}
                }
              }
            }
          }
        }
      },
      "is_paid": true,
      "price": 0.50,
      "author_type": "official",
      "status": "approved"
    }
  ],
  "auto_embed": true
}
```

---

## Batch Upload from Existing Seeds

### Convert SQL to JSON

See `seeds/uniswap-skills.json` for a complete example of Uniswap V3 skills.

### Upload

```bash
# Upload Uniswap skills
curl -X POST http://localhost:3000/api/admin/upload-skills \
  -H "Content-Type: application/json" \
  -d @seeds/uniswap-skills.json

# Upload your custom skills
curl -X POST http://localhost:3000/api/admin/upload-skills \
  -H "Content-Type: application/json" \
  -d @seeds/my-skills.json
```

---

## Production Deployment

For production environments:

```bash
curl -X POST https://arsenal.sumplus.xyz/api/admin/upload-skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d @skills.json
```

**Note:** In production, you should add authentication/authorization to the `/api/admin/upload-skills` endpoint to prevent unauthorized uploads.

---

## Troubleshooting

### Validation Errors

If you get a validation error, check:
- All required fields are present
- `schema` has both `input` and `output` keys
- `category` is one of the valid enums
- If `is_paid=true`, `price` must be a number

### Embedding Generation Failed

If `auto_embed=true` but embedding generation fails:
- Check `OPENAI_API_KEY` and `OPENAI_BASE_URL` are configured
- The skill will still be inserted, but without embedding (search won't work)
- You can regenerate embeddings later: `POST /api/admin/backfill-embeddings`

### Duplicate Skills

If a skill with the same name already exists:
- The insert will fail (duplicate name constraint)
- Check the `failed` array in the response
- Either delete the existing skill or rename the new one

---

## Next Steps

After uploading skills:

1. **Test search**: `GET /api/skills?search=your+intent`
2. **Test execution**: `POST /api/execute` with a skill ID
3. **Check embeddings**: Verify skills appear in semantic search results
4. **Update manifest**: Skills will automatically appear in `GET /api/manifest`

---

## See Also

- [DEVELOPMENT.md](./DEVELOPMENT.md) - Full development guide
- [API.md](./API.md) - Complete API reference
- [seeds/uniswap-skills.json](./seeds/uniswap-skills.json) - Example skills file
