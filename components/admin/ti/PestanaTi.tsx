"use client";

// La pestaña TI rediseñada (fase 1; Gerardo, 21-oct; Desarrollo/09 §9).
//
// Un menú propio de Sistemas —barra lateral en la computadora, pestañas abajo en
// el celular— con la Bandeja al frente. Cada sección REUTILIZA la pantalla que ya
// existía: nada de lo que ya se usa y funciona se rediseña.
//   - Instalar: la cola de «Instalar TAG» de siempre (VistaTi en su modo).
//   - Personas: buscar (la ficha de Consulta), Actualizar datos, Dar de baja,
//     Incompletos y, si hay, las notas del buzón (VistaTi en esos modos).
//   - Ciclo de ZK: Archivos de ZK y Movimientos en ZK, juntos.
//   - Casos, Caseta: las mismas de Consulta.
//   - Configurar: TAGs de la escuela y GES (lo eventual).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import { leerBandeja, type LecturaBandeja } from "@/lib/supabase/apiBandeja";
import { tareasBandeja, type SeccionTi } from "@/lib/bandeja";
import VistaTi from "@/components/admin/VistaTi";
import VistaEstacionamiento from "@/components/admin/VistaEstacionamiento";
import VistaMovimientosZk from "@/components/admin/VistaMovimientosZk";
import ReportesCaseta from "@/components/admin/ReportesCaseta";
import VistaGes from "@/components/admin/VistaGes";
import BandejaTi from "@/components/admin/ti/BandejaTi";

const SECCIONES: { id: SeccionTi; titulo: string; ico: string; corto?: string }[] = [
  { id: "bandeja", titulo: "Bandeja", ico: "☰" },
  { id: "instalar", titulo: "Instalar", ico: "＋" },
  { id: "zk", titulo: "Ciclo de ZK", ico: "⟳", corto: "ZK" },
  { id: "casos", titulo: "Casos", ico: "▤" },
  { id: "caseta", titulo: "Caseta", ico: "⛉" },
  { id: "personas", titulo: "Personas", ico: "☺" },
  { id: "config", titulo: "Configurar", ico: "⚙", corto: "Ajustes" },
];

const SUBS: Partial<Record<SeccionTi, [string, string][]>> = {
  zk: [["archivos", "Archivos de ZK"], ["movimientos", "Movimientos y tandas"]],
  personas: [["buscar", "Buscar persona"], ["actualizar", "Actualizar datos"], ["baja", "Dar de baja"], ["incompletos", "Incompletos"], ["notas", "Notas del buzón"]],
  config: [["tags", "TAGs de la escuela"], ["ges", "Archivos de GES"]],
};

// La sección elegida sobrevive a salir y volver a la pestaña (como Consulta).
let ultima: { seccion: SeccionTi; sub: string | null } = { seccion: "bandeja", sub: null };

