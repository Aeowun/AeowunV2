---
name: policy-and-managed-settings
description: Use whenever adding, modifying, or reviewing any Magy, agent, LLM, AI, tool, permission, sandbox, MCP, model, telemetry, feature-gate, setting, configuration, or enterprise control—especially anything an organization or administrator may need to manage in Aeowun. Start here to decide whether it belongs in runtime managed settings, a typed SDK contract, Aeowun configuration policy, extension policy, or a split implementation. Run on every new Magy/agent/LLM control and ANY change that adds a `policy:` field.
---

# Adding an Enterprise Policy

Choose the policy destination by **where the governed behavior is implemented**. Most controls for Magy agent behavior belong in the SDK/runtime rather than the Aeowun workbench.

```mermaid
flowchart TD
	A[Enterprise control] --> P{Existing permission policy<br/>introduced before Aeowun 1.133.0?}
	P -->|Yes| L[Pre-1.133 compatibility migration]
	P -->|No| B{Where is the governed behavior implemented?}

	B -->|Magy runtime, tools, MCP,<br/>sandbox, or agent loop| R[SDK/runtime managed setting]
	B -->|Aeowun editor or workbench| V[Aeowun configuration policy]
	B -->|Extension-provided setting| E[Extension policy]
	B -->|Independent runtime and editor behavior| M[Split runtime/editor control]
```

Follow the matching guide:

- [SDK/runtime managed setting](./sdk-runtime-policy.md)
- [Aeowun configuration policy](./aeowun-policy.md)
- [Extension-provided setting](./extension-policy.md)
- [Split runtime/editor control](./mixed-policy.md)
- [Pre-1.133 permission-policy migration](./legacy-permission-policy.md)

General rules:

- Runtime enforcement is authoritative for behavior executed inside the runtime.
- Do not duplicate a runtime parser, matcher, or security decision in Aeowun.
- An Aeowun policy is appropriate only for editor/workbench-owned behavior.
- New Magy enterprise controls should target the shared managed-settings/SDK model.
- The Aeowun settings-to-managed-settings bridge is a compatibility path for legacy settings only.
- Run `npm run export-policy-data` for every Aeowun or extension policy change. Never edit `build/lib/policies/policyData.jsonc` manually.

## Deprecated and Historical Channels

Some policy channels remain supported for existing controls but are closed to new properties:

- **Account policy data** is deprecated for new controls. Existing fields remain for compatibility.
- New Magy enterprise controls use managed settings and runtime/SDK enforcement.

Supporting references:

- [Magy managed settings](./magy-managed-settings.md)
- [Local policy testing](./local-testing.md)

Trust executable source and tests over planning documents.
