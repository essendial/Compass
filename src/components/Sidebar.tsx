/**
 * Sidebar — the left panel shell.
 * Renders the "Outliner" header (with New-workflow and New-folder buttons),
 * its children (the FileOutliner tree), an optional Pathways section, and a
 * static legend explaining the step-type colours.
 * On mobile it slides in/out via the `open` prop (toggled from the TopBar).
 *
 * The right edge has a drag handle so the user can widen/narrow the outliner;
 * the chosen width is controlled by App (persisted to localStorage).
 */
import { useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react";

interface Props {
    open: boolean;
    /** Current sidebar width in px (controlled by the user via the drag handle). */
    width: number;
    /** Called with a new width as the user drags the right-edge resizer. */
    onWidthChange: (w: number) => void;
    onAddFlow: () => void;
    onAddFolder: () => void;
    children: ReactNode;
    /** Optional node rendered above the step-type legend (the Pathways section). */
    pathways?: ReactNode;
}

export default function Sidebar({
    open,
    width,
    onWidthChange,
    onAddFlow,
    onAddFolder,
    children,
    pathways,
}: Props) {
    // Width-clamp bounds (kept in sync with App's SIDEBAR_W_MIN/MAX).
    const W_MIN = 200;
    const W_MAX = 520;
    // Tracks an in-progress drag so we can paint a global resize cursor.
    const [dragging, setDragging] = useState(false);
    const handleRef = useRef<HTMLDivElement>(null);

    /** Pointer down on the right-edge handle: capture the pointer and begin resizing. */
    const onResizerDown = (e: RPointerEvent<HTMLDivElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
        handleRef.current?.setPointerCapture(e.pointerId);
    };

    /** While dragging, widen/narrow the sidebar to follow the cursor. */
    const onResizerMove = (e: RPointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        const w = Math.min(W_MAX, Math.max(W_MIN, e.clientX));
        onWidthChange(w);
    };

    /** Pointer up: end the drag and release capture. */
    const onResizerUp = (e: RPointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        setDragging(false);
        handleRef.current?.releasePointerCapture(e.pointerId);
    };

    return (
        <aside
            className={"sidebar" + (open ? " open" : "") + (dragging ? " resizing" : "")}
            style={{ "--sidebar-w": `${width}px` } as CSSProperties}
        >
            {/* Right-edge drag handle: drag left/right to narrow/widen the outliner. */}
            <div
                ref={handleRef}
                className="sidebar-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize outliner"
                onPointerDown={onResizerDown}
                onPointerMove={onResizerMove}
                onPointerUp={onResizerUp}
            />
            <div className="side-section">
                <div className="side-head">
                    Outliner
                    <span className="side-head-actions">
                        <button
                            className="add-btn"
                            onClick={onAddFolder}
                            title="New folder"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                            >
                                <path d="M4 6a2 2 0 0 1 2-2h3l2 2h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                                <path d="M12 11v4M10 13h4" />
                            </svg>
                            Folder
                        </button>
                        <button className="add-btn" onClick={onAddFlow} title="New workflow" data-tour="new-flow">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                            >
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            New
                        </button>
                    </span>
                </div>
            </div>
            {children}
            {pathways}
            {/* Static colour legend mapping each NodeType to its meaning. */}
            <div className="legend">
                <div className="side-head">Step types</div>
                <div className="legend-row">
                    <span
                        className="tdot"
                        style={{ background: "var(--t-trigger)" }}
                    ></span>
                    Trigger — starts the flow
                </div>
                <div className="legend-row">
                    <span
                        className="tdot"
                        style={{ background: "var(--t-action)" }}
                    ></span>
                    Action — does work
                </div>
                <div className="legend-row">
                    <span
                        className="tdot"
                        style={{ background: "var(--t-decision)" }}
                    ></span>
                    Decision — branches
                </div>
                <div className="legend-row">
                    <span
                        className="tdot"
                        style={{ background: "var(--t-wait)" }}
                    ></span>
                    Wait — a timed delay
                </div>
                <div className="legend-row">
                    <span
                        className="tdot"
                        style={{ background: "var(--t-end)" }}
                    ></span>
                    End — closes the flow
                </div>
            </div>
        </aside>
    );
}
