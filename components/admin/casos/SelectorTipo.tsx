"use client";

// El selector de tipo de caso, a la manera de las opciones de un campo de Notion
// (Gerardo, 7-oct: los tipos «a conveniencia», que se puedan quitar o poner).
//   - Se busca escribiendo; si no existe, «+ Crear» (solo TI).
//   - Las familias son los grupos; ⋮⋮ arrastra un tipo a otra familia.
//   - ••• abre su editor: nombre, familia, «que hacer», motivos de cierre, retirar
//     (si tiene casos) o borrar (si no). Un tipo con casos no se borra.
// Tres modos: asignar el tipo a casos, filtrar el tablero por tipos, o solo editar.
// La base vuelve a verificar el rol (guardar_tipo_caso es solo ti).
import { useEffect, useRef, useState } from "react";
import type { FamiliaCaso, TipoCasoCatalogo } from "@/lib/casosRegistro";

export type ModoSelector = "asignar" | "filtrar" | "editar";

export function Etiqueta({ tipo, familias, tipos, onClick, titulo }: {
  tipo: string;
  familias: FamiliaCaso[];
  tipos: TipoCasoCatalogo[];
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  titulo?: string;
}) {
  const t = tipos.find((x) => x.tipo === tipo);
  const f = familias.find((x) => x.id === (t?.familia ?? "otro"));
  const estilo = { background: f?.fondo ?? "#eef1f4", color: f?.tinta ?? "#56606e" };
  if (onClick) {
    return <button type="button" className="tc-etq tc-etq--boton" style={estilo} onClick={onClick} title={titulo ?? "Cambiar el tipo"}>{t?.titulo ?? tipo}</button>;
  }
  return <span className="tc-etq" style={estilo}>{t?.titulo ?? tipo}</span>;
}

