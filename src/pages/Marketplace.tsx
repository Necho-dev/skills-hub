import { useEffect, useState, useRef } from 'react';
import { RefreshCw, Search, Download, AlertCircle, Loader2, ChevronDown, X } from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { SourceSkillCard } from '@/components/marketplace/SourceSkillCard';
import { ImportWizard } from '@/components/marketplace/ImportWizard';
import { InstallProgressDrawer } from '@/components/marketplace/InstallProgressDrawer';
import { PlatformIcon } from '@/lib/platformIcons';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { SourceSkillItem } from '@/types';

export function Marketplace() {
  const {
    sources,
    sourcesLoading,
    activeSourceId,
    sourceStates,
    installingSlug,
    installQueue,
    loadSources,
    setActiveSource,
    loadSourceSkills,
    loadMoreSourceSkills,
    searchSourceSkills,
    installSkill,
    enqueueInstall,
    openWizard,
    setWizardRepo,
  } = useMarketplaceStore();

  // 本地搜索输入框状态（不直接绑定 store，由用户主动触发搜索）
  const [inputValue, setInputValue] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await loadSources();
        const store = useMarketplaceStore.getState();
        const first = store.sources[0];
        if (first) {
          await store.loadSourceSkills(first.id);
        }
      } catch (e) {
        console.error('Marketplace init error:', e);
      }
    };
    init();
  }, []);

  // 切换数据源时清空搜索
  const handleSetActiveSource = (id: string) => {
    setInputValue('');
    setActiveQuery('');
    setActiveSource(id);
  };

  const triggerSearch = (q = inputValue.trim()) => {
    if (!q) return;
    setActiveQuery(q);
    setInputValue(q);
    setRecentQueries((prev) => [q, ...prev.filter((r) => r !== q)].slice(0, 5));
    void searchSourceSkills(activeSourceId, q);
  };

  const clearSearch = () => {
    setInputValue('');
    setActiveQuery('');
    void searchSourceSkills(activeSourceId, '');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') triggerSearch();
    if (e.key === 'Escape') clearSearch();
  };


  const activeSource = sources.find((s) => s.id === activeSourceId);
  const activeState = sourceStates[activeSourceId];

  // 有激活搜索词时显示搜索结果，否则显示分页列表
  const displayItems = activeQuery
    ? (activeState?.searchResults?.items ?? [])
    : (activeState?.page?.items ?? []);

  const searchLoading = activeState?.searchLoading ?? false;

  const isQueued = (slug: string) =>
    installQueue.some((t) => t.slug === slug && (t.status === 'pending' || t.status === 'installing'));

  const handleInstall = async (item: SourceSkillItem) => {
    if (isQueued(item.slug)) return;

    const source = sources.find((s) => s.id === item.source_id);
    if (!source) {
      toast.error('数据源未找到');
      return;
    }

    // Skillsmp 安装走 ImportWizard
    if (source.type === 'skillsmp' && item.github_url) {
      setWizardRepo(item.github_url);
      openWizard(item.github_url);
      return;
    }

    const ok = await installSkill(item, false);
    if (ok) {
      toast.success(`已安装：${item.name}`);
    } else {
      const err = useMarketplaceStore.getState().installError ?? '安装失败';
      if (err.includes('already exists')) {
        toast.error(`技能已存在：${item.name}`, {
          action: {
            label: '覆盖安装',
            onClick: () => {
              enqueueInstall([{ item, overwrite: true }]);
              toast.info(`已加入安装队列：${item.name}`);
            },
          },
        });
      } else {
        toast.error(err);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div>
          <h1 className="text-base font-semibold text-gray-900">技能市场</h1>
          <p className="text-xs text-gray-500 mt-0.5">从多个数据源浏览和安装技能</p>
        </div>
        <button
          onClick={() => openWizard()}
          className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
        >
          <Download size={13} />
          从 GitHub 安装
        </button>
      </div>

      {/* Source Tabs */}
      <div className="flex items-center gap-1 px-4 pt-2 border-b overflow-x-auto scrollbar-none shrink-0">
        {sourcesLoading ? (
          <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400">
            <Loader2 size={12} className="animate-spin" />
            加载数据源...
          </div>
        ) : (
          sources.map((source) => {
            const state = sourceStates[source.id];
            const isActive = activeSourceId === source.id;
            return (
              <button
                key={source.id}
                onClick={() => handleSetActiveSource(source.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md mb-1.5 transition-colors whitespace-nowrap shrink-0',
                  isActive
                    ? 'bg-purple-100 text-purple-700 font-medium'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                )}
              >
                <PlatformIcon iconKey={source.type} size={14} />
                {source.name}
                {state?.loading && (
                  <Loader2 size={11} className="animate-spin text-gray-400" />
                )}
                {state?.error && (
                  <AlertCircle size={11} className="text-red-400" />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Search bar */}
      <div className="px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          {/* Input */}
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`搜索 ${activeSource?.name ?? ''} 中的技能...`}
              className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
            />
            {inputValue && (
              <button onClick={clearSearch} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={13} />
              </button>
            )}
            {/* 结果计数 */}
            {!activeQuery && activeState?.page?.total != null && (
              <span className="text-xs text-gray-400 shrink-0">
                {activeState.page.total.toLocaleString()} 个
              </span>
            )}
            {activeQuery && !searchLoading && activeState?.searchResults != null && (
              <span className="text-xs text-gray-400 shrink-0">
                {activeState.searchResults.items.length} 个结果
              </span>
            )}
          </div>

          {/* 搜索按钮 — 与刷新按钮等高，只用图标 */}
          <button
            onClick={() => triggerSearch()}
            disabled={searchLoading}
            title="搜索"
            className={cn(
              'p-2 rounded-lg border transition-colors shrink-0',
              searchLoading
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-400'
            )}
          >
            {searchLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <Search size={14} />
            }
          </button>

          {/* 刷新按钮 */}
          <button
            onClick={() => { clearSearch(); void loadSourceSkills(activeSourceId, true); }}
            disabled={activeState?.loading}
            title="刷新列表"
            className={cn(
              'p-2 rounded-lg border transition-colors shrink-0',
              activeState?.loading
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            )}
          >
            <RefreshCw size={14} className={cn(activeState?.loading && 'animate-spin')} />
          </button>
        </div>

        {/* 最近搜索 */}
        {recentQueries.length > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-gray-400 shrink-0">最近搜索：</span>
            {recentQueries.map((q) => (
              <button
                key={q}
                onClick={() => triggerSearch(q)}
                className={cn(
                  'px-2 py-px text-xs rounded-md transition-colors leading-5',
                  activeQuery === q
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                )}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeState?.error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center justify-between">
            <span className="truncate">{activeState.error}</span>
            <button
              onClick={() => loadSourceSkills(activeSourceId, true)}
              className="text-red-500 hover:text-red-700 ml-2 shrink-0"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        )}

        {activeState?.loading || searchLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" />
            {searchLoading
              ? `正在搜索"${inputValue}"...`
              : `正在加载 ${activeSource?.name}...`}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <p className="text-sm">
              {activeQuery ? `未找到包含 "${activeQuery}" 的技能` : '暂无可用技能'}
            </p>
            {!activeQuery && (
              <p className="text-xs mt-1">请检查网络连接或稍后重试</p>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {displayItems.map((item) => (
                <SourceSkillCard
                  key={item.id}
                  item={item}
                  installing={installingSlug === item.slug || isQueued(item.slug)}
                  onInstall={handleInstall}
                />
              ))}
            </div>

            {/* Load more — only when not in search mode */}
            {!activeQuery && activeState?.page?.has_more && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => loadMoreSourceSkills(activeSourceId)}
                  disabled={activeState.loadMoreLoading}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  {activeState.loadMoreLoading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      加载中...
                    </>
                  ) : (
                    <>
                      <ChevronDown size={13} />
                      加载更多
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ImportWizard />
      <InstallProgressDrawer />
    </div>
  );
}
