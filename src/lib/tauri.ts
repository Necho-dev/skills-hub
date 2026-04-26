import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  SkillWithInstalls,
  ProjectGroup,
  InstallResult,
  Publisher,
  ImportPreviewItem,
  ImportProgress,
  ConflictInfo,
  Skill,
  SourceSkillPage,
  SkillHubDetail,
  NativeSkill,
} from '@/types';

// Skills
export const scanCentralSkills = (
  platformPaths: { id: string; path: string }[]
): Promise<SkillWithInstalls[]> =>
  invoke('scan_central_skills', { platformPaths });

export const getSkillMarkdown = (skillId: string): Promise<string> =>
  invoke('get_skill_markdown', { skillId });

export const patchSkillMeta = (
  skillId: string,
  meta: Record<string, string>,
): Promise<void> =>
  invoke('patch_skill_meta', { skillId, meta });

export const packSkillToZip = (skillId: string): Promise<string> =>
  invoke('pack_skill_to_zip', { skillId });

export const unpackSkillToCentral = (
  skillId: string,
  zipB64: string,
  overwrite = false,
): Promise<import('@/types').Skill> =>
  invoke('unpack_skill_to_central', { skillId, zipB64, overwrite });

export const countPlatformSkills = (
  platformPaths: { id: string; path: string }[]
): Promise<Record<string, number>> =>
  invoke('count_platform_skills', { platformPaths });

export const checkSymlinkConflict = (
  skillId: string,
  platformId: string,
  platformPath: string
): Promise<ConflictInfo | null> =>
  invoke('check_symlink_conflict', { skillId, platformId, platformPath });

export const installSkillToPlatform = (
  skillId: string,
  platformPath: string,
  overwrite = false
): Promise<InstallResult> =>
  invoke('install_skill_to_platform', { skillId, platformPath, overwrite });

export const uninstallSkillFromPlatform = (
  skillId: string,
  platformPath: string
): Promise<InstallResult> =>
  invoke('uninstall_skill_from_platform', { skillId, platformPath });

export const deleteSkill = (
  skillId: string,
  platformPaths: string[]
): Promise<boolean> =>
  invoke('delete_skill', { skillId, platformPaths });

export const getInstalledPlatforms = (skillId: string): Promise<string[]> =>
  invoke('get_installed_platforms', { skillId });

export const initCentralDir = (): Promise<boolean> =>
  invoke('init_central_dir');

export const revealInFinder = (path: string): Promise<void> =>
  invoke('reveal_in_finder', { path });

export const importSkillToCentral = (
  sourcePath: string,
  skillIdOverride?: string,
  overwrite = false
): Promise<Skill> =>
  invoke('import_skill_to_central', { sourcePath, skillIdOverride, overwrite });

// Projects
export const scanProjectDirs = (paths: string[]): Promise<ProjectGroup[]> =>
  invoke('scan_project_dirs', { paths });

// GitHub / Marketplace (legacy registry)
export const fetchMarketplacePublishers = (
  registryUrl?: string,
  githubToken?: string
): Promise<Publisher[]> =>
  invoke('fetch_marketplace_publishers', { registryUrl, githubToken });

export const previewGithubImport = (
  repo: string,
  skillsRoot: string,
  githubToken?: string
): Promise<ImportPreviewItem[]> =>
  invoke('preview_github_import', { repo, skillsRoot, githubToken });

export const executeGithubImport = (
  repo: string,
  skillsRoot: string,
  items: ImportPreviewItem[],
  githubToken?: string
): Promise<{ skill_id: string; success: boolean; error?: string }[]> =>
  invoke('execute_github_import', { repo, skillsRoot, items, githubToken });

export const onImportProgress = (
  cb: (progress: ImportProgress) => void
) => listen<ImportProgress>('import_progress', (e) => cb(e.payload));

// Marketplace Sources (multi-source)
export const fetchSourceSkills = (
  sourceId: string,
  sourceType: string,
  baseUrl: string,
  query?: string,
  cursor?: string,
): Promise<SourceSkillPage> =>
  invoke('fetch_source_skills', { sourceId, sourceType, baseUrl, query, cursor });

export const fetchSkillDetail = (
  sourceType: string,
  baseUrl: string,
  slug: string,
): Promise<SkillHubDetail | null> =>
  invoke('fetch_skill_detail', { sourceType, baseUrl, slug });

