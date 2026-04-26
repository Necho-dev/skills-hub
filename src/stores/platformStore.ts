import { create } from 'zustand';
import type { Platform } from '@/types';
import { getPlatforms, getGroupOrders } from '@/lib/db';
import { countPlatformSkills } from '@/lib/tauri';

interface GroupOrder {
  group_name: string;
  sort_order: number;
}

interface PlatformState {
  platforms: Platform[];
  skillCounts: Record<string, number>;
  groupOrders: GroupOrder[];
  load: () => Promise<void>;
}

export const usePlatformStore = create<PlatformState>((set) => ({
  platforms: [],
  skillCounts: {},
  groupOrders: [],
  load: async () => {
    const [platforms, groupOrders] = await Promise.all([
      getPlatforms(),
      getGroupOrders(),
    ]);
    const platformArgs = platforms.map((p) => ({ id: p.id, path: p.skills_path }));
    const skillCounts = await countPlatformSkills(platformArgs);
    set({ platforms, skillCounts, groupOrders });
  },
}));
