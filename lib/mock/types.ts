// Tipos del dominio (espejo del modelo de datos, doc 01). El prototipo usa estos
// mismos shapes para que al conectar Supabase solo cambie la implementación, no las pantallas.

export type TipoUsuario = "maestro" | "padres" | "alumno" | "admin";
export type GestionanteRelacion = "padre" | "madre" | "tutor" | "otro";
export type FirmanteRol = "usuario" | "padre" | "madre" | "tutor" | "otro";
export type ProcedenciaTag = "escuela" | "propio";
// 'bloqueado' existe en la BD (12_registros.sql) aunque el panel aun no lo
// produce: el tipo lo incluye para que un registro bloqueado no truene la UI.
export type EstadoRegistro = "pendiente" | "activo" | "baja" | "bloqueado";
export type TipoMovimiento = "alta" | "baja" | "reposicion" | "cambio" | "prueba" | "bloqueo" | "rectificacion";

export interface Estacionamiento {
  clave: string; // 'E1' | 'E2'
  descripcion: string;
  activo: boolean;
}

export interface ReglamentoVersion {
  version: number;
  vigente: boolean;
  clausulas: string[];
}

export interface Pago {
  monto: number;
  metodo: "efectivo";
  cobradoPor: string | null;
  fecha: string | null;
  folio: string | null;
}

export type TipoSolicitud = "actualizacion" | "baja";

// Solicitud levantada sobre un registro existente (página pública /solicitudes
// o, a futuro, captura interna): alimenta los contadores de la pantalla TI.
// Tabla: solicitudes (26_solicitudes.sql). El id permite descartarla (RPC
// descartar_solicitud) cuando resulta improcedente.
export interface Solicitud {
  id: string;
  tipo: TipoSolicitud;
  detalle: string;
  fecha: string;
  atendida: boolean;
}

export interface Movimiento {
  tipo: TipoMovimiento;
  fecha: string;
  motivo: string | null;
  hechoPor: string | null;
  noDispositivoAnterior?: string | null;
  noDispositivoNuevo?: string | null;
}

export interface NombrePersona {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
}

export interface Registro {
  id: string;
  folio: string;
  // Persona (denormalizada; gestionanteNombre null = mismo que usuario)
  usuarioNombre: string;
  usuarioNombrePartes?: NombrePersona;
  gestionanteNombre: string | null;
  gestionanteNombrePartes?: NombrePersona | null;
  tipoUsuario: TipoUsuario;
  // Vehículo (aplanado)
  marca: string;
  modelo: string;
  color: string;
  placas: string | null;
  sinPlacas: boolean;
  // Dispositivo
  noDispositivo: string | null;
  procedenciaTag: ProcedenciaTag;
  // Ciclo de vida
  estado: EstadoRegistro;
  estacionamientos: string[]; // claves asignadas (admin)
  fechaAdquisicion: string | null;
  fechaInstalacion: string | null;
  instaladoPor: string | null;
  motivoBaja: string | null;
  fechaBaja: string | null;
  observaciones: string | null;
  pagos: Pago[];
  solicitudes: Solicitud[];
  movimientos: Movimiento[];
  createdAt: string;
}

// Cambios que TI puede aplicar a un registro existente (pantalla TI, acción
// "Actualizar datos"). Espejo del futuro RPC. Cambiar noDispositivo = reposición.
export interface CambiosRegistro {
  noDispositivo?: string;
  placas?: string | null;
  sinPlacas?: boolean;
  marca?: string;
  modelo?: string;
  color?: string;
}

// Entrada del alta de autoservicio (espejo del RPC crear_registro).
export interface CrearRegistroInput {
  usuarioNombre: string;
  usuarioNombrePartes?: NombrePersona;
  gestionanteNombre: string | null;
  gestionanteNombrePartes?: NombrePersona | null;
  tipoUsuario: TipoUsuario;
  marca: string;
  modelo: string;
  color: string;
  placas: string | null;
  sinPlacas: boolean;
  procedenciaTag: ProcedenciaTag;
  observaciones: string | null;
  firmaDataUrl: string;   // en producción: se sube a Storage y se guarda la ruta
  firmanteNombre: string;
  aceptaReglamento: boolean;
}

export interface CrearRegistroResultado {
  id: string;
  folio: string;
  estado: EstadoRegistro;
}
