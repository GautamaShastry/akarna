# @akarna/contracts

Strict Zod schemas and inferred TypeScript types for messages and data crossing Akarna extension boundaries.

All schemas reject unknown keys. Provider output is accepted only as an allow-listed `ActionPlan`; selectors, scripts, URLs, and DOM references are not part of the contract.
