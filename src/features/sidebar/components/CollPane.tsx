"use client";

import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  FolderPlus,
  Folder,
  FolderOpen,
  Download,
  Feather,
  Blend,
  BookCopy,
} from "lucide-react";
import type { Theme } from "@/lib/themes";
import type { CollectionItem, Collection, Folder as CollectionFolder } from "@/lib/sampleData";
import {
  buildTree,
  descendantFolderIds,
  itemIdsInFolders,
  type TreeNode,
} from "@/lib/collectionTree";
import * as ui from "@/lib/ui";
import MethodPill from "@/components/MethodPill";
import ConfirmDialog from "@/components/ConfirmDialog";
import RowMenu from "@/components/RowMenu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import NewCollectionDialog from "./NewCollectionDialog";
import ImportCollectionDialog from "./ImportCollectionDialog";
import CollectionHooksDialog from "./CollectionHooksDialog";
import {
  setActiveId,
  selectActiveId,
  selectCollections,
  toggleCollectionOpen,
  addCollection,
  importCollections,
  removeCollection,
  renameCollection,
  addItem,
  removeItem,
  renameItem,
  setItemMethod,
  setCollectionHook,
  addFolder,
  renameFolder,
  toggleFolderOpen,
  removeFolder,
  moveItem,
  moveFolder,
  moveCollection,
} from "@/store/collectionsSlice";
import { setCode } from "@/store/editorSlice";

type Props = { T: Theme };

/**
 * Row actions stay out of the way until the row is hovered or something inside
 * it takes focus — `group-focus-within` is what keeps them keyboard-reachable
 * rather than hover-only.
 */
const ROW_ACTION = `transition-opacity duration-200 ${ui.reveal}`;

/** Container that visually combines a `ButtonGroup`'s children, no border. */
const GROUP_BOX = "rounded-md overflow-hidden";

/** Ghost button hover matching the rest of the app's icon controls. */
const GROUP_BTN =
  "rounded-none hover:bg-app-hover hover:text-app-accent dark:hover:bg-app-hover";

/** Collection list: one bordered card, corner blocks clipped to its radius by
 *  `overflow-hidden`, collections divided by `divide-y` instead of each one
 *  owning its own margin — reads as one group, not a stack of blocks. A
 *  collection's own item rows sit inside its `divide-y` child and are
 *  unaffected — the divider only ever falls between two collections.
 *  `bg-app-panel` backs it solid so the pane's dot-grid texture doesn't bleed
 *  through the card — folder and item rows still layer `bg-app-hover` /
 *  `bg-app-selected` on top for hover/active state. */
const LIST =
  "mx-2 mb-2 flex flex-col overflow-hidden rounded-md border border-app-border bg-app-panel divide-y divide-app-border";

/** Pixels a nesting level adds to a row's left inset, on top of the base pad. */
const INDENT_STEP = 14;
/** Deepest level that still indents — beyond this, rows stop marching right. */
const INDENT_CAP = 6;

/** A row's identity for the drag-hover marker: `kind:id`. */
type RowKey = string;

/** What is currently being dragged — set as a dnd-kit draggable's `data`, read
 *  back off `event.active.data.current` in the {@link DndContext} handlers. */
type DragPayload =
  | { kind: "collection"; id: string }
  | { kind: "folder"; id: string; collectionId: string }
  | { kind: "item"; id: string; collectionId: string };

/** Where a drop zone sits relative to its row: `before` / `after` insert as a
 *  sibling at that edge; `inside` (folder rows only) drops into the folder. */
type Edge = "before" | "after" | "inside";

/** The row a drop zone belongs to, carrying whatever {@link resolveDrop} needs
 *  to compute the resulting move — set as a dnd-kit droppable's `data`. */
type DropZoneCtx =
  | { kind: "collection"; id: string }
  | { kind: "folder"; collectionId: string; folderId: string; parentId: string | null }
  | { kind: "item"; collectionId: string; itemId: string; folderId: string | null };

/** A registered drop zone: `key` identifies the owning row for highlighting,
 *  `ctx` + `edge` are what {@link resolveDrop} needs to compute the move. */
type ZoneData = { key: RowKey; ctx: DropZoneCtx; edge: Edge };

/** The live insertion hint over the hovered row — `before` / `after` draw a
 *  line at that edge, `inside` (folder rows only) highlights the container. */
type DropMark = { key: RowKey; edge: Edge } | null;

/** Id of the next row after `id` in `arr` that also satisfies `sameContainer`,
 *  or `null` when `id` is the last of its container — the `beforeId` an
 *  "after this row" drop resolves to. */
function nextSiblingId<T extends { id: string }>(
  arr: T[],
  id: string,
  sameContainer: (row: T) => boolean,
): string | null {
  const from = arr.findIndex((r) => r.id === id);
  if (from < 0) return null;
  for (let i = from + 1; i < arr.length; i++) {
    if (sameContainer(arr[i])) return arr[i].id;
  }
  return null;
}

/** Renders the before/after insertion line for `key` when `dropMark` points
 *  at it — `inside` marks are drawn by the row itself as a container ring. */
