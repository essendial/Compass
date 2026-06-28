/**
 * Modal — generic, reusable dialog shell.
 * Renders a centered card inside a click-to-close backdrop. Provides a title,
 * a body (children), an optional footer, and closes on Escape or backdrop click.
 * Used as the base for FlowFormModal and ConfirmDialog.
 */
import { useEffect, type ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

export default function Modal({ title, children, footer, onClose }: Props) {
  // Close on Escape key. Listener is cleaned up on unmount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // role="presentation": the div itself isn't a dialog; the inner card is.
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Stop clicks inside the card from bubbling up to the backdrop's onClose.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="close-x" onClick={onClose} aria-label="Close">
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
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
