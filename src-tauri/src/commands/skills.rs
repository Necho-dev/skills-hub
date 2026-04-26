use std::path::{Path, PathBuf};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Result;
use gray_matter::Matter;
use gray_matter::engine::YAML;
use tauri::State;
use tokio::sync::Mutex;

use crate::models::{ConflictInfo, InstallResult, NativeSkill, PlatformInfoFull, Skill, SkillFrontmatter, SkillWithInstalls};

pub struct SymlinkLock(pub Mutex<()>);

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn expand_home(path: &str) -> PathBuf {
    if path.starts_with("$HOME") {
        if let Some(home) = dirs::home_dir() {
            return PathBuf::from(path.replacen("$HOME", &home.to_string_lossy(), 1));
        }
    }
    PathBuf::from(path)
}

fn central_skills_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".agent")
        .join("skills")
}

fn parse_frontmatter(content: &str) -> SkillFrontmatter {
    let empty = SkillFrontmatter {
        name: None, description: None, version: None,
        tags: None, source: None, source_url: None, author: None,
    };
    let matter = Matter::<YAML>::new();
    let result = matter.parse(content);
    let data = match result.data {
        Some(d) => d,
        None => return empty,
    };

    let map = match data.as_hashmap() {
        Ok(m) => m,
        Err(_) => return empty,
    };

    let get_str = |key: &str| -> Option<String> {
        map.get(key)
            .and_then(|v| v.as_string().ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };

    SkillFrontmatter {
        name:        get_str("name"),
        description: get_str("description"),
        version:     get_str("version"),
        source:      get_str("source"),
        source_url:  get_str("source_url"),
        author:      get_str("author"),
        tags:        None,
    }
}

/// 向 SKILL.md frontmatter 写入或覆盖指定 key=value。
/// 若 frontmatter 中已有该 key 则替换，否则在第一个 `---` 结束行前插入。
/// 该函数对无 frontmatter 的文件静默跳过（无 SKILL.md 或写失败不影响主流程）。
pub fn patch_skill_source(skill_dir: &Path, source: &str) {
    let skill_md = skill_dir.join("SKILL.md");
    let content = match fs::read_to_string(&skill_md) {
        Ok(c) => c,
        Err(_) => return,
    };

    let patched = patch_frontmatter_key(&content, "source", source);
    let _ = fs::write(&skill_md, patched);
}

/// 批量向 SKILL.md frontmatter 写入多个 key=value 对。
/// 用于安装时携带 author、source_url、version 等完整元数据。
#[tauri::command]
pub async fn patch_skill_meta(
    skill_id: String,
    meta: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let skill_md = central_skills_dir().join(&skill_id).join("SKILL.md");
    let content = fs::read_to_string(&skill_md)
        .map_err(|e| format!("Cannot read SKILL.md for '{}': {}", skill_id, e))?;

    let mut patched = content;
    for (key, value) in &meta {
        if !value.is_empty() {
            patched = patch_frontmatter_key(&patched, key, value);
        }
    }
    fs::write(&skill_md, patched).map_err(|e| e.to_string())?;
    Ok(())
}

fn patch_frontmatter_key(content: &str, key: &str, value: &str) -> String {
    if !content.starts_with("---") {
        return content.to_string();
    }
    // 找到关闭的 ---
    let rest = &content[3..];
    let end = match rest.find("\n---") {
        Some(pos) => pos,
        None => return content.to_string(),
    };
    let yaml_block = &rest[..end];
    let after_fm = &rest[end..]; // 包含 \n---

    let key_prefix = format!("{}:", key);
    if yaml_block.lines().any(|l| l.trim_start().starts_with(&key_prefix)) {
        // 替换已有行
        let new_yaml: Vec<&str> = yaml_block
            .lines()
            .map(|l| {
                if l.trim_start().starts_with(&key_prefix) { "" } else { l }
            })
            .collect();
        // 过滤掉被置空的行，重新插入
        let mut lines: Vec<String> = yaml_block
            .lines()
            .filter(|l| !l.trim_start().starts_with(&key_prefix))
            .map(|l| l.to_string())
            .collect();
        lines.push(format!("{}: {}", key, value));
        drop(new_yaml);
        format!("---\n{}\n{}", lines.join("\n"), after_fm)
    } else {
        // 追加新行
        format!("---\n{}\n{}: {}{}", yaml_block, key, value, after_fm)
    }
}

/// 平台信息：由前端传入 id + 路径（含 $HOME）
#[derive(Debug, serde::Deserialize)]
pub struct PlatformInfo {
    pub id: String,
    pub path: String,
}

fn scan_skill_dir(skill_dir: &Path) -> Option<Skill> {
    let skill_md = skill_dir.join("SKILL.md");
    if !skill_md.exists() {
        return None;
    }
    let content = fs::read_to_string(&skill_md).ok()?;
    let fm = parse_frontmatter(&content);
    let id = skill_dir.file_name()?.to_string_lossy().to_string();
    let name = fm.name.unwrap_or_else(|| id.clone());

    // 使用文件 mtime 作为时间戳，保证稳定性
    let mtime = fs::metadata(&skill_md)
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
        .unwrap_or_else(|_| now_secs());

    // source 从 frontmatter 读取，默认 "local"
    let source = fm.source.unwrap_or_else(|| "local".to_string());

    Some(Skill {
        id: id.clone(),
        name,
        description: fm.description,
        path: skill_dir.to_string_lossy().to_string(),
        version: fm.version,
        source,
        source_url: fm.source_url,
        author: fm.author,
        publisher_id: None,
        tags: "[]".to_string(),
        installed_at: mtime,
        updated_at: mtime,
    })
}

#[tauri::command]
pub async fn scan_central_skills(
    platform_paths: Vec<PlatformInfo>,
) -> Result<Vec<SkillWithInstalls>, String> {
    let central_dir = central_skills_dir();
    if !central_dir.exists() {
        fs::create_dir_all(&central_dir).map_err(|e| e.to_string())?;
        return Ok(vec![]);
    }

    let entries = fs::read_dir(&central_dir).map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let dir_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if dir_name.starts_with('.') { continue; }

        // 使用 symlink_metadata 获取条目自身的元数据（不跟随 symlink）
        let entry_meta = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let mut skill = if entry_meta.file_type().is_symlink() {
            // 中央库条目是 symlink（链接模式）：检测目标是否可达
            let target_reachable = path.join("SKILL.md").exists(); // is_dir() + exists() 跟随 symlink
            if target_reachable {
                // 目标可达：正常解析技能内容
                match scan_skill_dir(&path) {
                    Some(mut s) => {
                        s.source = "linked_project".to_string();
                        s
                    }
                    None => continue,
                }
            } else {
                // 悬空 symlink：构造一个最小化的 Skill 以便前端展示警告
                let id = dir_name.clone();
                let link_target = fs::read_link(&path)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();
                Skill {
                    id: id.clone(),
                    name: id.clone(),
                    description: Some(format!("链接目标已失效: {}", link_target)),
                    path: path.to_string_lossy().to_string(),
                    version: None,
                    source: "linked_broken".to_string(),
                    source_url: None,
                    author: None,
                    publisher_id: None,
                    tags: "[]".to_string(),
                    installed_at: now_secs(),
                    updated_at: now_secs(),
                }
            }
        } else if entry_meta.is_dir() {
            // 普通目录
            match scan_skill_dir(&path) {
                Some(s) => s,
                None => continue,
            }
        } else {
            continue;
        };

        // 检测每个平台目录下是否存在指向该技能的 symlink
        let mut installs: Vec<String> = Vec::new();
        for platform in &platform_paths {
            let platform_dir = expand_home(&platform.path);
            let dst = platform_dir.join(&skill.id);
            if let Ok(meta) = fs::symlink_metadata(&dst) {
                if meta.file_type().is_symlink() {
                    if let Ok(target) = fs::read_link(&dst) {
                        // 规范化路径再比较，避免尾部斜杠等差异
                        let expected = central_dir.join(&skill.id);
                        if target == expected || target.canonicalize().ok() == expected.canonicalize().ok() {
                            installs.push(platform.id.clone());
                        }
                    }
                }
            }
        }
        // 悬空条目的 path 字段更新为中央库内 symlink 路径
        skill.path = path.to_string_lossy().to_string();
        results.push(SkillWithInstalls { skill, installs });
    }

    results.sort_by(|a, b| a.skill.name.cmp(&b.skill.name));
    Ok(results)
}

