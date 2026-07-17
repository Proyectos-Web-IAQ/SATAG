// Capa de API real contra Supabase. Reemplaza gradualmente a lib/mock/api.ts.
// Mantiene el MISMO contrato (shapes) que el mock para no tocar las pantallas.
import { supabase } from "./client";
import type {
  ReglamentoVersion,
  NombrePersona,
  TipoUsuario,
  GestionanteRelacion,
  FirmanteRol,
  ProcedenciaTag,
  CrearRegistroResultado,
} from "@/lib/mock/types";
import type { FirmaTrazos } from "@/components/SignaturePad";

// "Otro" es opcion de UI, no vive en los catalogos (decision cerrada).
const CON_OTRO = (nombres: string[]) => [...nombres, "Otro"];

export async function getMarcas(): Promise<string[]> {
  const { data, error } = await supabase.from("cat_marcas").select("nombre").order("nombre");
  if (error) throw new Error(`No se pudieron cargar las marcas: ${error.message}`);
  return CON_OTRO(data.map((r) => r.nombre as string));
}

export async function getColores(): Promise<string[]> {
  const { data, error } = await supabase.from("cat_colores").select("nombre").order("nombre");
  if (error) throw new Error(`No se pudieron cargar los colores: ${error.message}`);
  return CON_OTRO(data.map((r) => r.nombre as string));
}

// Modelos de una marca (por nombre). cat_modelos depende de cat_marcas via marca_id.
export async function getModelos(marca: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("cat_modelos")
    .select("nombre, cat_marcas!inner(nombre)")
    .eq("cat_marcas.nombre", marca)
    .order("nombre");
  if (error) throw new Error(`No se pudieron cargar los modelos: ${error.message}`);
  return CON_OTRO(data.map((r) => r.nombre as string));
}

export async function getReglamentoVigente(): Promise<ReglamentoVersion> {
  const { data, error } = await supabase
    .from("reglamento_versiones")
    .select("version, contenido")
    .eq("vigente", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el reglamento: ${error.message}`);
  if (!data) throw new Error("No hay una version de reglamento vigente.");

  // La BD guarda `contenido` como un solo texto; el formulario espera clausulas[].
  const clausulas = String(data.contenido)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return { version: data.version as number, vigente: true, clausulas };
}

export interface AvisoVigente {
  version: number;
  urlPublica: string | null;
  parrafos: string[];
}

export async function getAvisoVigente(): Promise<AvisoVigente> {
  const { data, error } = await supabase
    .from("aviso_versiones")
    .select("version, contenido, url_publica")
    .eq("vigente", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el aviso de privacidad: ${error.message}`);
  if (!data) throw new Error("No hay un aviso de privacidad vigente.");

  const parrafos = String(data.contenido)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return { version: data.version as number, urlPublica: data.url_publica as string | null, parrafos };
}

// ---- Alta publica (paso 3+4): sube firma a Storage y llama al RPC crear_registro ----

// Entrada con nombres separados (espejo de la firma del RPC crear_registro).
export interface CrearRegistroInput {
  usuarioNombrePartes: NombrePersona;
  gestionanteNombrePartes: NombrePersona | null; // null = mismo que el usuario
  gestionanteRelacion: GestionanteRelacion | null; // relacion del gestionante (menor: padre/madre/tutor)
  usuarioEsMenor: boolean; // menor de edad: exige gestionante padre/madre/tutor (CC-11)
  firmanteRol: FirmanteRol; // quien firma: el propio usuario o el gestionante
  tipoUsuario: TipoUsuario;
  marca: string;
  modelo: string;
  color: string;
  placas: string | null;
  sinPlacas: boolean;
  procedenciaTag: ProcedenciaTag;
  observaciones: string | null;
  firmaDataUrl: string; // PNG en data URL desde el SignaturePad
  firmaTrazos: FirmaTrazos | null; // vector del trazo (evidencia)
  firmanteNombre: string;
  aceptaReglamento: boolean;
  metadata?: Record<string, unknown>; // evidencia extra (ej. consentimiento) para aceptaciones.metadata
}

// Contexto tecnico del cliente (evidencia complementaria, disclosed en el aviso).
// Se mantiene minimo: no es un fingerprint exhaustivo.
function contextoCliente(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  return {
    capturadoEn: new Date().toISOString(),
    zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
    idioma: navigator.language,
    plataforma: navigator.platform || null,
    pantalla: { ancho: window.screen.width, alto: window.screen.height, dpr: window.devicePixelRatio },
    origen: window.location.href,
    app: "satag-web",
  };
}

