// Capa de API real del PANEL (Administracion / TI / Consulta) contra Supabase.
// Mantiene los shapes de lib/mock/types.ts como contrato con las pantallas.
//
// Usa supabaseAuth (sesion persistente): la RLS exige aal2 + app_metadata.rol
// para LEER (27/30) y toda escritura pasa por RPCs SECURITY DEFINER (29) que
// validan el rol por dentro. Aqui no hay ningun insert/update directo.
//
// Las acciones devuelven { id } (no el Registro completo): las pantallas
// recargan la lista despues de actuar, asi que el registro actualizado llega
// por listRegistros y devolverlo aqui seria un segundo viaje redundante.
import { supabaseAuth } from "./auth";
import type { CasoGuardado, EstadoCasoGuardado, NotaCaso, OrigenCaso, TipoCasoCatalogo } from "@/lib/casosRegistro";
import { urlFirmada } from "@/lib/firma";
import type {
  CambiosRegistro,
  CorteCaja,
  DiaCaja,
  Estacionamiento,
  EstadoCaja,
  EstadoRegistro,
  EvidenciaFirma,
  FirmanteRol,
  InstalacionMedida,
  Movimiento,
  MotivoIncompleto,
  Pago,
  PagoDevuelto,
  PagoReciente,
  ProcedenciaTag,
  OrigenExpediente,
  EvidenciaAceptacion,
  Registro,
  RegistroIncompleto,
  ResultadoCorte,
  Solicitud,
  TagInventario,
  TarjetaZk,
  TipoMovimiento,
  TipoSolicitud,
  TipoUsuario,
  AreaAdmin,
  TramiteSolicitado,
} from "@/lib/mock/types";
import type { EventoZk } from "@/lib/zk/eventos";
import type { PersonaZk } from "@/lib/zk/padron";

export interface AccionResultado {
  id: string;
  // Lo devuelven crear_registro y capturar_expediente_ti (SC-026).
  folio?: string;
  // Lo devuelve cargar_mapa_zk (SC-027): tarjetas que quedaron en el mapa.
  total?: number;
  folioRecibo?: string;
  // CC-05: lo devuelve registrar_pago para poder avisar en pantalla cuando el
  // tipo declarado en el alta no era el correcto y quedó corregido.
  tipoUsuario?: TipoUsuario;
  tipoCorregido?: boolean;
  tipoAnterior?: TipoUsuario | null;
  // Bloque 85: lo devuelve devolver_pago. yaCortado = el cobro ya estaba en un
  // corte cerrado, y su devolucion sale en el corte siguiente.
  monto?: number;
  yaCortado?: boolean;
}

// Errores de red/sesion en espanol. Los errores de negocio de los RPCs
// (raise exception) ya vienen en espanol desde la BD y se muestran tal cual.
function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed") || m.includes("fetch failed")) {
    return "Sin conexion con el servidor. Revise su red e intente de nuevo.";
  }
  if (m.includes("jwt") && (m.includes("expired") || m.includes("invalid"))) {
    return "La sesion expiro. Cierre sesion y vuelva a entrar.";
  }
  if (m.includes("permission denied") || m.includes("not authorized")) {
    return "Su usuario no tiene permiso para esta accion. Verifique su rol con el administrador.";
  }
  return mensaje;
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<AccionResultado> {
  const { data, error } = await supabaseAuth.rpc(fn, args);
  if (error) throw new Error(traducirError(error.message));
  return data as AccionResultado;
}

// ---- Lectura ----

// Shape crudo de la fila que devuelve el select con embeds (snake_case).
interface PagoRow {
  monto: number | string;
  metodo: string;
  cobrado_por: string | null;
  folio_recibo: string | null;
  fecha: string | null;
  created_at: string;
  // Bloque 85. Sin el bloque aplicado PostgREST rechaza el select entero: por
  // eso el 85 va ANTES de publicar este cliente.
  devuelto_en: string | null;
  devuelto_por: string | null;
  devolucion_motivo: string | null;
}
interface SolicitudRow {
  id: string;
  tipo: string;
  detalle: string;
  atendida: boolean;
  created_at: string;
  // Solo en notas (SC-003); null en actualizacion/baja.
  solicitante_nombre: string | null;
  solicitante_rol: string | null;
  tramite_solicitado: string | null;
  alumno_nombre: string | null;
  alumno_grado: string | null;
  vehiculo_desc: string | null;
}
interface MovimientoRow {
  tipo: string;
  fecha: string;
  motivo: string | null;
  hecho_por: string | null;
  no_dispositivo_anterior: string | null;
  no_dispositivo_nuevo: string | null;
  created_at: string;
}
interface RegistroRow {
  id: string;
  folio: string;
  usuario_nombre_completo: string;
  gestionante_nombre_completo: string | null;
  tipo_usuario: string;
  tipo_validado: boolean;
  tipo_validado_por: string | null;
  tipo_validado_en: string | null;
  usuario_es_menor: boolean;
  apellidos_familia: string | null;
  parentesco_otro: string | null;
  seccion_maestro: string | null;
  area_admin: string | null;
  marca: string;
  modelo: string;
  color: string;
  placas: string | null;
  sin_placas: boolean;
  no_dispositivo: string | null;
  procedencia_tag: string;
  origen_expediente: string | null;
  evidencia_aceptacion: string | null;
  tag_apartado: boolean;
  tag_apartado_no: string | null;
  estado: string;
  motivo_baja: string | null;
  fecha_baja: string | null;
  fecha_adquisicion: string | null;
  fecha_instalacion: string | null;
  instalado_por: string | null;
  instalado_en: string | null;
  permiso_url: string | null;
  permiso_validado: boolean | null;
  permiso_validado_por: string | null;
  permiso_validado_en: string | null;
  observaciones: string | null;
  created_at: string;
  pagos: PagoRow[];
  registro_estacionamientos: { estacionamiento_clave: string }[];
  solicitudes: SolicitudRow[];
  movimientos: MovimientoRow[];
}

const SELECT_REGISTRO = `
  id, folio, usuario_nombre_completo, gestionante_nombre_completo, tipo_usuario,
  tipo_validado, tipo_validado_por, tipo_validado_en, usuario_es_menor,
  apellidos_familia, parentesco_otro, seccion_maestro, area_admin,
  marca, modelo, color, placas, sin_placas, no_dispositivo, procedencia_tag,
  origen_expediente, evidencia_aceptacion,
  tag_apartado, tag_apartado_no, estado,
  motivo_baja, fecha_baja, fecha_adquisicion, fecha_instalacion, instalado_por, instalado_en,
  permiso_url, permiso_validado, permiso_validado_por, permiso_validado_en,
  observaciones, created_at,
  pagos ( monto, metodo, cobrado_por, folio_recibo, fecha, created_at, devuelto_en, devuelto_por, devolucion_motivo ),
  registro_estacionamientos ( estacionamiento_clave ),
  solicitudes ( id, tipo, detalle, atendida, created_at, solicitante_nombre, solicitante_rol, tramite_solicitado, alumno_nombre, alumno_grado, vehiculo_desc ),
  movimientos ( tipo, fecha, motivo, hecho_por, no_dispositivo_anterior, no_dispositivo_nuevo, created_at )
`;

// Columnas de una nota sin vincular (registro_id null): mismo shape que el embed
// pero consultado directo sobre solicitudes (no cuelga de ningun registro).
const SELECT_NOTA = `id, tipo, detalle, atendida, created_at, solicitante_nombre, solicitante_rol, tramite_solicitado, alumno_nombre, alumno_grado, vehiculo_desc`;

const porCreatedAt = (a: { created_at: string }, b: { created_at: string }) =>
  a.created_at.localeCompare(b.created_at);

// Supabase entrega timestamptz en UTC. La operación ocurre en Querétaro: cortar
// el ISO con slice(0, 10) hacía que una solicitud enviada después de las 18:00
// apareciera con la fecha del día siguiente.
const FORMATO_FECHA_LOCAL = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function fechaLocal(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso.slice(0, 10);
  const partes: Record<string, string> = {};
  for (const parte of FORMATO_FECHA_LOCAL.formatToParts(fecha)) partes[parte.type] = parte.value;
  return `${partes.year}-${partes.month}-${partes.day}`;
}

