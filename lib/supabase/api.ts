// Capa de API real contra Supabase. Reemplaza gradualmente a lib/mock/api.ts.
// Mantiene el MISMO contrato (shapes) que el mock para no tocar las pantallas.
import { supabase } from "./client";
import type {
  ReglamentoVersion,
  NombrePersona,
  TipoUsuario,
  ProcedenciaTag,
  CrearRegistroResultado,
} from "@/lib/mock/types";

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

// ---- Alta publica (paso 3+4): sube firma a Storage y llama al RPC crear_registro ----

// Entrada con nombres separados (espejo de la firma del RPC crear_registro).
export interface CrearRegistroInput {
  usuarioNombrePartes: NombrePersona;
  gestionanteNombrePartes: NombrePersona | null; // null = mismo que el usuario
  tipoUsuario: TipoUsuario;
  marca: string;
  modelo: string;
  color: string;
  placas: string | null;
  sinPlacas: boolean;
  procedenciaTag: ProcedenciaTag;
  observaciones: string | null;
  firmaDataUrl: string; // PNG en data URL desde el SignaturePad
  firmanteNombre: string;
  aceptaReglamento: boolean;
}

// Sube el PNG de la firma al bucket privado y devuelve la ruta a guardar.
async function subirFirma(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const fileName = `${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from("firmas")
    .upload(fileName, blob, { contentType: "image/png", upsert: false });
  if (error) throw new Error(`No se pudo subir la firma: ${error.message}`);
  return `firmas/${fileName}`;
}

export async function crearRegistro(input: CrearRegistroInput): Promise<CrearRegistroResultado> {
  if (!input.aceptaReglamento) throw new Error("Debes aceptar el reglamento.");
  if (!input.firmaDataUrl) throw new Error("Falta la firma.");

  // Nota: si el RPC fallara despues de subir, la firma queda huerfana en Storage
  // (anon no puede borrar). Es aceptable para el MVP; se limpia del lado admin.
  const firmaUrl = await subirFirma(input.firmaDataUrl);

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
    p_firma_url: firmaUrl,
    p_firmante_nombre: input.firmanteNombre,
    p_gestionante_nombres: g?.nombre.trim() || null,
    p_gestionante_apellido_paterno: g?.apellidoPaterno.trim() || null,
    p_gestionante_apellido_materno: g?.apellidoMaterno.trim() || null,
    p_procedencia_tag: input.procedenciaTag,
    p_observaciones: input.observaciones,
  });

  if (error) throw new Error(error.message);

  const r = data as { id: string; folio: string; estado: string };
  return { id: r.id, folio: r.folio, estado: r.estado as CrearRegistroResultado["estado"] };
}
