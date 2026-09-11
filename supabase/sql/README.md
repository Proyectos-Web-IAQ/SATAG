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
44. `43_endurecer_catalogos_documentos_storage.sql` (cierra el pendiente del bloque 30: la escritura de catalogos (05), documentos legales (09) y storage de firmas (20) exige ahora **rol** ademas de aal2 — admin/super escriben, ti solo lee firmas, consulta no las ve. Solo politicas RLS: **sin** funciones ni trampa PostgREST. La lectura publica y el insert-only de `anon` no cambian.)
45. `44_aviso_simplificado.sql` (CC-09: agrega `aviso_versiones.contenido_simplificado` y publica el texto corto aprobado en E6. Es la unica columna nueva; sin funciones, sin notify. El formulario ya lo consulta **de forma tolerante**, asi que el sitio funciona igual antes y despues de aplicarlo: al aplicarlo, el aviso corto aparece solo en el primer paso del alta.)
46. `45_vista_registros_incompletos.sql` (B2/CC-02: vista `v_registros_incompletos` con el motivo de cada faltante. `security_invoker = true`, asi que hereda la RLS del panel y no abre una segunda puerta. Solo una vista: **sin** funciones ni trampa PostgREST. El criterio completo — y que se deja fuera a proposito — vive en el encabezado del bloque.)
47. `46_validar_tipo_al_cobrar.sql` (B5/CC-05: conecta `tipo_validado` / `_por` / `_en`, que existian desde el bloque 12 sin que nada las tocara. Cobrar y validar el tipo pasan a ser el mismo acto. **Cambia la firma de `registrar_pago` (gana `p_tipo_usuario`): drop function + notify pgrst.** El tipo es OBLIGATORIO, asi que este bloque y el despliegue del panel van **juntos**: en medio, un panel viejo no puede cobrar.)
48. `47_evidencia_firma_panel.sql` (SC-008, cierra CC-12: amplia la lectura de `aceptaciones` al rol `ti` — la decision que el bloque 30 dejo abierta — y crea `v_evidencia_firma` con la porcion probatoria, sin `hash_payload`, trazos, IP ni user-agent. La URL firmada la emite el navegador con el SDK de Storage; el bucket sigue privado. Politicas + una vista: **sin** trampa PostgREST.)
49. `48_evidencia_firma_consulta.sql` (el rol `consulta` pasa a leer tambien `aceptaciones` y el bucket `firmas`, por decision de la Direccion de TI: Consulta es la pantalla de investigacion y sin la evidencia la auditoria quedaba con un hueco. Revierte la exclusion que venia del bloque 30 y respeta el principio que el bloque 27 dejo escrito — la separacion de `consulta` es que NO escribe, no que vea menos. **Costo asumido y documentado:** la RLS es por fila, no por columna, asi que quien lee `aceptaciones` alcanza tambien `hash_payload`, trazos, IP y user-agent si consulta la tabla directo. Solo politicas RLS: idempotente, sin funciones, sin notify.)

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

