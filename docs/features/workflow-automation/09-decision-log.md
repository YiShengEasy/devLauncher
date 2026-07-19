# Decision Log

## 2026-07-18: Unified Feature Documentation

Decision: Store future feature documentation under
`docs/features/<feature-slug>/` with numbered document roles.

Reason: Requirements, design, implementation, and verification previously lived
in separate date-based directories and were difficult to navigate as one unit.

## 2026-07-18: Reuse Existing Action Model

Decision: Workflow steps embed the existing `Action` union.

Reason: This preserves plugin, keychain, icon, and platform behavior and avoids
a second launch configuration language.

## 2026-07-18: Separate Launch from Completion

Decision: Every step has an explicit completion rule.

Reason: A successful spawn or open call does not prove that an application,
page, service, SSH connection, or script has finished.

## 2026-07-18: Linear Workflow MVP

Decision: Use ordered steps with conditions and failure policies, not a visual
arbitrary graph.

Reason: It covers the main routines while keeping execution, cancellation, UI,
and MCP generation deterministic.

## 2026-07-18: MCP Preview and Apply Are Separate

Decision: Model-generated changes require a non-mutating preview before apply.
Running is a third, separate operation.

Reason: Scripts and remote actions are high impact. Configuration mutation must
not implicitly execute.

## 2026-07-18: Keep MCP Local

Decision: The MVP uses local stdio and does not expose a network listener.

Reason: Codex and DevLauncher run on the same machine, and remote authorization
would add risk without improving the core workflow.