#[tauri::command]
pub async fn get_skill_markdown(skill_id: String) -> Result<String, String> {
    let skill_path = central_skills_dir().join(&skill_id).join("SKILL.md");
    fs::read_to_string(&skill_path).map_err(|e| format!("Failed to read SKILL.md: {}", e))
}

#[tauri::command]
pub async fn check_symlink_conflict(
    skill_id: String,
    platform_id: String,
    platform_path: String,
) -> Result<Option<ConflictInfo>, String> {
    let target_path = expand_home(&platform_path).join(&skill_id);
    match fs::symlink_metadata(&target_path) {
        Err(_) => Ok(None),
        Ok(meta) => {
            if meta.file_type().is_symlink() {
                let link_target = fs::read_link(&target_path).unwrap_or_default();
                let expected = central_skills_dir().join(&skill_id);
                if link_target == expected {
                    return Ok(None);
                }
                Ok(Some(ConflictInfo {
                    skill_id,
                    platform_id,
                    existing_target: Some(link_target.to_string_lossy().to_string()),
                    conflict_type: "symlink_different_target".to_string(),
                }))
            } else {
                Ok(Some(ConflictInfo {
                    skill_id,
                    platform_id,
                    existing_target: Some(target_path.to_string_lossy().to_string()),
                    conflict_type: "existing_directory".to_string(),
                }))
            }
        }
    }
}

