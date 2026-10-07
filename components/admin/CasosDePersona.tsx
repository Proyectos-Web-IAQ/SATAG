"use client";

// Los casos de UNA persona, dentro de su ficha (bloque 89).
//
// Un caso puede estar ligado al expediente o solo a un TAG (los que abre una regla
// con una credencial). La ficha junta los dos: los del expediente y los de cualquiera
// de sus TAGs, incluidos los que ya se cambiaron.
//
// El hook va aparte de la seccion porque dos cosas de la ficha leen lo mismo: el aviso
// «Preguntar al presentarse», arriba de todo, y la lista de casos, abajo.
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import { abrirCaso, listCasos, listTiposCaso } from "@/lib/supabase/apiPanel";
import {
  ETIQUETA_ESTADO_CASO,
  estaVivo,
  numeroCaso,
  ordenarCasos,
  type CasoGuardado,
  type TipoCasoCatalogo,
} from "@/lib/casosRegistro";
import DetalleCaso, { diaCaso } from "@/components/admin/DetalleCaso";

/** Quien lee los casos segun la RLS del bloque 89. */
export const VEN_CASOS: RolPanel[] = ["ti", "contador", "admin", "super"];

// El catalogo casi no cambia: se baja una vez por sesion de pestana.
let catalogoEnMemoria: TipoCasoCatalogo[] | null = null;

