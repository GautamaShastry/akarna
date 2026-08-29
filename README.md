# Akarna

Akarna is a safety-first, conversational browser extension that helps users complete web forms through explicit, typed, and verifiable actions. It is designed to assist with form completion without allowing arbitrary code execution, unrestricted selectors, or unreviewed submission.

## Current status

**Milestone 0 is complete.** The current prototype supports a local React fixture form and a Chrome Manifest V3 extension demonstrating deterministic form assistance.

Milestone 0 includes:

- Strict Zod contracts for forms, actions, sessions, execution results, and extension messages.
- Deterministic discovery of supported visible form controls.
- Label and section resolution, radio-group handling, opaque field IDs, and scan-version tracking.
- Fail-closed validation for stale, hidden, disabled, sensitive, unsupported, and invalid targets.
- Native DOM execution with controlled-input support and post-action verification.
- Required-field-first prompting and optional-field handling.
- Review-before-submit and explicit two-step submission confirmation.
- A local React fixture application with native, controlled, conditional, hidden, disabled, and sensitive fields.
- Playwright acceptance coverage for the end-to-end flow.
- GitHub Actions checks for typecheck, lint, unit tests, build, and E2E.

Later milestones may add capabilities such as provider integrations, voice input, profiles, and production form support. Those are intentionally outside the current prototype scope.

## Repository layout

```text
apps/extension/          Chrome MV3 extension
packages/contracts/      Shared Zod schemas and TypeScript types
packages/fixture-forms/  Local React fixture forms
 tests/extension-e2e/     Playwright extension acceptance tests
.github/workflows/       CI configuration
```

## Prerequisites

- Node.js 22 or newer
- pnpm 10
- Chromium/Chrome for manual extension testing

The repository pins the package manager through `package.json`:

```json
"packageManager": "pnpm@10.0.0"
```

Install dependencies from the repository root:

```powershell
pnpm install
```

## Development

Start the local fixture application:

```powershell
pnpm --filter @akarna/fixture-forms dev
```

The fixture is available at:

- `http://localhost:4173/` — multi-section form
- `http://localhost:4173/flat.html` — single-page E2E fixture

Build the extension before loading it in Chrome:

```powershell
pnpm build
```

Load `apps/extension/dist` as an unpacked extension from `chrome://extensions` with Developer mode enabled.

## Verification

Run the complete local verification suite:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
```

The root `pnpm test` command runs unit and component tests while excluding the E2E package. The E2E command provisions/uses Playwright Chromium according to the local environment.

If Playwright Chromium has not been installed yet:

```powershell
pnpm --filter @akarna/e2e exec playwright install chromium
```

On Ubuntu/Linux CI, the workflow installs Chromium and its system dependencies, then runs the headed extension test under Xvfb.

## Safety boundaries

Akarna's current contracts and execution path deliberately restrict automation to typed, allow-listed actions such as filling, selecting, checking, clearing, focusing, reading, correcting, and submitting through an explicit gate.

The prototype does not accept:

- Arbitrary JavaScript or code execution.
- Arbitrary CSS/XPath selectors from provider output.
- Unsupported action types.
- Hidden, disabled, stale, or sensitive field mutations.
- Submission without review and explicit confirmation.

Sensitive fields are detected and surfaced as private-entry-only targets; the assistant does not fill them automatically.

## Updating this README

This README describes the implemented product, not the entire long-term vision. Whenever a milestone is completed, update the **Current status**, feature list, development instructions, verification commands, and scope notes to reflect the newly shipped behavior. Keep future or unimplemented capabilities clearly marked as planned rather than describing them as available.

## CI

GitHub Actions runs on pushes and pull requests and performs:

1. Dependency installation with the pinned pnpm version.
2. Typechecking.
3. Lint/type validation.
4. Unit and component tests.
5. Production builds.
6. Playwright Chromium installation with Linux dependencies.
7. The extension acceptance test under Xvfb.
