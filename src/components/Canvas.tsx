/**
 * Canvas — the interactive, pan/zoom node graph where a workflow is drawn.
 *
 * Rendering model:
 *   <main.canvas>                          // viewport, captures pointer/wheel
 *     <div.canvas-world>                   // transformed layer (translate + scale)
 *       <div.canvas-inner>                 // sized to fit all nodes
 *         <svg.edges> ... </svg>           // bezier curves between nodes
 *         <div.node> ... </div>            // one absolutely-positioned card per node
 *
 * Interaction:
 *   - Drag empty space -> pan the world.
 *   - Drag a node       -> move that node (reports new x/y up via onMoveNode).
 *   - Click a node      -> select it (calls onSelect) if the pointer didn't move.
 *   - Click background  -> deselect (calls onBackgroundClick).
 *   - Wheel             -> pan; Ctrl/Cmd+wheel (or trackpad pinch) -> zoom.
 *   - Zoom buttons + reset are rendered bottom-left.
 *
 * The parent can drive the view imperatively via the forwarded CanvasHandle
 * (e.g. centerOnNode when a step is clicked in the outliner).
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from "react";
import type {
  Edge,
  FlowNode,
  NodeStatus,
  NodeTree,
  NodeType,
  Side,
} from "../types";
import { NODE_H, NODE_W, REQ, TYPE, TYPE_ORDER } from "../data";
import { anchor, curve, curvePoint } from "../geometry";

interface Props {
  nodes: FlowNode[];
  edges: Edge[];
  /** Paths in the flow; each renders a coloured encompassing border. */
  trees: NodeTree[];
  selectedId: string | null;
  /** Node ids currently selected as a group (canvas multi-select for group-move). */
  groupIds: Set<string>;
  /** Changing flowId resets the view (see useEffect below). */
  flowId?: string | null;
  onSelect: (id: string) => void;
  /** Called when a pathway's background is clicked/dragged — selects its group. */
  onSelectGroup?: (treeId: string) => void;
  onBackgroundClick?: () => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  /** Batch-move many nodes (used by group-move). */
  onMoveNodes?: (updates: Array<{ id: string; x: number; y: number }>) => void;
  /** Create a directed connection by dragging from one node's handle to another. */
  onConnect: (from: string, to: string, fromSide: Side, toSide: Side) => void;
  /** Drop a new node of the given type at canvas (world) coordinates — used by
   *  the "a" quick-add picker. */
  onAddNode: (type: NodeType, x: number, y: number) => void;
  /** Remove the connection between two nodes (used by the edge delete button). */
  onDeleteEdge?: (from: string, to: string) => void;
}