export const downloadSourceSkill = (
  sourceType: string,
  baseUrl: string,
  slug: string,
  overwrite = false,
): Promise<string> =>
  invoke('download_source_skill', { sourceType, baseUrl, slug, overwrite });

// Collections
export const batchInstallCollection = (
  skillIds: string[],
  platformPaths: string[],
  overwrite = false
): Promise<InstallResult[]> =>
  invoke('batch_install_collection', { skillIds, platformPaths, overwrite });

export const getPlatformPaths = (): Promise<
  { id: string; name: string; path: string }[]
> => invoke('get_platform_paths');

// ── 技能集合格式（.skillcol）─────────────────────────────────────────────────
// 格式：SKILLCOL1.<Base64(UTF-8 JSON)>.<4字节校验和 hex>
// 导入时严格校验 magic header + 校验和，拒绝任何非 .skillcol 文件或被篡改的内容

const SKILLCOL_MAGIC = 'SKILLCOL1';

export function encodeSkillCol(data: object): string {
  const json = JSON.stringify(data);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  let checksum = 0;
  for (let i = 0; i < encoded.length; i++) {
    checksum = (checksum + encoded.charCodeAt(i)) & 0xFFFF;
  }
  const checksumHex = checksum.toString(16).padStart(4, '0');
  return `${SKILLCOL_MAGIC}.${encoded}.${checksumHex}`;
}

export function decodeSkillCol(raw: string): object {
  const trimmed = raw.trim();
  // 严格要求 magic header，拒绝旧版 JSON 及任何其他格式
  if (!trimmed.startsWith(`${SKILLCOL_MAGIC}.`)) {
    throw new Error('不是有效的 .skillcol 文件，请通过「导出技能集」生成正确格式');
  }
  // 结构：SKILLCOL1.<encoded>.<checksum4hex>
  const withoutMagic = trimmed.slice(SKILLCOL_MAGIC.length + 1); // 去掉 "SKILLCOL1."
  const lastDot = withoutMagic.lastIndexOf('.');
  if (lastDot === -1) {
    throw new Error('文件结构损坏：缺少校验和');
  }
  const encoded = withoutMagic.slice(0, lastDot);
  const checksumHex = withoutMagic.slice(lastDot + 1);
  if (!/^[0-9a-f]{4}$/.test(checksumHex)) {
    throw new Error('文件结构损坏：校验和格式无效');
  }
  // 验证校验和，防止文件被篡改
  let checksum = 0;
  for (let i = 0; i < encoded.length; i++) {
    checksum = (checksum + encoded.charCodeAt(i)) & 0xFFFF;
  }
  if (checksum.toString(16).padStart(4, '0') !== checksumHex) {
    throw new Error('文件校验失败：内容已被篡改或损坏，拒绝导入');
  }
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json);
  } catch {
    throw new Error('文件内容解码失败：数据已损坏');
  }
}

// ── 本地平台技能扫描与迁移 ────────────────────────────────────────────────────

/** 扫描已启用平台目录，返回未被中央库管理的原生技能列表 */
export const scanPlatformNativeSkills = (
  platformPaths: { id: string; path: string; name: string }[]
): Promise<NativeSkill[]> =>
  invoke('scan_platform_native_skills', { platformPaths });

/** 迁移模式：移动技能目录到中央库，原位置创建指向中央库的 symlink */
export const moveSkillToCentral = (
  sourcePath: string,
  platformSkillsPath: string,
  skillIdOverride?: string,
  overwrite = false,
): Promise<Skill> =>
  invoke('move_skill_to_central', { sourcePath, platformSkillsPath, skillIdOverride, overwrite });

/** 链接模式：技能真相保留在项目目录，中央库创建指向它的 symlink */
export const linkProjectSkillToCentral = (
  sourcePath: string,
  skillIdOverride?: string,
  overwrite = false,
): Promise<Skill> =>
  invoke('link_project_skill_to_central', { sourcePath, skillIdOverride, overwrite });

export async function exportCollectionToFile(
  defaultFilename: string,
  content: string,
): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');

  const savePath = await save({
    defaultPath: defaultFilename,
    filters: [{ name: '技能集合', extensions: ['skillcol'] }],
  });

  if (!savePath) return null;

  await writeTextFile(savePath, content);
  return savePath;
}
