import Database from '@tauri-apps/plugin-sql';
import type { Platform, Collection, Skill, SourceConfig, SourceType } from '@/types';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:skillshub.db');
    // WAL 模式必须在事务外执行，不能放迁移文件内
    await db.execute('PRAGMA journal_mode=WAL');
    await db.execute('PRAGMA foreign_keys=ON');
    await db.execute('PRAGMA synchronous=NORMAL');
    // 兜底：对已有数据库补建新表（迁移系统只在首次创建时运行）
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auto_deploy_rules (
        id TEXT PRIMARY KEY,
        platform_id TEXT NOT NULL UNIQUE,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL
      )
    `);
    // 兜底：将旧分类名更新为新分类名（迁移文件 0008 的等效操作）
    await db.execute(`UPDATE platforms SET group_label = '编程类' WHERE group_label = 'AI 编辑器'`);
    await db.execute(`UPDATE platforms SET group_label = 'CLI 类'  WHERE group_label = 'AI 助手'`);
    // 兜底：app_settings 表（迁移 0012）
    await db.execute(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  }
  return db;
}

// ── Platforms ──────────────────────────────────────────────────────────
export async function getPlatforms(): Promise<Platform[]> {
  const d = await getDb();
  return d.select<Platform[]>('SELECT * FROM platforms WHERE enabled = 1 ORDER BY sort_order');
}

export async function getAllPlatforms(): Promise<Platform[]> {
  const d = await getDb();
  return d.select<Platform[]>('SELECT * FROM platforms ORDER BY sort_order');
}

export async function addPlatform(p: Omit<Platform, 'enabled'>): Promise<void> {
  const d = await getDb();
  const rows = await d.select<{ max_order: number }[]>(
    'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM platforms'
  );
  const nextOrder = (rows[0]?.max_order ?? 0) + 1;
  await d.execute(
    `INSERT OR IGNORE INTO platforms (id, name, icon, skills_path, group_label, sort_order, enabled)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [p.id, p.name, p.icon ?? null, p.skills_path, p.group_label ?? null, p.sort_order ?? nextOrder]
  );
}