function dropLine(dropMark: DropMark, key: RowKey) {
  return dropMark?.key === key && dropMark.edge !== "inside" ? (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 h-0.5 bg-app-accent ${
        dropMark.edge === "before" ? "top-0" : "bottom-0"
      }`}
    />
  ) : null;
}

/** Three stacked, invisible drop targets overlaid on a row: a thin `before` /
 *  `after` strip at each edge and, for folder rows, a larger `inside` band
 *  between them. dnd-kit measures each strip's rect to resolve which edge the
 *  pointer is over — they carry no pointer-events of their own, so they never
 *  intercept clicks on the row's real controls. */
function DropZones({ base, ctx }: { base: RowKey; ctx: DropZoneCtx }) {
  const { setNodeRef: setBeforeRef } = useDroppable({
    id: `${base}:before`,
    data: { key: base, ctx, edge: "before" } satisfies ZoneData,
  });
  const { setNodeRef: setInsideRef } = useDroppable({
    id: `${base}:inside`,
    data: { key: base, ctx, edge: "inside" } satisfies ZoneData,
    disabled: ctx.kind !== "folder",
  });
  const { setNodeRef: setAfterRef } = useDroppable({
    id: `${base}:after`,
    data: { key: base, ctx, edge: "after" } satisfies ZoneData,
  });

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col">
      <div ref={setBeforeRef} className="flex-1" />
      {ctx.kind === "folder" && <div ref={setInsideRef} className="flex-2" />}
      <div ref={setAfterRef} className="flex-1" />
    </div>
  );
}

/**
 * Given the row being dragged and the drop zone it's released over, returns a
 * thunk that dispatches the resulting move, or `null` when the drop is
 * illegal (dropped on itself, a folder onto its own descendant, or across
 * collections). Shared by {@link DndContext}'s `onDragOver` (to light up
 * `dropMark` only for legal targets) and `onDragEnd` (to commit the move).
 */
type MoveAction =
  | ReturnType<typeof moveItem>
  | ReturnType<typeof moveFolder>
  | ReturnType<typeof moveCollection>;

function resolveDrop(
  collections: Collection[],
  payload: DragPayload,
  ctx: DropZoneCtx,
  edge: Edge,
): (() => MoveAction) | null {
  if (ctx.kind === "collection") {
    if (payload.kind !== "collection" || payload.id === ctx.id) return null;
    const beforeId =
      edge === "after" ? nextSiblingId(collections, ctx.id, () => true) : ctx.id;
    if (beforeId === payload.id) return null;
    return () => moveCollection({ id: payload.id, beforeId });
  }
  if (payload.kind === "collection") return null;
  if (payload.collectionId !== ctx.collectionId) return null;
  const col = collections.find((c) => c.id === ctx.collectionId);
  if (!col) return null;

  if (ctx.kind === "folder") {
    const folders = col.folders ?? [];
    if (payload.kind === "folder") {
      if (payload.id === ctx.folderId) return null;
      if (descendantFolderIds(folders, payload.id).has(ctx.folderId)) return null;
      if (edge === "inside") {
        return () =>
          moveFolder({
            collectionId: ctx.collectionId,
            folderId: payload.id,
            targetParentId: ctx.folderId,
            beforeId: null,
          });
      }
      const beforeId =
        edge === "after"
          ? nextSiblingId(folders, ctx.folderId, (f) => f.parentId === ctx.parentId)
          : ctx.folderId;
      return () =>
        moveFolder({
          collectionId: ctx.collectionId,
          folderId: payload.id,
          targetParentId: ctx.parentId,
          beforeId: beforeId === payload.id ? null : beforeId,
        });
    }
    if (edge === "inside") {
      return () =>
        moveItem({
          collectionId: ctx.collectionId,
          itemId: payload.id,
          targetFolderId: ctx.folderId,
          beforeId: null,
        });
    }
    const firstItem = col.items.find((i) => (i.folderId ?? null) === ctx.parentId);
    return () =>
      moveItem({
        collectionId: ctx.collectionId,
        itemId: payload.id,
        targetFolderId: ctx.parentId,
        beforeId: firstItem && firstItem.id !== payload.id ? firstItem.id : null,
      });
  }

  if (payload.kind === "folder") {
    if (descendantFolderIds(col.folders ?? [], payload.id).has(ctx.folderId ?? "")) return null;
    return () =>
      moveFolder({
        collectionId: ctx.collectionId,
        folderId: payload.id,
        targetParentId: ctx.folderId,
        beforeId: null,
      });
  }
  if (payload.id === ctx.itemId) return null;
  const beforeId =
    edge === "after"
      ? nextSiblingId(col.items, ctx.itemId, (i) => (i.folderId ?? null) === ctx.folderId)
      : ctx.itemId;
  return () =>
    moveItem({
      collectionId: ctx.collectionId,
      itemId: payload.id,
      targetFolderId: ctx.folderId,
      beforeId: beforeId === payload.id ? null : beforeId,
    });
}

/** Applies a keyboard-driven reorder: moves `id` one slot up/down among
 *  `siblings`, the fallback for pointer-only drag-and-drop. */
function moveRow(
  siblings: { id: string }[],
  id: string,
  dir: -1 | 1,
  apply: (beforeId: string | null) => void,
) {
  const idx = siblings.findIndex((s) => s.id === id);
  if (idx < 0) return;
  if (dir === -1) {
    if (idx === 0) return;
    apply(siblings[idx - 1].id);
  } else {
    if (idx >= siblings.length - 1) return;
    apply(siblings[idx + 2]?.id ?? null);
  }
}

type EditState = {
  kind: "coll" | "folder" | "item";
  id: string;
  collectionId?: string;
} | null;

type EditingProps = {
  editing: EditState;
  draft: string;
  setDraft: (v: string) => void;
  commitEdit: () => void;
  setEditing: (v: EditState) => void;
  startEdit: (
    kind: "coll" | "folder" | "item",
    id: string,
    current: string,
    collectionId?: string,
  ) => void;
};

/** What {@link ConfirmDialog} is confirming — set by any row's "delete" menu
 *  item, read back by `CollPane` to build the confirm message and, on
 *  confirm, cascade the delete. */
type PendingDelete =
  | { kind: "coll"; id: string; name: string }
  | {
      kind: "folder";
      collectionId: string;
      folderId: string;
      name: string;
      itemCount: number;
    }
  | { kind: "item"; collectionId: string; itemId: string; name: string }
  | null;

/** Props every row shares regardless of kind — passed down from `CollPane`
 *  through {@link TreeRow} unchanged, so a row only declares the extra props
 *  specific to its own kind (`folder`, `item`, or `col` + `collections`). */
type RowCommonProps = EditingProps & {
  activeId: string | null;
  dropMark: DropMark;
  onSelect: (item: CollectionItem) => void;
  setPendingDelete: (v: PendingDelete) => void;
};

function FolderRow({
  folder,
  depth,
  col,
  dropMark,
  editing,
  draft,
  setDraft,
  commitEdit,
  setEditing,
  startEdit,
  setPendingDelete,
}: {
  folder: CollectionFolder;
  depth: number;
  col: Collection;
} & RowCommonProps) {
  const dispatch = useDispatch();
  const folders = col.folders ?? [];
  const siblings = folders.filter((f) => f.parentId === folder.parentId);
  const key: RowKey = `folder:${folder.id}`;
  const isEditing = editing?.kind === "folder" && editing.id === folder.id;
  const inside = dropMark?.key === key && dropMark.edge === "inside";
  const pad = 8 + Math.min(depth, INDENT_CAP) * INDENT_STEP;

  const payload: DragPayload = { kind: "folder", id: folder.id, collectionId: col.id };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `drag:${key}`,
    data: payload,
    disabled: isEditing,
  });

  return (
    <div>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={`group relative flex items-center gap-1 py-1 pr-2 transition-colors duration-200 hover:bg-app-hover ${
          inside ? "bg-app-selected ring-1 ring-inset ring-app-accent" : ""
        }`}
        style={{ paddingLeft: pad }}
      >
        <DropZones
          base={key}
          ctx={{ kind: "folder", collectionId: col.id, folderId: folder.id, parentId: folder.parentId }}
        />
        {dropLine(dropMark, key)}
        <button
          type="button"
          onClick={() =>
            dispatch(toggleFolderOpen({ collectionId: col.id, folderId: folder.id }))
          }
          aria-expanded={folder.open}
          aria-label={folder.open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          data-testid={`coll-pane-folder-toggle-${folder.id}`}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent text-app-dim transition-colors duration-200 hover:text-app-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
        >
          {folder.open ? (
            <ChevronDown size={12} aria-hidden="true" />
          ) : (
            <ChevronRight size={12} aria-hidden="true" />
          )}
        </button>

        {folder.open ? (
          <FolderOpen size={13} aria-hidden="true" className="shrink-0 text-app-accent-dim" />
        ) : (
          <Folder size={13} aria-hidden="true" className="shrink-0 text-app-dim" />
        )}

        {isEditing ? (
          <Input
            autoFocus
            icon={Feather}
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") commitEdit();
              if (ev.key === "Escape") setEditing(null);
            }}
            onBlur={commitEdit}
            aria-label={`Rename ${folder.name}`}
            data-testid="coll-pane-rename-folder-input"
            className="py-0.5 font-title text-[11px] font-semibold"
          />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() =>
                  dispatch(toggleFolderOpen({ collectionId: col.id, folderId: folder.id }))
                }
                onDoubleClick={() => startEdit("folder", folder.id, folder.name, col.id)}
                className="min-w-0 flex-1 truncate rounded-sm border-0 bg-transparent p-0 text-left font-title text-[11px] font-semibold text-app-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
              >
                {folder.name}
              </button>
            </TooltipTrigger>
            <TooltipContent>Double-click to rename</TooltipContent>
          </Tooltip>
        )}

        <ButtonGroup className={`${GROUP_BOX} ${ROW_ACTION}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => dispatch(addItem({ collectionId: col.id, folderId: folder.id }))}
                aria-label={`Add request to ${folder.name}`}
                data-testid={`coll-pane-folder-add-request-button-${folder.id}`}
                className={`${GROUP_BTN} text-app-accent hover:text-app-accent`}
              >
                <Plus size={12} aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add request</TooltipContent>
          </Tooltip>
          <RowMenu
            id={folder.id}
            testIdPrefix="coll-pane"
            label={folder.name}
            actions={[
              {
                key: "add-folder",
                label: "Add subfolder",
                icon: <FolderPlus aria-hidden="true" />,
                onSelect: () =>
                  dispatch(
                    addFolder({ collectionId: col.id, parentId: folder.id, name: "New Folder" }),
                  ),
              },
              {
                key: "rename",
                label: "Rename",
                icon: <Feather aria-hidden="true" />,
                onSelect: () => startEdit("folder", folder.id, folder.name, col.id),
              },
              {
                key: "move-up",
                label: "Move up",
                icon: <ChevronUp aria-hidden="true" />,
                disabled: siblings.findIndex((f) => f.id === folder.id) <= 0,
                onSelect: () =>
                  moveRow(siblings, folder.id, -1, (beforeId) =>
                    dispatch(
                      moveFolder({
                        collectionId: col.id,
                        folderId: folder.id,
                        targetParentId: folder.parentId,
                        beforeId,
                      }),
                    ),
                  ),
              },
              {
                key: "move-down",
                label: "Move down",
                icon: <ChevronDown aria-hidden="true" />,
                disabled: siblings.findIndex((f) => f.id === folder.id) >= siblings.length - 1,
                onSelect: () =>
                  moveRow(siblings, folder.id, 1, (beforeId) =>
                    dispatch(
                      moveFolder({
                        collectionId: col.id,
                        folderId: folder.id,
                        targetParentId: folder.parentId,
                        beforeId,
                      }),
                    ),
                  ),
              },
              { key: "sep", label: "", icon: null, onSelect: () => {} },
              {
                key: "delete",
                label: "Delete folder",
                icon: <Trash2 aria-hidden="true" />,
                variant: "destructive",
                onSelect: () => {
                  const doomed = descendantFolderIds(folders, folder.id);
                  setPendingDelete({
                    kind: "folder",
                    collectionId: col.id,
                    folderId: folder.id,
                    name: folder.name,
                    itemCount: itemIdsInFolders(col.items, doomed).length,
                  });
                },
              },
            ]}
          />
        </ButtonGroup>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  depth,
  col,
  activeId,
  dropMark,
  onSelect,
  editing,
  draft,
  setDraft,
  commitEdit,
  setEditing,
  startEdit,
  setPendingDelete,
}: {
  item: CollectionItem;
  depth: number;
  col: Collection;
} & RowCommonProps) {
  const dispatch = useDispatch();
  const folderId = item.folderId ?? null;
  const siblings = col.items.filter((i) => (i.folderId ?? null) === folderId);
  const key: RowKey = `item:${item.id}`;
  const isActive = activeId === item.id;
  const isEditing = editing?.kind === "item" && editing.id === item.id;
  const pad = 8 + Math.min(depth, INDENT_CAP) * INDENT_STEP;

  const payload: DragPayload = { kind: "item", id: item.id, collectionId: col.id };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `drag:${key}`,
    data: payload,
    disabled: isEditing,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-selected={isActive || undefined}
      className="group relative flex items-center gap-1.5 border-l-2 border-transparent py-1 pr-2.5 transition-colors duration-200 hover:bg-app-hover data-selected:border-app-accent data-selected:bg-app-selected"
      style={{ paddingLeft: pad + 8 }}
    >
      <DropZones base={key} ctx={{ kind: "item", collectionId: col.id, itemId: item.id, folderId }} />
      {dropLine(dropMark, key)}
      <Blend
        size={13}
        aria-hidden="true"
        className={`shrink-0 ${isActive ? "text-app-accent" : "text-app-dim"}`}
      />

      {isEditing ? (
        <Input
          autoFocus
          icon={Feather}
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") commitEdit();
            if (ev.key === "Escape") setEditing(null);
          }}
          onBlur={commitEdit}
          aria-label={`Rename ${item.name}`}
          data-testid="coll-pane-rename-item-input"
          className="py-0.5"
        />
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onSelect(item)}
              onDoubleClick={() => startEdit("item", item.id, item.name)}
              aria-current={isActive ? "true" : undefined}
              className={`min-w-0 flex-1 truncate rounded-sm border-0 bg-transparent p-0 text-left font-title text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${isActive ? "font-semibold text-app-bright" : "text-app-text"}`}
            >
              {item.name}
            </button>
          </TooltipTrigger>
          <TooltipContent>Double-click to rename</TooltipContent>
        </Tooltip>
      )}

      <MethodPill
        method={item.method}
        sm
        onMethodChange={(next) => dispatch(setItemMethod({ itemId: item.id, method: next }))}
        description="Click to change the method label. This is a visual indicator only and does not affect the actual request."
      />

      <ButtonGroup className={`${GROUP_BOX} ${ROW_ACTION}`}>
        <RowMenu
          id={item.id}
          testIdPrefix="coll-pane"
          label={item.name}
          actions={[
            {
              key: "rename",
              label: "Rename",
              icon: <Feather aria-hidden="true" />,
              onSelect: () => startEdit("item", item.id, item.name),
            },
            {
              key: "move-up",
              label: "Move up",
              icon: <ChevronUp aria-hidden="true" />,
              disabled: siblings.findIndex((i) => i.id === item.id) <= 0,
              onSelect: () =>
                moveRow(siblings, item.id, -1, (beforeId) =>
                  dispatch(
                    moveItem({ collectionId: col.id, itemId: item.id, targetFolderId: folderId, beforeId }),
                  ),
                ),
            },
            {
              key: "move-down",
              label: "Move down",
              icon: <ChevronDown aria-hidden="true" />,
              disabled: siblings.findIndex((i) => i.id === item.id) >= siblings.length - 1,
              onSelect: () =>
                moveRow(siblings, item.id, 1, (beforeId) =>
                  dispatch(
                    moveItem({ collectionId: col.id, itemId: item.id, targetFolderId: folderId, beforeId }),
                  ),
                ),
            },
            { key: "sep", label: "", icon: null, onSelect: () => {} },
            {
              key: "delete",
              label: "Delete request",
              icon: <Trash2 aria-hidden="true" />,
              variant: "destructive",
              onSelect: () =>
                setPendingDelete({ kind: "item", collectionId: col.id, itemId: item.id, name: item.name }),
            },
          ]}
        />
      </ButtonGroup>
    </div>
  );
}

