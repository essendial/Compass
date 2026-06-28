/**
 * RightPanel — the step details / editor panel.
 *
 * Has two modes:
 *  - "view": read-only display of the step (type, status, owner, SLA, summary,
 *            requirements as chips, and a list of connected steps).
 *  - "edit": inline form controls to mutate all of the above.
 *
 * All mutations are delegated upward via `onChange` (node fields) and the
 * `reqOps` bag (requirement add/update/remove + item add/remove). The panel is
 * purely controlled: it reflects whatever node App passes in.
 *
 * Contains two internal helper sub-components:
 *  - ReqView   : read-only requirement renderer.
 *  - ReqEditor : inline editor for a single requirement + its items.
 */
import { useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import type { Edge, FlowNode, NodeStatus, NodeType, NodeTree, Req } from "../types";
import { REQ, REQ_OPTIONS, TYPE, TYPE_ORDER } from "../data";

/** Bag of operations the panel can perform on the selected node's requirements. */
interface ReqOps {
    add: () => void;
    update: (i: number, patch: Partial<Req>) => void;
    remove: (i: number) => void;
    addItem: (i: number, item: string) => void;
    removeItem: (i: number, j: number) => void;
}

interface Props {
    node: FlowNode;
    nodes: FlowNode[];
    edges: Edge[];
    /** The path this step belongs to (may be null for legacy/orphan nodes). */
    tree: NodeTree | null;
    mode: "view" | "edit";
    open: boolean;
    /** Current panel width in px (controlled by the user via the drag handle). */
    width: number;
    /** Called with a new width as the user drags the left-edge resizer. */
    onWidthChange: (w: number) => void;
    onClose: () => void;
    onSetMode: (m: "view" | "edit") => void;
    onChange: (patch: Partial<FlowNode>) => void;
    /** Update the step's path (name / colour). */
    onChangeTree: (patch: Partial<NodeTree>) => void;
    onDelete: () => void;
    onSelectNode: (id: string) => void;
    reqOps: ReqOps;
}

/** Human-readable status labels (shown in both view selects and read-only meta). */
const STATUS_TXT: Record<NodeStatus, string> = {
    live: "Live",
    review: "In review",
    draft: "Draft",
};

/** Options for the Type and Status dropdowns in edit mode. */
const STATUS_OPTIONS: NodeStatus[] = ["live", "review", "draft"];

/** A resolved connection to a neighbour: direction + the neighbour node. */
interface Conn {
    dir: "from" | "to";
    node: FlowNode;
}

export default function RightPanel({
    node,
    nodes,
    edges,
    tree,
    mode,
    open,
    width,
    onWidthChange,
    onClose,
    onSetMode,
    onChange,
    onChangeTree,
    onDelete,
    onSelectNode,
    reqOps,
}: Props) {
    const T = TYPE[node.type];
    const isEdit = mode === "edit";

    // Resolve incoming + outgoing edges to their neighbour nodes for the
    // "Connected steps" list (view mode only).
    const incoming = edges
        .filter((e) => e.to === node.id)
        .map((e) => nodes.find((n) => n.id === e.from))
        .filter((n): n is FlowNode => Boolean(n))
        .map((n) => ({ dir: "from" as const, node: n }));
    const outgoing = edges
        .filter((e) => e.from === node.id)
        .map((e) => nodes.find((n) => n.id === e.to))
        .filter((n): n is FlowNode => Boolean(n))
        .map((n) => ({ dir: "to" as const, node: n }));
    const conns: Conn[] = [...incoming, ...outgoing];

    // Width-clamp bounds (kept in sync with App's PANEL_W_MIN/MAX).
    const W_MIN = 300;
    const W_MAX = 720;
    // Tracks an in-progress drag so we can paint a global resize cursor.
    const [dragging, setDragging] = useState(false);
    const handleRef = useRef<HTMLDivElement>(null);

    /** Pointer down on the left-edge handle: capture the pointer and begin resizing. */
    const onResizerDown = (e: RPointerEvent<HTMLDivElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
        handleRef.current?.setPointerCapture(e.pointerId);
    };

    /** While dragging, widen/narrow the panel to follow the cursor. */
    const onResizerMove = (e: RPointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        const w = Math.min(W_MAX, Math.max(W_MIN, window.innerWidth - e.clientX));
        onWidthChange(w);
    };

    /** Pointer up: end the drag and release capture. */
    const onResizerUp = (e: RPointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        setDragging(false);
        handleRef.current?.releasePointerCapture(e.pointerId);
    };

    return (
        <section
            className={"panel" + (open ? " open" : "") + (dragging ? " resizing" : "")}
            aria-label="Step details"
            aria-hidden={!open}
            style={{ "--panel-w": `${width}px` } as CSSProperties}
        >
            {/* Left-edge drag handle: drag left/right to widen/narrow the panel. */}
            <div
                ref={handleRef}
                className="panel-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panel"
                onPointerDown={onResizerDown}
                onPointerMove={onResizerMove}
                onPointerUp={onResizerUp}
            />
            <div className="panel-head">
                <div className="panel-top">
                    <div className="panel-title-col">
                        {isEdit ? (
                            <input
                                className="input title-input"
                                value={node.label}
                                placeholder="Step name"
                                onChange={(e) =>
                                    onChange({ label: e.target.value })
                                }
                            />
                        ) : (
                            <>
                                <span
                                    className="ptype"
                                    style={{ "--pc": T.color } as CSSProperties}
                                >
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
                                </span>
                                <h2>{node.label}</h2>
                            </>
                        )}
                    </div>
                    <div className="panel-actions">
                        <button
                            className={
                                "icon-btn edit-toggle" +
                                (isEdit ? " active" : "")
                            }
                            onClick={() =>
                                onSetMode(isEdit ? "view" : "edit")
                            }
                            aria-label={isEdit ? "Done editing" : "Edit step"}
                            title={isEdit ? "Done" : "Edit step"}
                        >
                            {isEdit ? (
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M20 6 9 17l-5 5" />
                                </svg>
                            ) : (
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                            )}
                        </button>
                        <button
                            className="close-x"
                            onClick={onClose}
                            aria-label="Close details"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="panel-meta">
                    {isEdit ? (
                        <>
                            <div className="meta-cell">
                                <div className="k">Type</div>
                                <select
                                    className="select"
                                    value={node.type}
                                    onChange={(e) =>
                                        onChange({
                                            type: e.target.value as NodeType,
                                        })
                                    }
                                >
                                    {TYPE_ORDER.map((t) => (
                                        <option key={t} value={t}>
                                            {TYPE[t].label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="meta-cell">
                                <div className="k">Status</div>
                                <select
                                    className="select"
                                    value={node.status}
                                    onChange={(e) =>
                                        onChange({
                                            status: e.target
                                                .value as NodeStatus,
                                        })
                                    }
                                >
                                    {STATUS_OPTIONS.map((s) => (
                                        <option key={s} value={s}>
                                            {STATUS_TXT[s]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="meta-cell meta-grow">
                                <div className="k">Owner</div>
                                <input
                                    className="input"
                                    value={node.owner}
                                    placeholder="Owner"
                                    onChange={(e) =>
                                        onChange({ owner: e.target.value })
                                    }
                                />
                            </div>
                            <div className="meta-cell">
                                <div className="k">SLA</div>
                                <input
                                    className="input"
                                    value={node.sla}
                                    placeholder="SLA"
                                    onChange={(e) =>
                                        onChange({ sla: e.target.value })
                                    }
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="meta-cell">
                                <div className="k">Owner</div>
                                <div className="v">{node.owner}</div>
                            </div>
                            <div className="meta-cell">
                                <div className="k">SLA</div>
                                <div className="v">{node.sla}</div>
                            </div>
                            <div className="meta-cell">
                                <div className="k">Status</div>
                                <div className="v">
                                    {STATUS_TXT[node.status]}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="panel-body">
                {/* Path membership: which instruction route this step belongs to,
                    plus a simple colour manager for that path's encompassing border. */}
                {tree && (
                    <div className="block">
                        <div className="block-title">Path</div>
                        {isEdit ? (
                            <div className="path-edit">
                                <label
                                    className="path-color"
                                    title="Path colour"
                                >
                                    <input
                                        type="color"
                                        value={tree.color}
                                        onChange={(e) =>
                                            onChangeTree({ color: e.target.value })
                                        }
                                    />
                                    <span
                                        className="path-color-swatch"
                                        style={{ background: tree.color }}
                                    />
                                </label>
                                <input
                                    className="input"
                                    value={tree.name}
                                    placeholder="Path name"
                                    onChange={(e) =>
                                        onChangeTree({ name: e.target.value })
                                    }
                                />
                            </div>
                        ) : (
                            <div className="path-view">
                                <span
                                    className="path-color-swatch"
                                    style={{ background: tree.color }}
                                />
                                <span className="path-name">{tree.name}</span>
                            </div>
                        )}
                    </div>
                )}
                <div className="block">
                    <div className="block-title">What this step does</div>
                    {isEdit ? (
                        <textarea
                            className="textarea"
                            value={node.summary}
                            placeholder="Describe what this step does…"
                            onChange={(e) =>
                                onChange({ summary: e.target.value })
                            }
                        />
                    ) : node.summary ? (
                        <div className="summary-block">
                            {splitParagraphs(node.summary).map((para, i) => (
                                <p className="summary" key={i}>
                                    {para}
                                </p>
                            ))}
                        </div>
                    ) : (
                        <span className="muted-empty">
                            No description yet.
                        </span>
                    )}
                </div>

                <div className="block">
                    <div className="block-title">
                        What's needed
                        {isEdit && (
                            <button
                                className="add-link"
                                onClick={reqOps.add}
                            >
                                + Requirement
                            </button>
                        )}
                    </div>
                    <div>
                        {node.reqs.length === 0 && !isEdit && (
                            <div className="muted-empty">
                                No requirements documented.
                            </div>
                        )}
                        {node.reqs.map((r, idx) =>
                            isEdit ? (
                                <ReqEditor
                                    key={idx}
                                    req={r}
                                    index={idx}
                                    reqOps={reqOps}
                                />
                            ) : (
                                <ReqView key={idx} req={r} />
                            ),
                        )}
                    </div>
                </div>

                {!isEdit && (
                    <div className="block">
                        <div className="block-title">Connected steps</div>
                        <div className="conns">
                            {conns.length ? (
                                conns.map((c, idx) => {
                                    const T2 = TYPE[c.node.type];
                                    const arrow =
                                        c.dir === "from" ? "in ←" : "out →";
                                    return (
                                        <div
                                            className="conn"
                                            key={idx}
                                            onClick={() =>
                                                onSelectNode(c.node.id)
                                            }
                                        >
                                            <span className="arrow">
                                                {arrow}
                                            </span>
                                            <span
                                                className="tdot"
                                                style={{ background: T2.color }}
                                            ></span>
                                            <span className="cl">
                                                {c.node.label}
                                            </span>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="muted-empty">
                                    No connected steps yet.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="panel-foot">
                {isEdit ? (
                    <button
                        className="btn primary"
                        onClick={() => onSetMode("view")}
                    >
                        Done
                    </button>
                ) : (
                    <button
                        className="btn danger"
                        onClick={onDelete}
                    >
                        Delete step
                    </button>
                )}
            </div>
        </section>
    );
}

/**
 * Splits a free-text summary into paragraphs: one or more blank lines separate
 * paragraphs, and the resulting chunks are trimmed. Empty chunks are dropped so
 * we don't render stray blank paragraphs. Used so multi-paragraph descriptions
 * typed into the textarea render as distinct `<p>` elements in view mode.
 */
function splitParagraphs(text: string): string[] {
    return text
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
}

/** Read-only requirement renderer: icon + label + item chips. */
function ReqView({ req }: { req: Req }) {
    const R = REQ[req.kind];
    return (
        <div className="req">
            <div
                className="req-icon"
                style={
                    {
                        "--req-c": R.c,
                        "--req-soft": R.soft,
                    } as CSSProperties
                }
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <path d={R.icon} />
                </svg>
            </div>
            <div className="req-body">
                <div className="req-label">{req.label}</div>
                <div className="chips">
                    {req.items.map((item, j) => (
                        <span
                            className={
                                "chip" + (req.kind === "data" ? " mono" : "")
                            }
                            key={j}
                        >
                            {item}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * Inline editor for a single requirement: lets the user change the kind
 * (dropdown), the label (input), remove it, manage its item chips (click to
 * remove), and add new items (input + Add button, Enter to submit).
 */
function ReqEditor({
    req,
    index,
    reqOps,
}: {
    req: Req;
    index: number;
    reqOps: ReqOps;
}) {
    // Draft text for the "Add an item" input.
    const [draft, setDraft] = useState("");
    const R = REQ[req.kind];

    /** Commits the draft as a new item, then clears the input. */
    const submit = () => {
        const v = draft.trim();
        if (!v) return;
        reqOps.addItem(index, v);
        setDraft("");
    };

    return (
        <div className="req req-edit">
            <div
                className="req-icon"
                style={
                    {
                        "--req-c": R.c,
                        "--req-soft": R.soft,
                    } as CSSProperties
                }
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <path d={R.icon} />
                </svg>
            </div>
            <div className="req-body">
                <div className="req-edit-row">
                    <select
                        className="select"
                        value={req.kind}
                        onChange={(e) =>
                            reqOps.update(index, {
                                kind: e.target.value as Req["kind"],
                            })
                        }
                    >
                        {REQ_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    <input
                        className="input"
                        value={req.label}
                        placeholder="Label"
                        onChange={(e) =>
                            reqOps.update(index, { label: e.target.value })
                        }
                    />
                    <button
                        className="mini-btn"
                        aria-label="Remove requirement"
                        title="Remove"
                        onClick={() => reqOps.remove(index)}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="chips">
                    {req.items.map((item, j) => (
                        <span
                            className="chip removable"
                            key={j}
                            onClick={() => reqOps.removeItem(index, j)}
                            title="Remove"
                        >
                            {item}
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                            >
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </span>
                    ))}
                </div>
                <div className="add-item-row">
                    <input
                        className="input"
                        value={draft}
                        placeholder="Add an item…"
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                submit();
                            }
                        }}
                    />
                    <button
                        className="btn small"
                        onClick={submit}
                        disabled={!draft.trim()}
                    >
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
}
