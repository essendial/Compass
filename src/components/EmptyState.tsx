/**
 * EmptyState — placeholder shown in the main area when there's nothing to draw.
 * Two variants:
 *  - "no-flows": no workflows exist at all -> offer Create / Load sample.
 *  - "no-steps": a flow is active but has no steps -> offer Add first step.
 */
interface Props {
    variant: "no-flows" | "no-steps";
    onCreateFlow: () => void;
    onLoadSample: () => void;
    onAddStep: () => void;
}

export default function EmptyState({
    variant,
    onCreateFlow,
    onLoadSample,
    onAddStep,
}: Props) {
    const isNoFlows = variant === "no-flows";

    return (
        <main className="canvas">
            <div className="empty">
                <div className="empty-card">
                    {/* Icon differs by variant: list for no-flows, plus for no-steps. */}
                    <div className="e-icon">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            {isNoFlows ? (
                                <path d="M3 7h18M3 12h18M3 17h12" />
                            ) : (
                                <path d="M12 5v14M5 12h14" />
                            )}
                        </svg>
                    </div>
                    <h3>
                        {isNoFlows ? "No workflows yet" : "No steps yet"}
                    </h3>
                    <p>
                        {isNoFlows
                            ? "Create your first workflow to start documenting a process step by step."
                            : "Add the first step to this workflow to get the flow going."}
                    </p>
                    <div className="empty-actions">
                        {isNoFlows ? (
                            <>
                                <button
                                    className="btn primary"
                                    onClick={onCreateFlow}
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.4"
                                    >
                                        <path d="M12 5v14M5 12h14" />
                                    </svg>
                                    Create workflow
                                </button>
                                <button className="btn" onClick={onLoadSample}>
                                    Load a sample
                                </button>
                            </>
                        ) : (
                            <button
                                className="btn primary"
                                onClick={onAddStep}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.4"
                                >
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                                Add first step
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