function CollectionRow({
  col,
  collections,
  dropMark,
  editing,
  draft,
  setDraft,
  commitEdit,
  setEditing,
  startEdit,
  activeId,
  onSelect,
  setHooksFor,
  setPendingDelete,
}: {
  col: Collection;
  collections: Collection[];
  setHooksFor: (v: { id: string; name: string; preRun: string; postRun: string }) => void;
} & RowCommonProps) {
  const dispatch = useDispatch();
  const key: RowKey = `coll:${col.id}`;
  const isEditing = editing?.kind === "coll" && editing.id === col.id;

  const payload: DragPayload = { kind: "collection", id: col.id };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `drag:${key}`,
    data: payload,
    disabled: isEditing,
  });

  return (
    <div>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className="group relative flex items-center gap-1 bg-app-hover px-2 py-1.5"
      >
        <DropZones base={key} ctx={{ kind: "collection", id: col.id }} />
        {dropLine(dropMark, key)}
        <button
          type="button"
          onClick={() => dispatch(toggleCollectionOpen(col.id))}
          aria-expanded={col.open}
          aria-label={col.open ? `Collapse ${col.name}` : `Expand ${col.name}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent text-app-dim transition-colors duration-200 hover:text-app-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
        >
          {col.open ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
        </button>

        {isEditing ? (
          <Input
            autoFocus
            icon={Feather}
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") commitEdit();
              if (ev.key === "Escape") setEditing(null);
            }}
            onBlur={commitEdit}
            aria-label={`Rename ${col.name}`}
            data-testid="coll-pane-rename-collection-input"
            className="py-0.5 font-title text-[11px] font-semibold uppercase tracking-[0.07em]"
          />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => dispatch(toggleCollectionOpen(col.id))}
                onDoubleClick={() => startEdit("coll", col.id, col.name)}
                className="min-w-0 flex-1 truncate rounded-sm border-0 bg-transparent p-0 text-left font-title text-[11px] font-semibold uppercase tracking-[0.07em] text-app-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
              >
                {col.name}
              </button>
            </TooltipTrigger>
            <TooltipContent>Double-click to rename</TooltipContent>
          </Tooltip>
        )}

        <ButtonGroup className={`${GROUP_BOX} ${ROW_ACTION}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => dispatch(addItem({ collectionId: col.id }))}
                aria-label={`Add request to ${col.name}`}
                className={`${GROUP_BTN} text-app-accent hover:text-app-accent`}
              >
                <Plus size={12} aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add request</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  setHooksFor({
                    id: col.id,
                    name: col.name,
                    preRun: col.preRun ?? "",
                    postRun: col.postRun ?? "",
                  })
                }
                aria-label={`Edit run hooks for ${col.name}`}
                data-testid={`coll-pane-hooks-button-${col.id}`}
                className={`${GROUP_BTN} relative ${
                  col.preRun?.trim() || col.postRun?.trim()
                    ? "text-app-accent hover:text-app-accent"
                    : ""
                }`}
              >
                <BookCopy size={12} aria-hidden="true" />
                {(col.preRun?.trim() || col.postRun?.trim()) && (
                  <span
                    aria-hidden="true"
                    className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-app-accent"
                  />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {col.preRun?.trim() || col.postRun?.trim() ? "Run hooks (set)" : "Run hooks"}
            </TooltipContent>
          </Tooltip>
          <RowMenu
            id={col.id}
            testIdPrefix="coll-pane"
            label={col.name}
            actions={[
              {
                key: "add-folder",
                label: "New folder",
                icon: <FolderPlus aria-hidden="true" />,
                onSelect: () =>
                  dispatch(addFolder({ collectionId: col.id, parentId: null, name: "New Folder" })),
              },
              {
                key: "rename",
                label: "Rename",
                icon: <Feather aria-hidden="true" />,
                onSelect: () => startEdit("coll", col.id, col.name),
              },
              {
                key: "move-up",
                label: "Move up",
                icon: <ChevronUp aria-hidden="true" />,
                disabled: collections.findIndex((c) => c.id === col.id) <= 0,
                onSelect: () =>
                  moveRow(collections, col.id, -1, (beforeId) =>
                    dispatch(moveCollection({ id: col.id, beforeId })),
                  ),
              },
              {
                key: "move-down",
                label: "Move down",
                icon: <ChevronDown aria-hidden="true" />,
                disabled: collections.findIndex((c) => c.id === col.id) >= collections.length - 1,
                onSelect: () =>
                  moveRow(collections, col.id, 1, (beforeId) =>
                    dispatch(moveCollection({ id: col.id, beforeId })),
                  ),
              },
              { key: "sep", label: "", icon: null, onSelect: () => {} },
              {
                key: "delete",
                label: "Delete collection",
                icon: <Trash2 aria-hidden="true" />,
                variant: "destructive",
                onSelect: () => setPendingDelete({ kind: "coll", id: col.id, name: col.name }),
              },
            ]}
          />
        </ButtonGroup>
      </div>

      {col.open &&
        buildTree(col.folders ?? [], col.items).map((n) => (
          <TreeRow
            key={n.kind === "folder" ? `folder:${n.folder.id}` : `item:${n.item.id}`}
            node={n}
            col={col}
            dropMark={dropMark}
            activeId={activeId}
            onSelect={onSelect}
            editing={editing}
            draft={draft}
            setDraft={setDraft}
            commitEdit={commitEdit}
            setEditing={setEditing}
            startEdit={startEdit}
            setPendingDelete={setPendingDelete}
          />
        ))}
    </div>
  );
}

