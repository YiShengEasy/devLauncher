use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const MAX_CONFIG_FILES: usize = 512;
const MAX_CONFIG_BYTES: u64 = 1024 * 1024;
const MAX_SCAN_DEPTH: usize = 6;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfigFile {
    pub path: String,
    pub name: String,
    pub format: String,
    pub environment: String,
    pub environment_label: String,
    pub environment_source: String,
    pub sensitive_count: usize,
    pub size: u64,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfigDiscovery {
    pub root: String,
    pub project_name: String,
    pub scanned_files: usize,
    pub files: Vec<ProjectConfigFile>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfigContent {
    pub path: String,
    pub format: String,
    pub environment: String,
    pub environment_label: String,
    pub content: String,
    pub masked_content: String,
    pub content_hash: String,
    pub sensitive_count: usize,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfigSaveResult {
    pub content_hash: String,
    pub sensitive_count: usize,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfigValidation {
    pub masked_content: String,
    pub sensitive_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EnvironmentMatch {
    id: String,
    label: String,
    source: String,
}

#[tauri::command]
pub async fn discover_project_configs(root: String) -> Result<ProjectConfigDiscovery, String> {
    tauri::async_runtime::spawn_blocking(move || discover_project_configs_blocking(&root))
        .await
        .map_err(|error| format!("配置扫描线程失败：{error}"))?
}

#[tauri::command]
pub async fn read_project_config(
    root: String,
    file: String,
) -> Result<ProjectConfigContent, String> {
    tauri::async_runtime::spawn_blocking(move || read_project_config_blocking(&root, &file))
        .await
        .map_err(|error| format!("配置读取线程失败：{error}"))?
}

#[tauri::command]
pub async fn validate_project_config(
    root: String,
    file: String,
    content: String,
) -> Result<ProjectConfigValidation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if content.len() as u64 > MAX_CONFIG_BYTES {
            return Err("配置内容不能超过 1 MB".into());
        }
        let root_path = canonical_directory(&root)?;
        let path = canonical_project_file(&root_path, &file)?;
        let format = config_format(&path).ok_or_else(|| "不支持该配置文件格式".to_string())?;
        validate_config(format, &content)?;
        let (masked_content, sensitive_count) = mask_sensitive_content(&content);
        Ok(ProjectConfigValidation {
            masked_content,
            sensitive_count,
        })
    })
    .await
    .map_err(|error| format!("配置校验线程失败：{error}"))?
}

#[tauri::command]
pub async fn save_project_config(
    root: String,
    file: String,
    content: String,
    expected_hash: String,
) -> Result<ProjectConfigSaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_project_config_blocking(&root, &file, &content, &expected_hash)
    })
    .await
    .map_err(|error| format!("配置保存线程失败：{error}"))?
}

fn discover_project_configs_blocking(root: &str) -> Result<ProjectConfigDiscovery, String> {
    let root_path = canonical_directory(root)?;
    let mut candidates = Vec::new();
    collect_config_files(&root_path, &root_path, &mut candidates, 0)?;
    candidates.sort();

    let mut files = Vec::new();
    let mut warnings = Vec::new();
    for path in candidates {
        let metadata = match fs::metadata(&path) {
            Ok(value) => value,
            Err(error) => {
                warnings.push(format!(
                    "无法读取文件信息 {}：{error}",
                    relative_path(&root_path, &path)
                ));
                continue;
            }
        };
        if metadata.len() > MAX_CONFIG_BYTES {
            warnings.push(format!(
                "已跳过超过 1 MB 的配置：{}",
                relative_path(&root_path, &path)
            ));
            continue;
        }
        let content = match fs::read_to_string(&path) {
            Ok(value) => value,
            Err(error) => {
                warnings.push(format!(
                    "已跳过非 UTF-8 配置 {}：{error}",
                    relative_path(&root_path, &path)
                ));
                continue;
            }
        };
        let Some(format) = config_format(&path) else {
            continue;
        };
        let environment = infer_environment(&root_path, &path);
        let relative = relative_path(&root_path, &path);
        files.push(ProjectConfigFile {
            path: relative,
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("配置")
                .to_string(),
            format: format.to_string(),
            environment: environment.id,
            environment_label: environment.label,
            environment_source: environment.source,
            sensitive_count: mask_sensitive_content(&content).1,
            size: metadata.len(),
            modified_at: modified_millis(&metadata),
        });
    }
    files.sort_by(|left, right| {
        environment_rank(&left.environment)
            .cmp(&environment_rank(&right.environment))
            .then_with(|| left.environment.cmp(&right.environment))
            .then_with(|| left.path.cmp(&right.path))
    });

    let project_name = root_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("项目")
        .to_string();
    if files.is_empty() {
        warnings.push("没有发现第一阶段支持的项目配置文件。".into());
    }

    Ok(ProjectConfigDiscovery {
        root: root_path.to_string_lossy().into_owned(),
        project_name,
        scanned_files: files.len(),
        files,
        warnings,
    })
}

