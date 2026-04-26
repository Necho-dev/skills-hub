import { useState } from 'react';
import { LayoutGrid, FolderSearch, ShoppingBag, Layers, Settings, ChevronLeft, ChevronRight, Cpu, Sun, Moon, Monitor } from 'lucide-react';
import type { NavPage } from '@/types';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';
import { useProjectSkillsStore } from '@/stores/projectSkillsStore';
import { usePlatformStore } from '@/stores/platformStore';
import { useCollectionStore } from '@/stores/collectionStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { cn } from '@/lib/utils';
import { PlatformIcon } from '@/lib/platformIcons';

const NAV_ITEMS: { id: NavPage; label: string; icon: React.ReactNode }[] = [
  { id: 'central', label: '中央技能库', icon: <LayoutGrid size={15} /> },
  { id: 'projects', label: '项目技能库', icon: <FolderSearch size={15} /> },
  { id: 'marketplace', label: '技能市场', icon: <ShoppingBag size={15} /> },
  { id: 'collections', label: '技能集合', icon: <Layers size={15} /> },
];

interface SidebarProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { skills } = useCentralSkillsStore();
  const { groups } = useProjectSkillsStore();
  const { platforms, skillCounts, groupOrders } = usePlatformStore();
  const { collections } = useCollectionStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();

  const THEME_OPTIONS: { value: ThemeMode; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun size={12} />, label: '浅色' },
    { value: 'dark', icon: <Moon size={12} />, label: '深色' },
    { value: 'system', icon: <Monitor size={12} />, label: '系统' },
  ];

  const totalProjectSkills = groups.reduce((sum, g) => sum + g.skills.length, 0);

  const getCount = (page: NavPage) => {
    if (page === 'central') return skills.length || null;
    if (page === 'projects') return totalProjectSkills || null;
    if (page === 'collections') return collections.length || null;
    return null;
  };

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col border-r bg-gray-50/50 dark:bg-gray-900 dark:border-gray-800 transition-all duration-200 relative shrink-0',
        collapsed ? 'w-12' : 'w-[200px]'
      )}
    >
      {/* App title */}
      {!collapsed && (
        <div className="px-3 py-3 border-b">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-purple-600 shrink-0" />
            <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate">SkillsHub</span>
          </div>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex shrink-0 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const count = getCount(item.id);
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors w-full text-left',
                active
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              )}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {count != null && (
                    <span
                      className={cn(
                        'text-xs rounded px-1 min-w-[20px] text-center',
                        active ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* 弹性空白：将平台列表推到底部 */}
      <div className="flex-1" />

      {/* Platform groups：紧贴底部设置栏上方 */}
      {!collapsed && platforms.length > 0 && (
        <div className="scrollbar-hide flex max-h-[55vh] min-h-0 flex-col overflow-y-auto border-t px-3 pb-2 pt-3">
          {/* Group platforms by group_label（与设置页分组顺序一致） */}
          {Object.entries(
            platforms.reduce<Record<string, typeof platforms>>((acc, p) => {
              const g = p.group_label || '其他';
              acc[g] = acc[g] ?? [];
              acc[g].push(p);
              return acc;
            }, {})
          )
            .sort(([a], [b]) => {
              const orderMap = new Map(groupOrders.map((g, i) => [g.group_name, g.sort_order ?? i]));
              const ai = orderMap.has(a) ? orderMap.get(a)! : 9999;
              const bi = orderMap.has(b) ? orderMap.get(b)! : 9999;
              return ai - bi;
            })
            .map(([group, groupPlatforms]) => (
              <div key={group} className="mb-3 last:mb-0">
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">
                  {group}
                </p>
                <div className="flex flex-col gap-0.5">
                  {[...groupPlatforms]
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .map((p) => (
                    <div
                      key={p.id}
                      className="flex min-w-0 items-center gap-2 py-[3px] leading-none text-xs text-gray-500 dark:text-gray-400"
                    >
                      <PlatformIcon iconKey={p.icon ?? p.id} size={14} className="shrink-0 self-center" />
                      <span className="min-w-0 flex-1 truncate leading-[14px]" title={p.name}>
                        {p.name}
                      </span>
                      {(() => {
                        const cnt = skillCounts[p.id] ?? 0;
                        return cnt > 0 ? (
                          <span className="text-[10px] rounded px-1 min-w-[18px] text-center bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0 leading-[18px]">
                            {cnt}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-300 dark:text-gray-600 shrink-0 leading-[14px] px-1">—</span>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Settings + Theme toggle */}
      <div className="flex shrink-0 flex-col gap-1 border-t p-2">
        {/* 设置（在主题切换上方） */}
        <button
          onClick={() => onNavigate('settings')}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm w-full transition-colors',
            currentPage === 'settings'
              ? 'bg-purple-600 text-white'
              : 'text-gray-500 hover:bg-gray-200/60 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
          )}
        >
          <Settings size={15} />
          {!collapsed && <span>设置</span>}
        </button>

        {/* 主题切换：顺序 浅色 / 深色 / 系统 */}
        {!collapsed && (
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setThemeMode(opt.value)}
                title={opt.label}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] transition-all',
                  themeMode === opt.value
                    ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm font-medium'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                )}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
        {collapsed && (
          <button
            onClick={() => {
              const next: ThemeMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
              setThemeMode(next);
            }}
            title={`当前：${themeMode === 'light' ? '浅色' : themeMode === 'dark' ? '深色' : '系统'}`}
            className="flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:bg-gray-200/60 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            {themeMode === 'dark' ? <Moon size={15} /> : themeMode === 'light' ? <Sun size={15} /> : <Monitor size={15} />}
          </button>
        )}
      </div>

      {/* 折叠切换：绝对定位圆形按钮，固定在 title 区高度（顶部对齐） */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-[18px] z-10 rounded-full border bg-white p-0.5 text-gray-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </div>
  );
}
