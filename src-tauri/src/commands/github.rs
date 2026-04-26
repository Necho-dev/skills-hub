use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::Deserialize;
use tauri::{AppHandle, Emitter};

use crate::models::{ImportPreviewItem, ImportProgress, Publisher, PublisherRepo};

const REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/skillshub-registry/registry/main/registry.json";

#[derive(Debug, Deserialize)]
struct GhContentsItem {
    name: String,
    path: String,
    #[serde(rename = "type")]
    item_type: String,
    #[allow(dead_code)]
    download_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RegistryFile {
    #[allow(dead_code)]
    version: String,
    publishers: Vec<RegistryPublisher>,
}

#[derive(Debug, Deserialize)]
struct RegistryPublisher {
    id: String,
    name: String,
    avatar_url: Option<String>,
    repos: Vec<RegistryRepo>,
}

#[derive(Debug, Deserialize)]
struct RegistryRepo {
    repo: String,
    skills_root: String,
    skill_count: i64,
}

fn make_client(token: Option<String>) -> Result<reqwest::Client, String> {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("SkillsHub/0.1"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
    if let Some(t) = token {
        if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", t)) {
            headers.insert(AUTHORIZATION, val);
        }
    }
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}

fn parse_github_url(input: &str) -> Option<(String, String)> {
    let cleaned = input.trim().trim_end_matches('/');
    if let Some(rest) = cleaned.strip_prefix("https://github.com/") {
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    if cleaned.contains('/') && !cleaned.contains("://") {
        let parts: Vec<&str> = cleaned.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    None
}

/// 解析 GitHub tree/blob URL，提取 owner/repo/branch/path
/// 支持格式：
///   - https://github.com/owner/repo/tree/branch/path/to/dir
///   - https://github.com/owner/repo/blob/branch/path/to/file
fn parse_github_tree_url(input: &str) -> Option<(String, String, String, String)> {
    let cleaned = input.trim().trim_end_matches('/');
    if let Some(rest) = cleaned.strip_prefix("https://github.com/") {
        let parts: Vec<&str> = rest.splitn(5, '/').collect();
        if parts.len() >= 4 && (parts[2] == "tree" || parts[2] == "blob") {
            let owner = parts[0].to_string();
            let repo = parts[1].to_string();
            let branch = parts[3].to_string();
            let path = if parts.len() >= 5 {
                parts[4].to_string()
            } else {
                String::new()
            };
            return Some((owner, repo, branch, path));
        }
    }
    None
}

#[tauri::command]
pub async fn fetch_marketplace_publishers(
    registry_url: Option<String>,
    github_token: Option<String>,
) -> Result<Vec<Publisher>, String> {
    let url = registry_url.unwrap_or_else(|| REGISTRY_URL.to_string());
    let client = make_client(github_token)?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}: {}", resp.status(), url));
    }

    let registry: RegistryFile = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse registry: {}", e))?;

    let publishers = registry
        .publishers
        .into_iter()
        .map(|p| {
            let total_skills: i64 = p.repos.iter().map(|r| r.skill_count).sum();
            Publisher {
                id: p.id,
                name: p.name,
                avatar_url: p.avatar_url,
                skill_count: total_skills,
                repo_count: p.repos.len() as i64,
                repos: p
                    .repos
                    .into_iter()
                    .map(|r| PublisherRepo {
                        repo: r.repo,
                        skills_root: r.skills_root,
                        skill_count: r.skill_count,
                    })
                    .collect(),
            }
        })
        .collect();

    Ok(publishers)
}

#[tauri::command]
pub async fn preview_github_import(
    repo: String,
    skills_root: String,
    github_token: Option<String>,
) -> Result<Vec<ImportPreviewItem>, String> {
    let client = make_client(github_token)?;

    // 尝试解析 tree/blob URL（如 https://github.com/owner/repo/tree/main/path）
    if let Some((owner, repo_name, branch, path)) = parse_github_tree_url(&repo) {
        return preview_from_tree_url(&client, &owner, &repo_name, &branch, &path).await;
    }

    // 普通 owner/repo 格式，使用 skills_root 参数
    let (owner, repo_name) = parse_github_url(&repo)
        .ok_or_else(|| "Invalid GitHub repo URL or format.\nSupported formats:\n  - owner/repo\n  - https://github.com/owner/repo\n  - https://github.com/owner/repo/tree/branch/path".to_string())?;

    preview_skills_root(&client, &owner, &repo_name, "HEAD", &skills_root).await
}

async fn preview_from_tree_url(
    client: &reqwest::Client,
    owner: &str,
    repo_name: &str,
    branch: &str,
    path: &str,
) -> Result<Vec<ImportPreviewItem>, String> {
    let path_clean = path.trim_end_matches('/');
    let api_url = format!(
        "https://api.github.com/repos/{owner}/{repo_name}/contents/{path_clean}?ref={branch}"
    );

    let resp = client
        .get(&api_url)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "GitHub API error {}: {}",
            resp.status(),
            api_url
        ));
    }

    let items: Vec<GhContentsItem> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {e}"))?;

    let has_skill_md = items
        .iter()
        .any(|i| i.name.to_uppercase() == "SKILL.MD" && i.item_type == "file");

    let central_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".agent")
        .join("skills");

    if has_skill_md {
        // SingleSkill 模式：该目录本身就是一个技能
        let skill_id = path_clean
            .split('/')
            .last()
            .unwrap_or(path_clean)
            .to_string();
        let local_path = central_dir.join(&skill_id);
        let conflict = if local_path.exists() {
            Some("exists".to_string())
        } else {
            None
        };
        let action = if conflict.is_some() {
            "skip".to_string()
        } else {
            "import".to_string()
        };
        Ok(vec![ImportPreviewItem {
            id: skill_id.clone(),
            name: skill_id.clone(),
            description: None,
            path: local_path.to_string_lossy().to_string(),
            repo_path: path_clean.to_string(),
            conflict,
            action,
        }])
    } else {
        // SkillRoot 模式：枚举子目录
        preview_skills_root(client, owner, repo_name, branch, path_clean).await
    }
}

