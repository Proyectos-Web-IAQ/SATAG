"use client";
import { useEffect, useRef } from "react";

// Evidencia vectorial del trazo: puntos con tiempo (ms) y presion (0..1).
// Sirve para probar que la firma fue trazada a mano y es reproducible.
export interface FirmaTrazos {
  version: 1;
  width: number; // tamano CSS del canvas (para reescalar al reproducir)
  height: number;
  capturadoEn: string; // ISO
  strokes: Array<Array<{ x: number; y: number; t: number; p: number }>>;
}

// Firma manuscrita digital sobre <canvas>. Sin dependencias externas.
// onChange emite el PNG (dataURL); onTrazos emite el vector del trazo.
// trazosIniciales repinta una firma ya capturada: el componente se desmonta al
// salir del paso de firma y al volver nace en blanco, mientras el padre sigue
// guardando el PNG y el vector de la pasada anterior. Solo se lee al montar.
export default function SignaturePad({
  onChange,
  onTrazos,
  trazosIniciales,
}: {
  onChange: (dataUrl: string) => void;
  onTrazos?: (trazos: FirmaTrazos | null) => void;
  trazosIniciales?: FirmaTrazos | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef<FirmaTrazos["strokes"]>([]);
  const current = useRef<FirmaTrazos["strokes"][number] | null>(null);
  const t0 = useRef<number | null>(null);

  // Al montar se dimensiona el lienzo, y asignar width/height lo deja en blanco.
  // Si volvemos al paso de firma con una firma ya capturada hay que repintarla
  // desde el vector: de lo contrario la persona ve el recuadro vacio mientras el
  // padre conserva el PNG anterior, y acabaria enviando una firma que la
  // pantalla ya no muestra. Aqui no se emite nada hacia el padre: el PNG y los
  // trazos que ya tiene siguen siendo los buenos, y reemitirlos falsearia
  // capturadoEn y abriria un ciclo de render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#12305c";

    const previa = trazosIniciales;
    if (!previa || previa.strokes.length === 0) return;
    // El recuadro mide 100% de ancho: si cambio entre una pasada y otra, los
    // puntos se reescalan al tamano actual para que lo repintado y lo que
    // emitira emitirTrazos hablen del mismo sistema de coordenadas.
    const escalaX = previa.width > 0 ? rect.width / previa.width : 1;
    const escalaY = previa.height > 0 ? rect.height / previa.height : 1;
    strokes.current = previa.strokes.map((trazo) =>
      trazo.map((pt) => ({
        x: Math.round(pt.x * escalaX * 10) / 10,
        y: Math.round(pt.y * escalaY * 10) / 10,
        t: pt.t,
        p: pt.p,
      })),
    );
    for (const trazo of strokes.current) {
      if (!trazo.length) continue;
      ctx.beginPath();
      ctx.moveTo(trazo[0].x, trazo[0].y);
      for (const pt of trazo.slice(1)) ctx.lineTo(pt.x, pt.y);
      // Un toque suelto deja un unico punto: se cierra sobre si mismo para que
      // el lineCap redondo lo pinte igual que al capturarlo.
      if (trazo.length === 1) ctx.lineTo(trazo[0].x, trazo[0].y);
      ctx.stroke();
    }
    // Los tiempos continuan la linea de la pasada anterior: si la persona agrega
    // un trazo mas, su t sigue al ultimo punto en vez de reiniciar en 0.
    const ultimoT = Math.max(...strokes.current.map((trazo) => trazo[trazo.length - 1]?.t ?? 0));
    t0.current = performance.now() - ultimoT;
    // Solo al montar. Los trazos que llegan despues son el eco de lo que se
    // acaba de dibujar aqui: repintar entonces borraria el lienzo a media firma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function punto(e: React.PointerEvent, p: { x: number; y: number }) {
    const t = t0.current == null ? 0 : Math.round(performance.now() - t0.current);
    return {
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      t,
      p: Math.round(e.pressure * 100) / 100,
    };
  }
  function emitirTrazos() {
    if (!onTrazos) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    onTrazos({
      version: 1,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      capturadoEn: new Date().toISOString(),
      strokes: strokes.current,
    });
  }

  function down(e: React.PointerEvent) {
    drawing.current = true;
    if (t0.current == null) t0.current = performance.now();
    const p = pos(e);
    last.current = p;
    current.current = [punto(e, p)];
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    current.current?.push(punto(e, p));
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (current.current && current.current.length) strokes.current.push(current.current);
    current.current = null;
    onChange(canvasRef.current!.toDataURL("image/png"));
    emitirTrazos();
  }
  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    strokes.current = [];
    current.current = null;
    t0.current = null;
    onChange("");
    onTrazos?.(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="sigpad"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={clear}>
          Borrar firma
        </button>
      </div>
    </div>
  );
}
