import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";

// El panel del personal se puede instalar como app en el celular y la
// computadora. El manifiesto se liga SOLO en este segmento (/admin/, que
// incluye invite/ y reset-password/): el registro público, el buzón y el
// aviso de privacidad son para familias y no deben ofrecer «Instalar app».
// Por eso no se usa app/manifest.ts, que aplicaría a todo el sitio.
//
// Sin service worker, a propósito: Chrome y Edge ya no lo exigen para
// instalar, y sin él una app instalada no puede servir un panel viejo
// guardado en caché después de un deploy.
export const metadata: Metadata = {
  manifest: "/manifest-admin.webmanifest",
  appleWebApp: { capable: true, title: "SATAG", statusBarStyle: "default" },
  // Declarar `icons` aquí reemplaza, en este segmento, el favicon que el sitio
  // toma de app/icon.png: en el build del 15-sep el panel se quedó sin ícono de
  // pestaña. Por eso se repite el de la raíz junto al de Apple.
  icons: { icon: "/icon.png", apple: "/monograma-asuncion.png" },
};

// El layout raíz fija colorScheme "only light"; se repite aquí para que el
// viewport de este segmento no dependa del orden en que Next los combina.
export const viewport: Viewport = { themeColor: "#002E6C", colorScheme: "only light" };

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
