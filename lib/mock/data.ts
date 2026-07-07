// Datos de ejemplo (falsos, sin PII real). Alimentan el prototipo.
import type { Estacionamiento, ReglamentoVersion, Registro } from "./types";

export const ESTACIONAMIENTOS: Estacionamiento[] = [
  { clave: "E1", descripcion: "Estacionamiento 1", activo: true },
  { clave: "E2", descripcion: "Estacionamiento 2", activo: true },
];

export const MARCAS: string[] = [
  "Volkswagen", "Toyota", "Honda", "Nissan", "Chevrolet", "KIA", "Mazda", "Ford",
  "Hyundai", "BMW", "Jeep", "Audi", "Mercedes Benz", "Suzuki", "Seat", "Volvo",
  "Renault", "Peugeot", "MINI", "Subaru", "Fiat", "Dodge", "GMC", "Chrysler", "Otro",
];

export const COLORES: string[] = [
  "Blanco", "Gris", "Negro", "Azul", "Rojo", "Plata", "Arena", "Verde",
  "Café", "Dorado", "Guinda", "Amarillo", "Naranja", "Beige", "Vino", "Azul marino", "Otro",
];

export const REGLAMENTO_VIGENTE: ReglamentoVersion = {
  version: 1,
  vigente: true,
  // PLACEHOLDER: se reemplaza por las 22 cláusulas oficiales del IAQ.
  clausulas: [
    "El TAG es personal e intransferible y se otorga para el vehículo registrado.",
    "El acceso al plantel no garantiza la disponibilidad de un lugar de estacionamiento.",
    "El usuario debe respetar los señalamientos, límites de velocidad y al personal de vialidad.",
    "Una reposición de TAG inactiva automáticamente el dispositivo anterior.",
    "Los alumnos de preparatoria acceden preferentemente al Estacionamiento 1 en horario escolar.",
    "[Placeholder] Cláusulas 6 a 22 pendientes del texto oficial del IAQ.",
  ],
};

// Registros de ejemplo para el panel admin (se usarán en pantallas posteriores).
export const REGISTROS_DEMO: Registro[] = [
  {
    id: "demo-1", folio: "SATAG-100241",
    usuarioNombre: "Ana Torres Vela", gestionanteNombre: null, tipoUsuario: "padres",
    marca: "Toyota", modelo: "Sienna", color: "Blanco", placas: "UAB1234", sinPlacas: false,
    noDispositivo: "9426780", procedenciaTag: "escuela", estado: "activo",
    estacionamientos: ["E1", "E2"], fechaAdquisicion: "2025-08-19", fechaInstalacion: "2025-08-20",
    instaladoPor: "TI", motivoBaja: null, fechaBaja: null,
    observaciones: null, pagos: [{ monto: 100, metodo: "efectivo", cobradoPor: "Recepción", fecha: "2025-08-19", folio: "R-5521" }],
    movimientos: [{ tipo: "alta", fecha: "2025-08-19", motivo: "Alta por autoservicio", hechoPor: "autoservicio" }],
    createdAt: "2025-08-19",
  },
  {
    id: "demo-2", folio: "SATAG-100242",
    usuarioNombre: "Diego Salas Marín", gestionanteNombre: "Marta Marín Ruiz", tipoUsuario: "alumno",
    marca: "Mazda", modelo: "3", color: "Gris", placas: "UBC9087", sinPlacas: false,
    noDispositivo: null, procedenciaTag: "escuela", estado: "pendiente",
    estacionamientos: [], fechaAdquisicion: null, fechaInstalacion: null,
    instaladoPor: null, motivoBaja: null, fechaBaja: null,
    observaciones: "Alumno de prepa.", pagos: [],
    movimientos: [{ tipo: "alta", fecha: "2026-06-28", motivo: "Alta por autoservicio", hechoPor: "autoservicio" }],
    createdAt: "2026-06-28",
  },
];
