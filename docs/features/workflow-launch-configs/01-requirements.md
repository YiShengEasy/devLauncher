# Requirements

## Problem

Workflow scripts currently tend to embed configuration paths in command text. This makes environment switching error-prone and forces users to duplicate otherwise identical workflows.

## Scope

1. A workflow can reference up to 32 local configuration files.
2. The add flow starts from a configuration directory and recursively discovers supported files, regardless of their nested directory level within a bounded scan.
3. The in-app picker supports filename/path search and extension filtering, then adds one selected file.
4. One referenced file is the default launch config.
5. Workflow and single-step runs use the saved default without an additional prompt.
6. Scheduled runs and virtual-keyboard bindings use the same default without interruption.
7. Steps can reference `${config.id}`, `${config.name}`, and `${config.path}`.
8. Application actions support one launch argument per line, including `${config.path}`.
9. Script substitutions are quoted for the selected shell. Application and capability values receive the raw path.
10. The selected file must exist when execution starts.

## Data Handling

DevLauncher stores the config ID, display name, and local path. It does not read, copy, upload, or embed the config file contents as part of workflow execution.

## Acceptance Criteria

- Adding the first file makes it the default.
- Selecting a directory finds nested `.yaml`, `.yml`, `.json`, `.toml`, `.ini`, `.conf`, `.config`, `.properties`, `.env`, `.xml`, and `.plist` files.
- The discovery list displays relative paths so equal filenames in different directories remain distinguishable.
- Selecting an already-added file makes it the default instead of creating a duplicate.
- Removing the default promotes the first remaining file.
- The user can change the saved default with a radio control.
- The selected config is visible in copied run logs.
- Existing workflows without launch configs continue to run unchanged.

## Exclusions

- Managing or editing file contents.
- Synchronizing environment files between computers.
- Automatically inferring application-specific config flags.
