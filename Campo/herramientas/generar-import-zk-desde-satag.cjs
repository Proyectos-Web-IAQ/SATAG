// Puente SATAG -> ZKBioSecurity: toma el export del SQL Editor
// (Campo/datos/satag-export.csv, generado con export-zk-desde-satag.sql)
// y el export de ZK (Usuarios_*.csv), y produce el archivo de importacion
// que llena en ZK las tarjetas pre-dadas de alta que SATAG acaba de instalar.
//
// Uso:
//   1. Correr export-zk-desde-satag.sql en el SQL Editor y descargar el CSV
//      como Campo\datos\satag-export.csv
//   2. node Campo\herramientas\generar-import-zk-desde-satag.cjs
//   3. Salida: Campo\datos\zk-actualizacion-desde-satag.csv (formato ZK)

const fs = require('fs');
const path = require('path');
const DATOS = path.join(__dirname, '..', 'datos');

const COLS = ['ID', 'Nombre', 'Apellido', 'ID de Departamento', 'Nombre de Departamento',
  'Género', 'Cumpleaños', 'Contraseña', 'Tipo de Documento', 'No. de Documento',
  'Tarjeta', 'Placa Vehicular', 'Email', 'Código de Auto Gestión', 'Celular',
  'Tipo de Usuario', 'Contratación', 'Puesto', 'Calle', 'Lugar de Nacimiento',
  'País', 'Teléfono de Casa', 'Dirección de Casa', 'Teléfono de Oficina', 'Dirección de Oficina'];
const DEPTOS = {
  padres: { id: '7', nombre: 'Padres de familia' },
  maestro: { id: '6', nombre: 'Maestros' },
  alumno: { id: '5', nombre: 'Alumnos' },
  admin: { id: '2', nombre: 'Administración' },
};

// --- export de ZK mas reciente ---
const exportZk = fs.readdirSync(DATOS).filter((f) => /^Usuarios_.*\.csv$/i.test(f))
  .map((f) => ({ f, t: fs.statSync(path.join(DATOS, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
if (!exportZk) { console.error('FALTA Usuarios_*.csv (export de ZK) en Campo/datos/'); process.exit(1); }
const zkFilas = fs.readFileSync(path.join(DATOS, exportZk.f), 'utf16le').replace(/^﻿/, '')
  .split(/\r?\n/).filter((l) => l.trim()).slice(2).map((l) => l.split('\t').map((c) => c.trim()));
console.log('Export ZK: ' + exportZk.f);

// --- export de SATAG (CSV del SQL Editor: tag,nombre,placa,usuario,folio,alta) ---
const rutaSatag = path.join(DATOS, 'satag-export.csv');
if (!fs.existsSync(rutaSatag)) { console.error('FALTA Campo/datos/satag-export.csv (correr export-zk-desde-satag.sql y descargar)'); process.exit(1); }
function parseCsv(t) {
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"' && t[i+1] === '"') { campo += '"'; i++; } else if (c === '"') q = false; else campo += c; }
    else if (c === '"') q = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i+1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c; }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
const filasSatag = parseCsv(fs.readFileSync(rutaSatag, 'utf8').replace(/^﻿/, ''));
const enc = filasSatag[0].map((h) => h.trim().toLowerCase());
const col = (n) => enc.indexOf(n);
const iTag = col('tag'), iNom = col('nombre'), iPla = col('placa'), iUsu = col('usuario');
if (iTag < 0 || iNom < 0) { console.error('El CSV de SATAG no trae las columnas esperadas (tag, nombre, placa, usuario).'); process.exit(1); }
const satag = new Map();
for (const f of filasSatag.slice(1)) {
  const tag = (f[iTag] || '').trim();
  if (tag) satag.set(tag, { nombre: (f[iNom] || '').trim(), placa: (f[iPla] || '').trim().toUpperCase(), usuario: (f[iUsu] || '').trim().toLowerCase() });
}
console.log('SATAG: ' + satag.size + ' registros instalados en el export.');

function separarNombre(completo) {
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

const salida = [];
const sinTarjetaEnZk = new Set(satag.keys());
for (const fila of zkFilas) {
  const tarjeta = fila[10] || '';
  if (!tarjeta || !satag.has(tarjeta)) continue;
  sinTarjetaEnZk.delete(tarjeta);
  if ((fila[1] || '').trim()) continue;   // ya tiene persona en ZK: no tocar
  if (fila[3] === '10') continue;         // BAJAS
  const d = satag.get(tarjeta);
  const { nombre, apellido } = separarNombre(d.nombre);
  const depto = DEPTOS[d.usuario] || DEPTOS.padres;
  const n = new Array(COLS.length).fill('');
  n[0] = fila[0]; n[1] = nombre.toUpperCase(); n[2] = apellido.toUpperCase();
  n[3] = depto.id; n[4] = depto.nombre; n[10] = tarjeta;
  // "Placa Vehicular" (col 12) VACIA: ZK valida el formato y rechaza placas
  // mexicanas; la placa va solo en Celular (convencion IAQ).
  n[13] = '123456'; n[14] = d.placa;
  salida.push(n);
}

const contenido = 'Usuarios' + '\t'.repeat(COLS.length - 1) + '\r\n' + COLS.join('\t') + '\r\n'
  + salida.map((r) => r.join('\t')).join('\r\n') + '\r\n';
const destino = path.join(DATOS, 'zk-actualizacion-desde-satag.csv');
fs.writeFileSync(destino, '﻿' + contenido, 'utf16le');

console.log('\nTarjetas de ZK llenadas desde SATAG: ' + salida.length);
if (sinTarjetaEnZk.size) {
  console.log('TAGs instalados en SATAG que NO existen como tarjeta en ZK (darlos de alta a mano o pedir export nuevo): ' + [...sinTarjetaEnZk].join(', '));
}
console.log('ESCRITO: ' + destino);
for (const r of salida.slice(0, 8)) console.log('  ' + [r[0], r[1], r[2], r[4], r[10], r[14]].join(' | '));
