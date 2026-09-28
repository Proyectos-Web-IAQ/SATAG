// Medianas y duraciones en palabras. Viven aparte porque los usan tanto el
// tablero de instalacion como sus graficas.

// POR QUE MEDIANA Y NO PROMEDIO: al 28-sep-2026 hay seis instalaciones con hora
// sellada. Con esa cantidad un solo caso atipico —una familia que pago y vino
// por su TAG tres semanas despues— arrastra el promedio y la pantalla mentiria.
// La mediana aguanta ese caso sin esconderlo: el atipico sigue a la vista, como
// punto en la grafica de dispersion y como tarjeta de "la mas tardada".
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

// Duracion en palabras. El rango real va de minutos —la familia ya estaba
// formada— a semanas, asi que una sola unidad no sirve para las dos puntas:
// "0.01 dias" y "31 680 min" son igual de ilegibles.
export function duracion(ms: number | null): string {
  if (ms === null) return "—";
  const min = Math.round(ms / 60000);
  if (min < 90) return `${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 48) {
    const resto = min % 60;
    return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
  }
  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  return resto === 0 ? `${dias} días` : `${dias} días ${resto} h`;
}

// 'gerardo.sanchez@...' -> 'gerardo.sanchez'. El correo es la identidad que el
// bloque 68 sella desde el JWT, asi que es el dato bueno; en pantalla se recorta
// para que quepa y el completo va en el title.
export function personaCorta(email: string | null): string {
  if (!email) return "Sin identificar";
  const arroba = email.indexOf("@");
  return arroba > 0 ? email.slice(0, arroba) : email;
}
