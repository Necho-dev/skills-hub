import { useEffect, useRef, useState } from 'react';
import { Plus, Edit2, Download, Trash2, X, Upload, Check, Search } from 'lucide-react';
import { useCollectionStore } from '@/stores/collectionStore';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';
import { batchInstallCollection, exportCollectionToFile, encodeSkillCol, decodeSkillCol, getPlatformPaths, packSkillToZip, unpackSkillToCentral } from '@/lib/tauri';
import { getCollectionSkills } from '@/lib/db';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SOURCE_CONFIG } from '@/lib/skillSource';

export function Collections() {
  const {
    collections, selectedCollectionId, collectionSkillIds,
    load, selectCollection, create, update, remove,
    removeSkill: removeSkillFromCollection, addSkill,
  } = useCollectionStore();
  const { skills } = useCentralSkillsStore();

  const [showNewModal, setShowNewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBatchInstall, setShowBatchInstall] = useState(false);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [importPayload, setImportPayload] = useState<ImportPayload | null>(null);

  // 编辑表单状态
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // 删除确认状态
  const [showDeleteCollectionModal, setShowDeleteCollectionModal] = useState(false);
  const [removeSkillTarget, setRemoveSkillTarget] = useState<{ id: string; name: string } | null>(null);

  // 文件导入 ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load().then(() => {
      const state = useCollectionStore.getState();
      if (!state.selectedCollectionId && state.collections.length > 0) {
        state.selectCollection(state.collections[0].id);
      }
    });
  }, []);

  const selectedCollection = collections.find((c) => c.id === selectedCollectionId);
  const skillIdsInCollection = selectedCollectionId
    ? (collectionSkillIds[selectedCollectionId] ?? [])
    : [];
  const skillsInCollection = skillIdsInCollection
    .map((id) => skills.find((sw) => sw.skill.id === id)?.skill)
    .filter(Boolean);

  // ── 导入技能集 ──────────────────────────────────────────────────────────────
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.name.endsWith('.skillcol')) {
      toast.error('仅支持 .skillcol 格式，请使用「导出技能集」生成的文件');
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error('文件读取失败');
      return;
    }
    let data: ImportFileData;
    try {
      data = decodeSkillCol(text) as ImportFileData;
    } catch (decodeErr) {
      toast.error(String(decodeErr));
      return;
    }
    if (!data.name || !Array.isArray(data.skills)) {
      toast.error('文件内容无效：缺少 name 或 skills 字段');
      return;
    }
    // 弹出导入选择界面，让用户决定如何处理每个技能
    setImportPayload(data as ImportPayload);
  };

  // ── 导出技能集 ──────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!selectedCollection) return;
    const toastId = toast.loading(`正在打包 ${skillIdsInCollection.length} 个技能...`);
    // 对每个技能目录进行完整 ZIP 打包，返回 Base64
    const skillPacks: Record<string, { name: string; description?: string; version?: string; zip_b64: string }> = {};
    let packed = 0;
    for (const id of skillIdsInCollection) {
      const sw = skills.find((s) => s.skill.id === id);
      if (!sw) continue;
      try {
        const zip_b64 = await packSkillToZip(id);
        skillPacks[id] = {
          name: sw.skill.name,
          description: sw.skill.description,
          version: sw.skill.version,
          zip_b64,
        };
        packed++;
        toast.loading(`正在打包... ${packed}/${skillIdsInCollection.length}`, { id: toastId });
      } catch {
        // 打包失败（如技能目录不存在）则只携带元数据
        skillPacks[id] = {
          name: sw.skill.name,
          description: sw.skill.description,
          version: sw.skill.version,
          zip_b64: '',
        };
      }
    }
    const data = {
      name: selectedCollection.name,
      description: selectedCollection.description,
      skills: skillIdsInCollection,
      skill_packs: skillPacks,
      exported_at: new Date().toISOString(),
    };
    const safeName = selectedCollection.name.replace(/[\\/:*?"<>|]/g, '_');
    const defaultFilename = `${safeName}.skillcol`;
    try {
      toast.loading('正在整理技能数据并打包...', { id: toastId });
      const encoded = encodeSkillCol(data);
      const savedPath = await exportCollectionToFile(defaultFilename, encoded);
      if (savedPath === null) {
        toast.dismiss(toastId);
        return;
      }
      toast.success(`技能集合已导出到 ${savedPath}（含 ${packed} 个技能完整包）`, { id: toastId });
    } catch (e) {
      toast.error(`导出失败：${String(e)}`, { id: toastId });
    }
  };

  // ── 删除技能集 ──────────────────────────────────────────────────────────────
  const handleDeleteCollectionConfirm = async () => {
    if (!selectedCollectionId) return;
    await remove(selectedCollectionId);
    setShowDeleteCollectionModal(false);
    toast.success('已删除技能集合');
  };

  // ── 打开编辑 Modal ──────────────────────────────────────────────────────────
  const handleOpenEdit = () => {
    if (!selectedCollection) return;
    setEditName(selectedCollection.name);
    setEditDesc(selectedCollection.description ?? '');
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!selectedCollectionId || !editName.trim()) return;
    await update(selectedCollectionId, editName.trim(), editDesc.trim() || undefined);
    setShowEditModal(false);
    toast.success('集合信息已更新');
  };

  return (
    <div className="flex flex-col h-full">
      {/* 隐藏的文件选择输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".skillcol"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-base font-semibold text-gray-900">技能集合</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50"
          >
            <Upload size={12} />
            导入技能集
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Plus size={12} />
            新建技能集
          </button>
        </div>
      </div>

      {/* Collection tabs */}
      {collections.length > 0 && (
        <div className="flex items-center gap-1 px-6 pt-3 border-b overflow-x-auto">
          {collections.map((col) => (
            <button
              key={col.id}
              onClick={() => selectCollection(col.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md mb-2 whitespace-nowrap transition-colors',
                selectedCollectionId === col.id
                  ? 'bg-purple-100 text-purple-700 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Layers size={12} />
              {col.name}
            </button>
          ))}
        </div>
      )}

      {/* Collection content */}
      {selectedCollection ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Collection header */}
          <div className="flex items-center justify-between px-6 py-3 border-b">
            <div>
              <p className="text-sm font-medium text-gray-900">{selectedCollection.name}</p>
              {selectedCollection.description && (
                <p className="text-xs text-gray-500">{selectedCollection.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenEdit}
                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                <Edit2 size={11} />
                编辑
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                <Download size={11} />
                导出
              </button>
              <button
                onClick={() => setShowDeleteCollectionModal(true)}
                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded hover:bg-red-50 text-red-500"
              >
                <Trash2 size={11} />
                删除
              </button>
            </div>
          </div>

          {/* Skills in collection */}
          <div className="flex items-center justify-between px-6 py-2 bg-gray-50/50 border-b">
            <span className="text-xs text-gray-600">技能 ({skillsInCollection.length})</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBatchInstall(true)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50"
              >
                批量分发到平台
              </button>
              <button
                onClick={() => setShowAddSkill(true)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                <Plus size={11} />
                添加技能
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {skillsInCollection.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <p className="text-sm">集合为空</p>
                <p className="text-xs mt-1">点击「添加技能」从中央库添加</p>
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {skillsInCollection.map((skill) => skill && (
                  <div
                    key={skill.id}
                    className="group border rounded-xl p-4 bg-white hover:shadow-sm hover:border-gray-300 transition-all flex flex-col gap-2"
                  >
                    {/* 标题行 + 删除按钮 */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate leading-snug flex-1 min-w-0">
                        {skill.name}
                      </p>
                      <button
                        onClick={() => setRemoveSkillTarget({ id: skill.id, name: skill.name })}
                        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all"
                        title="从集合中删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {/* 描述 */}
                    {skill.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {skill.description}
                      </p>
                    )}

                    {/* 底部元信息 */}
                    <div className="flex items-center gap-1.5 mt-auto pt-1 flex-wrap">
                      {/* 来源 Tag */}
                      {(() => {
                        const cfg = SOURCE_CONFIG[skill.source] ?? SOURCE_CONFIG.local;
                        return (
                          <span className={cn(
                            'inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md border',
                            cfg.className
                          )}>
                            {cfg.icon}{cfg.label}
                          </span>
                        );
                      })()}
                      {/* 版本号 */}
                      {skill.version && (
                        <span className="text-[9px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono">
                          {skill.version}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Layers size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {collections.length === 0 ? '暂无技能集合' : '选择一个技能集合'}
            </p>
            {collections.length === 0 && (
              <button
                onClick={() => setShowNewModal(true)}
                className="mt-3 text-xs text-purple-600 hover:text-purple-700"
              >
                + 新建技能集合
              </button>
            )}
          </div>
        </div>
      )}

      {/* 删除集合确认 Modal */}
      {showDeleteCollectionModal && selectedCollection && (
        <ConfirmModal
          title="删除技能集合"
          description={<>确定要删除集合 <span className="font-medium text-gray-800">「{selectedCollection.name}」</span> 吗？此操作不可恢复。</>}
          confirmLabel="确认删除"
          onConfirm={handleDeleteCollectionConfirm}
          onCancel={() => setShowDeleteCollectionModal(false)}
        />
      )}

      {/* 从集合删除技能确认 Modal */}
      {removeSkillTarget && selectedCollectionId && (
        <ConfirmModal
          title="删除技能"
          description={<>确定要将 <span className="font-bold text-[13px] text-amber-700">「{removeSkillTarget.name}」</span> 技能从 <span className="font-medium text-gray-800">{selectedCollection?.name}</span> 集合中删除吗？此操作不可恢复。</>}
          confirmLabel="确认删除"
          onConfirm={async () => {
            await removeSkillFromCollection(selectedCollectionId, removeSkillTarget.id);
            setRemoveSkillTarget(null);
            toast.success(`已删除 ${removeSkillTarget.name}`);
          }}
          onCancel={() => setRemoveSkillTarget(null)}
        />
      )}

      {/* New collection modal（两步向导） */}
      {showNewModal && (
        <NewCollectionModal
          collections={collections}
          collectionSkillIds={collectionSkillIds}
          skills={skills}
          onCreate={async (name, desc, selectedSkillIds) => {
            const col = await create(name, desc);
            for (const sid of selectedSkillIds) {
              await addSkill(col.id, sid);
            }
            selectCollection(col.id);
            setShowNewModal(false);
            toast.success(`已创建技能集合「${col.name}」，包含 ${selectedSkillIds.length} 个技能`);
          }}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {/* Edit collection modal */}
      {showEditModal && selectedCollection && (
        <Modal title="编辑技能集合" onClose={() => setShowEditModal(false)}>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="集合名称"
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300"
            autoFocus
          />
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="描述（可选）"
            rows={2}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm text-gray-500">取消</button>
            <button
              onClick={handleEditSave}
              disabled={!editName.trim()}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </Modal>
      )}

      {/* Add skill modal */}
      {showAddSkill && selectedCollectionId && (
        <AddSkillModal
          collections={collections}
          collectionSkillIds={collectionSkillIds}
          skills={skills}
          excludeIds={skillIdsInCollection}
          onAdd={async (skillId, skillName) => {
            await addSkill(selectedCollectionId, skillId);
            toast.success(`已添加 ${skillName}`);
          }}
          onClose={() => setShowAddSkill(false)}
        />
      )}

      {/* Batch deploy modal */}
      {showBatchInstall && selectedCollectionId && (
        <BatchDeployModal
          skillIds={skillIdsInCollection}
          onClose={() => setShowBatchInstall(false)}
        />
      )}

      {importPayload && (
        <ImportSelectModal
          payload={importPayload}
          localSkillIds={skills.map((sw) => sw.skill.id)}
          onConfirm={async (colName, colDesc, selectedIds) => {
            setImportPayload(null);
            const toastId = toast.loading(`正在导入 ${selectedIds.length} 个技能...`);
            try {
              const col = await create(colName, colDesc);
              let unpacked = 0;
              for (const sid of selectedIds) {
                const pack = importPayload.skill_packs?.[sid];
                // 本地不存在且有 ZIP 包 → 解压到中央库
                if (!skills.some((sw) => sw.skill.id === sid) && pack?.zip_b64) {
                  try {
                    await unpackSkillToCentral(sid, pack.zip_b64, false);
                    unpacked++;
                    toast.loading(`正在解压... ${unpacked}`, { id: toastId });
                  } catch {
                    // 忽略单个技能解压失败，继续其他技能
                  }
                }
                await addSkill(col.id, sid);
              }
              selectCollection(col.id);
              // 刷新中央库以加载新解压的技能
              if (unpacked > 0) {
                await useCentralSkillsStore.getState().load();
              }
              toast.success(
                `已导入集合「${col.name}」，含 ${selectedIds.length} 个技能（新增 ${unpacked} 个到中央库）`,
                { id: toastId }
              );
            } catch (e) {
              toast.error(`导入失败：${String(e)}`, { id: toastId });
            }
          }}
          onClose={() => setImportPayload(null)}
        />
      )}
    </div>
  );
}

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface SkillPackEntry {
  name: string;
  description?: string;
  version?: string;
  zip_b64: string; // 完整技能目录的 Base64 ZIP
}

interface ImportFileData {
  name?: string;
  description?: string;
  skills?: string[];
  skill_packs?: Record<string, SkillPackEntry>;
  exported_at?: string;
}

type ImportPayload = Required<Pick<ImportFileData, 'name' | 'skills'>> & Omit<ImportFileData, 'name' | 'skills'>;

// ── 导入选择 Modal ────────────────────────────────────────────────────────────

interface ImportSelectModalProps {
  payload: ImportPayload;
  localSkillIds: string[];
  onConfirm: (colName: string, colDesc: string | undefined, selectedIds: string[]) => Promise<void>;
  onClose: () => void;
}

function ImportSelectModal({ payload, localSkillIds, onConfirm, onClose }: ImportSelectModalProps) {
  const [colName, setColName] = useState(payload.name);
  const [colDesc, setColDesc] = useState(payload.description ?? '');
  const [selected, setSelected] = useState<string[]>(payload.skills);
  const [confirming, setConfirming] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);

  const allSelected = selected.length === payload.skills.length;

  const handleConfirm = async () => {
    if (!colName.trim() || confirming) return;
    setConfirming(true);
    try {
      await onConfirm(colName.trim(), colDesc.trim() || undefined, selected);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900">导入技能集合</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={14} /></button>
        </div>

        {/* 集合名称/描述 */}
        <div className="px-4 pt-3 pb-2 flex flex-col gap-2 border-b">
          <input
            type="text"
            value={colName}
            onChange={(e) => setColName(e.target.value)}
            placeholder="集合名称"
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300"
            autoFocus
          />
          <input
            type="text"
            value={colDesc}
            onChange={(e) => setColDesc(e.target.value)}
            placeholder="描述（可选）"
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>

        {/* 技能列表 */}
        <div className="px-4 py-2 border-b flex items-center justify-between">
          <span className="text-xs text-gray-500">选择要安装的技能（{payload.skills.length} 个）</span>
          <button
            onClick={() => setSelected(allSelected ? [] : [...payload.skills])}
            className="text-xs text-purple-600 hover:text-purple-700"
          >
            {allSelected ? '取消全选' : '全选'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-1">
          {payload.skills.map((sid) => {
            const entry = payload.skill_packs?.[sid];
            const isLocal = localSkillIds.includes(sid);
            const hasContent = !!entry?.zip_b64;
            const isSelected = selected.includes(sid);

            let statusBadge: React.ReactNode;
            if (isLocal) {
              statusBadge = <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">本地已有</span>;
            } else if (hasContent) {
              statusBadge = <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">将新增到中央库</span>;
            } else {
              statusBadge = <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">无内容（仅记录 ID）</span>;
            }

            return (
              <button
                key={sid}
                onClick={() => toggle(sid)}
                className={cn(
                  'flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-colors',
                  isSelected ? 'bg-purple-50 border border-purple-200' : 'hover:bg-gray-50 border border-transparent'
                )}
              >
                <div className={cn(
                  'mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center',
                  isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                )}>
                  {isSelected && <Check size={10} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{entry?.name ?? sid}</span>
                    {entry?.version && (
                      <span className="text-[9px] text-gray-400 bg-gray-100 px-1 rounded font-mono">{entry.version}</span>
                    )}
                    {statusBadge}
                  </div>
                  {entry?.description && (
                    <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{entry.description}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-between">
          <span className="text-xs text-gray-400">已选 {selected.length} / {payload.skills.length} 个技能</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">取消</button>
            <button
              onClick={handleConfirm}
              disabled={!colName.trim() || selected.length === 0 || confirming}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {confirming ? '导入中...' : `导入 ${selected.length} 个技能`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 子组件 ────────────────────────────────────────────────────────────────────

function Layers({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </svg>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={14} /></button>
        </div>
        <div className="p-4 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-[340px] p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
            <Trash2 size={14} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 新建集合两步向导 ────────────────────────────────────────────────────────────

interface Collection { id: string; name: string; description?: string }
interface SkillWithInstalls { skill: { id: string; name: string; description?: string; version?: string }; installs: string[] }

interface NewCollectionModalProps {
  collections: Collection[];
  collectionSkillIds: Record<string, string[]>;
  skills: SkillWithInstalls[];
  onCreate: (name: string, desc: string | undefined, skillIds: string[]) => Promise<void>;
  onClose: () => void;
}

function NewCollectionModal({ collections, collectionSkillIds, skills, onCreate, onClose }: NewCollectionModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [allSkillIds, setAllSkillIds] = useState<Record<string, string[]>>(collectionSkillIds);
  const [creating, setCreating] = useState(false);

  const handleNextStep = async () => {
    if (!name.trim()) return;
    // 加载还没缓存的集合技能 id
    const missing = collections.filter((c) => !(c.id in allSkillIds));
    if (missing.length > 0) {
      const loaded: Record<string, string[]> = { ...allSkillIds };
      for (const col of missing) {
        try {
          loaded[col.id] = await getCollectionSkills(col.id);
        } catch {
          loaded[col.id] = [];
        }
      }
      setAllSkillIds(loaded);
    }
    setStep(2);
  };

  const toggleSkill = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), desc.trim() || undefined, selectedIds);
    } finally {
      setCreating(false);
    }
  };

  const filteredSkills = skills.filter((sw) =>
    !search || sw.skill.name.toLowerCase().includes(search.toLowerCase())
  );

  // 每个技能所属的集合名称列表
  const getCollectionTags = (skillId: string): string[] => {
    return collections
      .filter((col) => (allSkillIds[col.id] ?? []).includes(skillId))
      .map((col) => col.name);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">新建技能集合</h3>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
              {step}/2
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={14} /></button>
        </div>

        {step === 1 ? (
          <div className="p-4 flex flex-col gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="集合名称"
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && handleNextStep()}
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="描述（可选）"
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300"
            />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">取消</button>
              <button
                onClick={handleNextStep}
                disabled={!name.trim()}
                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                下一步
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 pt-3 pb-2 border-b">
              <p className="text-xs text-gray-500 mb-2">选择要加入集合的技能（可选，稍后可修改）</p>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索技能..."
                  className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-1">
              {filteredSkills.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">暂无可选技能</p>
              ) : (
                filteredSkills.map((sw) => {
                  const tags = getCollectionTags(sw.skill.id);
                  const isSelected = selectedIds.includes(sw.skill.id);
                  return (
                    <button
                      key={sw.skill.id}
                      onClick={() => toggleSkill(sw.skill.id)}
                      className={cn(
                        'flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-colors',
                        isSelected ? 'bg-purple-50 border border-purple-200' : 'hover:bg-gray-50 border border-transparent'
                      )}
                    >
                      <div className={cn(
                        'mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center',
                        isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                      )}>
                        {isSelected && <Check size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{sw.skill.name}</span>
                          {sw.skill.version && (
                            <span className="text-[9px] text-gray-400 bg-gray-100 px-1 rounded font-mono">{sw.skill.version}</span>
                          )}
                        </div>
                        {sw.skill.description && (
                          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{sw.skill.description}</p>
                        )}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tags.map((tag) => (
                              <span key={tag} className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-3 border-t flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {selectedIds.length > 0 ? `已选 ${selectedIds.length} 个技能` : '未选择技能（稍后可添加）'}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                  上一步
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── 添加技能到现有集合 ────────────────────────────────────────────────────────

interface AddSkillModalProps {
  collections: Collection[];
  collectionSkillIds: Record<string, string[]>;
  skills: SkillWithInstalls[];
  excludeIds: string[];
  onAdd: (skillId: string, skillName: string) => Promise<void>;
  onClose: () => void;
}

function AddSkillModal({ collections, collectionSkillIds, skills, excludeIds, onAdd, onClose }: AddSkillModalProps) {
  const [search, setSearch] = useState('');

  const getCollectionTags = (skillId: string): string[] =>
    collections
      .filter((col) => (collectionSkillIds[col.id] ?? []).includes(skillId))
      .map((col) => col.name);

  const filtered = skills
    .filter((sw) => !excludeIds.includes(sw.skill.id))
    .filter((sw) => !search || sw.skill.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm flex flex-col max-h-[75vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900">添加技能到集合</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={14} /></button>
        </div>
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索技能..."
              className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-300"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-1">
          {filtered.map((sw) => {
            const tags = getCollectionTags(sw.skill.id);
            return (
              <button
                key={sw.skill.id}
                onClick={() => onAdd(sw.skill.id, sw.skill.name)}
                className="flex items-start gap-2 p-2.5 rounded-lg hover:bg-purple-50 text-left transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{sw.skill.name}</span>
                    {sw.skill.version && (
                      <span className="text-[9px] text-gray-400 bg-gray-100 px-1 rounded font-mono">{sw.skill.version}</span>
                    )}
                  </div>
                  {sw.skill.description && (
                    <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{sw.skill.description}</p>
                  )}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map((tag) => (
                        <span key={tag} className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              {skills.filter((sw) => !excludeIds.includes(sw.skill.id)).length === 0
                ? '中央库中的所有技能已在此集合中'
                : '未找到匹配的技能'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 分发到平台 Modal ─────────────────────────────────────────────────────────

function BatchDeployModal({ skillIds, onClose }: { skillIds: string[]; onClose: () => void }) {
  const [platforms, setPlatforms] = useState<{ id: string; name: string; path: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    getPlatformPaths().then(setPlatforms);
  }, []);

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const selectedPaths = platforms.filter((p) => selected.includes(p.id)).map((p) => p.path);
      const results = await batchInstallCollection(skillIds, selectedPaths, false);
      const success = results.filter((r) => r.success).length;
      toast.success(`已将 ${success} 个技能分发到 ${selected.length} 个平台`);
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDeploying(false);
    }
  };

  return (
    <Modal title="批量分发到平台" onClose={onClose}>
      <p className="text-xs text-gray-500">将 {skillIds.length} 个技能分发到以下平台：</p>
      <div className="flex flex-col gap-2">
        {platforms.map((p) => (
          <label key={p.id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={(e) => {
                setSelected(
                  e.target.checked ? [...selected, p.id] : selected.filter((s) => s !== p.id)
                );
              }}
              className="rounded"
            />
            <span className="text-sm text-gray-700">{p.name}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">取消</button>
        <button
          onClick={handleDeploy}
          disabled={selected.length === 0 || deploying}
          className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {deploying ? '分发中...' : '确认分发'}
        </button>
      </div>
    </Modal>
  );
}