function TreeRow({
  node,
  col,
  ...rowProps
}: {
  node: TreeNode;
  col: Collection;
} & RowCommonProps) {
  if (node.kind === "folder") {
    return (
      <>
        <FolderRow folder={node.folder} depth={node.depth} col={col} {...rowProps} />
        {node.folder.open &&
          node.children.map((child) => (
            <TreeRow
              key={child.kind === "folder" ? `folder:${child.folder.id}` : `item:${child.item.id}`}
              node={child}
              col={col}
              {...rowProps}
            />
          ))}
      </>
    );
  }
  return <ItemRow item={node.item} depth={node.depth} col={col} {...rowProps} />;
}

/**
 * Collection / folder / request tree — collapsible collections holding nested
 * folders and request items, each with inline rename, method-pill editing, add,
 * delete, drag-to-reorder and a keyboard move fallback.
 *
 * @remarks
 * Status: stable — Type: pane
 *
 * State & behavior: `editing` tracks the single collection, folder or item name
 * being edited (its `kind` widened from the pre-folders version), swapping that
 * name for an `Input` committed on Enter/blur, discarded on Escape; a folder
 * edit also carries its `collectionId` since {@link renameFolder} needs it.
 * `draft` holds the in-progress name. `newCollOpen` gates
 * {@link NewCollectionDialog}, `importOpen` gates
 * {@link ImportCollectionDialog}, `hooksFor` gates
 * {@link CollectionHooksDialog}. `pendingDelete` gates {@link ConfirmDialog}
 * for a collection (cascades to every folder and item), a folder (cascades to
 * every nested folder and item — the message names the request count) and a
 * single item; delete never fires straight from a row. A single
 * `@dnd-kit/core` `DndContext` wraps the tree: each row registers itself as a
 * draggable (`useDraggable`, whole row, disabled while it's being renamed) and
 * overlays three invisible drop zones (`useDroppable` via {@link DropZones}) —
 * `before` / `after` edge strips plus, on folder rows, an `inside` band.
 * `activeDrag` mirrors the dragged row's payload for the {@link DragOverlay}
 * ghost; `dropMark` is the live insertion hint over the hovered zone, cleared
 * whenever {@link resolveDrop} rejects the pairing.
 *
 * The tree is derived per collection by {@link buildTree} from the flat
 * `folders` + `items` arrays; folders render before items at each level and
 * each keeps its array order. Reordering dispatches {@link moveItem} /
 * {@link moveFolder} / {@link moveCollection} with a `beforeId` anchor
 * (`null` = end of container). A folder cascade delete first dispatches
 * {@link removeItem} for every descendant item, so the runner/ui cross-slice
 * cleanup runs, then {@link removeFolder}.
 *
 * Variants: an empty `collections` array skips the `LIST` card's border
 * entirely, leaving just the header row. A collapsed collection or folder hides
 * its subtree. A folder with no children still shows its row.
 *
 * Composition: renders {@link NewCollectionDialog},
 * {@link ImportCollectionDialog}, {@link CollectionHooksDialog} and
 * {@link ConfirmDialog} as needed. Collections are one bordered `LIST` card
 * with `divide-y` between collections. Folder and item rows are indented by
 * nesting depth (capped). Each row keeps at most two always-visible actions —
 * "add request" (collection and folder rows) and, on the collection row, the
 * run-hooks toggle — and folds the rest (rename, add folder / subfolder, move
 * up, move down, delete) into a `⋯` {@link RowMenu} so a hovered row never
 * buries its own name. The run-hooks control shows an accent dot when that
 * collection has a non-empty pre-run or post-run script.
 *
 * Accessibility: expand/collapse toggles carry `aria-expanded`; the active
 * item's select button carries `aria-current`. All icon-only controls have an
 * `aria-label` naming the target. `@dnd-kit/core`'s `PointerSensor` (an 4px
 * activation distance so plain clicks on a row's own buttons still land) makes
 * drag-and-drop pointer-only, so the `⋯` menu also carries "Move up" / "Move
 * down" items — the keyboard path for reordering — disabled at the ends of a
 * container.
 *
 * Test ids: collection rename `coll-pane-rename-collection-input`, folder
 * rename `coll-pane-rename-folder-input`, item rename
 * `coll-pane-rename-item-input` (one instance each — only one row edits at a
 * time); per-collection run-hooks `` `coll-pane-hooks-button-${collectionId}` ``;
 * per-folder `` `coll-pane-folder-toggle-${folderId}` `` and
 * `` `coll-pane-folder-add-request-button-${folderId}` ``; per-row overflow
 * menu trigger `` `coll-pane-row-menu-button-${id}` `` with items
 * `` `coll-pane-menu-${action}-${id}` `` (`action` ∈ `add-folder`, `rename`,
 * `move-up`, `move-down`, `delete`; `id` is the collection, folder or item id).
 *
 * CSS classes: none — Tailwind utilities over the `app-*` theme tokens only.
 *
 * Edge cases: a name typed as only whitespace on rename is discarded. A folder
 * or item whose parent id does not resolve renders at the collection root
 * ({@link buildTree}). A folder cannot be dropped into itself or one of its own
 * descendants — {@link resolveDrop} refuses it. Drag-and-drop stays within one
 * collection; a cross-collection drop is ignored.
 *
 * Dependencies: `@dnd-kit/core`, `lucide-react`, `react-redux`,
 * `@/lib/collectionTree`, `@/components/MethodPill`, `@/components/ConfirmDialog`,
 * `@/components/ui/input`, `@/components/ui/button`,
 * `@/components/ui/button-group`, `@/components/ui/tooltip`,
 * `@/components/RowMenu`, `./NewCollectionDialog`,
 * `./ImportCollectionDialog`, `./CollectionHooksDialog`,
 * `@/store/collectionsSlice`, `@/store/editorSlice`.
 *
 * @example
 * ```tsx
 * <CollPane T={theme} />
 * ```
 *
 * @see {@link EnvPane}
 * @see {@link VarsPane}
 */
