# Capability Contract

## Descriptor

```ts
interface WorkflowCapabilityDescriptor {
  id: string;
  version: number;
  title: string;
  description: string;
  category: "data" | "system" | "productivity" | "media" | "network";
  executionMode: "sync" | "background" | "interactive";
  platforms: Array<"macos" | "windows" | "linux">;
  inputs: CapabilityField[];
  outputs: CapabilityField[];
  permissions: string[];
}
```

Field types in the first slice are `string`, `number`, `boolean`, and
`string_array`. Complex JSON is represented as a validated JSON string until a
later schema revision.

## Step Shape

```ts
interface WorkflowCapabilityAction {
  type: "capability";
  name: string;
  capabilityId: string;
  inputs: Record<string, unknown>;
}
```

Capability actions join the existing `Action` union. This avoids introducing a
second step container and preserves configuration, key binding, duplication,
and MCP mutation paths.

## Runtime Result

```ts
interface CapabilityResult {
  status: "succeeded" | "waiting" | "failed";
  code?: string;
  message?: string;
  outputs: Record<string, unknown>;
  artifacts: CapabilityArtifact[];
}
```

The first implementation accepts only terminal `succeeded` or `failed`
results. `waiting` is reserved in the schema for interactive adapters.

## Registry Rules

- Descriptors are registered by stable ID.
- Duplicate IDs fail startup validation.
- A workflow stores the capability ID and inputs, not a descriptor copy.
- Missing capabilities fail workflow validation.
- Built-in descriptors live in Rust and are returned through one Tauri command.
- Frontend descriptors are display data, never independent authorization.

## Compatibility Adapter

Existing actions keep their current execution path. `action_resolved` is
presented as `已触发`, and capability steps default to real capability
completion. No automatic rewrite of existing YAML is required.
