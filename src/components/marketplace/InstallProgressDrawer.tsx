import { useState } from 'react';
import { X, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, Circle, RotateCcw, Download } from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import type { InstallTask } from '@/types';
import { cn } from '@/lib/utils';

function TaskRow({ task, onRetry }: { task: InstallTask; onRetry: () => void }) {
  const truncatedError = task.error
    ? task.error.length > 60
      ? task.error.slice(0, 60) + '…'
      : task.error
    : null;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 border-b last:border-b-0">
      {/* Status icon */}
      <div className="shrink-0">
        {task.status === 'done' && <CheckCircle2 size={14} className="text-green-500" />}
        {task.status === 'error' && <XCircle size={14} className="text-red-400" />}
        {task.status === 'installing' && (
          <Loader2 size={14} className="text-purple-500 animate-spin" />
        )}
        {task.status === 'pending' && <Circle size={14} className="text-gray-300" />}
      </div>

      {/* Name + error */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-xs font-medium truncate',
          task.status === 'done' ? 'text-gray-600' :
          task.status === 'error' ? 'text-red-600' :
          task.status === 'installing' ? 'text-gray-800' :
          'text-gray-400'
        )}>
          {task.name}
        </p>
        {truncatedError && (
          <p className="text-[10px] text-red-400 truncate mt-0.5">{truncatedError}</p>
        )}
      </div>

      {/* Status badge / retry */}
      <div className="shrink-0">
        {task.status === 'done' && (
          <span className="text-[10px] text-green-600 font-medium">已完成</span>
        )}
        {task.status === 'installing' && (
          <span className="text-[10px] text-purple-500 font-medium">安装中…</span>
        )}
        {task.status === 'pending' && (
          <span className="text-[10px] text-gray-400">等待中</span>
        )}
        {task.status === 'error' && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded"
          >
            <RotateCcw size={9} />
            重试
          </button>
        )}
      </div>
    </div>
  );
}

export function InstallProgressDrawer() {
  const { installQueue, drawerVisible, retryTask, clearQueue, hideDrawer } = useMarketplaceStore();
  const [expanded, setExpanded] = useState(true);

  if (!drawerVisible || installQueue.length === 0) return null;

  const total = installQueue.length;
  const done = installQueue.filter((t) => t.status === 'done').length;
  const errors = installQueue.filter((t) => t.status === 'error').length;
  const installing = installQueue.filter((t) => t.status === 'installing').length;
  const allFinished = done + errors === total;

  const headerLabel = allFinished
    ? errors > 0
      ? `安装完成（${errors} 个失败）`
      : `全部安装完成`
    : `正在安装 ${done}/${total}`;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none',
          allFinished && errors === 0 ? 'bg-green-50' : allFinished && errors > 0 ? 'bg-amber-50' : 'bg-purple-50'
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="shrink-0">
          {allFinished && errors === 0 ? (
            <CheckCircle2 size={14} className="text-green-500" />
          ) : allFinished && errors > 0 ? (
            <XCircle size={14} className="text-amber-500" />
          ) : (
            <Download size={14} className="text-purple-500" />
          )}
        </div>
        <span className={cn(
          'flex-1 text-xs font-medium',
          allFinished && errors === 0 ? 'text-green-700' :
          allFinished && errors > 0 ? 'text-amber-700' :
          'text-purple-700'
        )}>
          {headerLabel}
        </span>

        {/* Installing spinner badge */}
        {!allFinished && installing > 0 && (
          <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">
            {installing} 并发
          </span>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); expanded ? setExpanded(false) : setExpanded(true); }}
          className="text-gray-400 hover:text-gray-600 p-0.5"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); hideDrawer(); }}
          className="text-gray-400 hover:text-gray-600 p-0.5"
          title="关闭"
        >
          <X size={12} />
        </button>
      </div>

      {/* Progress bar */}
      {!allFinished && (
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-purple-500 transition-all duration-300"
            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
          />
        </div>
      )}

      {/* Task list */}
      {expanded && (
        <div className="max-h-60 overflow-y-auto">
          {installQueue.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onRetry={() => retryTask(task.id)}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      {expanded && allFinished && (
        <div className="px-3 py-2 border-t bg-gray-50/50 flex justify-end">
          <button
            onClick={clearQueue}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            清除记录
          </button>
        </div>
      )}
    </div>
  );
}