// Fila de solicitud (embebida o suelta) -> shape del dominio. Los campos de nota
// solo traen valor cuando tipo='nota'; en el resto quedan en null.
function mapSolicitud(s: SolicitudRow): Solicitud {
  return {
    id: s.id,
    tipo: s.tipo as TipoSolicitud,
    detalle: s.detalle,
    fecha: fechaLocal(s.created_at),
    atendida: s.atendida,
    solicitanteNombre: s.solicitante_nombre,
    solicitanteRol: (s.solicitante_rol as TipoUsuario | null) ?? null,
    tramiteSolicitado: (s.tramite_solicitado as TramiteSolicitado | null) ?? null,
    alumnoNombre: s.alumno_nombre,
    alumnoGrado: s.alumno_grado,
    vehiculoDesc: s.vehiculo_desc,
  };
}

function mapRegistro(r: RegistroRow): Registro {
  // Bloque 85: un pago devuelto NO es un pago. Se separa aqui, una sola vez,
  // para que cada `pagos.length` del panel siga significando «ya pago».
  const aPago = (p: PagoRow): Pago => ({
    monto: Number(p.monto),
    metodo: "efectivo",
    cobradoPor: p.cobrado_por,
    fecha: p.fecha,
    folio: p.folio_recibo,
  });
  const ordenados = [...r.pagos].sort(porCreatedAt);
  const pagos: Pago[] = ordenados.filter((p) => !p.devuelto_en).map(aPago);
  const devoluciones: PagoDevuelto[] = ordenados
    .filter((p): p is PagoRow & { devuelto_en: string } => Boolean(p.devuelto_en))
    .map((p) => ({ ...aPago(p), devueltoEn: fechaLocal(p.devuelto_en), devueltoPor: p.devuelto_por, motivo: p.devolucion_motivo }));
  const solicitudes: Solicitud[] = [...r.solicitudes].sort(porCreatedAt).map(mapSolicitud);
  const movimientos: Movimiento[] = [...r.movimientos].sort(porCreatedAt).map((m) => ({
    tipo: m.tipo as TipoMovimiento,
    fecha: m.fecha,
    motivo: m.motivo,
    hechoPor: m.hecho_por,
    noDispositivoAnterior: m.no_dispositivo_anterior,
    noDispositivoNuevo: m.no_dispositivo_nuevo,
  }));
  return {
    id: r.id,
    folio: r.folio,
    usuarioNombre: r.usuario_nombre_completo,
    gestionanteNombre: r.gestionante_nombre_completo,
    tipoUsuario: r.tipo_usuario as TipoUsuario,
    tipoValidado: r.tipo_validado,
    tipoValidadoPor: r.tipo_validado_por,
    tipoValidadoEn: r.tipo_validado_en,
    usuarioEsMenor: r.usuario_es_menor,
    apellidosFamilia: r.apellidos_familia,
    parentescoOtro: r.parentesco_otro,
    seccionMaestro: r.seccion_maestro,
    areaAdmin: (r.area_admin ?? null) as AreaAdmin | null,
    marca: r.marca,
    modelo: r.modelo,
    color: r.color,
    placas: r.placas,
    sinPlacas: r.sin_placas,
    noDispositivo: r.no_dispositivo,
    procedenciaTag: r.procedencia_tag as ProcedenciaTag,
    origenExpediente: (r.origen_expediente ?? "satag") as OrigenExpediente,
    evidenciaAceptacion: (r.evidencia_aceptacion ?? "electronica") as EvidenciaAceptacion,
    tagApartado: r.tag_apartado,
    tagApartadoNo: r.tag_apartado_no,
    estado: r.estado as EstadoRegistro,
    estacionamientos: r.registro_estacionamientos.map((e) => e.estacionamiento_clave).sort(),
    fechaAdquisicion: r.fecha_adquisicion,
    fechaInstalacion: r.fecha_instalacion,
    instaladoPor: r.instalado_por,
    instaladoEn: r.instalado_en,
    permisoUrl: r.permiso_url,
    permisoValidado: r.permiso_validado ?? false,
    permisoValidadoPor: r.permiso_validado_por,
    permisoValidadoEn: r.permiso_validado_en,
    motivoBaja: r.motivo_baja,
    fechaBaja: r.fecha_baja,
    observaciones: r.observaciones,
    pagos,
    devoluciones,
    solicitudes,
    movimientos,
    createdAt: r.created_at,
  };
}

// Padron completo (nuevos primero), con pagos/estacionamientos/solicitudes/
// movimientos embebidos. El filtro se aplica en memoria (mismo criterio que el
// mock): el padron es chico y asi el buscador no dispara una consulta por tecla.
export async function listRegistros(filtro?: string): Promise<Registro[]> {
  const { data, error } = await supabaseAuth
    .from("registros")
    .select(SELECT_REGISTRO)
    .order("created_at", { ascending: false });
  if (error) throw new Error(traducirError(error.message));

  const registros = (data as unknown as RegistroRow[]).map(mapRegistro);
  const q = (filtro ?? "").trim().toLowerCase();
  if (!q) return registros;
  // Los apellidos de la familia entran al buscador porque es como llega la
  // gente al mostrador ("vengo por lo de los Pérez"), y no siempre coinciden
  // con los del conductor que quedo en el expediente.
  return registros.filter((r) =>
    [r.usuarioNombre, r.gestionanteNombre ?? "", r.apellidosFamilia ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio]
      .join(" ").toLowerCase().includes(q));
}

