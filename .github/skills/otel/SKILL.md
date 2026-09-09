---
name: otel
description: OpenTelemetry instrumentation for the Magy Chat extension — covers the execution paths, the IOTelService abstraction, span/metric/event conventions, and the relationship between code and the user/developer monitoring docs. Use when adding/changing OTel spans, metrics, or events; instrumenting a new agent surface; or updating monitoring docs.
---

# OpenTelemetry Instrumentation Skill

When adding, changing, or reviewing OTel telemetry in the Magy Chat extension, **always read the two source-of-truth docs first** and **always keep them in sync with the code you change**.

## 1. Authoritative Documents

The `extensions/copilot/docs/monitoring/` directory contains the two specs that define the OTel contract for the extension.

| Document | Path | Audience | Covers |
|---|---|---|---|
| User-facing | `extensions/copilot/docs/monitoring/agent_monitoring.md` | Extension users | Quick start, settings, env vars, exported spans/metrics/events, backend setup guides |
| Architecture | `extensions/copilot/docs/monitoring/agent_monitoring_arch.md` | Developers | Multi-agent strategies, span hierarchies, file structure, instrumentation points, `IOTelService`, configuration channels |
| Visual flow | `extensions/copilot/docs/monitoring/otel-data-flow.html` | Developers | Renders the bridge data flow |

If the implementation changes, **you must update the relevant doc in the same PR**.

## 2. Architecture at a Glance

The extension has multiple agent execution paths, each with a different OTel strategy:

| Agent | Process Model | Strategy | Debug Panel Source |
|---|---|---|---|
| **Foreground** (`toolCallingLoop`) | Extension host | Direct `IOTelService` spans | Extension spans |
| **Magy Relay in-process** | Extension host (same process) | **Bridge SpanProcessor** — SDK creates spans natively; bridge forwards to debug panel | SDK native spans via bridge |
| **Magy Relay terminal** | Separate terminal process | Forward OTel env vars | N/A (separate process) |

## 3. Where Things Live (canonical map)

```
extensions/copilot/src/platform/otel/
├── common/
│   ├── otelService.ts          # IOTelService interface + ISpanHandle + injectCompletedSpan
│   ├── otelConfig.ts           # Config resolution (env → settings → defaults), enabledVia, dbSpanExporter
│   ├── noopOtelService.ts      # Zero-cost no-op (used by chatLib / tests)
│   ├── inMemoryOTelService.ts  # ← actually under node/, see below
│   ├── agentOTelEnv.ts         # deriveMagyOTelEnv
│   ├── genAiAttributes.ts      # ⚠ Single source of truth for attribute keys & enums
│   ├── genAiEvents.ts          # Event emitter helpers (emit*Event)
│   ├── genAiMetrics.ts         # GenAiMetrics class
│   ├── messageFormatters.ts    # truncateForOTel, normalizeProviderMessages, toSystemInstructions, …
│   ├── workspaceOTelMetadata.ts
│   ├── sessionUtils.ts
│   └── index.ts                # ⚠ Public barrel — re-export new helpers/constants here
└── node/
    ├── otelServiceImpl.ts      # NodeOTelService + DiagnosticSpanExporter + FilteredSpanExporter + EXPORTABLE_OPERATION_NAMES
    ├── inMemoryOTelService.ts  # InMemoryOTelService (used when OTel is disabled — feeds debug panel only)
    ├── fileExporters.ts        # File-based span/log/metric exporters
    └── sqlite/                 # OTelSqliteStore + SqliteSpanExporter (dbSpanExporter pipeline)
```

## 4. Service Layer & Selection

`IOTelService` ([otelService.ts](../../../extensions/copilot/src/platform/otel/common/otelService.ts)) is the only abstraction consumers should depend on. Three implementations:

| Class | When Used |
|---|---|
| `NoopOTelService` | Tests where no telemetry pipeline is needed |
| `NodeOTelService` | OTel enabled — full SDK |
| `InMemoryOTelService` | Registered when OTel is **disabled** |

## 5. Span / Metric / Event Conventions

Follow the OTel GenAI semantic conventions. **Always use the constants from `genAiAttributes.ts` — never raw string literals.**

| Operation | Span Name | Kind | Constant |
|---|---|---|---|
| Agent orchestration | `invoke_agent {agent_name}` | `INTERNAL` | `GenAiOperationName.INVOKE_AGENT` |
| LLM API call | `chat {model}` | `CLIENT` | `GenAiOperationName.CHAT` |
| Tool execution | `execute_tool {tool_name}` | `INTERNAL` | `GenAiOperationName.EXECUTE_TOOL` |
| Hook execution | `execute_hook {hook_type}` | `INTERNAL` | `GenAiOperationName.EXECUTE_HOOK` |

## 6. Configuration Surface (must stay in sync)

When you add or change a setting/env var/command, update **all three** of:

1. The setting/command registration in `extensions/copilot/package.json`.
2. `resolveOTelConfig` in `otelConfig.ts`.
3. `agent_monitoring.md` and `agent_monitoring_arch.md`.

## 7. Procedure Checklists

### When adding a new span / attribute

1. Add the attribute key as a constant to `genAiAttributes.ts`.
2. Add it to the public barrel in `index.ts`.
3. Use `IOTelService.startActiveSpan`.
4. Pass the value through `truncateForOTel`.
5. If the new operation should reach OTLP, add its op-name to `EXPORTABLE_OPERATION_NAMES`.
6. Document the new attribute in `agent_monitoring.md`.

## 8. Validation

Before sending a PR that touches OTel code:

```bash
# From extensions/copilot/
npx tsc --noEmit --project tsconfig.json

# OTel + Bridge unit tests
npm test -- --grep "OTel\|Bridge"
```

## 9. Anti-Patterns to Reject

- ❌ Importing `@opentelemetry/api` from anywhere other than `node/otelServiceImpl.ts`.
- ❌ Hard-coded attribute keys.
- ❌ Hard-coded provider strings.
- ❌ Magic `SpanStatusCode` numbers.
- ❌ Emitting any free-form content attribute without passing it through `truncateForOTel`.
- ❌ Updating instrumentation without updating documentation in the same change.
