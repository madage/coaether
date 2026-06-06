<!-- codragraph:start -->
# CodraGraph — Code Intelligence

This project is indexed by CodraGraph as **superco** (1806 symbols, 4979 relationships, 124 execution flows). Use the CodraGraph MCP tools to understand code, assess impact, and navigate safely.

> If any CodraGraph tool warns the index is stale, run `npx @codragraph/cli analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `codragraph_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `codragraph_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `codragraph_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `codragraph_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `codragraph_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `codragraph_rename` which understands the call graph.
- NEVER commit changes without running `codragraph_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `codragraph://repo/superco/context` | Codebase overview, check index freshness |
| `codragraph://repo/superco/clusters` | All functional areas |
| `codragraph://repo/superco/feature-clusters` | Product/domain feature areas |
| `codragraph://repo/superco/feature/{name}` | Focused files, line ranges, flows, dependencies |
| `codragraph://repo/superco/processes` | All execution flows |
| `codragraph://repo/superco/process/{name}` | Step-by-step execution trace |
| `.codragraph/structure/README.md` | Local what/why/how/when/where memory, branch state, and SQLite seed |

## CLI

Commands are cross-platform: `codragraph ...`, `npx @codragraph/cli ...`, or `bunx @codragraph/cli ...`. Scripts: `npm --prefix ...` or `bun run --filter ...`.

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/codragraph/codragraph-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/codragraph/codragraph-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/codragraph/codragraph-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/codragraph/codragraph-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/codragraph/codragraph-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/codragraph/codragraph-cli/SKILL.md` |

<!-- codragraph:end -->
