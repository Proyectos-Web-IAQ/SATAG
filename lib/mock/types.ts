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

export type TipoSolicitud = "actualizacion" | "baja" | "nota";

// Lo que el cliente PIDE en una nota del buzon (SC-003). Es su peticion, no lo
// que TI decide: TI lo corrobora y puede aplicar otro tramite si no corresponde.
export type TramiteSolicitado = "instalacion" | "actualizacion" | "baja";

// Solicitud levantada sobre un registro existente (página pública /solicitudes
// o, a futuro, captura interna): alimenta los contadores de la pantalla TI.
// Tabla: solicitudes (26_solicitudes.sql). El id permite descartarla (RPC
// descartar_solicitud) cuando resulta improcedente.
//
// 'nota' (SC-003): buzón público sin folio. Llega SIN vincular (registroId null)
// y TI la empata a mano con un expediente. Los campos solicitante*/alumno*/
// vehiculo/tramiteSolicitado solo vienen en las notas; en actualizacion/baja
// quedan en null.
export interface Solicitud {
  id: string;
  tipo: TipoSolicitud;
  detalle: string;
  fecha: string;
  atendida: boolean;
  // Solo en notas (SC-003):
  solicitanteNombre?: string | null;
  solicitanteRol?: TipoUsuario | null;
  tramiteSolicitado?: TramiteSolicitado | null;
  alumnoNombre?: string | null;
  alumnoGrado?: string | null;
  vehiculoDesc?: string | null;
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
  // Apartado (CC-01): cuando la familia usa su propio TAG, la escuela reserva
  // el que le tocaba. tagApartado = hay reserva; tagApartadoNo = su numero.
  tagApartado: boolean;
  tagApartadoNo: string | null;
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
  // TI puede corregir propio/escuela (el titular solo lo declara en el alta).
  procedenciaTag?: ProcedenciaTag;
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
