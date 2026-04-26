import { create } from 'zustand';
import type { SourceConfig, SourceSkillItem, SourceSkillPage, ImportPreviewItem, InstallTask, SkillHubDetail } from '@/types';
import { fetchSourceSkills, downloadSourceSkill, previewGithubImport, fetchSkillDetail, patchSkillMeta } from '@/lib/tauri';
import {
  getMarketplaceSources,
  getMarketplaceCache,
  setMarketplaceCache,
  upsertSkillMeta,
} from '@/lib/db';

const CACHE_TTL_SECS = 1800; // 30 分钟
const MAX_CONCURRENT = 3;    // 最大并发安装数

interface SourceState {
  page: SourceSkillPage | null;
  loading: boolean;
  error: string | null;
  cursor: string | undefined;
  loadMoreLoading: boolean;
  searchResults: SourceSkillPage | null;
  searchLoading: boolean;
  searchError: string | null;
}

interface MarketplaceState {
  // 数据源
  sources: SourceConfig[];
  sourcesLoading: boolean;
  activeSourceId: string;

  // 各源独立状态
  sourceStates: Record<string, SourceState>;

  // 搜索
  searchQuery: string;

  // 安装进度（兼容旧逻辑）
  installingSlug: string | null;
  installError: string | null;

  // 安装任务队列
  installQueue: InstallTask[];
  drawerVisible: boolean;

  // 详情面板
  selectedItem: SourceSkillItem | null;
  detailData: SkillHubDetail | null;
  detailLoading: boolean;

  // ImportWizard（保持现有逻辑）
  wizardOpen: boolean;
  wizardStep: 1 | 2 | 3 | 4;
  wizardRepo: string;
  wizardSkillsRoot: string;
  wizardPreviewItems: ImportPreviewItem[];
  wizardPreviewLoading: boolean;

  // Actions
  loadSources: () => Promise<void>;
  setActiveSource: (id: string) => void;
  setSearchQuery: (q: string) => void;
  loadSourceSkills: (sourceId: string, forceRefresh?: boolean) => Promise<void>;
  loadMoreSourceSkills: (sourceId: string) => Promise<void>;
  searchSourceSkills: (sourceId: string, query: string) => Promise<void>;
  setSelectedItem: (item: SourceSkillItem | null) => void;
  installSkill: (item: SourceSkillItem, overwrite?: boolean) => Promise<boolean>;

  // Queue actions
  enqueueInstall: (items: { item: SourceSkillItem; overwrite?: boolean }[]) => void;
  retryTask: (taskId: string) => void;
  clearQueue: () => void;
  hideDrawer: () => void;

  openWizard: (prefillRepo?: string) => void;
  closeWizard: () => void;
  setWizardStep: (step: 1 | 2 | 3 | 4) => void;
  setWizardRepo: (repo: string) => void;
  setWizardSkillsRoot: (root: string) => void;
  fetchWizardPreview: () => Promise<void>;
  setPreviewItemAction: (id: string, action: 'import' | 'skip' | 'overwrite') => void;
}

const defaultSourceState = (): SourceState => ({
  page: null,
  loading: false,
  error: null,
  cursor: undefined,
  loadMoreLoading: false,
  searchResults: null,
  searchLoading: false,
  searchError: null,
});

// ── 元数据写入工具 ────────────────────────────────────────────────────────────

async function applySkillMeta(slug: string, item: SourceSkillItem, sourceType: string, baseUrl: string): Promise<void> {
  // 1. 写入 SKILL.md frontmatter（持久化到文件，重扫时不丢失）
  const frontmatterPatch: Record<string, string> = {};
  if (item.version) frontmatterPatch['version'] = item.version;
  if (item.author) frontmatterPatch['author'] = item.author;
  // source_url：指向原始来源页面，便于后续更新
  const sourceUrl = buildSourceUrl(sourceType, baseUrl, slug, item);
  if (sourceUrl) frontmatterPatch['source_url'] = sourceUrl;

  if (Object.keys(frontmatterPatch).length > 0) {
    try {
      await patchSkillMeta(slug, frontmatterPatch);
    } catch {
      // frontmatter 写失败不阻断流程
    }
  }

  // 2. 写入 DB（供 UI 直接查询，无需等下次扫描）
  const now = Math.floor(Date.now() / 1000);
  const centralPath = `$HOME/.agent/skills/${slug}`;
  try {
    await upsertSkillMeta({
      id: slug,
      name: item.name,
      description: item.description,
      path: centralPath,
      version: item.version,
      source: sourceType as import('@/types').SkillSource,
      source_url: sourceUrl,
      author: item.author,
      publisher_id: item.author,
      tags: JSON.stringify(item.tags ?? []),
      installed_at: now,
      updated_at: now,
    });
  } catch {
    // DB 写失败不阻断流程，下次 load() 扫描时会补写
  }
}

