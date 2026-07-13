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
import { createClient, type User } from "@supabase/supabase-js";

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

// ---- Roles del panel ----
//
// Cada usuario ELIGE su propio rol al entrar; se guarda en `user_metadata.rol`,
// que el propio usuario puede escribir desde el navegador con updateUser(). Como
// el sitio es estatico (sin service_role en el navegador), esta es la unica forma
// de que la eleccion la haga el usuario sin un servidor.
//
// IMPORTANTE: al ser auto-seleccionable, el rol NO es una frontera de seguridad
// (cualquiera podria elegir "admin"). Solo separa la vista/acciones del panel.
// El control real seguira dependiendo de RLS (pendiente, ver 13_rls_registros.sql).
//
// Candado opcional del admin: si un administrador fija `app_metadata.rol` por SQL
// (inescribible por el usuario), ese valor GANA sobre la eleccion del usuario, lo
// que permite bloquear el rol de alguien. Ver supabase/README.md.
export type RolPanel = "admin" | "ti" | "consulta";
export const ROLES_PANEL: RolPanel[] = ["admin", "ti", "consulta"];

function leerRol(meta: Record<string, unknown> | undefined | null): RolPanel | null {
  const rol = meta?.rol;
  return typeof rol === "string" && (ROLES_PANEL as string[]).includes(rol)
    ? (rol as RolPanel)
    : null;
}

// Rol efectivo: primero el candado del admin (app_metadata), si no el que eligio
// el usuario (user_metadata). null = aun no tiene rol -> la UI le pide elegirlo.
export function rolDeUsuario(user: User | null | undefined): RolPanel | null {
  return leerRol(user?.app_metadata) ?? leerRol(user?.user_metadata);
}

// true si un admin fijo el rol en app_metadata: el usuario no puede cambiarlo.
export function rolBloqueadoPorAdmin(user: User | null | undefined): boolean {
  return leerRol(user?.app_metadata) !== null;
}

// Guarda el rol elegido por el usuario en user_metadata (persiste entre sesiones y
// dispositivos). Dispara el evento USER_UPDATED para refrescar la sesion local.
export async function elegirRol(rol: RolPanel): Promise<void> {
  const { error } = await supabaseAuth.auth.updateUser({ data: { rol } });
  if (error) throw new Error(mensajeAuth(error.message));
}
