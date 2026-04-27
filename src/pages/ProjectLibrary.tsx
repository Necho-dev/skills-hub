import { useEffect, useState } from 'react';
import { RefreshCw, FolderOpen, PackagePlus, X, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { MarkdownPreview } from '@/components/skills/MarkdownPreview';
import { SkillFileTree } from '@/components/skills/SkillFileTree';
import { FrontmatterPanel } from '@/components/skills/FrontmatterPanel';
import { CodeFilePreview } from '@/components/skills/CodeFilePreview';
import { ImportToCentralModal } from '@/components/skills/ImportToCentralModal';
import { useProjectSkillsStore } from '@/stores/projectSkillsStore';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';
import { revealInFinder, listSkillFiles, readSkillFile } from '@/lib/tauri';
import { invoke } from '@tauri-apps/api/core';
import { PlatformIcon } from '@/lib/platformIcons';

import { cn } from '@/lib/utils';
import type { ProjectSkill, NativeSkill, SkillFileNode } from '@/types';

const HINT_TO_ICON_KEY: Record<string, string> = {
  'cursor':     'cursor',
  'claude code':'claude-code',
  'central':    'skillhub',
};

function platformHintIconKey(hint: string): string {
  return HINT_TO_ICON_KEY[hint.toLowerCase()] ?? hint.toLowerCase();
}

function PlatformHintTag({ hint }: { hint: string }) {
  return (
    <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md border border-gray-200 font-medium">
      <PlatformIcon iconKey={platformHintIconKey(hint)} size={11} />
      {hint}
    </span>
  );
}

function useProjectSkillMarkdown(skillPath: string | null) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!skillPath) { setMarkdown(null); return; }
    setLoading(true);
    setMarkdown(null);
    invoke<string>('get_project_skill_markdown', { skillPath })
      .then((text) => setMarkdown(text))
      .catch(() => setMarkdown(null))
      .finally(() => setLoading(false));
  }, [skillPath]);

  return { markdown, loading };
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

interface ProjectSkillPreviewProps {
  skill: ProjectSkill;
  onImport: (skill: ProjectSkill) => void;
  onClose: () => void;
}