export default function CollPane({}: Props) {
  const dispatch = useDispatch();
  const collections = useSelector(selectCollections);
  const activeId = useSelector(selectActiveId);

  const [editing, setEditing] = useState<EditState>(null);
  const [draft, setDraft] = useState("");
  const [newCollOpen, setNewCollOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [hooksFor, setHooksFor] = useState<{
    id: string;
    name: string;
    preRun: string;
    postRun: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [dropMark, setDropMark] = useState<DropMark>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onSelect = (item: CollectionItem) => {
    dispatch(setActiveId(item.id));
    dispatch(setCode(item.code));
  };

  const startEdit = (
    kind: "coll" | "folder" | "item",
    id: string,
    current: string,
    collectionId?: string,
  ) => {
    setEditing({ kind, id, collectionId });
    setDraft(current);
  };

  const commitEdit = () => {
    if (!editing) return;
    const v = draft.trim();
    if (v) {
      if (editing.kind === "coll")
        dispatch(renameCollection({ id: editing.id, name: v }));
      else if (editing.kind === "folder" && editing.collectionId)
        dispatch(
          renameFolder({
            collectionId: editing.collectionId,
            folderId: editing.id,
            name: v,
          }),
        );
      else dispatch(renameItem({ itemId: editing.id, name: v }));
    }
    setEditing(null);
  };

  const handleImportJson = (json: unknown) => {
    const imported = Array.isArray(json) ? json : [json];
    dispatch(importCollections(imported));
    setImportOpen(false);
  };

  const editingProps: EditingProps = { editing, draft, setDraft, commitEdit, setEditing, startEdit };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDrag((event.active.data.current as DragPayload | undefined) ?? null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const payload = event.active.data.current as DragPayload | undefined;
    const zone = event.over?.data.current as ZoneData | undefined;
    if (!payload || !zone || !resolveDrop(collections, payload, zone.ctx, zone.edge)) {
      setDropMark(null);
      return;
    }
    setDropMark({ key: zone.key, edge: zone.edge });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const payload = event.active.data.current as DragPayload | undefined;
    const zone = event.over?.data.current as ZoneData | undefined;
    setActiveDrag(null);
    setDropMark(null);
    if (!payload || !zone) return;
    const action = resolveDrop(collections, payload, zone.ctx, zone.edge);
    if (action) dispatch(action());
  };

  const handleDragCancel = () => {
    setActiveDrag(null);
    setDropMark(null);
  };

  const dragLabel = (() => {
    if (!activeDrag) return null;
    if (activeDrag.kind === "collection")
      return collections.find((c) => c.id === activeDrag.id)?.name ?? null;
    const col = collections.find((c) => c.id === activeDrag.collectionId);
    if (!col) return null;
    return activeDrag.kind === "folder"
      ? col.folders?.find((f) => f.id === activeDrag.id)?.name ?? null
      : col.items.find((i) => i.id === activeDrag.id)?.name ?? null;
  })();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="pt-1">
        <div className="flex items-center justify-between gap-2 px-2.5 py-1">
          <h2 className={ui.label}>Requests</h2>
          <ButtonGroup className={GROUP_BOX}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setImportOpen(true)}
                  aria-label="Import collection"
                  className={GROUP_BTN}
                >
                  <Download size={14} aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import collection</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setNewCollOpen(true)}
                  aria-label="New collection"
                  className={GROUP_BTN}
                >
                  <FolderPlus size={14} aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New collection</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </div>

        <div className={collections.length > 0 ? LIST : undefined}>
          {collections.map((col) => (
            <CollectionRow
              key={col.id}
              col={col}
              collections={collections}
              dropMark={dropMark}
              activeId={activeId}
              onSelect={onSelect}
              setHooksFor={setHooksFor}
              setPendingDelete={setPendingDelete}
              {...editingProps}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {dragLabel ? (
            <div className="pointer-events-none flex items-center gap-1.5 rounded-md border border-app-border bg-app-panel px-2 py-1 font-title text-[11px] font-semibold text-app-bright shadow-lg">
              {dragLabel}
            </div>
          ) : null}
        </DragOverlay>

        {newCollOpen && (
          <NewCollectionDialog
            onCreate={(name) => {
              dispatch(addCollection(name));
              setNewCollOpen(false);
            }}
            onClose={() => setNewCollOpen(false)}
          />
        )}

        {importOpen && (
          <ImportCollectionDialog
            onImport={handleImportJson}
            onClose={() => setImportOpen(false)}
          />
        )}

        {hooksFor && (
          <CollectionHooksDialog
            collectionName={hooksFor.name}
            preRun={hooksFor.preRun}
            postRun={hooksFor.postRun}
            onSave={({ preRun, postRun }) => {
              dispatch(
                setCollectionHook({
                  collectionId: hooksFor.id,
                  hook: "preRun",
                  code: preRun,
                }),
              );
              dispatch(
                setCollectionHook({
                  collectionId: hooksFor.id,
                  hook: "postRun",
                  code: postRun,
                }),
              );
              setHooksFor(null);
            }}
            onClose={() => setHooksFor(null)}
          />
        )}

        {pendingDelete && (
          <ConfirmDialog
            title={
              pendingDelete.kind === "coll"
                ? "Delete collection"
                : pendingDelete.kind === "folder"
                  ? "Delete folder"
                  : "Delete request"
            }
            message={
              pendingDelete.kind === "coll"
                ? `Delete collection "${pendingDelete.name}" and all its requests? This can't be undone.`
                : pendingDelete.kind === "folder"
                  ? `Delete folder "${pendingDelete.name}" and all ${pendingDelete.itemCount} request${
                      pendingDelete.itemCount === 1 ? "" : "s"
                    } inside it? This can't be undone.`
                  : `Delete "${pendingDelete.name}"? This can't be undone.`
            }
            confirmLabel="Delete"
            onConfirm={() => {
              if (pendingDelete.kind === "coll") {
                dispatch(removeCollection(pendingDelete.id));
              } else if (pendingDelete.kind === "folder") {
                const col = collections.find(
                  (c) => c.id === pendingDelete.collectionId,
                );
                const doomed = descendantFolderIds(
                  col?.folders ?? [],
                  pendingDelete.folderId,
                );
                for (const itemId of itemIdsInFolders(col?.items ?? [], doomed)) {
                  dispatch(
                    removeItem({
                      collectionId: pendingDelete.collectionId,
                      itemId,
                    }),
                  );
                }
                dispatch(
                  removeFolder({
                    collectionId: pendingDelete.collectionId,
                    folderId: pendingDelete.folderId,
                  }),
                );
              } else {
                dispatch(
                  removeItem({
                    collectionId: pendingDelete.collectionId,
                    itemId: pendingDelete.itemId,
                  }),
                );
              }
              setPendingDelete(null);
            }}
            onClose={() => setPendingDelete(null)}
          />
        )}
      </div>
    </DndContext>
  );
}
