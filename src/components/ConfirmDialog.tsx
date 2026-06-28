/**
 * ConfirmDialog — a destructive-action confirmation built on top of Modal.
 * Shows a title + message and Cancel/Delete buttons. Calls onConfirm then onClose
 * when confirmed. Used for deleting flows and steps.
 */
import type { ReactNode } from "react";
import Modal from "./Modal";

interface Props {
    title: string;
    /** Rich message body (can contain JSX like bold flow/step names). */
    message: ReactNode;
    /** Label for the confirm button; defaults to "Delete". */
    confirmLabel?: string;
    onConfirm: () => void;
    onClose: () => void;
}

export default function ConfirmDialog({
    title,
    message,
    confirmLabel = "Delete",
    onConfirm,
    onClose,
}: Props) {
    return (
        <Modal
            title={title}
            onClose={onClose}
            footer={
                <>
                    <button className="btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="btn danger"
                        // Run the destructive action, then close the dialog.
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                    >
                        {confirmLabel}
                    </button>
                </>
            }
        >
            <p className="confirm-msg">{message}</p>
        </Modal>
    );
}
