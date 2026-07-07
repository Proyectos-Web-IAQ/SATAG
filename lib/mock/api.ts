// Capa mock: imita la API que después dará Supabase (catálogos + crear_registro +
// acciones de administración/TI). Al conectar la BD real se reemplaza SOLO este archivo.
import { ESTACIONAMIENTOS, MARCAS, COLORES, REGLAMENTO_VIGENTE, REGISTROS_DEMO } from "./data";
import type { CrearRegistroInput, CrearRegistroResultado, Registro } from "./types";

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const hoy = () => new Date().toISOString().slice(0, 10);

export async function getEstacionamientos() { await delay(120); return ESTACIONAMIENTOS.filter((e) => e.activo); }
export async function getMarcas() { await delay(120); return MARCAS; }
export async function getColores() { await delay(120); return COLORES; }
export async function getReglamentoVigente() { await delay(120); return REGLAMENTO_VIGENTE; }

// "Base" en memoria para la sesión del prototipo.
const registrosMem: Registro[] = [...REGISTROS_DEMO];

function nuevoFolio(): string {
  return `SATAG-${100_000 + Math.floor(Math.random() * 899_999)}`;
}
function find(id: string): Registro {
  const r = registrosMem.find((x) => x.id === id);
  if (!r) throw new Error("Registro no encontrado.");
  return r;
}

// ---- Alta pública (Momento 1: autoservicio). Espejo del RPC crear_registro. ----
export async function crearRegistro(input: CrearRegistroInput): Promise<CrearRegistroResultado> {
  await delay(450);
  if (!input.usuarioNombre.trim()) throw new Error("El nombre de quien conducirá es obligatorio.");
  if (!input.aceptaReglamento) throw new Error("Debes aceptar el reglamento.");
  if (!input.firmaDataUrl) throw new Error("Falta la firma.");
  if (!input.sinPlacas && !(input.placas ?? "").trim())
    throw new Error("Captura las placas o marca «sin placas».");

  const id = `reg-${Date.now()}`;
  const folio = nuevoFolio();
  registrosMem.unshift({
    id, folio,
    usuarioNombre: input.usuarioNombre.trim(),
    usuarioNombrePartes: input.usuarioNombrePartes,
    gestionanteNombre: input.gestionanteNombre?.trim() || null,
    gestionanteNombrePartes: input.gestionanteNombrePartes ?? null,
    tipoUsuario: input.tipoUsuario,
    marca: input.marca, modelo: input.modelo.trim(), color: input.color,
    placas: input.sinPlacas ? null : (input.placas ?? "").trim().toUpperCase() || null,
    sinPlacas: input.sinPlacas,
    noDispositivo: null, procedenciaTag: input.procedenciaTag,
    estado: "pendiente", estacionamientos: [],
    fechaAdquisicion: null, fechaInstalacion: null, instaladoPor: null,
    motivoBaja: null, fechaBaja: null,
    observaciones: input.observaciones?.trim() || null,
    pagos: [],
    movimientos: [{ tipo: "alta", fecha: hoy(), motivo: "Alta por autoservicio", hechoPor: "autoservicio" }],
    createdAt: new Date().toISOString(),
  });
  return { id, folio, estado: "pendiente" };
}

// ---- Consulta ----
export async function listRegistros(filtro?: string): Promise<Registro[]> {
  await delay(150);
  const q = (filtro ?? "").trim().toLowerCase();
  if (!q) return [...registrosMem];
  return registrosMem.filter((r) =>
    [r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio]
      .join(" ").toLowerCase().includes(q));
}
export async function getRegistro(id: string): Promise<Registro> { await delay(80); return { ...find(id) }; }

// ---- Administración (Momento 2) ----
export async function asignarEstacionamiento(id: string, claves: string[]): Promise<Registro> {
  await delay(300);
  const r = find(id);
  r.estacionamientos = [...claves];
  return { ...r };
}
export async function registrarPago(
  id: string, data: { monto: number; cobradoPor: string; folio: string },
): Promise<Registro> {
  await delay(300);
  const r = find(id);
  r.pagos.push({ monto: data.monto, metodo: "efectivo", cobradoPor: data.cobradoPor || null, fecha: hoy(), folio: data.folio || null });
  r.fechaAdquisicion = r.fechaAdquisicion ?? hoy();
  return { ...r };
}

// ---- TI (Momento 3) ----
export async function instalarTag(id: string, noDispositivo: string, instaladoPor: string): Promise<Registro> {
  await delay(300);
  const r = find(id);
  const tag = noDispositivo.trim();
  if (!/^[0-9]{6,11}$/.test(tag)) throw new Error("El No. de TAG debe tener de 6 a 11 dígitos.");
  const dup = registrosMem.find((x) => x.id !== id && x.noDispositivo === tag && x.estado !== "baja");
  if (dup) throw new Error(`El TAG ${tag} ya está activo en otro registro (${dup.folio}).`);
  r.noDispositivo = tag;
  r.estado = "activo";
  r.fechaInstalacion = hoy();
  r.instaladoPor = instaladoPor || "TI";
  return { ...r };
}
export async function darBaja(id: string, motivo: string, hechoPor: string): Promise<Registro> {
  await delay(300);
  const r = find(id);
  if (!motivo.trim()) throw new Error("Indica el motivo de la baja.");
  r.estado = "baja";
  r.motivoBaja = motivo.trim();
  r.fechaBaja = hoy();
  r.movimientos.push({ tipo: "baja", fecha: hoy(), motivo: motivo.trim(), hechoPor: hechoPor || "TI" });
  return { ...r };
}
export async function reponerTag(id: string, nuevoNoDispositivo: string, motivo: string, hechoPor: string): Promise<Registro> {
  await delay(300);
  const r = find(id);
  const nuevo = nuevoNoDispositivo.trim();
  if (!/^[0-9]{6,11}$/.test(nuevo)) throw new Error("El nuevo No. de TAG debe tener de 6 a 11 dígitos.");
  const anterior = r.noDispositivo;
  r.movimientos.push({ tipo: "reposicion", fecha: hoy(), motivo: motivo.trim() || "Reposición de TAG", hechoPor: hechoPor || "TI", noDispositivoAnterior: anterior, noDispositivoNuevo: nuevo });
  r.noDispositivo = nuevo;
  r.estado = "activo";
  r.fechaInstalacion = hoy();
  return { ...r };
}
