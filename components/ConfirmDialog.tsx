"use client";

export default function ConfirmDialog({
  title, message, confirmLabel = "Confirmar", danger, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="modal__actions">
          <button type="button" className="ghost-action" onClick={onCancel}>Cancelar</button>
          <button type="button" className={`primary-action ${danger ? "btn-danger" : ""}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
