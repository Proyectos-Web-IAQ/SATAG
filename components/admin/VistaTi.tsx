"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CambiosRegistro, DatosCapturaTi, ProcedenciaTag, Registro, RegistroIncompleto, Solicitud, TagInventario, TipoUsuario, TramiteSolicitado } from "@/lib/mock/types";
import { getMarcas, getColores } from "@/lib/supabase/api";
import {
  listRegistros,
  listNotasSinExpediente,
  listRegistrosIncompletos,
  getEstacionamientos,
  instalarTagConEstacionamiento,
  actualizarRegistroConEstacionamiento,
  darBaja,
  descartarSolicitud,
  vincularNota,
  usarTagApartado,
  listTagsInventario,
  altaTagsInventario,
  retirarTagInventario,
  capturarExpedienteTi,
  type AccionResultado,
} from "@/lib/supabase/apiPanel";
import { filaStock, filaPadron, generarXlsxZk, generarCsvZk, leerExportZk, descargarArchivo, fechaArchivo, type FilaZk } from "@/lib/zk/plantillaZk";
import Loader from "@/components/Loader";
import ConfirmDialog from "@/components/ConfirmDialog";
import EvidenciaFirmaPanel from "@/components/admin/EvidenciaFirma";
import ListaIncompletos from "@/components/admin/Incompletos";
import { DetalleRegistro, TarjetaRegistro, ROL_LABEL, TRAMITE_LABEL, TIPOS_USUARIO, TIPO_USUARIO_LABEL, BadgeEspera, scrollAlAviso } from "@/components/admin/RegistroCard";

type Modo = "inicio" | "instalar" | "actualizar" | "baja" | "notas" | "incompletos" | "tags" | "capturar";
type Accion = "instalar" | "actualizar" | "baja";

type ConfirmCfg = {
  title: string; message: string; confirmLabel: string; danger: boolean;
  action: () => Promise<AccionResultado>;
  // Texto del aviso de exito; como funcion cuando necesita datos de la respuesta
  // (p.ej. el folio recien asignado).
  ok: string | ((res: AccionResultado) => string);
  // Se ejecuta tras el refresh exitoso: p.ej. abrir el expediente recien vinculado.
  after?: () => void;
};

// Compara asignaciones de estacionamiento sin importar el orden de los chips.
const mismaAsignacion = (a: string[], b: string[]) =>
  [...a].sort().join("+") === [...b].sort().join("+");

const TAG_RE = /^[0-9]{6,11}$/;
// Tramites que TI puede corroborar al vincular una nota (mismo catalogo que el
// buzon): solo actualizacion o baja; instalar es del alta, no de una solicitud.
const TRAMITES_TI: TramiteSolicitado[] = ["actualizacion", "baja"];
// Semáforo de los contadores: verde (0), amarillo (pocos), rojo (muchos).
const sem = (n: number) => (n === 0 ? "ok" : n <= 4 ? "warn" : "alert");

// ¿El registro tiene una peticion pendiente de este tramite? Cuenta la solicitud
// de folio de ese tipo (actualizacion/baja) Y una nota vinculada (SC-003) cuyo
// tramite pedido coincide: asi una nota que pidio "dar de baja" hace que el
// registro entre a la cola de bajas, no solo al banner del expediente.
const pidePendiente = (r: Registro, tramite: "actualizacion" | "baja") =>
  r.solicitudes.some((s) => !s.atendida &&
    (s.tipo === tramite || (s.tipo === "nota" && s.tramiteSolicitado === tramite)));

// Fecha (YYYY-MM-DD) desde la que la familia espera atencion en una cola. Es la
// peticion pendiente MAS ANTIGUA del tramite (para ordenar por urgencia).
const fechaEsperaTramite = (r: Registro, tramite: "actualizacion" | "baja"): string => {
  const s = r.solicitudes
    .filter((x) => !x.atendida && (x.tipo === tramite || (x.tipo === "nota" && x.tramiteSolicitado === tramite)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  return s?.fecha ?? r.createdAt.slice(0, 10);
};
// Para la cola "Instalar TAG": la familia espera desde que pago (ahi quedo lista
// la instalacion); si no hay pago, desde el alta.
const fechaEsperaInstalar = (r: Registro): string => {
  const pago = [...r.pagos].filter((p) => p.fecha).sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""))[0];
  return pago?.fecha ?? r.createdAt.slice(0, 10);
};
// Orden por urgencia: la peticion mas antigua primero (la familia que mas espera).
const porUrgencia = (fecha: (r: Registro) => string) =>
  (a: Registro, b: Registro) => fecha(a).localeCompare(fecha(b));

// Orden del padrón en TI: primero lo que TI puede resolver ya (instalar), luego
// las solicitudes pendientes (baja antes que actualización) y, al final, lo que
// no requiere acción de TI: por cobrar (espera a Admin) y sin pendientes.
const grupoTi = (r: Registro): number => {
  if (r.estado === "pendiente" && !r.noDispositivo && r.pagos.length > 0) return 0; // por instalar
  if (r.estado !== "baja") {
    if (pidePendiente(r, "baja")) return 1;          // por dar de baja
    if (pidePendiente(r, "actualizacion")) return 2; // por actualizar
  }
  if (r.estado === "pendiente" && r.pagos.length === 0) return 3;  // por cobrar (Admin)
  return 4;                                                        // sin pendientes
};

