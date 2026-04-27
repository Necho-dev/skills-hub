import { create } from 'zustand';
import { getAppSetting, setAppSetting } from '@/lib/db';
import { invoke } from '@tauri-apps/api/core';

/** 存储格式：$HOME/...（与 Rust expand_home 一致） */
const DEFAULT_CENTRAL_DIR = '$HOME/.skillshub/skills';

/** 旧版默认路径，用于检测是否需要迁移引导 */
const LEGACY_CENTRAL_DIR = '$HOME/.agent/skills';

/** 将 $HOME 替换为 ~ 供 UI 展示 */
export function contractToDisplay(p: string): string {
  return p.replace('$HOME', '~');
}

/** 将 ~ 或其他格式规范化为 $HOME/...（供 Rust 使用） */
export function normalizeToStorage(p: string): string {
  const trimmed = p.trim();
  if (trimmed.startsWith('~/')) return trimmed.replace('~/', '$HOME/');
  if (trimmed === '~') return '$HOME';
  return trimmed;
}

interface SettingsState {
  /** $HOME/... 格式，直接传给 Rust 命令 */
  centralDir: string;
  /** ~ 格式，供 UI 展示 */
  centralDirDisplay: string;
  /**
   * 首次启动检测结果：
   * - null  = 尚未检测或无需处理
   * - 'migrate' = 旧目录 (~/.agent/skills) 存在，引导用户迁移
   */
  setupAction: 'migrate' | null;
  /** 从 app_settings 加载，无值时写入默认值；同时进行旧路径检测 */
  loadCentralDir: () => Promise<void>;
  /** 更新路径：接受 ~ 或 $HOME 格式，规范化后写入 DB */
  setCentralDir: (path: string) => Promise<void>;
  /** 用户已确认/完成引导，写入标记，清除 setupAction。keepLegacy=true 时保留旧路径 */
  confirmSetup: (keepLegacy?: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  centralDir: DEFAULT_CENTRAL_DIR,
  centralDirDisplay: contractToDisplay(DEFAULT_CENTRAL_DIR),
  setupAction: null,

  loadCentralDir: async () => {
    try {
      // 1. 检查是否已完成初始化确认
      const confirmed = await getAppSetting('central_dir_confirmed');

      // 2. 读取或初始化 central_dir
      let stored = await getAppSetting('central_dir');
      if (!stored) {
        stored = DEFAULT_CENTRAL_DIR;
        await setAppSetting('central_dir', stored);
      }

      set({
        centralDir: stored,
        centralDirDisplay: contractToDisplay(stored),
      });

      // 3. 若已确认，直接返回，不再检测
      if (confirmed) return;

      // 4. 检测旧路径是否存在（~/.agent/skills）
      let legacyExists = false;
      try {
        legacyExists = await invoke<boolean>('check_path_exists', { path: LEGACY_CENTRAL_DIR });
      } catch {
        // 检测失败时静默跳过，不阻塞启动
      }

      if (legacyExists) {
        set({ setupAction: 'migrate' });
      } else {
        // 旧路径不存在，直接视为已确认（全新安装）
        await setAppSetting('central_dir_confirmed', '1');
      }
    } catch {
      // DB 尚未初始化时使用默认值，不阻塞启动
      set({
        centralDir: DEFAULT_CENTRAL_DIR,
        centralDirDisplay: contractToDisplay(DEFAULT_CENTRAL_DIR),
      });
    }
  },

  setCentralDir: async (path: string) => {
    const normalized = normalizeToStorage(path);
    await setAppSetting('central_dir', normalized);
    set({
      centralDir: normalized,
      centralDirDisplay: contractToDisplay(normalized),
    });
  },

  confirmSetup: async (keepLegacy = false) => {
    if (keepLegacy) {
      // 用户选择继续使用旧路径：将旧路径写入 central_dir 并确认
      await setAppSetting('central_dir', LEGACY_CENTRAL_DIR);
      await setAppSetting('central_dir_confirmed', '1');
      set({
        centralDir: LEGACY_CENTRAL_DIR,
        centralDirDisplay: contractToDisplay(LEGACY_CENTRAL_DIR),
        setupAction: null,
      });
    } else {
      // 其他情况（使用新路径 / 迁移完成）：若 centralDir 仍是旧路径则重置为默认
      const { centralDir } = get();
      if (centralDir === LEGACY_CENTRAL_DIR) {
        await setAppSetting('central_dir', DEFAULT_CENTRAL_DIR);
        set({
          centralDir: DEFAULT_CENTRAL_DIR,
          centralDirDisplay: contractToDisplay(DEFAULT_CENTRAL_DIR),
        });
      }
      await setAppSetting('central_dir_confirmed', '1');
      set({ setupAction: null });
    }
  },
}));
