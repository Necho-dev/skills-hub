import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, File, FileCode, FileJson, Settings, Terminal, Globe, FileType, Database, Image } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SkillFileNode } from '@/types';

interface SkillFileTreeProps {
  nodes: SkillFileNode[];
  selectedPath: string | null;
  onSelect: (node: SkillFileNode) => void;
  collapsed: boolean;
}

interface TreeNodeProps {
  node: SkillFileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (node: SkillFileNode) => void;
}

function getFileIcon(node: SkillFileNode) {
  if (node.is_dir) return null;
  const ext = node.name.split('.').pop()?.toLowerCase();
  // 无扩展名的特殊文件名（如 .gitignore, Makefile, Dockerfile）
  const basename = node.name.toLowerCase();
  if (basename === 'dockerfile' || basename === 'makefile') {
    return <Settings size={12} className="shrink-0 text-gray-500" />;
  }
  switch (ext) {
    case 'md':
    case 'mdx':
      return <FileText size={12} className="shrink-0 text-blue-400" />;
    case 'ts':
      return <FileCode size={12} className="shrink-0 text-blue-500" />;
    case 'tsx':
      return <FileCode size={12} className="shrink-0 text-blue-400" />;
    case 'js':
    case 'mjs':
    case 'cjs':
      return <FileCode size={12} className="shrink-0 text-yellow-500" />;
    case 'jsx':
      return <FileCode size={12} className="shrink-0 text-yellow-400" />;
    case 'py':
      return <FileCode size={12} className="shrink-0 text-green-500" />;
    case 'rs':
      return <FileCode size={12} className="shrink-0 text-orange-500" />;
    case 'go':
      return <FileCode size={12} className="shrink-0 text-cyan-500" />;
    case 'rb':
      return <FileCode size={12} className="shrink-0 text-red-400" />;
    case 'php':
      return <FileCode size={12} className="shrink-0 text-purple-400" />;
    case 'java':
      return <FileCode size={12} className="shrink-0 text-red-500" />;
    case 'kt':
    case 'kts':
      return <FileCode size={12} className="shrink-0 text-violet-500" />;
    case 'swift':
      return <FileCode size={12} className="shrink-0 text-orange-400" />;
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'c':
    case 'h':
    case 'hpp':
      return <FileCode size={12} className="shrink-0 text-blue-600" />;
    case 'sh':
    case 'zsh':
    case 'bash':
    case 'fish':
      return <Terminal size={12} className="shrink-0 text-green-500" />;
    case 'json':
      return <FileJson size={12} className="shrink-0 text-amber-500" />;
    case 'yaml':
    case 'yml':
      return <FileJson size={12} className="shrink-0 text-amber-400" />;
    case 'toml':
      return <FileJson size={12} className="shrink-0 text-orange-400" />;
    case 'xml':
      return <FileCode size={12} className="shrink-0 text-gray-500" />;
    case 'css':
    case 'scss':
    case 'less':
    case 'sass':
      return <FileCode size={12} className="shrink-0 text-pink-400" />;
    case 'html':
    case 'htm':
      return <Globe size={12} className="shrink-0 text-orange-400" />;
    case 'txt':
    case 'log':
      return <FileType size={12} className="shrink-0 text-gray-400" />;
    case 'sql':
      return <Database size={12} className="shrink-0 text-blue-400" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'ico':
      return <Image size={12} className="shrink-0 text-pink-400" />;
    case 'env':
    case 'gitignore':
    case 'editorconfig':
    case 'prettierrc':
    case 'eslintrc':
      return <Settings size={12} className="shrink-0 text-gray-400" />;
    default:
      // 彩色兜底：根据文件名第一个字符哈希到颜色，比空白图标更直观
      return <FileCode size={12} className="shrink-0 text-indigo-300" />;
  }
}

function TreeNode({ node, depth, selectedPath, onSelect }: TreeNodeProps) {
  const [open, setOpen] = useState(false);
  const isSelected = !node.is_dir && selectedPath === node.path;

  const handleClick = () => {
    if (node.is_dir) {
      setOpen((v) => !v);
    } else {
      onSelect(node);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'w-full flex items-center gap-1 px-2 py-[3px] text-left rounded-sm transition-colors group',
          isSelected
            ? 'bg-purple-100 text-purple-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={node.rel_path}
      >
        <span className="shrink-0 w-3">
          {node.is_dir
            ? open
              ? <ChevronDown size={11} className="text-gray-400" />
              : <ChevronRight size={11} className="text-gray-400" />
            : null
          }
        </span>
        {node.is_dir
          ? open
            ? <FolderOpen size={12} className="shrink-0 text-amber-500" />
            : <Folder size={12} className="shrink-0 text-amber-400" />
          : getFileIcon(node)
        }
        <span className={cn(
          'truncate text-[11px] leading-tight',
          node.name === 'SKILL.md' && !isSelected && 'font-medium text-gray-700'
        )}>
          {node.name}
        </span>
      </button>

      {node.is_dir && open && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function countFiles(nodes: SkillFileNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.is_dir) count += countFiles(node.children);
    else count++;
  }
  return count;
}

export function SkillFileTree({ nodes, selectedPath, onSelect, collapsed }: SkillFileTreeProps) {
  return (
    <div className={cn(
      'flex flex-col h-full w-full overflow-hidden transition-opacity duration-200',
      collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
    )}>
      <div className="flex-1 overflow-y-auto py-1">
        {nodes.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
        {nodes.length === 0 && (
          <p className="px-3 py-4 text-[11px] text-gray-400 text-center">无文件</p>
        )}
      </div>
    </div>
  );
}
