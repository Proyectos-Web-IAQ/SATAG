"use client";

// La barra lateral de vistas de Consulta: el esqueleto que Gerardo aprobo el 2-oct,
// al estilo Things/Linear. Una lista vertical agrupada, sin cajas, con la vista
// activa marcada; en telefono se vuelve una fila que envuelve, arriba del contenido.
//
// ES PRESENTACIONAL. Quien la usa decide que vistas hay para cada rol y que pasa al
// elegir una; aqui solo se dibuja la lista. Sustituye a los tres niveles que habia
// (pestanas del panel, control segmentado de Consulta y pestanas del Estacionamiento),
// que obligaban a saber en cual de los tres estaba lo que se buscaba.

export interface VistaLado {
  clave: string;
  titulo: string;
  /** Una marca corta al lado del nombre, como «beta». */
  nota?: string;
}

export interface GrupoLado {
  titulo: string;
  vistas: VistaLado[];
}

export default function LadoVistas({
  grupos,
  activa,
  onCambio,
  nota,
}: {
  grupos: GrupoLado[];
  activa: string;
  onCambio: (clave: string) => void;
  /** El pie de la barra: lo que conviene recordar en toda la pestaña. */
  nota?: string;
}) {
  return (
    <nav className="lado" aria-label="Vistas">
      {grupos.map((g) => [
        <span className="lado__grupo" key={`g-${g.titulo}`}>{g.titulo}</span>,
        ...g.vistas.map((v) => (
          <button
            key={v.clave}
            type="button"
            className="lado__vista"
            aria-pressed={v.clave === activa}
            onClick={() => onCambio(v.clave)}
          >
            <span>{v.titulo}</span>
            {v.nota && <span className="lado__n">{v.nota}</span>}
          </button>
        )),
      ])}
      {nota && <p className="lado__nota">{nota}</p>}
    </nav>
  );
}
