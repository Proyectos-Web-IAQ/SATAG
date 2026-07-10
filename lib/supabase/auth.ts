// Cliente Supabase del PANEL administrativo (con sesion persistente).
//
// A diferencia de lib/supabase/client.ts (formulario publico, rol anon, SIN
// sesion), aqui el personal interno inicia sesion con Supabase Auth. Al
// autenticarse obtiene el rol `authenticated`, que las politicas RLS usan para
// permitir la gestion del padron (ver supabase/sql/13_rls_registros.sql).
//
// Sitio 100% estatico: no hay servidor ni middleware; toda la sesion vive en el
// navegador. Se usa flujo `implicit` (token en el hash de la URL) para que el
// enlace de recuperacion de contrasena funcione aunque el correo se abra en
// otro dispositivo (no depende de un code_verifier guardado localmente).
// El hash de recuperacion se procesa a mano en /admin/reset, por eso
// detectSessionInUrl va en false (evita condiciones de carrera al montar).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
      "Revisa tu archivo .env.local (ver .env.example).",
  );
}

export const supabaseAuth = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // el hash de recuperacion se procesa a mano en /admin/reset
    flowType: "implicit", // recuperacion cross-device: token en el hash, sin code_verifier
    storageKey: "satag-admin-auth", // clave propia: no choca con el cliente publico anon
  },
});

// Ruta a la que Supabase redirige desde el correo de recuperacion. DEBE estar
// en la allowlist de Auth -> URL Configuration -> Redirect URLs (local y prod).
// trailingSlash: true en next.config -> la ruta estatica es /admin/reset/.
export function resetRedirectUrl(): string {
  return `${window.location.origin}/admin/reset/`;
}

// Traduce los errores de Supabase Auth (en ingles) a mensajes claros en espanol.
function mensajeAuth(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contrasena incorrectos.";
  if (m.includes("email not confirmed")) return "La cuenta aun no esta confirmada. Contacta al administrador del sistema.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("for security purposes")) {
    return "Demasiados intentos. Espera un momento e intentalo de nuevo.";
  }
  if (m.includes("new password should be different")) return "La nueva contrasena debe ser distinta a la anterior.";
  if (m.includes("password should be at least") || m.includes("weak")) return "La contrasena no cumple el minimo de seguridad.";
  if (m.includes("session") && m.includes("missing")) return "La sesion expiro. Solicita un nuevo enlace de recuperacion.";
  return mensaje;
}

export async function iniciarSesion(email: string, password: string) {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(mensajeAuth(error.message));
  return data.user;
}

export async function cerrarSesion(): Promise<void> {
  const { error } = await supabaseAuth.auth.signOut();
  if (error) throw new Error(mensajeAuth(error.message));
}

// Envia el correo con el enlace de recuperacion. No revela si el correo existe.
export async function enviarCorreoRecuperacion(email: string): Promise<void> {
  const { error } = await supabaseAuth.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: resetRedirectUrl(),
  });
  if (error) throw new Error(mensajeAuth(error.message));
}

// Fija la nueva contrasena. Requiere una sesion de recuperacion activa
// (establecida en /admin/reset a partir del token del correo).
export async function actualizarContrasena(password: string): Promise<void> {
  const { error } = await supabaseAuth.auth.updateUser({ password });
  if (error) throw new Error(mensajeAuth(error.message));
}
