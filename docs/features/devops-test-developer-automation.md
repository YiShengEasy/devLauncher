# DevOps, Test, And Developer Automation Roadmap

Last updated: 2026-07-18

This roadmap turns popular open-source DevOps, testing, and developer-productivity patterns into DevLauncher-native capabilities.

## Reference Families

- API tools: Bruno, Hoppscotch, Newman.
- Test tools: Playwright, Cypress, k6.
- Security tools: Trivy.
- Workflow tools: n8n, Kestra, go-task.
- Ops tools: lazydocker, k9s, kubectl, Docker CLI.
- Monitoring tools: Prometheus, Grafana, Grafana Alloy.
- Developer utilities: DevToys, gum.

## Phase 1: API, Test, And Workflow Foundations

Deliver first:

- API Lab collection runner.
- Workflow templates for common project automation.
- Test/build/check workflow templates using script steps.
- Bindable virtual-key workflows.

Initial workflow templates:

- Start local project.
- Test and build.
- Release preflight.
- API smoke test.

## Phase 2: Ops And Security Shortcuts

Deliver after Phase 1 stabilizes:

- Docker quick actions: list containers, logs, restart, shell.
- Kubernetes quick actions: current context, pods, logs, port-forward command snippets.
- Trivy scan workflow template.
- Failure report export.

## Phase 3: Monitor Dashboard And Template Marketplace

Delivered first as lightweight local tooling:

- Local service monitor workflow template.
- Monitor Dashboard inside the workflow manager.
- Marketplace `workflowTemplatePackages` support.
- DevOps Core workflow template package in `marketplace/marketplace.json`.

Still planned:

- Port-ready monitor templates that do not rely only on `curl`.
- Status history retention for repeated monitor runs.
- Template package export/import files separate from the market index.

Avoid embedding full Prometheus/Grafana until there is a concrete need for metrics ingestion and retention.

## Implementation Rules

- Prefer workflow templates over custom engines.
- Prefer CLI wrapping before native integrations.
- Promote to builtin only when DevLauncher must own permissions, credentials, state, or long-running processes.
- Every new template or plugin must be documented in `docs/devlauncher-project-index.md`.
