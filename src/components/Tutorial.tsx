/**
 * Tutorial — a lightweight, self-contained spotlight tour.
 *
 * Walks the user through the app one element at a time: a dimmed overlay with a
 * clear "hole" cut around the targeted UI and a small tooltip card beside it
 * carrying Next / Back / Skip controls.
 *
 * Design notes:
 *   - The dimmed overlay is built with a giant box-shadow on the spotlight
 *     element, so the highlighted target stays visible (and even interactive)
 *     while everything around it is dimmed. The mask itself is pointer-events:
 *     none, so the app keeps working during the tour.
 *   - Steps target real DOM nodes via CSS selectors (ideally the stable
 *     `data-tour="…"` hooks placed on key elements). If a target isn't present
 *     or isn't on-screen (e.g. the mobile sidebar is hidden), the step falls
 *     back to a centred card so the tour never breaks.
 *   - The card is repositioned on resize/scroll and flips above/below the
 *     target to stay in the viewport.
 *   - Navigation: Skip, Back, Next (which becomes the final call-to-action),
 *     plus ←/→/Enter and Esc from the keyboard.
 *
 * Persistence (whether to auto-show again) is owned by the parent; this
 * component just reports `onClose(completed)`.
 */
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";

type Placement = "bottom" | "top" | "left" | "right";

interface Step {
    /** CSS selector for the element to highlight. Omit for a centred card. */
    target?: string;
    title: string;
    body: ReactNode;
    /** Preferred side for the card relative to the target (default "bottom"). */
    placement?: Placement;
    /** Label for the final step's primary button (defaults to "Done"). */
    cta?: string;
}

const STEPS: Step[] = [
    {
        title: "Welcome to FlowDoc",
        body: "FlowDoc turns your processes into a living, visual map. Here's a 60-second tour — you can skip it at any time.",
    },
    {
        target: ".sidebar",
        title: "The Outliner",
        body: "Every workflow, folder, and step lives here. Click any item to jump straight to it on the canvas.",
        placement: "right",
    },
    {
        target: '[data-tour="new-flow"]',
        title: "Start here",
        body: "Create a blank workflow, or load the sample to explore one that's already built out.",
        placement: "bottom",
    },
    {
        target: ".canvas",
        title: "The Canvas",
        body: "Steps appear as cards you can drag around. Connect them by dragging from a card's edge handle, or press A on the canvas to quick-add a step.",
        placement: "bottom",
    },
    {
        target: '[data-tour="theme-toggle"]',
        title: "Dark or light",
        body: "Switch themes any time — your preference is remembered on this device.",
        placement: "bottom",
    },
    {
        target: '[data-tour="help"]',
        title: "Replay any time",
        body: "Need a refresher? Click this help button to restart the tour. That's everything — enjoy!",
        cta: "Get started",
        placement: "bottom",
    },
];

interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

/** Gap between the highlighted target and the tooltip card (px). */
const GAP = 12;
/** Minimum margin kept between the card and the viewport edge (px). */
const VM = 12;
/** Extra padding added around the target inside the spotlight hole (px). */
const SPOT_PAD = 6;

interface Props {
    open: boolean;
    /** Called with `completed=true` on finishing, `false` on skipping/dismissing. */
    onClose: (completed: boolean) => void;
}

