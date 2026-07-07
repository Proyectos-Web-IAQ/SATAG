// Loader estilo Tetris: 4 bloques (colores IAQ) que caen en secuencia.
export default function Loader({ label }: { label?: string }) {
  return (
    <div className="loader" role="status" aria-live="polite" aria-label={label ?? "Cargando"}>
      <div className="loader__grid">
        <span className="b b1" /><span className="b b2" /><span className="b b3" /><span className="b b4" />
      </div>
      {label && <span className="loader__label">{label}</span>}
    </div>
  );
}
