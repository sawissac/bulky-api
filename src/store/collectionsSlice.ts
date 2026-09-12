import { createSlice, createSelector, nanoid, type PayloadAction } from '@reduxjs/toolkit';
import {
  type Collection,
  type CollectionItem,
  type DbConnection,
  type Environment,
} from '@/lib/sampleData';
import { newConnection } from '@/lib/dbConnection';
import { descendantFolderIds } from '@/lib/collectionTree';

const RECENT_LIMIT = 6;

type CollectionsState = {
  collections: Collection[];
  activeId: string | null;
  recentItemIds: string[];
  // Variables every environment in every collection inherits and can shadow
  // with a key of its own. Merged under the active environment's own vars by
  // `selectEnvVars`.
  baseVars: Record<string, string>;
};

const initialState: CollectionsState = {
  collections: [],
  activeId: null,
  recentItemIds: [],
  baseVars: {},
};

function pushRecent(state: CollectionsState, id: string) {
  state.recentItemIds = [id, ...state.recentItemIds.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
}

// Helper to find the collection containing a specific environment
function findCollectionForEnv(state: CollectionsState, envId: string): Collection | undefined {
  return state.collections.find(c => c.environments.some(e => e.id === envId));
}

/** `connections` is optional on `Collection` (a collection saved before the DB
 *  pane existed has none), so every reducer that writes one materializes the
 *  array first rather than guarding at each use. */
function connectionsOf(col: Collection): DbConnection[] {
  col.connections ??= [];
  return col.connections;
}

function findCollectionForConn(state: CollectionsState, connId: string): Collection | undefined {
  return state.collections.find(c => (c.connections ?? []).some(x => x.id === connId));
}

/**
 * Re-slots the row `movedId` in a flat array so it sits immediately before
 * `beforeId`, or after the last of its `isSibling` peers when `beforeId` is
 * null (drop at the end of a container). Order in the flat array is what the
 * sidebar tree and the Supabase `position` both read, so a cross-container move
 * updates the row's parent pointer first, then calls this. The row is pulled
 * out before the anchor is located, so a downward move within one container
 * lands where the pointer expects.
 */
function repositionBefore<T extends { id: string }>(
  arr: T[],
  movedId: string,
  isSibling: (row: T) => boolean,
  beforeId: string | null,
): void {
  const from = arr.findIndex((r) => r.id === movedId);
  if (from < 0) return;
  const [moved] = arr.splice(from, 1);
  if (beforeId) {
    const at = arr.findIndex((r) => r.id === beforeId);
    if (at >= 0) {
      arr.splice(at, 0, moved);
      return;
    }
  }
  const siblings = arr.filter(isSibling);
  const at = siblings.length
    ? arr.indexOf(siblings[siblings.length - 1]) + 1
    : arr.length;
  arr.splice(at, 0, moved);
}

// Removed getActiveCollection

const collectionsSlice = createSlice({
  name: 'collections',
  initialState,
  reducers: {
    setActiveId(state, action: PayloadAction<string | null>) {
      state.activeId = action.payload;
      if (action.payload) pushRecent(state, action.payload);
    },
    toggleCollectionOpen(state, action: PayloadAction<string>) {
      const col = state.collections.find((c) => c.id === action.payload);
      if (col) col.open = !col.open;
    },
    addCollection(state, action: PayloadAction<string>) {
      state.collections.push({ 
        id: nanoid(), 
        name: action.payload, 
        open: true, 
        items: [],
        environments: [],
        envIdx: 0
      });
    },
    importCollections(state, action: PayloadAction<Collection[]>) {
      const imported = action.payload;
      for (const col of imported) {
        // give fresh IDs to avoid collision
        col.id = nanoid();

        // Re-id folders first, then rewrite every parent/child pointer through
        // the same old→new map so an imported tree keeps its shape without
        // colliding with existing ids. An unresolved pointer drops to root.
        if (!col.folders) col.folders = [];
        const folderIdMap = new Map<string, string>();
        col.folders.forEach((f) => {
          const next = nanoid();
          folderIdMap.set(f.id, next);
          f.id = next;
        });
        col.folders.forEach((f) => {
          f.parentId = f.parentId ? folderIdMap.get(f.parentId) ?? null : null;
        });
        col.items.forEach((i) => {
          i.id = nanoid();
          i.folderId = i.folderId ? folderIdMap.get(i.folderId) ?? null : null;
        });

        if (!col.environments) col.environments = [];
        col.environments.forEach((e) => (e.id = nanoid()));
        col.envIdx = col.envIdx || 0;
        state.collections.push(col);
      }
    },
    removeCollection(state, action: PayloadAction<string>) {
      const col = state.collections.find((c) => c.id === action.payload);
      if (col && state.activeId && col.items.some((i) => i.id === state.activeId)) state.activeId = null;
      state.collections = state.collections.filter((c) => c.id !== action.payload);
    },
    renameCollection(state, action: PayloadAction<{ id: string; name: string }>) {
      const col = state.collections.find((c) => c.id === action.payload.id);
      if (col && action.payload.name.trim()) col.name = action.payload.name;
    },
    addItem(
      state,
      action: PayloadAction<{
        collectionId: string;
        name?: string;
        method?: string;
        code?: string;
        folderId?: string | null;
      }>,
    ) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      if (!col) return;
      const folderId = action.payload.folderId ?? null;
      const item: CollectionItem = {
        id: nanoid(),
        name: action.payload.name ?? 'New Test',
        method: action.payload.method ?? 'GET',
        code: action.payload.code ?? `// New Test\nconst r = await api.get(env.baseUrl + '/');\nconsole.log(r.status);\n`,
        folderId,
      };
      col.items.push(item);
      col.open = true;
      if (folderId) {
        const folder = col.folders?.find((f) => f.id === folderId);
        if (folder) folder.open = true;
      }
      state.activeId = item.id;
      pushRecent(state, item.id);
    },
    removeItem(state, action: PayloadAction<{ collectionId: string; itemId: string }>) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      if (col) col.items = col.items.filter((i) => i.id !== action.payload.itemId);
      if (state.activeId === action.payload.itemId) state.activeId = null;
      state.recentItemIds = state.recentItemIds.filter((x) => x !== action.payload.itemId);
    },
    renameItem(state, action: PayloadAction<{ itemId: string; name: string }>) {
      if (!action.payload.name.trim()) return;
      for (const col of state.collections) {
        const item = col.items.find((i) => i.id === action.payload.itemId);
        if (item) { item.name = action.payload.name; return; }
      }
    },
    setItemMethod(state, action: PayloadAction<{ itemId: string; method: string }>) {
      for (const col of state.collections) {
        const item = col.items.find((i) => i.id === action.payload.itemId);
        if (item) { item.method = action.payload.method; return; }
      }
    },
    saveItemCode(state, action: PayloadAction<{ itemId: string; code: string }>) {
      for (const col of state.collections) {
        const item = col.items.find((i) => i.id === action.payload.itemId);
        if (item) { item.code = action.payload.code; return; }
      }
    },
    setCollectionHook(
      state,
      action: PayloadAction<{ collectionId: string; hook: 'preRun' | 'postRun'; code: string }>,
    ) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      if (col) col[action.payload.hook] = action.payload.code;
    },
    // --- Folder Reducers ---
    addFolder(
      state,
      action: PayloadAction<{ collectionId: string; parentId?: string | null; name: string }>,
    ) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      if (!col || !action.payload.name.trim()) return;
      col.folders ??= [];
      const parentId = action.payload.parentId ?? null;
      col.folders.push({ id: nanoid(), name: action.payload.name, parentId, open: true });
      col.open = true;
      if (parentId) {
        const parent = col.folders.find((f) => f.id === parentId);
        if (parent) parent.open = true;
      }
    },
    renameFolder(state, action: PayloadAction<{ collectionId: string; folderId: string; name: string }>) {
      if (!action.payload.name.trim()) return;
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      const folder = col?.folders?.find((f) => f.id === action.payload.folderId);
      if (folder) folder.name = action.payload.name;
    },
    toggleFolderOpen(state, action: PayloadAction<{ collectionId: string; folderId: string }>) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      const folder = col?.folders?.find((f) => f.id === action.payload.folderId);
      if (folder) folder.open = !folder.open;
    },
    removeFolder(state, action: PayloadAction<{ collectionId: string; folderId: string }>) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      if (!col?.folders) return;
      // Cascade: the folder, every folder nested under it, and every item in
      // any of them. The UI dispatches `removeItem` per item first so the
      // runner/ui cross-slice cleanup runs; the filter here is the safety net
      // for a direct call.
      const doomed = descendantFolderIds(col.folders, action.payload.folderId);
      col.folders = col.folders.filter((f) => !doomed.has(f.id));
      const removedItemIds = new Set(
        col.items.filter((i) => i.folderId != null && doomed.has(i.folderId)).map((i) => i.id),
      );
      col.items = col.items.filter((i) => !removedItemIds.has(i.id));
      if (state.activeId && removedItemIds.has(state.activeId)) state.activeId = null;
      state.recentItemIds = state.recentItemIds.filter((x) => !removedItemIds.has(x));
    },
    moveItem(
      state,
      action: PayloadAction<{
        collectionId: string;
        itemId: string;
        targetFolderId: string | null;
        beforeId: string | null;
      }>,
    ) {
      const { collectionId, itemId, targetFolderId, beforeId } = action.payload;
      const col = state.collections.find((c) => c.id === collectionId);
      const item = col?.items.find((i) => i.id === itemId);
      if (!col || !item) return;
      if (targetFolderId && !col.folders?.some((f) => f.id === targetFolderId)) return;
      item.folderId = targetFolderId;
      repositionBefore(
        col.items,
        itemId,
        (i) => (i.folderId ?? null) === targetFolderId,
        beforeId,
      );
    },
    moveFolder(
      state,
      action: PayloadAction<{
        collectionId: string;
        folderId: string;
        targetParentId: string | null;
        beforeId: string | null;
      }>,
    ) {
      const { collectionId, folderId, targetParentId, beforeId } = action.payload;
      const col = state.collections.find((c) => c.id === collectionId);
      if (!col?.folders) return;
      const folder = col.folders.find((f) => f.id === folderId);
      if (!folder) return;
      // Can't drop a folder into itself or into one of its own descendants.
      if (targetParentId && descendantFolderIds(col.folders, folderId).has(targetParentId)) return;
      if (targetParentId && !col.folders.some((f) => f.id === targetParentId)) return;
      folder.parentId = targetParentId;
      repositionBefore(
        col.folders,
        folderId,
        (f) => f.parentId === targetParentId,
        beforeId,
      );
    },
    moveCollection(state, action: PayloadAction<{ id: string; beforeId: string | null }>) {
      repositionBefore(state.collections, action.payload.id, () => true, action.payload.beforeId);
    },
    hydrateCollections(_state, action: PayloadAction<CollectionsState>) {
      return {
        ...action.payload,
        recentItemIds: action.payload.recentItemIds ?? [],
        baseVars: action.payload.baseVars ?? {},
        collections: (action.payload.collections ?? []).map((c) => ({
          ...c,
          folders: c.folders ?? [],
          items: c.items.map((i) => ({ ...i, folderId: i.folderId ?? null })),
        })),
      };
    },
    // --- Environment Reducers ---
    setEnvIdx(state, action: PayloadAction<{ collectionId: string; envIdx: number }>) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      if (col) col.envIdx = action.payload.envIdx;
    },
    addEnvironment(state, action: PayloadAction<{ collectionId: string; name: string }>) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      if (col) {
        col.environments.push({ id: nanoid(), name: action.payload.name, vars: {} });
      }
    },
    removeEnvironment(state, action: PayloadAction<string>) {
      const col = findCollectionForEnv(state, action.payload);
      if (!col) return;
      const idx = col.environments.findIndex((e) => e.id === action.payload);
      if (idx < 0) return;
      col.environments.splice(idx, 1);
      if (col.envIdx >= col.environments.length) {
        col.envIdx = Math.max(0, col.environments.length - 1);
      }
    },
    renameEnvironment(state, action: PayloadAction<{ id: string; name: string }>) {
      const col = findCollectionForEnv(state, action.payload.id);
      if (!col) return;
      const env = col.environments.find((e) => e.id === action.payload.id);
      if (env) env.name = action.payload.name;
    },
    duplicateEnvironment(state, action: PayloadAction<string>) {
      const col = findCollectionForEnv(state, action.payload);
      if (!col) return;
      const src = col.environments.find((e) => e.id === action.payload);
      if (!src) return;
      col.environments.push({ id: nanoid(), name: `${src.name} Copy`, vars: { ...src.vars } });
    },
    // --- Database Connection Reducers ---
    setConnIdx(state, action: PayloadAction<{ collectionId: string; connIdx: number }>) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      if (col) col.connIdx = action.payload.connIdx;
    },
    addConnection(state, action: PayloadAction<{ collectionId: string; name: string }>) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      if (!col) return;
      const list = connectionsOf(col);
      list.push(newConnection(nanoid(), action.payload.name));
      // A first connection becomes the active one — otherwise it would sit
      // there configured and unused until the row was clicked.
      if (list.length === 1) col.connIdx = 0;
    },
    updateConnection(
      state,
      action: PayloadAction<{ id: string; patch: Partial<Omit<DbConnection, 'id'>> }>,
    ) {
      const col = findCollectionForConn(state, action.payload.id);
      if (!col) return;
      const conn = (col.connections ?? []).find((c) => c.id === action.payload.id);
      if (conn) Object.assign(conn, action.payload.patch);
    },
    removeConnection(state, action: PayloadAction<string>) {
      const col = findCollectionForConn(state, action.payload);
      if (!col) return;
      const list = connectionsOf(col);
      const idx = list.findIndex((c) => c.id === action.payload);
      if (idx < 0) return;
      list.splice(idx, 1);
      if ((col.connIdx ?? 0) >= list.length) col.connIdx = Math.max(0, list.length - 1);
    },
    duplicateConnection(state, action: PayloadAction<string>) {
      const col = findCollectionForConn(state, action.payload);
      if (!col) return;
      const list = connectionsOf(col);
      const src = list.find((c) => c.id === action.payload);
      if (!src) return;
      list.push({ ...src, id: nanoid(), name: `${src.name} Copy` });
    },
    mergeEnvironments(state, action: PayloadAction<{ collectionId: string; environments: Environment[] }>) {
      const col = state.collections.find((c) => c.id === action.payload.collectionId);
      if (!col) return;
      for (const env of action.payload.environments) {
        col.environments.push({ id: nanoid(), name: env.name, vars: { ...env.vars } });
      }
    },
    setVar(state, action: PayloadAction<{ envId: string; key: string; value: string }>) {
      const col = findCollectionForEnv(state, action.payload.envId);
      if (!col) return;
      const env = col.environments.find((e) => e.id === action.payload.envId);
      if (env) env.vars[action.payload.key] = action.payload.value;
    },
    deleteVar(state, action: PayloadAction<{ envId: string; key: string }>) {
      const col = findCollectionForEnv(state, action.payload.envId);
      if (!col) return;
      const env = col.environments.find((e) => e.id === action.payload.envId);
      if (env) delete env.vars[action.payload.key];
    },
    renameVar(state, action: PayloadAction<{ envId: string; oldKey: string; newKey: string }>) {
      const { envId, oldKey, newKey } = action.payload;
      if (!newKey || newKey === oldKey) return;
      const col = findCollectionForEnv(state, envId);
      if (!col) return;
      const env = col.environments.find((e) => e.id === envId);
      if (!env) return;
      env.vars[newKey] = env.vars[oldKey];
      delete env.vars[oldKey];
    },
    // --- Base (global) Variable Reducers ---
    setBaseVar(state, action: PayloadAction<{ key: string; value: string }>) {
      state.baseVars[action.payload.key] = action.payload.value;
    },
    deleteBaseVar(state, action: PayloadAction<{ key: string }>) {
      delete state.baseVars[action.payload.key];
    },
    renameBaseVar(state, action: PayloadAction<{ oldKey: string; newKey: string }>) {
      const { oldKey, newKey } = action.payload;
      if (!newKey || newKey === oldKey) return;
      state.baseVars[newKey] = state.baseVars[oldKey];
      delete state.baseVars[oldKey];
    },
  },
});

