"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CambiosRegistro, ProcedenciaTag, Registro, RegistroIncompleto, Solicitud, TagInventario, TramiteSolicitado } from "@/lib/mock/types";
import { getMarcas, getModelos, getColores } from "@/lib/supabase/api";
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
  listMapaZk,
  cargarMapaZk,
  type AccionResultado,
} from "@/lib/supabase/apiPanel";
import { filaStock, filaPadron, generarXlsxZk, generarCsvZk, leerExportZk, descargarArchivo, fechaArchivo, type FilaZk } from "@/lib/zk/plantillaZk";
import Loader from "@/components/Loader";
import ConfirmDialog from "@/components/ConfirmDialog";
import EvidenciaFirmaPanel from "@/components/admin/EvidenciaFirma";
import ListaIncompletos from "@/components/admin/Incompletos";
import { DetalleRegistro, TarjetaRegistro, ROL_LABEL, TRAMITE_LABEL, BadgeEspera, scrollAlAviso } from "@/components/admin/RegistroCard";

type Modo = "inicio" | "instalar" | "actualizar" | "baja" | "notas" | "incompletos" | "tags";
type Accion = "instalar" | "actualizar" | "baja";

// Lo que hay que guardar ANTES de instalar cuando el coche que se presenta no es
// el que la familia registró. Viaja armado desde el formulario para que la
// confirmación pueda nombrar el vehículo corregido y no el que quedó viejo.
type CorreccionVehiculo = { cambios: CambiosRegistro; resumen: string; motivo: string };

