# Security Policy

## Supported Branch

Security fixes are handled on the default branch of this repository.

## Reporting a Vulnerability

Please report vulnerabilities privately to the Sumplus maintainers instead of
opening a public issue. Include affected components, reproduction steps, and
impact.

## Buildathon Review Standard

For Casper Buildathon qualification, all GitHub security alerts with High
severity or greater must be remediated before final review. Dependabot alerts,
CodeQL results, and dependency review failures should be treated as release
blockers unless a maintainer documents why a finding is not exploitable in this
project.

## Key Handling

Arsenal and Casper AgentGuard do not custody private keys. Generated
`casper-client` commands reference a local `secret_key.pem`, but key files must
stay outside the repository and must never be committed.