export const {
  setActiveId,
  toggleCollectionOpen,
  addCollection,
  importCollections,
  removeCollection,
  renameCollection,
  addItem,
  removeItem,
  renameItem,
  setItemMethod,
  saveItemCode,
  addFolder,
  renameFolder,
  toggleFolderOpen,
  removeFolder,
  moveItem,
  moveFolder,
  moveCollection,
  hydrateCollections,
  setEnvIdx,
  addEnvironment,
  removeEnvironment,
  renameEnvironment,
  duplicateEnvironment,
  setConnIdx,
  addConnection,
  updateConnection,
  removeConnection,
  duplicateConnection,
  mergeEnvironments,
  setVar,
  deleteVar,
  renameVar,
  setBaseVar,
  deleteBaseVar,
  renameBaseVar,
  setCollectionHook,
} = collectionsSlice.actions;
export default collectionsSlice.reducer;

export const selectCollections = (s: { collections: CollectionsState }) => s.collections.collections;
export const selectActiveId    = (s: { collections: CollectionsState }) => s.collections.activeId;

export const selectActiveItem = (s: { collections: CollectionsState }) => {
  const id = s.collections.activeId;
  if (!id) return null;
  for (const col of s.collections.collections) {
    const item = col.items.find((i) => i.id === id);
    if (item) return item;
  }
  return null;
};

