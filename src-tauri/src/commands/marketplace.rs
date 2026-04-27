use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, USER_AGENT};
use serde::Deserialize;
use tokio_tungstenite::{connect_async_tls_with_config, tungstenite::Message, Connector};
use futures_util::{SinkExt, StreamExt};

use crate::models::{SourceSkillItem, SourceSkillPage};

// ── HTTP 客户端 ────────────────────────────────────────────────────────────

fn make_client() -> Result<reqwest::Client, String> {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("SkillsHub/0.1"));
    reqwest::Client::builder()
        .default_headers(headers)
        // 使用 macOS 系统原生根证书，解决 rustls 与 Cloudflare/Convex 的 TLS 兼容问题
        .tls_built_in_native_certs(true)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

/// 拉取指定源的技能列表
/// source_type: "skillhub" | "clawhub" | "official_registry"
/// base_url: 数据源的 API base URL
/// query: 搜索关键词（可选）
/// cursor: 分页游标（ClawHub nextCursor / SkillHub 页码字符串）
#[tauri::command]
pub async fn fetch_source_skills(
    source_id: String,
    source_type: String,
    base_url: String,
    query: Option<String>,
    cursor: Option<String>,
) -> Result<SourceSkillPage, String> {
    let client = make_client()?;

    match source_type.as_str() {
        "skillhub" => fetch_skillhub(&client, &base_url, &source_id, query, cursor).await,
        "clawhub" => fetch_clawhub(&client, &source_id, query, cursor).await,
        "official_registry" => {
            fetch_official_registry(&client, &base_url, &source_id).await
        }
        "skillsmp" => fetch_skillsmp(&client, &base_url, &source_id, query, cursor).await,
        t => Err(format!("Unknown source type: {t}")),
    }
}

/// 下载指定技能 ZIP 并解压到中央技能库目录（由前端传入 central_dir）
/// source_type: "skillhub" | "clawhub"
/// slug: 技能的 slug
/// overwrite: 是否覆盖已存在的技能
/// central_dir: 中央技能库路径（$HOME/... 格式，由 settingsStore 提供）
#[tauri::command]
pub async fn download_source_skill(
    source_type: String,
    base_url: String,
    slug: String,
    overwrite: bool,
    central_dir: Option<String>,
) -> Result<String, String> {
    let client = make_client()?;

    let download_url = match source_type.as_str() {
        "skillhub" => format!("{base_url}/api/v1/download?slug={slug}"),
        "clawhub" => {
            // ClawHub 下载用 convex.site 而非 convex.cloud
            format!("https://wry-manatee-359.convex.site/api/v1/download?slug={slug}")
        }
        t => {
            return Err(format!(
                "Direct ZIP download not supported for source type: {t}"
            ))
        }
    };

    let resolved_dir = crate::commands::skills::resolve_central_dir_pub(central_dir);
    let result = download_and_install_zip(&client, &download_url, &slug, overwrite, &resolved_dir).await?;

    // ZIP 解压完成后，把正确的 source 写入 SKILL.md frontmatter
    let skill_dir = resolved_dir.join(&slug);
    let source_str = source_label_for(&source_type);
    crate::commands::skills::patch_skill_source(&skill_dir, source_str);

    Ok(result)
}

