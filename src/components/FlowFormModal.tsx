/**
 * FlowFormModal — a single text-input modal built on top of Modal.
 * Used for creating/renaming flows and renaming steps (the label/placeholder
 * is customised per use case). Submit is disabled until a non-empty name is
 * entered; Enter submits, Escape closes (via Modal).
 */
import { useState } from "react";
import Modal from "./Modal";

interface Props {
    title: string;
    submitLabel: string;
    initialName?: string;
    placeholder?: string;
    onSubmit: (name: string) => void;
    onClose: () => void;
}

export default function FlowFormModal({
    title,
    submitLabel,
    initialName = "",
    placeholder = "Workflow name",
    onSubmit,
    onClose,
}: Props) {
    const [name, setName] = useState(initialName);

    /** Trims and forwards the name up; ignored if empty. */
    const submit = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
    };

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
                        className="btn primary"
                        onClick={submit}
                        disabled={!name.trim()}
                    >
                        {submitLabel}
                    </button>
                </>
            }
        >
            <div className="field">
                <label>Name</label>
                <input
                    className="input"
                    autoFocus
                    value={name}
                    placeholder={placeholder}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") submit();
                    }}
                />
            </div>
        </Modal>
    );
}