export const selectActiveCollection = (s: { collections: CollectionsState }) => {
  const id = s.collections.activeId;
  if (!id) return null;
  return s.collections.collections.find((c) => c.items.some((i) => i.id === id)) ?? null;
};

export const selectRecentItems = (s: { collections: CollectionsState }) => {
  const all: CollectionItem[] = s.collections.collections.flatMap((c) => c.items);
  return s.collections.recentItemIds
    .map((id) => all.find((i) => i.id === id))
    .filter((x): x is CollectionItem => Boolean(x));
};

// --- Environment Selectors ---
export const selectEnvironments = (s: { collections: CollectionsState }) => {
  const col = selectActiveCollection(s);
  return col?.environments ?? [];
};

export const selectEnvIdx = (s: { collections: CollectionsState }) => {
  const col = selectActiveCollection(s);
  return col?.envIdx ?? 0;
};

export const selectActiveEnv = (s: { collections: CollectionsState }) => {
  const col = selectActiveCollection(s);
  if (!col || !col.environments.length) return undefined;
  return col.environments[col.envIdx];
};

const EMPTY_VARS: Record<string, string> = {};

export const selectBaseVars = (s: { collections: CollectionsState }) =>
  s.collections.baseVars ?? EMPTY_VARS;

/** The active environment's own vars, before the base layer is folded in. */
export const selectOwnEnvVars = (s: { collections: CollectionsState }) => {
  const col = selectActiveCollection(s);
  if (!col || !col.environments.length) return EMPTY_VARS;
  return col.environments[col.envIdx]?.vars ?? EMPTY_VARS;
};

