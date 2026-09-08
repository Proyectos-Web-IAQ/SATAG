// Prueba del TOTP contra los vectores del RFC 6238 (apendice B, SHA-1):
//   k6 run pruebas-carga/k6/lib/totp.test.js
import { totp } from "./totp.js";
import { check } from "k6";

// Secreto del RFC: "12345678901234567890" en base32.
const SECRETO = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const VECTORES = [
  [59, "287082"],          // T=59  -> 94287082
  [1111111109, "081804"],  // T=1111111109 -> 07081804
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];
export const options = { vus: 1, iterations: 1 };
export default function () {
  for (const [t, esperado] of VECTORES) {
    const got = totp(SECRETO, Math.floor(t / 30));
    check(got, { [`T=${t} -> ${esperado}`]: (x) => x === esperado });
  }
}
