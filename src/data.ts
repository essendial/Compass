/**
 * Static lookup tables and display metadata.
 *
 * - NODE_W / NODE_H : fixed dimensions every node card is rendered at (used by
 *                     layout, anchor math, and canvas sizing).
 * - TYPE            : maps a NodeType -> colour, label, and SVG glyph path.
 * - REQ             : maps a ReqKind -> accent colour, soft background, and icon.
 * - REQ_OPTIONS     : ordered dropdown options for the requirement kind picker.
 *
 * Colours reference CSS custom properties defined in styles.css so themes
 * can be swapped without touching JS.
 */
import type { NodeType, ReqMeta, TypeMeta } from "./types";

/** Fixed node card size (px). Keep in sync with styles.css (.node width/height). */
export const NODE_W = 210;
export const NODE_H = 60;

/* ---- Horizontal layout constants ----
   Flows read left -> right. Within a path, chained nodes are placed one
   NODE_PITCH_X apart; separate paths stack as vertical "lanes" NODE_PITCH_Y
   apart. TREE_START_X is the left origin for the first node of each path. */
export const NODE_PITCH_X = 300;
export const NODE_PITCH_Y = 180;
export const TREE_START_X = 60;
/** Top padding (world units) left clear above the first lane for the path label. */
export const TREE_LANE_BASE_Y = 48;

/** Default colour palette cycled through when creating new paths. */
export const TREE_COLORS: string[] = [
    "#5fb389",
    "#6098dc",
    "#d49a56",
    "#a88be6",
    "#e07aae",
    "#5fb3ae",
    "#d4a05a",
    "#6ca3e6",
];

/** Per-NodeType display metadata. Keys must match the NodeType union. */
export const TYPE: Record<string, TypeMeta> = {
    trigger: {
        color: "var(--t-trigger)",
        label: "Trigger",
        glyph: "M13 2 3 14h8l-1 8 10-12h-8z",
    },
    action: {
        color: "var(--t-action)",
        label: "Action",
        glyph: "M4 6h16M4 12h16M4 18h10",
    },
    decision: {
        color: "var(--t-decision)",
        label: "Decision",
        glyph: "M12 3 21 12l-9 9-9-9z",
    },
    wait: {
        color: "var(--t-wait)",
        label: "Wait",
        glyph: "M6 3h12M6 21h12M7 3v3l5 6l-5 6v3M17 3v3l-5 6l5 6v3",
    },
    end: {
        color: "var(--t-end)",
        label: "End",
        glyph: "M5 12l5 5 9-9",
    },
};

/** Canonical order of node types, used everywhere a type list is shown
 *  (the right-panel dropdown + the canvas "add step" quick picker). */
export const TYPE_ORDER: NodeType[] = [
    "trigger",
    "action",
    "decision",
    "wait",
    "end",
];

/** Per-ReqKind display metadata (c = accent, soft = muted bg, icon = SVG path). */
export const REQ: Record<string, ReqMeta> = {
    integration: {
        c: "#A88BE6",
        soft: "#2A2440",
        icon: "M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8",
    },
    data: {
        c: "#6CA3E6",
        soft: "#1E2A3D",
        icon: "M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7",
    },
    permission: {
        c: "#5FB3AE",
        soft: "#17302E",
        icon: "M12 2 4 5v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V5z",
    },
    rule: {
        c: "#D4A05A",
        soft: "#322817",
        icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    },
    owner: {
        c: "#E07AAE",
        soft: "#331E2A",
        icon: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    },
    sla: {
        c: "#98A2B3",
        soft: "#262A30",
        icon: "M12 7v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
    },
};

/** Ordered options for the requirement-kind <select> in the right-panel editor. */
export const REQ_OPTIONS: { value: keyof typeof REQ; label: string }[] = [
    { value: "integration", label: "Integration" },
    { value: "data", label: "Data" },
    { value: "permission", label: "Permission" },
    { value: "rule", label: "Rule" },
    { value: "owner", label: "Owner" },
    { value: "sla", label: "SLA" },
];
