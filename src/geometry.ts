/**
 * Geometry helpers for drawing edges between nodes.
 *
 * The canvas is laid out in "world" coordinates; each node is a fixed-size
 * rectangle (NODE_W x NODE_H). Edges are drawn as cubic-bezier curves that
 * attach to an anchor point on a chosen side of each node.
 */
import type { FlowNode, Side } from "./types";
import { NODE_H, NODE_W } from "./data";

/** An anchor point on a node edge plus the outward direction (dx, dy) for curve control handles. */
export interface Anchor {
    x: number;
    y: number;
    /** Outward unit vector (controls bezier handle direction). */
    dx: number;
    dy: number;
}

/**
 * Returns the anchor point + outward direction for a given side of a node.
 * e.g. side="bottom" -> the midpoint of the node's bottom edge, pointing down.
 *
 * `h` overrides the node height used for the midpoint math; pass the node's
 * actual rendered height when known (the card grows past NODE_H when it has
 * content), so anchors stay aligned with the visible edges.
 */
export function anchor(n: FlowNode, side: Side, h: number = NODE_H): Anchor {
    const x = n.x,
        y = n.y,
        w = NODE_W;
    switch (side) {
        case "top":
            return { x: x + w / 2, y, dx: 0, dy: -1 };
        case "bottom":
            return { x: x + w / 2, y: y + h, dx: 0, dy: 1 };
        case "left":
            return { x, y: y + h / 2, dx: -1, dy: 0 };
        case "right":
            return { x: x + w, y: y + h / 2, dx: 1, dy: 0 };
    }
}

/**
 * Builds an SVG cubic-bezier path ("M ... C ...") connecting two anchors.
 * The control-point offset `k` scales with distance so short and long edges
 * both look smooth; clamped to a minimum so tiny edges still curve nicely.
 */
export function curve(a: Anchor, b: Anchor): string {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(40, dist * 0.42);
    return `M ${a.x} ${a.y} C ${a.x + a.dx * k} ${a.y + a.dy * k} ${b.x + b.dx * k} ${b.y + b.dy * k} ${b.x} ${b.y}`;
}

/**
 * Returns the control-point offset used by `curve`, so callers can reason about
 * the same control handles that shape the visible path.
 */
function curveK(a: Anchor, b: Anchor): number {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    return Math.max(40, dist * 0.42);
}

/**
 * Returns the point at parameter `t` (0..1) along the cubic-bezier edge from
 * `a` to `b`. At t=0.5 this is the visual midpoint of the curve — the spot the
 * delete button and edge label should sit so they sit directly on the line.
 */
export function curvePoint(a: Anchor, b: Anchor, t: number): { x: number; y: number } {
    const k = curveK(a, b);
    const p0x = a.x,
        p0y = a.y;
    const p1x = a.x + a.dx * k,
        p1y = a.y + a.dy * k;
    const p2x = b.x + b.dx * k,
        p2y = b.y + b.dy * k;
    const p3x = b.x,
        p3y = b.y;
    const u = 1 - t;
    const c0 = u * u * u;
    const c1 = 3 * u * u * t;
    const c2 = 3 * u * t * t;
    const c3 = t * t * t;
    return {
        x: c0 * p0x + c1 * p1x + c2 * p2x + c3 * p3x,
        y: c0 * p0y + c1 * p1y + c2 * p2y + c3 * p3y,
    };
}
