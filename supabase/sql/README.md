# SATAG Supabase SQL atomico

Esta carpeta descompone `../schema.sql` en piezas pequenas para poder auditar, ejecutar y probar el modelo tabla por tabla.

`../schema.sql` se conserva como respaldo monolitico mientras se completa la migracion atomica. La fuente operativa recomendada para trabajo nuevo debe ser esta carpeta.

## Orden de ejecucion

Ejecutar en Supabase SQL Editor siguiendo el orden numerico:

1. `00_extensions.sql`
2. `01_estacionamientos.sql`
3. `02_cat_marcas.sql`
4. `03_cat_modelos.sql`
5. `04_cat_colores.sql`
6. `05_rls_catalogos.sql`
7. `06_grants_catalogos.sql`
8. `07_reglamento_versiones.sql`
9. `08_aviso_versiones.sql`
10. `09_rls_documentos.sql`
11. `10_grants_documentos.sql`
12. `11_seed_documentos_placeholder.sql`
13. `12_registros.sql`
14. `13_rls_registros.sql`
15. `14_grants_registros.sql`
16. `15_aceptaciones.sql`
17. `16_movimientos.sql`
18. `17_rls_alta.sql`
19. `18_grants_alta.sql`
20. `19_rpc_crear_registro.sql`
21. `20_storage_firmas.sql`

## Ciclo de auditoria por tabla

Para cada archivo:

1. Confirmar proposito de la tabla.
2. Confirmar si guarda PII.
3. Revisar columnas y tipos.
4. Revisar constraints.
5. Revisar indices.
6. Definir RLS esperado.
7. Escribir pruebas SQL minimas.
8. Marcar decision abierta antes de avanzar.

## Estado

| Archivo | Estado | Nota |
|---|---|---|
| `00_extensions.sql` | Listo para revisar | Requerido para UUID y hash SHA-256. |
| `01_estacionamientos.sql` | Listo para revisar | Catalogo operativo sin PII. |
| `02_cat_marcas.sql` | Listo para revisar | Catalogo publico sin PII. |
| `03_cat_modelos.sql` | Listo para revisar | Depende de `cat_marcas`. |
| `04_cat_colores.sql` | Listo para revisar | Catalogo publico sin PII. |
| `05_rls_catalogos.sql` | Listo para revisar | RLS de lectura publica y mantenimiento autenticado. |
| `06_grants_catalogos.sql` | Listo para revisar | Permisos SQL minimos para anon/authenticated. |
| `07_reglamento_versiones.sql` | Listo para revisar | Versiones del reglamento. |
| `08_aviso_versiones.sql` | Listo para revisar | Versiones del aviso de privacidad. |
| `09_rls_documentos.sql` | Listo para revisar | Lectura publica solo de documentos vigentes. |
| `10_grants_documentos.sql` | Listo para revisar | Permisos SQL para documentos versionados. |
| `11_seed_documentos_placeholder.sql` | Temporal | Placeholder de desarrollo; reemplazar antes de produccion. |
| `12_registros.sql` | Listo para revisar | Expediente central con PII; nombres separados + nombre_completo GENERATED. |
| `13_rls_registros.sql` | Listo para revisar | anon sin acceso directo; authenticated administra por ahora. |
| `14_grants_registros.sql` | Listo para revisar | Grants de registros; alta publica solo via RPC. |
| `15_aceptaciones.sql` | Listo para revisar | Evidencia de firma con PII; una por registro; inmutable. |
| `16_movimientos.sql` | Listo para revisar | Bitacora del ciclo de vida; el RPC escribe el 'alta'. |
| `17_rls_alta.sql` | Listo para revisar | RLS: aceptaciones solo SELECT; movimientos ALL; anon sin acceso. |
| `18_grants_alta.sql` | Listo para revisar | Grants: authenticated lee aceptaciones y administra movimientos; anon nada. |
| `19_rpc_crear_registro.sql` | Listo para revisar | Alta atomica publica; SECURITY DEFINER; devuelve {id, folio, estado}. |
| `20_storage_firmas.sql` | Listo para revisar | Bucket privado firmas; anon solo sube; limite 2MB PNG/JPEG. Requiere Supabase. |
