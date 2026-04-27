import { FolderOpen, Trash2, X, AlertTriangle, CheckCircle2, PlusCircle, Loader2, Send, Ban, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Skill, SkillFileNode } from '@/types';
import { usePlatformStore } from '@/stores/platformStore';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';
import { MarkdownPreview } from './MarkdownPreview';
import { SkillFileTree } from './SkillFileTree';
import { FrontmatterPanel } from './FrontmatterPanel';
import { CodeFilePreview } from './CodeFilePreview';
import { PlatformIcon } from '@/lib/platformIcons';
import { revealInFinder, listSkillFiles, readSkillFile } from '@/lib/tauri';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { SOURCE_CONFIG } from '@/lib/skillSource';

interface SkillDetailPanelProps {
  skill: Skill;
  markdown: string | null;
  markdownLoading: boolean;
  installedPlatformIds: string[];
  onClose?: () => void;
}

interface DeleteModalProps {
  skillName: string;
  installedPlatformNames: string[];
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ skillName, installedPlatformNames, deleting, onConfirm, onCancel }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-[360px] p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle size={15} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">删除技能</p>
            <p className="text-xs text-gray-500 mt-0.5">
              确定要删除 <span className="font-medium text-gray-700">"{skillName}"</span> 吗？
            </p>
          </div>
        </div>

        {installedPlatformNames.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
              该技能已被分发到以下平台：
            </div>
            <div className="flex flex-wrap gap-1">
              {installedPlatformNames.map((name) => (
                <span key={name} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                  {name}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-gray-400">
              确认删除以后将自动移除 Symbolic Link（符号链接）
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400">
          该操作将从 <code className="bg-gray-100 px-1 rounded font-mono">~/.skillshub/skills/</code> 目录中<span className="text-red-500 font-medium">删除技能文件且无法恢复</span>，请谨慎操作。
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className={cn(
              'px-3 py-1.5 text-sm text-white rounded-lg flex items-center gap-1.5',
              deleting ? 'bg-red-300 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'
            )}
          >
            {deleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 根据文件扩展名判断是否为代码文件（非 Markdown） */
function getCodeLanguage(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', py: 'python', sh: 'bash', zsh: 'bash',
    rs: 'rust', toml: 'toml', yaml: 'yaml', yml: 'yaml',
    css: 'css', html: 'html', xml: 'xml', sql: 'sql',
    go: 'go', rb: 'ruby', php: 'php', java: 'java', kt: 'kotlin',
    txt: 'text',
  };
  if (!ext) return null;
  return langMap[ext] ?? null;
}

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico',
  'zip', 'tar', 'gz', 'dmg', 'exe', 'bin', 'wasm',
  'pdf', 'ttf', 'otf', 'woff', 'woff2',
]);

function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? BINARY_EXTENSIONS.has(ext) : false;
}


export function SkillDetailPanel({
  skill,
  markdown,
  markdownLoading,
  installedPlatformIds,
  onClose,
}: SkillDetailPanelProps) {
  const { platforms } = usePlatformStore();
  const { installToPlatform, uninstallFromPlatform, removeSkill } = useCentralSkillsStore();
  const [toggling, setToggling] = useState<string | null>(null);
  const [togglingAll, setTogglingAll] = useState<'install' | 'uninstall' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // 文件树相关状态
  const [fileNodes, setFileNodes] = useState<SkillFileNode[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  // 侧边栏始终渲染，默认折叠；只通过 Tailwind 类切换宽度
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(true);
  // 是否显示文件树（有多于1个文件时才显示）
  // 不在 effect 开头重置，等新数据到来后原子性更新，避免切换时闪动
  const [showFileTree, setShowFileTree] = useState(false);

  // 加载文件树
  useEffect(() => {
    setSelectedFilePath(null);
    setFileContent(null);
    let cancelled = false;
    listSkillFiles(skill.path)
      .then((nodes) => {
        if (cancelled) return;
        const countFiles = (ns: SkillFileNode[]): number =>
          ns.reduce((s, n) => s + (n.is_dir ? countFiles(n.children) : 1), 0);
        // 原子性更新，一次 setState 批次
        setFileNodes(nodes);
        setTotalFiles(countFiles(nodes));
        setShowFileTree(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFileNodes([]);
        setTotalFiles(0);
        setShowFileTree(false);
      });
    return () => { cancelled = true; };
  }, [skill.path]);

  const handleSelectFile = async (node: SkillFileNode) => {
    if (node.is_dir) return;
    if (selectedFilePath === node.path) return;

    setSelectedFilePath(node.path);
    setFileContent(null);

    if (isBinaryFile(node.name)) {
      setFileContent(null);
      return;
    }

    setFileLoading(true);
    try {
      const content = await readSkillFile(skill.path, node.path);
      setFileContent(content);
    } catch {
      setFileContent(null);
    } finally {
      setFileLoading(false);
    }
  };

  // 当前要展示的内容：优先选中文件，否则 fallback 到 SKILL.md（markdown prop）
  const activeFilename = selectedFilePath
    ? selectedFilePath.split('/').pop() ?? ''
    : 'SKILL.md';
  const isMarkdownFile = activeFilename.toLowerCase().endsWith('.md');
  const isBinary = selectedFilePath ? isBinaryFile(activeFilename) : false;
  const codeLang = !isMarkdownFile ? getCodeLanguage(activeFilename) : null;

  const displayContent = selectedFilePath ? fileContent : markdown;
  const displayLoading = selectedFilePath ? fileLoading : markdownLoading;

  const handleTogglePlatform = async (platformId: string, wantInstall: boolean) => {
    const platform = platforms.find((p) => p.id === platformId);
    if (!platform) return;
    setToggling(platformId);
    try {
      if (wantInstall) {
        const result = await installToPlatform(skill.id, platformId, platform.skills_path);
        if (result.success) {
          toast.success(`已安装到 ${platform.name}`);
        } else {
          toast.error(result.error ?? '安装失败');
        }
      } else {
        const result = await uninstallFromPlatform(skill.id, platformId, platform.skills_path);
        if (result.success) {
          toast.success(`已从 ${platform.name} 卸载`);
        } else {
          toast.error(result.error ?? '卸载失败');
        }
      }
    } finally {
      setToggling(null);
    }
  };

  const handleToggleAll = async (action: 'install' | 'uninstall') => {
    const enabled = platforms.filter((p) => p.enabled);
    const targets = action === 'install'
      ? enabled.filter((p) => !installedPlatformIds.includes(p.id))
      : enabled.filter((p) => installedPlatformIds.includes(p.id));
    if (targets.length === 0) return;
    setTogglingAll(action);
    for (const platform of targets) {
      try {
        if (action === 'install') {
          const result = await installToPlatform(skill.id, platform.id, platform.skills_path);
          if (!result.success) toast.error(`${platform.name} 安装失败: ${result.error ?? ''}`);
        } else {
          const result = await uninstallFromPlatform(skill.id, platform.id, platform.skills_path);
          if (!result.success) toast.error(`${platform.name} 撤销失败: ${result.error ?? ''}`);
        }
      } catch (e) {
        toast.error(String(e));
      }
    }
    setTogglingAll(null);
    toast.success(action === 'install' ? `已分发到全部 ${targets.length} 个平台` : `已从全部 ${targets.length} 个平台撤销`);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await removeSkill(skill.id);
      toast.success(`已删除技能 ${skill.name}`);
      setShowDeleteModal(false);
      onClose?.();
    } catch (e) {
      toast.error(String(e));
      setDeleting(false);
    }
  };

  const installedPlatformNames = installedPlatformIds
    .map((pid) => platforms.find((p) => p.id === pid)?.name)
    .filter(Boolean) as string[];

  return (
    <>
      {showDeleteModal && (
        <DeleteConfirmModal
          skillName={skill.name}
          installedPlatformNames={installedPlatformNames}
          deleting={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      <div className="flex flex-col h-full">
        {/* Panel header */}
        <div className="px-4 pt-3 pb-0 border-b">
          {/* 第一行：标题 + 操作按钮 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-semibold text-gray-900 text-sm truncate">{skill.name}</h2>
              {skill.version && (
                <span className="shrink-0 text-[9px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono">
                  {skill.version}
                </span>
              )}
              {(() => {
                const cfg = SOURCE_CONFIG[skill.source] ?? SOURCE_CONFIG.local;
                return (
                  <span className={cn(
                    'shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md border',
                    cfg.className
                  )}>
                    {cfg.icon}{cfg.label}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => revealInFinder(skill.path)}
                className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                title="在 Finder 中显示"
              >
                <FolderOpen size={13} />
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={deleting}
                className="p-1.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                title="删除技能"
              >
                <Trash2 size={13} />
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* 描述（全宽） */}
          {skill.description && (
            <p className="text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2">{skill.description}</p>
          )}

          {/* 路径 */}
          <p className="text-[10px] text-gray-400 mt-1 font-mono truncate">{skill.path}</p>

          {/* 平台分发区 */}
          <div className="mt-2 mb-3">
            {(() => {
              const enabled = platforms.filter((p) => p.enabled);
              if (enabled.length === 0) return (
                <p className="text-[11px] text-gray-400 py-1">暂无已启用平台，请在设置中启用</p>
              );
              const installedCount = enabled.filter((p) => installedPlatformIds.includes(p.id)).length;
              const notInstalledCount = enabled.length - installedCount;
              return (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-gray-500 font-medium">快速分发到平台</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleAll('install')}
                        disabled={notInstalledCount === 0 || !!togglingAll}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {togglingAll === 'install'
                          ? <Loader2 size={9} className="animate-spin" />
                          : <Send size={9} />
                        }
                        全部分发
                      </button>
                      <button
                        onClick={() => handleToggleAll('uninstall')}
                        disabled={installedCount === 0 || !!togglingAll}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {togglingAll === 'uninstall'
                          ? <Loader2 size={9} className="animate-spin" />
                          : <Ban size={9} />
                        }
                        全部撤销
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {enabled.map((platform) => {
                      const isInstalled = installedPlatformIds.includes(platform.id);
                      const isToggling = toggling === platform.id;
                      return (
                        <button
                          key={platform.id}
                          onClick={() => handleTogglePlatform(platform.id, !isInstalled)}
                          disabled={isToggling || !!togglingAll}
                          title={isInstalled ? `点击撤销 ${platform.name}` : `点击分发到 ${platform.name}`}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
                            isInstalled
                              ? 'bg-green-50 border-green-200 text-green-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                              : 'bg-white border-gray-200 text-gray-500 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600'
                          )}
                        >
                          {isToggling
                            ? <Loader2 size={10} className="animate-spin" />
                            : isInstalled
                              ? <CheckCircle2 size={10} />
                              : <PlusCircle size={10} />
                          }
                          <PlatformIcon iconKey={platform.icon ?? platform.id} size={10} />
                          {platform.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Frontmatter 元数据展开面板（始终显示，切换文件时不消失） */}
          <FrontmatterPanel markdown={markdown} />
        </div>

        {/* 主体区：文件树侧边栏 + 内容预览 */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/*
            文件树侧边栏：
            - relative + z-10：让圆形悬浮按钮不被父级 overflow-hidden 裁剪
            - 折叠/展开只切换 w-3 / w-44，transition-all duration-200 驱动过渡
            - showFileTree=false 时 w-0 隐藏，不重置避免切换技能时闪动
          */}
          {/* 文件树侧边栏：折叠时 w-5 显示竖排文字，展开时 w-44 */}
          <div className={cn(
            'relative shrink-0 border-r flex flex-col transition-all duration-200 z-10 overflow-visible',
            !showFileTree
              ? 'w-0 opacity-0 pointer-events-none border-r-0'
              : fileTreeCollapsed ? 'w-5' : 'w-44'
          )}>
            {/* 圆形展开/收起按钮，始终可见 */}
            {showFileTree && (
              <button
                onClick={() => setFileTreeCollapsed((v) => !v)}
                title={fileTreeCollapsed ? '展开文件树' : '折叠文件树'}
                className="absolute -right-3.5 top-3 z-20 rounded-full border bg-white dark:bg-gray-800 dark:border-gray-700 p-1 text-gray-500 dark:text-gray-400 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {fileTreeCollapsed
                  ? <ChevronRight size={13} />
                  : <ChevronLeft size={13} />
                }
              </button>
            )}

            {/* 折叠态：竖排文件数量文字 */}
            {showFileTree && (
              <div className={cn(
                'absolute inset-0 flex flex-col items-center justify-start pt-10 transition-opacity duration-200',
                fileTreeCollapsed ? 'opacity-100 pointer-events-none' : 'opacity-0 pointer-events-none'
              )}>
                <span
                  className="text-[9px] text-gray-400 font-medium select-none"
                  style={{ writingMode: 'vertical-rl', letterSpacing: '0.08em' }}
                >
                  共 {totalFiles} 项文件
                </span>
              </div>
            )}

            {/* 展开态：完整文件树 */}
            <SkillFileTree
              nodes={fileNodes}
              selectedPath={selectedFilePath}
              onSelect={handleSelectFile}
              collapsed={fileTreeCollapsed}
            />
          </div>

          {/* 右侧内容预览 */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {displayLoading ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                加载中...
              </div>
            ) : isBinary ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                <p className="text-sm">不支持预览该文件类型</p>
                <p className="text-xs mt-1 font-mono text-gray-300">{activeFilename}</p>
              </div>
            ) : displayContent ? (
              isMarkdownFile ? (
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <MarkdownPreview content={displayContent} />
                </div>
              ) : (
                // CodeFilePreview 需要确定高度容器，flex-1 让它撑满剩余空间
                <div className="flex-1 overflow-hidden">
                  <CodeFilePreview
                    filename={activeFilename}
                    content={displayContent}
                    language={codeLang ?? undefined}
                  />
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                {selectedFilePath ? '无法读取文件内容' : '无 SKILL.md 内容'}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