/// 拉取技能详情（目前仅 SkillHub 有详情接口）
#[tauri::command]
pub async fn fetch_skill_detail(
    source_type: String,
    base_url: String,
    slug: String,
) -> Result<serde_json::Value, String> {
    if source_type != "skillhub" {
        return Ok(serde_json::Value::Null);
    }
    let client = make_client()?;
    let url = format!("{base_url}/api/v1/skills/{slug}");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("SkillHub detail network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("SkillHub detail HTTP {}: {url}", resp.status()));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("SkillHub detail parse error: {e}"))?;
    Ok(json)
}

// ── SkillHub Adapter ────────────────────────────────────────────────────────

async fn fetch_skillhub(
    client: &reqwest::Client,
    base_url: &str,
    source_id: &str,
    query: Option<String>,
    cursor: Option<String>,
) -> Result<SourceSkillPage, String> {
    let page: u32 = cursor
        .as_deref()
        .and_then(|c| c.parse().ok())
        .unwrap_or(1u32);

    let keyword = urlencoding::encode(query.as_deref().unwrap_or("")).into_owned();
    let url = format!(
        "{base_url}/api/skills?page={page}&pageSize=24&sortBy=score&order=desc&keyword={keyword}"
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("SkillHub network error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("SkillHub HTTP {}: {url}", resp.status()));
    }

    let body: SkillHubResponse = resp
        .json()
        .await
        .map_err(|e| format!("SkillHub parse error: {e}"))?;

    if body.code != 0 {
        return Err(format!("SkillHub API error code: {}", body.code));
    }

    let data = body.data;
    let total = data.total;
    let page_size = 24u64;
    let has_more = (page as u64) * page_size < total;
    let next_cursor = if has_more {
        Some((page + 1).to_string())
    } else {
        None
    };

    let items = data
        .skills
        .into_iter()
        .map(|s| {
            let desc = s
                .description_zh
                .filter(|d| !d.is_empty())
                .unwrap_or_else(|| s.description.clone());
            SourceSkillItem {
                id: format!("{source_id}:{}", s.slug),
                slug: s.slug.clone(),
                name: s.name,
                description: if desc.is_empty() { None } else { Some(desc) },
                author: Some(s.owner_name),
                author_avatar: s.icon_url,
                stars: Some(s.stars),
                downloads: Some(s.downloads),
                forks: None,
                version: s.version,
                category: s.category,
                tags: s.tags.unwrap_or_default(),
                source_id: source_id.to_string(),
                requires_api_key: s.requires_api_key.unwrap_or(false),
                github_url: None,
            }
        })
        .collect();

    Ok(SourceSkillPage {
        items,
        total: Some(total),
        has_more,
        next_cursor,
    })
}

#[derive(Debug, Deserialize)]
struct SkillHubResponse {
    code: i32,
    data: SkillHubData,
}

#[derive(Debug, Deserialize)]
struct SkillHubData {
    total: u64,
    skills: Vec<SkillHubSkill>,
}

#[derive(Debug, Deserialize)]
struct SkillHubSkill {
    slug: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(rename = "description_zh")]
    description_zh: Option<String>,
    #[serde(rename = "ownerName")]
    owner_name: String,
    #[serde(rename = "iconUrl")]
    icon_url: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    #[serde(default)]
    stars: i64,
    #[serde(default)]
    downloads: i64,
    version: Option<String>,
    // API 有时返回 null，用 Option + default 兜底
    #[serde(rename = "requires_api_key", default)]
    requires_api_key: Option<bool>,
}

// ── ClawHub Adapter ─────────────────────────────────────────────────────────

async fn fetch_clawhub(
    client: &reqwest::Client,
    source_id: &str,
    query: Option<String>,
    cursor: Option<String>,
) -> Result<SourceSkillPage, String> {
    // 有搜索词时走 WebSocket search:searchSkills（真实服务端搜索）
    if let Some(ref q) = query {
        if !q.trim().is_empty() {
            return fetch_clawhub_search(source_id, q).await;
        }
    }

    // 无搜索词走 HTTP 分页列表
    let args = if let Some(ref c) = cursor {
        serde_json::json!({
            "dir": "desc",
            "sort": "downloads",
            "numItems": 25,
            "cursor": c,
            "highlightedOnly": false,
            "nonSuspiciousOnly": false
        })
    } else {
        serde_json::json!({
            "dir": "desc",
            "sort": "downloads",
            "numItems": 25,
            "highlightedOnly": false,
            "nonSuspiciousOnly": false
        })
    };

    let body = serde_json::json!({
        "path": "skills:listPublicPageV4",
        "format": "convex_encoded_json",
        "args": [args]
    });

    let resp = client
        .post("https://wry-manatee-359.convex.cloud/api/query")
        .header(CONTENT_TYPE, "application/json")
        .header("convex-client", "npm-1.35.1")
        .header("origin", "https://clawhub.ai")
        .header("referer", "https://clawhub.ai/")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("ClawHub network error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("ClawHub HTTP {}", resp.status()));
    }

    let response: ClawHubResponse = resp
        .json()
        .await
        .map_err(|e| format!("ClawHub parse error: {e}"))?;

    if response.status != "success" {
        return Err(format!(
            "ClawHub API error: {}",
            response.error_message.unwrap_or_default()
        ));
    }

    let value = response
        .value
        .ok_or_else(|| "ClawHub: missing value field".to_string())?;

    let items: Vec<SourceSkillItem> = value
        .page
        .into_iter()
        .map(|item| clawhub_page_item_to_skill(source_id, item))
        .collect();

    Ok(SourceSkillPage {
        items,
        total: None,
        has_more: value.has_more,
        next_cursor: value.next_cursor,
    })
}

/// ClawHub WebSocket 搜索：使用 Convex sync 协议的 Action 类型
async fn fetch_clawhub_search(source_id: &str, query: &str) -> Result<SourceSkillPage, String> {
    use native_tls::TlsConnector as NativeTlsConnector;
    use tokio_tungstenite::tungstenite::handshake::client::Request;

    let tls = NativeTlsConnector::new().map_err(|e| format!("TLS init error: {e}"))?;
    let connector = Connector::NativeTls(tls);

    let request = Request::builder()
        .uri("wss://wry-manatee-359.convex.cloud/api/1.35.1/sync")
        .header("Host", "wry-manatee-359.convex.cloud")
        .header("Upgrade", "websocket")
        .header("Connection", "Upgrade")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
        .header("Origin", "https://clawhub.ai")
        .header("User-Agent", "SkillsHub/0.1")
        .body(())
        .map_err(|e| format!("WS request build error: {e}"))?;

    let (mut ws, _) = connect_async_tls_with_config(request, None, false, Some(connector))
        .await
        .map_err(|e| format!("ClawHub WS connect error: {e}"))?;

    let search_msg = serde_json::json!({
        "type": "Action",
        "requestId": 0,
        "udfPath": "search:searchSkills",
        "args": [{
            "limit": 25,
            "nonSuspiciousOnly": true,
            "query": query
        }]
    });

    ws.send(Message::Text(search_msg.to_string().into()))
        .await
        .map_err(|e| format!("ClawHub WS send error: {e}"))?;

    // 等待 ActionResponse，超时 15 秒
    let timeout = tokio::time::Duration::from_secs(15);
    let result = tokio::time::timeout(timeout, async {
        while let Some(msg) = ws.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                        if val.get("type").and_then(|t| t.as_str()) == Some("ActionResponse") {
                            return Some(val);
                        }
                    }
                }
                Ok(Message::Close(_)) => break,
                Err(_) => break,
                _ => {}
            }
        }
        None
    })
    .await
    .map_err(|_| "ClawHub WS search timeout".to_string())?;

    let _ = ws.close(None).await;

    let response = result.ok_or_else(|| "ClawHub WS: no ActionResponse received".to_string())?;

    if response.get("success").and_then(|s| s.as_bool()) != Some(true) {
        return Err(format!(
            "ClawHub WS search failed: {}",
            response.get("error").unwrap_or(&serde_json::Value::Null)
        ));
    }

    let result_arr = response
        .get("result")
        .and_then(|r| r.as_array())
        .ok_or_else(|| "ClawHub WS: invalid result format".to_string())?;

    let items: Vec<SourceSkillItem> = result_arr
        .iter()
        .filter_map(|entry| {
            let skill = entry.get("skill")?;
            let owner = entry.get("owner")?;
            let slug = skill.get("slug")?.as_str().unwrap_or_default().to_string();
            let name = skill
                .get("displayName")
                .and_then(|n| n.as_str())
                .unwrap_or(&slug)
                .to_string();
            let summary = skill
                .get("summary")
                .and_then(|s| s.as_str())
                .map(|s| s.to_string());
            let stats = skill.get("stats");
            let stars = stats
                .and_then(|s| s.get("stars"))
                .and_then(|v| v.as_f64())
                .map(|v| v as i64);
            let downloads = stats
                .and_then(|s| s.get("downloads"))
                .and_then(|v| v.as_f64())
                .map(|v| v as i64);
            let author = owner
                .get("displayName")
                .and_then(|n| n.as_str())
                .map(|n| n.to_string());
            let author_avatar = owner
                .get("image")
                .and_then(|i| i.as_str())
                .map(|i| i.to_string());
            Some(SourceSkillItem {
                id: format!("{source_id}:{slug}"),
                slug,
                name,
                description: summary,
                author,
                author_avatar,
                stars,
                downloads,
                forks: None,
                version: None,
                category: None,
                tags: vec![],
                source_id: source_id.to_string(),
                requires_api_key: false,
                github_url: None,
            })
        })
        .collect();

    Ok(SourceSkillPage {
        items,
        total: None,
        has_more: false,
        next_cursor: None,
    })
}