fn read_project_config_blocking(root: &str, file: &str) -> Result<ProjectConfigContent, String> {
    let root_path = canonical_directory(root)?;
    let path = canonical_project_file(&root_path, file)?;
    let metadata = fs::metadata(&path).map_err(|error| format!("无法读取配置文件信息：{error}"))?;
    if metadata.len() > MAX_CONFIG_BYTES {
        return Err("配置文件不能超过 1 MB".into());
    }
    let format = config_format(&path).ok_or_else(|| "不支持该配置文件格式".to_string())?;
    let content =
        fs::read_to_string(&path).map_err(|error| format!("配置文件不是有效 UTF-8：{error}"))?;
    let environment = infer_environment(&root_path, &path);
    let (masked_content, sensitive_count) = mask_sensitive_content(&content);
    Ok(ProjectConfigContent {
        path: relative_path(&root_path, &path),
        format: format.into(),
        environment: environment.id,
        environment_label: environment.label,
        content_hash: content_hash(&content),
        content,
        masked_content,
        sensitive_count,
        modified_at: modified_millis(&metadata),
    })
}

fn save_project_config_blocking(
    root: &str,
    file: &str,
    content: &str,
    expected_hash: &str,
) -> Result<ProjectConfigSaveResult, String> {
    if content.len() as u64 > MAX_CONFIG_BYTES {
        return Err("配置内容不能超过 1 MB".into());
    }
    let root_path = canonical_directory(root)?;
    let path = canonical_project_file(&root_path, file)?;
    let format = config_format(&path).ok_or_else(|| "不支持该配置文件格式".to_string())?;
    let current =
        fs::read_to_string(&path).map_err(|error| format!("无法读取当前配置：{error}"))?;
    if content_hash(&current) != expected_hash {
        return Err("配置文件已被其他程序修改，请重新加载后再保存".into());
    }
    validate_config(format, content)?;

    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "配置文件没有父目录".to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temp.as_file()
        .set_permissions(metadata.permissions())
        .map_err(|error| error.to_string())?;
    temp.write_all(content.as_bytes())
        .map_err(|error| error.to_string())?;
    temp.as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    fs::remove_file(&path).map_err(|error| error.to_string())?;

    temp.persist(&path)
        .map_err(|error| error.error.to_string())?;
    let saved_metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    Ok(ProjectConfigSaveResult {
        content_hash: content_hash(content),
        sensitive_count: mask_sensitive_content(content).1,
        modified_at: modified_millis(&saved_metadata),
    })
}

fn canonical_directory(root: &str) -> Result<PathBuf, String> {
    if root.trim().is_empty() {
        return Err("项目目录不能为空".into());
    }
    let path = PathBuf::from(root)
        .canonicalize()
        .map_err(|error| format!("项目目录不存在：{error}"))?;
    if !path.is_dir() {
        return Err("项目路径不是目录".into());
    }
    Ok(path)
}

fn canonical_project_file(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.trim().is_empty() || Path::new(relative).is_absolute() {
        return Err("配置文件路径无效".into());
    }
    let path = root
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("配置文件不存在：{error}"))?;
    if !path.is_file() || !path.starts_with(root) {
        return Err("配置文件必须位于项目目录内".into());
    }
    Ok(path)
}

fn collect_config_files(
    root: &Path,
    directory: &Path,
    files: &mut Vec<PathBuf>,
    depth: usize,
) -> Result<(), String> {
    if depth > MAX_SCAN_DEPTH || files.len() >= MAX_CONFIG_FILES {
        return Ok(());
    }
    let entries = fs::read_dir(directory).map_err(|error| format!("无法扫描项目目录：{error}"))?;
    for entry in entries {
        if files.len() >= MAX_CONFIG_FILES {
            break;
        }
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if path.is_dir() {
            if is_ignored_directory(&name) {
                continue;
            }
            collect_config_files(root, &path, files, depth + 1)?;
        } else if is_config_candidate(root, &path) {
            files.push(path);
        }
    }
    Ok(())
}