// Notas del buzon publico sin folio aun SIN vincular (SC-003): tipo 'nota',
// registro_id null y sin atender. No cuelgan de ningun registro, asi que se
// consultan directo. TI las empata a un expediente (vincularNota) o las descarta
// (descartarSolicitud) si son spam. La RLS ya las deja leer a aal2 + rol panel.
export async function listNotasSinExpediente(): Promise<Solicitud[]> {
  const { data, error } = await supabaseAuth
    .from("solicitudes")
    .select(SELECT_NOTA)
    .eq("tipo", "nota")
    .is("registro_id", null)
    .eq("atendida", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(traducirError(error.message));
  return (data as unknown as SolicitudRow[]).map(mapSolicitud);
}

// Catalogo de estacionamientos activos: los chips de asignacion en TI y, con
// `cupo_lugares`, el denominador de la saturacion en la pestana Estacionamiento.
export async function getEstacionamientos(): Promise<Estacionamiento[]> {
  const { data, error } = await supabaseAuth
    .from("estacionamientos")
    .select("clave, descripcion, activo, cupo_lugares")
    .eq("activo", true)
    .order("clave");
  if (error) throw new Error(traducirError(error.message));
  return (data as { clave: string; descripcion: string | null; activo: boolean; cupo_lugares: number | null }[]).map((e) => ({
    clave: e.clave,
    descripcion: e.descripcion ?? e.clave,
    activo: e.activo,
    cupoLugares: e.cupo_lugares,
  }));
}

// ---- Reporte de expedientes incompletos (CC-02, bloque 45) ----

interface IncompletoRow {
  id: string;
  folio: string;
  usuario_nombre_completo: string;
  gestionante_nombre_completo: string | null;
  tipo_usuario: string;
  marca: string;
  modelo: string;
  color: string;
  placas: string | null;
  sin_placas: boolean;
  no_dispositivo: string | null;
  procedencia_tag: string;
  estado: string;
  folio_recibo: string | null;
  created_at: string;
  dias_desde_alta: number | string;
  dias_desde_pago: number | string | null;
  motivos: string[];
  total_motivos: number | string;
}

const SELECT_INCOMPLETO = `
  id, folio, usuario_nombre_completo, gestionante_nombre_completo, tipo_usuario,
  marca, modelo, color, placas, sin_placas, no_dispositivo, procedencia_tag,
  estado, folio_recibo, created_at, dias_desde_alta, dias_desde_pago, motivos
`;

// Expedientes a los que les falta algo para operar, con el motivo. La vista
// `v_registros_incompletos` (security_invoker) hereda la RLS del panel: los
// cuatro roles ven lo mismo y un usuario sin rol recibe cero filas.
//
// Orden: primero los que acumulan más faltantes y, a igualdad, los más viejos.
// Es el orden en que conviene atacarlos, no el orden de captura.
export async function listRegistrosIncompletos(): Promise<RegistroIncompleto[]> {
  const { data, error } = await supabaseAuth
    .from("v_registros_incompletos")
    .select(SELECT_INCOMPLETO)
    .order("total_motivos", { ascending: false })
    .order("dias_desde_alta", { ascending: false });
  if (error) throw new Error(traducirError(error.message));
  return (data as unknown as IncompletoRow[]).map((r) => ({
    id: r.id,
    folio: r.folio,
    usuarioNombre: r.usuario_nombre_completo,
    gestionanteNombre: r.gestionante_nombre_completo,
    tipoUsuario: r.tipo_usuario as TipoUsuario,
    marca: r.marca,
    modelo: r.modelo,
    color: r.color,
    placas: r.placas,
    sinPlacas: r.sin_placas,
    noDispositivo: r.no_dispositivo,
    procedenciaTag: r.procedencia_tag as ProcedenciaTag,
    estado: r.estado as EstadoRegistro,
    folioRecibo: r.folio_recibo,
    createdAt: r.created_at,
    diasDesdeAlta: num(r.dias_desde_alta),
    diasDesdePago: r.dias_desde_pago === null ? null : num(r.dias_desde_pago),
    motivos: (r.motivos ?? []) as MotivoIncompleto[],
  }));
}

// ---- Evidencia de firma (SC-008, bloque 47) ----

const BUCKET_FIRMAS = "firmas";
// Duración de la URL firmada. Corta a propósito: la imagen se pinta de
// inmediato y el enlace deja de servir enseguida si alguien lo copia.
export const FIRMA_URL_SEGUNDOS = 60;

// aceptaciones.firma_url guarda la ruta CON el bucket adelante
// ('firmas/<uuid>.png', ver lib/supabase/api.ts); urlFirmada (lib/firma) le
// quita ese prefijo antes de pedirla al SDK de Storage.

interface EvidenciaRow {
  registro_id: string;
  firma_url: string;
  firma_imagen_sha256: string | null;
  firmante_nombre: string;
  firmante_rol: string;
  hash_algoritmo: string;
  hash_documento: string;
  sello_tiempo: string;
  reglamento_version: number | string | null;
  aviso_version: number | string | null;
  tiene_trazos: boolean;
}

// Evidencia de aceptación de un expediente + URL firmada temporal del PNG.
// Devuelve null cuando no hay nada que mostrar: un rol sin lectura de
// `aceptaciones` —desde el bloque 71, admin y consulta— o un expediente sin
// aceptación (los del banco de QA, que se insertan directo). Con esos roles el
// panel ni siquiera llega aquí: EvidenciaFirma no ofrece el botón, para no dar
// un «no hay evidencia» que sería falso.
//
// Si la metadata se lee pero la URL no se puede emitir, la evidencia se
// devuelve igual con firmaUrl en null y el motivo en firmaError: el hash y las
// versiones conservan su valor probatorio aunque la imagen no cargue.
export async function obtenerEvidenciaFirma(registroId: string): Promise<EvidenciaFirma | null> {
  const { data, error } = await supabaseAuth
    .from("v_evidencia_firma")
    .select("registro_id, firma_url, firma_imagen_sha256, firmante_nombre, firmante_rol, hash_algoritmo, hash_documento, sello_tiempo, reglamento_version, aviso_version, tiene_trazos")
    .eq("registro_id", registroId)
    .maybeSingle();
  if (error) throw new Error(traducirError(error.message));
  if (!data) return null;

  const row = data as unknown as EvidenciaRow;
  let firmaUrl: string | null = null;
  let firmaError: string | null = null;
  try {
    firmaUrl = await urlFirmada(supabaseAuth, row.firma_url, {
      bucket: BUCKET_FIRMAS,
      segundos: FIRMA_URL_SEGUNDOS,
    });
  } catch (e) {
    firmaError = traducirError(e instanceof Error ? e.message : "No se pudo abrir la imagen de la firma.");
  }

  return {
    registroId: row.registro_id,
    firmaUrl,
    firmaError,
    expiraEnSegundos: FIRMA_URL_SEGUNDOS,
    firmanteNombre: row.firmante_nombre,
    firmanteRol: row.firmante_rol as FirmanteRol,
    reglamentoVersion: row.reglamento_version === null ? null : num(row.reglamento_version),
    avisoVersion: row.aviso_version === null ? null : num(row.aviso_version),
    selloTiempo: row.sello_tiempo,
    hashAlgoritmo: row.hash_algoritmo,
    hashDocumento: row.hash_documento,
    firmaImagenSha256: row.firma_imagen_sha256,
    tieneTrazos: row.tiene_trazos,
  };
}

// ---- Acciones (RPCs transaccionales de los bloques 29 y 31) ----

// CC-05: cobrar y validar el tipo de usuario son el mismo acto. El tipo es
// obligatorio (el RPC del bloque 46 rechaza el cobro sin él): es el único
// momento del flujo en que alguien del instituto tiene al titular enfrente.
// Si el tipo confirmado difiere del declarado en el alta, el RPC corrige el
// expediente y deja movimiento en la bitácora. El parentesco del tipo 'otro'
// viaja en el mismo acto, por la misma razón: null en los demás tipos.
export async function registrarPago(
  id: string,
  data: { monto: number; cobradoPor: string; tipoUsuario: TipoUsuario; parentescoOtro: string | null },
): Promise<AccionResultado> {
  return rpc("registrar_pago", {
    p_registro_id: id,
    p_monto: data.monto,
    p_cobrado_por: data.cobradoPor.trim() || null,
    p_tipo_usuario: data.tipoUsuario,
    // PostgREST resuelve la funcion por los NOMBRES de los argumentos: el cobro
    // solo funciona con el bloque que agrega este parametro ya aplicado.
    p_parentesco_otro: data.parentescoOtro?.trim() || null,
  });
}

// Bloque 85: Administracion devuelve el cobro de un expediente que aun no tiene
// TAG instalado. Es el unico filtro, y lo aplica la base: aqui no se decide nada.
// Quien devuelve sale de la sesion; el motivo es obligatorio.
// El recibo es el que la pantalla mostro: si entre la carga y el clic alguien
// devolvio y volvio a cobrar, la base rechaza en vez de devolver otro cobro.
export async function devolverPago(id: string, motivo: string, folioRecibo: string | null): Promise<AccionResultado> {
  return rpc("devolver_pago", { p_registro_id: id, p_motivo: motivo.trim(), p_folio_recibo: folioRecibo });
}

// Instalacion completa en UNA transaccion: asigna estacionamiento y activa el
// TAG. Si cualquier validacion falla, el SQL 31 revierte ambas operaciones.
export async function instalarTagConEstacionamiento(
  id: string,
  noDispositivo: string,
  claves: string[],
  instaladoPor: string,
  // CC-01: TI puede apartar el TAG de la escuela y corregir la procedencia en el
  // mismo acto. Ambos opcionales; el RPC valida (apartar exige procedencia propio).
  opts?: { tagApartadoNo?: string | null; procedenciaTag?: ProcedenciaTag | null },
): Promise<AccionResultado> {
  return rpc("instalar_tag_con_estacionamiento", {
    p_registro_id: id,
    p_no_dispositivo: noDispositivo,
    p_claves: claves,
    p_instalado_por: instaladoPor.trim() || null,
    p_tag_apartado_no: opts?.tagApartadoNo?.trim() || null,
    p_procedencia_tag: opts?.procedenciaTag ?? null,
  });
}

// Actualizacion completa en UNA transaccion. claves=null significa que el
// estacionamiento no cambio; ARRAY[] lo elimina. El wrapper tambien cierra
// correctamente una solicitud cuando el unico cambio fue el estacionamiento.
export async function actualizarRegistroConEstacionamiento(
  id: string,
  cambios: CambiosRegistro,
  claves: string[] | null,
  motivo: string,
  hechoPor: string,
): Promise<AccionResultado> {
  return rpc("actualizar_registro_con_estacionamiento", {
    p_registro_id: id,
    p_claves: claves,
    p_no_dispositivo: cambios.noDispositivo ?? null,
    p_placas: cambios.placas ?? null,
    p_sin_placas: cambios.sinPlacas ?? null,
    p_marca: cambios.marca ?? null,
    p_modelo: cambios.modelo ?? null,
    p_color: cambios.color ?? null,
    p_motivo: motivo.trim() || null,
    p_hecho_por: hechoPor.trim() || null,
    p_procedencia_tag: cambios.procedenciaTag ?? null,
  });
}

// Bloque 88: Administración o Admon. Solo para administrativos; queda en movimientos.
export async function asignarAreaAdmin(id: string, area: AreaAdmin, hechoPor: string | null): Promise<void> {
  const { error } = await supabaseAuth.rpc("asignar_area_admin", { p_registro_id: id, p_area: area, p_hecho_por: hechoPor });
  if (error) throw new Error(traducirError(error.message));
}

export async function darBaja(id: string, motivo: string, hechoPor: string): Promise<AccionResultado> {
  return rpc("dar_baja", {
    p_registro_id: id,
    p_motivo: motivo,
    p_hecho_por: hechoPor.trim() || null,
  });
}

// CC-01: activa el TAG apartado (reposicion). no_dispositivo pasa al numero
// apartado, la procedencia queda en escuela y se limpia la reserva. El TAG
// anterior queda inactivo (RPC usar_tag_apartado, rol ti).
export async function usarTagApartado(id: string, hechoPor: string): Promise<AccionResultado> {
  return rpc("usar_tag_apartado", {
    p_registro_id: id,
    p_hecho_por: hechoPor.trim() || null,
  });
}

// ---- SC-025: inventario de TAGs de la escuela (alta anticipada) ----

interface TagInventarioRow {
  no_dispositivo: string;
  dado_de_alta_por: string;
  dado_de_alta_en: string;
  asignado_a: string | null;
  asignado_en: string | null;
}

// Inventario completo (disponibles y asignados); la pantalla separa por
// asignadoA. Se ordena por alta: los lotes recientes quedan al final.
export async function listTagsInventario(): Promise<TagInventario[]> {
  const { data, error } = await supabaseAuth
    .from("inventario_tags")
    .select("no_dispositivo, dado_de_alta_por, dado_de_alta_en, asignado_a, asignado_en")
    .order("dado_de_alta_en", { ascending: true });
  if (error) throw new Error(traducirError(error.message));
  return (data as unknown as TagInventarioRow[]).map((t) => ({
    noDispositivo: t.no_dispositivo,
    dadoDeAltaPor: t.dado_de_alta_por,
    dadoDeAltaEn: t.dado_de_alta_en,
    asignadoA: t.asignado_a,
    asignadoEn: t.asignado_en,
  }));
}

// Alta de un lote. El RPC valida todo-o-nada y rechaza con la lista exacta de
// numeros invalidos o repetidos (inventario, padron activo o apartados).
export async function altaTagsInventario(numeros: string[], hechoPor: string): Promise<AccionResultado> {
  return rpc("alta_inventario_tags", {
    p_numeros: numeros,
    p_hecho_por: hechoPor.trim() || null,
  });
}

// Retira del inventario un TAG que sigue disponible (capturado por error,
// danado, devuelto). Un TAG asignado no se retira: su historia vive en el
// expediente y el RPC lo rechaza con el folio.
export async function retirarTagInventario(noDispositivo: string, hechoPor: string): Promise<AccionResultado> {
  return rpc("retirar_tag_inventario", {
    p_no_dispositivo: noDispositivo,
    p_hecho_por: hechoPor.trim() || null,
  });
}

// ---- SC-027: mapa tarjeta -> ID de ZK guardado en la base (bloque 54) ----

interface TarjetaZkRow {
  no_dispositivo: string;
  zk_id: string;
  cargado_en: string;
  cargado_por: string;
}

export async function listMapaZk(): Promise<TarjetaZk[]> {
  const { data, error } = await supabaseAuth
    .from("zk_tarjetas")
    .select("no_dispositivo, zk_id, cargado_en, cargado_por")
    .limit(10000);
  if (error) throw new Error(traducirError(error.message));
  return (data as unknown as TarjetaZkRow[]).map((t) => ({
    noDispositivo: t.no_dispositivo,
    zkId: t.zk_id,
    cargadoEn: t.cargado_en,
    cargadoPor: t.cargado_por,
  }));
}

// Reemplaza el mapa completo con el export de ZK ya leido por el cliente.
export async function cargarMapaZk(filas: { tarjeta: string; id: string }[], hechoPor: string): Promise<AccionResultado> {
  return rpc("cargar_mapa_zk", {
    p_filas: filas,
    p_hecho_por: hechoPor.trim() || null,
  });
}

// (La captura desde hoja fisica —RPC capturar_expediente_ti, bloque 53— quedo
// disponible en la base pero sin pantalla: Gerardo decidio el 8-sep que TI no
// captura expedientes; el alta es del titular por el formulario publico.)

// Cierra una solicitud improcedente SIN tocar el registro (motivo obligatorio).
// Tambien cierra notas (vinculadas o no): sirve para cerrar una nota ya atendida
// o para descartar spam del buzon.
export async function descartarSolicitud(solicitudId: string, motivo: string, hechoPor: string): Promise<AccionResultado> {
  return rpc("descartar_solicitud", {
    p_solicitud_id: solicitudId,
    p_motivo: motivo,
    p_hecho_por: hechoPor.trim() || null,
  });
}

// Empata una nota del buzon (SC-003) con un expediente (RPC vincular_nota, rol
// ti). TI corrobora el tramite al vincular: si p_tramite difiere del que pidio el
// cliente, el RPC actualiza tramite_solicitado para que caiga en la cola correcta
// y el auto-cierre (bloque 38) coincida. La nota queda pendiente bajo el
// expediente hasta que TI ejecute el tramite.
export async function vincularNota(
  solicitudId: string,
  registroId: string,
  tramite: TramiteSolicitado,
  hechoPor: string,
): Promise<AccionResultado> {
  return rpc("vincular_nota", {
    p_solicitud_id: solicitudId,
    p_registro_id: registroId,
    p_tramite: tramite,
    p_hecho_por: hechoPor.trim() || null,
  });
}

// ---- Corte de caja / finanzas (bloque 42, rol admin/super) ----

// Numeric de Postgres puede llegar como number (dentro de jsonb) o como string
// (en un select directo, para no perder precision). Normaliza a number.
function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

interface DiaCajaRow { dia: unknown; cantidad: unknown; subtotal: unknown; devoluciones?: unknown; devuelto?: unknown }

// estado_caja: que hay en la caja ahora (sin cortar) + acumulados de venta.
// Todo lo temporal lo calcula la BD en hora local (nunca sobre pagos.fecha).
export async function obtenerEstadoCaja(): Promise<EstadoCaja> {
  const { data, error } = await supabaseAuth.rpc("estado_caja", {});
  if (error) throw new Error(traducirError(error.message));
  const d = (data ?? {}) as Record<string, unknown>;
  const dias = Array.isArray(d.desglosePorDia) ? (d.desglosePorDia as DiaCajaRow[]) : [];
  return {
    totalEnCaja: num(d.totalEnCaja),
    // Bloque 85. Sin el bloque no vienen: lo cobrado es todo lo que hay.
    cobradoEnCaja: d.cobradoEnCaja === undefined ? num(d.totalEnCaja) : num(d.cobradoEnCaja),
    devueltoEnCaja: num(d.devueltoEnCaja),
    devolucionesEnCaja: num(d.devolucionesEnCaja),
    pagosEnCaja: num(d.pagosEnCaja),
    diasDeCobro: num(d.diasDeCobro),
    primerCobro: (d.primerCobro as string | null) ?? null,
    desglosePorDia: dias.map((x): DiaCaja => ({
      dia: String(x.dia),
      cantidad: num(x.cantidad),
      subtotal: num(x.subtotal),
      devoluciones: num(x.devoluciones),
      devuelto: num(x.devuelto),
    })),
    ultimoCorte: (d.ultimoCorte as string | null) ?? null,
    vendidoMes: num(d.vendidoMes),
    vendidoHistorico: num(d.vendidoHistorico),
  };
}

// cortar_caja: cierra el corte y reestablece la caja. La BD valida el rol admin,
// la diferencia sin explicar y el corte de una caja vacia; los errores llegan en
// espanol y se muestran tal cual.
export async function cortarCaja(
  efectivoContado: number,
  cortadoPor: string,
  observaciones: string,
): Promise<ResultadoCorte> {
  const { data, error } = await supabaseAuth.rpc("cortar_caja", {
    p_efectivo_contado: efectivoContado,
    p_cortado_por: cortadoPor.trim() || null,
    p_observaciones: observaciones.trim() || null,
  });
  if (error) throw new Error(traducirError(error.message));
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    id: String(d.id),
    folioCorte: String(d.folioCorte),
    totalEsperado: num(d.totalEsperado),
    efectivoContado: num(d.efectivoContado),
    diferencia: num(d.diferencia),
    pagosCortados: num(d.pagosCortados),
    diasDeCobro: num(d.diasDeCobro),
    totalCobrado: d.totalCobrado === undefined ? num(d.totalEsperado) : num(d.totalCobrado),
    totalDevuelto: num(d.totalDevuelto),
    devolucionesCortadas: num(d.devolucionesCortadas),
  };
}

