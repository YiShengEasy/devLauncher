use crate::builtins::screenshot;
use crate::platform::{current_platform, Platform};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};
use std::collections::HashMap;
use std::fs;
use tauri::AppHandle;

const MAX_INPUT_BYTES: usize = 256 * 1024;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const MAX_IMAGE_BYTES: u64 = 50 * 1024 * 1024;

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
    pub config_id: Option<String>,
    pub config_name: Option<String>,
    pub config_path: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
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

fn field_with_default(
    key: &str,
    title: &str,
    description: &str,
    field_type: CapabilityFieldType,
    default_value: Value,
) -> WorkflowCapabilityField {
    WorkflowCapabilityField {
        key: key.into(),
        title: title.into(),
        description: description.into(),
        field_type,
        required: false,
        secret: false,
        default_value: Some(default_value),
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
        WorkflowCapabilityDescriptor {
            id: "screenshot.capture".into(),
            version: 1,
            title: "交互式截图".into(),
            description: "打开截图工具并等待确认，完成后返回本地 PNG 产物。".into(),
            category: "media".into(),
            execution_mode: "interactive".into(),
            platforms: vec!["macos".into(), "windows".into(), "linux".into()],
            inputs: vec![
                field_with_default(
                    "copyToClipboard",
                    "复制到剪贴板",
                    "确认截图时同时复制图片",
                    CapabilityFieldType::Boolean,
                    Value::Bool(true),
                ),
                field_with_default(
                    "timeoutSeconds",
                    "等待超时（秒）",
                    "等待用户确认截图的最长时间，范围 1-3600 秒",
                    CapabilityFieldType::Number,
                    Value::Number(Number::from(300)),
                ),
            ],
            outputs: vec![
                field(
                    "path",
                    "产物路径",
                    "确认时自动保存，或使用“保存”时选择的 PNG 路径",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "width",
                    "宽度",
                    "截图像素宽度",
                    CapabilityFieldType::Number,
                    true,
                ),
                field(
                    "height",
                    "高度",
                    "截图像素高度",
                    CapabilityFieldType::Number,
                    true,
                ),
                field(
                    "mediaType",
                    "媒体类型",
                    "固定为 image/png",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "copiedToClipboard",
                    "已复制",
                    "图片是否同时复制到剪贴板",
                    CapabilityFieldType::Boolean,
                    true,
                ),
            ],
            permissions: vec!["screen.capture".into(), "filesystem.app_data.write".into()],
        },
        WorkflowCapabilityDescriptor {
            id: "ocr.recognize".into(),
            version: 1,
            title: "识别图片文字".into(),
            description: "使用系统 OCR 识别本地图片，返回全文、行数和图片尺寸。".into(),
            category: "media".into(),
            execution_mode: "background".into(),
            platforms: vec!["macos".into(), "windows".into()],
            inputs: vec![field(
                "path",
                "图片路径",
                "本地 PNG 或 JPEG 路径，可引用截图步骤的 path 输出",
                CapabilityFieldType::String,
                true,
            )],
            outputs: vec![
                field(
                    "text",
                    "识别文本",
                    "OCR 识别出的完整文本",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "lineCount",
                    "文本行数",
                    "识别出的非空文本行数量",
                    CapabilityFieldType::Number,
                    true,
                ),
                field(
                    "width",
                    "图片宽度",
                    "源图片像素宽度",
                    CapabilityFieldType::Number,
                    true,
                ),
                field(
                    "height",
                    "图片高度",
                    "源图片像素高度",
                    CapabilityFieldType::Number,
                    true,
                ),
            ],
            permissions: vec!["filesystem.read".into(), "ocr.system".into()],
        },
        WorkflowCapabilityDescriptor {
            id: "translation.translate".into(),
            version: 1,
            title: "系统翻译".into(),
            description: "使用 macOS 系统翻译处理文本，需要相应语言包。".into(),
            category: "data".into(),
            execution_mode: "background".into(),
            platforms: vec!["macos".into()],
            inputs: vec![
                field(
                    "text",
                    "原文",
                    "要翻译的文本，可引用 OCR 或其他步骤的文本输出",
                    CapabilityFieldType::String,
                    true,
                ),
                field_with_default(
                    "targetLanguage",
                    "目标语言",
                    "BCP-47 语言标识，例如 zh-Hans 或 en-US",
                    CapabilityFieldType::String,
                    Value::String("zh-Hans".into()),
                ),
            ],
            outputs: vec![
                field(
                    "sourceLanguage",
                    "源语言",
                    "系统识别出的源语言",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "targetLanguage",
                    "目标语言",
                    "系统实际使用的目标语言",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "sourceText",
                    "原文",
                    "提交给系统翻译的文本",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "targetText",
                    "译文",
                    "系统翻译返回的文本",
                    CapabilityFieldType::String,
                    true,
                ),
                field(
                    "length",
                    "译文字数",
                    "译文字符数量",
                    CapabilityFieldType::Number,
                    true,
                ),
            ],
            permissions: vec!["translation.system".into()],
        },
    ]
}

