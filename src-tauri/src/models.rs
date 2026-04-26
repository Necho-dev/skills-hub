use serde::{Deserialize, Serialize};

// ── Marketplace 多数据源 ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct SourceConfig {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub source_type: String,
    pub base_url: String,
    pub enabled: bool,
    pub is_builtin: bool,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSkillItem {
    pub id: String,
    pub slug: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_avatar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stars: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downloads: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forks: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub source_id: String,
    pub requires_api_key: bool,
    /// Skillsmp 专用：原始 githubUrl，用于 ImportWizard 安装
    #[serde(skip_serializing_if = "Option::is_none")]
    pub github_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSkillPage {
    pub items: Vec<SourceSkillItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    pub has_more: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub version: Option<String>,
    pub source: String,
    pub source_url: Option<String>,
    pub author: Option<String>,
    pub publisher_id: Option<String>,
    pub tags: String,
    pub installed_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillWithInstalls {
    pub skill: Skill,
    pub installs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFrontmatter {
    pub name: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub tags: Option<Vec<String>>,
    pub source: Option<String>,
    pub source_url: Option<String>,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSkill {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub project_name: String,
    pub project_path: String,
    pub platform_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectGroup {
    pub project_name: String,
    pub project_path: String,
    pub skills: Vec<ProjectSkill>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictInfo {
    pub skill_id: String,
    pub platform_id: String,
    pub existing_target: Option<String>,
    pub conflict_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallResult {
    pub skill_id: String,
    pub platform_id: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Publisher {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub skill_count: i64,
    pub repo_count: i64,
    pub repos: Vec<PublisherRepo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublisherRepo {
    pub repo: String,
    pub skills_root: String,
    pub skill_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreviewItem {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub repo_path: String,
    pub conflict: Option<String>,
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProgress {
    pub total: usize,
    pub current: usize,
    pub current_skill: String,
    pub status: String,
}

/// 平台目录中未纳入中央库管理的原生技能（用于扫描迁移流程）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSkill {
    pub skill_id: String,
    pub skill_name: String,
    pub description: Option<String>,
    /// 原始绝对路径（已展开 $HOME）
    pub source_path: String,
    pub platform_id: String,
    pub platform_name: String,
    /// 所属平台的技能根目录（用于迁移时确定 symlink 创建位置）
    pub platform_skills_path: String,
}

/// 携带 name 的平台信息（scan_platform_native_skills 专用，不影响已有 PlatformInfo 调用点）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfoFull {
    pub id: String,
    pub path: String,
    pub name: String,
}
