use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

// -----------------------------------------------
// ID Generator
// -----------------------------------------------

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn generate_id() -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let count = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:x}{:x}", ts, count)
}

// -----------------------------------------------
// Config Data Structures
// -----------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Action {
    App {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        target: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        args: Option<Vec<String>>,
    },
    Folder {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        target: String,
        #[serde(
            rename = "openWith",
            alias = "open_with",
            skip_serializing_if = "Option::is_none"
        )]
        open_with: Option<String>,
        #[serde(
            rename = "customOpener",
            alias = "custom_opener",
            skip_serializing_if = "Option::is_none"
        )]
        custom_opener: Option<String>,
        #[serde(
            rename = "customOpenerArgs",
            alias = "custom_opener_args",
            skip_serializing_if = "Option::is_none"
        )]
        custom_opener_args: Option<String>,
    },
    File {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        target: String,
    },
    Url {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        target: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        username: Option<String>,
        /// Password is stored in OS keychain, NOT here. This flag just marks that one exists.
        #[serde(
            rename = "hasPassword",
            alias = "has_password",
            skip_serializing_if = "Option::is_none"
        )]
        has_password: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        autofill: Option<bool>,
        #[serde(
            rename = "autoSubmit",
            alias = "auto_submit",
            skip_serializing_if = "Option::is_none"
        )]
        auto_submit: Option<bool>,
        #[serde(
            rename = "usernameSelector",
            alias = "username_selector",
            skip_serializing_if = "Option::is_none"
        )]
        username_selector: Option<String>,
        #[serde(
            rename = "passwordSelector",
            alias = "password_selector",
            skip_serializing_if = "Option::is_none"
        )]
        password_selector: Option<String>,
    },
    Ssh {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        host: String,
        user: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        port: Option<u16>,
        #[serde(skip_serializing_if = "Option::is_none")]
        identity: Option<String>,
        /// Password is stored in OS keychain, NOT here. This flag just marks that one exists.
        #[serde(skip_serializing_if = "Option::is_none")]
        has_password: Option<bool>,
        /// Preferred terminal for launching the SSH session.
        #[serde(skip_serializing_if = "Option::is_none")]
        terminal: Option<String>,
    },
    Script {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        shell: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        file: Option<String>,
    },
    System {
        name: String,
        command: String,
    },
    Builtin {
        name: String,
        feature: String,
    },
    Plugin {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        #[serde(rename = "pluginId", alias = "plugin_id")]
        plugin_id: String,
        #[serde(rename = "actionId", alias = "action_id")]
        action_id: String,
    },
    Workflow {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        #[serde(rename = "workflowId", alias = "workflow_id")]
        workflow_id: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum StepCondition {
    Always,
    PreviousSuccess,
    PreviousFailed,
    Platform { platform: String },
    PathExists { path: String },
    EnvEquals { name: String, value: String },
}

impl Default for StepCondition {
    fn default() -> Self {
        Self::Always
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum CompletionRule {
    ActionResolved,
    ProcessStarted {
        stabilization_ms: u64,
        timeout_ms: u64,
    },
    ProcessExit {
        success_codes: Vec<i32>,
        timeout_ms: u64,
    },
    PortReady {
        host: String,
        port: u16,
        interval_ms: u64,
        timeout_ms: u64,
    },
    Timer {
        duration_ms: u64,
    },
    Manual {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timeout_ms: Option<u64>,
    },
    WindowReady {
        title_contains: String,
        timeout_ms: u64,
    },
    UrlReady {
        url_pattern: String,
        timeout_ms: u64,
    },
    ConnectionReady {
        timeout_ms: u64,
    },
}

impl Default for CompletionRule {
    fn default() -> Self {
        Self::ActionResolved
    }
}

fn default_true() -> bool {
    true
}

fn default_failure_policy() -> String {
    "stop".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStep {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub action: Action,
    #[serde(default)]
    pub condition: StepCondition,
    #[serde(default)]
    pub completion: CompletionRule,
    #[serde(default)]
    pub delay_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_failure: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowSchedule {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_schedule_mode")]
    pub mode: String,
    #[serde(default = "default_schedule_interval_minutes")]
    pub interval_minutes: u64,
    #[serde(default = "default_schedule_daily_time")]
    pub daily_time: String,
}

fn default_schedule_mode() -> String {
    "interval".into()
}

fn default_schedule_interval_minutes() -> u64 {
    60
}

fn default_schedule_daily_time() -> String {
    "09:00".into()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDefinition {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_failure_policy")]
    pub failure_policy: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule: Option<WorkflowSchedule>,
    #[serde(default)]
    pub steps: Vec<WorkflowStep>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Page {
    pub name: String,
    pub keys: HashMap<String, Action>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ThemeConfig {
    #[serde(default = "default_bg_color")]
    pub bg_color: String,
    #[serde(default = "default_bg_opacity")]
    pub bg_opacity: f64,
    #[serde(default = "default_blur_radius")]
    pub blur_radius: f64,
    #[serde(default = "default_border_color")]
    pub border_color: String,
    #[serde(default = "default_key_bg_opacity")]
    pub key_bg_opacity: f64,
    #[serde(default = "default_show_key_labels")]
    pub show_key_labels: bool,
}

fn default_bg_color() -> String {
    "#10121f".to_string()
}
fn default_bg_opacity() -> f64 {
    0.82
}
fn default_blur_radius() -> f64 {
    32.0
}
fn default_border_color() -> String {
    "#ffffff1a".to_string()
}
fn default_key_bg_opacity() -> f64 {
    0.04
}
fn default_show_key_labels() -> bool {
    true
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            bg_color: default_bg_color(),
            bg_opacity: default_bg_opacity(),
            blur_radius: default_blur_radius(),
            border_color: default_border_color(),
            key_bg_opacity: default_key_bg_opacity(),
            show_key_labels: default_show_key_labels(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PetCodexConfig {
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PetMenuConfig {
    #[serde(default, rename = "customActions")]
    pub custom_actions: Vec<Option<Action>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PetConfig {
    #[serde(default)]
    pub codex: PetCodexConfig,
    #[serde(default)]
    pub menu: PetMenuConfig,
}

impl Default for PetCodexConfig {
    fn default() -> Self {
        Self { enabled: false }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KeyboardConfig {
    #[serde(default = "default_schema_version", rename = "schemaVersion")]
    pub schema_version: u32,
    #[serde(default)]
    pub revision: u64,
    pub pages: Vec<Page>,
    #[serde(default)]
    pub workflows: Vec<WorkflowDefinition>,
    #[serde(default)]
    pub theme: ThemeConfig,
    #[serde(default)]
    pub pet: PetConfig,
}

fn default_schema_version() -> u32 {
    1
}

// -----------------------------------------------
// Clipboard Entry (text + image, with ID)
// -----------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ClipboardEntry {
    Text {
        id: String,
        content: String,
    },
    Image {
        id: String,
        data: String, // base64 JPEG (volatile, for API)
        width: u32,
        height: u32,
    },
}

impl ClipboardEntry {
    pub fn id(&self) -> &str {
        match self {
            ClipboardEntry::Text { id, .. } => id,
            ClipboardEntry::Image { id, .. } => id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Action, KeyboardConfig};

    #[test]
    fn preserves_plugin_actions_in_yaml_config() {
        let yaml = r#"
pages:
  - name: 默认
    keys:
      Q:
        type: plugin
        name: Open Hello WebView
        pluginId: devlauncher.examples.hello
        actionId: open
"#;

        let config: KeyboardConfig = serde_yaml::from_str(yaml).expect("plugin config should load");
        let action = config.pages[0]
            .keys
            .get("Q")
            .expect("Q binding should exist");

        match action {
            Action::Plugin {
                name,
                plugin_id,
                action_id,
                ..
            } => {
                assert_eq!(name, "Open Hello WebView");
                assert_eq!(plugin_id, "devlauncher.examples.hello");
                assert_eq!(action_id, "open");
            }
            other => panic!("expected plugin action, got {other:?}"),
        }

        let saved = serde_yaml::to_string(&config).expect("plugin config should save");
        assert!(saved.contains("type: plugin"));
        assert!(saved.contains("pluginId: devlauncher.examples.hello"));
        assert!(saved.contains("actionId: open"));
    }
}
