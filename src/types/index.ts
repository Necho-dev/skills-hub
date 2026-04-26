export type SkillSource = 'local' | 'skillhub' | 'clawhub' | 'github' | 'marketplace';

export interface Skill {
  id: string;
  name: string;
  description?: string;
  path: string;
  version?: string;
  source: SkillSource;
  source_url?: string;
  author?: string;
  publisher_id?: string;
  tags: string;
  installed_at: number;
  updated_at: number;
}

export interface SkillWithInstalls {
  skill: Skill;
  installs: string[];
}

export interface Platform {
  id: string;
  name: string;
  icon?: string;
  skills_path: string;
  group_label?: string;
  sort_order: number;
  enabled: number;
}

export interface Install {
  skill_id: string;
  platform_id: string;
  symlink_path: string;
  created_at: number;
}

export interface ProjectSkill {
  id: string;
  name: string;
  description?: string;
  path: string;
  project_name: string;
  project_path: string;
  platform_hint?: string;
}

export interface ProjectGroup {
  project_name: string;
  project_path: string;
  skills: ProjectSkill[];
}

export interface ConflictInfo {
  skill_id: string;
  platform_id: string;
  existing_target?: string;
  conflict_type: string;
}

export interface InstallResult {
  skill_id: string;
  platform_id: string;
  success: boolean;
  error?: string;
}

export interface Publisher {
  id: string;
  name: string;
  avatar_url?: string;
  skill_count: number;
  repo_count: number;
  repos: PublisherRepo[];
}

export interface PublisherRepo {
  repo: string;
  skills_root: string;
  skill_count: number;
}

export interface ImportPreviewItem {
  id: string;
  name: string;
  description?: string;
  path: string;
  repo_path: string;
  conflict?: string;
  action: 'import' | 'skip' | 'overwrite';
}

export interface ImportProgress {
  total: number;
  current: number;
  current_skill: string;
  status: 'cloning' | 'installing' | 'done' | 'error';
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  created_at: number;
  updated_at: number;
}

export interface CollectionSkillRow {
  collection_id: string;
  skill_id: string;
  added_at: number;
}

export type NavPage = 'central' | 'projects' | 'marketplace' | 'collections' | 'settings';

// ── Marketplace 多数据源 ────────────────────────────────────────────────────

export type SourceType = 'official_registry' | 'skillhub' | 'clawhub' | 'skillsmp';

export interface SourceConfig {
  id: string;
  name: string;
  type: SourceType;
  base_url: string;
  enabled: boolean;
  is_builtin: boolean;
  sort_order: number;
}

export interface SourceSkillItem {
  id: string;
  slug: string;
  name: string;
  description?: string;
  author?: string;
  author_avatar?: string;
  stars?: number;
  downloads?: number;
  forks?: number;
  version?: string;
  category?: string;
  tags: string[];
  source_id: string;
  requires_api_key: boolean;
  /** Skillsmp 专用：原始 githubUrl，用于 ImportWizard 安装 */
  github_url?: string;
}

export interface SkillHubDetail {
  skill: {
    summary?: string;
    summary_zh?: string;
    stats: { downloads: number; stars: number; installs: number };
  };
  latestVersion?: { version: string; changelog: string };
  securityReports?: {
    keen?: { status: string; statusText: string; reportUrl: string };
    sanbu?: { status: string; statusText: string; reportUrl: string };
  };
  owner: { displayName: string; image?: string };
}

export interface SourceSkillPage {
  items: SourceSkillItem[];
  total?: number;
  has_more: boolean;
  next_cursor?: string;
}

// ── Install task queue ───────────────────────────────────────────────────────

/** 平台目录中未纳入中央库管理的原生技能，用于扫描迁移流程 */
export interface NativeSkill {
  skillId: string;
  skillName: string;
  description?: string;
  /** 原始绝对路径（已展开 $HOME） */
  sourcePath: string;
  platformId: string;
  platformName: string;
  /** 所属平台的技能根目录，用于迁移时确定 symlink 创建位置 */
  platformSkillsPath: string;
}

export type InstallTaskStatus = 'pending' | 'installing' | 'done' | 'error';

export interface InstallTask {
  id: string;
  name: string;
  slug: string;
  sourceType: string;
  baseUrl: string;
  overwrite?: boolean;
  status: InstallTaskStatus;
  error?: string;
  // 完整元数据，安装完成后写入 frontmatter 和 DB
  meta?: {
    version?: string;
    author?: string;
    source_url?: string;
    description?: string;
    tags?: string[];
  };
}
