# Requirements

## Problem

Workflow scripts currently tend to embed configuration paths in command text. This makes environment switching error-prone and forces users to duplicate otherwise identical workflows.

## Scope

1. A workflow can reference up to 32 local configuration files.
2. One referenced file is the default launch config.
3. Manual workflow and single-step runs show a selector with the default preselected.
4. Scheduled runs and virtual-keyboard bindings use the default without interruption.
5. Steps can reference `${config.id}`, `${config.name}`, and `${config.path}`.
6. Application actions support one launch argument per line, including `${config.path}`.
7. Script substitutions are quoted for the selected shell. Application and capability values receive the raw path.
8. The selected file must exist when execution starts.

## Data Handling

DevLauncher stores the config ID, display name, and local path. It does not read, copy, upload, or embed the config file contents as part of workflow execution.

## Acceptance Criteria

- Adding the first file makes it the default.
- Removing the default promotes the first remaining file.
- The user can change the saved default with a radio control.
- The run selector is dismissible with Escape or the cancel button.
- The selected config is visible in copied run logs.
- Existing workflows without launch configs continue to run unchanged.

## Exclusions

- Managing or editing file contents.
- Synchronizing environment files between computers.
- Automatically inferring application-specific config flags.

