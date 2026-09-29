import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pruebas unitarias de la logica pura. Viven en pruebas-unitarias/, junto a
// pruebas-carga/, y NO dentro de app/ ni components/: ahi estan las fuentes que
// se compilan y publican, y un archivo de prueba suelto en el arbol del cliente
// es una invitacion a que algun dia se empaquete.
//
// Que entra aqui y que no: SOLO funciones puras, sin React y sin Supabase. El
// cliente de Supabase se construye al cargar su modulo y aborta si faltan las
// variables de entorno, asi que importar una pantalla arrastraria media
// aplicacion. Lo que necesita navegador vive en el arnes de Playwright, que es
// un repositorio aparte y corre contra el sitio ya publicado.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["pruebas-unitarias/**/*.test.ts"],
  },
});