fn clawhub_page_item_to_skill(source_id: &str, item: ClawHubPageItem) -> SourceSkillItem {
    let slug = item.skill.slug.clone();
    let stats = item.skill.stats.unwrap_or_default();
    SourceSkillItem {
        id: format!("{source_id}:{slug}"),
        slug,
        name: item.skill.display_name,
        description: item.skill.summary,
        author: Some(item.owner.display_name),
        author_avatar: item.owner.image,
        stars: Some(stats.stars as i64),
        downloads: Some(stats.downloads as i64),
        forks: None,
        version: item.latest_version.map(|v| v.version),
        category: None,
        tags: vec![],
        source_id: source_id.to_string(),
        requires_api_key: false,
        github_url: None,
    }
}

#[derive(Debug, Deserialize)]
struct ClawHubResponse {
    status: String,
    value: Option<ClawHubValue>,
    #[serde(rename = "errorMessage")]
    error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClawHubValue {
    #[serde(rename = "hasMore")]
    has_more: bool,
    #[serde(rename = "nextCursor")]
    next_cursor: Option<String>,
    page: Vec<ClawHubPageItem>,
}

#[derive(Debug, Deserialize)]
struct ClawHubPageItem {
    skill: ClawHubSkill,
    owner: ClawHubOwner,
    #[serde(rename = "latestVersion")]
    latest_version: Option<ClawHubVersion>,
}

#[derive(Debug, Deserialize)]
struct ClawHubSkill {
    slug: String,
    #[serde(rename = "displayName")]
    display_name: String,
    summary: Option<String>,
    stats: Option<ClawHubStats>,
}

#[derive(Debug, Deserialize, Default)]
struct ClawHubStats {
    downloads: f64,
    stars: f64,
}

#[derive(Debug, Deserialize)]
struct ClawHubOwner {
    #[serde(rename = "displayName")]
    display_name: String,
    image: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClawHubVersion {
    version: String,
}

// ── Skillsmp Adapter ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SkillsmpResponse {
    skills: Vec<SkillsmpSkill>,
    pagination: SkillsmpPagination,
}

#[derive(Debug, Deserialize)]
struct SkillsmpSkill {
    id: String,
    name: String,
    author: String,
    #[serde(rename = "authorAvatar")]
    author_avatar: Option<String>,
    description: Option<String>,
    #[serde(rename = "githubUrl")]
    github_url: Option<String>,
    stars: Option<i64>,
    forks: Option<i64>,
    #[serde(rename = "updatedAt")]
    _updated_at: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct SkillsmpPagination {
    #[serde(rename = "hasNext")]
    has_next: bool,
    page: u32,
}

async fn fetch_skillsmp(
    client: &reqwest::Client,
    base_url: &str,
    source_id: &str,
    query: Option<String>,
    cursor: Option<String>,
) -> Result<SourceSkillPage, String> {
    let page: u32 = cursor
        .as_deref()
        .and_then(|c| c.parse().ok())
        .unwrap_or(1u32);
    let search = urlencoding::encode(query.as_deref().unwrap_or("")).into_owned();
    let url = format!(
        "{base_url}/api/skills?page={page}&limit=24&sortBy=stars&search={search}"
    );

    let resp = client
        .get(&url)
        .header("Referer", "https://skillsmp.com/")
        .header("x-search-source", "web")
        .send()
        .await
        .map_err(|e| format!("Skillsmp network error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Skillsmp HTTP {}: {url}", resp.status()));
    }

