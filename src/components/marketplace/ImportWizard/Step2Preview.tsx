import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { cn } from '@/lib/utils';

export function Step2Preview() {
  const { wizardPreviewItems, setPreviewItemAction, setWizardStep, wizardRepo } = useMarketplaceStore();
  const [selectedId, setSelectedId] = useState<string | null>(
    wizardPreviewItems[0]?.id ?? null
  );

  const selectedItem = wizardPreviewItems.find((i) => i.id === selectedId);
  const importCount = wizardPreviewItems.filter((i) => i.action !== 'skip').length;

  const handleSelectAll = (selected: boolean) => {
    wizardPreviewItems.forEach((item) => {
      setPreviewItemAction(item.id, selected ? 'import' : 'skip');
    });
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
      {/* Left: skill list */}
      <div className="w-64 shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-xs font-medium text-gray-600">预览技能</span>
          <span className="text-xs text-gray-400">{wizardPreviewItems.length}</span>
        </div>
        <div className="px-3 py-1.5 border-b">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={wizardPreviewItems.every((i) => i.action !== 'skip')}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="rounded"
            />
            全选
          </label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {wizardPreviewItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={cn(
                'flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b',
                selectedId === item.id ? 'bg-purple-50' : 'hover:bg-gray-50'
              )}
            >
              <input
                type="checkbox"
                checked={item.action !== 'skip'}
                onChange={(e) => {
                  e.stopPropagation();
                  setPreviewItemAction(item.id, e.target.checked ? (item.conflict ? 'overwrite' : 'import') : 'skip');
                }}
                className="mt-0.5 rounded"
              />
              <div className="min-w-0">
                <p className={cn(
                  'text-xs font-medium truncate',
                  item.action === 'skip' ? 'text-gray-400 line-through' : 'text-gray-800'
                )}>
                  {item.name}
                </p>
                {item.conflict && (
                  <p className="text-[10px] text-orange-500 mt-0.5">已存在</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {selectedItem ? (
          <div className="p-4 flex flex-col gap-3 overflow-y-auto h-full">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{selectedItem.name}</h3>
              <code className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded mt-1 inline-block">
                {selectedItem.id}
              </code>
            </div>

            {selectedItem.conflict && (
              <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3">
                <AlertTriangle size={14} className="text-orange-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-orange-700 font-medium">
                    本地已存在 &ldquo;{selectedItem.id}&rdquo;，默认跳过不写入
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">{selectedItem.path}</p>
                </div>
              </div>
            )}

            {selectedItem.conflict && (
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewItemAction(selectedItem.id, 'overwrite')}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded border transition-colors',
                    selectedItem.action === 'overwrite'
                      ? 'bg-orange-100 border-orange-300 text-orange-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  改为覆盖
                </button>
                <button
                  onClick={() => setPreviewItemAction(selectedItem.id, 'skip')}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded border transition-colors',
                    selectedItem.action === 'skip'
                      ? 'bg-gray-100 border-gray-300 text-gray-600'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  )}
                >
                  跳过
                </button>
              </div>
            )}

            <div className="text-xs text-gray-500">
              <p className="font-medium mb-1">来源</p>
              <code className="bg-gray-100 px-2 py-1 rounded text-[10px]">{wizardRepo} / {selectedItem.repo_path}</code>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            选择左侧技能查看详情
          </div>
        )}
      </div>
      </div>

      {/* Bottom actions */}
      <div className="flex justify-between items-center px-6 py-3 border-t bg-white shrink-0">
        <button
          onClick={() => setWizardStep(1)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 返回
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">将安装 {importCount} 个技能</span>
          <button
            onClick={() => setWizardStep(3)}
            disabled={importCount === 0}
            className="px-5 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            下一步 →
          </button>
        </div>
      </div>
    </div>
  );
}