fn is_ignored_directory(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".venv"
            | "venv"
            | "vendor"
            | "coverage"
            | ".next"
            | ".nuxt"
            | ".cache"
    )
}

fn is_config_candidate(root: &Path, path: &Path) -> bool {
    let Some(format) = config_format(path) else {
        return false;
    };
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if format == "dotenv" {
        return true;
    }
    if matches!(
        name.as_str(),
        "package.json"
            | "pyproject.toml"
            | "cargo.toml"
            | "firebase.json"
            | "vercel.json"
            | "netlify.toml"
            | ".gitlab-ci.yml"
            | ".gitlab-ci.yaml"
    ) {
        return true;
    }
    let stem = strip_known_extension(&name);
    let recognized_prefixes = [
        "config",
        "configuration",
        "settings",
        "application",
        "appsettings",
        "compose",
        "docker-compose",
        "values",
        "parameters",
        "serverless",
    ];
    if recognized_prefixes.iter().any(|prefix| {
        stem == *prefix
            || stem.starts_with(&format!("{prefix}."))
            || stem.starts_with(&format!("{prefix}-"))
            || stem.starts_with(&format!("{prefix}_"))
    }) {
        return true;
    }

    let parent = path
        .parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let grandparent = path
        .parent()
        .and_then(Path::parent)
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    is_config_directory(&parent)
        || is_config_directory(&grandparent)
        || filename_environment(&name).is_some()
        || parent_environment(root, path).is_some()
}

fn is_config_directory(name: &str) -> bool {
    matches!(
        name,
        "config"
            | "configs"
            | ".config"
            | "configuration"
            | "settings"
            | "etc"
            | "env"
            | "environments"
            | "deploy"
            | "deployment"
            | "k8s"
            | "kubernetes"
            | "helm"
            | "inventory"
            | "inventories"
    )
}

fn config_format(path: &Path) -> Option<&'static str> {
    let name = path.file_name()?.to_str()?.to_ascii_lowercase();
    if name == ".env" || name.starts_with(".env.") || name.starts_with(".env-") {
        return Some("dotenv");
    }
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "yaml" | "yml" => Some("yaml"),
        "json" => Some("json"),
        "jsonc" => Some("jsonc"),
        "toml" => Some("toml"),
        "ini" => Some("ini"),
        "properties" => Some("properties"),
        _ => None,
    }
}

fn infer_environment(root: &Path, path: &Path) -> EnvironmentMatch {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if let Some(id) = filename_environment(&name) {
        return environment_match(&id, "filename");
    }
    if let Some(id) = parent_environment(root, path) {
        return environment_match(&id, "parent");
    }
    environment_match("common", "common")
}

fn filename_environment(name: &str) -> Option<String> {
    let stem = strip_known_extension(name);
    let tokens = stem
        .split(|character: char| matches!(character, '.' | '-' | '_'))
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>();
    let recognized = tokens
        .iter()
        .filter_map(|token| canonical_environment(token))
        .collect::<Vec<_>>();
    if let Some(non_local) = recognized.iter().find(|value| value.as_str() != "local") {
        return Some(non_local.clone());
    }
    if let Some(value) = recognized.first() {
        return Some(value.clone());
    }

    let prefixes = [
        ".env",
        "config",
        "configuration",
        "settings",
        "application",
        "appsettings",
    ];
    for prefix in prefixes {
        if let Some(remainder) = stem.strip_prefix(prefix) {
            let custom = remainder.trim_matches(|character| matches!(character, '.' | '-' | '_'));
            if !custom.is_empty() && custom != "local" {
                return Some(normalize_environment_id(custom));
            }
        }
    }
    None
}

fn parent_environment(root: &Path, path: &Path) -> Option<String> {
    let parent_path = path.parent()?;
    if parent_path == root {
        return None;
    }
    let parent = parent_path.file_name()?.to_str()?.to_ascii_lowercase();
    if let Some(environment) = canonical_environment(&parent) {
        return Some(environment);
    }
    let grandparent = parent_path
        .parent()?
        .file_name()?
        .to_str()?
        .to_ascii_lowercase();
    if is_config_directory(&grandparent) && !is_config_directory(&parent) {
        return Some(normalize_environment_id(&parent));
    }
    None
}