export default function SelectorTipo({
  modo, ancla, tipos, familias, seleccion, cuentas, puedeEditar, onElegir, onGuardar, onBorrar, onCerrar,
}: {
  modo: ModoSelector;
  ancla: DOMRect;
  tipos: TipoCasoCatalogo[];
  familias: FamiliaCaso[];
  /** Los tipos marcados (filtrar) o el actual de los casos (asignar). */
  seleccion: string[];
  /** Casos por tipo, para «N casos» y para saber si se puede borrar. */
  cuentas: Map<string, number>;
  puedeEditar: boolean;
  onElegir: (tipo: string) => void;
  onGuardar: (t: { tipo: string | null; titulo: string; familia: string; queHacer: string; motivos: string[]; activo: boolean; orden?: number | null }) => Promise<string>;
  onBorrar: (tipo: string) => Promise<void>;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [arrastra, setArrastra] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const buscar = useRef<HTMLInputElement>(null);

  useEffect(() => { buscar.current?.focus(); }, []);
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) onCerrar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    const t = setTimeout(() => document.addEventListener("mousedown", fuera), 0);
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [onCerrar]);

  const ancho = 360;
  const left = Math.max(8, Math.min(ancla.left, window.innerWidth - ancho - 8));
  // Abajo de la etiqueta si cabe; si no, hacia arriba. Nunca fuera de la pantalla.
  const alto = Math.min(520, window.innerHeight * 0.8);
  const top = ancla.bottom + 6 + alto <= window.innerHeight - 8 ? ancla.bottom + 6 : Math.max(8, Math.min(ancla.top - 6 - alto, window.innerHeight - alto - 8));
  const q = texto.trim().toLowerCase();
  const visibles = (t: TipoCasoCatalogo) => t.activo && (!q || t.titulo.toLowerCase().includes(q));
  const exacto = tipos.some((t) => t.titulo.toLowerCase() === q);
  const retirados = tipos.filter((t) => !t.activo);

  async function correr(fn: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); } finally { setOcupado(false); }
  }
  async function crear() {
    await correr(async () => {
      const id = await onGuardar({ tipo: null, titulo: texto.trim(), familia: "otro", queHacer: "", motivos: [], activo: true });
      setTexto("");
      if (modo === "asignar") onElegir(id);
      else setEditando(id);
    });
  }
  async function moverAFamilia(tipo: string, familia: string, antesDe: string | null) {
    const t = tipos.find((x) => x.tipo === tipo);
    if (!t) return;
    // El orden: justo antes del tipo sobre el que se solto, o al final de la familia.
    const destino = tipos.filter((x) => x.familia === familia && x.tipo !== tipo).sort((a, b) => a.orden - b.orden);
    const i = antesDe ? destino.findIndex((x) => x.tipo === antesDe) : -1;
    const orden = i >= 0 ? destino[i].orden - 1 : (destino[destino.length - 1]?.orden ?? 0) + 10;
    if (t.familia === familia && !antesDe) return;
    await correr(async () => {
      await onGuardar({ tipo: t.tipo, titulo: t.titulo, familia, queHacer: t.queHacer, motivos: t.motivosCierre, activo: t.activo, orden });
    });
  }

  const opcion = (t: TipoCasoCatalogo) => {
    const f = familias.find((x) => x.id === t.familia);
    const sel = seleccion.includes(t.tipo);
    return (
      <div
        key={t.tipo}
        className={`tc-op${sel ? " tc-op--sel" : ""}${sobre === t.tipo ? " tc-op--sobre" : ""}`}
        draggable={puedeEditar}
        onDragStart={(e) => { setArrastra(t.tipo); e.dataTransfer.setData("text/plain", t.tipo); }}
        onDragEnd={() => { setArrastra(null); setSobre(null); }}
        onDragOver={(e) => { if (arrastra) { e.preventDefault(); setSobre(t.tipo); } }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (arrastra && arrastra !== t.tipo) moverAFamilia(arrastra, t.familia, t.tipo); setSobre(null); }}
      >
        {puedeEditar && <span className="tc-op__asa" aria-hidden="true" title="Arrastrar a otra familia">⋮⋮</span>}
        <button type="button" className="tc-op__elegir" onClick={() => (modo === "editar" ? setEditando(t.tipo) : onElegir(t.tipo))}>
          {modo === "filtrar" && <span className="tc-op__caja" aria-hidden="true">{sel ? "✓" : ""}</span>}
          <span className="tc-etq" style={{ background: f?.fondo, color: f?.tinta }}>{t.titulo}</span>
          {modo === "asignar" && sel && <span aria-label="actual"> ✓</span>}
        </button>
        <span className="tc-op__uso">{cuentas.get(t.tipo) || ""}</span>
        {puedeEditar && <button type="button" className="tc-op__mas" onClick={() => setEditando(t.tipo)} aria-label={`Editar ${t.titulo}`}>•••</button>}
      </div>
    );
  };

  const enEdicion = editando ? tipos.find((x) => x.tipo === editando) : null;

  return (
    <div ref={caja} className="tc-pop" style={{ left, top, width: ancho }} role="dialog" aria-label="Tipos de caso">
      {enEdicion ? (
        <Editor
          key={enEdicion.tipo}
          t={enEdicion}
          familias={familias}
          casos={cuentas.get(enEdicion.tipo) ?? 0}
          ocupado={ocupado}
          error={error}
          onVolver={() => { setEditando(null); setError(null); }}
          onGuardar={(c) => correr(async () => { await onGuardar(c); })}
          onBorrar={() => correr(async () => { await onBorrar(enEdicion.tipo); setEditando(null); })}
        />
      ) : (
        <>
          <input
            ref={buscar}
            className="tc-pop__buscar"
            placeholder={modo === "filtrar" || !puedeEditar ? "Buscar un tipo…" : "Buscar o crear un tipo…"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const hit = tipos.find((t) => visibles(t));
              if (q && !exacto && puedeEditar && modo !== "filtrar") crear();
              else if (hit && modo === "editar") setEditando(hit.tipo);
              else if (hit) onElegir(hit.tipo);
            }}
          />
          <div className="tc-pop__ayuda">
            {modo === "asignar" ? "Elija el tipo." : modo === "filtrar" ? "Mostrar solo estos tipos." : puedeEditar ? "Arrastre ⋮⋮ para cambiar de familia; ••• para editar." : "Los tipos los edita TI."}
          </div>
          {error && <p className="submit-error" role="alert" style={{ margin: "6px 12px" }}>{error}</p>}
          <div className="tc-pop__lista">
            {familias.map((f) => {
              const ts = tipos.filter((t) => t.familia === f.id && visibles(t)).sort((a, b) => a.orden - b.orden);
              if (!ts.length && q) return null;
              return (
                <div
                  key={f.id}
                  className={`tc-fam${sobre === `f:${f.id}` ? " tc-fam--sobre" : ""}`}
                  onDragOver={(e) => { if (arrastra) { e.preventDefault(); if (sobre !== `f:${f.id}` && !String(sobre).startsWith(f.id)) setSobre(`f:${f.id}`); } }}
                  onDrop={(e) => { e.preventDefault(); if (arrastra) moverAFamilia(arrastra, f.id, null); setSobre(null); }}
                >
                  <div className="tc-fam__t">{f.titulo}</div>
                  {ts.map(opcion)}
                </div>
              );
            })}
            {q && !exacto && puedeEditar && modo !== "filtrar" && (
              <button type="button" className="tc-pop__crear" onClick={crear} disabled={ocupado}>+ Crear «{texto.trim()}»</button>
            )}
            {retirados.length > 0 && !q && (
              <details className="tc-pop__ret">
                <summary>Retirados ({retirados.length})</summary>
                {retirados.map((t) => (
                  <div key={t.tipo} className="tc-op">
                    <span className="tc-op__asa" />
                    <span className="tc-op__elegir"><span className="tc-etq">{t.titulo}</span></span>
                    <span className="tc-op__uso">{cuentas.get(t.tipo) || ""}</span>
                    {puedeEditar && <button type="button" className="tc-op__mas" onClick={() => setEditando(t.tipo)} aria-label={`Editar ${t.titulo}`}>•••</button>}
                  </div>
                ))}
              </details>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Editor({ t, familias, casos, ocupado, error, onVolver, onGuardar, onBorrar }: {
  t: TipoCasoCatalogo;
  familias: FamiliaCaso[];
  casos: number;
  ocupado: boolean;
  error: string | null;
  onVolver: () => void;
  onGuardar: (c: { tipo: string; titulo: string; familia: string; queHacer: string; motivos: string[]; activo: boolean }) => Promise<void>;
  onBorrar: () => Promise<void>;
}) {
  const [titulo, setTitulo] = useState(t.titulo);
  const [familia, setFamilia] = useState(t.familia);
  const [queHacer, setQueHacer] = useState(t.queHacer);
  const [motivos, setMotivos] = useState(t.motivosCierre.join("\n"));
  const cambio = titulo !== t.titulo || familia !== t.familia || queHacer !== t.queHacer || motivos !== t.motivosCierre.join("\n");
  const datos = (activo: boolean) => ({ tipo: t.tipo, titulo: titulo.trim(), familia, queHacer: queHacer.trim(), motivos: motivos.split("\n").map((m) => m.trim()).filter(Boolean), activo });
  return (
    <div className="tc-ed">
      <button type="button" className="link-action" onClick={onVolver}>← Tipos</button>
      <label>Nombre<input className="input" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} /></label>
      <label>Familia
        <select className="select" value={familia} onChange={(e) => setFamilia(e.target.value)}>
          {familias.map((f) => <option key={f.id} value={f.id}>{f.titulo}</option>)}
        </select>
      </label>
      <label>Qué hacer <span className="tc-ed__nota">(se muestra arriba en cada caso)</span>
        <textarea className="textarea" rows={3} maxLength={1000} value={queHacer} onChange={(e) => setQueHacer(e.target.value)} />
      </label>
      <label>Motivos de cierre <span className="tc-ed__nota">(uno por renglón)</span>
        <textarea className="textarea" rows={3} value={motivos} onChange={(e) => setMotivos(e.target.value)} />
      </label>
      <div className="tc-ed__nota">
        {casos} caso{casos === 1 ? "" : "s"}{t.automatico ? " · lo abre una regla" : ""} · clave <span className="mono">{t.tipo}</span>
      </div>
      {error && <p className="submit-error" role="alert">{error}</p>}
      <div className="tc-ed__pie">
        <button type="button" className="primary-action" disabled={!cambio || ocupado || titulo.trim().length < 3} onClick={() => onGuardar(datos(t.activo))}>
          {ocupado ? "Guardando…" : "Guardar"}
        </button>
        {casos > 0 ? (
          <button type="button" className="ghost-action" disabled={ocupado} onClick={() => onGuardar(datos(!t.activo))}>
            {t.activo ? "Retirar" : "Volver a usar"}
          </button>
        ) : t.tipo !== "otro" ? (
          <button type="button" className="ghost-action" disabled={ocupado} onClick={() => { if (window.confirm(`¿Borrar el tipo «${t.titulo}»? No tiene casos.`)) onBorrar(); }}>Borrar</button>
        ) : null}
      </div>
      {casos > 0 && t.activo && <div className="tc-ed__nota">Retirar: ya no se ofrece al reportar; sus casos lo conservan.</div>}
    </div>
  );
}
