use crate::platform::{current_platform, Platform};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};
use std::collections::HashMap;

const MAX_INPUT_BYTES: usize = 256 * 1024;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityFieldType {
    String,
    Number,
    Boolean,
    StringArray,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowCapabilityField {
    pub key: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub field_type: CapabilityFieldType,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub secret: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_value: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowCapabilityDescriptor {
    pub id: String,
    pub version: u32,
    pub title: String,
    pub description: String,
    pub category: String,
    pub execution_mode: String,
    pub platforms: Vec<String>,
    pub inputs: Vec<WorkflowCapabilityField>,
    pub outputs: Vec<WorkflowCapabilityField>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct CapabilityReferenceContext {
    pub run_id: String,
    pub workflow_id: String,
    pub workflow_name: String,
    pub step_outputs: HashMap<String, Map<String, Value>>,
}

#[derive(Debug, Clone)]
pub struct CapabilityExecutionResult {
    pub message: String,
    pub outputs: Map<String, Value>,
    pub artifacts: Vec<WorkflowCapabilityArtifact>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowCapabilityArtifact {
    pub id: String,
    pub name: String,
    pub artifact_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
}

fn field(
    key: &str,
    title: &str,
    description: &str,
    field_type: CapabilityFieldType,
    required: bool,
) -> WorkflowCapabilityField {
    WorkflowCapabilityField {
        key: key.into(),
        title: title.into(),
        description: description.into(),
        field_type,
        required,
        secret: false,
        default_value: None,
    }
}

pub fn descriptors() -> Vec<WorkflowCapabilityDescriptor> {
    let platforms = vec!["macos".into(), "windows".into(), "linux".into()];
    vec![
        WorkflowCapabilityDescriptor {
            id: "clipboard.read_text".into(),
            version: 1,
            title: "读取剪贴板文本".into(),
            description: "读取当前系统剪贴板中的纯文本。".into(),
            category: "data".into(),
            execution_mode: "sync".into(),
            platforms: platforms.clone(),
            inputs: vec![],
            outputs: vec![
                field(
                    "text",
                    "文本",
                    "剪贴板中的文本内容",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "length",
                    "字符数",
                    "文本字符数量",
                    CapabilityFieldType::Number,
                    true,
                ),
            ],
            permissions: vec!["clipboard.read".into()],
        },
        WorkflowCapabilityDescriptor {
            id: "clipboard.write_text".into(),
            version: 1,
            title: "写入剪贴板文本".into(),
            description: "把文本写入系统剪贴板。".into(),
            category: "data".into(),
            execution_mode: "sync".into(),
            platforms: platforms.clone(),
            inputs: vec![field(
                "text",
                "文本",
                "要写入剪贴板的文本，可引用前面步骤的输出",
                CapabilityFieldType::String,
                true,
            )],
            outputs: vec![
                field(
                    "text",
                    "文本",
                    "实际写入的文本",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "length",
                    "字符数",
                    "写入文本的字符数量",
                    CapabilityFieldType::Number,
                    true,
                ),
            ],
            permissions: vec!["clipboard.write".into()],
        },
        WorkflowCapabilityDescriptor {
            id: "text.replace".into(),
            version: 1,
            title: "替换文本".into(),
            description: "在文本中替换全部匹配内容。".into(),
            category: "data".into(),
            execution_mode: "sync".into(),
            platforms: platforms.clone(),
            inputs: vec![
                field(
                    "text",
                    "原始文本",
                    "待处理文本",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "find",
                    "查找",
                    "要查找的文本",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "replace",
                    "替换为",
                    "替换后的文本，可以为空",
                    CapabilityFieldType::String,
                    true,
                ),
            ],
            outputs: vec![
                field(
                    "text",
                    "处理结果",
                    "替换后的文本",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "replacements",
                    "替换次数",
                    "实际替换次数",
                    CapabilityFieldType::Number,
                    true,
                ),
            ],
            permissions: vec![],
        },
        WorkflowCapabilityDescriptor {
            id: "text.template".into(),
            version: 1,
            title: "文本模板".into(),
            description: "组合固定文字和前面步骤的输出。".into(),
            category: "data".into(),
            execution_mode: "sync".into(),
            platforms,
            inputs: vec![field(
                "template",
                "模板",
                "支持工作流变量和前面步骤输出引用",
                CapabilityFieldType::String,
                true,
            )],
            outputs: vec![field(
                "text",
                "文本",
                "解析后的模板文本",
                CapabilityFieldType::String,
                true,
            )],
            permissions: vec![],
        },
    ]
}

#[tauri::command]
pub fn list_workflow_capabilities() -> Vec<WorkflowCapabilityDescriptor> {
    descriptors()
        .into_iter()
        .filter(|descriptor| {
            descriptor
                .platforms
                .iter()
                .any(|item| item == platform_name())
        })
        .collect()
}

fn platform_name() -> &'static str {
    match current_platform() {
        Platform::Macos => "macos",
        Platform::Windows => "windows",
        Platform::Other => "linux",
    }
}

pub fn validate_action(capability_id: &str, inputs: &Map<String, Value>, errors: &mut Vec<String>) {
    let Some(descriptor) = descriptors()
        .into_iter()
        .find(|descriptor| descriptor.id == capability_id)
    else {
        errors.push(format!("capability not found: {capability_id}"));
        return;
    };
    if !descriptor
        .platforms
        .iter()
        .any(|platform| platform == platform_name())
    {
        errors.push(format!(
            "capability is not available on this platform: {capability_id}"
        ));
    }
    if serde_json::to_vec(inputs)
        .map(|bytes| bytes.len() > MAX_INPUT_BYTES)
        .unwrap_or(true)
    {
        errors.push(format!("capability inputs exceed {MAX_INPUT_BYTES} bytes"));
    }
    for key in inputs.keys() {
        if !descriptor.inputs.iter().any(|field| field.key == *key) {
            errors.push(format!("unknown capability input: {capability_id}.{key}"));
        }
    }
    for field in &descriptor.inputs {
        let value = inputs.get(&field.key);
        if field.required && value.is_none() {
            errors.push(format!(
                "required capability input is missing: {capability_id}.{}",
                field.key
            ));
            continue;
        }
        if let Some(value) = value {
            validate_field_value(capability_id, field, value, errors);
        }
    }
}

fn validate_field_value(
    capability_id: &str,
    field: &WorkflowCapabilityField,
    value: &Value,
    errors: &mut Vec<String>,
) {
    let valid = match field.field_type {
        CapabilityFieldType::String => value.is_string(),
        CapabilityFieldType::Number => value.is_number(),
        CapabilityFieldType::Boolean => value.is_boolean(),
        CapabilityFieldType::StringArray => value
            .as_array()
            .map(|items| items.iter().all(Value::is_string))
            .unwrap_or(false),
    };
    if !valid {
        errors.push(format!(
            "invalid capability input type: {capability_id}.{}",
            field.key
        ));
    }
}

fn lookup_reference(reference: &str, context: &CapabilityReferenceContext) -> Option<Value> {
    match reference {
        "workflow.id" => Some(Value::String(context.workflow_id.clone())),
        "workflow.name" => Some(Value::String(context.workflow_name.clone())),
        "run.id" => Some(Value::String(context.run_id.clone())),
        _ => {
            let value = reference.strip_prefix("steps.")?;
            let (step_id, field) = value.rsplit_once(".outputs.")?;
            context
                .step_outputs
                .get(step_id)
                .and_then(|outputs| outputs.get(field))
                .cloned()
        }
    }
}

fn stringify_reference(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Null => String::new(),
        _ => value.to_string(),
    }
}

fn resolve_string(value: &str, context: &CapabilityReferenceContext) -> Result<Value, String> {
    if value.starts_with("${") && value.ends_with('}') && value.matches("${").count() == 1 {
        let reference = &value[2..value.len() - 1];
        return lookup_reference(reference, context)
            .ok_or_else(|| format!("REFERENCE_NOT_FOUND: {reference}"));
    }

    let mut resolved = String::new();
    let mut remaining = value;
    while let Some(start) = remaining.find("${") {
        resolved.push_str(&remaining[..start]);
        let after_start = &remaining[start + 2..];
        let Some(end) = after_start.find('}') else {
            return Err("INVALID_CAPABILITY_INPUT: unclosed reference".into());
        };
        let reference = &after_start[..end];
        let reference_value = lookup_reference(reference, context)
            .ok_or_else(|| format!("REFERENCE_NOT_FOUND: {reference}"))?;
        resolved.push_str(&stringify_reference(&reference_value));
        remaining = &after_start[end + 1..];
    }
    resolved.push_str(remaining);
    Ok(Value::String(resolved))
}

pub fn resolve_inputs(
    inputs: &Map<String, Value>,
    context: &CapabilityReferenceContext,
) -> Result<Map<String, Value>, String> {
    inputs
        .iter()
        .map(|(key, value)| {
            let value = match value {
                Value::String(value) => resolve_string(value, context)?,
                _ => value.clone(),
            };
            Ok((key.clone(), value))
        })
        .collect()
}

fn required_string(inputs: &Map<String, Value>, key: &str) -> Result<String, String> {
    inputs
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("INVALID_CAPABILITY_INPUT: {key} must be a string"))
}

pub fn execute(
    capability_id: &str,
    inputs: &Map<String, Value>,
) -> Result<CapabilityExecutionResult, String> {
    let result = match capability_id {
        "clipboard.read_text" => {
            let text = arboard::Clipboard::new()
                .and_then(|mut clipboard| clipboard.get_text())
                .map_err(|error| format!("CAPABILITY_EXECUTION_FAILED: {error}"))?;
            let mut outputs = Map::new();
            outputs.insert(
                "length".into(),
                Value::Number(Number::from(text.chars().count() as u64)),
            );
            outputs.insert("text".into(), Value::String(text));
            CapabilityExecutionResult {
                message: "已读取剪贴板文本".into(),
                outputs,
                artifacts: vec![],
            }
        }
        "clipboard.write_text" => {
            let text = required_string(inputs, "text")?;
            arboard::Clipboard::new()
                .and_then(|mut clipboard| clipboard.set_text(text.clone()))
                .map_err(|error| format!("CAPABILITY_EXECUTION_FAILED: {error}"))?;
            let mut outputs = Map::new();
            outputs.insert(
                "length".into(),
                Value::Number(Number::from(text.chars().count() as u64)),
            );
            outputs.insert("text".into(), Value::String(text));
            CapabilityExecutionResult {
                message: "已写入剪贴板文本".into(),
                outputs,
                artifacts: vec![],
            }
        }
        "text.replace" => {
            let text = required_string(inputs, "text")?;
            let find = required_string(inputs, "find")?;
            let replacement = required_string(inputs, "replace")?;
            if find.is_empty() {
                return Err("INVALID_CAPABILITY_INPUT: find cannot be empty".into());
            }
            let replacements = text.matches(&find).count();
            let mut outputs = Map::new();
            outputs.insert(
                "text".into(),
                Value::String(text.replace(&find, &replacement)),
            );
            outputs.insert(
                "replacements".into(),
                Value::Number(Number::from(replacements as u64)),
            );
            CapabilityExecutionResult {
                message: format!("已完成 {replacements} 处替换"),
                outputs,
                artifacts: vec![],
            }
        }
        "text.template" => {
            let template = required_string(inputs, "template")?;
            let mut outputs = Map::new();
            outputs.insert("text".into(), Value::String(template));
            CapabilityExecutionResult {
                message: "已生成模板文本".into(),
                outputs,
                artifacts: vec![],
            }
        }
        _ => return Err(format!("CAPABILITY_NOT_FOUND: {capability_id}")),
    };
    if serde_json::to_vec(&result.outputs)
        .map(|bytes| bytes.len() > MAX_OUTPUT_BYTES)
        .unwrap_or(true)
    {
        return Err(format!("OUTPUT_LIMIT_EXCEEDED: {MAX_OUTPUT_BYTES} bytes"));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn descriptor_ids_are_unique() {
        let descriptors = descriptors();
        let ids = descriptors
            .iter()
            .map(|descriptor| descriptor.id.as_str())
            .collect::<std::collections::HashSet<_>>();
        assert_eq!(ids.len(), descriptors.len());
    }

    #[test]
    fn validates_required_and_unknown_inputs() {
        let mut errors = Vec::new();
        validate_action("text.replace", &Map::new(), &mut errors);
        assert!(errors.iter().any(|error| error.contains("text")));

        let mut inputs = Map::new();
        inputs.insert("unexpected".into(), Value::Bool(true));
        let mut errors = Vec::new();
        validate_action("text.template", &inputs, &mut errors);
        assert!(errors.iter().any(|error| error.contains("unknown")));
    }

    #[test]
    fn resolves_whole_and_embedded_references() {
        let mut outputs = Map::new();
        outputs.insert("count".into(), Value::Number(Number::from(3)));
        outputs.insert("text".into(), Value::String("完成".into()));
        let mut context = CapabilityReferenceContext {
            run_id: "run-1".into(),
            workflow_id: "workflow-1".into(),
            workflow_name: "测试".into(),
            ..Default::default()
        };
        context.step_outputs.insert("step-1".into(), outputs);

        assert_eq!(
            resolve_string("${steps.step-1.outputs.count}", &context).unwrap(),
            Value::Number(Number::from(3))
        );
        assert_eq!(
            resolve_string("结果：${steps.step-1.outputs.text}", &context).unwrap(),
            Value::String("结果：完成".into())
        );

        context.step_outputs.insert(
            "step.with.dot".into(),
            context.step_outputs["step-1"].clone(),
        );
        assert_eq!(
            resolve_string("${steps.step.with.dot.outputs.text}", &context).unwrap(),
            Value::String("完成".into())
        );
    }

    #[test]
    fn replaces_text_deterministically() {
        let mut inputs = Map::new();
        inputs.insert("text".into(), Value::String("a-b-a".into()));
        inputs.insert("find".into(), Value::String("a".into()));
        inputs.insert("replace".into(), Value::String("x".into()));
        let result = execute("text.replace", &inputs).unwrap();
        assert_eq!(result.outputs["text"], Value::String("x-b-x".into()));
        assert_eq!(
            result.outputs["replacements"],
            Value::Number(Number::from(2))
        );
    }
}
