// Tipos del dominio (espejo del modelo de datos, doc 01). El prototipo usa estos
// mismos shapes para que al conectar Supabase solo cambie la implementación, no las pantallas.

export type TipoUsuario = "maestro" | "padres" | "alumno" | "admin";
export type GestionanteRelacion = "padre" | "madre" | "tutor" | "otro";
export type FirmanteRol = "usuario" | "padre" | "madre" | "tutor" | "otro";
export type ProcedenciaTag = "escuela" | "propio";
export type EstadoRegistro = "pendiente" | "activo" | "baja";
export type TipoMovimiento = "alta" | "baja" | "reposicion" | "cambio" | "prueba";

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
  movimientos: Movimiento[];
  createdAt: string;
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
