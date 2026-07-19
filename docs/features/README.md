# DevLauncher Feature Documentation

This directory is the canonical home for product feature documentation.

## Directory Convention

Each feature uses one stable directory:

```text
docs/features/<feature-slug>/
|-- README.md
|-- 01-requirements.md
|-- 02-product-ux.md
|-- 03-domain-model.md
|-- 04-technical-design.md
|-- 05-integration-contract.md
|-- 06-security.md
|-- 07-implementation-plan.md
|-- 08-test-plan.md
`-- 09-decision-log.md
```

Not every feature needs every file, but filenames and numbering should remain
stable when a file exists.

## Document Roles

- `README.md`: status, owners, links, scope, and the source-of-truth index.
- `01-requirements.md`: user problems, use cases, acceptance criteria, and exclusions.
- `02-product-ux.md`: flows, screen behavior, copy, states, and accessibility.
- `03-domain-model.md`: persisted types, invariants, migrations, and examples.
- `04-technical-design.md`: runtime architecture and implementation boundaries.
- `05-integration-contract.md`: APIs, MCP tools, events, and external contracts.
- `06-security.md`: permissions, secrets, command execution, and threat controls.
- `07-implementation-plan.md`: ordered tasks with checkboxes and verification commands.
- `08-test-plan.md`: unit, integration, end-to-end, and manual validation coverage.
- `09-decision-log.md`: dated decisions and later revisions.

## Maintenance Rules

1. Update requirements before changing behavior.
2. Record architecture changes in the decision log.
3. Keep implementation checkboxes synchronized with repository evidence.
4. Never put passwords, tokens, private hostnames, or local user paths in examples.
5. Link prototypes and implementation files from the feature `README.md`.
