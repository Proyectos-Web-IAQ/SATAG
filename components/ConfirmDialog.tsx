"use client";

export default function ConfirmDialog({
  title, message, dato, confirmLabel = "Confirmar", danger, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  // El dato que hay que cotejar contra lo físico (p. ej. el No. de TAG): va
  // grande y en su propio renglón, no perdido a media oración del mensaje.
  dato?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {dato && <p className="modal__dato">{dato}</p>}
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
