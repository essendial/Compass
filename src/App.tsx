/**
 * App — the top-level component and single source of truth for app state.
 *
 * Responsibilities:
 *  - Holds all flows + the active flow id, persisted to localStorage.
 *  - Owns all CRUD operations (flows, steps/nodes, edges, requirements).
 *  - Coordinates the layout: TopBar, Sidebar (+ FileOutliner), Canvas/EmptyState,
 *    RightPanel, and modal dialogs (create/rename/delete).
 *
 * Child components are pure/presentational: they receive data + callbacks via
 * props and report user intent back up here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import FileOutliner from "./components/FileOutliner";
import Canvas, { type CanvasHandle } from "./components/Canvas";
import RightPanel from "./components/RightPanel";
import EmptyState from "./components/EmptyState";
import FlowFormModal from "./components/FlowFormModal";
import ConfirmDialog from "./components/ConfirmDialog";
import Modal from "./components/Modal";
import Pathways from "./components/Pathways";
import { createSampleFlow } from "./sampleFlow";
import {
    PATHWAY_TEMPLATES,
    instantiateTemplate,
} from "./pathwayTemplates";
import { uid } from "./utils";
import {
    NODE_PITCH_X,
    NODE_PITCH_Y,
    TREE_COLORS,
    TREE_LANE_BASE_Y,
    TREE_START_X,
} from "./data";
import type { Flow, FlowNode, Folder, NodeTree, NodeType, Req, Side } from "./types";

/** localStorage key under which the full flows array is serialised. */
const FLOWS_KEY = "compass.flows.v1";
/** localStorage key holding the id of the currently-selected flow. */
const ACTIVE_KEY = "compass.activeFlowId.v1";
/** localStorage key under which the folders array is serialised. */
const FOLDERS_KEY = "compass.folders.v1";
/** localStorage key holding the user's preferred right-panel width. */
const PANEL_W_KEY = "compass.panelWidth.v1";
/** localStorage key holding the user's preferred sidebar width. */
const SIDEBAR_W_KEY = "compass.sidebarWidth.v1";
/** localStorage key holding the user's preferred colour theme ("dark"|"light"). */
const THEME_KEY = "compass.theme.v1";
/** Available UI themes. Dark is the historical default. */
type Theme = "dark" | "light";

/** Min/max widths the right panel can be dragged to (px). */
const PANEL_W_MIN = 300;
const PANEL_W_MAX = 720;
/** Default right-panel width when no preference is stored. */
const PANEL_W_DEFAULT = 352;
/** Min/max widths the left sidebar can be dragged to (px). */
const SIDEBAR_W_MIN = 200;
const SIDEBAR_W_MAX = 520;
/** Default sidebar width when no preference is stored. */
const SIDEBAR_W_DEFAULT = 248;

/**
 * Discriminated union describing every modal the app can show.
 * `modal` state is either null (no modal) or one of these variants.
 */
type ModalState =
    | { type: "create-flow"; folderId?: string | null }
    | { type: "rename-flow"; flowId: string; name: string }
    | { type: "delete-flow"; flowId: string; flowName: string }
    | { type: "rename-step"; nodeId: string; name: string }
    | { type: "delete-step"; nodeId: string; stepLabel: string }
    | { type: "create-folder" }
    | { type: "rename-folder"; folderId: string; name: string }
    | { type: "delete-folder"; folderId: string; name: string }
    | {
          type: "connect";
          from: string;
          to: string;
          fromSide: Side;
          toSide: Side;
      };

/**
 * Ensures a flow loaded from storage (or built by older code) has the new
 * `trees` array and that every node has a `treeId`. Legacy flows with no paths
 * get a single default path containing all their nodes.
 */
function normalizeFlow(flow: Flow): Flow {
    // Ensure folderId is explicitly null when missing (covers legacy flows).
    const withFolder: Flow = { ...flow, folderId: flow.folderId ?? null };
    if (withFolder.trees?.length) {
        const fallback = withFolder.trees[0].id;
        const nodes = withFolder.nodes.map((n) =>
            n.treeId ? n : { ...n, treeId: fallback },
        );
        return { ...withFolder, nodes };
    }
    const tid = uid();
    return {
        ...withFolder,
        trees: [{ id: tid, name: "Path 1", color: TREE_COLORS[0] }],
        nodes: withFolder.nodes.map((n) => ({ ...n, treeId: tid })),
    };
}

/** Loads and parses the flows array from localStorage; returns [] on any failure. */
function loadFlows(): Flow[] {
    try {
        const raw = localStorage.getItem(FLOWS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Flow[];
            if (Array.isArray(parsed)) return parsed.map(normalizeFlow);
        }
    } catch {
        /* ignore */
    }
    return [];
}

/** Loads the persisted active-flow id, or null if missing/unreadable. */
function loadActiveFlowId(): string | null {
    try {
        return localStorage.getItem(ACTIVE_KEY);
    } catch {
        return null;
    }
}