async fn preview_skills_root(
    client: &reqwest::Client,
    owner: &str,
    repo_name: &str,
    branch: &str,
    skills_root: &str,
) -> Result<Vec<ImportPreviewItem>, String> {
    let ref_param = if branch == "HEAD" {
        String::new()
    } else {
        format!("?ref={branch}")
    };
    let api_url = format!(
        "https://api.github.com/repos/{owner}/{repo_name}/contents/{}{ref_param}",
        skills_root.trim_end_matches('/')
    );

    let resp = client
        .get(&api_url)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "GitHub API error {}: check repo and skills_root path",
            resp.status()
        ));
    }

    let items: Vec<GhContentsItem> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {e}"))?;

    let central_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".agent")
        .join("skills");

    let mut previews = Vec::new();
    for item in items {
        if item.item_type != "dir" {
            continue;
        }
        let skill_id = item.name.clone();
        let local_path = central_dir.join(&skill_id);
        let conflict = if local_path.exists() {
            Some("exists".to_string())
        } else {
            None
        };
        let action = if conflict.is_some() {
            "skip".to_string()
        } else {
            "import".to_string()
        };

        previews.push(ImportPreviewItem {
            id: skill_id.clone(),
            name: skill_id.clone(),
            description: None,
            path: local_path.to_string_lossy().to_string(),
            repo_path: item.path,
            conflict,
            action,
        });
    }

    Ok(previews)
}

#[tauri::command]
pub async fn execute_github_import(
    repo: String,
    _skills_root: String,
    items: Vec<serde_json::Value>,
    _github_token: Option<String>,
    app: AppHandle,
) -> Result<Vec<serde_json::Value>, String> {
    // 优先用 tree URL 解析（提取 owner/repo），回退到普通 URL 解析
    let (owner, repo_name) = if let Some((o, r, _, _)) = parse_github_tree_url(&repo) {
        (o, r)
    } else {
        parse_github_url(&repo).ok_or_else(|| "Invalid repo format".to_string())?
    };

    let items_to_import: Vec<(String, String, bool)> = items
        .iter()
        .filter_map(|v| {
            let id = v["id"].as_str()?.to_string();
            let repo_path = v["repo_path"].as_str()?.to_string();
            let overwrite = v["action"].as_str().map(|a| a == "overwrite").unwrap_or(false);
            Some((id, repo_path, overwrite))
        })
        .collect();

    let total = items_to_import.len();
    let mut results = Vec::new();

    let clone_dir = std::env::temp_dir().join(format!(
        "skillshub-import-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    ));

    let repo_url = format!("https://github.com/{}/{}", owner, repo_name);
    let sparse_paths: Vec<String> = items_to_import
        .iter()
        .map(|(_, repo_path, _)| repo_path.clone())
        .collect();

    let _ = app.emit("import_progress", ImportProgress {
        total,
        current: 0,
        current_skill: "Cloning repository...".to_string(),
        status: "cloning".to_string(),
    });

    let clone_result = std::process::Command::new("git")
        .args([
            "clone",
            "--depth=1",
            "--filter=blob:none",
            "--sparse",
            &repo_url,
            &clone_dir.to_string_lossy(),
        ])
        .output();

    match clone_result {
        Err(e) => {
            return Err(format!("git clone failed: {}. Is git installed?", e));
        }
        Ok(output) if !output.status.success() => {
            return Err(format!(
                "git clone failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        _ => {}
    }

    let sparse_args: Vec<&str> = sparse_paths.iter().map(|s| s.as_str()).collect();
    let mut checkout_cmd = std::process::Command::new("git");
    checkout_cmd
        .current_dir(&clone_dir)
        .args(["sparse-checkout", "set", "--cone"]);
    checkout_cmd.args(&sparse_args);
    let _ = checkout_cmd.output();

    let central_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".agent")
        .join("skills");

    for (i, (skill_id, repo_path, overwrite)) in items_to_import.iter().enumerate() {
        let _ = app.emit("import_progress", ImportProgress {
            total,
            current: i + 1,
            current_skill: skill_id.clone(),
            status: "installing".to_string(),
        });

        let src = clone_dir.join(repo_path);
        let dst = central_dir.join(skill_id);

        if dst.exists() {
            if *overwrite {
                let _ = fs::remove_dir_all(&dst);
            } else {
                results.push(serde_json::json!({
                    "skill_id": skill_id,
                    "success": false,
                    "error": "Skipped (already exists)"
                }));
                continue;
            }
        }

        match crate::commands::skills::copy_dir_all_pub(&src, &dst) {
            Ok(_) => {
                crate::commands::skills::patch_skill_source(&dst, "github");
                results.push(serde_json::json!({
                    "skill_id": skill_id,
                    "success": true,
                    "error": null
                }))
            },
            Err(e) => results.push(serde_json::json!({
                "skill_id": skill_id,
                "success": false,
                "error": e.to_string()
            })),
        }
    }

    let _ = fs::remove_dir_all(&clone_dir);

    let _ = app.emit("import_progress", ImportProgress {
        total,
        current: total,
        current_skill: "Done".to_string(),
        status: "done".to_string(),
    });

    Ok(results)
}