fn canonical_environment(value: &str) -> Option<String> {
    let environment = match value {
        "local" | "本地" => "local",
        "dev" | "development" | "开发" => "development",
        "test" | "testing" | "ci" | "sit" | "测试" => "test",
        "qa" => "qa",
        "stage" | "staging" | "uat" | "preprod" | "preproduction" | "预发布" => "staging",
        "prod" | "production" | "online" | "线上" => "production",
        _ => return None,
    };
    Some(environment.into())
}

fn environment_match(id: &str, source: &str) -> EnvironmentMatch {
    let normalized = normalize_environment_id(id);
    let label = match normalized.as_str() {
        "common" => "公共".into(),
        "local" => "本地".into(),
        "development" => "开发".into(),
        "test" => "测试".into(),
        "qa" => "QA".into(),
        "staging" => "预发布".into(),
        "production" => "线上".into(),
        custom => custom.to_string(),
    };
    EnvironmentMatch {
        id: normalized,
        label,
        source: source.into(),
    }
}

fn normalize_environment_id(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn environment_rank(value: &str) -> usize {
    match value {
        "common" => 0,
        "local" => 1,
        "development" => 2,
        "test" => 3,
        "qa" => 4,
        "staging" => 5,
        "production" => 6,
        _ => 7,
    }
}

fn strip_known_extension(name: &str) -> &str {
    for extension in [
        ".properties",
        ".jsonc",
        ".yaml",
        ".json",
        ".toml",
        ".yml",
        ".ini",
    ] {
        if let Some(value) = name.strip_suffix(extension) {
            return value;
        }
    }
    name
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string()
}

fn modified_millis(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .and_then(|value| value.as_millis().try_into().ok())
        .unwrap_or(0)
}

fn content_hash(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = key
        .trim()
        .trim_matches(|character| matches!(character, '"' | '\''))
        .to_ascii_lowercase()
        .replace(['-', '.', ' '], "_");
    if normalized.contains("public_key") {
        return false;
    }
    normalized.split('_').any(|part| {
        matches!(
            part,
            "password" | "passwd" | "pwd" | "secret" | "token" | "credential"
        )
    }) || normalized.contains("api_key")
        || normalized.contains("apikey")
        || normalized.contains("private_key")
        || normalized.contains("access_key")
        || normalized.contains("connection_string")
        || normalized.ends_with("database_url")
        || normalized.ends_with("db_url")
}

fn mask_sensitive_content(content: &str) -> (String, usize) {
    let mut count = 0;
    let mut sensitive_block_indent: Option<usize> = None;
    let lines = content
        .lines()
        .map(|line| {
            let trimmed = line.trim_start();
            let indent = line.len().saturating_sub(trimmed.len());
            if let Some(block_indent) = sensitive_block_indent {
                if trimmed.is_empty() || indent > block_indent {
                    return if trimmed.is_empty() {
                        String::new()
                    } else {
                        format!("{}••••••", &line[..indent])
                    };
                }
                sensitive_block_indent = None;
            }
            if trimmed.is_empty()
                || trimmed.starts_with('#')
                || trimmed.starts_with(';')
                || trimmed.starts_with("//")
            {
                return line.to_string();
            }
            let delimiter = line.find('=').or_else(|| line.find(':'));
            let Some(index) = delimiter else {
                return line.to_string();
            };
            let key = line[..index].trim().trim_start_matches("export ").trim();
            if !is_sensitive_key(key) {
                return line.to_string();
            }
            count += 1;
            let raw_value = line[index + 1..].trim();
            if raw_value.is_empty()
                || raw_value.starts_with('|')
                || raw_value.starts_with('>')
                || raw_value.starts_with('{')
                || raw_value.starts_with('[')
            {
                sensitive_block_indent = Some(indent);
            }
            let suffix = if raw_value.ends_with(',') { "," } else { "" };
            format!("{}••••••{}", &line[..=index], suffix)
        })
        .collect::<Vec<_>>()
        .join("\n");
    let masked = if content.ends_with('\n') {
        format!("{lines}\n")
    } else {
        lines
    };
    (masked, count)
}

fn validate_config(format: &str, content: &str) -> Result<(), String> {
    match format {
        "dotenv" => validate_dotenv(content),
        "yaml" => {
            for document in serde_yaml::Deserializer::from_str(content) {
                serde_yaml::Value::deserialize(document)
                    .map_err(|error| format!("YAML 语法错误：{error}"))?;
            }
            Ok(())
        }
        "json" => serde_json::from_str::<serde_json::Value>(content)
            .map(|_| ())
            .map_err(|error| format!("JSON 语法错误：{error}")),
        "jsonc" => serde_json::from_str::<serde_json::Value>(&normalize_jsonc(content))
            .map(|_| ())
            .map_err(|error| format!("JSONC 语法错误：{error}")),
        "toml" => toml::from_str::<toml::Value>(content)
            .map(|_| ())
            .map_err(|error| format!("TOML 语法错误：{error}")),
        "ini" => validate_ini(content),
        "properties" => validate_properties(content),
        _ => Err("不支持该配置格式".into()),
    }
}

fn validate_dotenv(content: &str) -> Result<(), String> {
    for (index, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let assignment = trimmed.strip_prefix("export ").unwrap_or(trimmed);
        let Some((key, _)) = assignment.split_once('=') else {
            return Err(format!("ENV 第 {} 行缺少 =", index + 1));
        };
        let mut characters = key.trim().chars();
        let Some(first) = characters.next() else {
            return Err(format!("ENV 第 {} 行变量名为空", index + 1));
        };
        if !(first.is_ascii_alphabetic() || first == '_')
            || !characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
        {
            return Err(format!("ENV 第 {} 行变量名无效", index + 1));
        }
    }
    Ok(())
}

fn validate_ini(content: &str) -> Result<(), String> {
    for (index, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('[') {
            if !trimmed.ends_with(']') || trimmed.len() < 3 {
                return Err(format!("INI 第 {} 行分组名称无效", index + 1));
            }
            continue;
        }
        if !trimmed.contains('=') && !trimmed.contains(':') {
            return Err(format!("INI 第 {} 行缺少 = 或 :", index + 1));
        }
    }
    Ok(())
}

fn validate_properties(content: &str) -> Result<(), String> {
    let mut continuation = false;
    for (index, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if continuation {
            continuation = has_odd_trailing_backslashes(line);
            continue;
        }
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('!') {
            continue;
        }
        let has_separator = trimmed.contains('=')
            || trimmed.contains(':')
            || trimmed.chars().any(char::is_whitespace);
        if !has_separator {
            return Err(format!("Properties 第 {} 行缺少键值分隔符", index + 1));
        }
        continuation = has_odd_trailing_backslashes(line);
    }
    if continuation {
        return Err("Properties 最后一行存在未完成的续行".into());
    }
    Ok(())
}

fn has_odd_trailing_backslashes(line: &str) -> bool {
    line.chars()
        .rev()
        .take_while(|character| *character == '\\')
        .count()
        % 2
        == 1
}

fn normalize_jsonc(content: &str) -> String {
    let mut output = String::with_capacity(content.len());
    let mut characters = content.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;
    while let Some(character) = characters.next() {
        if in_string {
            output.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }
        if character == '"' {
            in_string = true;
            output.push(character);
        } else if character == '/' && characters.peek() == Some(&'/') {
            output.push(' ');
            output.push(' ');
            characters.next();
            for next in characters.by_ref() {
                if next == '\n' {
                    output.push('\n');
                    break;
                }
                output.push(' ');
            }
        } else if character == '/' && characters.peek() == Some(&'*') {
            output.push(' ');
            output.push(' ');
            characters.next();
            let mut previous = '\0';
            for next in characters.by_ref() {
                output.push(if next == '\n' { '\n' } else { ' ' });
                if previous == '*' && next == '/' {
                    break;
                }
                previous = next;
            }
        } else {
            output.push(character);
        }
    }

    let chars = output.chars().collect::<Vec<_>>();
    let mut normalized = String::with_capacity(output.len());
    for (index, character) in chars.iter().enumerate() {
        if *character == ',' {
            let next = chars[index + 1..]
                .iter()
                .find(|value| !value.is_whitespace());
            if matches!(next, Some('}') | Some(']')) {
                normalized.push(' ');
                continue;
            }
        }
        normalized.push(*character);
    }
    normalized
}

#[cfg(test)]
mod tests {
    use super::{
        discover_project_configs_blocking, infer_environment, mask_sensitive_content,
        read_project_config_blocking, save_project_config_blocking, validate_config,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn discovers_supported_configs_and_groups_by_filename_then_parent() {
        let root = tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join("environments/blue")).expect("create dirs");
        fs::create_dir_all(root.path().join("production")).expect("create dirs");
        fs::write(root.path().join(".env.test"), "API_URL=http://test\n").expect("env");
        fs::write(
            root.path().join("production/config.dev.yaml"),
            "name: dev\n",
        )
        .expect("yaml");
        fs::write(root.path().join("environments/blue/settings.json"), "{}").expect("json");
        fs::write(root.path().join("README.yaml"), "ignored: true\n").expect("ignored");

        let discovery =
            discover_project_configs_blocking(&root.path().to_string_lossy()).expect("discovery");
        assert_eq!(discovery.files.len(), 3);
        let env = discovery
            .files
            .iter()
            .find(|file| file.path == ".env.test")
            .expect("env file");
        assert_eq!(env.environment, "test");
        let filename_wins = discovery
            .files
            .iter()
            .find(|file| file.path.ends_with("config.dev.yaml"))
            .expect("dev file");
        assert_eq!(filename_wins.environment, "development");
        assert_eq!(filename_wins.environment_source, "filename");
        let custom = discovery
            .files
            .iter()
            .find(|file| file.path.ends_with("settings.json"))
            .expect("custom file");
        assert_eq!(custom.environment, "blue");
        assert_eq!(custom.environment_source, "parent");
    }

    #[test]
    fn discovers_arbitrarily_named_yaml_inside_an_etc_tree() {
        let root = tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join("etc/sl.giterlab.com")).expect("create dirs");
        fs::write(
            root.path().join("etc/sl.giterlab.com/yisheng.yaml"),
            "enabled: true\n",
        )
        .expect("yaml");
        fs::write(
            root.path()
                .join("etc/sl.giterlab.com/giterlab-app-docker-setting.yaml"),
            "service: giterlab\n",
        )
        .expect("yaml");
        fs::write(root.path().join("notes.yaml"), "ignored: true\n").expect("ignored");

        let discovery =
            discover_project_configs_blocking(&root.path().to_string_lossy()).expect("discovery");
        let paths = discovery
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>();

        assert!(paths.contains(&"etc/sl.giterlab.com/yisheng.yaml"));
        assert!(paths.contains(&"etc/sl.giterlab.com/giterlab-app-docker-setting.yaml"));
        assert!(!paths.contains(&"notes.yaml"));
    }

    #[test]
    fn masks_common_secret_keys_without_masking_public_keys() {
        let (masked, count) = mask_sensitive_content(
            "API_TOKEN=abc\npublic_key: visible\npassword: secret\nprivate_key: |\n  line-one\n  line-two\nname: visible\n",
        );
        assert_eq!(count, 3);
        assert!(masked.contains("API_TOKEN=••••••"));
        assert!(masked.contains("password:••••••"));
        assert!(masked.contains("public_key: visible"));
        assert!(!masked.contains("line-one"));
        assert!(masked.contains("name: visible"));
    }

    #[test]
    fn validates_supported_structured_formats() {
        assert!(validate_config("yaml", "service:\n  port: 8080\n").is_ok());
        assert!(validate_config("yaml", "service: [\n").is_err());
        assert!(validate_config("jsonc", "{ // note\n \"port\": 8080,\n}\n").is_ok());
        assert!(validate_config("toml", "[service]\nport = 8080\n").is_ok());
        assert!(validate_config("ini", "[service]\nport=8080\n").is_ok());
        assert!(validate_config("ini", "[service\nport=8080\n").is_err());
        assert!(validate_config("properties", "service.port=8080\n").is_ok());
        assert!(validate_config("dotenv", "APP_ENV=local\n").is_ok());
        assert!(validate_config("dotenv", "BROKEN\n").is_err());
    }

    #[test]
    fn saves_atomically_and_rejects_stale_content() {
        let root = tempdir().expect("tempdir");
        let path = root.path().join("config.yaml");
        fs::write(&path, "name: old\n").expect("write");
        let root_text = root.path().to_string_lossy();
        let loaded = read_project_config_blocking(&root_text, "config.yaml").expect("read");
        save_project_config_blocking(
            &root_text,
            "config.yaml",
            "name: new\n",
            &loaded.content_hash,
        )
        .expect("save");
        assert_eq!(
            fs::read_to_string(&path).expect("saved content"),
            "name: new\n"
        );
        assert!(save_project_config_blocking(
            &root_text,
            "config.yaml",
            "name: stale\n",
            &loaded.content_hash
        )
        .is_err());
    }

    #[test]
    fn parent_environment_only_uses_the_immediate_parent() {
        let root = tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join("config/staging")).expect("dirs");
        let path = root.path().join("config/staging/settings.yaml");
        fs::write(&path, "enabled: true\n").expect("write");
        let environment = infer_environment(root.path(), &path);
        assert_eq!(environment.id, "staging");
        assert_eq!(environment.source, "parent");
    }
}
