-- ============================================================
-- SkillsHub 完整初始化 Schema（合并自所有历史迁移）
-- ============================================================

-- ── 表结构 ────────────────────────────────────────────────────

-- 已安装的 skills（中央库）
CREATE TABLE IF NOT EXISTS skills (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  path        TEXT NOT NULL,
  version     TEXT,
  source      TEXT NOT NULL DEFAULT 'local',
  source_url  TEXT,
  publisher_id TEXT,
  tags        TEXT DEFAULT '[]',
  author      TEXT,
  installed_at INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- 平台配置（可扩展）
CREATE TABLE IF NOT EXISTS platforms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  skills_path TEXT NOT NULL,
  group_label TEXT,
  sort_order  INTEGER DEFAULT 0,
  enabled     INTEGER DEFAULT 1
);

-- skill 与平台的分发记录
CREATE TABLE IF NOT EXISTS installs (
  skill_id    TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  platform_id TEXT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  symlink_path TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (skill_id, platform_id)
);

-- 扫描路径配置（项目技能库用）
CREATE TABLE IF NOT EXISTS scan_paths (
  id      TEXT PRIMARY KEY,
  path    TEXT NOT NULL UNIQUE,
  label   TEXT,
  enabled INTEGER DEFAULT 1
);

-- 技能集合
CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_skills (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  skill_id      TEXT NOT NULL,
  added_at      INTEGER NOT NULL,
  PRIMARY KEY (collection_id, skill_id)
);

-- Marketplace 缓存
CREATE TABLE IF NOT EXISTS marketplace_cache (
  key       TEXT PRIMARY KEY,
  data      TEXT NOT NULL,
  etag      TEXT,
  cached_at INTEGER NOT NULL
);

-- Marketplace 数据源配置表
CREATE TABLE IF NOT EXISTS marketplace_sources (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  base_url   TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 自动部署规则
CREATE TABLE IF NOT EXISTS auto_deploy_rules (
  id          TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL UNIQUE,
  enabled     INTEGER DEFAULT 1,
  created_at  INTEGER NOT NULL
);

-- 平台分组排序
CREATE TABLE IF NOT EXISTS platform_group_orders (
  group_name TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 应用设置
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── 全文搜索 ───────────────────────────────────────────────────

CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  id UNINDEXED,
  name,
  description,
  tags,
  content='skills',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, id, name, description, tags)
  VALUES (new.rowid, new.id, new.name, new.description, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, id, name, description, tags)
  VALUES ('delete', old.rowid, old.id, old.name, old.description, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, id, name, description, tags)
  VALUES ('delete', old.rowid, old.id, old.name, old.description, old.tags);
  INSERT INTO skills_fts(rowid, id, name, description, tags)
  VALUES (new.rowid, new.id, new.name, new.description, new.tags);
END;

-- ── 种子数据 ───────────────────────────────────────────────────

-- 默认平台
INSERT OR IGNORE INTO platforms (id, name, icon, skills_path, group_label, sort_order, enabled) VALUES
  ('cursor',     'Cursor',      'cursor',    '$HOME/.cursor/skills',    '编程类',  1,  1),
  ('claude-code','Claude Code', 'claude',    '$HOME/.claude/skills',    'CLI 类',  10, 1),
  ('codex-cli',  'Codex CLI',   'openai',    '$HOME/.codex/skills',     'CLI 类',  11, 1),
  ('gemini-cli', 'Gemini CLI',  'gemini',    '$HOME/.gemini/skills',    'CLI 类',  12, 1),
  ('qwen',       'Qwen',        'qwen',      '$HOME/.qwen/skills',      'CLI 类',  13, 1),
  ('opencode',   'OpenCode',    'opencode',  '$HOME/.opencode/skills',  'CLI 类',  14, 1),
  ('kiro',       'Kiro',        'kiro',      '$HOME/.kiro/skills',      '编程类',  25, 1),
  ('hermes',     'Hermes',      'hermes',    '$HOME/.hermes/skills',    'CLI 类',  16, 1),
  ('trae',       'Trae',        'trae',      '$HOME/.trae/skills',      '编程类',  20, 1),
  ('trae-cn',    'Trae CN',     'trae',      '$HOME/.trae-cn/skills',   '编程类',  21, 1),
  ('windsurf',   'Windsurf',    'windsurf',  '$HOME/.windsurf/skills',  '编程类',  22, 1),
  ('qoder',      'Qoder',       'qoder',     '$HOME/.qoder/skills',     '编程类',  23, 1),
  ('codebuddy',  'CodeBuddy',   'codebuddy', '$HOME/.codebuddy/skills', '编程类',  24, 1);

-- 默认扫描路径
INSERT OR IGNORE INTO scan_paths (id, path, label, enabled) VALUES
  ('home-documents', '$HOME/Documents', 'Documents', 1),
  ('home-projects',  '$HOME/Projects',  'Projects',  1),
  ('home-dev',       '$HOME/dev',       'Dev',        1);

-- 预置内置数据源（不含官方源）
INSERT OR IGNORE INTO marketplace_sources (id, name, type, base_url, enabled, is_builtin, sort_order) VALUES
  ('skillhub', 'SkillHub', 'skillhub',
   'https://api.skillhub.cn', 1, 1, 0),
  ('clawhub', 'ClawHub', 'clawhub',
   'https://wry-manatee-359.convex.cloud', 1, 1, 1),
  ('skillsmp', 'Skillsmp', 'skillsmp',
   'https://skillsmp.com', 1, 1, 2);

-- 预置分组排序
INSERT OR IGNORE INTO platform_group_orders (group_name, sort_order) VALUES
  ('编程类', 0), ('CLI 类', 1), ('自定义平台', 2), ('其他', 99);