// SHA-256 en hex (minusculas) de un buffer. Requiere contexto seguro (HTTPS/localhost).
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Sube el PNG de la firma al bucket privado; devuelve la ruta y el SHA-256 del PNG.
async function subirFirma(dataUrl: string): Promise<{ path: string; sha256: string }> {
  const blob = await (await fetch(dataUrl)).blob();
  const sha256 = await sha256Hex(await blob.arrayBuffer());
  const fileName = `${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from("firmas")
    .upload(fileName, blob, { contentType: "image/png", upsert: false });
  if (error) throw new Error(`No se pudo subir la firma: ${error.message}`);
  return { path: `firmas/${fileName}`, sha256 };
}

export async function crearRegistro(input: CrearRegistroInput): Promise<CrearRegistroResultado> {
  if (!input.aceptaReglamento) throw new Error("Debes aceptar el reglamento.");
  if (!input.firmaDataUrl) throw new Error("Falta la firma.");

  // Nota: si el RPC fallara despues de subir, la firma queda huerfana en Storage
  // (anon no puede borrar). Es aceptable para el MVP; se limpia del lado admin.
  const firma = await subirFirma(input.firmaDataUrl);

  const g = input.gestionanteNombrePartes;
  const { data, error } = await supabase.rpc("crear_registro", {
    p_usuario_nombres: input.usuarioNombrePartes.nombre.trim(),
    p_usuario_apellido_paterno: input.usuarioNombrePartes.apellidoPaterno.trim(),
    p_usuario_apellido_materno: input.usuarioNombrePartes.apellidoMaterno.trim() || null,
    p_tipo_usuario: input.tipoUsuario,
    p_marca: input.marca,
    p_modelo: input.modelo,
    p_color: input.color,
    p_placas: input.sinPlacas ? null : input.placas,
    p_sin_placas: input.sinPlacas,
    p_firma_url: firma.path,
    p_firma_imagen_sha256: firma.sha256,
    p_firma_trazos: input.firmaTrazos,
    p_metadata: { ...contextoCliente(), ...(input.metadata ?? {}) },
    p_firmante_nombre: input.firmanteNombre,
    p_firmante_rol: input.firmanteRol,
    p_gestionante_nombres: g?.nombre.trim() || null,
    p_gestionante_apellido_paterno: g?.apellidoPaterno.trim() || null,
    p_gestionante_apellido_materno: g?.apellidoMaterno.trim() || null,
    p_gestionante_relacion: input.gestionanteRelacion,
    p_usuario_es_menor: input.usuarioEsMenor,
    p_procedencia_tag: input.procedenciaTag,
    p_observaciones: input.observaciones,
  });

  if (error) throw new Error(error.message);

  const r = data as { id: string; folio: string; estado: string };
  return { id: r.id, folio: r.folio, estado: r.estado as CrearRegistroResultado["estado"] };
}

// ---- Solicitud publica de actualizacion/baja sobre un registro existente ----
// RPC crear_solicitud (SECURITY DEFINER): valida folio + placas (o No. de TAG)
// y encola trabajo para TI. Nunca devuelve datos del registro; la solicitud es
// inerte y el cambio real lo ejecuta TI con la persona presente (CC-06).
export async function crearSolicitud(input: {
  folio: string;
  placasOTag: string;
  tipo: "actualizacion" | "baja";
  detalle: string;
}): Promise<void> {
  const { error } = await supabase.rpc("crear_solicitud", {
    p_folio: input.folio.trim(),
    p_placas_o_tag: input.placasOTag.trim(),
    p_tipo: input.tipo,
    p_detalle: input.detalle.trim(),
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) {
      throw new Error("Sin conexion con el servidor. Revise su red e intente de nuevo.");
    }
    throw new Error(error.message);
  }
}

// ---- Nota publica SIN folio ni placa (SC-003) ----
// RPC crear_nota_solicitud (SECURITY DEFINER): recolecta una nota sin consultar
// la base ni revelar nada (solo devuelve { recibida }). TI la empata despues con
// un expediente buscando por nombre. Recolectar es publico; buscar es privado.
export async function crearNota(input: {
  solicitanteNombre: string;
  solicitanteRol: "padres" | "maestro" | "admin" | "alumno";
  alumnoNombre: string;
  alumnoGrado: string;
  detalle: string;
  vehiculoDesc?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("crear_nota_solicitud", {
    p_solicitante_nombre: input.solicitanteNombre.trim(),
    p_solicitante_rol: input.solicitanteRol,
    p_alumno_nombre: input.alumnoNombre.trim() || null,
    p_alumno_grado: input.alumnoGrado.trim() || null,
    p_detalle: input.detalle.trim(),
    p_vehiculo_desc: input.vehiculoDesc?.trim() || null,
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) {
      throw new Error("Sin conexion con el servidor. Revise su red e intente de nuevo.");
    }
    throw new Error(error.message);
  }
}
