use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifestAction {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub action_type: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub kind: String,
    pub description: Option<String>,
    pub entry: String,
    pub icon: Option<String>,
    pub actions: Vec<PluginManifestAction>,
}

fn is_safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|ch| {
            ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '.' || ch == '-'
        })
}

fn is_relative_safe_path(value: &str) -> bool {
    let path = std::path::Path::new(value);
    !value.trim().is_empty()
        && !path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
}

pub fn validate_manifest(manifest: &PluginManifest) -> Result<(), String> {
    if !is_safe_id(&manifest.id) {
        return Err("plugin id must use lowercase letters, digits, dots, or dashes".to_string());
    }
    if manifest.name.trim().is_empty() {
        return Err("plugin name is required".to_string());
    }
    if manifest.version.trim().is_empty() {
        return Err("plugin version is required".to_string());
    }
    if manifest.kind != "webview" {
        return Err("only webview plugins are supported".to_string());
    }
    if !is_relative_safe_path(&manifest.entry) || !manifest.entry.ends_with(".html") {
        return Err("plugin entry must be a relative html file".to_string());
    }
    if manifest.actions.is_empty() {
        return Err("plugin must declare at least one action".to_string());
    }

    for action in &manifest.actions {
        if !is_safe_id(&action.id) {
            return Err(
                "plugin action id must use lowercase letters, digits, dots, or dashes".to_string(),
            );
        }
        if action.title.trim().is_empty() {
            return Err("plugin action title is required".to_string());
        }
        if action.action_type != "webview" {
            return Err("only webview plugin actions are supported".to_string());
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_manifest() -> PluginManifest {
        PluginManifest {
            id: "devlauncher.tools.hello".to_string(),
            name: "Hello".to_string(),
            version: "1.0.0".to_string(),
            kind: "webview".to_string(),
            description: Some("Hello plugin".to_string()),
            entry: "dist/index.html".to_string(),
            icon: None,
            actions: vec![PluginManifestAction {
                id: "open".to_string(),
                title: "Open Hello".to_string(),
                action_type: "webview".to_string(),
            }],
        }
    }

    #[test]
    fn accepts_valid_webview_manifest() {
        assert!(validate_manifest(&valid_manifest()).is_ok());
    }

    #[test]
    fn rejects_path_traversal_entry() {
        let mut manifest = valid_manifest();
        manifest.entry = "../dist/index.html".to_string();
        assert_eq!(
            validate_manifest(&manifest),
            Err("plugin entry must be a relative html file".to_string())
        );
    }

    #[test]
    fn rejects_non_webview_kind() {
        let mut manifest = valid_manifest();
        manifest.kind = "script".to_string();
        assert_eq!(
            validate_manifest(&manifest),
            Err("only webview plugins are supported".to_string())
        );
    }
}
