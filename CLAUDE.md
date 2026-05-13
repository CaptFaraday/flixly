# Flixly — repo guidance for Claude

Custom Stremio replacement for an LG 86NANO75UPA on WebOS 6 (Chromium 79).
Preact 10 + TypeScript + Vite, target `chrome79`, IIFE bundle, `base: './'`.

## Testing discipline

The test suite has three layers; respect their roles.

1. **Unit / component / integration** — Vitest + happy-dom, 76 tests, run with `npm test`.
2. **Mutation grade** — Stryker over the modules listed in `stryker.config.json`, run with `npm run mutate`. Current overall score is in the low 50s; the goal is to raise it for any module you change.
3. **On-device smoke** — `npm run smoke` exercises the live TV at `10.0.0.238` over CDP at port 9998. Requires a current build deployed via `npm run build && npm run package && bash scripts/deploy.sh`.

**TDD Guard is active.** A `PreToolUse` hook in `.claude/settings.json` invokes `npx --no-install tdd-guard` before every `Write`/`Edit`/`MultiEdit`/`TodoWrite`. It reads the most recent Vitest run from `.claude/tdd-guard/data/test.json` and blocks edits that would skip past a failing-test step. If you hit a guard error, *do not bypass it* — diagnose and fix the underlying issue.

## Subagent roles

When dispatching subagents for new features, separate the roles:

- **Writer subagent** — designs and writes the failing test against the spec. Sees the spec, the existing module, and the tests directory.
- **Implementer subagent** — makes the test pass. *Must not* be given the test file. `.claudeignore` hides `src/**/__tests__/` and `src/**/*.test.*` from glob/search context, but the dispatch prompt is the primary control. Pass the implementer the spec, the module signature it must produce, and the failure output — never the test source.
- **Reviewer subagent** — verifies the implementation matches the spec, separately from whether the test passes. Sees the spec, the module, and the test.

The reason for the split is the documented Claude Code failure mode: when an agent can see both the test and the implementation, the path of least resistance is often to weaken the test. Hiding the test from the implementer makes that path unavailable.

## TV constraints (Chromium 79)

These bite. Search the docs link before assuming a feature exists.

- No `aspect-ratio` property — use `padding-bottom: 56.25%` for 16:9.
- No flex `gap` — use `margin` on children with a `:first-child` reset.
- No `inset: 0` shorthand — write out `top: 0; right: 0; bottom: 0; left: 0`.
- No `:focus-visible` — D-pad nav uses a custom spatial focus engine; `data-focused` is the canonical attribute.
- `file://` URLs reject `type="module"` — Vite plugin in `vite.config.ts` strips it and adds `defer`.
- Absolute `/` paths break under `file://` — `base: './'` keeps assets relative.

See `docs/` for the full design history (Plans 1–4 plus testing-strategy and claude-code-testing-research).

## Verification surfaces

`window.__flixly` exposes the running app's state for assertion:

```ts
{ route, focusedId, watchlistCount, resumeCount, hasRdKey }
```

Updated reactively via `effect()`. Read it from CDP via `node scripts/tv-nav.mjs --eval "window.__flixly"`. Add fields here when you add new state that integration tests will need to assert against — that is cheaper than writing a screenshot diff.

## What not to do

- Do not weaken or delete tests to make work proceed. TDD Guard will block this and it is the failure mode the testing pipeline is designed to prevent.
- Do not introduce module-format JavaScript on the TV (must be IIFE).
- Do not write absolute `/assets/...` paths (must be relative; `file://` resolves them to FS root).
- Do not commit `.env`, `dist/`, `ipk/`, `.stryker-tmp/`, or `.claude/tdd-guard/data/` — all gitignored.
- Do not use `Date.now()` or random for ordering in tests without a stub.