// Pantalla completa del rol TI, pensada para usarse desde el celular en el
// estacionamiento: tres tarjetas de acción (instalar / actualizar / dar de baja)
// que abren un flujo enfocado, y abajo el padrón completo con las mismas acciones.
// Lee de Supabase (lib/supabase/apiPanel); TI también define el estacionamiento
// al instalar o actualizar (SC-002).
export default function VistaTi({ nombreSesion }: { nombreSesion?: string }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [notas, setNotas] = useState<Solicitud[]>([]);
  // CC-02: expedientes a los que les falta algo para operar. No es una cola de
  // trabajo del día como las otras tres: es lo que se quedó a medias y nadie
  // volvió a mirar. El criterio vive en la vista SQL (bloque 45).
  const [incompletos, setIncompletos] = useState<RegistroIncompleto[]>([]);
  // SC-025: inventario de TAGs de la escuela (alta anticipada). Los disponibles
  // se ofrecen al instalar; la asignacion la hace el RPC al activar el TAG.
  const [inventario, setInventario] = useState<TagInventario[]>([]);
  // El inventario se carga aparte: si falla (p.ej. bloque 52 sin aplicar) se
  // dice tal cual, pero las colas de instalar/actualizar/baja siguen operando.
  const [inventarioError, setInventarioError] = useState<string | null>(null);
  // SC-025: export a ZK. El mapa tarjeta -> ID de ZK viene del export de ZK que
  // TI carga (opcional) para que el import actualice en vez de duplicar.
  const [mapaZk, setMapaZk] = useState<Map<string, string> | null>(null);
  const [nombreExportZk, setNombreExportZk] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [colores, setColores] = useState<string[]>([]);
  // Tres estados, y los tres se ven distintos en los formularios:
  //   undefined = todavía está cargando
  //   null      = no cargó (ver D-09)
  //   []        = cargó y no hay ninguno
  // Arrancaba en [], así que "cargando" era indistinguible de "no hay ninguno":
  // quien abría el formulario antes de que resolviera veía una fila de chips
  // vacía y "Elija al menos un estacionamiento", sin nada que elegir ni pista de
  // que faltaba esperar. El arranque en [] es anterior a D-09; aquel parche solo
  // quitó el respaldo inventado.
  const [estacionamientos, setEstacionamientos] = useState<string[] | null | undefined>(undefined);

  const [modo, setModo] = useState<Modo>("inicio");
  const [query, setQuery] = useState("");
  // Padrón real: se pagina y se filtra (ver VistaAdmin).
  const [filtroTi, setFiltroTi] = useState<"todos" | "pendiente" | "activo" | "baja">("todos");
  const [mostrarTi, setMostrarTi] = useState(25);
  const [selId, setSelId] = useState<string | null>(null);
  const [accionPadron, setAccionPadron] = useState<Accion | null>(null);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmCfg | null>(null);
  const bannersRef = useRef<HTMLDivElement>(null);

  // Nombre de quien atiende: se toma de la sesión autenticada y se conserva
  // mientras esta vista siga montada. No se persiste entre sesiones: los
  // dispositivos de caseta pueden ser compartidos y no debemos atribuirle una
  // acción al usuario que inició sesión anteriormente.
  const [tiNombre, setTiNombre] = useState(nombreSesion ?? "");

  async function refresh() {
    setLoading(true);
    try {
      const [list, notasList, incompletosList, inventarioRes] = await Promise.all([
        listRegistros(),
        listNotasSinExpediente(),
        listRegistrosIncompletos(),
        listTagsInventario().then(
          (v) => ({ ok: true as const, v }),
          (e: unknown) => ({ ok: false as const, e }),
        ),
      ]);
      setRegistros(list);
      setNotas(notasList);
      setIncompletos(incompletosList);
      if (inventarioRes.ok) {
        setInventario(inventarioRes.v);
        setInventarioError(null);
      } else {
        setInventario([]);
        setInventarioError(inventarioRes.e instanceof Error ? inventarioRes.e.message : "No se pudo cargar el inventario de TAGs.");
      }
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar los registros.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // Catálogos: si fallan, los formularios siguen operables con lo que el
    // registro ya trae; la BD valida las claves reales al asignar.
    getMarcas().then(setMarcas).catch(() => {});
    getColores().then(setColores).catch(() => {});
    // Estacionamientos NO lleva respaldo inventado (D-09): null significa "no
    // cargó" y los formularios lo dicen tal cual. Unas claves de relleno
    // parecerían el catálogo real y llevarían a asignar un acceso inválido.
    getEstacionamientos()
      .then((es) => setEstacionamientos(es.map((e) => e.clave)))
      .catch(() => setEstacionamientos(null));
  }, []);

  // Alineado con el RPC instalar_tag: solo registros PENDIENTES sin TAG y con
  // pago. (Un bloqueado no entra a la cola; el RPC lo rechazaría igual.)
  const porInstalar = useMemo(
    () => registros.filter((r) => r.estado === "pendiente" && !r.noDispositivo && r.pagos.length > 0)
      .sort(porUrgencia(fechaEsperaInstalar)),
    [registros]);
  // Registros del alta que aun NO pueden instalarse porque falta el pago
  // (Administracion cobra primero). Se muestran atenuados en "Instalar TAG" como
  // "Esperando pago", para que TI sepa que estan en la fila de instalacion.
  const instalarSinPago = useMemo(
    () => registros.filter((r) => r.estado === "pendiente" && !r.noDispositivo && r.pagos.length === 0)
      .sort(porUrgencia(fechaEsperaInstalar)),
    [registros]);
  const solicitanActualizar = useMemo(
    () => registros.filter((r) => r.estado !== "baja" && pidePendiente(r, "actualizacion"))
      .sort(porUrgencia((r) => fechaEsperaTramite(r, "actualizacion"))),
    [registros]);
  const solicitanBaja = useMemo(
    () => registros.filter((r) => r.estado !== "baja" && pidePendiente(r, "baja"))
      .sort(porUrgencia((r) => fechaEsperaTramite(r, "baja"))),
    [registros]);
  // SC-025: los TAGs listos para instalar (dados de alta por adelantado).
  const tagsDisponibles = useMemo(
    () => inventario.filter((t) => t.asignadoA === null),
    [inventario]);
  const tagsAsignados = useMemo(
    () => inventario.filter((t) => t.asignadoA !== null)
      .sort((a, b) => (b.asignadoEn ?? "").localeCompare(a.asignadoEn ?? "")),
    [inventario]);
  // SC-026: TAG reservado desde la captura para un expediente que aun no lo
  // tiene instalado (registro sin no_dispositivo).
  const tagReservadoDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of inventario) {
      if (!t.asignadoA) continue;
      const r = registros.find((x) => x.id === t.asignadoA);
      if (r && !r.noDispositivo && r.estado !== "baja") m.set(r.id, t.noDispositivo);
    }
    return m;
  }, [inventario, registros]);

  const q = query.trim().toLowerCase();
  const coincide = (r: Registro) =>
    [r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio, r.marca, r.modelo]
      .join(" ").toLowerCase().includes(q);
  // sort() es estable: dentro de cada grupo se conserva el orden de listRegistros
  // (nuevos primero).
  const padron = [...(q ? registros.filter(coincide) : registros)]
    .filter((r) => filtroTi === "todos" ? true : r.estado === filtroTi)
    .sort((a, b) => grupoTi(a) - grupoTi(b));
  // Búsqueda dentro de "Actualizar datos" / "Dar de baja" para atender a quien
  // llega sin solicitud previa (el caso normal: se atiende en el momento).
  const listaSolicitudes = modo === "actualizar" ? solicitanActualizar : modo === "baja" ? solicitanBaja : [];
  const resultadosAccion = (modo === "actualizar" || modo === "baja") && q
    ? registros.filter((r) => r.estado !== "baja" && !listaSolicitudes.includes(r) && coincide(r))
    : [];

  async function run(fn: () => Promise<AccionResultado>, ok: ConfirmCfg["ok"], after?: () => void) {
    if (busy) return;
    setBusy(true); setError(null); setFeedback(null);
    try {
      const res = await fn();
      await refresh();
      setSelId(null); setAccionPadron(null);
      setFeedback(typeof ok === "function" ? ok(res) : ok);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
      // Éxito o error, el aviso queda a la vista: los formularios pueden estar
      // muy abajo en el padrón móvil y una acción sin reacción visible se
      // siente como que no pasó nada.
      scrollAlAviso(bannersRef.current);
    }
  }

  function irA(m: Modo) {
    setModo(m); setSelId(null); setAccionPadron(null); setQuery("");
    setFeedback(null); setError(null);
  }
  function toggleSel(id: string) {
    setSelId((cur) => (cur === id ? null : id));
    setAccionPadron(null); setError(null);
  }

  // Confirmaciones: en campo, el error caro es activar un número equivocado,
  // así que las acciones repiten el dato clave antes de ejecutar.
  // Instalar define también el estacionamiento (SC-002): el SQL 31 ejecuta
  // asignación + TAG en una sola transacción, con la persona presente.
  function confirmarInstalar(r: Registro, tag: string, claves: string[], propio: boolean, apartadoNo: string) {
    const procedencia: ProcedenciaTag = propio ? "propio" : "escuela";
    const apartado = propio ? (apartadoNo.trim() || null) : null;
    const cambiaProcedencia = procedencia !== r.procedenciaTag;
    setConfirm({
      title: "Instalar y activar TAG",
      message: `Se instalará el TAG ${tag} en el ${r.marca} ${r.modelo} ${r.color} (${r.placas ?? "sin placas"}) de ${r.usuarioNombre}, con acceso a ${claves.join(" + ")}, y el registro quedará activo.`
        + (apartado ? ` Se apartará el TAG ${apartado} de la escuela.` : "")
        + (cambiaProcedencia ? ` El TAG quedará marcado como ${procedencia}.` : "")
        + " Revise bien el número. ¿Continuar?",
      confirmLabel: "Instalar", danger: false,
      action: () => instalarTagConEstacionamiento(r.id, tag, claves, tiNombre, { tagApartadoNo: apartado, procedenciaTag: procedencia }),
      ok: `TAG ${tag} instalado y activado (${r.folio}).` + (apartado ? ` TAG ${apartado} apartado.` : ""),
    });
  }
  // claves null = el estacionamiento no cambió (no se llama a su RPC).
  function confirmarActualizar(r: Registro, cambios: CambiosRegistro, claves: string[] | null, resumen: string, motivo: string) {
    setConfirm({
      title: "Actualizar registro",
      message: `Cambios en ${r.folio} (${r.usuarioNombre}): ${resumen}. ¿Guardar?`,
      confirmLabel: "Guardar cambios", danger: false,
      action: () => actualizarRegistroConEstacionamiento(r.id, cambios, claves, motivo, tiNombre),
      ok: `Registro ${r.folio} actualizado.`,
    });
  }
  function confirmarBaja(r: Registro, motivo: string) {
    setConfirm({
      title: "Dar de baja",
      message: `Se dará de baja el registro ${r.folio} (${r.usuarioNombre}) y su TAG quedará inactivo. ¿Continuar?`,
      confirmLabel: "Dar de baja", danger: true,
      action: () => darBaja(r.id, motivo, tiNombre),
      ok: `Registro ${r.folio} dado de baja.`,
    });
  }
  // CC-01: reposición desde el TAG apartado. Activa el reservado, deja inactivo el
  // actual y pasa la procedencia a escuela; se limpia la reserva.
  function confirmarUsarApartado(r: Registro) {
    setConfirm({
      title: "Usar el TAG apartado",
      message: `Se activará el TAG apartado ${r.tagApartadoNo} en ${r.folio} (${r.usuarioNombre}). El TAG actual ${r.noDispositivo ?? "—"} quedará inactivo y la procedencia pasará a escuela. ¿Continuar?`,
      confirmLabel: "Usar TAG apartado", danger: false,
      action: () => usarTagApartado(r.id, tiNombre),
      ok: `TAG apartado ${r.tagApartadoNo} activado en ${r.folio}. El anterior quedó inactivo.`,
    });
  }
  // SC-025: alta anticipada de un lote de TAGs al inventario. El RPC valida
  // todo-o-nada; si algun numero ya existe en alguna parte, rechaza con la lista.
  function confirmarAltaInventario(numeros: string[], alTerminar?: () => void) {
    setConfirm({
      title: "Dar de alta TAGs al inventario",
      message: `Se darán de alta ${numeros.length} TAG${numeros.length === 1 ? "" : "s"} al inventario: ${numeros.join(", ")}. Quedarán disponibles para elegirse al instalar. ¿Continuar?`,
      confirmLabel: "Dar de alta", danger: false,
      action: () => altaTagsInventario(numeros, tiNombre),
      ok: `${numeros.length} TAG${numeros.length === 1 ? "" : "s"} en el inventario, disponible${numeros.length === 1 ? "" : "s"} para instalar.`,
      after: alTerminar,
    });
  }
  // Retira un TAG que sigue disponible (capturado por error, danado, devuelto).
  function confirmarRetirarInventario(numero: string) {
    setConfirm({
      title: "Retirar TAG del inventario",
      message: `Se retirará el TAG ${numero} del inventario y dejará de aparecer como disponible. ¿Continuar?`,
      confirmLabel: "Retirar", danger: true,
      action: () => retirarTagInventario(numero, tiNombre),
      ok: `TAG ${numero} retirado del inventario.`,
    });
  }
  // SC-026: alta desde la hoja fisica firmada, con el TAG del inventario
  // reservado para el expediente. El pago sigue siendo de Administracion.
  function confirmarCaptura(d: DatosCapturaTi, alTerminar: () => void) {
    const titular = [d.usuarioNombres, d.usuarioApellidoPaterno, d.usuarioApellidoMaterno ?? ""].join(" ").replace(/\s+/g, " ").trim();
    setConfirm({
      title: "Capturar hoja física",
      message: `Se capturará el expediente de ${titular} — ${d.marca} ${d.modelo} ${d.color}, ${d.sinPlacas ? "sin placas" : `placas ${d.placas ?? ""}`} — `
        + (d.noDispositivo ? `con el TAG ${d.noDispositivo} reservado. ` : "sin TAG reservado. ")
        + "El pago lo registra Administración y la firma queda en la hoja. ¿Continuar?",
      confirmLabel: "Capturar", danger: false,
      action: () => capturarExpedienteTi(d, tiNombre),
      ok: (res) => `Expediente ${res.folio ?? ""} capturado`
        + (d.noDispositivo ? ` con el TAG ${d.noDispositivo} reservado` : "")
        + ". Falta el cobro en Administración para poder instalar.",
      after: alTerminar,
    });
  }

  // SC-025: archivo de importacion para ZKBioSecurity, generado en el navegador.
  async function descargarZk(tipo: "stock" | "padron", formato: "xlsx" | "csv") {
    if (exportando) return;
    setExportando(true); setError(null); setFeedback(null);
    try {
      const filas: FilaZk[] = tipo === "stock"
        ? tagsDisponibles.map((t) => filaStock(t.noDispositivo))
        : registros
            .filter((r) => r.estado === "activo" && r.noDispositivo)
            .map((r) => filaPadron(r, mapaZk?.get(r.noDispositivo!)))
            .filter((f): f is FilaZk => f !== null);
      if (filas.length === 0) {
        throw new Error(tipo === "stock"
          ? "No hay TAGs disponibles que exportar."
          : "No hay expedientes activos con TAG que exportar.");
      }
      const nombre = `zk-${tipo}-satag-${fechaArchivo()}.${formato}`;
      const blob = formato === "xlsx" ? await generarXlsxZk(filas) : generarCsvZk(filas);
      descargarArchivo(blob, nombre);
      setFeedback(`${nombre}: ${filas.length} fila${filas.length === 1 ? "" : "s"}. En ZK: Importar → Fila de Inicio 2 → «Actualizar el ID de usuario existente» = Sí.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el archivo.");
    } finally {
      setExportando(false);
      scrollAlAviso(bannersRef.current);
    }
  }
  async function cargarExportZk(archivo: File | null) {
    if (!archivo) { setMapaZk(null); setNombreExportZk(null); return; }
    try {
      const mapa = await leerExportZk(archivo);
      if (mapa.size === 0) throw new Error("El archivo no parece un export de ZK (Usuarios_….csv).");
      setMapaZk(mapa); setNombreExportZk(`${archivo.name} (${mapa.size} tarjetas)`);
      setError(null);
    } catch (e) {
      setMapaZk(null); setNombreExportZk(null);
      setError(e instanceof Error ? e.message : "No se pudo leer el export de ZK.");
    }
  }

  // Cierra una solicitud improcedente sin tocar el registro (motivo obligatorio).
  // Una nota ya vinculada se "cierra" con el mismo RPC una vez atendida.
  function confirmarDescartar(r: Registro, sol: Solicitud, motivo: string) {
    const esNota = sol.tipo === "nota";
    setConfirm({
      title: esNota ? "Cerrar nota" : "Descartar solicitud",
      message: esNota
        ? `Se cerrará la nota de ${r.folio} (${r.usuarioNombre}). Motivo: ${motivo}. ¿Continuar?`
        : `Se descartará la solicitud de ${sol.tipo === "actualizacion" ? "actualización" : "baja"} de ${r.folio} (${r.usuarioNombre}) sin aplicar ningún cambio. Motivo: ${motivo}. ¿Continuar?`,
      confirmLabel: esNota ? "Cerrar nota" : "Descartar", danger: true,
      action: () => descartarSolicitud(sol.id, motivo, tiNombre),
      ok: esNota ? `Nota cerrada (${r.folio}).` : `Solicitud descartada (${r.folio}).`,
    });
  }

  // SC-003: empata una nota con un expediente usando el tramite que TI CORROBORO
  // (puede ser el pedido u otro). Lleva a TI directo a la cola de ese tramite con
  // el expediente abierto (al ejecutarlo, la nota se cierra sola, bloque 38).
  function confirmarVincular(nota: Solicitud, r: Registro, tramite: TramiteSolicitado) {
    const destino: { modo: Modo; label: string } =
      tramite === "baja"
        ? { modo: "baja", label: "Dar de baja" }
        : { modo: "actualizar", label: "Actualizar datos" };
    const cambio = nota.tramiteSolicitado && nota.tramiteSolicitado !== tramite
      ? ` El cliente había pedido ${TRAMITE_LABEL[nota.tramiteSolicitado]}; se atenderá como ${destino.label}.`
      : "";
    setConfirm({
      title: "Vincular nota al expediente",
      message: `Se vinculará la nota de ${nota.solicitanteNombre ?? "—"} al expediente ${r.folio} (${r.usuarioNombre}) y aparecerá en «${destino.label}».${cambio} ¿Continuar?`,
      confirmLabel: "Vincular", danger: false,
      action: () => vincularNota(nota.id, r.id, tramite, tiNombre),
      ok: `Nota vinculada a ${r.folio}. Aparece en «${destino.label}».`,
      after: () => { setModo(destino.modo); setSelId(r.id); setQuery(""); },
    });
  }
  // Descarta una nota del buzon SIN vincularla (spam / no procede).
  function confirmarDescartarNota(nota: Solicitud, motivo: string) {
    setConfirm({
      title: "Descartar nota",
      message: `Se descartará la nota de ${nota.solicitanteNombre ?? "—"} sin vincularla a ningún expediente. Motivo: ${motivo}. ¿Continuar?`,
      confirmLabel: "Descartar", danger: true,
      action: () => descartarSolicitud(nota.id, motivo, tiNombre),
      ok: "Nota descartada.",
    });
  }

  const banners = (
    <div className="ti-banners" aria-live="polite" ref={bannersRef}>
      {feedback && <p className="catalog-feedback catalog-feedback--ok">{feedback}</p>}
      {error && <p className="submit-error">{error}</p>}
      {inventarioError && (
        <p className="submit-error">Inventario de TAGs: {inventarioError} Las demás funciones siguen operando.</p>
      )}
      {loadError && (
        <p className="submit-error">
          {loadError}{" "}
          <button type="button" className="link-action" onClick={() => refresh()}>Reintentar</button>
        </p>
      )}
    </div>
  );

  function formPara(accion: Accion, r: Registro) {
    if (accion === "instalar") {
      // El TAG reservado desde la captura (SC-026) va primero y prellenado.
      const reservado = tagReservadoDe.get(r.id) ?? null;
      const chips = [...(reservado ? [reservado] : []), ...tagsDisponibles.map((t) => t.noDispositivo)];
      return <FormInstalar r={r} estacionamientos={estacionamientos} disponibles={chips} tagReservado={reservado} busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre} onSubmit={(tag, claves, propio, apartadoNo) => confirmarInstalar(r, tag, claves, propio, apartadoNo)} />;
    }
    if (accion === "actualizar")
      return <FormActualizar r={r} marcas={marcas} colores={colores} estacionamientos={estacionamientos} busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre} onUsarApartado={() => confirmarUsarApartado(r)} onSubmit={(c, claves, res, mot) => confirmarActualizar(r, c, claves, res, mot)} />;
    return <FormBaja r={r} busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre} onSubmit={(m) => confirmarBaja(r, m)} />;
  }

  if (loading && registros.length === 0) return <Loader label="Cargando registros…" />;

  // Una carga fallida no equivale a una cola vacía. Evita mostrar contadores
  // verdes o "Todo al día" cuando todavía no conocemos el estado de la BD.
  if (loadError && registros.length === 0) {
    return (
      <div className="ti-banners">
        <p className="submit-error" role="alert">
          {loadError}{" "}
          <button type="button" className="link-action" onClick={() => refresh()}>Reintentar</button>
        </p>
      </div>
    );
  }

  return (
    <>
      {modo === "inicio" ? (
        <>
          <div className="ti-actions">
            <button type="button" className="ti-action" onClick={() => irA("instalar")}>
              <span><span className="ti-action__title">Instalar TAG</span><span className="ti-action__sub">En espera de instalación</span></span>
              <span className={`ti-action__count ti-action__count--${sem(porInstalar.length + instalarSinPago.length)}`}>{porInstalar.length + instalarSinPago.length}</span>
            </button>
            <button type="button" className="ti-action" onClick={() => irA("actualizar")}>
              <span><span className="ti-action__title">Actualizar datos</span><span className="ti-action__sub">Placas, vehículo o reposición de TAG</span></span>
              <span className={`ti-action__count ti-action__count--${sem(solicitanActualizar.length)}`}>{solicitanActualizar.length}</span>
            </button>
            <button type="button" className="ti-action" onClick={() => irA("baja")}>
              <span><span className="ti-action__title">Dar de baja</span><span className="ti-action__sub">Egresos y cancelaciones</span></span>
              <span className={`ti-action__count ti-action__count--${sem(solicitanBaja.length)}`}>{solicitanBaja.length}</span>
            </button>
            <button type="button" className="ti-action" onClick={() => irA("notas")}>
              <span><span className="ti-action__title">Notas sin expediente</span><span className="ti-action__sub">Buzón sin folio: vincular o descartar</span></span>
              <span className={`ti-action__count ti-action__count--${sem(notas.length)}`}>{notas.length}</span>
            </button>
            <button type="button" className="ti-action" onClick={() => irA("incompletos")}>
              <span><span className="ti-action__title">Expedientes incompletos</span><span className="ti-action__sub">Les falta algo para operar</span></span>
              <span className={`ti-action__count ti-action__count--${sem(incompletos.length)}`}>{incompletos.length}</span>
            </button>
            {/* SC-025: aquí el semáforo se invierte — tener disponibles es lo bueno. */}
            <button type="button" className="ti-action" onClick={() => irA("tags")}>
              <span><span className="ti-action__title">TAGs de la escuela</span><span className="ti-action__sub">Inventario, alta anticipada y export a ZK</span></span>
              <span className={`ti-action__count ti-action__count--${tagsDisponibles.length > 0 ? "ok" : "warn"}`}>{tagsDisponibles.length}</span>
            </button>
            {/* SC-026: el contador son los expedientes capturados con TAG reservado
                que todavia no se instalan. */}
            <button type="button" className="ti-action" onClick={() => irA("capturar")}>
              <span><span className="ti-action__title">Capturar hoja física</span><span className="ti-action__sub">Alta desde la hoja firmada, con TAG reservado</span></span>
              <span className={`ti-action__count ti-action__count--${tagReservadoDe.size > 0 ? "warn" : "ok"}`}>{tagReservadoDe.size}</span>
            </button>
          </div>

          <div className="panel">
            <p className="panel-title">Padrón completo ({padron.length})</p>
            <input className="input search" type="search" placeholder="Buscar por nombre, placa, No. de TAG o folio…"
              value={query} onChange={(e) => { setQuery(e.target.value); setMostrarTi(25); }} style={{ marginBottom: 10 }} />
            <div className="chip-row" style={{ marginBottom: 12 }}>
              {([["todos", "Todos"], ["pendiente", "Pendientes"], ["activo", "Activos"], ["baja", "Baja"]] as const).map(([k, label]) => (
                <button key={k} type="button" className={`select-chip ${filtroTi === k ? "on" : ""}`}
                  onClick={() => { setFiltroTi(k); setMostrarTi(25); }}>{label}</button>
              ))}
            </div>
            {banners}
            <div className="ti-cards">
              {padron.slice(0, mostrarTi).map((r) => (
                <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)}>
                  <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                  {r.estado === "baja" ? (
                    <p className="ti-hint">Registro dado de baja{r.fechaBaja ? ` el ${r.fechaBaja}` : ""}{r.motivoBaja ? ` — ${r.motivoBaja}` : ""}.</p>
                  ) : (
                    <>
                      <div className="ti-chips">
                        {r.estado === "pendiente" && !r.noDispositivo && r.pagos.length > 0 && (
                          <button type="button" className={`select-chip ${accionPadron === "instalar" ? "on" : ""}`}
                            onClick={() => setAccionPadron((a) => (a === "instalar" ? null : "instalar"))}>Instalar TAG</button>
                        )}
                        <button type="button" className={`select-chip ${accionPadron === "actualizar" ? "on" : ""}`}
                          onClick={() => setAccionPadron((a) => (a === "actualizar" ? null : "actualizar"))}>Actualizar datos</button>
                        <button type="button" className={`select-chip ${accionPadron === "baja" ? "on" : ""}`}
                          onClick={() => setAccionPadron((a) => (a === "baja" ? null : "baja"))}>Dar de baja</button>
                      </div>
                      {!r.noDispositivo && r.pagos.length === 0 && (
                        <p className="ti-hint">Sin pago registrado: el TAG se instala después del pago (Administración).</p>
                      )}
                      {accionPadron && formPara(accionPadron, r)}
                    </>
                  )}
                  {/* SC-008: cotejo presencial de la firma. Va al final del
                      expediente y sólo se carga si TI la pide. */}
                  <EvidenciaFirmaPanel registroId={r.id} />
                </TarjetaRegistro>
              ))}
              {padron.length === 0 && (
                <p className="ti-hint">{q || filtroTi !== "todos" ? "Sin resultados con esa búsqueda o filtro." : "Aún no hay registros en el padrón."}</p>
              )}
              {padron.length > mostrarTi && (
                <button type="button" className="ghost-action" style={{ alignSelf: "center" }}
                  onClick={() => setMostrarTi((m) => m + 25)}>
                  Mostrar {Math.min(25, padron.length - mostrarTi)} más (quedan {padron.length - mostrarTi})
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="ti-topbar">
            <button type="button" className="ti-back" onClick={() => irA("inicio")}>← Inicio</button>
            <h2>{modo === "instalar" ? "Instalar TAG" : modo === "actualizar" ? "Actualizar datos" : modo === "notas" ? "Notas sin expediente" : modo === "incompletos" ? "Expedientes incompletos" : modo === "tags" ? "TAGs de la escuela" : modo === "capturar" ? "Capturar hoja física" : "Dar de baja"}</h2>
          </div>
          {banners}

          {modo === "instalar" && (
            porInstalar.length === 0 && instalarSinPago.length === 0
              ? <p className="ti-empty">✓ No hay TAGs pendientes de instalar. Todo al día.</p>
              : (
                <>
                  {porInstalar.length > 0 && (
                    <div className="ti-cards">
                      {porInstalar.map((r) => (
                        <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)} espera={fechaEsperaInstalar(r)}>
                          <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                          {formPara("instalar", r)}
                          <EvidenciaFirmaPanel registroId={r.id} />
                        </TarjetaRegistro>
                      ))}
                    </div>
                  )}
                  {instalarSinPago.length > 0 && (
                    <>
                      <p className="ti-section-title" style={{ marginTop: porInstalar.length > 0 ? 18 : 0 }}>
                        Esperando pago ({instalarSinPago.length})
                      </p>
                      <div className="ti-cards ti-cards--muted">
                        {instalarSinPago.map((r) => (
                          <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)} espera={fechaEsperaInstalar(r)}>
                            <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                            <p className="ti-hint">Falta registrar el pago en Administración; el TAG se instala después del pago.</p>
                            <EvidenciaFirmaPanel registroId={r.id} />
                          </TarjetaRegistro>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )
          )}

          {(modo === "actualizar" || modo === "baja") && (
            <>
              {listaSolicitudes.length > 0 && (
                <>
                  <p className="ti-section-title">Con solicitud pendiente ({listaSolicitudes.length})</p>
                  <div className="ti-cards" style={{ marginBottom: 18 }}>
                    {listaSolicitudes.map((r) => (
                      <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)}
                        espera={fechaEsperaTramite(r, modo === "actualizar" ? "actualizacion" : "baja")}>
                        <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                        {formPara(modo, r)}
                        <EvidenciaFirmaPanel registroId={r.id} />
                      </TarjetaRegistro>
                    ))}
                  </div>
                </>
              )}
              <p className="ti-section-title">Atender a alguien más</p>
              <input className="input search" type="search" placeholder="Buscar por nombre, placa, No. de TAG o folio…"
                value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
              {q === "" ? (
                <p className="ti-hint">Busque el registro de la persona para {modo === "actualizar" ? "actualizar sus datos" : "darla de baja"}.</p>
              ) : (
                <div className="ti-cards">
                  {resultadosAccion.map((r) => (
                    <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)}>
                      <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                      {formPara(modo, r)}
                      <EvidenciaFirmaPanel registroId={r.id} />
                    </TarjetaRegistro>
                  ))}
                  {resultadosAccion.length === 0 && <p className="ti-hint">Sin resultados para «{query}».</p>}
                </div>
              )}
            </>
          )}

          {modo === "incompletos" && (
            <>
              <p className="ti-hint" style={{ marginBottom: 12 }}>
                Expedientes a los que les falta algo para operar, con el motivo. Es un reporte de
                sólo lectura: cada faltante se corrige donde vive su acción —«Actualizar datos» para
                placas, vehículo y estacionamiento; Administración para lo del cobro—.
              </p>
              <ListaIncompletos items={incompletos}
                vacio="No hay expedientes incompletos. El padrón está completo." />
            </>
          )}

          {modo === "notas" && (
            notas.length === 0
              ? <p className="ti-empty">✓ No hay notas sin expediente. Todo al día.</p>
              : (
                <>
                  <p className="ti-hint" style={{ marginBottom: 12 }}>
                    Notas del buzón público (sin folio). Búsquelas por nombre y vincúlelas al
                    expediente correcto, o descártelas si son spam.
                  </p>
                  <div className="ti-cards">
                    {notas.map((n) => (
                      <TarjetaNota key={n.id} nota={n} registros={registros} busy={busy}
                        onVincular={(r, tramite) => confirmarVincular(n, r, tramite)}
                        onDescartar={(m) => confirmarDescartarNota(n, m)} />
                    ))}
                  </div>
                </>
              )
          )}

          {modo === "tags" && (
            <>
              <p className="ti-hint" style={{ marginBottom: 12 }}>
                Dé de alta por adelantado los TAGs de la escuela (por ejemplo, el lote que llega
                el viernes). El día de instalación aparecen como disponibles y se eligen con un
                toque; al instalar quedan asignados a su expediente.
              </p>
              <FormAltaInventario busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre}
                onSubmit={(nums, alTerminar) => confirmarAltaInventario(nums, alTerminar)} />
              <p className="ti-section-title" style={{ marginTop: 18 }}>Disponibles ({tagsDisponibles.length})</p>
              {tagsDisponibles.length === 0 ? (
                <p className="ti-hint">No hay TAGs disponibles en el inventario. Dé de alta el siguiente lote arriba.</p>
              ) : (
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>No. de TAG</th><th>Dado de alta por</th><th></th></tr></thead>
                    <tbody>
                      {tagsDisponibles.map((t) => (
                        <tr key={t.noDispositivo}>
                          <td><strong>{t.noDispositivo}</strong></td>
                          <td>{t.dadoDeAltaPor}</td>
                          <td>
                            <button type="button" className="link-action" disabled={busy}
                              onClick={() => confirmarRetirarInventario(t.noDispositivo)}>Retirar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {tagsAsignados.length > 0 && (
                <>
                  <p className="ti-section-title" style={{ marginTop: 18 }}>Ya asignados ({tagsAsignados.length})</p>
                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>No. de TAG</th><th>Expediente</th></tr></thead>
                      <tbody>
                        {tagsAsignados.map((t) => {
                          const r = registros.find((x) => x.id === t.asignadoA);
                          return (
                            <tr key={t.noDispositivo}>
                              <td>{t.noDispositivo}</td>
                              <td>{r ? `${r.folio} — ${r.usuarioNombre}` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* SC-025: el archivo de importacion de ZK sale de aqui, sin
                  pasar por el sheet ni por la linea de comandos. */}
              <p className="ti-section-title" style={{ marginTop: 22 }}>Exportar a ZKBioSecurity</p>
              <div className="ti-form">
                <p className="ti-hint">
                  Descargue el archivo y en ZK use Personal → Usuarios → Importar: Fila de Inicio <strong>2</strong>,
                  «Actualizar el ID de usuario existente» = <strong>Sí</strong>. El ID de cada persona es su No. de TAG;
                  si las tarjetas ya existen en ZK con otro ID, cargue el export de ZK para conservarlo y que se actualicen
                  en vez de duplicarse.
                </p>
                <div className="field">
                  <span>Export de ZK (opcional): Usuarios_….csv descargado de ZK</span>
                  <input className="input" type="file" accept=".csv,.txt"
                    onChange={(e) => cargarExportZk(e.target.files?.[0] ?? null)} />
                  {nombreExportZk && <p className="hint">Se conservarán los IDs de {nombreExportZk}.</p>}
                </div>
                <div className="ti-chips">
                  <button type="button" className="primary-action" disabled={exportando || tagsDisponibles.length === 0}
                    onClick={() => descargarZk("stock", "xlsx")}>
                    Descargar plantilla ZK (TAGs disponibles: {tagsDisponibles.length})
                  </button>
                  <button type="button" className="primary-action" disabled={exportando || registros.every((r) => !(r.estado === "activo" && r.noDispositivo))}
                    onClick={() => descargarZk("padron", "xlsx")}>
                    Descargar padrón instalado para ZK
                  </button>
                </div>
                <p className="ti-hint">
                  Los TAGs disponibles salen como «DISPONIBLE / STOCK SATAG» en Padres de familia; al instalarse, el padrón
                  actualiza la misma tarjeta con la persona y su placa (en Celular). Respaldo en el formato de export de ZK:{" "}
                  <button type="button" className="link-action" disabled={exportando} onClick={() => descargarZk("stock", "csv")}>disponibles .csv</button>
                  {" · "}
                  <button type="button" className="link-action" disabled={exportando} onClick={() => descargarZk("padron", "csv")}>padrón .csv</button>
                </p>
              </div>
            </>
          )}

          {modo === "capturar" && (
            <>
              <p className="ti-hint" style={{ marginBottom: 12 }}>
                Capture el expediente tal como viene en la hoja firmada: toque el TAG que se instaló (o se va a
                instalar) y siga el orden de la hoja. El pago lo registra Administración; después, en «Instalar TAG»,
                el número ya aparece reservado.
              </p>
              <FormCapturaHoja disponibles={tagsDisponibles.map((t) => t.noDispositivo)} estacionamientos={estacionamientos}
                marcas={marcas} colores={colores} busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre}
                onSubmit={(d, alTerminar) => confirmarCaptura(d, alTerminar)} />
            </>
          )}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); run(c.action, c.ok, c.after); }}
        />
      )}
    </>
  );
}

// ---- Formularios de acción ----
function FormInstalar({ r, estacionamientos, disponibles, tagReservado, busy, tiNombre, onTiNombre, onSubmit }: {
  r: Registro; estacionamientos: string[] | null | undefined; disponibles: string[]; tagReservado: string | null;
  busy: boolean; tiNombre: string;
  onTiNombre: (v: string) => void;
  onSubmit: (tag: string, claves: string[], propio: boolean, apartadoNo: string) => void;
}) {
  // SC-026: si la captura dejo un TAG reservado, viene prellenado.
  const [tag, setTag] = useState(tagReservado ?? "");
  // TI define el estacionamiento al instalar (SC-002); al menos uno: un TAG
  // sin acceso a ningún estacionamiento no sirve de nada.
  const [claves, setClaves] = useState<string[]>(r.estacionamientos);
  // CC-01: si la familia trae su propio TAG, el que se instala es el propio y la
  // escuela aparta el suyo. El número apartado es opcional en el momento.
  const [propio, setPropio] = useState(r.procedenciaTag === "propio");
  const [apartadoNo, setApartadoNo] = useState(r.tagApartadoNo ?? "");
  const valido = TAG_RE.test(tag);
  const apartadoLleno = propio && apartadoNo.trim() !== "";
  const apartadoValido = !apartadoLleno || (TAG_RE.test(apartadoNo) && apartadoNo !== tag);
  const toggle = (c: string) =>
    setClaves((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  return (
    <div className="ti-form">
      <div className="field">
        <span>Estacionamiento (acceso del TAG)</span>
        {estacionamientos === undefined ? (
          <p className="ti-hint">Cargando el catálogo de estacionamientos…</p>
        ) : estacionamientos === null ? (
          // D-09: si el catálogo no cargó, se dice tal cual. Nada de claves de
          // respaldo: parecerían el catálogo real y el acceso asignado sería inválido.
          // El mensaje además tiene que decir la verdad sobre lo que va a pasar al
          // pulsar el botón. Las claves que trae el expediente vienen de la base,
          // no del catálogo, así que instalar con ellas es correcto y bloquear el
          // envío sería peor: dejaría a TI sin poder instalar un acceso que ya
          // estaba bien asignado. Lo que no se puede es ASIGNAR uno distinto.
          claves.length > 0 ? (
            <p className="field-error" role="alert">
              No se pudo cargar el catálogo de estacionamientos. Se instalará con la asignación que
              ya tiene el expediente ({claves.join(" + ")}); recargue la página si necesita cambiarla.
            </p>
          ) : (
            <p className="field-error" role="alert">
              No se pudo cargar el catálogo de estacionamientos y este expediente no tiene ninguno
              asignado. Recargue la página para poder asignar el acceso.
            </p>
          )
        ) : (
          <>
            <div className="chip-row">
              {estacionamientos.map((c) => (
                <button key={c} type="button" className={`select-chip ${claves.includes(c) ? "on" : ""}`} onClick={() => toggle(c)}>{c}</button>
              ))}
            </div>
            {claves.length === 0 && <p className="field-error">Elija al menos un estacionamiento.</p>}
          </>
        )}
      </div>
      <div className="field">
        <span>No. de TAG (6–11 dígitos){propio ? " — el propio de la familia" : ""}</span>
        {/* SC-025: los TAGs dados de alta por adelantado se eligen con un toque.
            Con TAG propio no aplican: el que se instala es el de la familia. */}
        {!propio && disponibles.length > 0 && (
          <>
            <div className="chip-row">
              {disponibles.slice(0, 12).map((n) => (
                <button key={n} type="button" className={`select-chip ${tag === n ? "on" : ""}`}
                  onClick={() => setTag((cur) => (cur === n ? "" : n))}>{n}</button>
              ))}
            </div>
            <p className="ti-hint">
              {tagReservado ? `El TAG ${tagReservado} quedó reservado para este expediente desde la captura. ` : ""}
              Disponibles del inventario: toque uno para usarlo, o capture otro número abajo.
              {disponibles.length > 12 ? ` Hay ${disponibles.length - 12} más en «TAGs de la escuela».` : ""}
            </p>
          </>
        )}
        <input className={`input ${tag !== "" && !valido ? "invalid" : ""}`} inputMode="numeric" autoComplete="off"
          maxLength={11} placeholder="Ej. 9426780" value={tag}
          onChange={(e) => setTag(e.target.value.replace(/[^0-9]/g, ""))} />
        {tag !== "" && !valido && <p className="field-error">Lleva {tag.length} dígito{tag.length === 1 ? "" : "s"}; deben ser de 6 a 11.</p>}
      </div>
      <label className="check">
        <input type="checkbox" checked={propio} onChange={(e) => setPropio(e.target.checked)} />
        <span>La familia trae su propio TAG (se aparta el de la escuela)</span>
      </label>
      {propio && (
        <div className="field">
          <span>No. del TAG apartado (opcional, 6–11 dígitos)</span>
          {/* SC-025: el TAG que se aparta es de la escuela, así que aquí sí se
              ofrecen los disponibles del inventario. */}
          {disponibles.length > 0 && (
            <div className="chip-row">
              {disponibles.slice(0, 12).map((n) => (
                <button key={n} type="button" className={`select-chip ${apartadoNo === n ? "on" : ""}`}
                  onClick={() => setApartadoNo((cur) => (cur === n ? "" : n))}>{n}</button>
              ))}
            </div>
          )}
          <input className={`input ${apartadoLleno && !apartadoValido ? "invalid" : ""}`} inputMode="numeric" autoComplete="off"
            maxLength={11} placeholder="TAG de la escuela reservado" value={apartadoNo}
            onChange={(e) => setApartadoNo(e.target.value.replace(/[^0-9]/g, ""))} />
          {apartadoLleno && !TAG_RE.test(apartadoNo) && <p className="field-error">Lleva {apartadoNo.length} dígito{apartadoNo.length === 1 ? "" : "s"}; deben ser de 6 a 11.</p>}
          {apartadoLleno && TAG_RE.test(apartadoNo) && apartadoNo === tag && <p className="field-error">El TAG apartado no puede ser el mismo que el que se instala.</p>}
          <p className="ti-hint">Queda reservado, sin instalar, para una reposición futura.</p>
        </div>
      )}
      <div className="field"><span>Instalado por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Su nombre" /></div>
      <button type="button" className="primary-action" disabled={busy || !valido || claves.length === 0 || !apartadoValido} onClick={() => onSubmit(tag, claves, propio, apartadoNo)}>
        {valido ? `Instalar y activar TAG ${tag}` : "Instalar y activar"}
      </button>
    </div>
  );
}

function FormActualizar({ r, marcas, colores, estacionamientos, busy, tiNombre, onTiNombre, onUsarApartado, onSubmit }: {
  r: Registro; marcas: string[]; colores: string[]; estacionamientos: string[] | null | undefined; busy: boolean;
  tiNombre: string; onTiNombre: (v: string) => void;
  onUsarApartado: () => void;
  onSubmit: (cambios: CambiosRegistro, claves: string[] | null, resumen: string, motivo: string) => void;
}) {
  const [tag, setTag] = useState(r.noDispositivo ?? "");
  const [sinPlacas, setSinPlacas] = useState(r.sinPlacas);
  const [placas, setPlacas] = useState(r.placas ?? "");
  const [marca, setMarca] = useState(r.marca);
  const [modelo, setModelo] = useState(r.modelo);
  const [color, setColor] = useState(r.color);
  // CC-01: TI puede corregir propio/escuela (el titular solo lo declara en el alta).
  const [procedencia, setProcedencia] = useState<ProcedenciaTag>(r.procedenciaTag);
  const [claves, setClaves] = useState<string[]>(r.estacionamientos);
  const [motivo, setMotivo] = useState("");

  const tieneTag = r.noDispositivo !== null;
  const tagCambia = tieneTag && tag !== r.noDispositivo;
  const tagValido = !tieneTag || TAG_RE.test(tag);
  const placasFinal = sinPlacas ? null : (placas.trim().toUpperCase() || null);
  const placasValidas = sinPlacas || placasFinal !== null;
  // Aquí sí se permite dejarlo vacío (corregir una asignación equivocada);
  // al instalar es donde se exige al menos uno.
  const estCambia = !mismaAsignacion(claves, r.estacionamientos);
  const toggleEst = (c: string) =>
    setClaves((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  const cambios: CambiosRegistro = {};
  const resumen: string[] = [];
  if (tagCambia && tagValido) { cambios.noDispositivo = tag; resumen.push(`TAG ${r.noDispositivo} → ${tag} (reposición; el anterior queda inactivo)`); }
  if (placasFinal !== r.placas || sinPlacas !== r.sinPlacas) { cambios.placas = placasFinal; cambios.sinPlacas = sinPlacas; resumen.push(`placas ${r.placas ?? "sin placas"} → ${placasFinal ?? "sin placas"}`); }
  if (marca !== r.marca) { cambios.marca = marca; resumen.push(`marca ${r.marca} → ${marca}`); }
  if (modelo.trim() && modelo.trim() !== r.modelo) { cambios.modelo = modelo.trim(); resumen.push(`modelo ${r.modelo} → ${modelo.trim()}`); }
  if (color !== r.color) { cambios.color = color; resumen.push(`color ${r.color} → ${color}`); }
  if (procedencia !== r.procedenciaTag) { cambios.procedenciaTag = procedencia; resumen.push(`procedencia ${r.procedenciaTag} → ${procedencia}`); }
  if (estCambia) resumen.push(`estacionamiento ${r.estacionamientos.join(" + ") || "sin asignar"} → ${claves.join(" + ") || "sin asignar"}`);
  const hayCambios = resumen.length > 0;

  return (
    <div className="ti-form">
      {r.tagApartado && r.tagApartadoNo && (
        <div className="notice" style={{ marginBottom: 4 }}>
          <strong>Reinstalación con el TAG apartado.</strong> Este registro tiene reservado el TAG {r.tagApartadoNo}.
          Si el TAG actual ({r.noDispositivo ?? "—"}) se dañó o se perdió, actívelo: el apartado queda en uso, la
          procedencia pasa a escuela y el TAG anterior queda inactivo.
          <div className="ti-chips" style={{ marginTop: 8 }}>
            <button type="button" className="primary-action" disabled={busy} onClick={onUsarApartado}>
              Usar el TAG apartado {r.tagApartadoNo}
            </button>
          </div>
        </div>
      )}
      {tieneTag ? (
        <div className="field">
          <span>No. de TAG (cambiarlo registra una reposición)</span>
          <input className={`input ${!tagValido ? "invalid" : ""}`} inputMode="numeric" autoComplete="off" maxLength={11}
            value={tag} onChange={(e) => setTag(e.target.value.replace(/[^0-9]/g, ""))} />
          {!tagValido && <p className="field-error">El No. de TAG debe tener de 6 a 11 dígitos.</p>}
          {tagCambia && tagValido && <p className="hint">El TAG {r.noDispositivo} quedará inactivo.</p>}
        </div>
      ) : (
        <p className="ti-hint">Este registro aún no tiene TAG; el número se captura desde «Instalar TAG».</p>
      )}
      <div className="grid-2">
        <div className="field">
          <span>Placas</span>
          <input className={`input ${!placasValidas ? "invalid" : ""}`} value={placas} disabled={sinPlacas}
            onChange={(e) => setPlacas(e.target.value.toUpperCase())} placeholder="Ej. UAB1234" />
        </div>
        <label className="check ti-check-placas">
          <input type="checkbox" checked={sinPlacas} onChange={(e) => setSinPlacas(e.target.checked)} />
          <span>Sin placas (permiso/nuevo)</span>
        </label>
      </div>
      <div className="grid-2">
        <div className="field">
          <span>Marca</span>
          <select className="select" value={marca} onChange={(e) => setMarca(e.target.value)}>
            {[...new Set([r.marca, ...marcas])].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="field"><span>Modelo</span><input className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} /></div>
      </div>
      <div className="grid-2">
        <div className="field">
          <span>Color</span>
          <select className="select" value={color} onChange={(e) => setColor(e.target.value)}>
            {[...new Set([r.color, ...colores])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field"><span>Motivo (opcional)</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. placas nuevas, TAG dañado" /></div>
      </div>
      <div className="field">
        <span>Procedencia del TAG</span>
        <select className="select" value={procedencia} onChange={(e) => setProcedencia(e.target.value as ProcedenciaTag)}>
          <option value="escuela">Escuela</option>
          <option value="propio">Propio (la familia trae su TAG)</option>
        </select>
        {r.tagApartado && procedencia === "escuela" && (
          <p className="field-error">Este registro tiene un TAG apartado ({r.tagApartadoNo}). Para pasar a escuela, use «Usar TAG apartado» desde el expediente.</p>
        )}
      </div>
      <div className="field">
        <span>Estacionamiento (acceso del TAG)</span>
        {estacionamientos === undefined ? (
          // Todavía cargando: la asignación actual sigue intacta mientras tanto.
          <p className="ti-hint">
            Cargando el catálogo de estacionamientos… Asignación actual:{" "}
            {r.estacionamientos.join(" + ") || "sin asignar"}.
          </p>
        ) : estacionamientos === null ? (
          // D-09: sin catálogo no se puede MODIFICAR la asignación; la actual
          // (que viene del registro, no del catálogo) se conserva tal cual.
          <p className="field-error" role="alert">
            No se pudo cargar el catálogo de estacionamientos. Se conserva la asignación actual
            ({r.estacionamientos.join(" + ") || "sin asignar"}); recargue la página para poder cambiarla.
          </p>
        ) : (
          <div className="chip-row">
            {estacionamientos.map((c) => (
              <button key={c} type="button" className={`select-chip ${claves.includes(c) ? "on" : ""}`} onClick={() => toggleEst(c)}>{c}</button>
            ))}
          </div>
        )}
      </div>
      <div className="field"><span>Atendido por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Su nombre" /></div>
      <button type="button" className="primary-action"
        disabled={busy || !hayCambios || !tagValido || !placasValidas || (r.tagApartado && procedencia === "escuela")}
        onClick={() => onSubmit(cambios, estCambia ? claves : null, resumen.join("; "), motivo)}>
        Guardar cambios
      </button>
      {!hayCambios && <p className="hint" style={{ marginTop: 8 }}>Modifique algún dato para poder guardar.</p>}
    </div>
  );
}

function FormBaja({ r, busy, tiNombre, onTiNombre, onSubmit }: {
  r: Registro; busy: boolean; tiNombre: string; onTiNombre: (v: string) => void; onSubmit: (motivo: string) => void;
}) {
  // Si hay una peticion de baja pendiente (solicitud de folio o nota vinculada
  // que pidio baja), su detalle prellena el motivo.
  const [motivo, setMotivo] = useState(() =>
    r.solicitudes.find((s) => !s.atendida &&
      (s.tipo === "baja" || (s.tipo === "nota" && s.tramiteSolicitado === "baja")))?.detalle ?? "");
  return (
    <div className="ti-form">
      <div className="field"><span>Motivo de baja</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. egreso, cambio de vehículo" /></div>
      <div className="field"><span>Atendido por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Su nombre" /></div>
      <button type="button" className="primary-action btn-danger" disabled={busy || !motivo.trim()} onClick={() => onSubmit(motivo)}>
        Dar de baja
      </button>
    </div>
  );
}

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// SC-026: captura en sitio desde la hoja fisica firmada. El orden de los campos
// es el de la hoja (titular -> marca/modelo -> color -> placas) para transcribir
// sin brincar; al tocar un TAG disponible el foco pasa solo al nombre del
// titular. "Sin placas" limpia y deshabilita las placas con un toque.
function FormCapturaHoja({ disponibles, estacionamientos, marcas, colores, busy, tiNombre, onTiNombre, onSubmit }: {
  disponibles: string[]; estacionamientos: string[] | null | undefined; marcas: string[]; colores: string[];
  busy: boolean; tiNombre: string; onTiNombre: (v: string) => void;
  onSubmit: (datos: DatosCapturaTi, alTerminar: () => void) => void;
}) {
  const refNombres = useRef<HTMLInputElement>(null);
  const [tag, setTag] = useState("");
  const [nombres, setNombres] = useState("");
  const [paterno, setPaterno] = useState("");
  const [materno, setMaterno] = useState("");
  const [tipo, setTipo] = useState<TipoUsuario>("padres");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [color, setColor] = useState("");
  const [placas, setPlacas] = useState("");
  const [sinPlacas, setSinPlacas] = useState(false);
  // Sin catalogo no se inventan claves (D-09): se captura sin estacionamiento y
  // se asigna al instalar.
  const [claves, setClaves] = useState<string[] | null>(null);
  const [conGestionante, setConGestionante] = useState(false);
  const [gNombres, setGNombres] = useState("");
  const [gPaterno, setGPaterno] = useState("");
  const [gMaterno, setGMaterno] = useState("");
  const [gRelacion, setGRelacion] = useState<"padre" | "madre" | "tutor" | "otro">("otro");
  const [fechaHoja, setFechaHoja] = useState(hoyIso());
  const [obs, setObs] = useState("");

  const clavesEfectivas = claves ?? (Array.isArray(estacionamientos) ? estacionamientos : []);
  const toggleClave = (c: string) =>
    setClaves((clavesEfectivas.includes(c) ? clavesEfectivas.filter((x) => x !== c) : [...clavesEfectivas, c]));

  const placasNorm = placas.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const faltan: string[] = [];
  if (!nombres.trim()) faltan.push("nombre del titular");
  if (!paterno.trim()) faltan.push("apellido paterno");
  if (!marca.trim()) faltan.push("marca");
  if (!modelo.trim()) faltan.push("modelo");
  if (!color.trim()) faltan.push("color");
  if (!sinPlacas && placasNorm === "") faltan.push("placas (o marque «Sin placas»)");
  if (conGestionante && gNombres.trim() && !gPaterno.trim()) faltan.push("apellido paterno de quien gestiona");
  const listo = faltan.length === 0;

  function elegirTag(n: string) {
    setTag((cur) => (cur === n ? "" : n));
    refNombres.current?.focus();
  }
  function limpiar() {
    setTag(""); setNombres(""); setPaterno(""); setMaterno(""); setTipo("padres");
    setMarca(""); setModelo(""); setColor(""); setPlacas(""); setSinPlacas(false);
    setClaves(null); setConGestionante(false); setGNombres(""); setGPaterno(""); setGMaterno(""); setGRelacion("otro");
    setObs("");
  }
  function enviar() {
    onSubmit({
      usuarioNombres: nombres, usuarioApellidoPaterno: paterno, usuarioApellidoMaterno: materno.trim() || null,
      tipoUsuario: tipo, marca, modelo, color,
      placas: sinPlacas ? null : placasNorm, sinPlacas,
      claves: clavesEfectivas, noDispositivo: tag || null,
      gestionanteNombres: conGestionante ? (gNombres.trim() || null) : null,
      gestionanteApellidoPaterno: conGestionante ? (gPaterno.trim() || null) : null,
      gestionanteApellidoMaterno: conGestionante ? (gMaterno.trim() || null) : null,
      gestionanteRelacion: conGestionante && gNombres.trim() ? gRelacion : null,
      fechaHoja: fechaHoja || null,
      observaciones: obs.trim() || null,
    }, limpiar);
  }

  return (
    <div className="ti-form">
      <div className="field">
        <span>No. de TAG — opcional: tóquelo solo si la hoja ya trae el TAG instalado; si no, se elige al instalar</span>
        {disponibles.length === 0 ? (
          <p className="ti-hint">No hay TAGs disponibles en el inventario. Capture el expediente sin TAG: el número se elige en «Instalar TAG».</p>
        ) : (
          <div className="chip-row">
            {disponibles.map((n) => (
              <button key={n} type="button" className={`select-chip ${tag === n ? "on" : ""}`} onClick={() => elegirTag(n)}>{n}</button>
            ))}
          </div>
        )}
        {tag && <p className="hint">TAG {tag} quedará reservado para este expediente (sale de los disponibles) y aparecerá prellenado al instalar.</p>}
      </div>

      <p className="ti-section-title">Titular (como aparece en la hoja)</p>
      <div className="field"><span>Nombre(s)</span><input ref={refNombres} className="input" value={nombres} onChange={(e) => setNombres(e.target.value)} autoComplete="off" placeholder="Ej. María del Pilar" /></div>
      <div className="grid-2">
        <div className="field"><span>Apellido paterno</span><input className="input" value={paterno} onChange={(e) => setPaterno(e.target.value)} autoComplete="off" /></div>
        <div className="field"><span>Apellido materno (opcional)</span><input className="input" value={materno} onChange={(e) => setMaterno(e.target.value)} autoComplete="off" /></div>
      </div>
      <div className="field">
        <span>Tipo de usuario</span>
        <div className="chip-row">
          {TIPOS_USUARIO.map((t) => (
            <button key={t} type="button" className={`select-chip ${tipo === t ? "on" : ""}`} onClick={() => setTipo(t)}>{TIPO_USUARIO_LABEL[t]}</button>
          ))}
        </div>
      </div>

      <p className="ti-section-title">Vehículo</p>
      <div className="grid-2">
        <div className="field">
          <span>Marca</span>
          <input className="input" list="ti-captura-marcas" value={marca} onChange={(e) => setMarca(e.target.value)} autoComplete="off" placeholder="Ej. Nissan" />
          <datalist id="ti-captura-marcas">{marcas.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div className="field"><span>Modelo</span><input className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} autoComplete="off" placeholder="Ej. X-Trail 2021" /></div>
      </div>
      <div className="grid-2">
        <div className="field">
          <span>Color</span>
          <input className="input" list="ti-captura-colores" value={color} onChange={(e) => setColor(e.target.value)} autoComplete="off" placeholder="Ej. Gris" />
          <datalist id="ti-captura-colores">{colores.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="field">
          <span>Placas</span>
          <input className={`input ${!sinPlacas && placas !== "" && placasNorm === "" ? "invalid" : ""}`} value={placas} disabled={sinPlacas}
            onChange={(e) => setPlacas(e.target.value.toUpperCase())} autoComplete="off" placeholder={sinPlacas ? "Sin placas" : "Ej. ULT413K"} />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={sinPlacas} onChange={(e) => { setSinPlacas(e.target.checked); if (e.target.checked) setPlacas(""); }} />
        <span>Sin placas (estrena auto o no recuerda la matrícula): se captura como «sin registrar»</span>
      </label>
      <div className="field">
        <span>Estacionamiento (acceso del TAG)</span>
        {estacionamientos === undefined ? (
          <p className="ti-hint">Cargando el catálogo de estacionamientos…</p>
        ) : estacionamientos === null ? (
          <p className="ti-hint">No se pudo cargar el catálogo; el acceso se asigna al instalar. Recargue la página si necesita asignarlo ahora.</p>
        ) : (
          <div className="chip-row">
            {estacionamientos.map((c) => (
              <button key={c} type="button" className={`select-chip ${clavesEfectivas.includes(c) ? "on" : ""}`} onClick={() => toggleClave(c)}>{c}</button>
            ))}
          </div>
        )}
      </div>

      <label className="check">
        <input type="checkbox" checked={conGestionante} onChange={(e) => setConGestionante(e.target.checked)} />
        <span>La hoja la firmó otra persona (quien gestiona no es el titular)</span>
      </label>
      {conGestionante && (
        <>
          <div className="grid-2">
            <div className="field"><span>Nombre(s) de quien gestiona</span><input className="input" value={gNombres} onChange={(e) => setGNombres(e.target.value)} autoComplete="off" /></div>
            <div className="field"><span>Apellido paterno</span><input className="input" value={gPaterno} onChange={(e) => setGPaterno(e.target.value)} autoComplete="off" /></div>
          </div>
          <div className="grid-2">
            <div className="field"><span>Apellido materno (opcional)</span><input className="input" value={gMaterno} onChange={(e) => setGMaterno(e.target.value)} autoComplete="off" /></div>
            <div className="field">
              <span>Relación con el titular</span>
              <select className="select" value={gRelacion} onChange={(e) => setGRelacion(e.target.value as "padre" | "madre" | "tutor" | "otro")}>
                <option value="padre">Padre</option><option value="madre">Madre</option><option value="tutor">Tutor</option><option value="otro">Otro</option>
              </select>
            </div>
          </div>
        </>
      )}

      <div className="grid-2">
        <div className="field"><span>Fecha de la hoja</span><input className="input" type="date" value={fechaHoja} onChange={(e) => setFechaHoja(e.target.value)} /></div>
        <div className="field"><span>Observaciones (opcional)</span><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej. modelo ilegible en la hoja" /></div>
      </div>
      <div className="field"><span>Capturado por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Su nombre" /></div>
      {!listo && <p className="hint">Falta: {faltan.join(", ")}.</p>}
      <button type="button" className="primary-action" disabled={busy || !listo} onClick={enviar}>
        {tag ? `Capturar expediente y reservar TAG ${tag}` : "Capturar expediente"}
      </button>
    </div>
  );
}

// SC-025: alta anticipada de un lote de TAGs al inventario. Acepta los numeros
// pegados de corrido (uno por linea, o separados por comas o espacios); valida
// en vivo y manda el lote completo al RPC, que rechaza todo-o-nada si algun
// numero ya existe en el inventario, el padron o un apartado.
function FormAltaInventario({ busy, tiNombre, onTiNombre, onSubmit }: {
  busy: boolean; tiNombre: string; onTiNombre: (v: string) => void;
  onSubmit: (numeros: string[], alTerminar: () => void) => void;
}) {
  const [texto, setTexto] = useState("");
  const numeros = useMemo(
    () => [...new Set(texto.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))],
    [texto]);
  const invalidos = numeros.filter((n) => !TAG_RE.test(n));
  const listo = numeros.length > 0 && invalidos.length === 0;
  return (
    <div className="ti-form">
      <div className="field">
        <span>Números de TAG (uno por línea, o separados por comas o espacios)</span>
        <textarea className="input" rows={4} inputMode="numeric" autoComplete="off"
          placeholder={"Ej.\n13078110\n13078111\n13078112"} value={texto}
          onChange={(e) => setTexto(e.target.value)} />
        {listo && (
          <p className="hint">{numeros.length} número{numeros.length === 1 ? "" : "s"} listo{numeros.length === 1 ? "" : "s"} para dar de alta.</p>
        )}
        {invalidos.length > 0 && (
          <p className="field-error">Estos no parecen números de TAG (deben ser de 6 a 11 dígitos): {invalidos.join(", ")}</p>
        )}
      </div>
      <div className="field"><span>Dado de alta por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Su nombre" /></div>
      <button type="button" className="primary-action" disabled={busy || !listo}
        onClick={() => onSubmit(numeros, () => setTexto(""))}>
        {listo ? `Dar de alta ${numeros.length} TAG${numeros.length === 1 ? "" : "s"} al inventario` : "Dar de alta al inventario"}
      </button>
    </div>
  );
}

// SC-003: una nota del buzon sin vincular. Muestra quien la dejo y que necesita,
// y ofrece las dos salidas de TI: vincularla al expediente correcto (buscandolo
// por nombre) o descartarla si es spam. Recolectar es publico; buscar es privado:
// aqui es donde TI hace la busqueda que el publico nunca ve.
function TarjetaNota({ nota, registros, busy, onVincular, onDescartar }: {
  nota: Solicitud;
  registros: Registro[];
  busy: boolean;
  onVincular: (r: Registro, tramite: TramiteSolicitado) => void;
  onDescartar: (motivo: string) => void;
}) {
  const [accion, setAccion] = useState<null | "vincular" | "descartar">(null);
  const [q, setQ] = useState("");
  const [motivo, setMotivo] = useState("");
  // Paso 2 de vincular: expediente elegido + tramite que TI corrobora (arranca en
  // el que pidio el cliente y TI lo confirma o lo cambia).
  const [elegido, setElegido] = useState<Registro | null>(null);
  const [tramite, setTramite] = useState<TramiteSolicitado>(nota.tramiteSolicitado ?? "actualizacion");
  const query = q.trim().toLowerCase();
  // No se puede vincular a un registro dado de baja. Tope de 8 para no volcar
  // el padron entero dentro de la tarjeta.
  const resultados = query
    ? registros.filter((r) => r.estado !== "baja" &&
        [r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.folio, r.marca, r.modelo]
          .join(" ").toLowerCase().includes(query)).slice(0, 8)
    : [];
  function elegir(r: Registro) {
    setElegido(r);
    setTramite(nota.tramiteSolicitado ?? "actualizacion");
  }
  return (
    <div className="ti-card is-open">
      <div className="ti-card__body">
        <div className="detail-grid" style={{ marginBottom: 12 }}>
          <div><div className="k">Solicitante</div><div className="v">{nota.solicitanteNombre ?? "—"}</div></div>
          <div><div className="k">Quién solicita</div><div className="v">{nota.solicitanteRol ? ROL_LABEL[nota.solicitanteRol] : "—"}</div></div>
          <div style={{ gridColumn: "1 / -1" }}><div className="k">Pidió</div><div className="v"><strong>{nota.tramiteSolicitado ? TRAMITE_LABEL[nota.tramiteSolicitado] : "—"}</strong></div></div>
          {nota.alumnoNombre && <div><div className="k">Alumno</div><div className="v">{nota.alumnoNombre}</div></div>}
          {nota.alumnoGrado && <div><div className="k">Grado</div><div className="v">{nota.alumnoGrado}</div></div>}
          {nota.vehiculoDesc && <div><div className="k">Coche</div><div className="v">{nota.vehiculoDesc}</div></div>}
          <div><div className="k">Fecha</div><div className="v">{nota.fecha} <BadgeEspera fecha={nota.fecha} /></div></div>
          <div style={{ gridColumn: "1 / -1" }}><div className="k">Qué necesita</div><div className="v">{nota.detalle}</div></div>
        </div>

        <div className="ti-chips">
          <button type="button" className={`select-chip ${accion === "vincular" ? "on" : ""}`}
            onClick={() => { setAccion((a) => (a === "vincular" ? null : "vincular")); setElegido(null); }}>Vincular a un expediente</button>
          <button type="button" className={`select-chip ${accion === "descartar" ? "on" : ""}`}
            onClick={() => setAccion((a) => (a === "descartar" ? null : "descartar"))}>Descartar</button>
        </div>

        {accion === "vincular" && !elegido && (
          <div className="ti-form" style={{ marginTop: 12 }}>
            <div className="field">
              <span>Busque el expediente por nombre, placa o folio</span>
              <input className="input search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre del alumno o del titular…" />
            </div>
            {query === "" ? (
              <p className="ti-hint">Escriba para buscar el expediente al que corresponde esta nota.</p>
            ) : resultados.length === 0 ? (
              <p className="ti-hint">Sin resultados para «{q}».</p>
            ) : (
              <div className="ti-cards">
                {resultados.map((r) => (
                  <div key={r.id} className="ti-card is-open">
                    <div className="ti-card__body">
                      <span className="ti-card__veh">{r.usuarioNombre}</span>
                      <span className="ti-card__sub">{r.marca} {r.modelo} · {r.color} · {r.placas ?? (r.sinPlacas ? "sin placas" : "—")}</span>
                      <span className="ti-card__meta">{r.folio}{r.noDispositivo ? ` · TAG ${r.noDispositivo}` : " · sin TAG"}</span>
                      <button type="button" className="primary-action" disabled={busy} style={{ marginTop: 10 }}
                        onClick={() => elegir(r)}>Elegir este expediente</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {accion === "vincular" && elegido && (
          <div className="ti-form" style={{ marginTop: 12 }}>
            <p className="ti-hint" style={{ marginBottom: 4 }}>
              Expediente: <strong>{elegido.folio}</strong> — {elegido.usuarioNombre}{" "}
              <button type="button" className="link-action" onClick={() => setElegido(null)}>cambiar</button>
            </p>
            <div className="field">
              <span>El cliente pidió <strong>{nota.tramiteSolicitado ? TRAMITE_LABEL[nota.tramiteSolicitado] : "—"}</strong>. ¿Qué trámite corresponde?</span>
              <div className="chip-row">
                {TRAMITES_TI.map((t) => (
                  <button key={t} type="button" className={`select-chip ${tramite === t ? "on" : ""}`}
                    onClick={() => setTramite(t)}>{TRAMITE_LABEL[t]}</button>
                ))}
              </div>
            </div>
            <button type="button" className="primary-action" disabled={busy}
              onClick={() => onVincular(elegido, tramite)}>Vincular como {TRAMITE_LABEL[tramite]}</button>
          </div>
        )}

        {accion === "descartar" && (
          <div className="ti-form" style={{ marginTop: 12 }}>
            <div className="field">
              <span>¿Por qué se descarta?</span>
              <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. spam, datos falsos, no procede" />
            </div>
            <div className="ti-chips">
              <button type="button" className="select-chip" disabled={busy || !motivo.trim()}
                onClick={() => onDescartar(motivo.trim())}>Descartar nota</button>
              <button type="button" className="link-action" disabled={busy}
                onClick={() => { setAccion(null); setMotivo(""); }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
