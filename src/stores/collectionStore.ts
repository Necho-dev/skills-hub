import { create } from 'zustand';
import type { Collection } from '@/types';
import {
  getCollections, createCollection, updateCollection, deleteCollection,
  getCollectionSkills, addSkillToCollection, removeSkillFromCollection,
} from '@/lib/db';

interface CollectionState {
  collections: Collection[];
  selectedCollectionId: string | null;
  collectionSkillIds: Record<string, string[]>;
  loading: boolean;

  load: () => Promise<void>;
  selectCollection: (id: string | null) => Promise<void>;
  create: (name: string, description?: string) => Promise<Collection>;
  update: (id: string, name: string, description?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addSkill: (collectionId: string, skillId: string) => Promise<void>;
  removeSkill: (collectionId: string, skillId: string) => Promise<void>;
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  collections: [],
  selectedCollectionId: null,
  collectionSkillIds: {},
  loading: false,

  load: async () => {
    set({ loading: true });
    const collections = await getCollections();
    set({ collections, loading: false });
  },

  selectCollection: async (id) => {
    set({ selectedCollectionId: id });
    if (!id) return;
    if (!get().collectionSkillIds[id]) {
      const skillIds = await getCollectionSkills(id);
      set((state) => ({
        collectionSkillIds: { ...state.collectionSkillIds, [id]: skillIds },
      }));
    }
  },

  create: async (name, description) => {
    const col = await createCollection(name, description);
    set((state) => ({ collections: [col, ...state.collections] }));
    return col;
  },

  update: async (id, name, description) => {
    await updateCollection(id, name, description);
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === id ? { ...c, name, description } : c
      ),
    }));
  },

  remove: async (id) => {
    await deleteCollection(id);
    set((state) => {
      const remaining = state.collections.filter((c) => c.id !== id);
      const newSelected = state.selectedCollectionId === id
        ? (remaining[0]?.id ?? null)
        : state.selectedCollectionId;
      return { collections: remaining, selectedCollectionId: newSelected };
    });
    // 若切换到新集合，异步加载其技能 id
    const newId = get().selectedCollectionId;
    if (newId && !get().collectionSkillIds[newId]) {
      const skillIds = await getCollectionSkills(newId);
      set((state) => ({ collectionSkillIds: { ...state.collectionSkillIds, [newId]: skillIds } }));
    }
  },

  addSkill: async (collectionId, skillId) => {
    await addSkillToCollection(collectionId, skillId);
    set((state) => ({
      collectionSkillIds: {
        ...state.collectionSkillIds,
        [collectionId]: [...(state.collectionSkillIds[collectionId] ?? []), skillId],
      },
    }));
  },

  removeSkill: async (collectionId, skillId) => {
    await removeSkillFromCollection(collectionId, skillId);
    set((state) => ({
      collectionSkillIds: {
        ...state.collectionSkillIds,
        [collectionId]: (state.collectionSkillIds[collectionId] ?? []).filter((id) => id !== skillId),
      },
    }));
  },
}));