pub fn is_interactive(capability_id: &str) -> bool {
    descriptors()
        .into_iter()
        .find(|descriptor| descriptor.id == capability_id)
        .map(|descriptor| descriptor.execution_mode == "interactive")
        .unwrap_or(false)
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
        "config.id" => context.config_id.clone().map(Value::String),
        "config.name" => context.config_name.clone().map(Value::String),
        "config.path" => context.config_path.clone().map(Value::String),
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

fn optional_bool(inputs: &Map<String, Value>, key: &str, default: bool) -> Result<bool, String> {
    inputs
        .get(key)
        .map(|value| {
            value
                .as_bool()
                .ok_or_else(|| format!("INVALID_CAPABILITY_INPUT: {key} must be a boolean"))
        })
        .transpose()
        .map(|value| value.unwrap_or(default))
}

fn optional_u64(inputs: &Map<String, Value>, key: &str, default: u64) -> Result<u64, String> {
    inputs
        .get(key)
        .map(|value| {
            value.as_u64().ok_or_else(|| {
                format!("INVALID_CAPABILITY_INPUT: {key} must be a positive integer")
            })
        })
        .transpose()
        .map(|value| value.unwrap_or(default))
}

fn ensure_output_limit(
    result: CapabilityExecutionResult,
) -> Result<CapabilityExecutionResult, String> {
    if serde_json::to_vec(&result.outputs)
        .map(|bytes| bytes.len() > MAX_OUTPUT_BYTES)
        .unwrap_or(true)
    {
        return Err(format!("OUTPUT_LIMIT_EXCEEDED: {MAX_OUTPUT_BYTES} bytes"));
    }
    Ok(result)
}

fn read_image_for_ocr(path: &str) -> Result<Vec<u8>, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("INVALID_CAPABILITY_INPUT: path cannot be empty".into());
    }
    let metadata = fs::metadata(path).map_err(|error| format!("OCR_IMAGE_READ_FAILED: {error}"))?;
    if !metadata.is_file() {
        return Err("OCR_IMAGE_READ_FAILED: path is not a file".into());
    }
    if metadata.len() == 0 || metadata.len() > MAX_IMAGE_BYTES {
        return Err(format!(
            "OCR_IMAGE_READ_FAILED: image size must be between 1 and {MAX_IMAGE_BYTES} bytes"
        ));
    }
    let bytes = fs::read(path).map_err(|error| format!("OCR_IMAGE_READ_FAILED: {error}"))?;
    image::load_from_memory(&bytes)
        .map(|image| image.dimensions())
        .map_err(|error| format!("OCR_IMAGE_INVALID: {error}"))?;
    Ok(bytes)
}

fn normalize_target_language(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 64
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err(
            "INVALID_CAPABILITY_INPUT: targetLanguage must be a BCP-47 language identifier".into(),
        );
    }
    Ok(value.to_string())
}

