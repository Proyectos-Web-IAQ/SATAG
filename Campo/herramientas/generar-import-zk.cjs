// Genera el archivo de ACTUALIZACION masiva para ZKBioSecurity cruzando:
//   - el export real de ZK (Usuarios_*.csv, UTF-16LE con tabuladores), y
//   - el registro de campo (Campo/datos/Registros.csv, export del sheet).
//
// Logica: para cada persona de ZK que tiene Tarjeta pero NO tiene nombre,
// busca esa tarjeta como "No de TAG" en el sheet y llena la fila con:
// nombre/apellido (MAYUSCULAS), departamento, placa (en Celular y en
// Placa Vehicular) y Codigo de Auto Gestion 123456. El ID de ZK se conserva
// para que el import actualice a la persona existente en vez de duplicarla.
//
// Uso:
//   1. Descargar el export de ZK y el CSV del sheet a Campo/datos/.
//   2. node generar-import-zk.cjs
//   3. Salida: Campo/datos/zk-actualizacion.csv (mismo formato del export).
//   PROBAR primero importando UNA fila en ZK antes de subir todo.

const fs = require('fs');
const path = require('path');

const DATOS = path.join(__dirname, '..', 'datos');

// ===== columnas del export real de ZK (Usuarios_20260908...) =====
const COLS = ['ID', 'Nombre', 'Apellido', 'ID de Departamento', 'Nombre de Departamento',
  'Género', 'Cumpleaños', 'Contraseña', 'Tipo de Documento', 'No. de Documento',
  'Tarjeta', 'Placa Vehicular', 'Email', 'Código de Auto Gestión', 'Celular',
  'Tipo de Usuario', 'Contratación', 'Puesto', 'Calle', 'Lugar de Nacimiento',
  'País', 'Teléfono de Casa', 'Dirección de Casa', 'Teléfono de Oficina', 'Dirección de Oficina'];
const DEPTOS = {
  Padres: { id: '7', nombre: 'Padres de familia' },
  Maestro: { id: '6', nombre: 'Maestros' },
  Alumno: { id: '5', nombre: 'Alumnos' },
  Admin: { id: '2', nombre: 'Administración' },
  '': { id: '7', nombre: 'Padres de familia' },
};
const TAGS_RESERVADOS_DEMO = ['13078087', '13078088']; // sin asignar: se instalan en vivo
// Huerfanas del historico que Gerardo pidio NO subir (8-sep-2026): datos viejos sin hoja.
const TAGS_EXCLUIDOS = ['1585822', '13077984', '9727324'];
// =================================================================