/** Loads and parses the folders array from localStorage; returns [] on any failure. */
function loadFolders(): Folder[] {
    try {
        const raw = localStorage.getItem(FOLDERS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed as Folder[];
        }
    } catch {
        /* ignore */
    }
    return [];
}

export default function App() {
    const [flows, setFlows] = useState<Flow[]>(loadFlows);
    const [folders, setFolders] = useState<Folder[]>(loadFolders);
    const [activeFlowId, setActiveFlowId] = useState<string | null>(
        loadActiveFlowId,
    );

    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    // Multi-select: all nodes of a pathway clicked on its background. Used only
    // for group-move on the canvas (does not open the right panel).
    const [groupIds, setGroupIds] = useState<Set<string>>(
        () => new Set<string>(),
    );
    const [panelNodeId, setPanelNodeId] = useState<string | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);
    const [panelMode, setPanelMode] = useState<"view" | "edit">("view");
    // User-draggable right-panel width, restored from localStorage (clamped).
    const [panelWidth, setPanelWidth] = useState(() => {
        try {
            const v = Number(localStorage.getItem(PANEL_W_KEY));
            if (v >= PANEL_W_MIN && v <= PANEL_W_MAX) return v;
        } catch {
            /* ignore */
        }
        return PANEL_W_DEFAULT;
    });
    // User-draggable sidebar width, restored from localStorage (clamped).
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            const v = Number(localStorage.getItem(SIDEBAR_W_KEY));
            if (v >= SIDEBAR_W_MIN && v <= SIDEBAR_W_MAX) return v;
        } catch {
            /* ignore */
        }
        return SIDEBAR_W_DEFAULT;
    });
    // Colour theme, restored from localStorage (defaults to dark).
    const [theme, setTheme] = useState<Theme>(() => {
        try {
            const v = localStorage.getItem(THEME_KEY);
            if (v === "light" || v === "dark") return v;
        } catch {
            /* ignore */
        }
        return "dark";
    });
    const [hintHidden, setHintHidden] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [modal, setModal] = useState<ModalState | null>(null);
    const [isMobile, setIsMobile] = useState(
        () =>
            typeof window !== "undefined" &&
            window.matchMedia("(max-width: 880px)").matches,
    );

    const canvasRef = useRef<CanvasHandle>(null);

    /* ---------- persistence ----------
       Mirror flows + active-flow id into localStorage whenever they change.
       Wrapped in try/catch so private-mode/quota errors never crash the app. */
    useEffect(() => {
        try {
            localStorage.setItem(FLOWS_KEY, JSON.stringify(flows));
        } catch {
            /* ignore */
        }
    }, [flows]);

    useEffect(() => {
        try {
            localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
        } catch {
            /* ignore */
        }
    }, [folders]);

    useEffect(() => {
        try {
            if (activeFlowId) localStorage.setItem(ACTIVE_KEY, activeFlowId);
            else localStorage.removeItem(ACTIVE_KEY);
        } catch {
            /* ignore */
        }
    }, [activeFlowId]);

    // Persist the right-panel width preference.
    useEffect(() => {
        try {
            localStorage.setItem(PANEL_W_KEY, String(panelWidth));
        } catch {
            /* ignore */
        }
    }, [panelWidth]);

    // Persist the sidebar width preference.
    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_W_KEY, String(sidebarWidth));
        } catch {
            /* ignore */
        }
    }, [sidebarWidth]);

    // Persist the colour theme + reflect it on <html> so CSS tokens swap.
    useEffect(() => {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch {
            /* ignore */
        }
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    /* Track whether the viewport is mobile-width (drives sidebar scrim behaviour). */
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 880px)");
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    /* ---------- derived ---------- */
    const activeFlow = flows.find((f) => f.id === activeFlowId) ?? null;

    // Normalise: if stored active id isn't in flows (e.g. deleted), fall back to the first flow.
    useEffect(() => {
        if (activeFlowId && !activeFlow) {
            setActiveFlowId(flows[0]?.id ?? null);
        }
    }, [activeFlowId, activeFlow, flows]);

    const nodes = activeFlow?.nodes ?? [];
    const edges = activeFlow?.edges ?? [];
    const trees = activeFlow?.trees ?? [];
    // The node currently shown in the right panel (may differ from the canvas selection).
    const panelNode =
        activeFlow?.nodes.find((n) => n.id === panelNodeId) ?? null;
    // The path that the panelled node belongs to (for the path colour/name controls).
    const panelTree =
        panelNode
            ? (activeFlow?.trees.find((t) => t.id === panelNode.treeId) ?? null)
            : null;

    /* ---------- flow CRUD ---------- */
    // Each callback opens the corresponding modal (the actual mutation happens on submit).
    /** Opens the create-workflow modal, optionally targeting a parent folder. */
    const openCreateFlow = useCallback((folderId?: string | null) =>
        setModal({ type: "create-flow", folderId }), []);

    /** Creates a new empty flow (optionally inside a folder), activates it. */
    const createFlow = useCallback(
        (name: string, folderId?: string | null) => {
            const flow: Flow = {
                id: uid(),
                name,
                nodes: [],
                edges: [],
                trees: [],
                folderId: folderId ?? null,
            };
            setFlows((prev) => [...prev, flow]);
            setActiveFlowId(flow.id);
            setSelectedNodeId(null);
            setPanelOpen(false);
        },
        [],
    );

    /** Moves a workflow into a folder, or to the root when folderId is null. */
    const moveFlowToFolder = useCallback(
        (flowId: string, folderId: string | null) => {
            setFlows((prev) =>
                prev.map((f) =>
                    f.id === flowId ? { ...f, folderId } : f,
                ),
            );
        },
        [],
    );

    /* ---------- folder CRUD ----------
       Folders are single-level containers for workflows. Deleting a folder
       keeps its workflows (they fall back to the root level). */
    const createFolder = useCallback((name: string) => {
        setFolders((prev) => [...prev, { id: uid(), name }]);
    }, []);

    const renameFolder = useCallback((id: string, name: string) => {
        setFolders((prev) =>
            prev.map((f) => (f.id === id ? { ...f, name: name || f.name } : f)),
        );
    }, []);

    /** Removes a folder; any workflows inside are moved to the root. */
    const deleteFolder = useCallback((id: string) => {
        setFolders((prev) => prev.filter((f) => f.id !== id));
        setFlows((prev) =>
            prev.map((f) => (f.folderId === id ? { ...f, folderId: null } : f)),
        );
    }, []);

    /** Renames a flow (no-op if name is blank). */
    const renameFlow = useCallback((flowId: string, name: string) => {
        setFlows((prev) =>
            prev.map((f) =>
                f.id === flowId ? { ...f, name: name || f.name } : f,
            ),
        );
    }, []);

    /** Removes a flow; if it was active, falls back to the next remaining flow. */
    const deleteFlow = useCallback(
        (flowId: string) => {
            const remaining = flows.filter((f) => f.id !== flowId);
            setFlows(remaining);
            if (activeFlowId === flowId) {
                setActiveFlowId(remaining[0]?.id ?? null);
            }
            setSelectedNodeId(null);
            setPanelOpen(false);
        },
        [flows, activeFlowId],
    );

    /** Switches the active flow and resets selection/panel state. */
    const selectFlow = useCallback(
        (flowId: string) => {
            setActiveFlowId(flowId);
            setSelectedNodeId(null);
            setPanelOpen(false);
            setPanelMode("view");
        },
        [],
    );

    /** Loads a fresh copy of the built-in sample workflow and activates it. */
    const loadSample = useCallback(() => {
        const flow = createSampleFlow();
        setFlows((prev) => [...prev, flow]);
        setActiveFlowId(flow.id);
        setSelectedNodeId(null);
        setPanelOpen(false);
    }, []);

    /* ---------- node CRUD (within active flow) ---------- */
    /** Helper: immutably updates the currently-active flow, leaving others untouched. */
    const patchActiveFlow = useCallback(
        (updater: (f: Flow) => Flow) => {
            setFlows((prev) =>
                prev.map((f) => (f.id === activeFlowId ? updater(f) : f)),
            );
        },
        [activeFlowId],
    );

    /** Asks the canvas (via imperative handle) to pan/zoom a node into view. */
    const scrollToNode = useCallback((id: string) => {
        canvasRef.current?.centerOnNode(id);
    }, []);

    /** Updates a node's canvas position (called continuously during drag). */
    const moveNode = useCallback(
        (nodeId: string, x: number, y: number) => {
            patchActiveFlow((f) => ({
                ...f,
                nodes: f.nodes.map((n) =>
                    n.id === nodeId ? { ...n, x, y } : n,
                ),
            }));
        },
        [patchActiveFlow],
    );

    /**
     * Selects a node: sets canvas selection, opens the right panel for it,
     * and optionally scrolls it into view. Hides the first-use hint. Clears any
     * canvas group selection (single-node selection takes precedence).
     */
    const selectNode = useCallback(
        (id: string, opts?: { mode?: "view" | "edit"; scroll?: boolean }) => {
            const { mode = "view", scroll = false } = opts ?? {};
            setSelectedNodeId(id);
            setGroupIds(new Set());
            setPanelNodeId(id);
            setPanelOpen(true);
            setPanelMode(mode);
            setHintHidden(true);
            if (scroll) requestAnimationFrame(() => scrollToNode(id));
        },
        [scrollToNode],
    );

    /** Clears selection and closes the right panel (also clears group). */
    const closePanel = useCallback(() => {
        setSelectedNodeId(null);
        setGroupIds(new Set());
        setPanelOpen(false);
        setPanelMode("view");
    }, []);

    /**
     * Selects every node in a pathway as a group (canvas multi-select for
     * group-move). Clears single-node selection and closes the right panel —
     * group selection is for moving, not editing a single step.
     */
    const selectGroup = useCallback(
        (treeId: string) => {
            if (!activeFlow) return;
            const ids = activeFlow.nodes
                .filter((n) => n.treeId === treeId)
                .map((n) => n.id);
            setGroupIds(new Set(ids));
            setSelectedNodeId(null);
            setPanelOpen(false);
            setPanelMode("view");
        },
        [activeFlow],
    );

    /** Batch-updates many node positions in one state tick (used for group-move). */
    const moveNodes = useCallback(
        (updates: Array<{ id: string; x: number; y: number }>) => {
            const map = new Map(updates.map((u) => [u.id, u]));
            patchActiveFlow((f) => ({
                ...f,
                nodes: f.nodes.map((n) => {
                    const u = map.get(n.id);
                    return u ? { ...n, x: u.x, y: u.y } : n;
                }),
            }));
        },
        [patchActiveFlow],
    );

    /* ---------- path (node-tree) + step CRUD ----------
       A flow holds several paths (NodeTree[]). Each step belongs to one path
       and is laid out left -> right within it; separate paths stack as lanes. */

    /** Y for a brand-new lane placed below every existing node. */
    const nextLaneY = useCallback(
        () =>
            (activeFlow?.nodes.length ?? 0)
                ? Math.max(...activeFlow!.nodes.map((n) => n.y)) + NODE_PITCH_Y
                : TREE_LANE_BASE_Y,
        [activeFlow],
    );

    /**
     * Appends a new step to a path (chained to the right of the path's last
     * node and auto-connected to it). If no path exists yet (and no treeId is
     * given) the first path is created. The new step opens in edit mode.
     */
    const addStep = useCallback(
        (treeId?: string) => {
            if (!activeFlow) return;
            const flow = activeFlow;
            let trees = flow.trees;
            let targetTreeId = treeId ?? trees[0]?.id;
            // No paths yet: spin up the first one.
            if (!targetTreeId) {
                targetTreeId = uid();
                trees = [
                    ...trees,
                    {
                        id: targetTreeId,
                        name: `Path ${trees.length + 1}`,
                        color: TREE_COLORS[trees.length % TREE_COLORS.length],
                    },
                ];
            }
            const id = uid();
            const pathNodes = flow.nodes.filter(
                (n) => n.treeId === targetTreeId,
            );
            const isFirst = pathNodes.length === 0;
            // Rightmost node in the path (chaining anchor); null on a fresh path.
            const last = pathNodes.length
                ? pathNodes.reduce((a, b) => (a.x >= b.x ? a : b))
                : null;
            const x = last ? last.x + NODE_PITCH_X : TREE_START_X;
            const y = last ? last.y : nextLaneY();
            const node: FlowNode = {
                id,
                label: isFirst ? "New start" : "New step",
                type: isFirst ? "trigger" : "action",
                x,
                y,
                status: "draft",
                owner: "Unassigned",
                sla: "—",
                summary: "",
                reqs: [],
                treeId: targetTreeId,
            };
            patchActiveFlow((f) => ({
                ...f,
                trees,
                nodes: [...f.nodes, node],
                edges: last
                    ? [...f.edges, { from: last.id, to: id }]
                    : f.edges,
            }));
            selectNode(id, { mode: "edit", scroll: true });
        },
        [activeFlow, nextLaneY, patchActiveFlow, selectNode],
    );

    /**
     * Drops a brand-new node of an explicit type at a canvas (world) position —
     * used by the "a" quick-add picker on the canvas. Unlike `addStep`, it does
     * not auto-chain to a neighbour (the user chose where to place it). The
     * path is inferred: the selected node's path, else the first path, else a
     * new one is created. Opens the new node in edit mode.
     */
    const addNodeAt = useCallback(
        (type: NodeType, x: number, y: number) => {
            if (!activeFlow) return;
            const flow = activeFlow;
            let trees = flow.trees;
            // Prefer the selected node's path so the new step joins it.
            let targetTreeId = flow.nodes.find(
                (n) => n.id === selectedNodeId,
            )?.treeId;
            if (!targetTreeId) targetTreeId = trees[0]?.id;
            // No paths yet: spin up the first one.
            if (!targetTreeId) {
                targetTreeId = uid();
                trees = [
                    ...trees,
                    {
                        id: targetTreeId,
                        name: `Path ${trees.length + 1}`,
                        color: TREE_COLORS[trees.length % TREE_COLORS.length],
                    },
                ];
            }
            const id = uid();
            const node: FlowNode = {
                id,
                label: type === "trigger" ? "New start" : "New step",
                type,
                x,
                y,
                status: "draft",
                owner: "Unassigned",
                sla: "—",
                summary: "",
                reqs: [],
                treeId: targetTreeId,
            };
            patchActiveFlow((f) => ({
                ...f,
                trees,
                nodes: [...f.nodes, node],
            }));
            // Already placed in view, so don't scroll — just open for naming.
            selectNode(id, { mode: "edit", scroll: false });
        },
        [activeFlow, selectedNodeId, patchActiveFlow, selectNode],
    );

    /**
     * Creates a brand-new path (a second/third instruction route) with its own
     * colour, places its first trigger node in a fresh lane below the others,
     * and opens that node in edit mode.
     */
    const createTree = useCallback(() => {
        if (!activeFlow) return;
        const treeId = uid();
        const idx = activeFlow.trees.length;
        const node = uid();
        const y = nextLaneY();
        const newNode: FlowNode = {
            id: node,
            label: "New start",
            type: "trigger",
            x: TREE_START_X,
            y,
            status: "draft",
            owner: "Unassigned",
            sla: "—",
            summary: "",
            reqs: [],
            treeId,
        };
        patchActiveFlow((f) => ({
            ...f,
            trees: [
                ...f.trees,
                {
                    id: treeId,
                    name: `Path ${f.trees.length + 1}`,
                    color: TREE_COLORS[idx % TREE_COLORS.length],
                },
            ],
            nodes: [...f.nodes, newNode],
        }));
        selectNode(node, { mode: "edit", scroll: true });
    }, [activeFlow, nextLaneY, patchActiveFlow, selectNode]);

    /**
     * Inserts a curated pathway template as a brand-new path in the active
     * flow: fresh ids, auto-picked colour from the shared palette, laid out in
     * a lane below any existing nodes. Selects the new path's first node.
     */
    const insertTemplate = useCallback(
        (templateId: string) => {
            if (!activeFlow) return;
            const template = PATHWAY_TEMPLATES.find((t) => t.id === templateId);
            if (!template) return;
            const color =
                TREE_COLORS[activeFlow.trees.length % TREE_COLORS.length];
            const { tree, nodes, edges } = instantiateTemplate(
                template,
                nextLaneY(),
                color,
            );
            patchActiveFlow((f) => ({
                ...f,
                trees: [...f.trees, tree],
                nodes: [...f.nodes, ...nodes],
                edges: [...f.edges, ...edges],
            }));
            // Open the first node of the new path in the editor.
            const firstId = nodes[0]?.id;
            if (firstId) selectNode(firstId, { mode: "edit", scroll: true });
        },
        [activeFlow, nextLaneY, patchActiveFlow, selectNode],
    );

    /** Updates a path's mutable fields (name / colour). */
    const updateTree = useCallback(
        (treeId: string, patch: Partial<NodeTree>) => {
            patchActiveFlow((f) => ({
                ...f,
                trees: f.trees.map((t) =>
                    t.id === treeId ? { ...t, ...patch } : t,
                ),
            }));
        },
        [patchActiveFlow],
    );

    /** Removes a path and all of its steps + any edges touching them. */
    const deleteTree = useCallback(
        (treeId: string) => {
            patchActiveFlow((f) => {
                const doomed = new Set(
                    f.nodes.filter((n) => n.treeId === treeId).map((n) => n.id),
                );
                return {
                    ...f,
                    trees: f.trees.filter((t) => t.id !== treeId),
                    nodes: f.nodes.filter((n) => n.treeId !== treeId),
                    edges: f.edges.filter(
                        (e) => !doomed.has(e.from) && !doomed.has(e.to),
                    ),
                };
            });
            setSelectedNodeId(null);
            setPanelOpen(false);
        },
        [patchActiveFlow],
    );

    /** Partial-updates a single node by id (used by the right panel edit form). */
    const updateNode = useCallback(
        (nodeId: string, patch: Partial<FlowNode>) => {
            patchActiveFlow((f) => ({
                ...f,
                nodes: f.nodes.map((n) =>
                    n.id === nodeId ? { ...n, ...patch } : n,
                ),
            }));
        },
        [patchActiveFlow],
    );

    /** Removes a node and any edges that referenced it. */
    const deleteNode = useCallback(
        (nodeId: string) => {
            patchActiveFlow((f) => ({
                ...f,
                nodes: f.nodes.filter((n) => n.id !== nodeId),
                edges: f.edges.filter(
                    (e) => e.from !== nodeId && e.to !== nodeId,
                ),
            }));
            setSelectedNodeId(null);
            setPanelOpen(false);
        },
        [patchActiveFlow],
    );

    /** Renames a step (no-op if blank). Used by the rename-step modal. */
    const renameStep = useCallback(
        (nodeId: string, label: string) => {
            patchActiveFlow((f) => ({
                ...f,
                nodes: f.nodes.map((n) =>
                    n.id === nodeId ? { ...n, label: label || n.label } : n,
                ),
            }));
        },
        [patchActiveFlow],
    );

    /** Removes the edge with the given (from -> to) endpoints. */
    const deleteEdge = useCallback(
        (from: string, to: string) => {
            patchActiveFlow((f) => ({
                ...f,
                edges: f.edges.filter(
                    (e) => !(e.from === from && e.to === to),
                ),
            }));
        },
        [patchActiveFlow],
    );

    /**
     * Begins a new connection. Rather than adding the edge immediately, it
     * opens a small prompt asking whether the connection is a resubmit /
     * feedback loop (dashed) or a normal edge. Self-edges and exact duplicates
     * are ignored before prompting. The actual add is done by `commitConnection`.
     */
    const connectNodes = useCallback(
        (from: string, to: string, fromSide: Side, toSide: Side) => {
            if (from === to || !activeFlow) return;
            if (activeFlow.edges.some((e) => e.from === from && e.to === to)) {
                return;
            }
            setModal({ type: "connect", from, to, fromSide, toSide });
        },
        [activeFlow],
    );

    /** Finalises a connection started by `connectNodes`. `resubmit` makes the
     *  edge dashed and labels it "resubmit" (a feedback loop). */
    const commitConnection = useCallback(
        (
            from: string,
            to: string,
            fromSide: Side,
            toSide: Side,
            resubmit: boolean,
        ) => {
            patchActiveFlow((f) => ({
                ...f,
                edges: [
                    ...f.edges,
                    resubmit
                        ? { from, to, fromSide, toSide, dashed: true, label: "resubmit" }
                        : { from, to, fromSide, toSide },
                ],
            }));
        },
        [patchActiveFlow],
    );

    /* ---------- requirement CRUD ----------
       All operate within a single node's `reqs` array, found by index.
       Requirement items are the string entries inside each requirement (e.g. the
       chips); add/remove by (reqIndex, itemIndex). */
    const addRequirement = useCallback(
        (nodeId: string) =>
            patchActiveFlow((f) => ({
                ...f,
                nodes: f.nodes.map((n) =>
                    n.id === nodeId
                        ? {
                              ...n,
                              reqs: [
                                  ...n.reqs,
                                  {
                                      kind: "rule",
                                      label: "New requirement",
                                      items: [],
                                  },
                              ],
                          }
                        : n,
                ),
            })),
        [patchActiveFlow],
    );

    const updateRequirement = useCallback(
        (nodeId: string, i: number, patch: Partial<Req>) =>
            patchActiveFlow((f) => ({
                ...f,
                nodes: f.nodes.map((n) =>
                    n.id === nodeId
                        ? {
                              ...n,
                              reqs: n.reqs.map((r, j) =>
                                  j === i ? { ...r, ...patch } : r,
                              ),
                          }
                        : n,
                ),
            })),
        [patchActiveFlow],
    );

    const removeRequirement = useCallback(
        (nodeId: string, i: number) =>
            patchActiveFlow((f) => ({
                ...f,
                nodes: f.nodes.map((n) =>
                    n.id === nodeId
                        ? { ...n, reqs: n.reqs.filter((_, j) => j !== i) }
                        : n,
                ),
            })),
        [patchActiveFlow],
    );

    const addRequirementItem = useCallback(
        (nodeId: string, i: number, item: string) =>
            patchActiveFlow((f) => ({
                ...f,
                nodes: f.nodes.map((n) =>
                    n.id === nodeId
                        ? {
                              ...n,
                              reqs: n.reqs.map((r, j) =>
                                  j === i
                                      ? { ...r, items: [...r.items, item] }
                                      : r,
                              ),
                          }
                        : n,
                ),
            })),
        [patchActiveFlow],
    );

    const removeRequirementItem = useCallback(
        (nodeId: string, i: number, j: number) =>
            patchActiveFlow((f) => ({
                ...f,
                nodes: f.nodes.map((n) =>
                    n.id === nodeId
                        ? {
                              ...n,
                              reqs: n.reqs.map((r, ri) =>
                                  ri === i
                                      ? {
                                              ...r,
                                              items: r.items.filter(
                                                  (_, ij) => ij !== j,
                                              ),
                                          }
                                      : r,
                              ),
                          }
                        : n,
                ),
            })),
        [patchActiveFlow],
    );

    /* ---------- mobile UI helpers ---------- */
    /** Toggles the slide-in sidebar (mobile menu button). */
    const handleToggleMenu = useCallback(() => setSidebarOpen((v) => !v), []);
    /** Toggles between the dark and light colour themes. */
    const handleToggleTheme = useCallback(
        () => setTheme((t) => (t === "dark" ? "light" : "dark")),
        [],
    );
    /** Clears selection/panel/sidebar — bound to the mobile scrim overlay. */
    const handleScrimClick = useCallback(() => {
        setSelectedNodeId(null);
        setPanelOpen(false);
        setSidebarOpen(false);
    }, []);

    /** Mobile: show a click-catcher behind the right panel when a node is selected. */
    const scrimShow = isMobile && selectedNodeId !== null;

    /** Canvas shows when there is an active flow with at least one step. */
    const showCanvas = !!activeFlow && nodes.length > 0;
    /** One-time coaching hint, shown until the user selects their first step. */
    const showHint =
        !!activeFlow && nodes.length > 0 && !hintHidden && !selectedNodeId;

    return (
        <div className="app">
            <TopBar
                activeFlowName={activeFlow?.name ?? null}
                onToggleMenu={handleToggleMenu}
                theme={theme}
                onToggleTheme={handleToggleTheme}
            />
            <div className="body">
                {/* Left: collapsible sidebar wrapping the file outliner tree. */}
                <Sidebar
                    open={sidebarOpen}
                    width={sidebarWidth}
                    onWidthChange={setSidebarWidth}
                    onAddFlow={() => openCreateFlow()}
                    onAddFolder={() => setModal({ type: "create-folder" })}
                    pathways={
                        activeFlow ? (
                        <Pathways
                            trees={trees}
                            onCreate={createTree}
                            onUpdate={updateTree}
                            onDelete={deleteTree}
                            onInsertTemplate={insertTemplate}
                        />
                        ) : null
                    }
                >
                    <FileOutliner
                        flows={flows}
                        folders={folders}
                        activeFlowId={activeFlowId}
                        selectedNodeId={selectedNodeId}
                        onCreateFlow={openCreateFlow}
                        onSelectFlow={selectFlow}
                        onRenameFlow={(f) =>
                            setModal({
                                type: "rename-flow",
                                flowId: f.id,
                                name: f.name,
                            })
                        }
                        onDeleteFlow={(f) =>
                            setModal({
                                type: "delete-flow",
                                flowId: f.id,
                                flowName: f.name,
                            })
                        }
                        onRenameFolder={(f) =>
                            setModal({
                                type: "rename-folder",
                                folderId: f.id,
                                name: f.name,
                            })
                        }
                        onDeleteFolder={(f) =>
                            setModal({
                                type: "delete-folder",
                                folderId: f.id,
                                name: f.name,
                            })
                        }
                        onCreateFlowInFolder={(folderId) =>
                            openCreateFlow(folderId)
                        }
                        onMoveFlow={moveFlowToFolder}
                        onCreateTree={createTree}
                        onDeleteTree={deleteTree}
                        onRenameTree={(treeId, name) =>
                            updateTree(treeId, { name })
                        }
                        onChangeTreeColor={(treeId, color) =>
                            updateTree(treeId, { color })
                        }
                        onAddStep={(treeId) => addStep(treeId)}
                        onRenameStep={(n) =>
                            setModal({
                                type: "rename-step",
                                nodeId: n.id,
                                name: n.label,
                            })
                        }
                        onDeleteStep={(n) =>
                            setModal({
                                type: "delete-step",
                                nodeId: n.id,
                                stepLabel: n.label,
                            })
                        }
                        onSelectStep={(id) => selectNode(id, { scroll: true })}
                        onCreateReq={(nodeId) => addRequirement(nodeId)}
                        onRenameReq={(nodeId, i, label) =>
                            updateRequirement(nodeId, i, { label })
                        }
                        onDeleteReq={(nodeId, i) => removeRequirement(nodeId, i)}
                        onDeleteEdge={(from, to) => deleteEdge(from, to)}
                    />
                </Sidebar>

                {/* Centre: interactive node canvas, or the empty-state placeholder. */}
                {showCanvas ? (
                    <Canvas
                        ref={canvasRef}
                        flowId={activeFlowId}
                        nodes={nodes}
                        edges={edges}
                        trees={trees}
                        selectedId={selectedNodeId}
                        groupIds={groupIds}
                        onSelect={(id) => selectNode(id, { scroll: false })}
                        onSelectGroup={selectGroup}
                        onBackgroundClick={closePanel}
                        onMoveNode={moveNode}
                        onMoveNodes={moveNodes}
                        onConnect={connectNodes}
                        onAddNode={addNodeAt}
                        onDeleteEdge={(from, to) => deleteEdge(from, to)}
                    />
                ) : (
                    <EmptyState
                        variant={activeFlow ? "no-steps" : "no-flows"}
                        onCreateFlow={openCreateFlow}
                        onLoadSample={loadSample}
                        onAddStep={() => addStep()}
                    />
                )}

                {/* Mobile-only scrim: tap to dismiss the right panel. */}
                <div
                    className={"scrim" + (scrimShow ? " show" : "")}
                    onClick={handleScrimClick}
                ></div>
                {/* First-use coaching hint, shown over the canvas until dismissed. */}
                {showHint && (
                    <div className="hint">
                        Select any step to see what it does and what it needs →
                    </div>
                )}

                {/* Right: step details / editor panel (only when a node is selected). */}
                {panelNode && (
                    <RightPanel
                        node={panelNode}
                        nodes={nodes}
                        edges={edges}
                        tree={panelTree}
                        mode={panelMode}
                        open={panelOpen}
                        width={panelWidth}
                        onWidthChange={setPanelWidth}
                        onClose={closePanel}
                        onSetMode={setPanelMode}
                        onChange={(patch) => updateNode(panelNode.id, patch)}
                        onChangeTree={(patch) =>
                            panelTree && updateTree(panelTree.id, patch)
                        }
                        onDelete={() =>
                            setModal({
                                type: "delete-step",
                                nodeId: panelNode.id,
                                stepLabel: panelNode.label,
                            })
                        }
                        onSelectNode={(id) =>
                            selectNode(id, { scroll: true })
                        }
                        reqOps={{
                            add: () => addRequirement(panelNode.id),
                            update: (i, patch) =>
                                updateRequirement(panelNode.id, i, patch),
                            remove: (i) => removeRequirement(panelNode.id, i),
                            addItem: (i, item) =>
                                addRequirementItem(panelNode.id, i, item),
                            removeItem: (i, j) =>
                                removeRequirementItem(panelNode.id, i, j),
                        }}
                    />
                )}
            </div>

            {/* ---------- Modal layer: one of these renders depending on `modal`. ---------- */}
            {modal?.type === "create-flow" && (
                <FlowFormModal
                    title="Create workflow"
                    submitLabel="Create"
                    onSubmit={(name) => {
                        createFlow(name, modal.folderId);
                        setModal(null);
                    }}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === "rename-flow" && (
                <FlowFormModal
                    title="Rename workflow"
                    submitLabel="Save"
                    initialName={modal.name}
                    onSubmit={(name) => {
                        renameFlow(modal.flowId, name);
                        setModal(null);
                    }}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === "delete-flow" && (
                <ConfirmDialog
                    title="Delete workflow"
                    message={
                        <>
                            Delete <b>{modal.flowName}</b> and all of its
                            steps? This can't be undone.
                        </>
                    }
                    onConfirm={() => deleteFlow(modal.flowId)}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === "delete-step" && (
                <ConfirmDialog
                    title="Delete step"
                    message={
                        <>
                            Delete the step <b>{modal.stepLabel}</b>? Its
                            connections will be removed too.
                        </>
                    }
                    onConfirm={() => deleteNode(modal.nodeId)}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === "rename-step" && (
                <FlowFormModal
                    title="Rename step"
                    submitLabel="Save"
                    initialName={modal.name}
                    placeholder="Step name"
                    onSubmit={(name) => {
                        renameStep(modal.nodeId, name);
                        setModal(null);
                    }}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === "create-folder" && (
                <FlowFormModal
                    title="Create folder"
                    submitLabel="Create"
                    placeholder="Folder name"
                    onSubmit={(name) => {
                        createFolder(name);
                        setModal(null);
                    }}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === "rename-folder" && (
                <FlowFormModal
                    title="Rename folder"
                    submitLabel="Save"
                    initialName={modal.name}
                    placeholder="Folder name"
                    onSubmit={(name) => {
                        renameFolder(modal.folderId, name);
                        setModal(null);
                    }}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === "delete-folder" && (
                <ConfirmDialog
                    title="Delete folder"
                    message={
                        <>
                            Delete the folder <b>{modal.name}</b>? The
                            workflows inside will be kept and moved to the root.
                        </>
                    }
                    onConfirm={() => deleteFolder(modal.folderId)}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === "connect" &&
                (() => {
                    const fromNode = activeFlow?.nodes.find(
                        (n) => n.id === modal.from,
                    );
                    const toNode = activeFlow?.nodes.find(
                        (n) => n.id === modal.to,
                    );
                    return (
                        <Modal
                            title="New connection"
                            onClose={() => setModal(null)}
                            footer={
                                <>
                                    <button
                                        className="btn"
                                        onClick={() => setModal(null)}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="btn"
                                        onClick={() => {
                                            commitConnection(
                                                modal.from,
                                                modal.to,
                                                modal.fromSide,
                                                modal.toSide,
                                                false,
                                            );
                                            setModal(null);
                                        }}
                                    >
                                        Normal
                                    </button>
                                    <button
                                        className="btn primary"
                                        onClick={() => {
                                            commitConnection(
                                                modal.from,
                                                modal.to,
                                                modal.fromSide,
                                                modal.toSide,
                                                true,
                                            );
                                            setModal(null);
                                        }}
                                    >
                                        Resubmit
                                    </button>
                                </>
                            }
                        >
                            <p className="confirm-msg">
                                Connect <b>{fromNode?.label ?? "step"}</b> to{" "}
                                <b>{toNode?.label ?? "step"}</b>.
                                <br />
                                Is this a resubmit or feedback loop?
                            </p>
                        </Modal>
                    );
                })()}
        </div>
    );
}
