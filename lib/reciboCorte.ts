import type { CorteCaja, PagoReciente } from "@/lib/mock/types";
import { fecha, fechaHora } from "@/lib/formato";

// Recibo imprimible de un corte de caja (pedido del CP, 27-nov-2026, para el
// primer cierre).
//
// Es un documento HTML completo que se abre en una ventana aparte y se manda
// a imprimir. Va como funcion pura, sin React y sin la base, para poder
// probarlo solo: es un papel que se firma, y un total mal puesto no se nota
// hasta que alguien lo cuenta.
//
// Lo que lleva:
//   - folio, mes y periodo del corte (el CP pidio que el historico diga el mes);
//   - cuantos TAG se cobraron y cuanto se devolvio;
//   - esperado, contado y diferencia;
//   - el detalle de cobros;
//   - las firmas de quien entrega y de quien recibe.
//
// Todo texto que viene de la base pasa por `esc`: un nombre o una observacion
// con «<» no puede romper el documento.

const dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function esc(v: string | null | undefined): string {
  return (v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** «noviembre 2026»: el mes en que se cerró el corte, en hora de Querétaro. */
export function mesDelCorte(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" })
    .formatToParts(t)
    .reduce<Record<string, string>>((o, x) => ((o[x.type] = x.value), o), {});
  return `${MESES_LARGOS[+p.month - 1]} ${p.year}`;
}

function firmaDiferencia(d: number): string {
  if (d === 0) return "Cuadra exacto";
  return d > 0 ? `Sobrante de ${dinero.format(d)}` : `Faltante de ${dinero.format(Math.abs(d))}`;
}

export function htmlReciboCorte(
  corte: CorteCaja,
  pagos: PagoReciente[],
  impresoPor: string,
  ahora: Date = new Date(),
): string {
  const cobrado = Number((corte.totalEsperado + corte.totalDevuelto).toFixed(2));
  const periodo = corte.periodoDesde
    ? `del ${fecha(corte.periodoDesde)} al ${fecha(corte.periodoHasta)}`
    : `hasta el ${fecha(corte.periodoHasta)}`;

  const filas = pagos.map((p) => `
        <tr${p.devolucion ? ' class="dev"' : ""}>
          <td>${esc(fechaHora(p.fecha))}</td>
          <td>${esc(p.folioRecibo ?? "—")}${p.devolucion ? " · devolución" : ""}</td>
          <td>${esc(p.registroFolio ?? "—")}</td>
          <td>${esc(p.usuarioNombre ?? "")}${p.devolucion && p.motivo ? `<br><span class="motivo">Motivo: ${esc(p.motivo)}</span>` : ""}</td>
          <td class="num">${p.devolucion ? "−" : ""}${dinero.format(p.monto)}</td>
          <td>${esc(p.cobradoPor ?? "—")}</td>
        </tr>`).join("");

  // Las devoluciones van ADEMAS en su propia seccion, antes de las firmas: es
  // lo primero que pregunta quien recibe el dinero («¿cual se devolvio y por
  // que?»), y en el detalle completo se pierde entre decenas de cobros.
  const devs = pagos.filter((p) => p.devolucion);
  const seccionDevs = devs.length === 0 ? "" : `
  <h2>Devoluciones en este corte (${devs.length})</h2>
  <table class="det">
    <thead>
      <tr><th>Fecha</th><th>Recibo devuelto</th><th>Expediente</th><th>Titular</th><th class="num">Monto</th><th>Motivo</th><th>Devolvió</th></tr>
    </thead>
    <tbody>${devs.map((p) => `
      <tr class="dev">
        <td>${esc(fechaHora(p.fecha))}</td>
        <td>${esc(p.folioRecibo ?? "—")}</td>
        <td>${esc(p.registroFolio ?? "—")}</td>
        <td>${esc(p.usuarioNombre ?? "")}</td>
        <td class="num">−${dinero.format(p.monto)}</td>
        <td>${esc(p.motivo ?? "Sin motivo registrado")}</td>
        <td>${esc(p.cobradoPor ?? "—")}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Recibo de corte de caja ${esc(corte.folioCorte)}</title>
<style>
  @page { size: letter; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Libre Franklin", Arial, sans-serif; color: #1a2433; font-size: 11pt; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1f3a5f; padding-bottom: 6px; }
  h1 { font-family: Raleway, Arial, sans-serif; font-size: 16pt; margin: 0; color: #1f3a5f; }
  .inst { font-size: 9.5pt; color: #4a5568; }
  .folio { text-align: right; font-size: 10pt; }
  .folio b { font-size: 12pt; }
  .datos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 18px; margin: 12px 0; font-size: 10pt; }
  .datos span { color: #4a5568; display: block; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; }
  table.totales { border-collapse: collapse; width: 100%; margin: 6px 0 10px; }
  table.totales td { padding: 5px 8px; border: 1px solid #c9d2de; }
  table.totales td:first-child { width: 60%; }
  table.totales tr.fuerte td { font-weight: 700; background: #eef3f8; }
  .obs { border: 1px solid #c9d2de; padding: 6px 8px; min-height: 34px; font-size: 10pt; white-space: pre-wrap; }
  h2 { font-family: Raleway, Arial, sans-serif; font-size: 11pt; color: #1f3a5f; margin: 14px 0 4px; }
  table.det { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
  table.det th, table.det td { border-bottom: 1px solid #dde3eb; padding: 3px 4px; text-align: left; vertical-align: top; }
  table.det th { background: #1f3a5f; color: #fff; font-weight: 600; }
  table.det tr { break-inside: avoid; }
  table.det tr.dev td { color: #9b2c2c; }
  .num { text-align: right; white-space: nowrap; }
  .motivo { color: #4a5568; }
  .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 46px; break-inside: avoid; }
  .firma { text-align: center; font-size: 10pt; }
  .firma .linea { border-top: 1px solid #1a2433; margin-bottom: 4px; height: 0; }
  .firma .rol { font-weight: 700; }
  .firma .nombre { min-height: 1.3em; }
  .pie { margin-top: 18px; font-size: 8pt; color: #6b7686; border-top: 1px solid #dde3eb; padding-top: 4px; }
  @media screen { body { max-width: 216mm; margin: 12px auto; padding: 0 12px; } }
</style>
</head>
<body>
  <header>
    <div>
      <div class="inst">Instituto Asunción de Querétaro · SATAG</div>
      <h1>Recibo de corte de caja</h1>
    </div>
    <div class="folio">Folio<br><b>${esc(corte.folioCorte)}</b></div>
  </header>

  <div class="datos">
    <div><span>Mes</span>${esc(mesDelCorte(corte.periodoHasta))}</div>
    <div><span>Periodo</span>${esc(periodo)}</div>
    <div><span>Cerrado el</span>${esc(fechaHora(corte.createdAt))}</div>
    <div><span>Cerró el corte</span>${esc(corte.cortadoPor)}</div>
    <div><span>Días con cobro</span>${corte.diasDeCobro}</div>
    <div><span>TAG cobrados</span>${corte.cantidadPagos}</div>
  </div>

  <table class="totales">
    <tr><td>Cobrado (${corte.cantidadPagos} TAG)</td><td class="num">${dinero.format(cobrado)}</td></tr>
    <tr><td>Devuelto (${corte.cantidadDevoluciones} devolución${corte.cantidadDevoluciones === 1 ? "" : "es"})</td><td class="num">${corte.totalDevuelto > 0 ? "−" : ""}${dinero.format(corte.totalDevuelto)}</td></tr>
    <tr class="fuerte"><td>Esperado en caja</td><td class="num">${dinero.format(corte.totalEsperado)}</td></tr>
    <tr class="fuerte"><td>Efectivo contado</td><td class="num">${dinero.format(corte.efectivoContado)}</td></tr>
    <tr><td>Diferencia</td><td class="num">${esc(firmaDiferencia(corte.diferencia))}</td></tr>
  </table>

  <h2>Observaciones</h2>
  <div class="obs">${esc(corte.observaciones ?? "")}</div>
${seccionDevs}

  <div class="firmas">
    <div class="firma">
      <div class="linea"></div>
      <div class="rol">Entrega</div>
      <div class="nombre">${esc(corte.cortadoPor)}</div>
      <div>Nombre y firma</div>
    </div>
    <div class="firma">
      <div class="linea"></div>
      <div class="rol">Recibe</div>
      <div class="nombre"></div>
      <div>Nombre y firma</div>
    </div>
  </div>

  <h2>Detalle de cobros y devoluciones (${pagos.length})</h2>
  <table class="det">
    <thead>
      <tr><th>Fecha</th><th>Recibo</th><th>Expediente</th><th>Titular</th><th class="num">Monto</th><th>Cobrado o devuelto por</th></tr>
    </thead>
    <tbody>${filas || '\n        <tr><td colspan="6">Sin cobros ni devoluciones en este corte.</td></tr>'}
    </tbody>
  </table>

  <div class="pie">Impreso el ${esc(fechaHora(ahora.toISOString()))} por ${esc(impresoPor)} desde SATAG. Documento interno de control de caja.</div>
</body>
</html>`;
}