fn execute_sync(
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
        "screenshot.capture" | "ocr.recognize" | "translation.translate" => {
            return Err("CAPABILITY_EXECUTION_FAILED: async app context required".into())
        }
        _ => return Err(format!("CAPABILITY_NOT_FOUND: {capability_id}")),
    };
    ensure_output_limit(result)
}

pub async fn execute(
    app: &AppHandle,
    capability_id: &str,
    inputs: &Map<String, Value>,
    run_id: &str,
    step_id: &str,
) -> Result<CapabilityExecutionResult, String> {
    let result = match capability_id {
        "screenshot.capture" => {
            let copy_to_clipboard = optional_bool(inputs, "copyToClipboard", true)?;
            let timeout_seconds = optional_u64(inputs, "timeoutSeconds", 300)?;
            if !(1..=3_600).contains(&timeout_seconds) {
                return Err(
                    "INVALID_CAPABILITY_INPUT: timeoutSeconds must be between 1 and 3600".into(),
                );
            }
            let result = screenshot::capture_for_workflow(
                app,
                run_id,
                step_id,
                copy_to_clipboard,
                timeout_seconds,
            )
            .await?;
            let mut outputs = Map::new();
            outputs.insert("path".into(), Value::String(result.path.clone()));
            outputs.insert("width".into(), Value::Number(Number::from(result.width)));
            outputs.insert("height".into(), Value::Number(Number::from(result.height)));
            outputs.insert("mediaType".into(), Value::String("image/png".into()));
            outputs.insert(
                "copiedToClipboard".into(),
                Value::Bool(result.copied_to_clipboard),
            );
            CapabilityExecutionResult {
                message: "截图已确认并保存为工作流产物".into(),
                outputs,
                artifacts: vec![WorkflowCapabilityArtifact {
                    id: format!("{run_id}:{step_id}:screenshot"),
                    name: "截图.png".into(),
                    artifact_type: "file".into(),
                    media_type: Some("image/png".into()),
                    path: Some(result.path),
                }],
            }
        }
        "ocr.recognize" => {
            let path = required_string(inputs, "path")?;
            let bytes = read_image_for_ocr(&path)?;
            let layout = tokio::task::spawn_blocking(move || {
                crate::ocr::ocr_recognize_image_layout(BASE64.encode(bytes))
            })
            .await
            .map_err(|error| format!("OCR_EXECUTION_FAILED: {error}"))?
            .map_err(|error| format!("OCR_EXECUTION_FAILED: {error}"))?;
            if layout.text.trim().is_empty() {
                return Err("OCR_NO_TEXT: no text recognized".into());
            }
            let mut outputs = Map::new();
            outputs.insert("text".into(), Value::String(layout.text));
            outputs.insert(
                "lineCount".into(),
                Value::Number(Number::from(layout.lines.len() as u64)),
            );
            outputs.insert("width".into(), Value::Number(Number::from(layout.width)));
            outputs.insert("height".into(), Value::Number(Number::from(layout.height)));
            CapabilityExecutionResult {
                message: format!("OCR 已识别 {} 行文本", layout.lines.len()),
                outputs,
                artifacts: vec![],
            }
        }
        "translation.translate" => {
            let text = required_string(inputs, "text")?;
            if text.trim().is_empty() {
                return Err("INVALID_CAPABILITY_INPUT: text cannot be empty".into());
            }
            let target_language = normalize_target_language(
                &inputs
                    .get("targetLanguage")
                    .and_then(Value::as_str)
                    .unwrap_or("zh-Hans"),
            )?;
            let response = tokio::task::spawn_blocking(move || {
                crate::translation::translate_text(text, target_language)
            })
            .await
            .map_err(|error| format!("TRANSLATION_EXECUTION_FAILED: {error}"))?
            .map_err(|error| format!("TRANSLATION_EXECUTION_FAILED: {error}"))?;
            if response.target_text.trim().is_empty() {
                return Err("TRANSLATION_EMPTY_RESULT: system returned no translated text".into());
            }
            let mut outputs = Map::new();
            outputs.insert(
                "sourceLanguage".into(),
                Value::String(response.source_language),
            );
            outputs.insert(
                "targetLanguage".into(),
                Value::String(response.target_language),
            );
            outputs.insert("sourceText".into(), Value::String(response.source_text));
            outputs.insert(
                "length".into(),
                Value::Number(Number::from(response.target_text.chars().count() as u64)),
            );
            outputs.insert("targetText".into(), Value::String(response.target_text));
            CapabilityExecutionResult {
                message: "系统翻译已完成".into(),
                outputs,
                artifacts: vec![],
            }
        }
        _ => return execute_sync(capability_id, inputs),
    };
    ensure_output_limit(result)
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
    fn describes_interactive_screenshot_defaults() {
        let descriptor = descriptors()
            .into_iter()
            .find(|descriptor| descriptor.id == "screenshot.capture")
            .expect("screenshot descriptor");
        assert_eq!(descriptor.execution_mode, "interactive");
        assert_eq!(
            descriptor
                .inputs
                .iter()
                .find(|field| field.key == "copyToClipboard")
                .and_then(|field| field.default_value.as_ref()),
            Some(&Value::Bool(true))
        );
        assert_eq!(
            descriptor
                .inputs
                .iter()
                .find(|field| field.key == "timeoutSeconds")
                .and_then(|field| field.default_value.as_ref()),
            Some(&Value::Number(Number::from(300)))
        );
        assert!(is_interactive("screenshot.capture"));
        assert!(!is_interactive("text.replace"));
    }

    #[test]
    fn rejects_invalid_screenshot_input_types() {
        let mut inputs = Map::new();
        inputs.insert("timeoutSeconds".into(), Value::String("300".into()));
        let mut errors = Vec::new();
        validate_action("screenshot.capture", &inputs, &mut errors);
        assert!(errors.iter().any(|error| error.contains("timeoutSeconds")));
    }

    #[test]
    fn describes_ocr_and_translation_capabilities() {
        let descriptors = descriptors();
        let ocr = descriptors
            .iter()
            .find(|descriptor| descriptor.id == "ocr.recognize")
            .expect("ocr descriptor");
        assert!(ocr.platforms.iter().any(|platform| platform == "macos"));
        assert!(ocr.outputs.iter().any(|field| field.key == "text"));

        let translation = descriptors
            .iter()
            .find(|descriptor| descriptor.id == "translation.translate")
            .expect("translation descriptor");
        assert_eq!(translation.platforms, vec!["macos"]);
        assert_eq!(
            translation
                .inputs
                .iter()
                .find(|field| field.key == "targetLanguage")
                .and_then(|field| field.default_value.as_ref()),
            Some(&Value::String("zh-Hans".into()))
        );
    }

    #[test]
    fn validates_translation_language_identifiers() {
        assert_eq!(
            normalize_target_language(" en-US ").unwrap(),
            "en-US".to_string()
        );
        assert!(normalize_target_language("../zh-Hans").is_err());
        assert!(normalize_target_language("").is_err());
    }

    #[test]
    fn rejects_non_image_ocr_inputs() {
        let path = std::env::temp_dir().join(format!(
            "devlauncher-workflow-ocr-test-{}.txt",
            std::process::id()
        ));
        fs::write(&path, b"not an image").unwrap();
        let result = read_image_for_ocr(path.to_str().unwrap());
        let _ = fs::remove_file(path);
        assert!(result.unwrap_err().starts_with("OCR_IMAGE_INVALID:"));
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

        context.config_path = Some("/tmp/dev config.yaml".into());
        assert_eq!(
            resolve_string("${config.path}", &context).unwrap(),
            Value::String("/tmp/dev config.yaml".into())
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
        let result = execute_sync("text.replace", &inputs).unwrap();
        assert_eq!(result.outputs["text"], Value::String("x-b-x".into()));
        assert_eq!(
            result.outputs["replacements"],
            Value::Number(Number::from(2))
        );
    }
}