/** Imperative API exposed to the parent via a ref. */
export interface CanvasHandle {
  /** Pan/zoom so the given node is centered in the viewport. */
  centerOnNode: (id: string) => void;
  /** Centre the viewport on the starting node (first/root node of the flow). */
  centerOnStart: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

/** Current camera: world translation (x, y) and scale (zoom). */
interface View {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
/** Initial camera position: slightly inset from the top-left. */
const DEFAULT_VIEW: View = { x: 60, y: 40, zoom: 1 };
/** Pointer must move at least this many px before it counts as a drag (not a click). */
const DRAG_THRESHOLD = 3;

/** Maps NodeStatus -> CSS class used for the node's status flag. */
const STATUS_CLS: Record<NodeStatus, string> = {
  live: "status-live",
  review: "status-review",
  draft: "status-draft",
};
/** Maps NodeStatus -> human-readable label for the status flag. */
const STATUS_TXT: Record<NodeStatus, string> = {
  live: "Live",
  review: "In review",
  draft: "Draft",
};

/** Clamps v into the inclusive [lo, hi] range. */
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Outward unit vector for each side (mirrors geometry.ts anchor directions). */
const SIDE_DIR: Record<Side, { dx: number; dy: number }> = {
  top: { dx: 0, dy: -1 },
  bottom: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  {
    nodes,
    edges,
    trees,
    selectedId,
    groupIds,
    flowId,
    onSelect,
    onSelectGroup,
    onBackgroundClick,
    onMoveNode,
    onMoveNodes,
    onConnect,
    onAddNode,
    onDeleteEdge,
  },
  ref,
) {
  const viewportRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [panning, setPanning] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Whether a group (pathway) drag is in progress (drives cursor styling).
  const [grouping, setGrouping] = useState(false);
  // Node id currently hovered (idle) — its connection handles are shown.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // In-progress connection being dragged from a handle (world coords).
  const [draftEdge, setDraftEdge] = useState<{
    fromId: string;
    fromSide: Side;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } | null>(null);
  // Node id under the cursor during a connection drag (drop target highlight).
  const [connectTargetId, setConnectTargetId] = useState<string | null>(null);
  // Index (in `edges`) of the connection currently being hovered for deletion.
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  // The "a" quick-add type picker. `pickerAt` is the screen position (relative
  // to the canvas) where it should appear — null when closed. `pickerPos` holds
  // the world coords where the chosen node will be dropped.
  const [pickerAt, setPickerAt] = useState<{ x: number; y: number } | null>(
    null,
  );
  const pickerPos = useRef({ x: 0, y: 0 });
  // Last known pointer position over the canvas (screen + world), so the picker
  // can open at the cursor instead of the viewport centre.
  const lastPointer = useRef<{
    screenX: number;
    screenY: number;
    worldX: number;
    worldY: number;
  } | null>(null);

  /* Refs mirror the latest props/state so the window-level pointer/wheel
       listeners (registered once) never read stale values via closures. */
  const viewRef = useRef(view);
  viewRef.current = view;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const onMoveNodeRef = useRef(onMoveNode);
  onMoveNodeRef.current = onMoveNode;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectGroupRef = useRef(onSelectGroup);
  onSelectGroupRef.current = onSelectGroup;
  const onBgRef = useRef(onBackgroundClick);
  onBgRef.current = onBackgroundClick;
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;
  const onAddNodeRef = useRef(onAddNode);
  onAddNodeRef.current = onAddNode;
  const onMoveNodesRef = useRef(onMoveNodes);
  onMoveNodesRef.current = onMoveNodes;

  /** Mutable drag session state (mode, which node, pointer origin, etc.). */
  const drag = useRef({
    mode: "none" as "none" | "pan" | "node" | "edge" | "group",
    id: null as string | null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    moved: false,
    pointerId: -1,
    // Source node + side for an "edge" drag.
    edgeFrom: null as { id: string; side: Side } | null,
    // Original positions of every node in a "group" drag (for batch-move).
    groupOrig: [] as Array<{ id: string; x: number; y: number }>,
  });

  /** Maps node id -> its rendered DOM element, so connection handles can be
   *   positioned using the card's actual height (which varies with content)
   *   instead of the fixed NODE_H constant. */
  const nodeEls = useRef<Map<string, HTMLElement>>(new Map());
  /** Returns the hovered node's real rendered height, falling back to NODE_H. */
  const nodeH = (id: string) => nodeEls.current.get(id)?.offsetHeight ?? NODE_H;

  /** Converts a screen (client) position to world coordinates. */
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const vp = viewportRef.current;
    const v = viewRef.current;
    const rect = vp!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - v.x) / v.zoom,
      y: (clientY - rect.top - v.y) / v.zoom,
    };
  }, []);

  /**
   * Which side of a node a world point sits on (used to anchor the target end
   * of a newly drawn connection to the side the pointer released nearest).
   */
  const closestSide = useCallback(
    (n: FlowNode, px: number, py: number): Side => {
      const nx = (px - (n.x + NODE_W / 2)) / (NODE_W / 2);
      const ny = (py - (n.y + NODE_H / 2)) / (NODE_H / 2);
      if (Math.abs(nx) > Math.abs(ny)) return nx >= 0 ? "right" : "left";
      return ny >= 0 ? "bottom" : "top";
    },
    [],
  );

  /** Computes the inner surface size needed to contain all nodes (with padding). */
  const { innerW, innerH } = useMemo(() => {
    if (!nodes.length) return { innerW: 740, innerH: 840 };
    const w = Math.max(...nodes.map((n) => n.x + NODE_W));
    const h = Math.max(...nodes.map((n) => n.y + NODE_H));
    return { innerW: w + 80, innerH: h + 80 };
  }, [nodes]);

  /** Padding (world units) between a path's bounding box and its coloured border. */
  const TREE_PAD = 22;
  /**
   * Bounding box for each path: the coloured encompassing border shown behind
   * its nodes. A box is flagged "active" when it contains the selected node,
   * so the chosen path's border is emphasised.
   */
  const treeBoxes = useMemo(() => {
    return trees
      .map((t) => {
        const tn = nodes.filter((n) => n.treeId === t.id);
        if (!tn.length) return null;
        const minX = Math.min(...tn.map((n) => n.x));
        const minY = Math.min(...tn.map((n) => n.y));
        const maxX = Math.max(...tn.map((n) => n.x + NODE_W));
        const maxY = Math.max(...tn.map((n) => n.y + NODE_H));
        return {
          id: t.id,
          name: t.name,
          color: t.color,
          x: minX - TREE_PAD,
          y: minY - TREE_PAD,
          w: maxX - minX + TREE_PAD * 2,
          h: maxY - minY + TREE_PAD * 2,
          active:
            (selectedId ? tn.some((n) => n.id === selectedId) : false) ||
            tn.some((n) => groupIds.has(n.id)),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [trees, nodes, selectedId, groupIds]);

  /* Reset the camera (and edge hover) whenever the active flow changes. */
  useEffect(() => {
    setView(DEFAULT_VIEW);
    setHoveredEdge(null);
  }, [flowId]);

  /* ---- View operations ----
       Single source of truth for camera changes. Used by both the imperative
       CanvasHandle (exposed to the parent) and the on-canvas zoom buttons, so
       the parent ref and the UI controls always behave identically. */
  /** Pan/zoom so the node with the given id is centred in the viewport. */
  const centerOnNode = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      const vp = viewportRef.current;
      if (!n || !vp) return;
      const rect = vp.getBoundingClientRect();
      const z = viewRef.current.zoom;
      // World-coordinate centre of the target node.
      const targetX = n.x + NODE_W / 2;
      const targetY = n.y + NODE_H / 2;
      // Translate so that world centre maps to viewport centre.
      setView({
        x: rect.width / 2 - targetX * z,
        y: rect.height / 2 - targetY * z,
        zoom: z,
      });
    },
    [nodes],
  );

  /** Zoom in by one step (×1.2), clamped to MAX_ZOOM. */
  const zoomIn = useCallback(
    () =>
      setView((v) => ({
        ...v,
        zoom: clamp(v.zoom * 1.2, MIN_ZOOM, MAX_ZOOM),
      })),
    [],
  );

  /** Zoom out by one step (÷1.2), clamped to MIN_ZOOM. */
  const zoomOut = useCallback(
    () =>
      setView((v) => ({
        ...v,
        zoom: clamp(v.zoom / 1.2, MIN_ZOOM, MAX_ZOOM),
      })),
    [],
  );

  /** Reset the camera to the default position/zoom. */
  const resetView = useCallback(() => setView(DEFAULT_VIEW), []);

  /**
   * Centre the viewport on the flow's starting node — the first node in the
   * tree (i.e. the root/entry step). Keeps the current zoom; just pans so the
   * start node sits at the viewport centre. No-op if there are no nodes.
   */
  const centerOnStart = useCallback(() => {
    const start = nodes[0];
    if (start) centerOnNode(start.id);
  }, [nodes, centerOnNode]);

  /* Expose the imperative API to the parent. */
  useImperativeHandle(
    ref,
    () => ({ centerOnNode, centerOnStart, zoomIn, zoomOut, resetView }),
    [centerOnNode, centerOnStart, zoomIn, zoomOut, resetView],
  );

  /* Wheel handling: plain wheel pans; Ctrl/Cmd+wheel (or trackpad pinch) zooms
       around the cursor so the point under the pointer stays fixed. */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Pointer position relative to the viewport (used as zoom anchor).
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const v = viewRef.current;
        const factor = Math.exp(-e.deltaY * 0.0015);
        const nz = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        if (nz === v.zoom) return;
        // World coords under the cursor before zoom.
        const wx = (px - v.x) / v.zoom;
        const wy = (py - v.y) / v.zoom;
        // Re-translate so the same world point stays under the cursor.
        setView({ zoom: nz, x: px - wx * nz, y: py - wy * nz });
      } else {
        e.preventDefault();
        setView((v) => ({
          ...v,
          x: v.x - e.deltaX,
          y: v.y - e.deltaY,
        }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ---- Quick-add type picker (the "a" shortcut) ----
     Pressing "a" on the canvas opens a small palette of step types at the
     viewport centre; picking one drops a new node of that type there. Number
     keys 1..N select an option, Escape closes. Ignored while typing in a
     field, while a modal is open, or mid-drag. */
  /** Opens the picker, recording the viewport-centre world coords to drop at. */
  const setTypePicker = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const v = viewRef.current;
    // Centre the new card on the viewport (offset by half its fixed size).
    pickerPos.current = {
      x: (rect.width / 2 - v.x) / v.zoom - NODE_W / 2,
      y: (rect.height / 2 - v.y) / v.zoom - NODE_H / 2,
    };
    setTypePicker(true);
  }, []);

  /** Creates the node for the chosen type at the recorded position + closes. */
  const pickType = useCallback((type: NodeType) => {
    onAddNodeRef.current?.(type, pickerPos.current.x, pickerPos.current.y);
    setTypePicker(false);
  }, []);

  /** True when the key event target is an editable field (so "a" is ignored). */
  const isField = (el: EventTarget | null): boolean => {
    const t = el as HTMLElement | null;
    if (!t) return false;
    const tag = t.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      t.isContentEditable
    );
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (typePicker) {
        // While open: Escape closes, number keys 1..N pick, else swallow.
        if (e.key === "Escape") {
          e.preventDefault();
          setTypePicker(false);
          return;
        }
        const n = parseInt(e.key, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= TYPE_ORDER.length) {
          e.preventDefault();
          pickType(TYPE_ORDER[n - 1]);
        }
        return;
      }
      // "a" opens the picker — but never with modifiers, in a field, in a
      // modal, or while a drag is in progress.
      if (
        (e.key === "a" || e.key === "A") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        if (isField(e.target)) return;
        if (document.querySelector(".modal-backdrop")) return;
        if (drag.current.mode !== "none") return;
        e.preventDefault();
        openTypePicker();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [typePicker, pickType, openTypePicker]);

  /* Global pointer drag: handles panning the world, moving a node, and drawing
       a connection. Registered on window so drags continue even if the pointer
       leaves the viewport. A drag under DRAG_THRESHOLD px is treated as a
       click instead. While idle (no drag), it also tracks the hovered node so
       that node's connection handles can be shown. */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (d.mode === "none") {
        // Idle: margin hit-test to keep the hovered node (and its handles)
        // active even when the cursor is on a handle just outside the node.
        const vp = viewportRef.current;
        if (vp) {
          const rect = vp.getBoundingClientRect();
          const inside =
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom;
          if (inside) {
            const p = toWorld(e.clientX, e.clientY);
            // Remember the cursor so the "a" quick-add picker opens here.
            lastPointer.current = {
              screenX: e.clientX - rect.left,
              screenY: e.clientY - rect.top,
              worldX: p.x,
              worldY: p.y,
            };
            const m = 10;
            let hn: string | null = null;
            for (const n of nodesRef.current) {
              if (
                p.x >= n.x - m &&
                p.x <= n.x + NODE_W + m &&
                p.y >= n.y - m &&
                p.y <= n.y + NODE_H + m
              ) {
                hn = n.id;
                break;
              }
            }
            setHoveredNodeId(hn);
          } else {
            lastPointer.current = null;
            setHoveredNodeId(null);
          }
        }
        return;
      }
      if (e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      // Ignore micro-movements until the threshold is exceeded.
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      if (d.mode === "pan") {
        setView((v) => ({ ...v, x: d.origX + dx, y: d.origY + dy }));
      } else if (d.mode === "node" && d.id) {
        // Convert screen delta to world delta by dividing by current zoom.
        const z = viewRef.current.zoom;
        const nx = Math.max(0, d.origX + dx / z);
        const ny = Math.max(0, d.origY + dy / z);
        onMoveNodeRef.current(d.id, nx, ny);
      } else if (d.mode === "group") {
        // Move every node in the pathway by the same world delta from origin.
        const z = viewRef.current.zoom;
        const dxw = dx / z;
        const dyw = dy / z;
        const updates = d.groupOrig.map((o) => ({
          id: o.id,
          x: Math.max(0, o.x + dxw),
          y: Math.max(0, o.y + dyw),
        }));
        onMoveNodesRef.current?.(updates);
      } else if (d.mode === "edge") {
        // Follow the cursor with the draft edge and hit-test a drop target.
        const p = toWorld(e.clientX, e.clientY);
        setDraftEdge((de) => (de ? { ...de, toX: p.x, toY: p.y } : de));
        let tid: string | null = null;
        for (const n of nodesRef.current) {
          if (n.id === d.edgeFrom?.id) continue;
          if (
            p.x >= n.x &&
            p.x <= n.x + NODE_W &&
            p.y >= n.y &&
            p.y <= n.y + NODE_H
          ) {
            tid = n.id;
            break;
          }
        }
        setConnectTargetId((cur) => (cur === tid ? cur : tid));
      }
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (d.mode === "none" || e.pointerId !== d.pointerId) return;
      // A connection drag: commit if released over a different node.
      if (d.mode === "edge" && d.edgeFrom) {
        const from = d.edgeFrom;
        const p = toWorld(e.clientX, e.clientY);
        const target = nodesRef.current.find(
          (n) =>
            n.id !== from.id &&
            p.x >= n.x &&
            p.x <= n.x + NODE_W &&
            p.y >= n.y &&
            p.y <= n.y + NODE_H,
        );
        if (target) {
          onConnectRef.current(
            from.id,
            target.id,
            from.side,
            closestSide(target, p.x, p.y),
          );
        }
        setDraftEdge(null);
        setConnectTargetId(null);
        d.mode = "none";
        d.id = null;
        d.edgeFrom = null;
        d.pointerId = -1;
        return;
      }
      // If the pointer never crossed the threshold, treat as a click.
      if (!d.moved) {
        if (d.mode === "node" && d.id) onSelectRef.current(d.id);
        else if (d.mode === "pan") onBgRef.current?.();
        // mode "group" with no move = a plain group-select click; the group
        // was already set in startGroupDrag, so nothing more to do here.
      }
      // Reset the drag session.
      d.mode = "none";
      d.id = null;
      d.pointerId = -1;
      d.groupOrig = [];
      setPanning(false);
      setDraggingId(null);
      setGrouping(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  /** Begins a world-pan drag (bound to the viewport background). */
  const startPan = (e: RPointerEvent) => {
    // Only respond to primary mouse button; allow any touch/pen.
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const d = drag.current;
    d.mode = "pan";
    d.id = null;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.origX = view.x;
    d.origY = view.y;
    d.moved = false;
    d.pointerId = e.pointerId;
    setPanning(true);
  };

  /**
   * Begins a group (pathway) drag: selects every node in the pathway and, if
   * the pointer moves, relocates them all together. Bound to each pathway's
   * background fill. Stops propagation so the background pan doesn't also fire.
   */
  const startGroupDrag = (e: RPointerEvent, treeId: string) => {
    e.stopPropagation();
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const treeNodes = nodes.filter((n) => n.treeId === treeId);
    if (!treeNodes.length) return;
    const d = drag.current;
    d.mode = "group";
    d.id = treeId;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.moved = false;
    d.pointerId = e.pointerId;
    d.groupOrig = treeNodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
    onSelectGroupRef.current?.(treeId);
    setGrouping(true);
  };

  /** Begins a node-move drag (bound to each node). Stops propagation so the
        background pan handler doesn't also fire. */
  const startNodeDrag = (e: RPointerEvent, n: FlowNode) => {
    e.stopPropagation();
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const d = drag.current;
    d.mode = "node";
    d.id = n.id;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.origX = n.x;
    d.origY = n.y;
    d.moved = false;
    d.pointerId = e.pointerId;
    setDraggingId(n.id);
  };

  /** Begins a connection-draw drag from a node's handle. Stops propagation so
        the node-move / background-pan handlers don't also fire. */
  const startEdgeDraw = (e: RPointerEvent, n: FlowNode, side: Side) => {
    e.stopPropagation();
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const d = drag.current;
    d.mode = "edge";
    d.id = n.id;
    d.edgeFrom = { id: n.id, side };
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.moved = true; // a handle press is always a drag, never a click
    d.pointerId = e.pointerId;
    const a = anchor(n, side, nodeH(n.id));
    const p = toWorld(e.clientX, e.clientY);
    setDraftEdge({
      fromId: n.id,
      fromSide: side,
      fromX: a.x,
      fromY: a.y,
      toX: p.x,
      toY: p.y,
    });
    setHoveredNodeId(null);
    setConnectTargetId(null);
  };

  return (
    <main
      // The "panning"/"grouping" classes let CSS disable text selection / change cursor mid-drag.
      className={
        "canvas" + (panning ? " panning" : "") + (grouping ? " grouping" : "")
      }
      ref={viewportRef}
      onPointerDown={startPan}
    >
      {/* Transformed layer: holds everything that lives in world space. */}
      <div
        className="canvas-world"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        {/* Sized surface so SVG edges and nodes share a coordinate system. */}
        <div className="canvas-inner" style={{ width: innerW, height: innerH }}>
          {/* Path borders: a coloured encompassing box per node-tree
                        (drawn first so edges + nodes sit on top of them). */}
          {treeBoxes.map((b) => (
            <div
              key={b.id}
              className={
                "tree-box" +
                (b.active ? " active" : "") +
                (grouping && drag.current.id === b.id ? " grouping" : "")
              }
              style={
                {
                  left: b.x,
                  top: b.y,
                  width: b.w,
                  height: b.h,
                  "--tb": b.color,
                } as CSSProperties
              }
              onPointerDown={(e) => startGroupDrag(e, b.id)}
              title={`Select all in ${b.name}`}
            >
              <span className="tree-box-label" style={{ background: b.color }}>
                {b.name}
              </span>
            </div>
          ))}
          {/* Edge layer: one bezier path per connection, plus midpoint labels.
                        Default anchors are right -> left (horizontal flow). */}
          <svg className="edges" width={innerW} height={innerH}>
            {edges.map((e, i) => {
              const s = nodes.find((n) => n.id === e.from);
              const t = nodes.find((n) => n.id === e.to);
              // Skip edges pointing at missing nodes (defensive).
              if (!s || !t) return null;
              // Anchor at each node's real rendered height so the curve meets
              // the card edge (not the fixed NODE_H midpoint).
              const a = anchor(s, e.fromSide ?? "right", nodeH(s.id));
              const b = anchor(t, e.toSide ?? "left", nodeH(t.id));
              const { x: mx, y: my } = curvePoint(a, b, 0.5);
              return (
                <g key={i}>
                  <g className={"edge" + (e.dashed ? " dashed" : "")}>
                    <path d={curve(a, b)} />
                  </g>
                  {e.label && (
                    <text
                      className="edge-label"
                      x={mx}
                      y={my - 3}
                      textAnchor="middle"
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {/* Edge interaction overlay: wide invisible hit-paths let the user
                          hover a connection to reveal a delete button at its midpoint.
                          Sits below the node layer so node bodies stay clickable; a
                          pointerdown here still bubbles up to pan the canvas. */}
          <svg className="edge-overlay" width={innerW} height={innerH}>
            {edges.map((e, i) => {
              const s = nodes.find((n) => n.id === e.from);
              const t = nodes.find((n) => n.id === e.to);
              if (!s || !t) return null;
              const a = anchor(s, e.fromSide ?? "right", nodeH(s.id));
              const b = anchor(t, e.toSide ?? "left", nodeH(t.id));
              const d = curve(a, b);
              const { x: mx, y: my } = curvePoint(a, b, 0.5);
              const hovered = hoveredEdge === i;
              return (
                <g
                  key={"eo-" + i}
                  onPointerEnter={() => setHoveredEdge(i)}
                  onPointerLeave={() =>
                    setHoveredEdge((c) => (c === i ? null : c))
                  }
                >
                  {/* Invisible wide hit area along the curve. */}
                  <path d={d} className="edge-hit" />
                  {hovered && (
                    <>
                      <path d={d} className="edge-hover" />
                      <g
                        className="edge-delete"
                        transform={`translate(${mx} ${my})`}
                        onPointerDown={(ev) => {
                          // Don't start a pan/select — this is a delete click.
                          ev.stopPropagation();
                          onDeleteEdge?.(e.from, e.to);
                          setHoveredEdge(null);
                        }}
                      >
                        <circle r={9} />
                        <path d="M-3.6 -3.6L3.6 3.6M3.6 -3.6L-3.6 3.6" />
                      </g>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
          {/* Node layer: one card per node, absolutely positioned. */}
          {nodes.map((n) => {
            const T = TYPE[n.type];
            // Distinct requirement kinds shown as small icon pips (max 4).
            const kinds = Array.from(new Set(n.reqs.map((r) => r.kind))).slice(
              0,
              4,
            );
            // Pathway colour for this node (used for the grouped-ring).
            const gc = trees.find((t) => t.id === n.treeId)?.color;
            return (
              <div
                key={n.id}
                className={
                  "node" +
                  (n.id === selectedId ? " selected" : "") +
                  (n.id === draggingId ? " dragging" : "") +
                  (n.id === connectTargetId ? " connect-target" : "") +
                  (groupIds.has(n.id) ? " grouped" : "")
                }
                style={
                  {
                    left: n.x,
                    top: n.y,
                    "--nc": T.color,
                    ...(gc ? ({ "--gc": gc } as CSSProperties) : {}),
                  } as CSSProperties
                }
                ref={(el) => {
                  if (el) nodeEls.current.set(n.id, el);
                  else nodeEls.current.delete(n.id);
                }}
                tabIndex={0}
                role="button"
                aria-label={`${T.label}: ${n.label}`}
                onPointerDown={(e) => startNodeDrag(e, n)}
                // Keyboard accessibility: Enter/Space selects.
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    onSelect(n.id);
                  }
                }}
              >
                {/* Lifecycle flag (Live / In review / Draft). */}
                <span className={"status-flag " + STATUS_CLS[n.status]}>
                  {STATUS_TXT[n.status]}
                </span>
                {/* Type row: glyph + type label (e.g. "Action"). */}
                <div className="nt">
                  <svg
                    className="glyph"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d={T.glyph} />
                  </svg>
                  {T.label}
                </div>
                {/* The user-defined step name. */}
                <div className="nlabel">{n.label}</div>
                {/* Requirement-kind pips: quick visual of what this step needs. */}
                <div className="needs">
                  {kinds.map((k) => (
                    <span className="need-pip" key={k} title={k}>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d={REQ[k].icon} />
                      </svg>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Connection handles for the hovered node (hidden while drawing).
                          Each sits on a side midpoint; dragging one out draws an edge. */}
          {!draftEdge &&
            hoveredNodeId &&
            (() => {
              const hn = nodes.find((n) => n.id === hoveredNodeId);
              if (!hn) return null;
              // Use the card's real height so the dots sit on its actual
              // edge midpoints regardless of how tall its content is.
              const h = nodeH(hn.id);
              return (["top", "right", "bottom", "left"] as Side[]).map(
                (side) => {
                  const a = anchor(hn, side, h);
                  return (
                    <div
                      key={"handle-" + side}
                      className={"node-handle handle-" + side}
                      style={{ left: a.x, top: a.y }}
                      onPointerDown={(e) => startEdgeDraw(e, hn, side)}
                      title={`Drag to connect (${side})`}
                    />
                  );
                },
              );
            })()}

          {/* Draft connection (rendered above nodes so it stays visible as the
                          cursor moves over other nodes). pointer-events disabled. */}
          {draftEdge && (
            <svg
              className="edges draft-edges"
              width={innerW}
              height={innerH}
              aria-hidden="true"
            >
              <path
                d={curve(
                  {
                    x: draftEdge.fromX,
                    y: draftEdge.fromY,
                    ...SIDE_DIR[draftEdge.fromSide],
                  },
                  { x: draftEdge.toX, y: draftEdge.toY, dx: 0, dy: 0 },
                )}
              />
            </svg>
          )}
        </div>
      </div>

      {/* Canvas controls overlay (top-left). stopPropagation keeps clicks
                here from starting a background pan. The buttons call the same
                functions exposed via CanvasHandle, so the ref and the UI stay
                in sync. */}
      <div
        className="canvas-controls"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button onClick={zoomOut} aria-label="Zoom out" title="Zoom out">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path d="M5 12h14" />
          </svg>
        </button>
        <button className="zoom-pct" onClick={resetView} title="Reset view">
          {Math.round(view.zoom * 100)}%
        </button>
        <button onClick={zoomIn} aria-label="Zoom in" title="Zoom in">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        {/* Divider between zoom and the recenter action. */}
        <span className="ctrl-sep" aria-hidden="true" />
        <button
          onClick={centerOnStart}
          aria-label="Go to start node"
          title="Go to start node"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M22 12h-3M2 12h3" />
          </svg>
        </button>
      </div>

      {/* Quick-add type picker: shown centred over the canvas when the user
                 presses "a". A transparent scrim catches outside clicks to dismiss. */}
      {typePicker && (
        <>
          <div
            className="type-picker-scrim"
            onPointerDown={(e) => {
              e.stopPropagation();
              setTypePicker(false);
            }}
          />
          <div className="type-picker" role="dialog" aria-label="Add a step">
            <div className="type-picker-title">
              Add a step
              <span className="type-picker-hint">Esc to close</span>
            </div>
            {TYPE_ORDER.map((t, i) => (
              <button
                key={t}
                type="button"
                className="type-option"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => pickType(t)}
              >
                <span className="tdot" style={{ background: TYPE[t].color }} />
                <span className="type-option-label">{TYPE[t].label}</span>
                <kbd className="type-option-key">{i + 1}</kbd>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
});

export default Canvas;