function ProjectSkillPreview({ skill, onImport, onClose }: ProjectSkillPreviewProps) {
  const { markdown, loading: mdLoading } = useProjectSkillMarkdown(skill.path);

  // 文件树状态（与中央技能库完全一致）
  const [fileNodes, setFileNodes] = useState<SkillFileNode[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(true);
  const [showFileTree, setShowFileTree] = useState(false);

  useEffect(() => {
    setSelectedFilePath(null);
    setFileContent(null);
    let cancelled = false;
    listSkillFiles(skill.path)
      .then((nodes) => {
        if (cancelled) return;
        const countFiles = (ns: SkillFileNode[]): number =>
          ns.reduce((s, n) => s + (n.is_dir ? countFiles(n.children) : 1), 0);
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
    if (isBinaryFile(node.name)) return;
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

  const activeFilename = selectedFilePath
    ? selectedFilePath.split('/').pop() ?? ''
    : 'SKILL.md';
  const isMarkdownFile = activeFilename.toLowerCase().endsWith('.md');
  const isBinary = selectedFilePath ? isBinaryFile(activeFilename) : false;
  const codeLang = !isMarkdownFile ? getCodeLanguage(activeFilename) : null;

  const displayContent = selectedFilePath ? fileContent : markdown;
  const displayLoading = selectedFilePath ? fileLoading : mdLoading;

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* 面板 header */}
      <div className="px-4 pt-3 pb-0 border-b shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText size={13} className="text-gray-400 shrink-0" />
            <h3 className="text-sm font-semibold text-gray-900 truncate">{skill.name}</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => revealInFinder(skill.path)}
              className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
              title="在 Finder 中显示"
            >
              <FolderOpen size={13} />
            </button>
            <button
              onClick={() => onImport(skill)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-700"
            >
              <PackagePlus size={12} />
              导入到中央技能库
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {skill.description && (
          <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-snug">{skill.description}</p>
        )}
        <p className="text-[10px] text-gray-400 font-mono mt-1 truncate">{skill.path}</p>
        {skill.platform_hint && (
          <div className="mb-1">
            <PlatformHintTag hint={skill.platform_hint} />
          </div>
        )}

        {/* 元数据：始终渲染，切换文件不消失 */}
        <FrontmatterPanel markdown={markdown} />
      </div>

      {/* 主体区：文件树侧边栏 + 内容预览（与中央技能库完全一致） */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 文件树侧边栏：折叠时 w-5 显示竖排文字，展开时 w-44 */}
        <div className={cn(
          'relative shrink-0 border-r flex flex-col transition-all duration-200 z-10 overflow-visible',
          !showFileTree
            ? 'w-0 opacity-0 pointer-events-none border-r-0'
            : fileTreeCollapsed ? 'w-5' : 'w-44'
        )}>
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

          {/* 折叠态：竖排文件数量 */}
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
              <div className="flex-1 overflow-hidden">
                <CodeFilePreview
                  filename={activeFilename}
                  content={displayContent}
                  language={codeLang ?? undefined}
                />
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <FileText size={24} className="mb-2 opacity-30" />
              <p className="text-sm">
                {selectedFilePath ? '无法读取文件内容' : '无法读取 SKILL.md'}
              </p>
              {!selectedFilePath && (
                <p className="text-xs mt-1 font-mono">{skill.path}/SKILL.md</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProjectLibrary() {
  const { groups, selectedProject, loading, error, scan, selectProject } = useProjectSkillsStore();
  const { load: reloadCentral } = useCentralSkillsStore();
  const [selectedSkill, setSelectedSkill] = useState<ProjectSkill | null>(null);
  const [importModalSkill, setImportModalSkill] = useState<NativeSkill | null>(null);

  useEffect(() => { scan(); }, []);

  const handleSelectProject = (projectPath: string | null) => {
    selectProject(projectPath);
    setSelectedSkill(null);
  };

  const totalSkills = groups.reduce((sum, g) => sum + g.skills.length, 0);
  const selectedGroup = groups.find((g) => g.project_path === selectedProject);

  const handleImport = (skill: ProjectSkill) => {
    const parentPath = skill.path.substring(0, skill.path.lastIndexOf('/')) || skill.path;
    setImportModalSkill({
      skillId: skill.id,
      skillName: skill.name,
      description: skill.description,
      sourcePath: skill.path,
      platformId: 'project',
      platformName: skill.project_name,
      platformSkillsPath: parentPath,
    });
  };

  return (
    <>
    <div className="flex h-full overflow-hidden">
      {/* 左栏：项目目录树 */}
      <div className="w-[200px] shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">项目技能库</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {groups.length} 个项目 · {totalSkills} 个技能
            </p>
          </div>
          <button
            onClick={() => scan(true)}
            disabled={loading}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="重新扫描"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {groups.map((group) => (
            <button
              key={group.project_path}
              onClick={() => handleSelectProject(
                selectedProject === group.project_path ? null : group.project_path
              )}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors',
                selectedProject === group.project_path
                  ? 'bg-purple-50 text-purple-700'
                  : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen size={13} className="shrink-0 text-gray-400" />
                <span className="truncate text-xs">{group.project_name}</span>
              </div>
              <span className="text-[10px] text-gray-400 ml-1 shrink-0">{group.skills.length}</span>
            </button>
          ))}
          {!loading && groups.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400 text-xs">
              未找到包含 SKILL.md 的项目
            </div>
          )}
        </div>
      </div>

      {/* 中栏：技能列表 */}
      <div className={cn(
        'flex flex-col border-r transition-all shrink-0',
        selectedSkill ? 'w-[260px]' : 'flex-1'
      )}>
        {selectedGroup ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 truncate">{selectedGroup.project_name}</h2>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{selectedGroup.project_path}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0 ml-2">({selectedGroup.skills.length})</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {selectedGroup.skills.map((skill) => {
                const isSelected = selectedSkill?.path === skill.path;
                return (
                  <div
                    key={skill.path}
                    onClick={() => setSelectedSkill(isSelected ? null : skill)}
                    className={cn(
                      'group relative px-4 py-3 border-b cursor-pointer transition-colors',
                      isSelected
                        ? 'bg-purple-50 border-l-2 border-l-purple-500'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <p className="text-sm font-medium text-gray-900 truncate leading-snug pr-16">{skill.name}</p>
                    {skill.description && (
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">{skill.description}</p>
                    )}
                      {skill.platform_hint && (
                        <PlatformHintTag hint={skill.platform_hint} />
                      )}
                    <div className="absolute top-2.5 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); revealInFinder(skill.path); }}
                        className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                        title="在 Finder 中显示"
                      >
                        <FolderOpen size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleImport(skill); }}
                        className="p-1.5 rounded bg-purple-100 text-purple-600 hover:bg-purple-200 hover:text-purple-700"
                        title="导入到中央库"
                      >
                        <PackagePlus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <FolderOpen size={32} className="mb-2 opacity-30" />
            <p className="text-sm">从左侧选择一个项目</p>
          </div>
        )}

        {error && (
          <div className="m-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
        )}
      </div>

      {/* 右栏：技能预览面板 */}
      {selectedSkill && (
        <ProjectSkillPreview
          skill={selectedSkill}
          onImport={handleImport}
          onClose={() => setSelectedSkill(null)}
        />
      )}
    </div>
    {importModalSkill && (
      <ImportToCentralModal
        skills={[importModalSkill]}
        allowLink
        onClose={(imported) => {
          setImportModalSkill(null);
          if (imported) void reloadCentral();
        }}
      />
    )}
    </>
  );
}
