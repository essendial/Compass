/**
 * FileOutliner — the collapsible tree in the sidebar.
 *
 * Renders every workflow as a top-level node, with two folders per (active)
 * flow: "Steps" (each step, each with its requirements) and "Connections".
 * Only the active flow is expanded; inactive flows show as a single row.
 *
 * The component is otherwise presentational: all mutations are delegated to
 * callbacks supplied by App (create/rename/delete for flows, steps, reqs, edges).
 *
 * Internally it builds a TreeNode[] from the flows, then renders recursively.
 * Inline requirement renaming is handled locally (an input replaces the label).
 */
import {
    useEffect,
    useMemo,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import type { Flow, FlowNode, Folder, NodeTree, Req } from "../types";
import { REQ, REQ_OPTIONS, TYPE } from "../data";

/** Kind of a tree row; drives its icon, actions, and click behaviour. */
type RowKind =
    | "flow"
    | "folder"
    | "tree"
    | "step"
    | "req"
    | "folder-edges"
    | "edge";

/** A reference back to a requirement, including which node + array index it belongs to. */
interface ReqRef {
    node: FlowNode;
    index: number;
    req: Req;
}

/** A reference back to an edge by its endpoint ids (used for deletion). */
interface EdgeRef {
    fromId: string;
    toId: string;
}

/** Generic tree node used by the recursive renderer. */
interface TreeNode {
    key: string;
    kind: RowKind;
    label: string;
    meta?: string;
    /** Indentation depth (1 = flow, 2 = path/connections, 3 = step/edge, 4 = req). */
    depth: number;
    expandable?: boolean;
    flow?: Flow;
    node?: FlowNode;
    /** The path (node-tree) this row represents, if kind === "tree". */
    tree?: NodeTree;
    /** The folder this row represents, if kind === "folder". */
    folder?: Folder;
    /** True for a folder row whose subtree contains the active flow (for highlight). */
    containsActive?: boolean;
    req?: ReqRef;
    edge?: EdgeRef;
    children?: TreeNode[];
}

interface Props {
    flows: Flow[];
    /** Folders (single-level) that group workflows in the outliner. */
    folders: Folder[];
    activeFlowId: string | null;
    selectedNodeId: string | null;
    onCreateFlow: () => void;
    onRenameFlow: (f: Flow) => void;
    onDeleteFlow: (f: Flow) => void;
    onSelectFlow: (id: string) => void;
    /** Open the create-workflow modal targeted at a parent folder. */
    onCreateFlowInFolder: (folderId: string) => void;
    /** Open the rename-folder modal. */
    onRenameFolder: (f: Folder) => void;
    /** Open the delete-folder modal. */
    onDeleteFolder: (f: Folder) => void;
    /** Move a workflow into a folder (or to root when folderId is null). */
    onMoveFlow: (flowId: string, folderId: string | null) => void;
    /** Create a brand-new path (a second/third instruction route) in the active flow. */
    onCreateTree: () => void;
    /** Delete an entire path and all its steps. */
    onDeleteTree: (treeId: string) => void;
    /** Change a path's colour. */
    onChangeTreeColor: (treeId: string, color: string) => void;
    /** Rename a path. */
    onRenameTree: (treeId: string, name: string) => void;
    /** Append a step to a path (by path id). */
    onAddStep: (treeId: string) => void;
    onRenameStep: (n: FlowNode) => void;
    onDeleteStep: (n: FlowNode) => void;
    onSelectStep: (id: string) => void;
    onCreateReq: (nodeId: string) => void;
    onRenameReq: (nodeId: string, index: number, label: string) => void;
    onDeleteReq: (nodeId: string, index: number) => void;
    onDeleteEdge: (fromId: string, toId: string) => void;
}

/** Quick lookup: ReqKind -> human label (mirrors REQ_OPTIONS). */
const REQ_LABELS: Record<string, string> = Object.fromEntries(
    REQ_OPTIONS.map((o) => [o.value, o.label]),
);

/** SVG path strings for the various tree icons (avoids repeating markup). */
const ICON = {
    chevron: "M9 6l6 6-6 6",
    folder:
        "M4 6a2 2 0 0 1 2-2h3l2 2h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
    file: "M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 0v5h5",
    edge: "M7 7h10M17 7l-3-3M17 7l-3 3M17 17H7M7 17l3-3M7 17l3 3",
    plus: "M12 5v14M5 12h14",
    pencil: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z",
    trash:
        "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6",
    /** "Move into a container" pictogram. */
    move: "M3 12h11M10 7l5 5-5 5M19 4v16",
};

export default function FileOutliner(props: Props) {
    const { flows, folders, activeFlowId, selectedNodeId } = props;

    // Rebuild the tree only when flows/folders or the active flow changes.
    const tree = useMemo<TreeNode[]>(
        () => buildTree(flows, folders, activeFlowId),
        [flows, folders, activeFlowId],
    );

    // Which rows are expanded (by key). Starts with only the folder holding
    // the active flow open (if any) — children are never auto-expanded.
    const [expanded, setExpanded] = useState<Set<string>>(() =>
        initialExpanded(activeFlowId, flows),
    );
    // Inline rename state for a requirement (key -> current text).
    const [renaming, setRenaming] = useState<{ key: string; value: string } | null>(
        null,
    );
    // Flow id whose "Move to folder" popover is open; null when none.
    const [moveMenu, setMoveMenu] = useState<string | null>(null);

    // When the active flow changes, open ONLY the folder that contains it (so
    // the active flow stays visible in the tree). The flow row itself and its
    // paths are left untouched — opening a folder never cascades into children.
    useEffect(() => {
        setExpanded((prev) => {
            const next = new Set(prev);
            const af = activeFlowId
                ? flows.find((f) => f.id === activeFlowId)
                : undefined;
            if (af?.folderId) next.add(`folder:${af.folderId}`);
            return next;
        });
    }, [activeFlowId, flows]);

    /** Toggles a row's expanded state by key. */
    const toggle = (key: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    /** Commits an inline rename: dispatches to path-rename or requirement-rename
     *  depending on which kind of row is being edited (looked up by key). */
    const commitRename = () => {
        if (!renaming) return;
        const value = renaming.value.trim();
        const row = findRow(tree, renaming.key);
        if (row?.kind === "tree" && row.tree) {
            if (value) props.onRenameTree(row.tree.id, value);
        } else if (row?.kind === "req" && row.req) {
            if (value) props.onRenameReq(row.req.node.id, row.req.index, value);
        }
        setRenaming(null);
    };

    /** Helper to render a small icon-only action button (rename/delete/add). */
    const actionBtn = (
        title: string,
        path: string,
        handler: () => void,
        danger = false,
    ) => (
        <button
            key={title}
            className={"mini-btn" + (danger ? " danger" : "")}
            title={title}
            aria-label={title}
            // Stop the row's own click handler from firing when clicking the action.
            onClick={(e) => {
                e.stopPropagation();
                handler();
            }}
        >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={path} />
            </svg>
        </button>
    );

    /** Recursively renders one tree node and (if open) its children. */
    const renderNode = (n: TreeNode): ReactNode => {
        const isOpen = expanded.has(n.key);
        const isSelected = n.kind === "step" && n.node?.id === selectedNodeId;
        const isActiveFlow = n.kind === "flow" && n.flow?.id === activeFlowId;
        const isRenaming = renaming?.key === n.key;
        // True when this is the folder holding the active flow (for highlight).
        const isActiveFolder =
            n.kind === "folder" && Boolean(n.containsActive);

        const caret = n.expandable ? (
            <button
                className={"tree-twist" + (isOpen ? " open" : "")}
                onClick={(e) => {
                    e.stopPropagation();
                    toggle(n.key);
                }}
                aria-label={isOpen ? "Collapse" : "Expand"}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d={ICON.chevron} />
                </svg>
            </button>
        ) : (
            <span className="tree-twist placeholder" />
        );

        let icon: ReactNode;
        if (n.kind === "folder") {
            // Organisational folder (groups workflows): accent-coloured when
            // it contains the active flow, otherwise muted.
            icon = (
                <svg
                    className="tree-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isActiveFolder ? "var(--accent)" : "var(--muted)"}
                    strokeWidth="1.8"
                >
                    <path d={ICON.folder} />
                </svg>
            );
        } else if (n.kind === "flow" || n.kind === "folder-edges") {
            icon = (
                <svg
                    className="tree-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isActiveFlow ? "var(--accent)" : "currentColor"}
                    strokeWidth="1.8"
                >
                    <path d={ICON.folder} />
                </svg>
            );
        } else if (n.kind === "tree" && n.tree) {
            // A path row shows a coloured dot in its own path colour.
            icon = (
                <span
                    className="tree-dot"
                    style={{ background: n.tree.color }}
                />
            );
        } else if (n.kind === "step" && n.node) {
            const T = TYPE[n.node.type];
            icon = (
                <svg
                    className="tree-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={T.color}
                    strokeWidth="2"
                >
                    <path d={T.glyph} />
                </svg>
            );
        } else if (n.kind === "req" && n.req) {
            const c = REQ[n.req.req.kind]?.c ?? "var(--muted)";
            icon = (
                <svg
                    className="tree-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={c}
                    strokeWidth="2"
                >
                    <path d={REQ[n.req.req.kind]?.icon ?? ICON.file} />
                </svg>
            );
        } else {
            icon = (
                <svg
                    className="tree-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--faint)"
                    strokeWidth="2"
                >
                    <path d={ICON.edge} />
                </svg>
            );
        }

        // Label: either a rename input (requirements only) or a plain text span.
        const labelEl = isRenaming ? (
            <input
                className="rename-input"
                style={{ "--depth": n.depth } as CSSProperties}
                autoFocus
                value={renaming!.value}
                onChange={(e) =>
                    setRenaming({ key: n.key, value: e.target.value })
                }
                onClick={(e) => e.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename();
                    } else if (e.key === "Escape") {
                        setRenaming(null);
                    }
                }}
            />
        ) : (
            <span className="tree-label">{n.label}</span>
        );

        // Row-specific action buttons (shown on hover; never while renaming).
        const actions: ReactNode[] = [];
        if (!isRenaming) {
            if (n.kind === "folder" && n.folder) {
                actions.push(actionBtn("New workflow", ICON.plus, () => props.onCreateFlowInFolder(n.folder!.id)));
                actions.push(actionBtn("Rename folder", ICON.pencil, () => props.onRenameFolder(n.folder!)));
                actions.push(actionBtn("Delete folder", ICON.trash, () => props.onDeleteFolder(n.folder!), true));
            } else if (n.kind === "flow" && n.flow) {
                actions.push(actionBtn("New path", ICON.plus, props.onCreateTree));
                actions.push(actionBtn("Rename", ICON.pencil, () => props.onRenameFlow(n.flow!)));
                // "Move to folder" — only meaningful once at least one folder exists.
                if (folders.length > 0) {
                    actions.push(
                        <button
                            key="move"
                            className={"mini-btn" + (moveMenu === n.flow!.id ? " active" : "")}
                            title="Move to folder"
                            aria-label="Move to folder"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMoveMenu((cur) => (cur === n.flow!.id ? null : n.flow!.id));
                            }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d={ICON.move} />
                            </svg>
                        </button>,
                    );
                }
                actions.push(actionBtn("Delete", ICON.trash, () => props.onDeleteFlow(n.flow!), true));
            } else if (n.kind === "tree" && n.tree) {
                // Colour swatch: an inline <input type="color"> for quick recolouring.
                actions.push(
                    <label
                        key="color"
                        className="tree-color"
                        title="Path colour"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="color"
                            value={n.tree.color}
                            onChange={(e) =>
                                props.onChangeTreeColor(n.tree!.id, e.target.value)
                            }
                        />
                        <span
                            className="tree-color-swatch"
                            style={{ background: n.tree.color }}
                        />
                    </label>,
                );
                actions.push(actionBtn("New step", ICON.plus, () => props.onAddStep(n.tree!.id)));
                actions.push(
                    actionBtn("Rename path", ICON.pencil, () =>
                        setRenaming({ key: n.key, value: n.tree!.name }),
                    ),
                );
                actions.push(actionBtn("Delete path", ICON.trash, () => props.onDeleteTree(n.tree!.id), true));
            } else if (n.kind === "step" && n.node) {
                actions.push(actionBtn("Add requirement", ICON.plus, () => props.onCreateReq(n.node!.id)));
                actions.push(actionBtn("Rename step", ICON.pencil, () => props.onRenameStep(n.node!)));
                actions.push(actionBtn("Delete step", ICON.trash, () => props.onDeleteStep(n.node!), true));
            } else if (n.kind === "req" && n.req) {
                actions.push(
                    actionBtn("Rename", ICON.pencil, () =>
                        setRenaming({ key: n.key, value: n.req!.req.label }),
                    ),
                );
                actions.push(
                    actionBtn("Delete", ICON.trash, () =>
                        props.onDeleteReq(n.req!.node.id, n.req!.index),
                    true),
                );
            } else if (n.kind === "edge" && n.edge) {
                actions.push(
                    actionBtn("Remove connection", ICON.trash, () =>
                        props.onDeleteEdge(n.edge!.fromId, n.edge!.toId),
                    true),
                );
            }
        }

        // Click behaviour depends on row kind: navigate, select, or just toggle.
        const rowClick = () => {
            if (renaming) return;
            // Any row click dismisses an open move-to-folder panel.
            setMoveMenu(null);
            if (n.kind === "flow" && n.flow) {
                props.onSelectFlow(n.flow.id);
            } else if (n.kind === "folder") {
                toggle(n.key);
            } else if (n.kind === "tree") {
                toggle(n.key);
            } else if (n.kind === "step" && n.node) {
                props.onSelectStep(n.node.id);
            } else if (n.kind === "req" && n.req) {
                // Clicking a requirement selects its parent step.
                props.onSelectStep(n.req.node.id);
            } else if (n.expandable) {
                toggle(n.key);
            }
        };

        const cls =
            "tree-row" +
            (n.kind === "folder" ? " is-folder" : "") +
            (isSelected ? " selected" : "") +
            (isActiveFlow ? " active-flow" : "") +
            (isActiveFolder ? " active-flow" : "");

        // The "Move to folder" panel for the flow row that currently has it open.
        // Rendered inline (below the row) so it never gets clipped by the
        // scroll container.
        const movePanel =
            n.kind === "flow" && n.flow && moveMenu === n.flow.id ? (
                <div
                    className="move-inline"
                    style={{ marginLeft: 6 + n.depth * 12 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="move-inline-title">Move to</div>
                    <button
                        type="button"
                        className={
                            "move-inline-item" +
                            (n.flow!.folderId == null ? " current" : "")
                        }
                        onClick={() => {
                            props.onMoveFlow(n.flow!.id, null);
                            setMoveMenu(null);
                        }}
                    >
                        <span className="tdot" />
                        No folder (root)
                    </button>
                    {folders.map((fd) => (
                        <button
                            type="button"
                            key={fd.id}
                            className={
                                "move-inline-item" +
                                (n.flow!.folderId === fd.id ? " current" : "")
                            }
                            onClick={() => {
                                props.onMoveFlow(n.flow!.id, fd.id);
                                setMoveMenu(null);
                            }}
                        >
                            <span className="tdot folder-dot" />
                            {fd.name || "(untitled folder)"}
                        </button>
                    ))}
                </div>
            ) : null;

        return (
            <div key={n.key}>
                <div
                    className={cls}
                    style={{ paddingLeft: 6 + n.depth * 12 }}
                    onClick={rowClick}
                >
                    {caret}
                    {icon}
                    {labelEl}
                    {n.meta && !isRenaming && (
                        <span className="tree-meta">{n.meta}</span>
                    )}
                    {actions.length > 0 && (
                        <span className="tree-actions">{actions}</span>
                    )}
                </div>
                {movePanel}
                {isOpen &&
                    ((n.children && n.children.length > 0) ||
                        n.kind === "folder") && (
                        <div>
                            {n.children?.map((c) => renderNode(c))}
                            {n.kind === "tree" && n.tree && (
                                <button
                                    type="button"
                                    className="tree-add"
                                    style={{ paddingLeft: 6 + (n.depth + 1) * 12 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        props.onAddStep(n.tree!.id);
                                    }}
                                    title="Add step"
                                >
                                    <span className="tree-twist placeholder" />
                                    <svg
                                        className="tree-icon"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d={ICON.plus} />
                                    </svg>
                                    <span className="tree-label">Add step</span>
                                </button>
                            )}
                            {n.kind === "folder" && n.folder && (
                                <button
                                    type="button"
                                    className="tree-add"
                                    style={{ paddingLeft: 6 + (n.depth + 1) * 12 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        props.onCreateFlowInFolder(n.folder!.id);
                                    }}
                                    title="Add workflow"
                                >
                                    <span className="tree-twist placeholder" />
                                    <svg
                                        className="tree-icon"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d={ICON.plus} />
                                    </svg>
                                    <span className="tree-label">Add workflow</span>
                                </button>
                            )}
                        </div>
                    )}
            </div>
        );
    };

    return (
        <div className="outliner">
            {flows.length === 0 ? (
                <p className="tree-empty">
                    No workflows yet. Click <b>New</b> above to create one.
                </p>
            ) : (
                tree.map((n) => renderNode(n))
            )}
        </div>
    );
}

/* ---------- tree builders ----------
   Pure functions that turn the flat flow/folder data into the nested
   TreeNode[] the renderer walks. Only the active flow gets its Paths +
   Connections built. Folders are single-level parents containing workflows;
   loose workflows (no folder) render at the root.

   Structure:
     folder (depth 1) > flow (depth 2) > path (3) > step (4) > req (5)
     loose flow (depth 1) > path (2) > step (3) > req (4)
     flow > Connections (depth+1) > edge (+1) */

/** Builds the per-flow TreeNode, parameterised by its indentation depth. */
function flowTreeNode(f: Flow, isActive: boolean, depth: number): TreeNode {
    const flowKey = `flow:${f.id}`;

    // One folder per path; steps are grouped under their path, each with reqs.
    const pathFolders: TreeNode[] = f.trees.map((t) => {
        const pathNodes = f.nodes.filter((n) => n.treeId === t.id);
        return {
            key: `${flowKey}:tree:${t.id}`,
            kind: "tree" as const,
            label: t.name || "Path",
            meta: String(pathNodes.length),
            depth: depth + 1,
            expandable: pathNodes.length > 0,
            tree: t,
            children: pathNodes.map((n) => ({
                key: `${flowKey}:tree:${t.id}:step:${n.id}`,
                kind: "step" as const,
                label: n.label || "(untitled step)",
                meta: TYPE[n.type].label,
                depth: depth + 2,
                // Only expandable if the step has at least one requirement.
                expandable: n.reqs.length > 0,
                node: n,
                children: n.reqs.map((r, i) => ({
                    key: `${flowKey}:tree:${t.id}:step:${n.id}:req:${i}`,
                    kind: "req" as const,
                    label: r.label || "(untitled)",
                    meta: REQ_LABELS[r.kind] ?? r.kind,
                    depth: depth + 3,
                    req: { node: n, index: i, req: r },
                })),
            })),
        };
    });

    // "Connections" folder: human-readable "from -> to" rows, resolved to labels.
    const edgesFolder: TreeNode = {
        key: `${flowKey}:edges`,
        kind: "folder-edges",
        label: "Connections",
        meta: String(f.edges.length),
        depth: depth + 1,
        expandable: true,
        children: f.edges.map((e, i) => {
            const from = f.nodes.find((x) => x.id === e.from);
            const to = f.nodes.find((x) => x.id === e.to);
            return {
                key: `${flowKey}:edge:${i}`,
                kind: "edge" as const,
                label: `${from?.label ?? e.from} → ${to?.label ?? e.to}`,
                meta: e.label,
                depth: depth + 2,
                edge: { fromId: e.from, toId: e.to },
            };
        }),
    };

    return {
        key: flowKey,
        kind: "flow" as const,
        label: f.name || "(untitled workflow)",
        meta: isActive
            ? "active"
            : `${f.nodes.length} steps${f.trees.length ? ` · ${f.trees.length} paths` : ""}`,
        depth,
        expandable: isActive,
        flow: f,
        children: isActive ? [...pathFolders, edgesFolder] : undefined,
    };
}

function buildTree(
    flows: Flow[],
    folders: Folder[],
    activeFlowId: string | null,
): TreeNode[] {
    // Folder rows first, each containing its workflows (one level deeper).
    const folderRows: TreeNode[] = folders.map((folder) => {
        const inFolder = flows.filter((f) => f.folderId === folder.id);
        const containsActive = inFolder.some((f) => f.id === activeFlowId);
        return {
            key: `folder:${folder.id}`,
            kind: "folder" as const,
            label: folder.name || "(untitled folder)",
            meta: String(inFolder.length),
            depth: 1,
            // Always expandable so empty folders can be opened to add workflows.
            expandable: true,
            folder,
            containsActive,
            // Mark so the renderer can highlight the active workflow's folder.
            children: inFolder.map((f) =>
                flowTreeNode(f, f.id === activeFlowId, 2),
            ),
        };
    });

    // Loose workflows (no folder, or whose folder was removed) at the root.
    const folderIds = new Set(folders.map((f) => f.id));
    const looseRows: TreeNode[] = flows
        .filter((f) => !f.folderId || !folderIds.has(f.folderId))
        .map((f) => flowTreeNode(f, f.id === activeFlowId, 1));

    return [...folderRows, ...looseRows];
}

/** Initial expanded-keys set: only the folder containing the active flow (if
 *  any), so it is visible on first load. Child workflows + paths are never
 *  auto-expanded — opening a folder never cascades into its children. */
function initialExpanded(
    activeFlowId: string | null,
    flows: Flow[],
): Set<string> {
    const s = new Set<string>();
    if (activeFlowId) {
        const af = flows.find((f) => f.id === activeFlowId);
        if (af?.folderId) s.add(`folder:${af.folderId}`);
    }
    return s;
}

/** Depth-first search for a TreeNode by key (used by inline rename). */
function findRow(tree: TreeNode[], key: string): TreeNode | null {
    for (const n of tree) {
        if (n.key === key) return n;
        if (n.children) {
            const r = findRow(n.children, key);
            if (r) return r;
        }
    }
    return null;
}
