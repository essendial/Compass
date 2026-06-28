/**
 * Pathways — sidebar section for managing the paths (node-trees) of the active
 * workflow.
 *
 * Makes adding a new pathway discoverable (a prominent "Add" button in a
 * dedicated, always-visible section) and lets the user, for each path:
 *   - rename it (inline input),
 *   - recolour it by picking from the shared 8-colour palette,
 *   - delete it.
 *
 * The "Templates" button opens an inline picker of curated pathway templates
 * (see pathwayTemplates.ts); selecting one calls `onInsertTemplate` so App can
 * materialise it as a new path in the active flow.
 *
 * A static legend strip showing all 8 palette colours is rendered at the
 * bottom so the available path colours are visible at a glance.
 *
 * The component is presentational: every mutation is delegated up to App via
 * `onCreate` / `onUpdate` / `onDelete` / `onInsertTemplate`.
 */
import { useState } from "react";
import type { NodeTree } from "../types";
import { TREE_COLORS } from "../data";
import { PATHWAY_TEMPLATES } from "../pathwayTemplates";

interface Props {
    trees: NodeTree[];
    /** Create a brand-new path (a second/third instruction route). */
    onCreate: () => void;
    /** Update a path's mutable fields (name / colour). */
    onUpdate: (treeId: string, patch: Partial<NodeTree>) => void;
    /** Delete an entire path and all of its steps. */
    onDelete: (treeId: string) => void;
    /** Insert a curated pathway template as a new path in the active flow. */
    onInsertTemplate: (templateId: string) => void;
}

const ICON = {
    plus: "M12 5v14M5 12h14",
    trash:
        "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6",
    check: "M5 12l5 5L20 7",
};

/** Case-insensitive hex equality so the active swatch highlights reliably. */
const sameColor = (a: string, b: string) =>
    a.toLowerCase() === b.toLowerCase();

export default function Pathways({
    trees,
    onCreate,
    onUpdate,
    onDelete,
    onInsertTemplate,
}: Props) {
    // id of the path whose colour palette is open; null when none.
    const [openPalette, setOpenPalette] = useState<string | null>(null);
    // Whether the curated-templates inline picker is open.
    const [showTemplates, setShowTemplates] = useState(false);

    return (
        <div className="pathways">
            <div className="side-head">
                Pathways
                <span className="side-head-actions">
                    <button
                        className={"add-btn" + (showTemplates ? " active" : "")}
                        onClick={() => setShowTemplates((v) => !v)}
                        title="Insert a curated pathway"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                        >
                            <path d="M4 7h16M4 12h10M4 17h6" />
                        </svg>
                        Templates
                    </button>
                    <button
                        className="add-btn"
                        onClick={onCreate}
                        title="Add pathway"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                        >
                            <path d={ICON.plus} />
                        </svg>
                        Add
                    </button>
                </span>
            </div>

            {/* Curated pathway library: each entry inserts a new path. */}
            {showTemplates && (
                <div className="templates-inline">
                    <div className="templates-inline-title">
                        Curated pathways
                    </div>
                    {PATHWAY_TEMPLATES.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            className="templates-inline-item"
                            title={t.description}
                            onClick={() => {
                                onInsertTemplate(t.id);
                                setShowTemplates(false);
                            }}
                        >
                            <span className="templates-inline-name">{t.name}</span>
                            <span className="templates-inline-desc">
                                {t.description}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {trees.length === 0 ? (
                <p className="pathways-empty">
                    No pathways yet. Click <b>Add</b> to start a new route.
                </p>
            ) : (
                <div className="pathways-list">
                    {trees.map((t) => {
                        const open = openPalette === t.id;
                        return (
                            <div
                                key={t.id}
                                className={"pathway-row" + (open ? " open" : "")}
                            >
                                <button
                                    type="button"
                                    className="pathway-swatch"
                                    title="Choose colour"
                                    aria-label="Choose pathway colour"
                                    style={{ background: t.color }}
                                    onClick={() =>
                                        setOpenPalette(open ? null : t.id)
                                    }
                                />
                                <input
                                    className="pathway-name-input"
                                    value={t.name}
                                    placeholder="Pathway name"
                                    onChange={(e) =>
                                        onUpdate(t.id, { name: e.target.value })
                                    }
                                />
                                <button
                                    type="button"
                                    className="mini-btn danger"
                                    title="Delete pathway"
                                    aria-label="Delete pathway"
                                    onClick={() => {
                                        setOpenPalette(null);
                                        onDelete(t.id);
                                    }}
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d={ICON.trash} />
                                    </svg>
                                </button>

                                {/* Inline 8-colour palette for this path. */}
                                {open && (
                                    <div className="palette">
                                        {TREE_COLORS.map((c) => {
                                            const selected = sameColor(c, t.color);
                                            return (
                                                <button
                                                    type="button"
                                                    key={c}
                                                    className={
                                                        "palette-swatch" +
                                                        (selected ? " selected" : "")
                                                    }
                                                    style={{ background: c }}
                                                    title={c}
                                                    aria-label={`Use ${c}`}
                                                    onClick={() => {
                                                        onUpdate(t.id, { color: c });
                                                        setOpenPalette(null);
                                                    }}
                                                >
                                                    {selected && (
                                                        <svg
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="#fff"
                                                            strokeWidth="3"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <path d={ICON.check} />
                                                        </svg>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Static legend key: the 8 available path colours. */}
            <div className="palette-legend" title="8 available path colours">
                {TREE_COLORS.map((c) => (
                    <span
                        key={c}
                        className="palette-key"
                        style={{ background: c }}
                    />
                ))}
            </div>
        </div>
    );
}
