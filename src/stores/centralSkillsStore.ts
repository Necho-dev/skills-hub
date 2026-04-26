import { create } from 'zustand';
import type { SkillWithInstalls, InstallResult } from '@/types';
import { scanCentralSkills, installSkillToPlatform, uninstallSkillFromPlatform, deleteSkill, getSkillMarkdown } from '@/lib/tauri';
import {
  getPlatforms,
  upsertInstall,
  removeInstall,
  removeAllInstalls,
  deleteSkillMeta,
  upsertSkillMeta,
  getInstallsForSkill,
  getAutoDeployRules,
} from '@/lib/db';
import { usePlatformStore } from '@/stores/platformStore';

interface CentralSkillsState {
  skills: SkillWithInstalls[];
  selectedSkillId: string | null;
  markdown: string | null;
  markdownLoading: boolean;
  loading: boolean;
  error: string | null;
  platformInstalls: Record<string, string[]>;

  load: () => Promise<void>;
  selectSkill: (skillId: string | null) => Promise<void>;
  installToPlatform: (skillId: string, platformId: string, platformPath: string, overwrite?: boolean) => Promise<InstallResult>;
  uninstallFromPlatform: (skillId: string, platformId: string, platformPath: string) => Promise<InstallResult>;
  removeSkill: (skillId: string) => Promise<void>;
}

export const useCentralSkillsStore = create<CentralSkillsState>((set, get) => ({
  skills: [],
  selectedSkillId: null,
  markdown: null,
  markdownLoading: false,
  loading: false,
  error: null,
  platformInstalls: {},

  load: async () => {
    set({ loading: true, error: null });
    try {
      // 1. 从 DB 获取所有启用平台（含路径）
      const platforms = await getPlatforms();
      const platformArgs = platforms.map((p) => ({ id: p.id, path: p.skills_path }));

      // 2. Rust 扫描文件系统，同时检测 symlink（返回的 installs 已包含文件系统结果）
      const skillsWithInstalls = await scanCentralSkills(platformArgs);

      // 3. 对每个 skill：合并 DB installs 记录与文件系统检测结果，以文件系统为准
      const platformInstalls: Record<string, string[]> = {};
      for (const sw of skillsWithInstalls) {
        // 先确保 skills 表中存在该记录（installs 有外键约束依赖它）
        await upsertSkillMeta(sw.skill);

        const fsInstalls = sw.installs;
        const dbInstalls = await getInstallsForSkill(sw.skill.id);

        // 清理 DB 中文件系统已不存在的脏数据
        for (const pid of dbInstalls) {
          if (!fsInstalls.includes(pid)) {
            await removeInstall(sw.skill.id, pid);
          }
        }
        // 补写文件系统有但 DB 没有的记录（如手动放 symlink 的情况）
        for (const pid of fsInstalls) {
          if (!dbInstalls.includes(pid)) {
            const p = platforms.find((pl) => pl.id === pid);
            if (p) {
              await upsertInstall(sw.skill.id, pid, `${p.skills_path}/${sw.skill.id}`);
            }
          }
        }

        platformInstalls[sw.skill.id] = fsInstalls; // 以文件系统为最终真相
      }

      set({ skills: skillsWithInstalls, platformInstalls, loading: false });

      // 4. 触发自动分发：读取启用规则，对未分发的技能执行分发
      const rules = await getAutoDeployRules();
      const enabledRules = rules.filter((r) => r.enabled);
      if (enabledRules.length > 0) {
        const { installToPlatform } = get();
        for (const sw of skillsWithInstalls) {
          const currentInstalls = platformInstalls[sw.skill.id] ?? [];
          for (const rule of enabledRules) {
            const targets =
              rule.platform_id === 'all'
                ? platforms
                : platforms.filter((p) => p.id === rule.platform_id);
            for (const p of targets) {
              if (!currentInstalls.includes(p.id)) {
                await installToPlatform(sw.skill.id, p.id, p.skills_path);
              }
            }
          }
        }
      }
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectSkill: async (skillId) => {
    set({ selectedSkillId: skillId, markdown: null });
    if (!skillId) return;
    set({ markdownLoading: true });
    try {
      const md = await getSkillMarkdown(skillId);
      set({ markdown: md, markdownLoading: false });
    } catch {
      set({ markdown: null, markdownLoading: false });
    }
  },

  installToPlatform: async (skillId, platformId, platformPath, overwrite = false) => {
    // 确保 skills 表有该记录，防止 installs 外键约束失败
    const skillData = get().skills.find((sw) => sw.skill.id === skillId);
    if (skillData) {
      await upsertSkillMeta(skillData.skill);
    }
    const result = await installSkillToPlatform(skillId, platformPath, overwrite);
    if (result.success) {
      await upsertInstall(skillId, platformId, `${platformPath}/${skillId}`);
      set((state) => ({
        platformInstalls: {
          ...state.platformInstalls,
          [skillId]: [...new Set([...(state.platformInstalls[skillId] ?? []), platformId])],
        },
      }));
      // 同步刷新侧边栏平台统计
      void usePlatformStore.getState().load();
    }
    return result;
  },

  uninstallFromPlatform: async (skillId, platformId, platformPath) => {
    const result = await uninstallSkillFromPlatform(skillId, platformPath);
    if (result.success) {
      await removeInstall(skillId, platformId);
      set((state) => ({
        platformInstalls: {
          ...state.platformInstalls,
          [skillId]: (state.platformInstalls[skillId] ?? []).filter((p) => p !== platformId),
        },
      }));
      // 同步刷新侧边栏平台统计
      void usePlatformStore.getState().load();
    }
    return result;
  },

  removeSkill: async (skillId) => {
    const platforms = await getPlatforms();
    const platformPaths = platforms.map((p) => p.skills_path);
    await deleteSkill(skillId, platformPaths);
    await removeAllInstalls(skillId);
    await deleteSkillMeta(skillId);
    set((state) => ({
      skills: state.skills.filter((s) => s.skill.id !== skillId),
      selectedSkillId: state.selectedSkillId === skillId ? null : state.selectedSkillId,
    }));
  },
}));
