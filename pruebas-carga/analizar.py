"""Curva de saturacion a partir del CSV de k6 (--out csv=...).

Agrupa por escenario y por ventana de N segundos y saca, por ventana:
  VUs activos, peticiones/s, p50 y p95 de http_req_duration, mediana de
  upstream_ms (tiempo dentro de Supabase) y % de errores.

Con eso se ve el "codo": el punto en que el throughput deja de subir aunque
sigan entrando usuarios y la latencia se dispara. El throughput de la meseta
ES la capacidad medida de esa ruta; si ademas hay CSV de metricas (CPU real),
se calcula el costo por peticion = ncpu x utilizacion / throughput.

    python pruebas-carga/analizar.py resultados/<fecha>-lecturas.csv [--metricas resultados/<fecha>-metricas.csv] [--ventana 10]

Escribe <csv>.analisis.md al lado del CSV y lo imprime.
"""
import csv
import sys
import math
from collections import defaultdict
from datetime import datetime, timezone

def pct(vals, p):
    if not vals:
        return float("nan")
    s = sorted(vals)
    k = (len(s) - 1) * p
    f = math.floor(k); c = math.ceil(k)
    return s[f] if f == c else s[f] + (s[c] - s[f]) * (k - f)

def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(2)
    ruta_csv = args[0]
    ventana = 10
    metricas = None
    for i, a in enumerate(args):
        if a == "--ventana": ventana = int(args[i + 1])
        if a == "--metricas": metricas = args[i + 1]

    # metric_name,timestamp,metric_value,check,error,error_code,expected_response,group,method,name,proto,scenario,...
    dur = defaultdict(list)      # (esc, ventana) -> [ms]
    ups = defaultdict(list)      # (esc, ventana) -> [ms]
    reqs = defaultdict(int)
    errs = defaultdict(int)
    vus = defaultdict(list)
    t0 = None
    with open(ruta_csv, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for fila in r:
            ts = int(float(fila["timestamp"]))
            if t0 is None: t0 = ts
            esc = fila.get("scenario") or "-"
            v = (ts - t0) // ventana
            nombre = fila["metric_name"]
            val = float(fila["metric_value"])
            if nombre == "http_req_duration":
                dur[(esc, v)].append(val)
            elif nombre == "upstream_ms":
                ups[(esc, v)].append(val)
            elif nombre == "http_reqs":
                reqs[(esc, v)] += 1
                st = fila.get("status") or "0"
                if not st.startswith("2"): errs[(esc, v)] += 1
            elif nombre == "vus":
                vus[(esc, v)].append(val)  # vus no lleva scenario: cae en "-"

    # CPU por ventana (si hay CSV de metricas)
    cpu = {}
    ncpu = None
    if metricas:
        with open(metricas, newline="", encoding="utf-8") as f:
            for fila in csv.DictReader(f):
                ts = int(datetime.fromisoformat(fila["ts"].replace("Z", "+00:00")).timestamp())
                v = (ts - t0) // ventana
                cpu.setdefault(v, []).append(float(fila["cpu_util"]))
                ncpu = int(fila["ncpu"])

    escenarios = sorted({e for (e, _) in reqs if e != "-"}, key=lambda e: min(v for (x, v) in reqs if x == e))
    out = [f"# Analisis de {ruta_csv}", "", f"Ventana: {ventana} s · inicio (epoch): {t0} · {datetime.fromtimestamp(t0, tz=timezone.utc).isoformat()}", ""]
    if ncpu: out.append(f"CPU del proyecto: {ncpu} vCPU (segun node_cpu_seconds_total)"); out.append("")
    resumen = []
    for esc in escenarios:
        vent = sorted(v for (e, v) in reqs if e == esc)
        out += [f"## Escenario `{esc}`", "", "| t(s) | VUs | req/s | p50 ms | p95 ms | upstream med ms | err % |" + (" CPU % | costo ms CPU/req |" if ncpu else ""),
                "|---|---|---|---|---|---|---|" + ("---|---|" if ncpu else "")]
        mejor = (0, None)
        for v in vent:
            n = reqs[(esc, v)]
            rps = n / ventana
            d = dur[(esc, v)]
            u = ups[(esc, v)]
            e = errs[(esc, v)]
            vv = vus.get(("-", v)) or vus.get((esc, v)) or []
            fila = f"| {v * ventana} | {int(max(vv)) if vv else '—':>3} | {rps:6.1f} | {pct(d, .5):7.0f} | {pct(d, .95):7.0f} | {pct(u, .5):6.0f} | {100 * e / n if n else 0:4.1f} |"
            if ncpu:
                c = cpu.get(v)
                if c:
                    util = sum(c) / len(c)
                    costo = 1000 * ncpu * util / rps if rps else float("nan")
                    fila += f" {100 * util:5.1f} | {costo:7.1f} |"
                    if rps > mejor[0]: mejor = (rps, (util, costo, pct(d, .95), pct(u, .5)))
                else:
                    fila += " — | — |"
            else:
                if rps > mejor[0]: mejor = (rps, (None, None, pct(d, .95), pct(u, .5)))
            out.append(fila)
        out.append("")
        rps, det = mejor
        if det:
            util, costo, p95, up = det
            resumen.append((esc, rps, util, costo, p95, up))
    out += ["## Meseta por escenario (ventana de mayor throughput)", "", "| escenario | req/s max | p95 ms ahi | upstream med ms | CPU % | ms CPU / req |", "|---|---|---|---|---|---|"]
    for esc, rps, util, costo, p95, up in resumen:
        out.append(f"| {esc} | {rps:.1f} | {p95:.0f} | {up:.0f} | {100 * util:.1f} | {costo:.1f} |" if util is not None else f"| {esc} | {rps:.1f} | {p95:.0f} | {up:.0f} | — | — |")
    out += ["", "Lectura: si `upstream med` sube junto con p95 al crecer los VUs, la saturacion esta en Supabase.",
            "Si p95 sube pero `upstream` se queda plano, el limite esta en la red o en la maquina que lanza la prueba,",
            "y el throughput de la meseta es una COTA INFERIOR de la capacidad real, no la capacidad.", ""]
    texto = "\n".join(out)
    with open(ruta_csv + ".analisis.md", "w", encoding="utf-8") as f:
        f.write(texto)
    print(texto)

if __name__ == "__main__":
    main()
