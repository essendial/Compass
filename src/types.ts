/**
 * Central type definitions for the whole app.
 *
 * Data model overview:
 *   Flow = { nodes: FlowNode[], edges: Edge[] }
 *   - FlowNode  : a step in a workflow (positioned on the canvas)
 *   - Edge      : a directed connection between two nodes
 *   - Req       : a "what's needed" entry attached to a node
 *   Everything is plain JSON-serialisable so it can be stored in localStorage.
 */

/** Category of a workflow step. Drives the node's colour and icon (see data.ts TYPE). */
export type NodeType = "trigger" | "action" | "decision" | "wait" | "end";

/** Lifecycle state of a step. Shown as a coloured flag on each node. */
export type NodeStatus = "live" | "review" | "draft";

/** Kind of requirement/documentation entry. Drives icon + colour (see data.ts REQ). */
export type ReqKind =
    | "integration"
    | "data"
    | "permission"
    | "rule"
    | "owner"
    | "sla";

/** Which side of a node rectangle an edge connects to (used by geometry.ts). */
export type Side = "top" | "bottom" | "left" | "right";

/**
 * A "path" / node-tree within a flow.
 * A flow can contain several independent instruction paths, each rendered with
 * its own coloured encompassing border on the canvas. Every node belongs to
 * exactly one path (node.treeId).
 */
export interface NodeTree {
    id: string;
    name: string;
    /** Hex accent colour for this path's border + outliner swatch. */
    color: string;
}

/** A single requirement ("what's needed") entry on a node, e.g. Integrations: [Web forms, HubSpot]. */
export interface Req {
    kind: ReqKind;
    label: string;
    items: string[];
}

/** A workflow step rendered as a card on the canvas. */
export interface FlowNode {
    id: string;
    label: string;
    type: NodeType;
    /** Canvas position of the node's top-left corner, in world coordinates. */
    x: number;
    y: number;
    status: NodeStatus;
    /** Free-text description of what the step does. */
    summary: string;
    /** Team/person accountable for the step. */
    owner: string;
    /** Service-level agreement / timing expectation. */
    sla: string;
    /** Ordered list of requirement entries shown in the right panel + outliner. */
    reqs: Req[];
    /** id of the NodeTree (path) this step belongs to within its flow. */
    treeId: string;
}

/** A directed connection from one node to another (drawn as an SVG curve). */
export interface Edge {
    from: string;
    to: string;
    /** Explicit anchor side on the source node; defaults to "bottom". */
    fromSide?: Side;
    /** Explicit anchor side on the target node; defaults to "top". */
    toSide?: Side;
    /** Optional text label rendered at the curve midpoint (e.g. "Yes"/"No"). */
    label?: string;
    /** Render as a dashed line (used for feedback loops / re-score paths). */
    dashed?: boolean;
}

/** A folder that groups workflows together in the outliner (single level). */
export interface Folder {
    id: string;
    name: string;
}

/** A complete workflow: the unit of work the user creates/edits/selects. */
export interface Flow {
    id: string;
    name: string;
    nodes: FlowNode[];
    edges: Edge[];
    /** The paths (node-trees) this flow contains. Each node references one via treeId. */
    trees: NodeTree[];
    /** id of the Folder this workflow belongs to, or null when at the root level. */
    folderId?: string | null;
}

/** Display metadata for a NodeType (colour, human label, SVG path glyph). */
export interface TypeMeta {
    color: string;
    label: string;
    glyph: string;
}

/** Display metadata for a ReqKind: c = accent colour, soft = chip background, icon = SVG path. */
export interface ReqMeta {
    c: string;
    soft: string;
    icon: string;
}