export default function Tutorial({ open, onClose }: Props) {
    const [i, setI] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const [card, setCard] = useState({ w: 0, h: 0 });
    const cardRef = useRef<HTMLDivElement>(null);

    const step = STEPS[i];
    const last = i === STEPS.length - 1;

    const next = useCallback(() => {
        if (last) onClose(true);
        else setI((v) => v + 1);
    }, [last, onClose]);
    const back = useCallback(() => setI((v) => Math.max(0, v - 1)), []);

    /* Restart from the first step every time the tour is (re)opened. */
    useEffect(() => {
        if (open) setI(0);
    }, [open]);

    /* Measure the current target's viewport rect; recompute on resize/scroll.
       Falls back to null (centred card) when the target is missing or off-screen. */
    useLayoutEffect(() => {
        if (!open) return;
        let raf = 0;
        const measure = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const sel = STEPS[i].target;
                const el = sel ? document.querySelector<HTMLElement>(sel) : null;
                if (!el) {
                    setRect(null);
                    return;
                }
                const r = el.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const onScreen =
                    r.width > 4 &&
                    r.height > 4 &&
                    r.bottom > 0 &&
                    r.right > 0 &&
                    r.top < vh &&
                    r.left < vw;
                setRect(
                    onScreen
                        ? {
                              left: r.left,
                              top: r.top,
                              right: r.right,
                              bottom: r.bottom,
                              width: r.width,
                              height: r.height,
                          }
                        : null,
                );
            });
        };
        measure();
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure, true);
        };
    }, [open, i]);

    /* Measure the rendered card so placement can account for its real size. */
    useLayoutEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setCard({ w: r.width, h: r.height });
    }, [i, open, rect]);

    /* Keyboard: Esc dismisses, ←/→/Enter navigate (ignored while typing). */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName;
            const editing =
                tag === "INPUT" ||
                tag === "TEXTAREA" ||
                tag === "SELECT" ||
                t?.isContentEditable;
            if (e.key === "Escape") {
                e.preventDefault();
                onClose(false);
            } else if (!editing && (e.key === "ArrowRight" || e.key === "Enter")) {
                e.preventDefault();
                next();
            } else if (!editing && e.key === "ArrowLeft") {
                e.preventDefault();
                back();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, next, back, onClose]);

    /** Decides where the card goes for the current target + measured card size. */
    const pos = useMemo<{
        centered: boolean;
        top?: number;
        left?: number;
    }>(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (!rect) return { centered: true };
        // For very large targets (e.g. the whole canvas), centre the card and
        // just spotlight the region — anchoring to an edge would look awkward.
        if (rect.width > vw * 0.6 || rect.height > vh * 0.6) {
            return { centered: true };
        }
        const fits = (p: Placement) =>
            p === "bottom"
                ? rect.bottom + GAP + card.h < vh - VM
                : p === "top"
                  ? rect.top - GAP - card.h > VM
                  : p === "right"
                    ? rect.right + GAP + card.w < vw - VM
                    : rect.left - GAP - card.w > VM;
        let placement: Placement = step.placement ?? "bottom";
        if (!fits(placement)) {
            const flip: Record<Placement, Placement> = {
                bottom: "top",
                top: "bottom",
                left: "right",
                right: "left",
            };
            if (fits(flip[placement])) placement = flip[placement];
        }
        let top: number;
        let left: number;
        if (placement === "bottom") {
            top = rect.bottom + GAP;
            left = rect.left + rect.width / 2 - card.w / 2;
        } else if (placement === "top") {
            top = rect.top - GAP - card.h;
            left = rect.left + rect.width / 2 - card.w / 2;
        } else if (placement === "right") {
            left = rect.right + GAP;
            top = rect.top + rect.height / 2 - card.h / 2;
        } else {
            left = rect.left - GAP - card.w;
            top = rect.top + rect.height / 2 - card.h / 2;
        }
        left = Math.max(VM, Math.min(vw - card.w - VM, left));
        top = Math.max(VM, Math.min(vh - card.h - VM, top));
        return { centered: false, top, left };
    }, [rect, card, step.placement]);

    if (!open) return null;

    const ready = pos.centered || card.h > 0;

    return (
        <div className="tour-mask" role="presentation">
            {/* Full dim only when there's no target to spotlight (welcome/done
                steps). Targeted steps get their dim from the spotlight's shadow. */}
            {!rect && <div className="tour-dim" />}
            {rect && (
                <div
                    className="tour-spot"
                    style={{
                        left: rect.left - SPOT_PAD,
                        top: rect.top - SPOT_PAD,
                        width: rect.width + SPOT_PAD * 2,
                        height: rect.height + SPOT_PAD * 2,
                    }}
                />
            )}
            <div
                ref={cardRef}
                className={
                    "tour-card" + (pos.centered ? " centered" : "") + (ready ? " ready" : "")
                }
                role="dialog"
                aria-label={step.title}
                style={
                    pos.centered
                        ? undefined
                        : ({ top: pos.top, left: pos.left } as CSSProperties)
                }
            >
                <div className="tour-step">
                    {i + 1} / {STEPS.length}
                </div>
                <h3 className="tour-title">{step.title}</h3>
                <div className="tour-body">{step.body}</div>
                <div className="tour-foot">
                    <button
                        type="button"
                        className="tour-skip"
                        onClick={() => onClose(false)}
                    >
                        Skip tour
                    </button>
                    <span className="tour-spacer" />
                    {i > 0 && (
                        <button
                            type="button"
                            className="btn small"
                            onClick={back}
                        >
                            Back
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn primary small"
                        onClick={next}
                    >
                        {last ? (step.cta ?? "Done") : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );
}