> **`limpiar_datos_prueba.sql` — deja el padron VACIO. Tampoco es un bloque de la migracion.**
> Es el inverso del seed: aquel llena la base de datos ficticios, este los borra todos y no pone
> nada en su lugar. Se usa antes de una prueba de campo con datos reales, para que no se mezclen
> con los del banco de QA. Corre por pasos: **1** inventario (solo lee), **2** rescate de la
> evidencia que no es del seed —hay altas hechas a mano que documentan defectos, como el folio
> `SATAG-000302` de D-01—, **3** el borrado, **4** las imagenes de firma en Storage (a mano, el
> truncate no las toca) y **5** verificacion. El paso 3 esta **blindado**: aborta si antes no se
> ejecuta `set satag.confirmo_borrado = 'SI, BORRAR TODO';` en la misma sesion, para que un
> "Run all" distraido no vacie el padron. No toca catalogos, documentos legales ni cuentas del
> personal, y reinicia los folios para que la primera alta real sea `SATAG-000001`.

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
| `34_buzon_notas_sin_folio.sql` | Aplicado | SC-003: buzon publico de notas sin folio ni placa. registro_id opcional + columnas de la nota; RPC publico crear_nota_solicitud (sin busqueda, no revela nada) y vincular_nota (rol ti). CC-06 folio+placa intacto. UI publica (`/solicitudes`) y de TI ya implementadas. |
| `35_notas_generalizar_solicitante.sql` | Aplicado | SC-003: `solicitante_rol` (maestro/padres/alumno/admin); alumno+grado obligatorios solo si el rol es 'padres'. Nueva firma de crear_nota_solicitud (drop + notify pgrst); backfill de notas del 34. |
| `36_fix_descartar_solicitud_notas.sql` | Aplicado | Fix: descartar/cerrar una nota sin vincular fallaba con "Solicitud no encontrada" (registro_id NULL legitimo); usa FOUND. Misma firma. |
| `37_nota_tramite_solicitado.sql` | Aplicado | SC-003: la nota declara el tramite pedido en columna propia. Nueva firma de crear_nota_solicitud (drop + notify pgrst); backfill de notas sin tramite. |
| `38_cerrar_nota_al_ejecutar_tramite.sql` | Aplicado | SC-003: al ejecutar el tramite, la nota vinculada que coincide se cierra sola; si TI aplica otro tramite, la cierra a mano. Solo cuerpos, sin trampa PostgREST. |
| `39_vincular_nota_corrobora_tramite.sql` | Aplicado | SC-003: al vincular, TI corrobora el tramite (`vincular_nota` gana p_tramite) y el registro cae en la cola correcta. Nueva firma (drop + notify pgrst). |
| `40_usar_tag_apartado.sql` | Aplicado | CC-01 cierre: `usar_tag_apartado` (rol ti) activa el TAG reservado como reposicion; prohibe cambiar procedencia a 'escuela' con un apartado vivo. usar_tag_apartado nuevo (solo notify). |
| `41_solicitudes_sin_instalacion.sql` | Aplicado | El buzon solo admite tramite 'actualizacion' | 'baja' (instalar es por el alta). Re-aplicar el seed actualizado antes. Firmas intactas. |
| `42_corte_caja.sql` | Aplicado | Corte de caja (admin/super): `cortes_caja` inmutable + `pagos.corte_id`; RPCs `estado_caja`/`cortar_caja`. Sella con `UPDATE ... RETURNING` (total = suma de lo sellado), advisory lock, folio `SATAG-CORTE-AAAA`. Triggers que bloquean borrar/truncar/editar pagos sellados y editar cortes. RLS solo admin/super. |
| `43_endurecer_catalogos_documentos_storage.sql` | Aplicado 28/07 | Escritura de catalogos, reglamento/aviso y bucket `firmas` exige rol (admin/super) ademas de aal2; `ti` conserva lectura de firmas, `consulta` no. Cierra el pendiente anotado en el bloque 30 y el hallazgo SC-009. Solo RLS: idempotente, sin funciones, sin notify. |
| `44_aviso_simplificado.sql` | Aplicado 28/07 | CC-09: columna `aviso_versiones.contenido_simplificado` + texto corto (LFPDPPP art. 16 fr. II) publicado en la version vigente. El front lo consulta aparte y tolera su ausencia, asi que aplicarlo no requirio redeploy. |
| `45_vista_registros_incompletos.sql` | Aplicado 29/07 | B2/CC-02: `v_registros_incompletos`, un renglon por expediente con `motivos[]`. Siete motivos en tres grupos: integridad (los RPC no pueden producirlos), faltante operativo (sin placas con TAG ya instalado) y atorados a los 7 dias (sin pago / sin instalar). Excluye `estado = 'baja'`. `security_invoker`: hereda la RLS del panel. |
| `46_validar_tipo_al_cobrar.sql` | Aplicado 29/07 | B5/CC-05: `registrar_pago` gana `p_tipo_usuario` **obligatorio** y sella `tipo_validado` / `_por` / `_en`. Si el tipo confirmado difiere del declarado, corrige el expediente y deja movimiento `cambio`. Menor de edad queda fijo en `alumno`. **Drop de la firma de 3 args + notify pgrst**; aplicar junto con el despliegue del panel. |
| `47_evidencia_firma_panel.sql` | Aplicado 29/07 | SC-008 (cierra CC-12): `aceptaciones` pasa a admin/ti/super (espejo del bucket en el bloque 43) y se crea `v_evidencia_firma` con version de reglamento/aviso, sello de tiempo y hash. Las versiones salen de `hash_payload`, no por FK: el bloque 09 solo deja leer la version vigente a ti/consulta. |
| `48_evidencia_firma_consulta.sql` | Aplicado 30/07 | `consulta` lee `aceptaciones` y el bucket `firmas`, igual que admin/ti/super. Sustituye `aceptaciones_lectura_panel` (bloque 47) y `firmas_lectura_panel` (bloque 43); NO toca `firmas_gestion_admin` ni `firmas_subida_anon`. `consulta` sigue sin escribir nada. Riesgo aceptado en el encabezado: la RLS es por fila, no por columna. |
| `49_versiones_obligatorias_y_usted.sql` | Aplicado 18/08 | D-01 servidor + D-07 base: `crear_registro` exige `p_aviso_version_id` / `p_reglamento_version_id` (registra LO QUE SE MOSTRO, ya no resuelve solo) y las 10 cadenas con tuteo de la base pasan a usted. 8 funciones, mismas firmas, sin drop. Aplicado DESPUES de publicar el cliente que manda los ids; verificado con re-barrido de `pg_proc` en cero y sondas negativas por API. |
| `50_cobrador_desde_sesion.sql` | Aplicado 25/08 | `registrar_pago` sella `cobrado_por`, el validador del tipo y el movimiento con el correo del JWT e ignora `p_cobrado_por`; sin correo en el JWT, rechaza el cobro. Misma firma que el 46 (sin drop). El panel ya muestra el usuario de la sesion como dato (c88cbca); el orden de despliegue es indistinto. |
| `51_limite_intentos_publicos.sql` | Aplicado 25/08 | Rate limiting del buzon sin servicios externos: tabla `intentos_publicos` (solo la tocan las funciones; RLS sin politicas) + 10 fallos de coincidencia por IP en 15 min en `crear_solicitud` (que ya no lanza en «no coincide»: devuelve `{recibida:false, mensaje}`) y 10 notas por IP por hora en `crear_nota_solicitud`. El cliente que entiende las dos formas ya esta publicado (0b0c913); P-11 se reejecuto tras el diagnostico del arnes. |
| `53_captura_hoja_fisica.sql` | **Aplicado** (redactado 08/09, confirmado en base 11/09) | SC-026: captura en sitio desde la hoja fisica firmada. RPC NUEVO `capturar_expediente_ti` (rol ti): expediente 'pendiente' con movimiento 'alta' de TI, estacionamientos y el TAG del inventario RESERVADO (`asignado_a`); sin pago (Administracion) ni aceptacion digital (la firma esta en la hoja). Recrea `instalar_tag_con_estacionamiento` con la MISMA firma (cuerpo del 52) para liberar la reserva si TI instala otro numero. Aplicado el 8-sep. La pantalla "Capturar hoja fisica" se RETIRO el mismo dia por decision de Gerardo (TI no captura expedientes; el alta es del titular); el RPC queda disponible sin cliente, y la parte que si opera es la liberacion de reservas en `instalar_tag_con_estacionamiento`. |
| `54_mapa_zk.sql` | **Aplicado** (redactado 08/09, confirmado en base 11/09) | SC-027: tabla `zk_tarjetas` (tarjeta -> ID de ZK, sin nombres; lectura ti/super) + RPC NUEVO `cargar_mapa_zk` (rol ti) que reemplaza el mapa con el export de ZK leido en el navegador. Con el, el padron para ZK lleva el ID que ZK ya tiene y el import actualiza en vez de rechazar; ya no se sube el export en cada sesion. Solo notify, sin drop. |
| `57_aviso_v3.sql` | **Aplicado 10/09. NO REAPLICAR** | Publica la **version 3 del aviso de privacidad** —con acentos, con la Administracion nombrada como responsable, con el plazo de conservacion (cinco anos desde que termina la finalidad), con la videovigilancia y sus dieciseis dias, y con el apartado de opciones para limitar el uso— y su texto simplificado, que apunta al integral con ruta **relativa** (`/aviso-de-privacidad/`) para que no se rompa en el dominio de respaldo. Trae **EL CANDADO** prometido en la nota de conservacion y nunca aplicado: el CHECK `aviso_vigente_exige_simplificado` impide marcar vigente una version sin su texto corto (insert y update), que es el fallo que borraria el aviso simplificado del formulario sin dar error. Apaga la vigente y enciende la v3 en ese orden (`uq_aviso_una_vigente` no admite dos), comprueba la invariante y aborta si quedara otra cosa, y **cierra con una consulta de verificacion de acentos** con los numeros exactos esperados. La v2 se queda intacta y no vigente: las aceptaciones ya firmadas apuntan a ella por FK y su hash se calculo sobre ese texto. Solo datos y una constraint: **sin** funciones, sin grants, sin trampa PostgREST, y sin redeploy del sitio. El archivo esta en UTF-8 y debe pegarse completo, de un tiron. **NO LO VUELVA A CORRER:** su insert lleva `on conflict (version) do update set contenido = excluded.contenido`, asi que reaplicarlo SOBRESCRIBE el texto de la v3 con el de este archivo y borraria cualquier correccion posterior —por ejemplo el catalogo de datos con los apellidos de la familia—. Las cinco banderas `_ok` de su verificacion seguirian dando true, porque ninguna mira ese dato: el estropicio no se veria en pantalla. |
| `59_aviso_v3_apellidos.sql` | **OBSOLETO. NO LO CORRA** (redactado y descartado el 10/09) | Se escribio para anadir los apellidos de la familia al catalogo de datos del aviso v3, el texto propio del bloque 57. Quedo sin objeto la misma tarde: se decidio que el aviso de SATAG sea el **aviso institucional** que paso Ana, textual y entero, mas un anexo con lo que SATAG agrega. Eso lo publica el bloque 60 como version 4. Aplicar el 59 ahora solo reescribiria un texto que va a ser reemplazado, y consumiria una version por nada. Se conserva en la carpeta como testimonio del camino que se descarto. |
| `60_aviso_v4_institucional.sql` | **Aplicado 10/09** | Publica la **version 4** del aviso: el aviso general del Instituto (el .docx que paso Ana, fechado 01-sep-2026) **textual y completo**, mas un anexo «Tratamiento especifico para SATAG» con lo que el general no cubre — vehiculo, datos del TAG, apellidos de la familia, firma trazada con su evidencia y hash, encargados en la nube, cobro. El anexo ANCLA lo que el general ya cubre (responsable, cinco anos, correo, ARCO, transferencias) en vez de redeclararlo. Guardia contra pisar una v4 ajena ya firmada; verificacion por igualdad `bytes_de_mas = bytes_esperados` en vez de una cuenta de caracteres (la de una cuenta fija se movio con el editor en el bloque 57 y asusto sin motivo). La v2 y la v3 quedan intactas y no vigentes. **Tenia dos defectos, corregidos por el bloque 61: no reproducia la videovigilancia del estacionamiento y contradecia sus propias transferencias.** |
| `61_aviso_v5_videovigilancia_transferencias.sql` | **Aplicado** (redactado 10/09, confirmado vigente en base 11/09) | Corrige, publicando **version 5**, dos defectos que una revision adversarial encontro en la v4 minutos despues de aplicarse: (1) el anexo daba la videovigilancia del estacionamiento por cubierta mirando solo el plazo, y se perdio que el reglamento (paso 3) SI anuncia la camara mientras el aviso (paso 2) ya no — los dos quedan sellados en el mismo hash; se repone un apartado que ancla el plazo y agrega el circuito de 24h, que las placas son dato personal, y quien las consulta. (2) el anexo importaba en bloque las transferencias del general —que autorizan mandar datos a "instituciones de educacion superior... para que ofrezcan sus planes"— y parrafos despues prometia que SATAG no hace prospeccion: contradiccion dentro del mismo documento sellado. Se acota la frase y se agrega un apartado que limita las transferencias de SATAG a autoridad competente y auditores. **No toca una coma del texto institucional.** Misma guardia y misma verificacion por igualdad que el 60. La v4 queda intacta y no vigente. |
`, uno por linea, con la codificacion perfecta). |
| `limpiar_padron_piloto.sql` | Solo piloto (destructivo) | Version de `limpiar_datos_prueba.sql` que CONSERVA `inventario_tags` (libera reservas y borra con DELETE: un `truncate registros cascade` arrastraria el inventario). Mismo candado `set satag.confirmo_borrado`. |
| `52_inventario_tags.sql` | **Aplicado** (redactado 08/09, confirmado en base 11/09) | SC-025: inventario de TAGs de la escuela (alta anticipada). Tabla `inventario_tags` (disponible = `asignado_a` null; lectura RLS para ti/super) + RPCs NUEVOS `alta_inventario_tags` (lote todo-o-nada) y `retirar_tag_inventario` (solo disponibles), y helper interno `inv_reclamar_tag`. Recrea con la MISMA firma (sin drop) `instalar_tag_con_estacionamiento`, `usar_tag_apartado` y `actualizar_registro_con_estacionamiento` para que reclamen del inventario el numero instalado/apartado. Aplicar ANTES de publicar el cliente del inventario. |
| `55_apellidos_familia.sql` | Aplicado 10/09 — **su PARTE B quedo REVOCADA por el bloque 58** | Junta 9-sep: control de externos. Columna `registros.apellidos_familia` (PII) para cotejar contra la lista de inscritos antes de instalar. **Iba en DOS PARTES a proposito.** Parte A (**vigente**; aplicable cuando sea, con el sitio en vivo): la columna nullable y `crear_registro` de 26 a 27 parametros — `p_apellidos_familia text default null` AL FINAL, asi el cliente publicado sigue dando de alta igual. **Cambia la firma: drop de los 26 tipos + create + revoke/grant otra vez + notify pgrst.** Parte B (**REVOCADA por el bloque 58 — no volver a correrla**): el CHECK `reg_apellidos_familia_requeridos`, que volvia obligatorio el campo para tipo `padres` con `not valid` "para no tocar los expedientes que existan". Ese razonamiento era FALSO: `not valid` solo se salta la revision retroactiva UNA vez, y despues el CHECK se evalua en CADA update, sobre la version nueva y completa de la fila. Como la columna solo la escribe `crear_registro` y ninguna pantalla del panel la captura, todo expediente de `padres` con el campo vacio quedaba CONGELADO (no se podia cobrar, ni instalar, ni actualizar, ni dar de baja). El bloque 58 la quita y muda la exigencia al alta; si algun dia se reconstruye la base corriendo la carpeta en orden, **la parte B se salta** (la parte A sigue siendo necesaria: de ahi salen la columna y el parametro 27). Sin backfill: el padron se vacia antes del lunes. La evidencia de firma no cambia (payload `satag.acceptance.v1` intacto). |
| `58_apellidos_sin_congelar.sql` | **Aplicado** (redactado 10/09, confirmado en base 11/09) | Deshace el congelamiento que dejo la parte B del 55, **sin relajar el control**. (1) `drop constraint if exists reg_apellidos_familia_requeridos`: un CHECK de tabla vigila TODA escritura de la fila, y esa columna no la escribe ningun update —solo `crear_registro`—, asi que exigirla ahi bloqueaba el expediente entero. Danos concretos: cobrar un `maestro` corregido a `padres` en la caja (el caso de la junta del 9-sep) revertia la transaccion completa —sin pago, sin folio de recibo, sin correccion, y quemando un numero de la secuencia del recibo, que no se revierte—, `capturar_expediente_ti` (bloque 53) no podia crear expedientes de padres y `seed_tests_dev.sql` fallaba DESPUES de su `truncate ... cascade`. (2) La exigencia se muda AL ALTA, dentro de `crear_registro`, con un `raise exception` en espanol y de usted: es el unico sitio que escribe la columna, es donde Administracion lo pidio y es donde el cliente publicado ya valida el campo. **MISMA firma de 27 parametros: `create or replace` en sitio, sin drop, sin regrant y sin notify** (los grants del 55 se conservan); reproduce integro el cuerpo vigente del 55. (3) Cierra con una consulta de SOLO LECTURA que lista por folio los expedientes de padres sin apellidos: no los repara, porque rellenar a ciegas el campo con el que se le niega la instalacion a un externo seria peor. Capturar los apellidos desde el panel queda para el **lote 2** (tocaria las firmas de `actualizar_registro_con_estacionamiento` y `actualizar_registro`: drop + regrant + notify + deploy, la trampa cara, y no antes del lunes). Repetible e idempotente: si ya se corrio el parche `supabase/manual/2026-09-10_URGENTE_soltar_apellidos.sql`, el paso 1 no hace nada. |
| `62_placas_unicas_y_normalizadas.sql` | **Aplicado 11/09** | L2-05 (mitad que faltaba): `crear_registro` (misma firma de 27 parametros del 58) normaliza placas con `upper()` UNA SOLA VEZ (variable `v_placas`, usada en el insert y en el `hash_payload`) y avisa antes de gastar folio si ya estan en otro expediente vivo; `actualizar_registro` (misma firma de 9 parametros del 49) ya normalizaba, se le agrega el mismo aviso con el patron que ya usaba el numero de TAG (folio del duplicado). Indice unico parcial `uq_registros_placas_vigentes on (upper(placas)) where placas is not null and estado <> 'baja'` como garantia real contra la carrera; ambas funciones envuelven su escritura en `exception when unique_violation` como red de seguridad. Sin drop, sin regrant, sin notify. Verificado: sin duplicados previos, indice creado, sin trampa PostgREST (1 forma cada funcion), prueba transaccional con rollback confirma rechazo de duplicado y aceptacion de placa repetida en expediente dado de baja. |
| `seed_tests_dev.sql` (evidencia de firma) | Solo QA (destructivo) | El paso 3c siembra `aceptaciones` para todo el banco (menos el 225, vacio a proposito) con hash real y verificable. **No siembra la imagen:** SQL no escribe bytes en Storage. Para que el PNG se vea, subir a mano UNA vez `supabase/qa-firma-demo.png` (esta en el repo) al bucket `firmas`, sin renombrarlo. Lleva "FIRMA DE PRUEBA" impreso sobre el trazo para que no pueda confundirse con evidencia real. El camino completo (PNG real + su SHA-256) solo lo produce un alta por `/registro/`. |
| `seed_tests_dev.sql` | Solo QA (destructivo) | Banco de pruebas: `truncate ... cascade` + ~4 casos por situacion del panel, mas los folios `221-226` con un expediente incompleto por motivo (CC-02). No es migracion, no lleva numero, jamas contra datos reales. Re-aplicar antes de 35/37/41 y para probar el bloque 45. |