export default function PestanaTi({ rol, email, nombreSesion, personas, pideInstalar, onCuentaInstalar }: {
  rol: RolPanel;
  email: string;
  nombreSesion?: string;
  /** La búsqueda de personas de Consulta (vive en AdminPanel). */
  personas: ReactNode;
  /** Cambia cada vez que se toca «＋ Instalar» del encabezado. */
  pideInstalar: number;
  /** Cuántas familias esperan su TAG, para el acceso fijo del encabezado. */
  onCuentaInstalar: (n: number) => void;
}) {
  const [seccion, setSeccion] = useState<SeccionTi>(ultima.seccion);
  const [sub, setSub] = useState<string | null>(ultima.sub);
  const [lectura, setLectura] = useState<LecturaBandeja | null>(null);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);

  const ir = useCallback((s: SeccionTi, sb: string | null = null) => {
    ultima = { seccion: s, sub: sb };
    setSeccion(s);
    setSub(sb);
    window.scrollTo({ top: 0 });
  }, []);

  const leer = useCallback(async () => {
    try {
      const l = await leerBandeja();
      setLectura(l);
      setErrorLectura(null);
      onCuentaInstalar(l.porInstalar.length);
    } catch (e) {
      setErrorLectura(e instanceof Error ? e.message : "No se pudo leer lo pendiente.");
    }
  }, [onCuentaInstalar]);
  // Se vuelve a leer al entrar a la Bandeja y cada 5 minutos.
  useEffect(() => { if (seccion === "bandeja" || !lectura) leer(); }, [seccion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(leer, 5 * 60 * 1000); return () => clearInterval(t); }, [leer]);
  useEffect(() => { if (pideInstalar) ir("instalar"); }, [pideInstalar, ir]);

  const tareas = useMemo(() => (lectura ? tareasBandeja(lectura.entrada) : []), [lectura]);
  const e = lectura?.entrada;
  const cuenta: Partial<Record<SeccionTi, { n: number | string; tono: "alerta" | "aviso" | "" }>> = e ? {
    bandeja: { n: tareas.length, tono: tareas.some((t) => t.grupo === "ahora") ? "alerta" : "" },
    instalar: { n: lectura!.porInstalar.length, tono: "" },
    zk: tareas.some((t) => t.ir.seccion === "zk") ? { n: "●", tono: tareas.some((t) => t.ir.seccion === "zk" && t.grupo === "ahora") ? "alerta" : "aviso" } : { n: "", tono: "" },
    casos: { n: e.casosNuevos.n, tono: e.casosNuevos.n ? "alerta" : "" },
    caseta: { n: e.casetaSinAcceso.length + e.casetaSinCaso, tono: e.casetaSinAcceso.length ? "alerta" : "aviso" },
  } : {};

  const subs = (SUBS[seccion] ?? []).filter(([k]) => k !== "notas" || (e?.notasBuzon ?? 0) > 0);
  const subActual = sub && subs.some(([k]) => k === sub) ? sub : subs[0]?.[0] ?? null;

  let contenido: ReactNode = null;
  if (seccion === "bandeja") contenido = <BandejaTi lectura={lectura} error={errorLectura} tareas={tareas} onIr={(d) => ir(d.seccion, d.sub ?? null)} onLeer={leer} />;
  else if (seccion === "instalar") contenido = <VistaTi key="instalar" nombreSesion={nombreSesion} rol={rol} modoInicial="instalar" sinInicio />;
  else if (seccion === "zk") contenido = subActual === "movimientos"
    ? <VistaMovimientosZk email={email} onIr={(v) => ir("zk", v === "archivos" ? "archivos" : "movimientos")} />
    : <VistaEstacionamiento rol={rol} email={email} vista="archivos" />;
  else if (seccion === "casos") contenido = <VistaEstacionamiento rol={rol} email={email} vista="casos" />;
  else if (seccion === "caseta") contenido = <ReportesCaseta rol={rol} email={email} onIr={(v) => { if (v === "casos") ir("casos"); }} />;
  else if (seccion === "personas") contenido = subActual === "buscar" ? personas
    : <VistaTi key={subActual} nombreSesion={nombreSesion} rol={rol} modoInicial={subActual as "actualizar" | "baja" | "incompletos" | "notas"} sinInicio />;
  else if (seccion === "config") contenido = subActual === "ges"
    ? <VistaGes email={email} />
    : <VistaTi key="tags" nombreSesion={nombreSesion} rol={rol} modoInicial="tags" sinInicio />;

  return (
    <div className="ti2">
      <nav className="ti2-lado" aria-label="Secciones de Sistemas">
        {SECCIONES.map((s) => {
          const c = cuenta[s.id];
          return (
            <button key={s.id} type="button" className={`ti2-lado__b ti2-lado__b--${s.id}`} aria-current={seccion === s.id ? "page" : undefined} onClick={() => ir(s.id)}>
              <span className="ti2-lado__ico" aria-hidden="true">{s.ico}</span>
              <span className="ti2-lado__t">{s.corto ? <><span className="ti2-largo">{s.titulo}</span><span className="ti2-corto">{s.corto}</span></> : s.titulo}</span>
              {c && c.n !== "" && c.n !== 0 && <span className={`ti2-lado__c ${c.tono ? `ti2-lado__c--${c.tono}` : ""}`}>{c.n}</span>}
            </button>
          );
        })}
        <p className="ti2-lado__nota">Sistemas ve lo mismo, todos: si alguien falta, lo pendiente sigue en la Bandeja.</p>
      </nav>
      <div className="ti2-col">
        {subs.length > 1 && (
          <div className="tc-seg ti2-subs" role="group" aria-label="Partes de la sección">
            {subs.map(([k, t]) => (
              <button key={k} type="button" aria-pressed={subActual === k} onClick={() => ir(seccion, k)}>
                {t}{k === "notas" && e?.notasBuzon ? ` ${e.notasBuzon}` : ""}
              </button>
            ))}
          </div>
        )}
        {seccion === "config" && (
          <p className="ds-nota ti2-donde">Los tipos de caso se editan en Casos › «Tipos ▾»; los departamentos de ZK, en Ciclo de ZK › Movimientos y tandas.</p>
        )}
        {contenido}
      </div>
    </div>
  );
}
