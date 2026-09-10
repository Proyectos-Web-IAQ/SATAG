# Dónde vamos · jueves 10 de septiembre, 12:35

Nota de retomada tras reiniciar el equipo. Bórrela cuando ya no sirva.

## Lo que está hecho hoy

**El dominio institucional está en vivo.** SATAG se sirve en https://satag.asuncionqro.edu.mx con certificado válido y despliegue automático desde `main`. Verificado: portada, registro, panel, buzón, aviso y presentación responden. Vercel sigue arriba como rollback hasta que el lunes corra estable.

**El documento legal está corregido y entregado.** Se subió a Drive. Se le arreglaron tres citas antes de enviarlo: se apoyaba en un reglamento derogado en marzo de 2025, citaba artículos de la ley de la niñez que regulan medios de comunicación, y presentaba la constancia por lote como una modalidad que la norma no ofrece.

**El reglamento versión 3 está redactado completo**, en texto corrido y listo para enviar a Arturo, con las dos cláusulas que dictó Miguel. Tope de envío: viernes 11 a las 12:00.

**El tablero pasó de 77 a 90 por ciento.** Siete tareas cerradas, la lista de atrasadas bajó de siete a una.

**Todo está commiteado** hasta `480020e` y el árbol está limpio.

## Lo que falta hoy

En orden. Es lo acordado tras recortar el alcance, porque lo completo no cabía en día y medio.

1. **Aviso de privacidad versión 3, bloque 57.** Es lo único con consecuencia legal: hoy las familias aceptan un texto sin un solo acento, sin responsable nombrado y sin plazo. Datos confirmados del aviso institucional: plazo de conservación cinco años desde que termina la finalidad, responsable Administración, correo aviso.privacidad@asuncionqro.edu.mx, videovigilancia dieciséis días. El bloque debe traer el candado que impide publicar una versión vigente sin su texto simplificado, prometido y nunca aplicado. Guardar el archivo en UTF-8 y verificar los acentos con una consulta. La dirección pública va relativa, sin dominio.
2. **Apellidos de la familia, bloque 55 y cliente.** Es el control que pidió Administración para no instalar TAGs a externos. Columna obligatoria para tipo padres; el procedimiento del alta pasa de 26 a 27 parámetros, con borrado explícito de la firma vieja. Con el padrón vacío se puede exigir sin backfill.
3. **Catálogo, bloque 56.** Ya escrito y listo, solo falta aplicarlo.
4. **Limpieza del padrón.** A medias. El respaldo ya se corrió. Falta la limpieza con la corrección de las comprobaciones diferidas, retirar los TAGs instalados del inventario, y borrar las firmas del almacenamiento desde el panel usando la lista del respaldo.
5. **Cuenta de Zairet**, con contraseña temporal desde el panel y activación acompañada.

## Lo que se movió al lote 2, y por qué

La casilla de un solo apellido, porque hoy el materno ya es opcional y nadie se queda sin registrarse. Los seis textos sin acentos de las pantallas de acceso, porque los ve el personal, no las familias. Y plegar el aviso duplicado, que es comodidad y no corrección.

## Dos cosas que le van a preguntar

**El padrón tenía 19 expedientes, no 14.** Los cinco de más son Miguel, el CP Vicente, Zairet y Arturo, que se dieron de alta en vivo durante la presentación del 9, más uno de prueba del 10. Hay que avisarles que vuelvan a registrarse el lunes. Para el acta es un dato bueno: la lámina de «Pruébelo ahora» funcionó.

**El aviso de privacidad NO está duplicado.** El del paso 1 es el simplificado, que la ley exige antes de capturar datos; el del paso 3 es el integral, que se acepta y queda sellado. No se puede quitar ninguno. Lo que sí se hará es que el primero diga que es un resumen y que el completo llega en el paso 3.

## Lo que corre por su cuenta

Los tres scripts de limpieza del tablero de CroNoma, en `supabase/manual/2026-09-10_cronoma_cierre_*.sql`. Cierran las siete solicitudes de cambio que están implementadas desde julio y siguen figurando abiertas. Y el de verificación del buzón, que cierra un caso de prueba desactualizado.