interface CorteRow {
  id: string;
  folio_corte: string;
  cortado_por: string;
  periodo_desde: string | null;
  periodo_hasta: string;
  total_esperado: number | string;
  cantidad_pagos: number | string;
  total_devuelto: number | string;
  cantidad_devoluciones: number | string;
  dias_de_cobro: number | string;
  efectivo_contado: number | string;
  diferencia: number | string;
  observaciones: string | null;
  created_at: string;
}

// Historial de cortes (mas recientes primero). Lectura directa: la RLS solo la
// permite a admin/super (bloque 42), asi que ti y consulta reciben 0 filas.
export async function listCortes(): Promise<CorteCaja[]> {
  const { data, error } = await supabaseAuth
    .from("cortes_caja")
    .select("id, folio_corte, cortado_por, periodo_desde, periodo_hasta, total_esperado, cantidad_pagos, total_devuelto, cantidad_devoluciones, dias_de_cobro, efectivo_contado, diferencia, observaciones, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(traducirError(error.message));
  return (data as unknown as CorteRow[]).map((c) => ({
    id: c.id,
    folioCorte: c.folio_corte,
    cortadoPor: c.cortado_por,
    periodoDesde: c.periodo_desde,
    periodoHasta: c.periodo_hasta,
    totalEsperado: num(c.total_esperado),
    cantidadPagos: num(c.cantidad_pagos),
    totalDevuelto: num(c.total_devuelto),
    cantidadDevoluciones: num(c.cantidad_devoluciones),
    diasDeCobro: num(c.dias_de_cobro),
    efectivoContado: num(c.efectivo_contado),
    diferencia: num(c.diferencia),
    observaciones: c.observaciones,
    createdAt: c.created_at,
  }));
}

interface PagoRecienteRow {
  folio_recibo: string | null;
  monto: number | string;
  created_at: string;
  cobrado_por: string | null;
  corte_id: string | null;
  devuelto_en: string | null;           // bloque 85
  devuelto_por: string | null;
  devolucion_motivo: string | null;
  devolucion_corte_id: string | null;
  // Embed to-one via FK: PostgREST lo entrega como objeto; se contempla el array por robustez.
  registros:
    | { folio: string; usuario_nombre_completo: string }
    | { folio: string; usuario_nombre_completo: string }[]
    | null;
}

// Cobros (tickets) de UN corte, o de la caja actual cuando se pasa null
// (corte_id is null). Se carga bajo demanda al expandir cada corte: asi solo se
// traen los cobros de ese corte y no todo el historial. Tope alto por seguridad.
// La RLS de pagos deja leer a admin/ti/consulta/super; esta vista solo la usa
// Finanzas (admin/super).
//
// Bloque 85: el corte tambien lista sus SALIDAS. Una devolucion entra al corte
// en que se devolvio el dinero (devolucion_corte_id), que puede no ser el del
// cobro. Por eso son dos consultas: los cobros del corte y las devoluciones del
// corte, en una sola lista ordenada por cuando paso cada cosa.
export async function listPagosDeCorte(corteId: string | null): Promise<PagoReciente[]> {
  const COLS = "folio_recibo, monto, created_at, cobrado_por, corte_id, devuelto_en, devuelto_por, devolucion_motivo, devolucion_corte_id, registros ( folio, usuario_nombre_completo )";
  let cobros = supabaseAuth.from("pagos").select(COLS).order("created_at", { ascending: false }).limit(1000);
  cobros = corteId === null ? cobros.is("corte_id", null) : cobros.eq("corte_id", corteId);
  let salidas = supabaseAuth.from("pagos").select(COLS).not("devuelto_en", "is", null).order("devuelto_en", { ascending: false }).limit(1000);
  salidas = corteId === null ? salidas.is("devolucion_corte_id", null) : salidas.eq("devolucion_corte_id", corteId);
  const [c, s] = await Promise.all([cobros, salidas]);
  if (c.error) throw new Error(traducirError(c.error.message));
  if (s.error) throw new Error(traducirError(s.error.message));
  const base = (p: PagoRecienteRow) => {
    const reg = Array.isArray(p.registros) ? p.registros[0] : p.registros;
    return { folioRecibo: p.folio_recibo, monto: num(p.monto), registroFolio: reg?.folio ?? null, usuarioNombre: reg?.usuario_nombre_completo ?? null };
  };
  const filasCobro: PagoReciente[] = (c.data as unknown as PagoRecienteRow[]).map((p) => ({
    ...base(p), fecha: p.created_at, cobradoPor: p.cobrado_por, cortado: p.corte_id !== null, devolucion: false, motivo: null,
  }));
  const filasSalida: PagoReciente[] = (s.data as unknown as PagoRecienteRow[]).map((p) => ({
    ...base(p), fecha: p.devuelto_en ?? p.created_at, cobradoPor: p.devuelto_por, cortado: p.devolucion_corte_id !== null,
    devolucion: true, motivo: p.devolucion_motivo,
  }));
  return [...filasCobro, ...filasSalida].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ---- Medicion de la instalacion (metrica que pidio Contabilidad) ----

interface InstalacionRow {
  folio: string;
  fecha_instalacion: string;
  created_at: string;
  instalado_en: string | null;
  instalado_por_email: string | null;
  // `registros` es el padre, asi que PostgREST entrega los pagos como ARRAY
  // (uno-a-muchos, igual que en SELECT_REGISTRO). Se admite el objeto suelto
  // por si la relacion se declara to-one algun dia.
  pagos:
    | { created_at: string; devuelto_en: string | null }
    | { created_at: string; devuelto_en: string | null }[]
    | null;
}

// Los expedientes YA INSTALADOS, con los tres sellos del embudo.
//
// Se filtra por `fecha_instalacion`, no por `instalado_en`, A PROPOSITO: la
// hora de instalacion solo existe desde el bloque 68 (15-sep-2026), asi que
// filtrar por ella escondería las instalaciones anteriores y el tablero diria
// que la escuela instalo menos TAGs de los que instalo. Se traen todas y la
// pantalla distingue cuales se pueden medir.
//
// Sin RPC nuevo: la RLS de `registros` y de `pagos` ya deja leer a los roles
// del panel, y las medianas se calculan en el cliente sobre unas decenas de
// filas. No hace falta bloque SQL para esto.
//
// El limite de 2000 es holgura, no un tope de negocio: el padron completo del
// colegio no llega a mil vehiculos. Si algun dia lo rozara, la medicion tendria
// que bajar a la base (un RPC que devuelva las medianas ya calculadas) en vez de
// subir este numero, porque a esa altura ya no conviene traer todas las filas.
export async function listInstalaciones(): Promise<InstalacionMedida[]> {
  const { data, error } = await supabaseAuth
    .from("registros")
    .select("folio, fecha_instalacion, created_at, instalado_en, instalado_por_email, pagos ( created_at, devuelto_en )")
    .not("fecha_instalacion", "is", null)
    .order("instalado_en", { ascending: false, nullsFirst: false })
    .limit(2000);
  if (error) throw new Error(traducirError(error.message));
  return (data as unknown as InstalacionRow[]).map((r) => {
    // El PRIMER cobro, no un cobro cualquiera: un expediente puede tener mas de
    // uno (reinstalacion, segundo TAG) y PostgREST no garantiza el orden del
    // embed. El que arranca la espera hasta la instalacion es el mas antiguo.
    // Bloque 85: un cobro devuelto no arranca ninguna espera; cuenta el vigente.
    const pago = Array.isArray(r.pagos)
      ? [...r.pagos].filter((p) => !p.devuelto_en).sort(porCreatedAt)[0]
      : r.pagos && !r.pagos.devuelto_en ? r.pagos : undefined;
    return {
      folio: r.folio,
      fechaInstalacion: r.fecha_instalacion,
      altaEn: r.created_at,
      cobradoEn: pago?.created_at ?? null,
      instaladoEn: r.instalado_en,
      instaladoPorEmail: r.instalado_por_email,
    };
  });
}

// ---- Permiso del conductor menor de edad (bloque 75) ----

// Administracion lo acepta al cobrar. El RPC exige el rol admin por dentro:
// aqui no se decide nada de permisos, solo se llama.
export async function validarPermisoMenor(registroId: string, hechoPor: string): Promise<AccionResultado> {
  return rpc("validar_permiso_menor", {
    p_registro_id: registroId,
    p_hecho_por: hechoPor.trim() || null,
  });
}

// URL temporal para ver la foto. El bucket es privado y la politica del bloque
// 75 solo deja leerlo a admin y super con aal2: a cualquier otro rol Storage le
// niega la firma de la URL, que es justo lo que se quiere.
export async function urlPermiso(ruta: string): Promise<string> {
  return urlFirmada(supabaseAuth, ruta, { bucket: "permisos", segundos: FIRMA_URL_SEGUNDOS });
}

// ---- Utilidades de sesion ----

// "gerardo.sanchez@..." -> "Gerardo Sanchez". Prellenado editable de
// "Cobrado por" / "Instalado por": comodo en el 99% de los casos y corregible
// cuando atiende alguien mas desde la misma sesion.
export function nombreDesdeEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/* ===================================================================== */
/* Pestaña Estacionamiento (SC-031, bloques 78-80)                       */
/* ===================================================================== */

/**
 * El padrón, reducido a lo que la pestaña Estacionamiento necesita.
 *
 * NO SE REUSA `listRegistros()` A PROPOSITO: ese trae nombre, placas, pagos,
 * movimientos y solicitudes de cada expediente, y esta pantalla dibuja agregados.
 * Traer dos mil nombres a una pantalla que no los muestra es cargar datos
 * personales sin motivo, y el motivo es la mitad de la justificacion para tenerlos.
 *
 * Trae el TAG porque es la llave con la bitácora, el tipo porque resuelve el grupo,
 * y el origen porque distingue un alta de SATAG de un expediente migrado.
 */
export interface PadronEstacionamiento {
  folio: string;
  noDispositivo: string;
  tipoUsuario: TipoUsuario;
  /** Bloque 88: separa Administración de Admon dentro del panel. */
  areaAdmin: AreaAdmin | null;
  /** Desde cuando puede abrir la pluma: instalacion o, si no consta, alta. Para el semaforo de Casos. */
  desde: string | null;
  estado: EstadoRegistro;
  origenExpediente: OrigenExpediente;
  estacionamientos: string[];
  /** Los TAGs que el expediente uso antes (cambios y reposiciones): sus pasadas viejas son suyas. */
  tagsAnteriores: string[];
}

interface PadronEstRow {
  folio: string;
  no_dispositivo: string;
  tipo_usuario: string;
  area_admin: string | null;
  fecha_instalacion: string | null;
  created_at: string | null;
  estado: string;
  origen_expediente: string | null;
  registro_estacionamientos: { estacionamiento_clave: string }[] | null;
  movimientos: { no_dispositivo_anterior: string | null }[] | null;
}

export async function listPadronEstacionamiento(): Promise<PadronEstacionamiento[]> {
  const { data, error } = await supabaseAuth
    .from("registros")
    .select("folio, no_dispositivo, tipo_usuario, area_admin, fecha_instalacion, created_at, estado, origen_expediente, registro_estacionamientos ( estacionamiento_clave ), movimientos ( no_dispositivo_anterior )")
    .not("no_dispositivo", "is", null)
    // El padron completo son ~2,900 expedientes. El tope es holgura, no negocio: si
    // algun dia se rozara, la resolucion del rol baja a la base en vez de subir este
    // numero, por la misma razon escrita mas arriba para las medianas.
    .limit(5000);
  if (error) throw new Error(traducirError(error.message));
  return (data as unknown as PadronEstRow[]).map((r) => ({
    folio: r.folio,
    noDispositivo: r.no_dispositivo,
    tipoUsuario: r.tipo_usuario as TipoUsuario,
    areaAdmin: (r.area_admin ?? null) as AreaAdmin | null,
    desde: r.fecha_instalacion ?? r.created_at?.slice(0, 10) ?? null,
    estado: r.estado as EstadoRegistro,
    origenExpediente: (r.origen_expediente ?? "satag") as OrigenExpediente,
    estacionamientos: (r.registro_estacionamientos ?? []).map((e) => e.estacionamiento_clave).sort(),
    tagsAnteriores: [
      ...new Set(
        (r.movimientos ?? [])
          .map((m) => m.no_dispositivo_anterior?.trim() ?? "")
          .filter((t) => t !== "" && t !== r.no_dispositivo),
      ),
    ],
  }));
}

/** Las ventanas de bitácora ya cargadas. Son pocas filas: una por archivo. */
export interface ImportacionZk {
  id: string;
  archivo: string;
  sha256: string;
  filasArchivo: number;
  filasConTarjeta: number;
  topeAlcanzado: boolean;
  desde: string | null;
  hasta: string | null;
  huecoDias: number | null;
  importadoPor: string;
  importadoEn: string;
}

interface ImportacionRow {
  id: string;
  archivo: string;
  sha256: string;
  filas_archivo: number;
  filas_con_tarjeta: number;
  tope_alcanzado: boolean;
  desde: string | null;
  hasta: string | null;
  hueco_dias: string | number | null;
  importado_por: string;
  importado_en: string;
}

export async function listImportacionesZk(): Promise<ImportacionZk[]> {
  const { data, error } = await supabaseAuth
    .from("zk_importaciones")
    .select("id, archivo, sha256, filas_archivo, filas_con_tarjeta, tope_alcanzado, desde, hasta, hueco_dias, importado_por, importado_en")
    .order("hasta", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(traducirError(error.message));
  return (data as unknown as ImportacionRow[]).map((r) => ({
    id: r.id,
    archivo: r.archivo,
    sha256: r.sha256,
    filasArchivo: r.filas_archivo,
    filasConTarjeta: r.filas_con_tarjeta,
    topeAlcanzado: r.tope_alcanzado,
    desde: r.desde,
    hasta: r.hasta,
    huecoDias: num(r.hueco_dias),
    importadoPor: r.importado_por,
    importadoEn: r.importado_en,
  }));
}

/**
 * Manda la bitácora a la base, por lotes.
 *
 * POR LOTES Y NO DE UN GOLPE: una ventana son ~9,600 filas con tarjeta, y mandarlas
 * en un solo `jsonb` deja a la pantalla sin saber nada durante todo el viaje y sin
 * forma de reanudar si se corta. El renglón de la importación se crea en la primera
 * llamada y las demás cuelgan del mismo `sha256`, así que una carga interrumpida
 * queda identificable y se completa repitiéndola: `id_evento` es llave primaria y
 * lo que ya entró no entra dos veces.
 */
export async function cargarEventosZk(
  meta: Record<string, unknown>,
  filas: Record<string, unknown>[],
  hechoPor: string | null,
  onAvance?: (hechas: number, total: number) => void,
): Promise<{ insertados: number; yaEstaban: number }> {
  const LOTE = 1000;
  let insertados = 0;
  let yaEstaban = 0;
  for (let i = 0; i < filas.length; i += LOTE) {
    const { data, error } = await supabaseAuth.rpc("cargar_eventos_zk", {
      p_meta: meta,
      p_filas: filas.slice(i, i + LOTE),
      p_hecho_por: hechoPor,
    });
    if (error) throw new Error(traducirError(error.message));
    const r = data as { insertados?: number; yaEstaban?: number };
    insertados += r?.insertados ?? 0;
    yaEstaban += r?.yaEstaban ?? 0;
    onAvance?.(Math.min(i + LOTE, filas.length), filas.length);
  }
  return { insertados, yaEstaban };
}

// ---- Los pasos de una persona por la pluma (ficha de persona, 2-oct-2026) ----

/** Un acceso concedido de la bitacora, sin ruido: ni rechazos ni rafagas del lector. */
export interface PasoZk {
  idEvento: number;
  /** Hora de pared del controlador, tal como la guardo el bloque 78. */
  ocurrioEn: string;
  lote: string;
  sentido: "entrada" | "salida";
  tarjeta: string;
}

interface PasoRow {
  id_evento: number;
  ocurrio_en: string;
  lote: string;
  sentido: string;
  tarjeta: string;
}

/**
 * Los ultimos pasos de un conjunto de tarjetas: las de una misma persona, con el
 * TAG vigente y los que tuvo antes.
 *
 * La RLS de `zk_eventos` (bloque 78) la leen ti, contador y super; a los demas la
 * base les devuelve cero filas, y la ficha lo dice en vez de dibujar una semana
 * vacia como si la persona no hubiera venido. Se piden los mas recientes, en orden
 * descendente, y se devuelven en orden de tiempo: la ficha dibuja de izquierda a
 * derecha.
 */
export async function listPasosDeTarjetas(tarjetas: string[], tope = 400): Promise<PasoZk[]> {
  const limpias = [...new Set(tarjetas.map((t) => t.replace(/\D/g, "")).filter(Boolean))];
  if (limpias.length === 0) return [];
  const { data, error } = await supabaseAuth
    .from("zk_eventos")
    .select("id_evento, ocurrio_en, lote, sentido, tarjeta")
    .in("tarjeta", limpias)
    .eq("concedido", true)
    .eq("repeticion", false)
    .order("ocurrio_en", { ascending: false })
    .limit(tope);
  if (error) throw new Error(traducirError(error.message));
  return (data as unknown as PasoRow[])
    .map((r) => ({
      idEvento: r.id_evento,
      ocurrioEn: r.ocurrio_en,
      lote: r.lote,
      sentido: (r.sentido === "salida" ? "salida" : "entrada") as "entrada" | "salida",
      tarjeta: r.tarjeta,
    }))
    .reverse();
}

/**
 * Los eventos guardados, para medir SIN el archivo (2-oct-2026).
 *
 * Pagina con `.range()` y sigue hasta una pagina VACIA, no hasta una «corta»: si
 * PostgREST tuviera un tope menor que la pagina pedida, una pagina corta no seria la
 * ultima y el panel mediria media ventana sin avisar. Trae solo lo que la medicion
 * usa; `descripcion` no se guarda y se devuelve vacia.
 *
 * `desde` acota en el tiempo (hora de pared del controlador, como `ocurrio_en`):
 * una temporada entera son cientos de miles de filas y la pantalla no las necesita
 * todas para contar el dia tipico. El tope de paginas es un seguro declarado, no
 * un limite de negocio: si se toca, la respuesta lo dice en `truncado`.
 */
export async function listEventosZk(
  desde: string | null,
  onAvance?: (filas: number) => void,
  topePaginas = 120,
): Promise<{ eventos: EventoZk[]; truncado: boolean }> {
  // Produccion sirve hasta 5,000 filas por peticion y local 1,000: se pide el
  // maximo y se avanza por lo que de verdad llego, asi que el tope que aplique no
  // cambia el resultado, solo cuantas vueltas da.
  const PAGINA = 5000;
  const eventos: EventoZk[] = [];
  let truncado = false;
  for (let pagina = 0; ; pagina += 1) {
    if (pagina >= topePaginas) {
      truncado = true;
      break;
    }
    let q = supabaseAuth
      .from("zk_eventos")
      .select("id_evento, ocurrio_en, lote, sentido, tarjeta, concedido, repeticion, departamento_evento")
      .order("ocurrio_en", { ascending: true })
      .order("id_evento", { ascending: true })
      .range(eventos.length, eventos.length + PAGINA - 1);
    if (desde) q = q.gte("ocurrio_en", desde);
    const { data, error } = await q;
    if (error) throw new Error(traducirError(error.message));
    const filas = (data ?? []) as unknown as {
      id_evento: number; ocurrio_en: string; lote: string; sentido: string; tarjeta: string;
      concedido: boolean; repeticion: boolean; departamento_evento: string | null;
    }[];
    if (filas.length === 0) break;
    for (const r of filas) {
      eventos.push({
        idEvento: Number(r.id_evento),
        // Postgres devuelve el timestamp sin zona como «2026-09-22T07:18:00»; el
        // parser y la medicion trabajan con «2026-09-22 07:18:00».
        ocurrioEn: String(r.ocurrio_en).replace("T", " ").slice(0, 19),
        lote: r.lote as EventoZk["lote"],
        sentido: r.sentido === "salida" ? "salida" : "entrada",
        tarjeta: r.tarjeta,
        descripcion: "",
        concedido: r.concedido,
        departamentoEvento: r.departamento_evento ?? "",
        repeticion: r.repeticion,
      });
    }
    onAvance?.(eventos.length);
  }
  return { eventos, truncado };
}

// ---- El padron de personas de ZK, guardado (bloque 83) ----

/** El ultimo export «Personas» que se cargo: lo que la pantalla dice de donde viene el padron. */
export interface CargaPadronZk {
  id: string;
  archivo: string;
  personas: number;
  exportadoEn: string | null;
  cargadoPor: string;
  cargadoEn: string;
}

export async function getUltimaCargaPadronZk(): Promise<CargaPadronZk | null> {
  const { data, error } = await supabaseAuth
    .from("zk_padron_cargas")
    .select("id, archivo, personas, exportado_en, cargado_por, cargado_en")
    .order("cargado_en", { ascending: false })
    .limit(1);
  if (error) throw new Error(traducirError(error.message));
  const r = (data as { id: string; archivo: string; personas: number; exportado_en: string | null; cargado_por: string; cargado_en: string }[])[0];
  return r ? { id: r.id, archivo: r.archivo, personas: r.personas, exportadoEn: r.exportado_en, cargadoPor: r.cargado_por, cargadoEn: r.cargado_en } : null;
}

/**
 * Las personas vigentes del padron guardado. Son ~2,900 filas chicas: cabe en una
 * peticion en produccion (tope 5,000) y en tres en local; se pagina igual que la
 * bitacora, hasta una pagina vacia. Sin placa: la base no la guarda.
 */
export async function listPadronZk(): Promise<PersonaZk[]> {
  const PAGINA = 5000;
  const out: PersonaZk[] = [];
  for (let pagina = 0; pagina < 20; pagina += 1) {
    const { data, error } = await supabaseAuth
      .from("zk_padron")
      .select("tarjeta, nombre, departamento_id, departamento")
      .eq("vigente", true)
      .order("tarjeta", { ascending: true })
      .range(out.length, out.length + PAGINA - 1);
    if (error) throw new Error(traducirError(error.message));
    const filas = (data ?? []) as { tarjeta: string; nombre: string; departamento_id: string; departamento: string }[];
    if (filas.length === 0) break;
    for (const r of filas) out.push({ tarjeta: r.tarjeta, nombre: r.nombre, departamentoId: r.departamento_id, departamento: r.departamento, nombres: "", apellidos: "", placa: "" });
  }
  return out;
}

/** Manda el export entero en una llamada; el RPC escribe solo lo que cambia (rol ti). */
export interface MetaPadronZk {
  archivo: string;
  sha256: string;
  filasArchivo: number;
  exportadoEn: string | null;
  /** Repetir la llamada con esto en `true` es la unica forma de pasar el freno. */
  forzar?: boolean;
}

/** `nombres`, `apellidos` y `placa` los guarda el bloque 86; un RPC anterior los ignora sin fallar. */
export type FilaPadronZk = {
  tarjeta: string;
  nombre: string;
  departamentoId: string;
  departamento: string;
  nombres: string;
  apellidos: string;
  placa: string;
};

/**
 * Lo que contesta el RPC (bloque 84). O escribio, o FRENO sin escribir nada y pide
 * que una persona confirme: `retira_muchos` cuando el archivo dejaria fuera a mas
 * de 20 personas y mas del 20 % de las vigentes (un export filtrado), y
 * `export_anterior` cuando el archivo es mas viejo que el ultimo cargado (puede ser
 * el bueno para deshacer un error, o uno elegido por equivocacion).
 */
export type RespuestaCargaPadronZk =
  | { requiereConfirmacion: false; yaEstaba: boolean; insertadas: number; actualizadas: number; retiradas: number; vigentes: number }
  | { requiereConfirmacion: true; motivos: ("retira_muchos" | "export_anterior")[]; retiraria: number; vigentes: number; exportadoEn: string | null; ultimoExportadoEn: string | null };

export async function cargarPadronZk(meta: MetaPadronZk, filas: FilaPadronZk[], hechoPor: string | null): Promise<RespuestaCargaPadronZk> {
  const { data, error } = await supabaseAuth.rpc("cargar_padron_zk", { p_meta: meta, p_filas: filas, p_hecho_por: hechoPor });
  if (error) throw new Error(traducirError(error.message));
  const r = (data ?? {}) as {
    requiereConfirmacion?: boolean; motivos?: string[]; retiraria?: number; exportadoEn?: string | null; ultimoExportadoEn?: string | null;
    yaEstaba?: boolean; insertadas?: number; actualizadas?: number; retiradas?: number; vigentes?: number;
  };
  if (r.requiereConfirmacion) {
    return {
      requiereConfirmacion: true,
      motivos: (r.motivos ?? []).filter((m): m is "retira_muchos" | "export_anterior" => m === "retira_muchos" || m === "export_anterior"),
      retiraria: r.retiraria ?? 0,
      vigentes: r.vigentes ?? 0,
      exportadoEn: r.exportadoEn ?? null,
      ultimoExportadoEn: r.ultimoExportadoEn ?? null,
    };
  }
  return { requiereConfirmacion: false, yaEstaba: r.yaEstaba ?? false, insertadas: r.insertadas ?? 0, actualizadas: r.actualizadas ?? 0, retiradas: r.retiradas ?? 0, vigentes: r.vigentes ?? 0 };
}

/* ------------------------------------------------------------------ casos (bloque 89) */

const SELECT_CASO = `
  id, numero, tipo, registro_id, tarjeta, titulo, detalle, evidencia, estado, origen, regla, clave,
  preguntar_al_presentarse, creado_por, creado_en, actualizado_en, cerrado_por, cerrado_en, cierre_nota,
  registro:registros ( folio, usuario_nombre_completo )
`;

interface CasoRow {
  id: string; numero: number; tipo: string; registro_id: string | null; tarjeta: string | null;
  titulo: string; detalle: string; evidencia: Record<string, unknown> | null; estado: string; origen: string;
  regla: string | null; clave: string | null; preguntar_al_presentarse: boolean; creado_por: string;
  creado_en: string; actualizado_en: string; cerrado_por: string | null; cerrado_en: string | null;
  cierre_nota: string | null;
  // El FK es a-uno, pero se admite la lista por si PostgREST la devuelve asi.
  registro: { folio: string; usuario_nombre_completo: string } | { folio: string; usuario_nombre_completo: string }[] | null;
}

function mapCaso(r: CasoRow): CasoGuardado {
  const reg = Array.isArray(r.registro) ? r.registro[0] ?? null : r.registro;
  return {
    id: r.id,
    numero: Number(r.numero),
    tipo: r.tipo,
    registroId: r.registro_id,
    tarjeta: r.tarjeta,
    titulo: r.titulo,
    detalle: r.detalle,
    evidencia: r.evidencia ?? {},
    estado: r.estado as EstadoCasoGuardado,
    origen: r.origen as OrigenCaso,
    regla: r.regla,
    clave: r.clave,
    preguntarAlPresentarse: r.preguntar_al_presentarse,
    creadoPor: r.creado_por,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
    cerradoPor: r.cerrado_por,
    cerradoEn: r.cerrado_en,
    cierreNota: r.cierre_nota,
    folio: reg?.folio ?? null,
    nombre: reg?.usuario_nombre_completo ?? null,
  };
}

/** El catalogo de tipos de caso (bloque 89). Agregar un tipo es un insert, no un cambio de cliente. */
export async function listTiposCaso(): Promise<TipoCasoCatalogo[]> {
  const { data, error } = await supabaseAuth
    .from("casos_tipos")
    .select("tipo, titulo, categoria, que_hacer, automatico, orden")
    .order("orden", { ascending: true });
  if (error) throw new Error(traducirError(error.message));
  return ((data ?? []) as { tipo: string; titulo: string; categoria: string; que_hacer: string; automatico: boolean; orden: number }[]).map((t) => ({
    tipo: t.tipo, titulo: t.titulo, categoria: t.categoria, queHacer: t.que_hacer, automatico: t.automatico, orden: t.orden,
  }));
}

/**
 * Los casos guardados, con el folio y el nombre del expediente cuando lo tienen.
 * Sin filtro de persona trae todos (la pestana filtra en el cliente: son centenas);
 * con `registroId` y/o `tarjetas` trae los de esa persona, por su expediente o por
 * cualquiera de sus TAGs.
 */
export async function listCasos(filtro: { registroId?: string; tarjetas?: string[] } = {}): Promise<CasoGuardado[]> {
  let q = supabaseAuth.from("casos").select(SELECT_CASO).order("actualizado_en", { ascending: false }).limit(5000);
  if (filtro.registroId !== undefined || filtro.tarjetas !== undefined) {
    const partes: string[] = [];
    if (filtro.registroId) partes.push(`registro_id.eq.${filtro.registroId}`);
    // Los TAGs son solo digitos: nada que escapar en el filtro.
    const tags = (filtro.tarjetas ?? []).filter((t) => /^[0-9]{4,12}$/.test(t));
    if (tags.length > 0) partes.push(`tarjeta.in.(${tags.join(",")})`);
    if (partes.length === 0) return [];
    q = q.or(partes.join(","));
  }
  const { data, error } = await q;
  if (error) throw new Error(traducirError(error.message));
  return ((data ?? []) as unknown as CasoRow[]).map(mapCaso);
}

/** El historial de un caso, del mas viejo al mas nuevo. */
export async function listNotasCaso(casoId: string): Promise<NotaCaso[]> {
  const { data, error } = await supabaseAuth
    .from("casos_notas")
    .select("id, caso_id, clase, estado_antes, estado_despues, nota, hecho_por, hecho_en")
    .eq("caso_id", casoId)
    .order("hecho_en", { ascending: true });
  if (error) throw new Error(traducirError(error.message));
  return ((data ?? []) as { id: string; caso_id: string; clase: string; estado_antes: string | null; estado_despues: string | null; nota: string; hecho_por: string; hecho_en: string }[]).map((n) => ({
    id: n.id,
    casoId: n.caso_id,
    clase: n.clase as NotaCaso["clase"],
    estadoAntes: n.estado_antes as EstadoCasoGuardado | null,
    estadoDespues: n.estado_despues as EstadoCasoGuardado | null,
    nota: n.nota,
    hechoPor: n.hecho_por,
    hechoEn: n.hecho_en,
  }));
}

export interface EntradaCaso {
  tipo: string;
  titulo: string;
  detalle?: string;
  registroId?: string | null;
  tarjeta?: string | null;
  evidencia?: Record<string, unknown>;
  preguntar?: boolean;
  /** Con clave no duplica: si ya existe, el RPC devuelve el mismo caso con `yaExistia`. */
  clave?: string | null;
  origen?: OrigenCaso;
  regla?: string | null;
}

export async function abrirCaso(e: EntradaCaso, hechoPor: string | null): Promise<{ id: string; numero: number; yaExistia: boolean }> {
  const { data, error } = await supabaseAuth.rpc("abrir_caso", {
    p_tipo: e.tipo,
    p_titulo: e.titulo,
    p_detalle: e.detalle ?? "",
    p_registro_id: e.registroId ?? null,
    p_tarjeta: e.tarjeta ?? null,
    p_evidencia: e.evidencia ?? {},
    p_preguntar: e.preguntar ?? false,
    p_clave: e.clave ?? null,
    p_origen: e.origen ?? "manual",
    p_regla: e.regla ?? null,
    p_hecho_por: hechoPor,
  });
  if (error) throw new Error(traducirError(error.message));
  const r = (data ?? {}) as { id?: string; numero?: number; yaExistia?: boolean };
  return { id: r.id ?? "", numero: Number(r.numero ?? 0), yaExistia: r.yaExistia === true };
}

/** Una nota, un cambio de estado o las dos. Cerrar (resuelto/descartado) exige nota; reabrir limpia el cierre. */
export async function anotarCaso(casoId: string, nota: string, estado: EstadoCasoGuardado | null, hechoPor: string | null): Promise<void> {
  const { error } = await supabaseAuth.rpc("anotar_caso", { p_caso: casoId, p_nota: nota, p_estado: estado, p_hecho_por: hechoPor });
  if (error) throw new Error(traducirError(error.message));
}

/**
 * Da de alta, como `migracion_zk`, cada credencial que abrio la pluma y no tiene
 * expediente (bloque 86, rol ti). Se llama despues de guardar la bitacora o el
 * padron de ZK; repetirla no duplica nada.
 */
export interface RespuestaAltasZk {
  altas: number;
  tarjetas: string[];
  placasSueltas: number;
  /** Administrativos cuya area se alineo con su departamento en ZK (bloque 88). */
  areasAlineadas: number;
}

export async function altasDesdeZk(hechoPor: string | null): Promise<RespuestaAltasZk> {
  const { data, error } = await supabaseAuth.rpc("altas_desde_zk", { p_hecho_por: hechoPor });
  if (error) throw new Error(traducirError(error.message));
  const r = (data ?? {}) as { altas?: number; tarjetas?: string[]; placasSueltas?: number; areasAlineadas?: number };
  return { altas: r.altas ?? 0, tarjetas: r.tarjetas ?? [], placasSueltas: r.placasSueltas ?? 0, areasAlineadas: r.areasAlineadas ?? 0 };
}

/**
 * Que ids de evento, dentro de un rango, ya estan guardados. Es lo que permite mandar
 * de un archivo solo lo que la base no tiene.
 *
 * POR RANGO Y NO «MAYOR QUE EL ULTIMO»: ZK numera los eventos al recogerlos, pero un
 * export viejo que nunca se guardo trae ids menores que el ultimo guardado, y un
 * filtro por «mayor que» lo habria descartado entero sin avisar. Leer los ids que
 * ya estan cuesta una o dos peticiones (solo el id, 5,000 por pagina) y deja mandar
 * exactamente lo que falta, venga de donde venga.
 */
export async function idsEventosGuardados(desdeId: number, hastaId: number): Promise<Set<number>> {
  const PAGINA = 5000;
  const ids = new Set<number>();
  for (let pagina = 0; pagina < 200; pagina += 1) {
    const { data, error } = await supabaseAuth
      .from("zk_eventos")
      .select("id_evento")
      .gte("id_evento", desdeId)
      .lte("id_evento", hastaId)
      .order("id_evento", { ascending: true })
      .range(ids.size, ids.size + PAGINA - 1);
    if (error) throw new Error(traducirError(error.message));
    const filas = (data ?? []) as { id_evento: number }[];
    if (filas.length === 0) break;
    for (const r of filas) ids.add(Number(r.id_evento));
  }
  return ids;
}