// --- export de ZK: el mas reciente Usuarios_*.csv en Campo/datos ---
const exportZk = fs.readdirSync(DATOS)
  .filter((f) => /^Usuarios_.*\.csv$/i.test(f))
  .map((f) => ({ f, t: fs.statSync(path.join(DATOS, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (!exportZk) {
  console.error('FALTA el export de ZK: copie Usuarios_YYYYMMDD....csv a Campo/datos/ y reintente.');
  process.exit(1);
}
console.log('Export ZK: ' + exportZk.f);
const crudoZk = fs.readFileSync(path.join(DATOS, exportZk.f), 'utf16le').replace(/^\uFEFF/, '');
const lineasZk = crudoZk.split(/\r?\n/).filter((l) => l.trim());
// linea 0 = titulo "Usuarios", linea 1 = encabezados, resto = datos
const zk = lineasZk.slice(2).map((l) => l.split('\t').map((c) => c.trim()));
const iTarjeta = 10, iNombre = 1;

// --- sheet de campo ---
function parseCsv(texto) {
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (q) { if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') q = false; else campo += c; }
    else if (c === '"') q = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
const crudoSheet = fs.readFileSync(path.join(DATOS, 'Registros.csv'), 'utf8').replace(/^\uFEFF/, '');
const sheet = new Map(); // tag -> {nombre, placa, usuario}
for (const f of parseCsv(crudoSheet).slice(1)) {
  const tag = (f[0] || '').trim();
  if (!tag) continue;
  const placa = ((f[5] || '').trim().toUpperCase()).replace(/^-+$|^N\/A.*$/i, '').trim();
  if (!sheet.has(tag)) sheet.set(tag, { nombre: (f[1] || '').trim(), placa, usuario: (f[9] || '').trim() });
}
console.log('Sheet: ' + sheet.size + ' TAGs distintos.');

function separarNombre(completo) {
  // Colapsa particulas (de/del/la/los/las/y) con el token siguiente para que
  // "Alfonso Fuentes de los Santos" parta como Alfonso | Fuentes de los Santos.
  const PART = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
  const raw = completo.trim().replace(/\s+/g, ' ').split(' ');
  const p = [];
  for (let i = 0; i < raw.length; i++) {
    let t = raw[i];
    while (PART.has(t.split(' ').pop().toLowerCase()) && i + 1 < raw.length) { i++; t += ' ' + raw[i]; }
    p.push(t);
  }
  if (p.length <= 1) return { nombre: completo.trim(), apellido: '' };
  if (p.length === 2) return { nombre: p[0], apellido: p[1] };
  return { nombre: p.slice(0, -2).join(' '), apellido: p.slice(-2).join(' ') };
}

// --- cruce ---
const salida = [];
const sinDatos = [];
let yaLlenas = 0;
for (const fila of zk) {
  const tarjeta = fila[iTarjeta] || '';
  const nombreZk = fila[iNombre] || '';
  if (!tarjeta) continue;
  if (nombreZk) { yaLlenas++; continue; }               // ya tiene persona: no tocar
  if (fila[3] === '10') continue;                        // BAJAS: no resucitar
  if (TAGS_RESERVADOS_DEMO.includes(tarjeta)) continue;  // libres para instalar en vivo
  if (TAGS_EXCLUIDOS.includes(tarjeta)) continue;        // huerfanas vetadas por Gerardo
  const d = sheet.get(tarjeta);
  if (!d || !d.nombre) { sinDatos.push(tarjeta); continue; }

  const { nombre, apellido } = separarNombre(d.nombre);
  const depto = DEPTOS[d.usuario] || DEPTOS[''];
  const nueva = new Array(COLS.length).fill('');
  nueva[0] = fila[0];                       // ID de ZK: actualiza, no duplica
  nueva[1] = nombre.toUpperCase();
  nueva[2] = apellido.toUpperCase();
  nueva[3] = depto.id;
  nueva[4] = depto.nombre;
  nueva[10] = tarjeta;
  // OJO: "Placa Vehicular" (col 12) se queda VACIA: ZK valida su formato y
  // rechaza placas mexicanas. La placa va solo en Celular (convencion IAQ).
  nueva[13] = '123456';                     // Codigo de Auto Gestion (convencion IAQ)
  nueva[14] = d.placa;                      // Celular = placa (convencion IAQ)
  salida.push(nueva);
}

const contenido = 'Usuarios' + '\t'.repeat(COLS.length - 1) + '\r\n'
  + COLS.join('\t') + '\r\n'
  + salida.map((r) => r.join('\t')).join('\r\n') + '\r\n';
const destino = path.join(DATOS, 'zk-actualizacion.csv');
fs.writeFileSync(destino, '\uFEFF' + contenido, 'utf16le');

console.log('\nFilas vacias en ZK llenadas con datos del sheet: ' + salida.length);
console.log('Filas de ZK ya llenas (no se tocan): ' + yaLlenas);
console.log('Reservadas para instalar en vivo en la demo: ' + TAGS_RESERVADOS_DEMO.join(', '));
if (sinDatos.length) {
  console.log('Tarjetas vacias en ZK SIN datos en el sheet (' + sinDatos.length + '): ' + sinDatos.join(', '));
}
console.log('\nESCRITO: ' + destino + '  (mismo formato UTF-16/tab del export)');
console.log('Muestra:');
for (const r of salida.slice(0, 5)) console.log('  ' + [r[0], r[1], r[2], r[4], r[10], r[14]].join(' | '));
