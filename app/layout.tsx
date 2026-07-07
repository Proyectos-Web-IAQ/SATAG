import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";

// Tipografía institucional (igual que SEVAD): Raleway autohospedada por next/font.
const raleway = Raleway({ subsets: ["latin"], display: "swap", variable: "--font-raleway" });

export const metadata: Metadata = {
  title: "SATAV — Adquisición de TAG Vehicular · IAQ",
  description:
    "Sistema de Adquisición de TAG Vehicular del Instituto Asunción de Querétaro. Prototipo de diseño.",
};

export const viewport: Viewport = { colorScheme: "only light" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={raleway.variable}>
      <body>
        <header className="app-header">
          <div className="app-brand">
            <span className="app-badge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/monograma-asuncion.png" alt="Instituto Asunción" />
            </span>
            <span className="app-titles">
              <span className="app-title">SATAV</span>
              <span className="app-subtitle">Adquisición de TAG Vehicular</span>
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="app-copete" src="/copete-burbuja.png" alt="Instituto Asunción de Querétaro" />
        </header>
        {children}
      </body>
    </html>
  );
}