type ConfirmCfg = {
  title: string; message: string; confirmLabel: string; danger: boolean;
  // Lo que se coteja contra lo físico (el No. de TAG); el diálogo lo pinta grande.
  dato?: string;
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

// Mensaje con el que apiPanel (traducirError) reporta una falla de red.
const SIN_CONEXION = "Sin conexion";

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const sinSeparadores = (s: string) => s.replace(/[\s-]+/g, "");

// Buscador de todas las colas. Sin un falso «Sin resultados»: «perez» encuentra
// «Pérez», el orden de las palabras no importa, los apellidos de la familia
// cuentan (así llega la gente: «vengo por lo de los Pérez») y «UAB-1234»
// encuentra «UAB1234», que es como se guardan las placas.
const coincideBusqueda = (r: Registro, consulta: string): boolean => {
  const c = normalizar(consulta.trim());
  if (!c) return true;
  const texto = normalizar(
    [r.usuarioNombre, r.gestionanteNombre ?? "", r.apellidosFamilia ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio, r.marca, r.modelo]
      .join(" "));
  if (c.split(/\s+/).every((p) => texto.includes(p))) return true;
  const compacta = sinSeparadores(c);
  return compacta !== "" && sinSeparadores(normalizar(r.placas ?? "")).includes(compacta);
};

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
  // SC-027: mapa tarjeta -> ID de ZK guardado en la base (bloque 54): con el,
  // el import de ZK actualiza las tarjetas que ZK ya tenia con otro ID. Se
  // actualiza subiendo el export de ZK; queda para todas las sesiones.
  const [mapaZk, setMapaZk] = useState<Map<string, string>>(new Map());
  const [mapaZkInfo, setMapaZkInfo] = useState<{ total: number; cargadoEn: string; cargadoPor: string } | null>(null);
  const [mapaZkError, setMapaZkError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  // El padron se exporta incremental: solo lo instalado desde esta fecha
  // (default hoy), salvo que TI pida todo el padron.
  const [desdeZk, setDesdeZk] = useState(hoyIso());
  const [todoPadronZk, setTodoPadronZk] = useState(false);
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
  // busy es uno para toda la vista (también descartar una nota lo prende): el
  // botón que dice «Instalando el TAG X…» sale de aquí, del expediente y del
  // número que de verdad se mandaron, no del chip que esté marcado en ese momento.
  const [enCurso, setEnCurso] = useState<{ id: string; accion: Accion; tag?: string } | null>(null);
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

  // Con «Actualizar lista», entrar a una cola y el refresco tras cada acción, dos
  // lecturas pueden cruzarse: sólo pinta la última que se pidió, para que una
  // respuesta lenta anterior a una instalación no regrese el expediente a la fila.
  const refreshSeq = useRef(0);
  async function refresh() {
    const seq = ++refreshSeq.current;
    setLoading(true);
    try {
      const [list, notasList, incompletosList, inventarioRes, mapaRes] = await Promise.all([
        listRegistros(),
        listNotasSinExpediente(),
        listRegistrosIncompletos(),
        listTagsInventario().then(
          (v) => ({ ok: true as const, v }),
          (e: unknown) => ({ ok: false as const, e }),
        ),
        listMapaZk().then(
          (v) => ({ ok: true as const, v }),
          (e: unknown) => ({ ok: false as const, e }),
        ),
      ]);
      if (seq !== refreshSeq.current) return;
      setRegistros(list);
      setNotas(notasList);
      setIncompletos(incompletosList);
      if (mapaRes.ok) {
        setMapaZk(new Map(mapaRes.v.map((t) => [t.noDispositivo, t.zkId])));
        const ultima = mapaRes.v.reduce<typeof mapaRes.v[number] | null>(
          (acc, t) => (!acc || t.cargadoEn > acc.cargadoEn ? t : acc), null);
        setMapaZkInfo(ultima ? { total: mapaRes.v.length, cargadoEn: ultima.cargadoEn, cargadoPor: ultima.cargadoPor } : null);
        setMapaZkError(null);
      } else {
        setMapaZk(new Map());
        setMapaZkInfo(null);
        setMapaZkError(mapaRes.e instanceof Error ? mapaRes.e.message : "No se pudo cargar el mapa de ZK.");
      }
      if (inventarioRes.ok) {
        setInventario(inventarioRes.v);
        setInventarioError(null);
      } else {
        setInventario([]);
        setInventarioError(inventarioRes.e instanceof Error ? inventarioRes.e.message : "No se pudo cargar el inventario de TAGs.");
      }
      setLoadError(null);
    } catch (e) {
      if (seq === refreshSeq.current) setLoadError(e instanceof Error ? e.message : "No se pudieron cargar los registros.");
    } finally {
      if (seq === refreshSeq.current) setLoading(false);
    }
  }
  // Estacionamientos NO lleva respaldo inventado (D-09): null significa "no
  // cargó" y los formularios lo dicen tal cual. Unas claves de relleno
  // parecerían el catálogo real y llevarían a asignar un acceso inválido.
  function cargarEstacionamientos() {
    setEstacionamientos(undefined);
    getEstacionamientos()
      .then((es) => setEstacionamientos(es.map((e) => e.clave)))
      .catch(() => setEstacionamientos(null));
  }
  // Lo que la familia vio pasar en caja (el pago) o lo que otra persona de TI
  // ya instaló no llega solo a este celular: la vista lee la base al abrirse y
  // tras una acción propia. Aquí se vuelve a leer a petición, y el catálogo de
  // estacionamientos se reintenta si no cargó (los avisos D-09 remiten aquí).
  function actualizarLista() {
    refresh();
    if (estacionamientos === null) cargarEstacionamientos();
  }
  useEffect(() => {
    refresh();
    // Catálogos: si fallan, los formularios siguen operables con lo que el
    // registro ya trae; la BD valida las claves reales al asignar.
    getMarcas().then(setMarcas).catch(() => {});
    getColores().then(setColores).catch(() => {});
    cargarEstacionamientos();
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
  // Lo que saldria en el archivo del padron para ZK con el filtro vigente.
  const padronZk = registros.filter((r) =>
    r.estado === "activo" && r.noDispositivo
    && (todoPadronZk || !desdeZk || (r.fechaInstalacion ?? "") >= desdeZk));

  const q = query.trim().toLowerCase();
  const coincide = (r: Registro) => coincideBusqueda(r, query);
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
  // «Instalar TAG» va ordenada por el pago más antiguo, no por el orden en que
  // llegan los coches: con la familia enfrente se busca, no se recorre a ojo.
  const filaInstalar = q ? porInstalar.filter(coincide) : porInstalar;
  const filaSinPago = q ? instalarSinPago.filter(coincide) : instalarSinPago;

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
      const mensaje = e instanceof Error ? e.message : "Error";
      if (mensaje.startsWith(SIN_CONEXION)) {
        // La respuesta pudo perderse DESPUÉS de guardar. Repetir a ciegas lleva
        // a «ya tiene el TAG X instalado» y de ahí a una reposición que deja
        // inactivo el TAG recién pegado: primero hay que ver cómo quedó.
        // La prueba es cómo quedó el expediente tras una lectura que SÍ llegó, no
        // su lugar en la fila: en el padrón sigue ahí aunque ya esté instalado.
        setError("No hubo respuesta del servidor y la acción pudo haber quedado guardada. No la repita todavía: cuando la lista termine de actualizarse sin error (si no hay señal, toque «Actualizar lista» al recuperarla), revise si el cambio ya aparece, por ejemplo el TAG instalado en el expediente. Si ya aparece, sí quedó.");
        // Sin esto, en el padrón quedaría abierto «Instalar y activar» sobre un
        // expediente que quizá ya está activo.
        setAccionPadron(null);
        refresh();
      } else {
        setError(mensaje);
      }
    } finally {
      setBusy(false); setEnCurso(null);
      // Éxito o error, el aviso queda a la vista: los formularios pueden estar
      // muy abajo en el padrón móvil y una acción sin reacción visible se
      // siente como que no pasó nada.
      scrollAlAviso(bannersRef.current);
    }
  }

  function irA(m: Modo) {
    setModo(m); setSelId(null); setAccionPadron(null); setQuery("");
    setFeedback(null); setError(null);
    if (m !== "inicio") refresh();
  }
  function toggleSel(id: string) {
    setSelId((cur) => (cur === id ? null : id));
    setAccionPadron(null); setError(null);
  }

  // Confirmaciones: en campo, el error caro es activar un número equivocado,
  // así que las acciones repiten el dato clave antes de ejecutar.
  // Instalar define también el estacionamiento (SC-002): el SQL 31 ejecuta
  // asignación + TAG en una sola transacción, con la persona presente.
  function confirmarInstalar(r: Registro, tag: string, claves: string[], propio: boolean, apartadoNo: string, correccion: CorreccionVehiculo | null) {
    const procedencia: ProcedenciaTag = propio ? "propio" : "escuela";
    const apartado = propio ? (apartadoNo.trim() || null) : null;
    const cambiaProcedencia = procedencia !== r.procedenciaTag;
    // El vehículo que se nombra en la confirmación es el CORREGIDO: es el que
    // quien instala tiene enfrente. Repetir los datos viejos sería pedirle que
    // verifique justo lo que acaba de corregir.
    const c = correccion?.cambios;
    const placas = c && "placas" in c ? c.placas : r.placas;
    const vehiculo = `${c?.marca ?? r.marca} ${c?.modelo ?? r.modelo} ${c?.color ?? r.color} (${placas ?? "sin placas"})`;
    setConfirm({
      title: correccion ? "Corregir datos e instalar TAG" : "Instalar y activar TAG",
      dato: `TAG ${tag}`,
      message: (correccion ? `Primero se corregirán los datos del vehículo: ${correccion.resumen}. ` : "")
        + `Se instalará el TAG ${tag} en el ${vehiculo} de ${r.usuarioNombre}, con acceso a ${claves.join(" + ")}, y el registro quedará activo.`
        + (apartado ? ` Se apartará el TAG ${apartado} de la escuela.` : "")
        + (cambiaProcedencia ? ` El TAG quedará marcado como ${procedencia}.` : "")
        + " Compare el número de arriba con el impreso en el TAG. ¿Continuar?",
      confirmLabel: correccion ? "Corregir e instalar" : "Instalar", danger: false,
      // Dos llamadas EN ORDEN, no una transacción: la corrección primero y, sólo
      // si guardó, la instalación. Si la corrección falla, el await corta aquí
      // y run() muestra el error sin instalar: un TAG activo apuntando a un
      // coche que no es el que está enfrente es peor que una instalación
      // pospuesta. El estacionamiento va en null (no cambia): lo asigna el RPC
      // de instalación en la misma transacción de siempre.
      action: async () => {
        setEnCurso({ id: r.id, accion: "instalar", tag });
        if (!correccion) {
          return instalarTagConEstacionamiento(r.id, tag, claves, tiNombre, { tagApartadoNo: apartado, procedenciaTag: procedencia });
        }
        await actualizarRegistroConEstacionamiento(r.id, correccion.cambios, null, correccion.motivo, tiNombre);
        try {
          return await instalarTagConEstacionamiento(r.id, tag, claves, tiNombre, { tagApartadoNo: apartado, procedenciaTag: procedencia });
        } catch (e) {
          // La corrección YA quedó guardada y run() no refresca cuando algo
          // falla: sin esto, el segundo intento volvería a mandar los mismos
          // cambios y el RPC lo rechazaría con «No hay cambios que guardar»,
          // dejando a TI sin poder instalar por un error que ya resolvió.
          // Refrescado, el expediente en pantalla ya trae lo corregido y el
          // reintento sólo instala.
          await refresh();
          throw e;
        }
      },
      ok: (correccion ? "Datos del vehículo corregidos. " : "")
        + `TAG ${tag} instalado y activado (${r.folio}).` + (apartado ? ` TAG ${apartado} apartado.` : ""),
      // En la fila de instalación el buscador queda vacío para la placa del
      // siguiente coche; en el padrón se conserva, y el expediente recién
      // activado sigue a la vista para comprobarlo.
      after: () => { if (modo === "instalar") setQuery(""); },
    });
  }
  // claves null = el estacionamiento no cambió (no se llama a su RPC).
  function confirmarActualizar(r: Registro, cambios: CambiosRegistro, claves: string[] | null, resumen: string, motivo: string) {
    setConfirm({
      title: "Actualizar registro",
      dato: cambios.noDispositivo ? `TAG ${cambios.noDispositivo}` : undefined,
      message: `Cambios en ${r.folio} (${r.usuarioNombre}): ${resumen}. ¿Guardar?`,
      confirmLabel: "Guardar cambios", danger: false,
      action: () => {
        setEnCurso({ id: r.id, accion: "actualizar" });
        return actualizarRegistroConEstacionamiento(r.id, cambios, claves, motivo, tiNombre);
      },
      ok: `Registro ${r.folio} actualizado.`,
    });
  }
  function confirmarBaja(r: Registro, motivo: string) {
    setConfirm({
      title: "Dar de baja",
      message: `Se dará de baja el registro ${r.folio} (${r.usuarioNombre}) y su TAG quedará inactivo. ¿Continuar?`,
      confirmLabel: "Dar de baja", danger: true,
      action: () => {
        setEnCurso({ id: r.id, accion: "baja" });
        return darBaja(r.id, motivo, tiNombre);
      },
      ok: `Registro ${r.folio} dado de baja.`,
    });
  }
  // CC-01: reposición desde el TAG apartado. Activa el reservado, deja inactivo el
  // actual y pasa la procedencia a escuela; se limpia la reserva.
  function confirmarUsarApartado(r: Registro) {
    setConfirm({
      title: "Usar el TAG apartado",
      dato: `TAG ${r.tagApartadoNo}`,
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
  // SC-025: archivo de importacion para ZKBioSecurity, generado en el navegador.
  async function descargarZk(tipo: "stock" | "padron", formato: "xlsx" | "csv") {
    if (exportando) return;
    setExportando(true); setError(null); setFeedback(null);
    try {
      const filas: FilaZk[] = tipo === "stock"
        ? tagsDisponibles.map((t) => filaStock(t.noDispositivo))
        : padronZk
            .map((r) => filaPadron(r, mapaZk.get(r.noDispositivo!)))
            .filter((f): f is FilaZk => f !== null);
      if (filas.length === 0) {
        throw new Error(tipo === "stock"
          ? "No hay TAGs disponibles que exportar."
          : "No hay expedientes activos con TAG instalados en ese rango. Cambie la fecha o marque «todo el padrón».");
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
  // Lee el export de ZK en el navegador y reemplaza el mapa guardado en la base.
  async function cargarExportZk(archivo: File | null) {
    if (!archivo) return;
    let filas: { tarjeta: string; id: string }[];
    try {
      const mapa = await leerExportZk(archivo);
      if (mapa.size === 0) throw new Error("El archivo no parece un export de ZK (Usuarios_….csv).");
      filas = [...mapa.entries()].map(([tarjeta, id]) => ({ tarjeta, id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el export de ZK.");
      scrollAlAviso(bannersRef.current);
      return;
    }
    await run(
      () => cargarMapaZk(filas, tiNombre),
      (res) => `Mapa de ZK actualizado con ${res.total ?? filas.length} tarjetas; queda guardado para todas las sesiones.`,
    );
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

  const botonActualizar = (
    <button type="button" className="ghost-action ti-refresh" disabled={loading} onClick={actualizarLista}>
      {loading ? "Actualizando…" : "Actualizar lista"}
    </button>
  );

  function formPara(accion: Accion, r: Registro) {
    if (accion === "instalar") {
      // El TAG reservado desde la captura (SC-026) va primero y prellenado.
      const reservado = tagReservadoDe.get(r.id) ?? null;
      const chips = [...(reservado ? [reservado] : []), ...tagsDisponibles.map((t) => t.noDispositivo)];
      return <FormInstalar r={r} marcas={marcas} colores={colores} estacionamientos={estacionamientos} disponibles={chips} tagReservado={reservado} busy={busy} instalando={enCurso?.accion === "instalar" && enCurso.id === r.id ? enCurso.tag ?? null : null} tiNombre={tiNombre} onTiNombre={setTiNombre} onSubmit={(tag, claves, propio, apartadoNo, correccion) => confirmarInstalar(r, tag, claves, propio, apartadoNo, correccion)} />;
    }
    if (accion === "actualizar")
      return <FormActualizar r={r} marcas={marcas} colores={colores} estacionamientos={estacionamientos} busy={busy} guardando={enCurso?.accion === "actualizar" && enCurso.id === r.id} tiNombre={tiNombre} onTiNombre={setTiNombre} onUsarApartado={() => confirmarUsarApartado(r)} onSubmit={(c, claves, res, mot) => confirmarActualizar(r, c, claves, res, mot)} />;
    return <FormBaja r={r} busy={busy} guardando={enCurso?.accion === "baja" && enCurso.id === r.id} tiNombre={tiNombre} onTiNombre={setTiNombre} onSubmit={(m) => confirmarBaja(r, m)} />;
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
            {/* El contador cuenta SOLO lo que TI puede instalar hoy (ya pagado). Antes
                sumaba tambien los que esperan el cobro de Administracion, asi que el
                numero nunca reflejaba la cola real de instalacion. Los no pagados
                siguen visibles dentro de la pantalla, atenuados y bajo "Esperando
                pago"; aqui solo se anuncian en el subtitulo. */}
            <button type="button" className="ti-action" onClick={() => irA("instalar")}>
              <span>
                <span className="ti-action__title">Instalar TAG</span>
                <span className="ti-action__sub">
                  En espera de instalación
                  {instalarSinPago.length > 0 && ` · ${instalarSinPago.length} esperando pago`}
                </span>
              </span>
              <span className={`ti-action__count ti-action__count--${sem(porInstalar.length)}`}>{porInstalar.length}</span>
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
          </div>

          <div className="panel">
            <div className="ti-topbar">
              <p className="panel-title">Padrón completo ({padron.length})</p>
              {botonActualizar}
            </div>
            <input className="input search" type="search" placeholder="Buscar por nombre, apellidos, placa, No. de TAG o folio…"
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
                        <p className="ti-hint">Falta registrar el pago en Administración. Si la familia ya pagó, toque «Actualizar lista».</p>
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
            <h2>{modo === "instalar" ? "Instalar TAG" : modo === "actualizar" ? "Actualizar datos" : modo === "notas" ? "Notas sin expediente" : modo === "incompletos" ? "Expedientes incompletos" : modo === "tags" ? "TAGs de la escuela" : "Dar de baja"}</h2>
            {botonActualizar}
          </div>
          {banners}

          {modo === "instalar" && (
            <input className="input search" type="search" placeholder="Placas, apellidos de la familia o nombre…"
              value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
          )}
          {modo === "instalar" && (
            porInstalar.length === 0 && instalarSinPago.length === 0 && !q
              ? <p className="ti-empty">✓ No hay TAGs pendientes de instalar. Todo al día.</p>
              : filaInstalar.length === 0 && filaSinPago.length === 0
              ? (
                <p className="ti-hint">
                  No está en la fila de instalación. Toque «Actualizar lista»; si sigue sin aparecer, búsquelo en
                  el «Padrón completo» (← Inicio): puede que ya tenga TAG o que no se haya registrado.
                </p>
              )
              : (
                <>
                  {filaInstalar.length > 0 && (
                    <div className="ti-cards">
                      {filaInstalar.map((r) => (
                        <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)} espera={fechaEsperaInstalar(r)}>
                          <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                          {formPara("instalar", r)}
                          <EvidenciaFirmaPanel registroId={r.id} />
                        </TarjetaRegistro>
                      ))}
                    </div>
                  )}
                  {filaSinPago.length > 0 && (
                    <>
                      <p className="ti-section-title" style={{ marginTop: filaInstalar.length > 0 ? 18 : 0 }}>
                        Esperando pago ({filaSinPago.length})
                      </p>
                      <div className="ti-cards ti-cards--muted">
                        {filaSinPago.map((r) => (
                          <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)} espera={fechaEsperaInstalar(r)}>
                            <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                            <p className="ti-hint">Falta registrar el pago en Administración. Si la familia ya pagó, toque «Actualizar lista».</p>
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
              <input className="input search" type="search" placeholder="Buscar por nombre, apellidos, placa, No. de TAG o folio…"
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
                  «Actualizar el ID de usuario existente» = <strong>Sí</strong>. El ID de cada persona es su No. de TAG,
                  salvo las tarjetas que ZK ya tenía con otro ID (las dadas de alta a mano): para esas el archivo usa el
                  ID del mapa de ZK guardado abajo, y así ZK las actualiza en vez de rechazarlas con «el número de tarjeta
                  ya existe».
                </p>
                <div className="field">
                  <span>Mapa de IDs de ZK (guardado para todas las sesiones y computadoras)</span>
                  {mapaZkError ? (
                    <p className="field-error">No se pudo cargar el mapa de ZK: {mapaZkError}</p>
                  ) : mapaZkInfo ? (
                    <p className="hint">
                      {mapaZkInfo.total} tarjetas · actualizado el {fechaHoraLocal(mapaZkInfo.cargadoEn)} por {mapaZkInfo.cargadoPor}.
                      Súbalo de nuevo cuando ZK cambie por altas manuales (por ejemplo, cada lunes).
                    </p>
                  ) : (
                    <p className="hint">Sin cargar todavía. Suba el export de ZK (Personal → Exportar → Usuarios_….csv) una sola vez.</p>
                  )}
                  <input className="input" type="file" accept=".csv,.txt" disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ""; cargarExportZk(f); }} />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <span>Padrón: instalados desde</span>
                    <input className="input" type="date" value={desdeZk} disabled={todoPadronZk} onChange={(e) => setDesdeZk(e.target.value)} />
                  </div>
                  <label className="check" style={{ alignSelf: "end", paddingBottom: 12 }}>
                    <input type="checkbox" checked={todoPadronZk} onChange={(e) => setTodoPadronZk(e.target.checked)} />
                    <span>Todo el padrón activo (re-escribe lo ya subido con los mismos datos)</span>
                  </label>
                </div>
                <div className="ti-chips">
                  <button type="button" className="primary-action" disabled={exportando || tagsDisponibles.length === 0}
                    onClick={() => descargarZk("stock", "xlsx")}>
                    Descargar plantilla ZK (TAGs disponibles: {tagsDisponibles.length})
                  </button>
                  <button type="button" className="primary-action" disabled={exportando || padronZk.length === 0}
                    onClick={() => descargarZk("padron", "xlsx")}>
                    Descargar padrón instalado para ZK ({padronZk.length})
                  </button>
                </div>
                <p className="ti-hint">
                  Los TAGs disponibles salen como «DISPONIBLE / STOCK SATAG» en Padres de familia; al instalarse, el padrón
                  actualiza la misma tarjeta con la persona y su placa (en Celular). La plantilla de ZK no lleva niveles de
                  acceso: después de importar, asígnelos en ZK por departamento (Acceso → Niveles de acceso → ESTACIONAMIENTO 1 y 2
                  → Agregar personal → Padres de familia). Respaldo en el formato de export de ZK:{" "}
                  <button type="button" className="link-action" disabled={exportando} onClick={() => descargarZk("stock", "csv")}>disponibles .csv</button>
                  {" · "}
                  <button type="button" className="link-action" disabled={exportando} onClick={() => descargarZk("padron", "csv")}>padrón .csv</button>
                </p>
              </div>
            </>
          )}

        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          dato={confirm.dato}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); run(c.action, c.ok, c.after); }}
        />
      )}
    </>
  );
}

// ---- Datos del vehículo (compartidos por instalar y actualizar) ----
// El mismo vehículo se corrige desde dos sitios: «Actualizar datos» y, ahora, en
// el momento de instalar el TAG. Si cada formulario llevara su copia de los
// controles, tarde o temprano uno guardaría las placas en minúsculas, ofrecería
// otro catálogo de colores o escribiría el resumen distinto del que se le lee al
// titular. Vive una sola vez aquí y los dos lo usan igual.
type DatosVehiculo = {
  placas: string; setPlacas: (v: string) => void;
  sinPlacas: boolean; setSinPlacas: (v: boolean) => void;
  marca: string; setMarca: (v: string) => void;
  marcaOtro: string; setMarcaOtro: (v: string) => void;
  modelo: string; setModelo: (v: string) => void;
  modeloOtro: string; setModeloOtro: (v: string) => void;
  color: string; setColor: (v: string) => void;
  colorOtro: string; setColorOtro: (v: string) => void;
  // Modelos de la marca elegida. Tres estados, como estacionamientos en esta
  // misma pantalla: undefined = cargando, null = no cargó (D-09), [] = ninguno.
  modelos: string[] | null | undefined;
  // Lo que de verdad se guarda: «Otro» ya sustituido por lo escrito.
  marcaFinal: string; modeloFinal: string; colorFinal: string;
  // Sin placas y sin marcar «sin placas» la BD rechaza el trámite con el mismo
  // criterio (actualizar_registro): se avisa antes de gastar el viaje al RPC.
  placasValidas: boolean;
  // Marca, modelo y color con un valor real: ningún «Otro» sin escribir.
  vehiculoCompleto: boolean;
  // Lo que va al RPC y lo que se le muestra a quien atiende, en ese orden.
  cambios: CambiosRegistro;
  resumen: string[];
};

function useDatosVehiculo(r: Registro): DatosVehiculo {
  const [placas, setPlacas] = useState(r.placas ?? "");
  const [sinPlacas, setSinPlacas] = useState(r.sinPlacas);
  const [marca, setMarcaCruda] = useState(r.marca);
  const [marcaOtro, setMarcaOtro] = useState("");
  // Con marca «Otro» no hay catálogo del que cuelgue el modelo: se captura en
  // modeloOtro, igual que en el alta.
  const [modelo, setModelo] = useState(r.marca === "Otro" ? "Otro" : r.modelo);
  const [modeloOtro, setModeloOtro] = useState(r.marca === "Otro" ? r.modelo : "");
  const [color, setColor] = useState(r.color);
  const [colorOtro, setColorOtro] = useState("");
  const [modelos, setModelos] = useState<string[] | null | undefined>(undefined);

  // El modelo se limpia en el cambio de marca y no en el efecto: así abrir la
  // pantalla nunca borra el modelo que ya trae el expediente.
  const setMarca = (m: string) => {
    setMarcaCruda(m);
    setModelo(m === "Otro" ? "Otro" : "");
    setModeloOtro("");
  };

  useEffect(() => {
    if (marca === "" || marca === "Otro") { setModelos([]); return; }
    // Con dos cambios de marca seguidos, la respuesta de la primera puede llegar
    // al final y dejar sus modelos bajo la marca nueva: sólo cuenta la vigente.
    let vigente = true;
    setModelos(undefined);
    getModelos(marca)
      .then((ms) => { if (vigente) setModelos(ms); })
      .catch(() => { if (vigente) setModelos(null); });
    return () => { vigente = false; };
  }, [marca]);

  // Las placas se guardan siempre en mayúsculas: es como las lee la caseta y
  // como las compara ZK. La cadena vacía es "no capturado", no "sin placas".
  const placasFinal = sinPlacas ? null : (placas.trim().toUpperCase() || null);
  const placasValidas = sinPlacas || placasFinal !== null;

  // «Otro» es opción de la pantalla, nunca el dato: lo que va al RPC y lo que se
  // le lee al titular en la confirmación es siempre lo escrito.
  const marcaFinal = (marca === "Otro" ? marcaOtro : marca).trim();
  const modeloFinal = (modelo === "Otro" ? modeloOtro : modelo).trim();
  const colorFinal = (color === "Otro" ? colorOtro : color).trim();
  const vehiculoCompleto = marcaFinal !== "" && modeloFinal !== "" && colorFinal !== "";

  const cambios: CambiosRegistro = {};
  const resumen: string[] = [];
  if (placasFinal !== r.placas || sinPlacas !== r.sinPlacas) { cambios.placas = placasFinal; cambios.sinPlacas = sinPlacas; resumen.push(`placas ${r.placas ?? "sin placas"} → ${placasFinal ?? "sin placas"}`); }
  // Un dato vacío no es un cambio: se ignora en vez de borrar lo capturado. Los
  // formularios, además, no dejan guardar un vehículo corregido a medias.
  if (marcaFinal && marcaFinal !== r.marca) { cambios.marca = marcaFinal; resumen.push(`marca ${r.marca} → ${marcaFinal}`); }
  if (modeloFinal && modeloFinal !== r.modelo) { cambios.modelo = modeloFinal; resumen.push(`modelo ${r.modelo} → ${modeloFinal}`); }
  if (colorFinal && colorFinal !== r.color) { cambios.color = colorFinal; resumen.push(`color ${r.color} → ${colorFinal}`); }

  return {
    placas, setPlacas, sinPlacas, setSinPlacas,
    marca, setMarca, marcaOtro, setMarcaOtro,
    modelo, setModelo, modeloOtro, setModeloOtro,
    color, setColor, colorOtro, setColorOtro,
    modelos, marcaFinal, modeloFinal, colorFinal,
    placasValidas, vehiculoCompleto, cambios, resumen,
  };
}

// Los controles del vehículo. Los catálogos siempre incluyen el valor que trae
// el expediente: si la marca capturada ya no está en el catálogo, el select no
// puede quedarse en blanco y cambiarla sola. `junto` es la celda que acompaña al
// color en la última fila —en «Actualizar datos», el motivo—; al instalar el
// motivo se arma solo y ahí va vacía.
function CamposVehiculo({ v, r, marcas, colores, junto }: {
  v: DatosVehiculo; r: Registro; marcas: string[]; colores: string[]; junto?: ReactNode;
}) {
  const cargandoModelos = v.modelos === undefined;
  const faltaMarca = v.marca === "Otro" && v.marcaFinal === "";
  // Mientras el catálogo carga, el modelo vacío no es un error de quien atiende.
  const faltaModelo = !cargandoModelos && v.modeloFinal === "";
  const faltaColor = v.color === "Otro" && v.colorFinal === "";
  // El modelo del expediente sólo se ofrece mientras la marca siga siendo la
  // suya: un modelo de Nissan no tiene sentido bajo Honda. "Otro" va a mano
  // para que exista aunque el catálogo no haya cargado.
  const opcionesModelo = [...new Set(["", ...(v.marca === r.marca ? [r.modelo] : []), ...(v.modelos ?? []), "Otro"])];
  return (
    <>
      <div className="grid-2">
        <div className="field">
          <span>Placas</span>
          <input className={`input ${!v.placasValidas ? "invalid" : ""}`} value={v.placas} disabled={v.sinPlacas}
            onChange={(e) => v.setPlacas(e.target.value.toUpperCase())} placeholder="Ej. UAB1234" />
        </div>
        <label className="check ti-check-placas">
          <input type="checkbox" checked={v.sinPlacas} onChange={(e) => v.setSinPlacas(e.target.checked)} />
          <span>Sin placas (permiso/nuevo)</span>
        </label>
      </div>
      <div className="grid-2">
        <div className="field">
          <span>Marca</span>
          <select className={`select ${faltaMarca ? "invalid" : ""}`} value={v.marca} onChange={(e) => v.setMarca(e.target.value)}>
            {[...new Set([r.marca, ...marcas, "Otro"])].map((m) => <option key={m} value={m}>{m || "Seleccione…"}</option>)}
          </select>
          {v.marca === "Otro" && (
            <input className={`input ${faltaMarca ? "invalid" : ""}`} value={v.marcaOtro}
              onChange={(e) => v.setMarcaOtro(e.target.value)} placeholder="Especifique la marca" />
          )}
          {faltaMarca && <p className="field-error">Escriba la marca del vehículo.</p>}
        </div>
        <div className="field">
          <span>Modelo</span>
          {v.marca === "Otro" ? (
            <input className={`input ${faltaModelo ? "invalid" : ""}`} value={v.modeloOtro}
              onChange={(e) => v.setModeloOtro(e.target.value)} placeholder="Escriba el modelo" />
          ) : (
            <>
              <select className={`select ${faltaModelo ? "invalid" : ""}`} value={v.modelo}
                onChange={(e) => v.setModelo(e.target.value)} disabled={cargandoModelos}>
                {opcionesModelo.map((m) => (
                  <option key={m} value={m}>
                    {m || (cargandoModelos ? `Cargando los modelos de ${v.marca}…` : "Seleccione…")}
                  </option>
                ))}
              </select>
              {v.modelo === "Otro" && (
                <input className={`input ${faltaModelo ? "invalid" : ""}`} value={v.modeloOtro}
                  onChange={(e) => v.setModeloOtro(e.target.value)} placeholder="Especifique el modelo" />
              )}
            </>
          )}
          {v.modelos === null && (
            // D-09: se dice tal cual que no cargó. No se bloquea: el modelo es
            // texto libre en la BD y quien instala tiene a la familia enfrente.
            <p className="field-error" role="alert">
              No se pudieron cargar los modelos de {v.marca}.{" "}
              {v.marca === r.marca
                ? `Se conserva el que trae el expediente (${r.modelo}); si necesita otro, elija «Otro» y escríbalo, o recargue la página para volver a la lista.`
                : "Elija «Otro» y escriba el modelo, o recargue la página para volver a la lista."}
            </p>
          )}
          {faltaModelo && v.modelos !== null && <p className="field-error">Elija o escriba el modelo del vehículo.</p>}
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <span>Color</span>
          <select className={`select ${faltaColor ? "invalid" : ""}`} value={v.color} onChange={(e) => v.setColor(e.target.value)}>
            {[...new Set([r.color, ...colores, "Otro"])].map((c) => <option key={c} value={c}>{c || "Seleccione…"}</option>)}
          </select>
          {v.color === "Otro" && (
            <input className={`input ${faltaColor ? "invalid" : ""}`} value={v.colorOtro}
              onChange={(e) => v.setColorOtro(e.target.value)} placeholder="Especifique el color" />
          )}
          {faltaColor && <p className="field-error">Escriba el color del vehículo.</p>}
        </div>
        {junto}
      </div>
    </>
  );
}

// ---- Formularios de acción ----
function FormInstalar({ r, marcas, colores, estacionamientos, disponibles, tagReservado, busy, instalando, tiNombre, onTiNombre, onSubmit }: {
  r: Registro; marcas: string[]; colores: string[];
  estacionamientos: string[] | null | undefined; disponibles: string[]; tagReservado: string | null;
  // busy sólo deshabilita; instalando es el No. de TAG que se está guardando en ESTE expediente.
  busy: boolean; instalando: string | null; tiNombre: string;
  onTiNombre: (v: string) => void;
  onSubmit: (tag: string, claves: string[], propio: boolean, apartadoNo: string, correccion: CorreccionVehiculo | null) => void;
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
  // El coche que se presenta no siempre es el que la familia registró: las
  // placas no coinciden, el color es otro, el modelo quedó mal capturado. Antes
  // había que salirse a «Actualizar datos», buscar otra vez el expediente,
  // guardar y volver: se perdía el momento y la instalación se posponía. Va
  // plegada porque el caso normal es que coincida y no queremos alargar la
  // pantalla de siempre.
  const [corrigiendo, setCorrigiendo] = useState(false);
  const veh = useDatosVehiculo(r);
  const valido = TAG_RE.test(tag);
  const apartadoLleno = propio && apartadoNo.trim() !== "";
  const apartadoValido = !apartadoLleno || (TAG_RE.test(apartadoNo) && apartadoNo !== tag);
  const hayCorreccion = veh.resumen.length > 0;
  // El motivo se arma solo: en la bitácora tiene que quedar dicho que esto se
  // corrigió con la persona enfrente, al instalar, y no en un trámite aparte.
  const correccion: CorreccionVehiculo | null = hayCorreccion
    ? { cambios: veh.cambios, resumen: veh.resumen.join("; "), motivo: `Corrección al instalar: ${veh.resumen.join("; ")}` }
    : null;
  // Sólo estorba la instalación cuando de verdad hay algo que corregir: un
  // expediente que ya venía sin placas ni «sin placas» se instala como siempre
  // (ese faltante se atiende en «Expedientes incompletos», no aquí). Lo mismo el
  // vehículo: sólo bloquea si quien atiende lo tocó y lo dejó a medias; instalar
  // sin corregir nada sigue funcionando para cualquier expediente.
  const correccionInvalida = hayCorreccion && (!veh.placasValidas || !veh.vehiculoCompleto);
  const vehiculoAMedias = hayCorreccion && !veh.vehiculoCompleto;
  // Con la marca recién cambiada el modelo queda vacío hasta que llega su
  // catálogo: eso es esperar, no un dato que le falte a quien atiende.
  const esperandoModelos = veh.modelos === undefined && veh.modeloFinal === "";
  const toggle = (c: string) =>
    setClaves((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  return (
    <div className="ti-form">
      {/* Sólo el vehículo. El nombre del titular, el tipo de usuario y la firma
          no se tocan aquí: quien firmó, firmó. */}
      <button type="button" className="ghost-action" aria-expanded={corrigiendo}
        style={{ width: "100%", marginBottom: 14 }}
        onClick={() => setCorrigiendo((v) => !v)}>
        {corrigiendo ? "Ocultar la corrección del vehículo" : "¿Los datos del vehículo no coinciden?"}
      </button>
      {corrigiendo && (
        <div className="notice" style={{ marginBottom: 16 }}>
          <p className="ti-hint" style={{ marginTop: 0 }}>
            Corrija lo que no coincida con el coche que tiene enfrente. Se guarda en el expediente{" "}
            {r.folio} al pulsar el botón de instalar, sin salir de esta pantalla.
          </p>
          <CamposVehiculo v={veh} r={r} marcas={marcas} colores={colores} />
          {!veh.placasValidas && <p className="field-error">Capture las placas o marque «Sin placas».</p>}
        </div>
      )}
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
              ya tiene el expediente ({claves.join(" + ")}); toque «Actualizar lista» si necesita cambiarla.
            </p>
          ) : (
            <p className="field-error" role="alert">
              No se pudo cargar el catálogo de estacionamientos y este expediente no tiene ninguno
              asignado. Toque «Actualizar lista» para poder asignar el acceso.
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
      {/* El resumen vive FUERA de la sección plegable: si se corrige y luego se
          pliega, lo corregido no puede quedar escondido. Nadie debe corregir un
          expediente sin darse cuenta. */}
      {hayCorreccion && (
        <p className="notice" style={{ marginBottom: 12 }}>
          <strong>Antes de instalar se corregirá:</strong> {veh.resumen.join("; ")}.
          {!corrigiendo && (
            <>{" "}<button type="button" className="link-action" onClick={() => setCorrigiendo(true)}>Revisar</button></>
          )}
        </p>
      )}
      {vehiculoAMedias && (esperandoModelos ? (
        <p className="ti-hint" style={{ marginBottom: 12 }}>
          Cargando los modelos de {veh.marca}… En cuanto aparezcan, elija el modelo para poder instalar.
        </p>
      ) : (
        <p className="field-error" style={{ marginBottom: 12 }}>
          La corrección dejó sin completar la marca, el modelo o el color. Complételos para poder instalar.
          {!corrigiendo && (
            <>{" "}<button type="button" className="link-action" onClick={() => setCorrigiendo(true)}>Completarlos</button></>
          )}
        </p>
      ))}
      <button type="button" className="primary-action"
        disabled={busy || !valido || claves.length === 0 || !apartadoValido || correccionInvalida}
        onClick={() => onSubmit(tag, claves, propio, apartadoNo, correccion)}>
        {instalando
          ? `Instalando el TAG ${instalando}… no cierre esta pantalla`
          : hayCorreccion
          ? (valido ? `Corregir datos e instalar el TAG ${tag}` : "Corregir datos e instalar")
          : (valido ? `Instalar y activar TAG ${tag}` : "Instalar y activar")}
      </button>
    </div>
  );
}

function FormActualizar({ r, marcas, colores, estacionamientos, busy, guardando, tiNombre, onTiNombre, onUsarApartado, onSubmit }: {
  r: Registro; marcas: string[]; colores: string[]; estacionamientos: string[] | null | undefined; busy: boolean; guardando: boolean;
  tiNombre: string; onTiNombre: (v: string) => void;
  onUsarApartado: () => void;
  onSubmit: (cambios: CambiosRegistro, claves: string[] | null, resumen: string, motivo: string) => void;
}) {
  const [tag, setTag] = useState(r.noDispositivo ?? "");
  // Placas, marca, modelo y color son los mismos controles y las mismas reglas
  // que se usan al instalar (ver useDatosVehiculo).
  const veh = useDatosVehiculo(r);
  // CC-01: TI puede corregir propio/escuela (el titular solo lo declara en el alta).
  const [procedencia, setProcedencia] = useState<ProcedenciaTag>(r.procedenciaTag);
  const [claves, setClaves] = useState<string[]>(r.estacionamientos);
  const [motivo, setMotivo] = useState("");

  const tieneTag = r.noDispositivo !== null;
  const tagCambia = tieneTag && tag !== r.noDispositivo;
  const tagValido = !tieneTag || TAG_RE.test(tag);
  // Aquí sí se permite dejarlo vacío (corregir una asignación equivocada);
  // al instalar es donde se exige al menos uno.
  const estCambia = !mismaAsignacion(claves, r.estacionamientos);
  const toggleEst = (c: string) =>
    setClaves((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  // El orden importa: es el que se le lee al titular en la confirmación.
  const cambios: CambiosRegistro = {};
  const resumen: string[] = [];
  if (tagCambia && tagValido) { cambios.noDispositivo = tag; resumen.push(`TAG ${r.noDispositivo} → ${tag} (reposición; el anterior queda inactivo)`); }
  Object.assign(cambios, veh.cambios);
  resumen.push(...veh.resumen);
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
      <CamposVehiculo v={veh} r={r} marcas={marcas} colores={colores}
        junto={<div className="field"><span>Motivo (opcional)</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. placas nuevas, TAG dañado" /></div>} />
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
            ({r.estacionamientos.join(" + ") || "sin asignar"}); toque «Actualizar lista» para poder cambiarla.
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
        disabled={busy || !hayCambios || !tagValido || !veh.placasValidas || (veh.resumen.length > 0 && !veh.vehiculoCompleto) || (r.tagApartado && procedencia === "escuela")}
        onClick={() => onSubmit(cambios, estCambia ? claves : null, resumen.join("; "), motivo)}>
        {guardando ? "Guardando…" : "Guardar cambios"}
      </button>
      {!hayCambios && <p className="hint" style={{ marginTop: 8 }}>Modifique algún dato para poder guardar.</p>}
    </div>
  );
}

function FormBaja({ r, busy, guardando, tiNombre, onTiNombre, onSubmit }: {
  r: Registro; busy: boolean; guardando: boolean; tiNombre: string; onTiNombre: (v: string) => void; onSubmit: (motivo: string) => void;
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
        {guardando ? "Dando de baja…" : "Dar de baja"}
      </button>
    </div>
  );
}

// Nunca recortar el ISO UTC: se formatea en la zona del Instituto.
const fechaHoraLocal = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
    ? registros.filter((r) => r.estado !== "baja" && coincideBusqueda(r, q)).slice(0, 8)
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
                placeholder="Apellidos de la familia, titular o placas…" />
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
