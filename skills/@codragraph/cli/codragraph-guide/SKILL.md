---
name: codragraph-guide
description: "Use when the user asks about CodraGraph itself — available tools, how to query the knowledge graph, MCP resources, graph schema, or workflow reference. Examples: \"What CodraGraph tools are available?\", \"How do I use CodraGraph?\""
---

# CodraGraph Guide

Quick reference for all CodraGraph MCP tools, resources, and the knowledge graph schema.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring:

1. **Read `codragraph://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx @codragraph/cli analyze` in the terminal first.

## Skills

| Task                                         | Skill to read       |
| -------------------------------------------- | ------------------- |
| Understand architecture / "How does X work?" | `codragraph-exploring`         |
| Blast radius / "What breaks if I change X?"  | `codragraph-impact-analysis`   |
| Trace bugs / "Why is X failing?"             | `codragraph-debugging`         |
| Rename / extract / split / refactor          | `codragraph-refactoring`       |
| Tools, resources, schema reference           | `codragraph-guide` (this file) |
| Index, status, clean, wiki CLI commands      | `codragraph-cli`               |

## Tools Reference

| Tool             | What it gives you                                                        |
| ---------------- | ------------------------------------------------------------------------ |
| `query`          | Process-grouped code intelligence — execution flows related to a concept |
| `context`        | 360-degree symbol view — categorized refs, processes it participates in  |
| `impact`         | Symbol blast radius — what breaks at depth 1/2/3 with confidence         |
| `detect_changes` | Git-diff impact — what do your current changes affect                    |
| `rename`         | Multi-file coordinated rename with confidence-tagged edits               |
| `feature_clusters` | Product/domain feature map for targeted context                       |
| `feature_context` | Members, line ranges, dependencies, and flows for one feature          |
| `cypher`         | Raw graph queries (read `codragraph://repo/{name}/schema` first)           |
| `list_repos`     | Discover indexed repos                                                   |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource                                       | Content                                   |
| ---------------------------------------------- | ----------------------------------------- |
| `codragraph://repo/{name}/context`               | Stats, staleness check                    |
| `codragraph://repo/{name}/clusters`              | All functional areas with cohesion scores |
| `codragraph://repo/{name}/feature-clusters`      | Product/domain feature areas              |
| `codragraph://repo/{name}/feature/{featureName}` | Focused files, line ranges, flows, deps   |
| `codragraph://repo/{name}/cluster/{clusterName}` | Area members                              |
| `codragraph://repo/{name}/processes`             | All execution flows                       |
| `codragraph://repo/{name}/process/{processName}` | Step-by-step trace                        |
| `codragraph://repo/{name}/schema`                | Graph schema for Cypher                   |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process, FeatureCluster
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS, FEATURE_MEMBER_OF, FEATURE_DEPENDS_ON

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```