function buildSourceUrl(sourceType: string, baseUrl: string, slug: string, item: SourceSkillItem): string {
  if (item.github_url) return item.github_url;
  switch (sourceType) {
    case 'skillhub': return `${baseUrl}/skill/${slug}`;
    case 'clawhub': return `https://clawhub.ai/skill/${slug}`;
    default: return '';
  }
}

// ── Internal queue processor ─────────────────────────────────────────────────

let processingQueue = false;

async function processQueue(get: () => MarketplaceState, set: (fn: (s: MarketplaceState) => Partial<MarketplaceState>) => void) {
  if (processingQueue) return;
  processingQueue = true;

  while (true) {
    const { installQueue, sources } = get();
    const installing = installQueue.filter((t) => t.status === 'installing');
    const pending = installQueue.filter((t) => t.status === 'pending');

    if (pending.length === 0 && installing.length === 0) break;

    const slots = MAX_CONCURRENT - installing.length;
    if (slots <= 0) {
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }

    const toStart = pending.slice(0, slots);
    if (toStart.length === 0) {
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }

    // Mark as installing
    set((s) => ({
      installQueue: s.installQueue.map((t) =>
        toStart.find((ts) => ts.id === t.id) ? { ...t, status: 'installing' } : t
      ),
    }));

    // Fire all concurrently
    await Promise.all(
      toStart.map(async (task) => {
        try {
          await downloadSourceSkill(task.sourceType, task.baseUrl, task.slug, task.overwrite ?? false);
          // 安装成功后写入完整元数据
          if (task.meta) {
            const fakeItem: SourceSkillItem = {
              id: task.slug,
              slug: task.slug,
              name: task.name,
              description: task.meta.description,
              author: task.meta.author,
              version: task.meta.version,
              tags: task.meta.tags ?? [],
              source_id: task.sourceType,
              requires_api_key: false,
            };
            void applySkillMeta(task.slug, fakeItem, task.sourceType, task.baseUrl);
          }
          set((s) => ({
            installQueue: s.installQueue.map((t) =>
              t.id === task.id ? { ...t, status: 'done' } : t
            ),
          }));
        } catch (e) {
          const msg = String(e);
          set((s) => ({
            installQueue: s.installQueue.map((t) =>
              t.id === task.id ? { ...t, status: 'error', error: msg } : t
            ),
          }));
        }
      })
    );
  }

  processingQueue = false;

  // Auto-hide drawer after 3s when all done/error
  const finalQueue = get().installQueue;
  const hasActive = finalQueue.some((t) => t.status === 'pending' || t.status === 'installing');
  if (!hasActive) {
    setTimeout(() => {
      const current = get().installQueue;
      const stillActive = current.some((t) => t.status === 'pending' || t.status === 'installing');
      if (!stillActive) {
        set(() => ({ drawerVisible: false }));
      }
    }, 3000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  sources: [],
  sourcesLoading: false,
  activeSourceId: 'skillhub',

  sourceStates: {},

  searchQuery: '',

  installingSlug: null,
  installError: null,

  installQueue: [],
  drawerVisible: false,

  selectedItem: null,
  detailData: null,
  detailLoading: false,

  wizardOpen: false,
  wizardStep: 1,
  wizardRepo: '',
  wizardSkillsRoot: 'skills/',
  wizardPreviewItems: [],
  wizardPreviewLoading: false,

  loadSources: async () => {
    set({ sourcesLoading: true });
    try {
      const sources = await getMarketplaceSources();
      const enabledSources = sources.filter((s) => s.enabled);
      const firstId = enabledSources[0]?.id ?? 'skillhub';
      set({
        sources: enabledSources,
        sourcesLoading: false,
        activeSourceId: get().activeSourceId || firstId,
      });
    } catch (e) {
      set({ sourcesLoading: false });
    }
  },

  setActiveSource: (id) => {
    set({ activeSourceId: id, searchQuery: '' });
    const state = get().sourceStates[id];
    if (!state?.page) {
      get().loadSourceSkills(id);
    }
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q });
  },

  loadSourceSkills: async (sourceId, forceRefresh = false) => {
    const sources = get().sources;
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;

    set((prev) => ({
      sourceStates: {
        ...prev.sourceStates,
        [sourceId]: { ...defaultSourceState(), loading: true },
      },
    }));

    try {
      const cacheKey = `source:${sourceId}:p1`;
      if (!forceRefresh) {
        try {
          const cached = await getMarketplaceCache(cacheKey);
          if (cached) {
            const age = Math.floor(Date.now() / 1000) - cached.cached_at;
            if (age < CACHE_TTL_SECS) {
              const parsed = JSON.parse(cached.data) as SourceSkillPage;
              // 修复旧缓存中 tags 可能为 null 的问题
              const sanitized: SourceSkillPage = {
                ...parsed,
                items: parsed.items?.map((item) => ({
                  ...item,
                  tags: Array.isArray(item.tags) ? item.tags : [],
                })) ?? [],
              };
              set((prev) => ({
                sourceStates: {
                  ...prev.sourceStates,
                  [sourceId]: {
                    ...defaultSourceState(),
                    page: sanitized,
                    loading: false,
                    error: null,
                    cursor: sanitized.next_cursor,
                    loadMoreLoading: false,
                  },
                },
              }));
              return;
            }
          }
        } catch {
          // 缓存损坏，跳过直接重新拉取
        }
      }

      const page = await fetchSourceSkills(source.id, source.type, source.base_url);
      await setMarketplaceCache(cacheKey, JSON.stringify(page));

      set((prev) => ({
        sourceStates: {
          ...prev.sourceStates,
          [sourceId]: {
            ...defaultSourceState(),
            page,
            loading: false,
            error: null,
            cursor: page.next_cursor,
            loadMoreLoading: false,
          },
        },
      }));
    } catch (e) {
      set((prev) => ({
        sourceStates: {
          ...prev.sourceStates,
          [sourceId]: {
            ...defaultSourceState(),
            loading: false,
            error: String(e),
          },
        },
      }));
    }
  },

  loadMoreSourceSkills: async (sourceId) => {
    const sources = get().sources;
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;

    const state = get().sourceStates[sourceId];
    if (!state?.page?.has_more || state.loadMoreLoading) return;

    const cursor = state.cursor;

    set((prev) => ({
      sourceStates: {
        ...prev.sourceStates,
        [sourceId]: { ...prev.sourceStates[sourceId], loadMoreLoading: true },
      },
    }));

    try {
      const newPage = await fetchSourceSkills(source.id, source.type, source.base_url, undefined, cursor);

      set((prev) => {
        const existing = prev.sourceStates[sourceId]?.page;
        const merged: SourceSkillPage = {
          items: [...(existing?.items ?? []), ...newPage.items],
          total: newPage.total ?? existing?.total,
          has_more: newPage.has_more,
          next_cursor: newPage.next_cursor,
        };
        return {
          sourceStates: {
            ...prev.sourceStates,
            [sourceId]: {
              ...(prev.sourceStates[sourceId] ?? defaultSourceState()),
              page: merged,
              loading: false,
              error: null,
              cursor: newPage.next_cursor,
              loadMoreLoading: false,
            },
          },
        };
      });
    } catch (e) {
      set((prev) => ({
        sourceStates: {
          ...prev.sourceStates,
          [sourceId]: {
            ...prev.sourceStates[sourceId],
            loadMoreLoading: false,
            error: String(e),
          },
        },
      }));
    }
  },

  searchSourceSkills: async (sourceId, query) => {
    const sources = get().sources;
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;

    if (!query.trim()) {
      set((prev) => ({
        sourceStates: {
          ...prev.sourceStates,
          [sourceId]: { ...prev.sourceStates[sourceId], searchResults: null, searchError: null },
        },
      }));
      return;
    }

    set((prev) => ({
      sourceStates: {
        ...prev.sourceStates,
        [sourceId]: { ...prev.sourceStates[sourceId], searchLoading: true, searchError: null },
      },
    }));

    try {
      const results = await fetchSourceSkills(source.id, source.type, source.base_url, query);
      set((prev) => ({
        sourceStates: {
          ...prev.sourceStates,
          [sourceId]: { ...prev.sourceStates[sourceId], searchResults: results, searchLoading: false },
        },
      }));
    } catch (e) {
      set((prev) => ({
        sourceStates: {
          ...prev.sourceStates,
          [sourceId]: { ...prev.sourceStates[sourceId], searchLoading: false, searchError: String(e) },
        },
      }));
    }
  },

  setSelectedItem: (item) => {
    set({ selectedItem: item, detailData: null });
    if (!item) return;

    const source = get().sources.find((s) => s.id === item.source_id);
    if (!source || source.type !== 'skillhub') return;

    set({ detailLoading: true });
    fetchSkillDetail(source.type, source.base_url, item.slug)
      .then((detail) => {
        set({ detailData: detail, detailLoading: false });
      })
      .catch(() => {
        set({ detailLoading: false });
      });
  },

  installSkill: async (item, overwrite = false) => {
    const sources = get().sources;
    const source = sources.find((s) => s.id === item.source_id);
    if (!source) {
      set({ installError: 'Source not found' });
      return false;
    }

    set({ installingSlug: item.slug, installError: null });
    try {
      await downloadSourceSkill(source.type, source.base_url, item.slug, overwrite);
      // 安装成功后写入完整元数据到 frontmatter + DB
      void applySkillMeta(item.slug, item, source.type, source.base_url);
      set({ installingSlug: null });
      return true;
    } catch (e) {
      const msg = String(e);
      set({ installingSlug: null, installError: msg });
      return false;
    }
  },

  enqueueInstall: (items) => {
    const sources = get().sources;
    const newTasks: InstallTask[] = items
      .map(({ item, overwrite }) => {
        const source = sources.find((s) => s.id === item.source_id);
        if (!source) return null;
        return {
          id: `${item.slug}-${Date.now()}-${Math.random()}`,
          name: item.name,
          slug: item.slug,
          sourceType: source.type,
          baseUrl: source.base_url,
          overwrite: overwrite ?? false,
          status: 'pending' as const,
          meta: {
            version: item.version,
            author: item.author,
            description: item.description,
            tags: item.tags,
          },
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null) as InstallTask[];

    if (newTasks.length === 0) return;

    set((s) => ({
      installQueue: [...s.installQueue, ...newTasks],
      drawerVisible: true,
    }));

    void processQueue(get, set as Parameters<typeof processQueue>[1]);
  },

  retryTask: (taskId) => {
    set((s) => ({
      installQueue: s.installQueue.map((t) =>
        t.id === taskId ? { ...t, status: 'pending', error: undefined } : t
      ),
      drawerVisible: true,
    }));
    void processQueue(get, set as Parameters<typeof processQueue>[1]);
  },

  clearQueue: () => {
    set({ installQueue: [], drawerVisible: false });
  },

  hideDrawer: () => {
    set({ drawerVisible: false });
  },

  openWizard: (prefillRepo?: string) =>
    set({
      wizardOpen: true,
      wizardStep: 1,
      wizardRepo: prefillRepo ?? '',
      wizardPreviewItems: [],
    }),
  closeWizard: () => set({ wizardOpen: false }),
  setWizardStep: (step) => set({ wizardStep: step }),
  setWizardRepo: (repo) => set({ wizardRepo: repo }),
  setWizardSkillsRoot: (root) => set({ wizardSkillsRoot: root }),

  fetchWizardPreview: async () => {
    const { wizardRepo, wizardSkillsRoot } = get();
    set({ wizardPreviewLoading: true });
    try {
      const items = await previewGithubImport(wizardRepo, wizardSkillsRoot);
      set({ wizardPreviewItems: items, wizardPreviewLoading: false, wizardStep: 2 });
    } catch (e) {
      set({ wizardPreviewLoading: false, installError: String(e) });
    }
  },

  setPreviewItemAction: (id, action) => {
    set((state) => ({
      wizardPreviewItems: state.wizardPreviewItems.map((item) =>
        item.id === id ? { ...item, action } : item
      ),
    }));
  },
}));