export async function togglePlatform(id: string, enabled: boolean): Promise<void> {
  const d = await getDb();
  await d.execute('UPDATE platforms SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
}

export async function deletePlatform(id: string): Promise<void> {
  const d = await getDb();
  // Prevent deleting built-in platforms (those seeded without is_custom flag)
  // We identify custom platforms as those whose id is not in the original seed list
  const builtinIds = [
          'cursor', 'claude-code', 'codex-cli', 'gemini-cli',
            'trae', 'trae-cn', 'windsurf', 'qoder', 'codebuddy',
            'qwen', 'opencode', 'kiro', 'hermes',
  ];
  if (builtinIds.includes(id)) return;
  await d.execute('DELETE FROM platforms WHERE id = ?', [id]);
}

export async function updatePlatformGroup(platformId: string, groupLabel: string): Promise<void> {
  const d = await getDb();
  await d.execute('UPDATE platforms SET group_label = ? WHERE id = ?', [groupLabel, platformId]);
}

export async function getPlatformGroups(): Promise<string[]> {
  const d = await getDb();
  const rows = await d.select<{ group_label: string }[]>(
    `SELECT DISTINCT group_label FROM platforms WHERE group_label IS NOT NULL AND group_label != '' ORDER BY group_label`
  );
  return rows.map((r) => r.group_label);
}

export async function getGroupOrders(): Promise<{ group_name: string; sort_order: number }[]> {
  const d = await getDb();
  // 兜底：确保表存在（旧数据库没有运行迁移时）
  await d.execute(`
    CREATE TABLE IF NOT EXISTS platform_group_orders (
      group_name TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await d.execute(`INSERT OR IGNORE INTO platform_group_orders (group_name, sort_order) VALUES ('编程类', 0), ('CLI 类', 1), ('自定义平台', 2), ('其他', 99)`);
  return d.select<{ group_name: string; sort_order: number }[]>(
    'SELECT group_name, sort_order FROM platform_group_orders ORDER BY sort_order'
  );
}

export async function upsertGroupOrder(groupName: string, sortOrder: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO platform_group_orders (group_name, sort_order) VALUES (?, ?)
     ON CONFLICT(group_name) DO UPDATE SET sort_order = excluded.sort_order`,
    [groupName, sortOrder]
  );
}

export async function updatePlatformSortOrder(platformId: string, sortOrder: number): Promise<void> {
  const d = await getDb();
  await d.execute('UPDATE platforms SET sort_order = ? WHERE id = ?', [sortOrder, platformId]);
}

export async function batchUpdatePlatformSortOrder(items: { id: string; sort_order: number }[]): Promise<void> {
  const d = await getDb();
  for (const item of items) {
    await d.execute('UPDATE platforms SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
  }
}

export async function getPlatformSkillCounts(): Promise<Record<string, number>> {
  const d = await getDb();
  const rows = await d.select<{ platform_id: string; cnt: number }[]>(
    'SELECT platform_id, COUNT(*) as cnt FROM installs GROUP BY platform_id'
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.platform_id] = r.cnt;
  return map;
}

// ── Installs ───────────────────────────────────────────────────────────
export async function getInstallsForSkill(skillId: string): Promise<string[]> {
  const d = await getDb();
  const rows = await d.select<{ platform_id: string }[]>(
    'SELECT platform_id FROM installs WHERE skill_id = ?',
    [skillId]
  );
  return rows.map((r) => r.platform_id);
}

export async function upsertInstall(
  skillId: string,
  platformId: string,
  symlinkPath: string
): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT OR REPLACE INTO installs (skill_id, platform_id, symlink_path, created_at)
     VALUES (?, ?, ?, ?)`,
    [skillId, platformId, symlinkPath, Math.floor(Date.now() / 1000)]
  );
}

export async function removeInstall(skillId: string, platformId: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    'DELETE FROM installs WHERE skill_id = ? AND platform_id = ?',
    [skillId, platformId]
  );
}

export async function removeAllInstalls(skillId: string): Promise<void> {
  const d = await getDb();
  await d.execute('DELETE FROM installs WHERE skill_id = ?', [skillId]);
}

// ── Skills metadata ────────────────────────────────────────────────────
export async function upsertSkillMeta(skill: Skill): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT OR REPLACE INTO skills
     (id, name, description, path, version, source, source_url, author, publisher_id, tags, installed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      skill.id, skill.name, skill.description ?? null, skill.path,
      skill.version ?? null, skill.source, skill.source_url ?? null,
      skill.author ?? null, skill.publisher_id ?? null, skill.tags,
      skill.installed_at, skill.updated_at,
    ]
  );
}

export async function deleteSkillMeta(skillId: string): Promise<void> {
  const d = await getDb();
  await d.execute('DELETE FROM skills WHERE id = ?', [skillId]);
}

export async function searchSkills(query: string): Promise<Skill[]> {
  if (!query.trim()) return [];
  const d = await getDb();
  return d.select<Skill[]>(
    `SELECT s.* FROM skills s
     JOIN skills_fts f ON s.id = f.id
     WHERE skills_fts MATCH ?
     ORDER BY rank LIMIT 50`,
    [query + '*']
  );
}

// ── Scan paths ─────────────────────────────────────────────────────────
export async function getScanPaths(): Promise<{ id: string; path: string; label?: string; enabled: number }[]> {
  const d = await getDb();
  return d.select('SELECT * FROM scan_paths WHERE enabled = 1');
}

export async function addScanPath(path: string, label?: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    'INSERT OR IGNORE INTO scan_paths (id, path, label, enabled) VALUES (?, ?, ?, 1)',
    [crypto.randomUUID(), path, label ?? null]
  );
}

export async function removeScanPath(id: string): Promise<void> {
  const d = await getDb();
  await d.execute('DELETE FROM scan_paths WHERE id = ?', [id]);
}

// ── Collections ────────────────────────────────────────────────────────
export async function getCollections(): Promise<Collection[]> {
  const d = await getDb();
  return d.select<Collection[]>('SELECT * FROM collections ORDER BY created_at DESC');
}

export async function createCollection(name: string, description?: string): Promise<Collection> {
  const d = await getDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await d.execute(
    'INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, name, description ?? null, now, now]
  );
  return { id, name, description, created_at: now, updated_at: now };
}

export async function updateCollection(id: string, name: string, description?: string): Promise<void> {
  const d = await getDb();
  const now = Math.floor(Date.now() / 1000);
  await d.execute(
    'UPDATE collections SET name = ?, description = ?, updated_at = ? WHERE id = ?',
    [name, description ?? null, now, id]
  );
}

export async function deleteCollection(id: string): Promise<void> {
  const d = await getDb();
  await d.execute('DELETE FROM collections WHERE id = ?', [id]);
}

export async function getCollectionSkills(collectionId: string): Promise<string[]> {
  const d = await getDb();
  const rows = await d.select<{ skill_id: string }[]>(
    'SELECT skill_id FROM collection_skills WHERE collection_id = ? ORDER BY added_at',
    [collectionId]
  );
  return rows.map((r) => r.skill_id);
}

export async function addSkillToCollection(collectionId: string, skillId: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    'INSERT OR IGNORE INTO collection_skills (collection_id, skill_id, added_at) VALUES (?, ?, ?)',
    [collectionId, skillId, Math.floor(Date.now() / 1000)]
  );
}

export async function removeSkillFromCollection(collectionId: string, skillId: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    'DELETE FROM collection_skills WHERE collection_id = ? AND skill_id = ?',
    [collectionId, skillId]
  );
}

// ── Marketplace Sources ─────────────────────────────────────────────────

export async function getMarketplaceSources(): Promise<SourceConfig[]> {
  const d = await getDb();
  const rows = await d.select<{
    id: string;
    name: string;
    type: string;
    base_url: string;
    enabled: number;
    is_builtin: number;
    sort_order: number;
  }[]>('SELECT * FROM marketplace_sources ORDER BY sort_order');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as SourceType,
    base_url: r.base_url,
    enabled: r.enabled !== 0,
    is_builtin: r.is_builtin !== 0,
    sort_order: r.sort_order,
  }));
}

export async function addMarketplaceSource(
  id: string,
  name: string,
  type: SourceType,
  baseUrl: string,
): Promise<void> {
  const d = await getDb();
  const rows = await d.select<{ max_order: number }[]>(
    'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM marketplace_sources'
  );
  const nextOrder = (rows[0]?.max_order ?? 0) + 1;
  await d.execute(
    'INSERT OR IGNORE INTO marketplace_sources (id, name, type, base_url, enabled, is_builtin, sort_order) VALUES (?, ?, ?, ?, 1, 0, ?)',
    [id, name, type, baseUrl, nextOrder]
  );
}

export async function toggleMarketplaceSource(id: string, enabled: boolean): Promise<void> {
  const d = await getDb();
  await d.execute(
    'UPDATE marketplace_sources SET enabled = ? WHERE id = ?',
    [enabled ? 1 : 0, id]
  );
}

export async function deleteMarketplaceSource(id: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    'DELETE FROM marketplace_sources WHERE id = ? AND is_builtin = 0',
    [id]
  );
}

// ── Marketplace cache ──────────────────────────────────────────────────
export async function getMarketplaceCache(key: string): Promise<{ data: string; etag?: string; cached_at: number } | null> {
  const d = await getDb();
  const rows = await d.select<{ data: string; etag?: string; cached_at: number }[]>(
    'SELECT data, etag, cached_at FROM marketplace_cache WHERE key = ?',
    [key]
  );
  return rows[0] ?? null;
}

export async function setMarketplaceCache(key: string, data: string, etag?: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    'INSERT OR REPLACE INTO marketplace_cache (key, data, etag, cached_at) VALUES (?, ?, ?, ?)',
    [key, data, etag ?? null, Math.floor(Date.now() / 1000)]
  );
}

// ── Auto Deploy Rules ──────────────────────────────────────────────────
export interface AutoDeployRule {
  id: string;
  platform_id: string;
  enabled: boolean;
}

export async function getAutoDeployRules(): Promise<AutoDeployRule[]> {
  const d = await getDb();
  const rows = await d.select<{ id: string; platform_id: string; enabled: number }[]>(
    'SELECT id, platform_id, enabled FROM auto_deploy_rules'
  );
  return rows.map((r) => ({ id: r.id, platform_id: r.platform_id, enabled: r.enabled !== 0 }));
}

export async function upsertAutoDeployRule(platformId: string, enabled: boolean): Promise<void> {
  const d = await getDb();
  const now = Math.floor(Date.now() / 1000);
  await d.execute(
    `INSERT INTO auto_deploy_rules (id, platform_id, enabled, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(platform_id) DO UPDATE SET enabled = excluded.enabled`,
    [crypto.randomUUID(), platformId, enabled ? 1 : 0, now]
  );
}

export async function deleteAutoDeployRule(platformId: string): Promise<void> {
  const d = await getDb();
  await d.execute('DELETE FROM auto_deploy_rules WHERE platform_id = ?', [platformId]);
}

// ── App Settings ────────────────────────────────────────────────────────

export async function getAppSetting(key: string): Promise<string | null> {
  const d = await getDb();
  const rows = await d.select<{ value: string }[]>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}