#[tauri::command]
pub async fn install_skill_to_platform(
    skill_id: String,
    platform_path: String,
    overwrite: bool,
    lock: State<'_, SymlinkLock>,
) -> Result<InstallResult, String> {
    let _guard = lock.0.lock().await;

    let src = central_skills_dir().join(&skill_id);
    if !src.exists() {
        return Ok(InstallResult {
            skill_id: skill_id.clone(),
            platform_id: platform_path.clone(),
            success: false,
            error: Some("Skill directory not found in central library".to_string()),
        });
    }

    let platform_dir = expand_home(&platform_path);
    if let Err(e) = fs::create_dir_all(&platform_dir) {
        return Ok(InstallResult {
            skill_id,
            platform_id: platform_path,
            success: false,
            error: Some(format!("Cannot create platform directory: {}", e)),
        });
    }

    let dst = platform_dir.join(&skill_id);
    if dst.exists() || fs::symlink_metadata(&dst).is_ok() {
        if overwrite {
            if dst.is_dir() && !fs::symlink_metadata(&dst).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
                fs::remove_dir_all(&dst).map_err(|e| e.to_string())?;
            } else {
                fs::remove_file(&dst).map_err(|e| e.to_string())?;
            }
        } else {
            if let Ok(meta) = fs::symlink_metadata(&dst) {
                if meta.file_type().is_symlink() {
                    if let Ok(target) = fs::read_link(&dst) {
                        if target == src {
                            return Ok(InstallResult {
                                skill_id,
                                platform_id: platform_path,
                                success: true,
                                error: None,
                            });
                        }
                    }
                }
            }
            return Ok(InstallResult {
                skill_id,
                platform_id: platform_path,
                success: false,
                error: Some("Conflict: target already exists".to_string()),
            });
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        symlink(&src, &dst).map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
    {
        return Ok(InstallResult {
            skill_id,
            platform_id: platform_path,
            success: false,
            error: Some("Windows symlinks not yet supported".to_string()),
        });
    }

    Ok(InstallResult {
        skill_id,
        platform_id: platform_path,
        success: true,
        error: None,
    })
}

#[tauri::command]
pub async fn uninstall_skill_from_platform(
    skill_id: String,
    platform_path: String,
    lock: State<'_, SymlinkLock>,
) -> Result<InstallResult, String> {
    let _guard = lock.0.lock().await;

    let dst = expand_home(&platform_path).join(&skill_id);
    if let Ok(meta) = fs::symlink_metadata(&dst) {
        if meta.file_type().is_symlink() || meta.is_file() {
            fs::remove_file(&dst).map_err(|e| e.to_string())?;
        } else {
            return Ok(InstallResult {
                skill_id,
                platform_id: platform_path,
                success: false,
                error: Some("Target is a real directory, not a symlink. Refusing to delete.".to_string()),
            });
        }
    }

    Ok(InstallResult {
        skill_id,
        platform_id: platform_path,
        success: true,
        error: None,
    })
}

#[tauri::command]
pub async fn delete_skill(
    skill_id: String,
    platform_paths: Vec<String>,
    lock: State<'_, SymlinkLock>,
) -> Result<bool, String> {
    let _guard = lock.0.lock().await;

    for platform_path in &platform_paths {
        let dst = expand_home(platform_path).join(&skill_id);
        if let Ok(meta) = fs::symlink_metadata(&dst) {
            if meta.file_type().is_symlink() || meta.is_file() {
                let _ = fs::remove_file(&dst);
            }
        }
    }

    let skill_dir = central_skills_dir().join(&skill_id);
    if skill_dir.exists() {
        fs::remove_dir_all(&skill_dir).map_err(|e| e.to_string())?;
    }

    Ok(true)
}

#[tauri::command]
pub async fn get_installed_platforms(skill_id: String) -> Result<Vec<String>, String> {
    let src = central_skills_dir().join(&skill_id);
    let platform_paths = vec![
        dirs::home_dir().unwrap_or_default().join(".cursor/skills"),
        dirs::home_dir().unwrap_or_default().join(".cursor/skills-cursor"),
        dirs::home_dir().unwrap_or_default().join(".claude/skills"),
    ];

    let mut installed = Vec::new();
    for platform_path in platform_paths {
        let dst = platform_path.join(&skill_id);
        if let Ok(meta) = fs::symlink_metadata(&dst) {
            if meta.file_type().is_symlink() {
                if let Ok(target) = fs::read_link(&dst) {
                    if target == src {
                        installed.push(platform_path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    Ok(installed)
}

#[tauri::command]
pub async fn init_central_dir() -> Result<bool, String> {
    let central = central_skills_dir();
    if !central.exists() {
        fs::create_dir_all(&central).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
pub async fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn import_skill_to_central(
    source_path: String,
    skill_id_override: Option<String>,
    overwrite: bool,
) -> Result<Skill, String> {
    let src = PathBuf::from(&source_path);
    if !src.join("SKILL.md").exists() {
        return Err("Source directory does not contain SKILL.md".to_string());
    }

    let dir_name = src.file_name()
        .ok_or("Invalid source path")?
        .to_string_lossy()
        .to_string();
    let skill_id = skill_id_override.unwrap_or(dir_name);
    let dst = central_skills_dir().join(&skill_id);

    if dst.exists() {
        if !overwrite {
            return Err(format!("Skill '{}' already exists in central library", skill_id));
        }
        fs::remove_dir_all(&dst).map_err(|e| e.to_string())?;
    }

    copy_dir_all(&src, &dst).map_err(|e| e.to_string())?;

    let skill = scan_skill_dir(&dst)
        .ok_or("Failed to read skill after copy")?;
    Ok(skill)
}

/// 读取项目技能库中任意技能的 SKILL.md（路径由前端传入）
#[tauri::command]
pub async fn get_project_skill_markdown(skill_path: String) -> Result<String, String> {
    let path = PathBuf::from(&skill_path).join("SKILL.md");
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))
}

/// Check whether a skills_path (may start with $HOME) exists on the local filesystem
#[tauri::command]
pub async fn check_path_exists(path: String) -> bool {
    expand_home(&path).exists()
}

/// 统计各平台目录下实际存在的 skill 数量（包含非中央库管理的原生 skill）
/// 入参：[{ id, path }]，返回：{ id -> count }
#[tauri::command]
pub async fn count_platform_skills(
    platform_paths: Vec<PlatformInfo>,
) -> Result<std::collections::HashMap<String, usize>, String> {
    let mut result = std::collections::HashMap::new();
    for platform in &platform_paths {
        let dir = expand_home(&platform.path);
        let count = if dir.is_dir() {
            fs::read_dir(&dir)
                .map(|entries| {
                    entries
                        .flatten()
                        .filter(|e| {
                            let p = e.path();
                            // 统计包含 SKILL.md 的子目录（含 symlink 目录）
                            if p.file_name()
                                .map(|n| n.to_string_lossy().starts_with('.'))
                                .unwrap_or(true)
                            {
                                return false;
                            }
                            // is_dir() follows symlinks
                            p.is_dir() && p.join("SKILL.md").exists()
                        })
                        .count()
                })
                .unwrap_or(0)
        } else {
            0
        };
        result.insert(platform.id.clone(), count);
    }
    Ok(result)
}

pub fn copy_dir_all_pub(src: &Path, dst: &Path) -> std::io::Result<()> {
    copy_dir_all(src, dst)
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

/// 将指定技能目录打包为 ZIP，返回 Base64 编码字节，用于导出技能集合。
/// 每个技能打包为独立的 Base64 ZIP 字符串，前端统一组装到 .skillcol 文件中。
#[tauri::command]
pub async fn pack_skill_to_zip(skill_id: String) -> Result<String, String> {
    use std::io::Cursor;
    use zip::write::FileOptions;

    let skill_dir = central_skills_dir().join(&skill_id);
    if !skill_dir.exists() {
        return Err(format!("Skill directory '{}' not found", skill_id));
    }

    let buf = Cursor::new(Vec::new());
    let mut zip_writer = zip::ZipWriter::new(buf);
    let options: FileOptions<()> = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // 递归添加目录中所有文件
    add_dir_to_zip(&mut zip_writer, &skill_dir, &skill_dir, &options)
        .map_err(|e| format!("Pack error: {e}"))?;

    let result = zip_writer.finish().map_err(|e| format!("Zip finish error: {e}"))?;
    let bytes = result.into_inner();

    use base64::{Engine as _, engine::general_purpose::STANDARD};
    Ok(STANDARD.encode(&bytes))
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<std::io::Cursor<Vec<u8>>>,
    base: &Path,
    current: &Path,
    options: &zip::write::FileOptions<()>,
) -> std::io::Result<()> {
    use std::io::Write;
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let name = path.strip_prefix(base)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let name_str = name.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            zip.add_directory(&name_str, zip::write::FileOptions::<()>::default())?;
            add_dir_to_zip(zip, base, &path, options)?;
        } else {
            zip.start_file(&name_str, *options)?;
            let data = fs::read(&path)?;
            zip.write_all(&data)?;
        }
    }
    Ok(())
}

/// 将 Base64 ZIP 解压到中央技能库，用于导入技能集合。
/// - skill_id: 目标目录名
/// - zip_b64: Base64 编码的 ZIP 字节
/// - overwrite: 若技能已存在是否覆盖
#[tauri::command]
pub async fn unpack_skill_to_central(
    skill_id: String,
    zip_b64: String,
    overwrite: bool,
) -> Result<Skill, String> {
    use std::io::Cursor;
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    let dst = central_skills_dir().join(&skill_id);
    if dst.exists() {
        if !overwrite {
            // 已存在则直接返回，不报错（幂等）
            return scan_skill_dir(&dst)
                .ok_or_else(|| format!("Skill '{}' exists but cannot be read", skill_id));
        }
        fs::remove_dir_all(&dst).map_err(|e| e.to_string())?;
    }

    let bytes = STANDARD.decode(zip_b64.trim())
        .map_err(|e| format!("Base64 decode error: {e}"))?;

    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Parse zip error: {e}"))?;

    fs::create_dir_all(&dst).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| format!("Zip entry error: {e}"))?;
        let out_path = dst.join(entry.name());
        // 安全检查：防止路径穿越
        if !out_path.starts_with(&dst) {
            return Err(format!("Unsafe path in zip: {}", entry.name()));
        }
        if entry.name().ends_with('/') {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out_file = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
        }
    }

    scan_skill_dir(&dst).ok_or_else(|| "Failed to read skill after unpack".to_string())
}

/// 扫描指定平台目录，返回未被中央库管理的原生技能列表。
/// 排除条件：子目录本身是指向中央库的 symlink。
#[tauri::command]
pub async fn scan_platform_native_skills(
    platform_paths: Vec<PlatformInfoFull>,
) -> Result<Vec<NativeSkill>, String> {
    let central_dir = central_skills_dir();
    let mut results: Vec<NativeSkill> = Vec::new();

    for platform in &platform_paths {
        let dir = expand_home(&platform.path);
        if !dir.is_dir() {
            continue;
        }

        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }

            // symlink_metadata 不跟随 symlink，获取条目自身属性
            let meta = match fs::symlink_metadata(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };

            if meta.file_type().is_symlink() {
                // 检查是否已是指向中央库的 symlink，是则跳过（已被中央库管理）
                if let Ok(target) = fs::read_link(&path) {
                    let expected = central_dir.join(&name);
                    if target == expected
                        || target.canonicalize().ok() == expected.canonicalize().ok()
                    {
                        continue;
                    }
                }
                // 是其他来源的 symlink，也跳过（不迁移未知 symlink）
                continue;
            }

            if !meta.is_dir() {
                continue;
            }

            // 验证包含 SKILL.md
            if !path.join("SKILL.md").exists() {
                continue;
            }

            let fm = {
                let content = fs::read_to_string(path.join("SKILL.md")).unwrap_or_default();
                parse_frontmatter(&content)
            };
            let skill_name = fm.name.unwrap_or_else(|| name.clone());

            results.push(NativeSkill {
                skill_id: name,
                skill_name,
                description: fm.description,
                source_path: path.to_string_lossy().to_string(),
                platform_id: platform.id.clone(),
                platform_name: platform.name.clone(),
                platform_skills_path: dir.to_string_lossy().to_string(),
            });
        }
    }

    results.sort_by(|a, b| a.skill_name.cmp(&b.skill_name));
    Ok(results)
}

/// 迁移技能到中央库：移动原目录 + 在原位置创建指向中央库的 symlink。
/// 原子性保障：rename 成功但 symlink 失败时回滚。
#[tauri::command]
pub async fn move_skill_to_central(
    source_path: String,
    platform_skills_path: String,
    skill_id_override: Option<String>,
    overwrite: bool,
    lock: State<'_, SymlinkLock>,
) -> Result<Skill, String> {
    let _guard = lock.0.lock().await;

    let src = PathBuf::from(&source_path);

    // 前置检查：源路径不能是 symlink
    let src_meta = fs::symlink_metadata(&src).map_err(|e| format!("Cannot stat source: {}", e))?;
    if src_meta.file_type().is_symlink() {
        return Err("源路径是符号链接，无法迁移。请选择复制模式。".to_string());
    }
    if !src_meta.is_dir() {
        return Err("源路径不是目录".to_string());
    }
    if !src.join("SKILL.md").exists() {
        return Err("源目录不包含 SKILL.md".to_string());
    }

    let dir_name = src
        .file_name()
        .ok_or("无效的源路径")?
        .to_string_lossy()
        .to_string();
    let skill_id = skill_id_override.unwrap_or(dir_name);
    let central_dir = central_skills_dir();
    let dst = central_dir.join(&skill_id);

    if dst.exists() || fs::symlink_metadata(&dst).is_ok() {
        if !overwrite {
            // 幂等返回已有技能
            if let Some(existing) = scan_skill_dir(&dst) {
                return Ok(existing);
            }
            return Err(format!("技能 '{}' 已存在于中央库", skill_id));
        }
        // overwrite=true：清除旧目录
        if fs::symlink_metadata(&dst)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
        {
            fs::remove_file(&dst).map_err(|e| e.to_string())?;
        } else {
            fs::remove_dir_all(&dst).map_err(|e| e.to_string())?;
        }
    }

    // 确保中央库目录存在
    fs::create_dir_all(&central_dir).map_err(|e| e.to_string())?;

    // 移动目录
    fs::rename(&src, &dst).map_err(|e| {
        let msg = e.to_string();
        if msg.contains("cross-device") || msg.contains("Invalid cross-device link") {
            "跨设备移动不支持，请改用「复制」模式".to_string()
        } else {
            format!("移动失败: {}", msg)
        }
    })?;

    // 在原位置创建 symlink 指向中央库
    let platform_dir = PathBuf::from(&platform_skills_path);
    if let Err(e) = fs::create_dir_all(&platform_dir) {
        // 创建父目录失败时回滚
        let _ = fs::rename(&dst, &src);
        return Err(format!("无法创建平台目录: {}", e));
    }
    let symlink_dst = platform_dir.join(&skill_id);

    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        if let Err(e) = symlink(&dst, &symlink_dst) {
            // symlink 创建失败：回滚 rename
            let _ = fs::rename(&dst, &src);
            return Err(format!("创建符号链接失败（已回滚）: {}", e));
        }
    }
    #[cfg(not(unix))]
    {
        let _ = fs::rename(&dst, &src);
        return Err("Windows 暂不支持符号链接迁移，请使用复制模式".to_string());
    }

    scan_skill_dir(&dst).ok_or_else(|| "迁移后读取技能失败".to_string())
}

/// 链接模式：技能真相保留在项目目录，中央库创建指向它的 symlink，从而能通过中央库向平台分发。
#[tauri::command]
pub async fn link_project_skill_to_central(
    source_path: String,
    skill_id_override: Option<String>,
    overwrite: bool,
    lock: State<'_, SymlinkLock>,
) -> Result<Skill, String> {
    let _guard = lock.0.lock().await;

    let src = PathBuf::from(&source_path);

    // 前置检查：源路径不能是 symlink（防止链套链）
    let src_meta = fs::symlink_metadata(&src).map_err(|e| format!("Cannot stat source: {}", e))?;
    if src_meta.file_type().is_symlink() {
        return Err("源路径是符号链接，无法创建链接。".to_string());
    }
    if !src_meta.is_dir() {
        return Err("源路径不是目录".to_string());
    }
    if !src.join("SKILL.md").exists() {
        return Err("源目录不包含 SKILL.md".to_string());
    }

    let dir_name = src
        .file_name()
        .ok_or("无效的源路径")?
        .to_string_lossy()
        .to_string();
    let skill_id = skill_id_override.unwrap_or(dir_name);
    let central_dir = central_skills_dir();
    let central_link = central_dir.join(&skill_id);

    if fs::symlink_metadata(&central_link).is_ok() {
        let is_symlink = fs::symlink_metadata(&central_link)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false);

        if !overwrite {
            // 幂等：若已是指向同一目标的 symlink，直接返回
            if is_symlink {
                if let Ok(target) = fs::read_link(&central_link) {
                    if target == src || target.canonicalize().ok() == src.canonicalize().ok() {
                        return scan_skill_dir(&central_link)
                            .ok_or_else(|| "读取链接技能失败".to_string());
                    }
                }
            }
            if let Some(existing) = scan_skill_dir(&central_link) {
                return Ok(existing);
            }
            return Err(format!("技能 '{}' 已存在于中央库", skill_id));
        }

        // overwrite=true：只允许覆盖 symlink，拒绝覆盖真实目录（防止误删已有技能数据）
        if is_symlink {
            fs::remove_file(&central_link).map_err(|e| e.to_string())?;
        } else {
            return Err(format!(
                "中央库中已存在真实目录 '{}'，无法用链接覆盖，请先删除或使用复制/迁移模式",
                skill_id
            ));
        }
    }

    fs::create_dir_all(&central_dir).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        symlink(&src, &central_link).map_err(|e| format!("创建符号链接失败: {}", e))?;
    }
    #[cfg(not(unix))]
    {
        return Err("Windows 暂不支持符号链接，请使用复制模式".to_string());
    }

    scan_skill_dir(&central_link).ok_or_else(|| "链接后读取技能失败".to_string())
}
