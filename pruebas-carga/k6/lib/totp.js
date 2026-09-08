// TOTP (RFC 6238, SHA-1, 6 digitos, 30 s) para que k6 pase el segundo factor
// del panel sin navegador. El secreto es el base32 que muestra el QR al enrolar.
import crypto from "k6/crypto";

export function base32Decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  s = String(s).replace(/[\s=-]/g, "").toUpperCase();
  const out = [];
  let bits = 0, val = 0;
  for (const c of s) {
    const i = A.indexOf(c);
    if (i < 0) throw new Error("el secreto TOTP no es base32");
    val = ((val << 5) | i) >>> 0; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

// counter opcional (para pruebas con los vectores del RFC); por omision, ahora.
export function totp(secreto, counter) {
  const key = base32Decode(secreto);
  let c = counter === undefined ? Math.floor(Date.now() / 1000 / 30) : counter;
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const h = new Uint8Array(crypto.hmac("sha1", key.buffer, msg.buffer, "binary"));
  const o = h[19] & 0x0f;
  const code = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000;
  return String(code).padStart(6, "0");
}
