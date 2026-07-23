# SATAG Supabase SQL atomico

Esta carpeta descompone `../schema.sql` en piezas pequenas para poder auditar, ejecutar y probar el modelo tabla por tabla.

`../schema.sql` se conserva como respaldo monolitico mientras se completa la migracion atomica. La fuente operativa recomendada para trabajo nuevo debe ser esta carpeta.

## Orden de ejecucion

Ejecutar en Supabase SQL Editor siguiendo el orden numerico.

> **PASO 0 — OBLIGATORIO ANTES DEL BLOQUE 24-30.**
> A partir de `27_rls_grants_panel.sql` la RLS exige `app_metadata.rol`. Si se
> aplica ese bloque sin haber preparado al personal, el panel deja de leer.
>
> 1. Asignar el rol a CADA usuario del personal (SQL editor, como owner):
>    ```sql
>    update auth.users
>       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
>           || jsonb_build_object('rol', 'ti')   -- admin | ti | consulta | super
>     where email = 'persona@asuncionqro.edu.mx';
>    ```
> 2. Cada usuario cierra sesion y vuelve a entrar. El rol viaja en el JWT: un
>    token emitido antes del paso 1 no lo trae, y su sesion queda sin acceso.
> 3. Recien entonces aplicar `24` a `30` en orden.
>
> Verificacion rapida (debe devolver una fila por persona, con su rol):
> ```sql
> select email, raw_app_meta_data ->> 'rol' as rol from auth.users order by email;
> ```

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
22. `21_seed_cat_modelos.sql`
23. `22_publicar_aviso_v2.sql`
24. `23_publicar_reglamento_v2.sql`
25. `24_pagos.sql`
26. `25_registro_estacionamientos.sql`
27. `26_solicitudes.sql`
28. `27_rls_grants_panel.sql`
29. `28_rpc_crear_solicitud.sql`
30. `29_rpc_panel.sql`
31. `30_roles_finos.sql` (requiere el PASO 0 hecho; sin el, el personal pierde el panel)
32. `31_rpc_flujos_atomicos.sql` (reemplaza las acciones compuestas del cliente por RPCs atómicos)
33. `32_folios_recibo_automaticos.sql` (genera el recibo en PostgreSQL e impide doble pago por expediente)
34. `33_apartar_tag.sql` (CC-01: apartar TAG al instalar + procedencia editable por TI; drop+recreate de los wrappers de instalar/actualizar)
35. `34_buzon_notas_sin_folio.sql` (SC-003: buzon publico de notas sin folio; registro_id opcional, RPC publico sin busqueda y vinculacion de TI)
36. `35_notas_generalizar_solicitante.sql` (SC-003: la nota admite cualquier solicitante — maestro/padres/alumno/admin; alumno+grado obligatorios solo si el rol es 'padres'. **Cambia la firma de `crear_nota_solicitud`: drop function + notify pgrst**. Backfill: las notas del bloque 34 con `solicitante_rol` NULL rompen la constraint nueva — limpiar o rellenar antes.)
37. `36_fix_descartar_solicitud_notas.sql` (fix: descartar o cerrar una nota sin vincular fallaba con "Solicitud no encontrada"; usa la variable `FOUND`. Misma firma, sin trampa PostgREST.)
38. `37_nota_tramite_solicitado.sql` (SC-003: la nota declara el tramite que pide el cliente en columna propia. **Cambia la firma de `crear_nota_solicitud`: drop function + notify pgrst**. Backfill: notas con `tramite_solicitado` NULL rompen la constraint — limpiar o rellenar antes.)
39. `38_cerrar_nota_al_ejecutar_tramite.sql` (SC-003: al ejecutar el tramite, la nota vinculada cuyo `tramite_solicitado` coincide se cierra sola. Solo cambian los cuerpos de los RPCs, sin trampa PostgREST.)
40. `39_vincular_nota_corrobora_tramite.sql` (SC-003: al vincular, TI corrobora el tramite; `vincular_nota` gana el parametro `p_tramite`. **Cambia la firma: drop function + notify pgrst**.)
41. `40_usar_tag_apartado.sql` (CC-01 cierre: usar el TAG apartado como reposicion. `usar_tag_apartado` es nuevo — solo notify, sin drop. Prohibe cambiar procedencia a 'escuela' por "Actualizar" con un apartado vivo.)
42. `41_solicitudes_sin_instalacion.sql` (el buzon solo admite tramite 'actualizacion' | 'baja': instalar es siempre por el alta, no por solicitud. Firmas intactas, sin trampa PostgREST. **Re-aplicar antes el seed actualizado** — ver nota abajo.)
43. `42_corte_caja.sql` (corte de caja de Administracion: tabla `cortes_caja` + `pagos.corte_id`, RPCs `estado_caja`/`cortar_caja` y triggers que hacen inmutable el corte y bloquean borrar/truncar pagos ya sellados. `registrar_pago` conserva su firma; los RPC nuevos solo notify, **sin** trampa PostgREST. Rol admin/super. Ese blindaje obliga a re-seedear con `seed_tests_dev.sql` actualizado — ver nota abajo.)

