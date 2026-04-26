import { create } from 'zustand';
import type { ProjectGroup } from '@/types';
import { scanProjectDirs } from '@/lib/tauri';
import { getScanPaths } from '@/lib/db';

interface ProjectSkillsState {
  groups: ProjectGroup[];
  selectedProject: string | null;
  hasScanned: boolean;
  loading: boolean;
  error: string | null;

  scan: (force?: boolean) => Promise<void>;
  selectProject: (projectPath: string | null) => void;
}

export const useProjectSkillsStore = create<ProjectSkillsState>((set, get) => ({
  groups: [],
  selectedProject: null,
  hasScanned: false,
  loading: false,
  error: null,

  scan: async (force = false) => {
    // 已扫描过且非强制，直接跳过（避免每次切换页面都重复扫）
    if (!force && get().hasScanned) return;
    set({ loading: true, error: null });
    try {
      const paths = await getScanPaths();
      const enabledPaths = paths.map((p) => p.path);
      const groups = await scanProjectDirs(enabledPaths);
      set({ groups, loading: false, hasScanned: true });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectProject: (projectPath) => set({ selectedProject: projectPath }),
}));
