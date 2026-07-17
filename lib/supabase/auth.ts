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
// El hash de recuperacion se procesa a mano en /admin/reset-password, por eso
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
    detectSessionInUrl: false, // el hash de recuperacion se procesa a mano en /admin/reset-password
    flowType: "implicit", // recuperacion cross-device: token en el hash, sin code_verifier
    storageKey: "satag-admin-auth", // clave propia: no choca con el cliente publico anon
  },
});

// Ruta a la que Supabase redirige desde el correo de recuperacion. DEBE estar
// en la allowlist de Auth -> URL Configuration -> Redirect URLs (local y prod).
// trailingSlash: true en next.config -> la ruta estatica es /admin/reset-password/.
export function resetRedirectUrl(): string {
  return `${window.location.origin}/admin/reset-password/`;
}

// Traduce los errores de Supabase Auth (en ingles) a mensajes claros en espanol.
function mensajeAuth(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contrasena incorrectos.";
  if (m.includes("email not confirmed")) return "La cuenta aun no esta confirmada. Contacta al administrador del sistema.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("for security purposes")) {
    return "Demasiados intentos. Espera un momento e intentalo de nuevo.";
  }
  if (m.includes("invalid totp") || m.includes("mfa_verification_failed") ||
      (m.includes("code") && m.includes("invalid"))) {
    return "El codigo de verificacion no es valido o ya expiro. Escribe el codigo actual de tu app.";
  }
  if (m.includes("friendly name") && m.includes("already")) {
    return "Ya existe un factor con ese nombre. Refresca e intenta de nuevo.";
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
// (establecida en /admin/reset-password a partir del token del correo).
export async function actualizarContrasena(password: string): Promise<void> {
  const { error } = await supabaseAuth.auth.updateUser({ password });
  if (error) throw new Error(mensajeAuth(error.message));
}

// ---- Roles del panel ----
//
// El rol vive UNICAMENTE en `app_metadata.rol` y lo fija un administrador por
// SQL (runbook en supabase/sql/README.md, PASO 0). user_metadata ya no se lee:
// el usuario puede escribirla con updateUser() desde el navegador, y desde que
// la RLS exige app_metadata (bloques 27 y 30) un rol auto-elegido solo
// produciria una UI que promete pestanas que la BD niega.
//
// Sin rol asignado -> el panel muestra "pide tu rol al administrador" (y la
// BD no le deja leer nada de todas formas).
export type RolPanel = "admin" | "ti" | "consulta" | "super";

// Roles que un admin puede fijar en app_metadata. Es la fuente de verdad de la
// RLS (bloques 27 y 30) y de la guardia de los RPCs (panel_exigir_rol).
export const ROLES_PANEL: RolPanel[] = ["admin", "ti", "consulta", "super"];

function leerRol(meta: Record<string, unknown> | undefined | null): RolPanel | null {
  const rol = meta?.rol;
  return typeof rol === "string" && (ROLES_PANEL as string[]).includes(rol)
    ? (rol as RolPanel)
    : null;
}

// Rol efectivo: solo app_metadata (espejo exacto de lo que la RLS va a
// permitir). null = sin rol asignado.
export function rolDeUsuario(user: User | null | undefined): RolPanel | null {
  return leerRol(user?.app_metadata);
}

// ---- MFA (segundo factor TOTP) ----
//
// El panel exige aal2 (contrasena + codigo TOTP) para operar; la frontera REAL
// la aplica la RLS (aal = 'aal2'), no estos wrappers. Ver el runbook completo en
// Desarrollo/07 - MFA (Autenticacion Multifactor).md.

export type NivelAssurance = "aal1" | "aal2";

export interface NivelMfa {
  actual: NivelAssurance | null;    // aal de la sesion actual
  siguiente: NivelAssurance | null; // aal maximo alcanzable por el usuario
}

// Lee el AAL de la sesion para decidir el gate del panel:
//   actual 'aal1' + siguiente 'aal1' -> NO tiene factor: pedir alta (QR).
//   actual 'aal1' + siguiente 'aal2' -> tiene factor, falta el codigo de hoy.
//   actual 'aal2'                     -> ya cumplio.
export async function nivelMfa(): Promise<NivelMfa> {
  const { data, error } = await supabaseAuth.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(mensajeAuth(error.message));
  return {
    actual: data.currentLevel as NivelAssurance | null,
    siguiente: data.nextLevel as NivelAssurance | null,
  };
}

export interface InscripcionTotp {
  factorId: string;
  qrSvg: string;  // SVG del QR (se pinta inline; sin servicios externos)
  secret: string; // secreto en texto: guardar en gestor de contrasenas (respaldo)
}

// Un factor NO verificado con el mismo friendlyName bloquea un enroll nuevo
// (error mfa_factor_name_conflict). Estas altas abandonadas aparecen SOLO en
// listFactors().all: data.totp trae unicamente los verificados, por eso la
// limpieza DEBE mirar `all` (si no, el huerfano nunca se borra y el alta se
// atora para siempre).
async function limpiarFactoresTotpNoVerificados(): Promise<void> {
  const { data, error } = await supabaseAuth.auth.mfa.listFactors();
  if (error) throw new Error(mensajeAuth(error.message));
  const abandonados = data.all.filter((f) => f.factor_type === "totp" && f.status !== "verified");
  await Promise.all(abandonados.map((f) => desinscribirFactor(f.id)));
}

function esConflictoNombreFactor(mensaje: string): boolean {
  const m = mensaje.toLowerCase();
  return m.includes("friendly name") && m.includes("already");
}

// Enroll real: limpia altas abandonadas antes de inscribir y, si aun asi el
// nombre choca (factor huerfano de otra pestana o de una carrera), limpia y
// reintenta una vez.
async function enrollTotp(friendlyName: string): Promise<InscripcionTotp> {
  await limpiarFactoresTotpNoVerificados();
  let res = await supabaseAuth.auth.mfa.enroll({ factorType: "totp", friendlyName });
  if (res.error && esConflictoNombreFactor(res.error.message)) {
    await limpiarFactoresTotpNoVerificados();
    res = await supabaseAuth.auth.mfa.enroll({ factorType: "totp", friendlyName });
  }
  if (res.error) throw new Error(mensajeAuth(res.error.message));
  return { factorId: res.data.id, qrSvg: res.data.totp.qr_code, secret: res.data.totp.secret };
}

// Alta en vuelo: si el gate se monta dos veces (StrictMode en dev, o un
// re-render por cambio de sesion), dos POST /factors simultaneos chocarian por
// nombre repetido. Ambas llamadas comparten esta misma promesa.
let inscripcionEnCurso: Promise<InscripcionTotp> | null = null;

// Inicia el alta de un factor TOTP. Crea un factor NO verificado hasta que se
// confirme con el primer codigo (verificarTotp). Idempotente ante montajes
// dobles y auto-limpia altas abandonadas.
export function inscribirTotp(friendlyName = "SATAG"): Promise<InscripcionTotp> {
  if (!inscripcionEnCurso) {
    inscripcionEnCurso = enrollTotp(friendlyName).finally(() => { inscripcionEnCurso = null; });
  }
  return inscripcionEnCurso;
}

// Verifica un codigo TOTP contra un factor: la 1.a vez marca el factor como
// verificado y, en cada sesion, sube el nivel a aal2 (challenge + verify en uno).
export async function verificarTotp(factorId: string, codigo: string): Promise<void> {
  const { error } = await supabaseAuth.auth.mfa.challengeAndVerify({ factorId, code: codigo.trim() });
  if (error) throw new Error(mensajeAuth(error.message));
}

// Lista los factores TOTP del usuario (verificados y no verificados).
export async function factoresTotp() {
  const { data, error } = await supabaseAuth.auth.mfa.listFactors();
  if (error) throw new Error(mensajeAuth(error.message));
  return data.totp;
}

// Elimina un factor (p. ej. limpiar un alta abandonada no verificada). El reset
// por dispositivo perdido NO se hace aqui: requiere service_role (runbook §6).
export async function desinscribirFactor(factorId: string): Promise<void> {
  const { error } = await supabaseAuth.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(mensajeAuth(error.message));
}
