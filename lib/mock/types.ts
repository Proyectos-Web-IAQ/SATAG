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
// Solo actualizacion o baja: el TAG se instala por el alta (registro), nunca por
// una solicitud (una solicitud es siempre posterior a la instalacion).
export type TramiteSolicitado = "actualizacion" | "baja";

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
  // CC-05: el tipo lo declara el titular en el alta (formulario público, sin
  // verificar). Administración lo confirma al cobrar, con la persona enfrente,
  // y ahí queda sellado quién lo validó y cuándo (bloque 46).
  tipoValidado: boolean;
  tipoValidadoPor: string | null;
  tipoValidadoEn: string | null;
  // Menor de edad (CC-11): firma su gestionante y el tipo queda fijo en
  // 'alumno'. Administración no puede cambiárselo al validar.
  usuarioEsMenor: boolean;
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

// ---- Corte de caja / finanzas (bloque 42) ----

// Subtotal de un dia de cobro (hora local de Querétaro). El RPC ya agrupa por
// dia local, así que 'dia' llega como 'YYYY-MM-DD' listo para mostrar.
export interface DiaCaja {
  dia: string;
  cantidad: number;
  subtotal: number;
}

// Foto de la caja actual: lo que aún no se ha cortado, más los acumulados que
// responden "cuánto vendí". Lo devuelve el RPC estado_caja.
export interface EstadoCaja {
  totalEnCaja: number;
  pagosEnCaja: number;
  diasDeCobro: number;       // días de cobro distintos sin cortar (semáforo)
  primerCobro: string | null;
  desglosePorDia: DiaCaja[];
  ultimoCorte: string | null;
  vendidoMes: number;
  vendidoHistorico: number;
}

// Lo que devuelve cortar_caja al cerrar un corte.
export interface ResultadoCorte {
  id: string;
  folioCorte: string;
  totalEsperado: number;
  efectivoContado: number;
  diferencia: number;        // + sobrante, - faltante
  pagosCortados: number;
  diasDeCobro: number;
}

// Un cobro (ticket/recibo) del detalle de un corte o de la caja actual. Se carga
// bajo demanda al expandir cada corte, para no traer todo el historial de golpe.
export interface PagoReciente {
  folioRecibo: string | null;
  monto: number;
  fecha: string;            // created_at (ISO) — se muestra en hora local
  cobradoPor: string | null;
  registroFolio: string | null;
  usuarioNombre: string | null;
  cortado: boolean;         // true = ya pertenece a un corte cerrado
}

// ---- Reporte de expedientes incompletos (CC-02, bloque 45) ----

// Motivo por el que a un expediente le falta algo para operar. Los códigos los
// emite la vista `v_registros_incompletos`; el criterio completo (y qué queda
// fuera a propósito) está documentado en el encabezado del bloque 45.
//
// Integridad — los RPC no pueden producirlos; si aparecen, algo se escribió
// por fuera del panel:
//   tag_sin_pago, activo_sin_tag, tag_sin_estacionamiento, vehiculo_incompleto
// Faltante operativo real:
//   sin_placas
// Atorados — solo a partir de los 7 días naturales:
//   sin_pago, sin_instalar
export type MotivoIncompleto =
  | "tag_sin_pago"
  | "activo_sin_tag"
  | "tag_sin_estacionamiento"
  | "vehiculo_incompleto"
  | "sin_placas"
  | "sin_pago"
  | "sin_instalar";

// Una fila del reporte: un expediente con todos sus faltantes juntos. No es un
// Registro completo — la vista no trae pagos, solicitudes ni bitácora.
export interface RegistroIncompleto {
  id: string;
  folio: string;
  usuarioNombre: string;
  gestionanteNombre: string | null;
  tipoUsuario: TipoUsuario;
  marca: string;
  modelo: string;
  color: string;
  placas: string | null;
  sinPlacas: boolean;
  noDispositivo: string | null;
  procedenciaTag: ProcedenciaTag;
  estado: EstadoRegistro;
  folioRecibo: string | null;
  createdAt: string;
  diasDesdeAlta: number;
  // null cuando el expediente todavía no tiene pago.
  diasDesdePago: number | null;
  motivos: MotivoIncompleto[];
}

// ---- Evidencia de firma en el panel (SC-008, bloque 47) ----

// Lo que da valor probatorio a la aceptación, más la URL firmada temporal del
// PNG. La URL caduca: se pide bajo demanda y no se guarda en ningún lado.
// Solo la ven admin, TI y super; `consulta` recibe null (la RLS le niega la
// tabla y el bucket).
export interface EvidenciaFirma {
  registroId: string;
  firmaUrl: string | null;      // URL firmada; null si no se pudo emitir
  // Por qué no se pudo emitir (permiso, archivo ausente, red). Se muestra tal
  // cual: el hash y las versiones siguen sirviendo aunque la imagen no cargue.
  firmaError: string | null;
  expiraEnSegundos: number;
  firmanteNombre: string;
  firmanteRol: FirmanteRol;
  reglamentoVersion: number | null;
  avisoVersion: number | null;
  selloTiempo: string;
  hashAlgoritmo: string;
  hashDocumento: string;
  firmaImagenSha256: string | null;
  tieneTrazos: boolean;
}

// Un corte de caja cerrado (tabla cortes_caja, inmutable). Documento contable.
export interface CorteCaja {
  id: string;
  folioCorte: string;
  cortadoPor: string;
  periodoDesde: string | null;
  periodoHasta: string;
  totalEsperado: number;
  cantidadPagos: number;
  diasDeCobro: number;
  efectivoContado: number;
  diferencia: number;
  observaciones: string | null;
  createdAt: string;
}