/**
 * Everything a script sees as `env.*` / `{{name}}`: the global base vars with
 * the active environment's own vars layered on top (own keys win). Memoized —
 * when there are no base vars this returns the own-vars object by reference, so
 * `useSelector` consumers do not re-render on unrelated state changes.
 */
export const selectEnvVars = createSelector(
  [selectBaseVars, selectOwnEnvVars],
  (base, own) =>
    Object.keys(base).length === 0 ? own : { ...base, ...own },
);

/** The active collection's pre-run / post-run hook scripts (empty strings when
 *  unset or no collection is active). */
export const selectActiveHooks = createSelector(
  [selectActiveCollection],
  (col) => ({ preRun: col?.preRun ?? '', postRun: col?.postRun ?? '' }),
);

// --- Database Connection Selectors ---

const EMPTY_CONNECTIONS: DbConnection[] = [];

export const selectConnections = (s: { collections: CollectionsState }) => {
  const col = selectActiveCollection(s);
  return col?.connections ?? EMPTY_CONNECTIONS;
};

export const selectConnIdx = (s: { collections: CollectionsState }) => {
  const col = selectActiveCollection(s);
  return col?.connIdx ?? 0;
};

/** The connection `api.query.pgsql` uses when a script names none. Null when
 *  the collection has none saved, or `connIdx` points past the end — a stored
 *  index outliving the row it pointed at must not resolve to a neighbour. */
export const selectActiveConnection = (s: { collections: CollectionsState }) => {
  const list = selectConnections(s);
  return list[selectConnIdx(s)] ?? null;
};