    let body: SkillsmpResponse = resp
        .json()
        .await
        .map_err(|e| format!("Skillsmp parse error: {e}"))?;

    let has_more = body.pagination.has_next;
    let next_page = body.pagination.page + 1;

    let items = body
        .skills
        .into_iter()
        .map(|s| SourceSkillItem {
            id: format!("{source_id}:{}", s.id),
            slug: s.name.to_lowercase().replace(' ', "-"),
            name: s.name,
            description: s.description,
            author: Some(s.author),
            author_avatar: s.author_avatar,
            stars: s.stars,
            downloads: None,
            forks: s.forks,
            version: None,
            category: None,
            tags: vec![],
            source_id: source_id.to_string(),
            requires_api_key: false,
            github_url: s.github_url,
        })
        .collect();

    Ok(SourceSkillPage {
        items,
        total: None,
        has_more,
        next_cursor: if has_more {
            Some(next_page.to_string())
        } else {
            None
        },
    })
}

// ── Official Registry Adapter ───────────────────────────────────────────────

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
#[allow(dead_code)]
struct RegistryRepo {
    #[serde(default)]
    backend: String,
    // github backend
    repo: Option<String>,
    skills_root: Option<String>,
    skill_count: Option<i64>,
    // zip_url backend
    name: Option<String>,
    slug: Option<String>,
    download_url: Option<String>,
    // skillhub backend
    skillhub_base: Option<String>,
    namespace: Option<String>,
}

async fn fetch_official_registry(
    client: &reqwest::Client,
    url: &str,
    source_id: &str,
) -> Result<SourceSkillPage, String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Registry network error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Registry HTTP {}: {url}", resp.status()));
    }

    let registry: RegistryFile = resp
        .json()
        .await
        .map_err(|e| format!("Registry parse error: {e}"))?;

    let mut items = Vec::new();
    let mut total: u64 = 0;

    for publisher in &registry.publishers {
        for repo in &publisher.repos {
            let backend = if repo.backend.is_empty() {
                "github"
            } else {
                repo.backend.as_str()
            };

            match backend {
                "github" => {
                    if let (Some(repo_path), Some(skills_root)) =
                        (repo.repo.as_deref(), repo.skills_root.as_deref())
                    {
                        let count = repo.skill_count.unwrap_or(1);
                        total += count as u64;
                        let repo_short = repo_path
                            .split('/')
                            .last()
                            .unwrap_or(repo_path);
                        items.push(SourceSkillItem {
                            id: format!(
                                "{source_id}:{}:{}",
                                publisher.id,
                                repo_path.replace('/', ":")
                            ),
                            slug: repo_path.to_string(),
                            name: format!("{} / {repo_short}", publisher.name),
                            description: Some(format!(
                                "{count} 个技能 · 根目录: {skills_root}"
                            )),
                            author: Some(publisher.name.clone()),
                            author_avatar: publisher.avatar_url.clone(),
                            stars: None,
                            downloads: None,
                            forks: None,
                            version: None,
                            category: None,
                            tags: vec![],
                            source_id: source_id.to_string(),
                            requires_api_key: false,
                            github_url: None,
                        });
                    }
                }
                "zip_url" => {
                    if let Some(slug) = repo.slug.as_deref() {
                        total += 1;
                        items.push(SourceSkillItem {
                            id: format!("{source_id}:{}", slug),
                            slug: slug.to_string(),
                            name: repo
                                .name
                                .clone()
                                .unwrap_or_else(|| slug.to_string()),
                            description: Some("ZIP 包下载".to_string()),
                            author: Some(publisher.name.clone()),
                            author_avatar: publisher.avatar_url.clone(),
                            stars: None,
                            downloads: None,
                            forks: None,
                            version: None,
                            category: None,
                            tags: vec![],
                            source_id: source_id.to_string(),
                            requires_api_key: false,
                            github_url: None,
                        });
                    }
                }
                "skillhub" => {
                    let count = repo.skill_count.unwrap_or(0);
                    total += count as u64;
                    if let Some(base) = repo.skillhub_base.as_deref() {
                        let ns = repo.namespace.as_deref().unwrap_or("default");
                        items.push(SourceSkillItem {
                            id: format!(
                                "{source_id}:skillhub:{}:{}",
                                publisher.id, ns
                            ),
                            slug: format!("skillhub:{base}:{ns}"),
                            name: format!("{} (SkillHub)", publisher.name),
                            description: Some(format!(
                                "{count} 个技能 · 自托管 SkillHub: {base}"
                            )),
                            author: Some(publisher.name.clone()),
                            author_avatar: publisher.avatar_url.clone(),
                            stars: None,
                            downloads: None,
                            forks: None,
                            version: None,
                            category: None,
                            tags: vec![],
                            source_id: source_id.to_string(),
                            requires_api_key: false,
                            github_url: None,
                        });
                    }
                }
                _ => {}
            }
        }
    }

    Ok(SourceSkillPage {
        items,
        total: Some(total),
        has_more: false,
        next_cursor: None,
    })
}

