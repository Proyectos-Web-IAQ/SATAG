# Arquitectura Técnica — SATAV

> **Estado:** pendiente de desarrollo.
> Este documento aterrizará el reuso técnico de SEVAD para SATAV.

## Contenido previsto

- Stack: Next.js estático + React + TypeScript.
- Supabase: cliente, Auth, Postgres, Storage y RLS.
- Hosting: GoDaddy + Cloudflare.
- CI/CD: GitHub Actions + FTPS.
- Variables de entorno y secretos.
- Estructura futura del código.
- **Módulos reutilizables** *(rev. Dirección 03-jul, B8)*: la **firma** (`SignaturePad` + `Firma` +
  `FirmaService`) se diseña como **paquete portátil** (p. ej. `lib/firma/`), **desacoplado** del dominio
  de SATAV, para reutilizarse en otros sistemas del IAQ. Frontera e interfaz en
  [`06 - Firma Electrónica`](06%20-%20Firma%20Electronica%20%28mecanica%20y%20valor%20legal%29.md) §9.
- Criterios de despliegue y verificación.

## Referencias

- [`Investigacion/01 - Playbook Tecnico (reuso de SEVAD).md`](../Investigacion/01%20-%20Playbook%20Tecnico%20%28reuso%20de%20SEVAD%29.md)
- [`00 - Indice Tecnico.md`](00%20-%20Indice%20Tecnico.md)
