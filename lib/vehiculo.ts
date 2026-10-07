// El vehiculo de un expediente en una frase, para las tarjetas y la ficha.
//
// Los expedientes migrados traen marca, modelo y color en «Sin registrar». Listarlos
// los tres («Sin registrar Sin registrar · Sin registrar») es ruido que parece un
// error: si no hay ninguno, se dice una sola vez.
export function textoVehiculo(r: { marca?: string | null; modelo?: string | null; color?: string | null }): string {
  const limpio = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t && t.toLowerCase() !== "sin registrar" ? t : "";
  };
  const modelo = [limpio(r.marca), limpio(r.modelo)].filter(Boolean).join(" ");
  const color = limpio(r.color);
  if (!modelo && !color) return "Vehículo sin registrar";
  return [modelo, color].filter(Boolean).join(" · ");
}