// ── ZIP 下载安装（SkillHub / ClawHub 共用）─────────────────────────────────

async fn download_and_install_zip(
    client: &reqwest::Client,
    url: &str,
    slug: &str,
    overwrite: bool,
    central_dir: &PathBuf,
) -> Result<String, String> {
    let dst = central_dir.join(slug);

    if dst.exists() {
        if !overwrite {
            return Err(format!(
                "Skill '{slug}' already exists. Set overwrite=true to replace."
            ));
        }
        fs::remove_dir_all(&dst)
            .map_err(|e| format!("Failed to remove existing skill: {e}"))?;
    }

    // 下载 ZIP 到临时文件
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let tmp_path =
        std::env::temp_dir().join(format!("skillshub-dl-{slug}-{ts}.zip"));

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Download HTTP {}: {url}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Read response error: {e}"))?;

    fs::write(&tmp_path, &bytes)
        .map_err(|e| format!("Write temp file error: {e}"))?;

    // 检测 ZIP 内是否有单一顶层目录（如 my-skill-1.0.0/）
    let top_dir_name: Option<String> = {
        let f = fs::File::open(&tmp_path)
            .map_err(|e| format!("Open zip error: {e}"))?;
        let mut archive =
            zip::ZipArchive::new(f).map_err(|e| format!("Parse zip error: {e}"))?;
        let top_dirs: HashSet<String> = (0..archive.len())
            .filter_map(|i| {
                archive.by_index(i).ok().and_then(|entry| {
                    entry
                        .name()
                        .split('/')
                        .next()
                        .filter(|s| !s.is_empty() && !s.contains('.'))
                        .map(|s| s.to_string())
                })
            })
            .collect();
        if top_dirs.len() == 1 {
            top_dirs.into_iter().next()
        } else {
            None
        }
    };

    // 解压
    fs::create_dir_all(&dst).map_err(|e| format!("Create dir error: {e}"))?;

    let f2 = fs::File::open(&tmp_path)
        .map_err(|e| format!("Reopen zip error: {e}"))?;
    let mut archive2 =
        zip::ZipArchive::new(f2).map_err(|e| format!("Reparse zip error: {e}"))?;

    for i in 0..archive2.len() {
        let mut entry = archive2
            .by_index(i)
            .map_err(|e| format!("Zip entry error: {e}"))?;
        let raw_name = entry.name().to_string();

        // 剥离顶层目录前缀，让技能文件直接放到 {slug}/ 下
        let relative = if let Some(ref td) = top_dir_name {
            let prefix = format!("{td}/");
            raw_name
                .strip_prefix(&prefix)
                .unwrap_or(&raw_name)
                .to_string()
        } else {
            raw_name
        };

        if relative.is_empty() {
            continue;
        }

        let out_path = dst.join(&relative);

        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Create subdir error: {e}"))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Create parent dir error: {e}"))?;
            }
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("Read zip entry error: {e}"))?;
            fs::write(&out_path, &buf)
                .map_err(|e| format!("Write file error: {e}"))?;
        }
    }

    // 清理临时文件
    let _ = fs::remove_file(&tmp_path);

    Ok(slug.to_string())
}

/// 根据 source_type 写入正确的 source 到 SKILL.md frontmatter
fn source_label_for(source_type: &str) -> &'static str {
    match source_type {
        "skillhub" => "skillhub",
        "clawhub" => "clawhub",
        _ => "marketplace",
    }
}
