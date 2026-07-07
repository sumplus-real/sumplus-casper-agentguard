# Contributing

## Development

```bash
npm install
npm run dev
```

For Casper AgentGuard contract work:

```bash
cd contracts/casper-agentguard
make prepare
make build-contract
```

## Skill Changes

When adding or changing a skill, update:

- the skill implementation in `src/skills`
- executor routing in `src/lib/skill-executors.ts`
- schema sync registry in `scripts/sync-schemas.ts`
- `ARSENAL.md`
- `src/app/docs/page.tsx`

This matches the repository's existing agent documentation rule.

## Pull Requests

Keep pull requests focused. Include the command output for any tests or builds
that exercise the changed code. Do not commit secrets, local key files, or
generated private wallet material.
