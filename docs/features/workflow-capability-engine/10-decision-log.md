# Decision Log

## 2026-07-29: Additive Capability Layer

Decision: add a `capability` action variant instead of replacing `WorkflowStep`.

Reason: it preserves existing configuration, editor operations, schedules,
keyboard bindings, MCP mutation, and run history while adding structured data.

## 2026-07-29: Keep Linear Editor

Decision: retain ordered steps for the first capability release.

Reason: the missing foundation is execution semantics and data transfer, not a
canvas. A graph editor before typed results would add UI complexity without
making non-script operations reliable.

## 2026-07-29: Desktop Registry Is Authoritative

Decision: Rust owns descriptors, validation, permissions, and execution.

Reason: frontend and MCP data are user-controlled and cannot be an execution
allowlist.

## 2026-07-29: Deterministic First Pipeline

Decision: start with clipboard and text capabilities before screenshot/OCR.

Reason: this proves the complete data path with no fake completion or remote
dependency. Screenshot/OCR follows after an explicit interactive event contract.
