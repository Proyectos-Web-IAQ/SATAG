// Capa de API real del PANEL (Administracion / TI / Consulta) contra Supabase.
// Reemplaza a lib/mock/api.ts en AdminPanel y VistaTi manteniendo los mismos
// shapes (lib/mock/types.ts) para no tocar la logica de las pantallas.
//
// Usa supabaseAuth (sesion persistente): la RLS exige aal2 + app_metadata.rol
// para LEER (27/30) y toda escritura pasa por RPCs SECURITY DEFINER (29) que
// validan el rol por dentro. Aqui no hay ningun insert/update directo.
//
// Las acciones devuelven { id } (no el Registro completo): las pantallas
// recargan la lista despues de actuar, asi que el registro actualizado llega
// por listRegistros y devolverlo aqui seria un segundo viaje redundante.
import { supabaseAuth } from "./auth";
import type {
  CambiosRegistro,
  Estacionamiento,
  EstadoRegistro,
  Movimiento,
  Pago,
  ProcedenciaTag,
  Registro,
  Solicitud,
  TipoMovimiento,
  TipoSolicitud,
  TipoUsuario,
} from "@/lib/mock/types";

export interface AccionResultado {
  id: string;
  folioRecibo?: string;
}

// Errores de red/sesion en espanol. Los errores de negocio de los RPCs
// (raise exception) ya vienen en espanol desde la BD y se muestran tal cual.
function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed") || m.includes("fetch failed")) {
    return "Sin conexion con el servidor. Revisa tu red e intenta de nuevo.";
  }
  if (m.includes("jwt") && (m.includes("expired") || m.includes("invalid"))) {
    return "La sesion expiro. Cierra sesion y vuelve a entrar.";
  }
  if (m.includes("permission denied") || m.includes("not authorized")) {
    return "Tu usuario no tiene permiso para esta accion. Verifica tu rol con el administrador.";
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
}
interface SolicitudRow {
  id: string;
  tipo: string;
  detalle: string;
  atendida: boolean;
  created_at: string;
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
  marca: string;
  modelo: string;
  color: string;
  placas: string | null;
  sin_placas: boolean;
  no_dispositivo: string | null;
  procedencia_tag: string;
  tag_apartado: boolean;
  tag_apartado_no: string | null;
  estado: string;
  motivo_baja: string | null;
  fecha_baja: string | null;
  fecha_adquisicion: string | null;
  fecha_instalacion: string | null;
  instalado_por: string | null;
  observaciones: string | null;
  created_at: string;
  pagos: PagoRow[];
  registro_estacionamientos: { estacionamiento_clave: string }[];
  solicitudes: SolicitudRow[];
  movimientos: MovimientoRow[];
}

const SELECT_REGISTRO = `
  id, folio, usuario_nombre_completo, gestionante_nombre_completo, tipo_usuario,
  marca, modelo, color, placas, sin_placas, no_dispositivo, procedencia_tag,
  tag_apartado, tag_apartado_no, estado,
  motivo_baja, fecha_baja, fecha_adquisicion, fecha_instalacion, instalado_por,
  observaciones, created_at,
  pagos ( monto, metodo, cobrado_por, folio_recibo, fecha, created_at ),
  registro_estacionamientos ( estacionamiento_clave ),
  solicitudes ( id, tipo, detalle, atendida, created_at ),
  movimientos ( tipo, fecha, motivo, hecho_por, no_dispositivo_anterior, no_dispositivo_nuevo, created_at )
`;

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

function mapRegistro(r: RegistroRow): Registro {
  const pagos: Pago[] = [...r.pagos].sort(porCreatedAt).map((p) => ({
    monto: Number(p.monto),
    metodo: "efectivo",
    cobradoPor: p.cobrado_por,
    fecha: p.fecha,
    folio: p.folio_recibo,
  }));
  const solicitudes: Solicitud[] = [...r.solicitudes].sort(porCreatedAt).map((s) => ({
    id: s.id,
    tipo: s.tipo as TipoSolicitud,
    detalle: s.detalle,
    fecha: fechaLocal(s.created_at),
    atendida: s.atendida,
  }));
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
    marca: r.marca,
    modelo: r.modelo,
    color: r.color,
    placas: r.placas,
    sinPlacas: r.sin_placas,
    noDispositivo: r.no_dispositivo,
    procedenciaTag: r.procedencia_tag as ProcedenciaTag,
    tagApartado: r.tag_apartado,
    tagApartadoNo: r.tag_apartado_no,
    estado: r.estado as EstadoRegistro,
    estacionamientos: r.registro_estacionamientos.map((e) => e.estacionamiento_clave).sort(),
    fechaAdquisicion: r.fecha_adquisicion,
    fechaInstalacion: r.fecha_instalacion,
    instaladoPor: r.instalado_por,
    motivoBaja: r.motivo_baja,
    fechaBaja: r.fecha_baja,
    observaciones: r.observaciones,
    pagos,
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
  return registros.filter((r) =>
    [r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio]
      .join(" ").toLowerCase().includes(q));
}

// Catalogo de estacionamientos activos (para los chips de asignacion en TI).
export async function getEstacionamientos(): Promise<Estacionamiento[]> {
  const { data, error } = await supabaseAuth
    .from("estacionamientos")
    .select("clave, descripcion, activo")
    .eq("activo", true)
    .order("clave");
  if (error) throw new Error(traducirError(error.message));
  return (data as { clave: string; descripcion: string | null; activo: boolean }[]).map((e) => ({
    clave: e.clave,
    descripcion: e.descripcion ?? e.clave,
    activo: e.activo,
  }));
}

// ---- Acciones (RPCs transaccionales de los bloques 29 y 31) ----

export async function registrarPago(
  id: string,
  data: { monto: number; cobradoPor: string },
): Promise<AccionResultado> {
  return rpc("registrar_pago", {
    p_registro_id: id,
    p_monto: data.monto,
    p_cobrado_por: data.cobradoPor.trim() || null,
  });
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

export async function darBaja(id: string, motivo: string, hechoPor: string): Promise<AccionResultado> {
  return rpc("dar_baja", {
    p_registro_id: id,
    p_motivo: motivo,
    p_hecho_por: hechoPor.trim() || null,
  });
}

// Cierra una solicitud improcedente SIN tocar el registro (motivo obligatorio).
export async function descartarSolicitud(solicitudId: string, motivo: string, hechoPor: string): Promise<AccionResultado> {
  return rpc("descartar_solicitud", {
    p_solicitud_id: solicitudId,
    p_motivo: motivo,
    p_hecho_por: hechoPor.trim() || null,
  });
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