export function useCasosDePersona(registroId: string, tags: string[], rol: RolPanel) {
  const puede = VEN_CASOS.includes(rol);
  const [estado, setEstado] = useState<{ para: string; casos: CasoGuardado[]; error: string | null; cargando: boolean }>({
    para: "", casos: [], error: null, cargando: false,
  });
  const [tipos, setTipos] = useState<TipoCasoCatalogo[]>(catalogoEnMemoria ?? []);
  const [version, setVersion] = useState(0);
  // La llave de los TAGs: el arreglo se recrea en cada render y no debe relanzar la lectura.
  const llaveTags = tags.join(",");

  useEffect(() => {
    if (!puede) return;
    let vivo = true;
    setEstado((e) => ({ ...e, para: registroId, cargando: true, error: null }));
    listCasos({ registroId, tarjetas: llaveTags ? llaveTags.split(",") : [] })
      .then((casos) => vivo && setEstado({ para: registroId, casos, error: null, cargando: false }))
      .catch((err: unknown) => vivo && setEstado({
        para: registroId, casos: [], cargando: false,
        error: err instanceof Error ? err.message : "No se pudieron leer los casos.",
      }));
    return () => { vivo = false; };
  }, [registroId, llaveTags, puede, version]);

  // Se lee SIEMPRE al abrir la ficha: los tipos los edita TI desde el tablero (bloque 90), y
  // un catalogo guardado para toda la sesion no veia un tipo creado despues (Gerardo, 7-oct).
  // Lo guardado solo sirve para no mostrar la lista vacia mientras llega la nueva.
  useEffect(() => {
    if (!puede) return;
    let vivo = true;
    listTiposCaso()
      .then((t) => { catalogoEnMemoria = t; if (vivo) setTipos(t); })
      .catch(() => { /* sin catalogo se sigue viendo la lista; el formulario avisa */ });
    return () => { vivo = false; };
  }, [puede, registroId]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const casos = estado.para === registroId ? ordenarCasos(estado.casos) : [];
  return {
    puede,
    casos,
    tipos,
    error: estado.para === registroId ? estado.error : null,
    cargando: estado.para !== registroId || estado.cargando,
    recargar,
    /** Los que piden que se le pregunte algo cuando se presente. */
    porPreguntar: casos.filter((c) => c.preguntarAlPresentarse && estaVivo(c.estado)),
  };
}

/** El aviso de arriba de la ficha: lo que hay que preguntarle a la persona cuando llegue. */
export function AvisoPreguntar({ casos }: { casos: CasoGuardado[] }) {
  if (casos.length === 0) return null;
  return (
    <div className="caso-aviso" role="status">
      <strong>Preguntar al presentarse.</strong>
      <ul>
        {casos.map((c) => (
          <li key={c.id}>{c.titulo} <span className="caso-aviso__n">({numeroCaso(c.numero)})</span></li>
        ))}
      </ul>
    </div>
  );
}

export function SeccionCasos({ registroId, casos, tipos, cargando, error, recargar, rol, email }: {
  registroId: string;
  casos: CasoGuardado[];
  tipos: TipoCasoCatalogo[];
  cargando: boolean;
  error: string | null;
  recargar: () => void;
  rol: RolPanel;
  email: string | null;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const tipoDe = useMemo(() => new Map(tipos.map((t) => [t.tipo, t])), [tipos]);
  const vivos = casos.filter((c) => estaVivo(c.estado)).length;

  return (
    <section className="ficha__bloque">
      <h3>Casos{!cargando && casos.length > 0 ? ` · ${vivos} ${vivos === 1 ? "vivo" : "vivos"} de ${casos.length}` : ""}</h3>
      {cargando ? (
        <p className="ficha__vacio">Leyendo los casos…</p>
      ) : error ? (
        <p className="submit-error" role="alert">
          {error}{" "}
          <button type="button" className="link-action" onClick={recargar}>Reintentar</button>
        </p>
      ) : casos.length === 0 ? (
        <p className="ficha__vacio">Esta persona no tiene casos.</p>
      ) : (
        <ul className="casos__l caso-lista">
          {casos.map((c) => {
            const esta = abierto === c.id;
            return (
              <li key={c.id} className="casos__fila">
                <button type="button" className="caso-fila" aria-expanded={esta} onClick={() => setAbierto(esta ? null : c.id)}>
                  <span className="caso-fila__t">
                    <span className="caso-fila__n">{numeroCaso(c.numero)}</span> {c.titulo}
                  </span>
                  <span className="caso-fila__m">
                    {tipoDe.get(c.tipo)?.titulo ?? c.tipo}
                    {c.tarjeta ? ` · TAG ${c.tarjeta}` : ""} · {diaCaso(c.actualizadoEn)} · {c.creadoPor}
                  </span>
                  <span className={`casos__estado casos__estado--${c.estado}`}>{ETIQUETA_ESTADO_CASO[c.estado]}</span>
                </button>
                {esta && (
                  <DetalleCaso
                    caso={c}
                    tipo={tipoDe.get(c.tipo)}
                    puedeEditar={rol !== "consulta"}
                    email={email}
                    onCambio={recargar}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {registrando ? (
        <RegistrarCaso
          registroId={registroId}
          tipos={tipos}
          email={email}
          onListo={() => { setRegistrando(false); recargar(); }}
          onCancelar={() => setRegistrando(false)}
        />
      ) : (
        !cargando && (
          <button type="button" className="ghost-action caso__b" style={{ marginTop: 12 }} onClick={() => setRegistrando(true)}>
            Registrar caso
          </button>
        )
      )}
    </section>
  );
}

function RegistrarCaso({ registroId, tipos, email, onListo, onCancelar }: {
  registroId: string;
  tipos: TipoCasoCatalogo[];
  email: string | null;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const id = useId();
  // Los que abre una regla no se ofrecen a mano (ya los trae el calculo), ni los retirados.
  const manuales = tipos.filter((t) => !t.automatico && t.activo).sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
  const [tipo, setTipo] = useState("");
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [preguntar, setPreguntar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elegido = manuales.find((t) => t.tipo === tipo);
  const tituloValido = titulo.trim().length >= 3;

  async function guardar() {
    if (!elegido || !tituloValido) return;
    setGuardando(true);
    setError(null);
    try {
      await abrirCaso({ tipo: elegido.tipo, titulo: titulo.trim(), detalle: detalle.trim(), registroId, preguntar }, email);
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el caso.");
      setGuardando(false);
    }
  }

  return (
    <form className="casos__form caso__form" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
      <h4 className="caso__h">Registrar caso</h4>
      <label className="label" htmlFor={`${id}-tipo`}>Tipo</label>
      <select id={`${id}-tipo`} className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
        <option value="">Elija un tipo…</option>
        {manuales.map((t) => <option key={t.tipo} value={t.tipo}>{t.titulo}</option>)}
      </select>
      {manuales.length === 0 && <p className="ti-hint">No se pudo leer la lista de tipos. Cierre y vuelva a abrir la ficha.</p>}
      {elegido && <p className="ti-hint">{elegido.queHacer}</p>}
      <label className="label" htmlFor={`${id}-titulo`}>Qué pasó</label>
      <input id={`${id}-titulo`} className="input" maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)}
        placeholder="Una frase, por ejemplo: entró en sentido contrario" />
      <label className="label" htmlFor={`${id}-detalle`}>Detalle (opcional)</label>
      <textarea id={`${id}-detalle`} className="textarea" maxLength={4000} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
      <label className="check">
        <input type="checkbox" checked={preguntar} onChange={(e) => setPreguntar(e.target.checked)} />
        <span>Preguntar al presentarse: se le avisará a quien abra su ficha.</span>
      </label>
      {error && <p className="submit-error" role="alert">{error}</p>}
      <div className="chip-row">
        <button type="submit" className="primary-action caso__b" disabled={guardando || !elegido || !tituloValido}>
          {guardando ? "Guardando…" : "Registrar caso"}
        </button>
        <button type="button" className="ghost-action caso__b" disabled={guardando} onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