> **`seed_tests_dev.sql` — banco de pruebas de QA, NO es un bloque de la migracion.**
> No lleva numero y **no** entra en el flujo normal. Es destructivo (`truncate ... cascade`
> borra registros, pagos, solicitudes, notas, estacionamientos, movimientos y aceptaciones):
> jamas ejecutar en produccion con datos reales. Se corre a mano cuando se quiere un padron
> limpio para probar. Los bloques 35, 37 y 41 agregan constraints que validan las notas ya
> existentes, asi que si se trabaja con el seed hay que **re-aplicarlo (ya actualizado) antes**
> de esos tres bloques; de lo contrario, filas de prueba viejas rompen la constraint nueva.
> Desde el bloque 42, `pagos` y `cortes_caja` traen triggers que prohiben borrar/truncar cobros
> ya sellados por un corte; el seed los desactiva de forma explicita solo durante su limpieza. Ese
> mismo blindaje hace que el seed **falle si se corre por error contra una base con cortes reales**.

> **Trampa PostgREST (recordatorio).** Los bloques que cambian la *firma* de un RPC ya
> aplicado (32 `registrar_pago`; 35/37/39 `crear_nota_solicitud`/`vincular_nota`; 33 los
> wrappers de instalar/actualizar) hacen `drop function` explicito de la firma vieja y
> `notify pgrst, 'reload schema'` al final. Sin eso PostgREST conserva la sobrecarga anterior
> y la API queda ambigua o sirviendo la firma equivocada. Los bloques que solo cambian el
> *cuerpo* (mismo `create or replace`, 36/38/40/41) no lo necesitan.

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
| `21_seed_cat_modelos.sql` | Seed | Modelos comunes por marca; las 24 marcas con modelos. Idempotente. |
| `22_publicar_aviso_v2.sql` | Contenido | Publica el aviso integral (v2 vigente); v1 placeholder queda historico. |
| `23_publicar_reglamento_v2.sql` | Contenido | Publica el reglamento oficial IAQ (22 clausulas, v2 vigente). |
| `24_pagos.sql` | Listo para revisar | Historial de pagos por registro; escritura solo via RPC registrar_pago (rol admin). |
| `25_registro_estacionamientos.sql` | Listo para revisar | Asignacion E1/E2 por registro; FK a estacionamientos.clave; la asigna TI (SC-002). |
| `26_solicitudes.sql` | Listo para revisar | Solicitudes publicas de actualizacion/baja (inertes); max 1 pendiente por tipo; resolucion ejecutada/descartada. |
| `27_rls_grants_panel.sql` | Listo para revisar | RLS/grants de las 3 tablas nuevas: solo SELECT con aal2 + rol del panel. Exige el PASO 0. |
| `28_rpc_crear_solicitud.sql` | Listo para revisar | RPC publico: folio + placas (o No. de TAG); respuesta honesta sin datos. Modelo de amenaza documentado: el folio es secuencial, no es secreto fuerte. |
| `29_rpc_panel.sql` | Listo para revisar | 6 acciones del panel como RPCs SECURITY DEFINER con guardia aal2 + rol. admin: registrar_pago. ti: el resto. |
| `30_roles_finos.sql` | Listo para revisar | Endurece registros/movimientos/aceptaciones a roles finos; exige el PASO 0. |
| `31_rpc_flujos_atomicos.sql` | Listo para aplicar | Instalación y actualización con estacionamiento en una sola transacción; cierra solicitudes atendidas solo con cambio de estacionamiento y revoca los RPC internos al cliente. |
| `32_folios_recibo_automaticos.sql` | Listo para aplicar | Folio `SATAG-AAAA-000001` generado por secuencia; un solo pago por expediente y nueva firma de `registrar_pago`. |
| `33_apartar_tag.sql` | Aplicado | CC-01: apartar TAG al instalar (procedencia propio) y procedencia editable por TI (nunca por el titular). CHECK de coherencia + indice unico del numero apartado; drop+recreate de los wrappers instalar/actualizar. |
| `34_buzon_notas_sin_folio.sql` | Aplicado | SC-003: buzon publico de notas sin folio ni placa. registro_id opcional + columnas de la nota; RPC publico crear_nota_solicitud (sin busqueda, no revela nada) y vincular_nota (rol ti). CC-06 folio+placa intacto. UI publica (`/solicitudes`) y de TI ya en produccion. |
| `35_notas_generalizar_solicitante.sql` | Aplicado | SC-003: `solicitante_rol` (maestro/padres/alumno/admin); alumno+grado obligatorios solo si el rol es 'padres'. Nueva firma de crear_nota_solicitud (drop + notify pgrst); backfill de notas del 34. |
| `36_fix_descartar_solicitud_notas.sql` | Aplicado | Fix: descartar/cerrar una nota sin vincular fallaba con "Solicitud no encontrada" (registro_id NULL legitimo); usa FOUND. Misma firma. |
| `37_nota_tramite_solicitado.sql` | Aplicado | SC-003: la nota declara el tramite pedido en columna propia. Nueva firma de crear_nota_solicitud (drop + notify pgrst); backfill de notas sin tramite. |
| `38_cerrar_nota_al_ejecutar_tramite.sql` | Aplicado | SC-003: al ejecutar el tramite, la nota vinculada que coincide se cierra sola; si TI aplica otro tramite, la cierra a mano. Solo cuerpos, sin trampa PostgREST. |
| `39_vincular_nota_corrobora_tramite.sql` | Aplicado | SC-003: al vincular, TI corrobora el tramite (`vincular_nota` gana p_tramite) y el registro cae en la cola correcta. Nueva firma (drop + notify pgrst). |
| `40_usar_tag_apartado.sql` | Aplicado | CC-01 cierre: `usar_tag_apartado` (rol ti) activa el TAG reservado como reposicion; prohibe cambiar procedencia a 'escuela' con un apartado vivo. usar_tag_apartado nuevo (solo notify). |
| `41_solicitudes_sin_instalacion.sql` | Aplicado | El buzon solo admite tramite 'actualizacion' | 'baja' (instalar es por el alta). Re-aplicar el seed actualizado antes. Firmas intactas. |
| `42_corte_caja.sql` | Aplicado | Corte de caja (admin/super): `cortes_caja` inmutable + `pagos.corte_id`; RPCs `estado_caja`/`cortar_caja`. Sella con `UPDATE ... RETURNING` (total = suma de lo sellado), advisory lock, folio `SATAG-CORTE-AAAA`. Triggers que bloquean borrar/truncar/editar pagos sellados y editar cortes. RLS solo admin/super. |
| `seed_tests_dev.sql` | Solo QA (destructivo) | Banco de pruebas: `truncate ... cascade` + ~4 casos por situacion del panel. No es migracion, no lleva numero, jamas en produccion. Re-aplicar antes de 35/37/41. |
