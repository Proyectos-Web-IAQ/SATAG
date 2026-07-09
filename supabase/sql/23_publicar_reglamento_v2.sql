-- =====================================================================
-- 23_publicar_reglamento_v2.sql
-- Publica el Reglamento de acceso vehicular IAQ (22 clausulas) como v2 vigente.
-- El placeholder v1 queda como historico (no vigente).
--
-- Fuente: texto oficial provisto por el IAQ. Se corrigio SOLO ortografia obvia
-- (typos/OCR), sin cambiar el sentido ni la redaccion.
-- Formato: una clausula por linea, SIN numero al inicio (la UI las numera con <ol>).
--
-- Idempotente: desactiva cualquier otra vigente y hace upsert de la v2.
-- =====================================================================

update reglamento_versiones set vigente = false where version <> 2;

insert into reglamento_versiones (version, contenido, vigente)
values (
    2,
    $regl$El uso del estacionamiento no tendrá ningún costo siempre y cuando sea personal contratado por el Instituto Asunción de Querétaro AC (IAQ) y padres de familia del mismo, el cual solo le da derecho al uso del espacio sin ninguna responsabilidad para el IAQ.
Se colocará una calcomanía numerada al parabrisas de su vehículo (TAG) (para control de acceso) como empleado (previa solicitud) se le asignará una TAG, y por familia (previa solicitud) en ambos casos tendrán costo, así como las reposiciones o adicionales dicho costo será notificado una vez que solicite el nuevo TAG. Es importante señalar que cualquier reposición de TAG o tarjeta deja inactivo el anterior. El contar con un TAG o calcomanía de acceso no garantiza la disponibilidad de espacio, ya que está sujeto a las capacidades de ocupación de nuestros estacionamientos.
Ningún usuario podrá tener acceso al estacionamiento sin la calcomanía o TAG en su vehículo.
No respondemos por daños parciales o totales a su vehículo, por el robo parcial o total del mismo o por los objetos dejados en el interior del vehículo.
La función del Portero solo se limita a abrir y cerrar el estacionamiento en los horarios convenidos publicados en el interior del mismo estacionamiento; por favor cierre su vehículo y llévese sus llaves.
El Portero no está autorizado a mover su vehículo, por tal motivo no le proporcione las llaves del mismo.
En los casos de eventos generales del IAQ el estacionamiento se compartirá libremente con los Padres de Familia del IAQ por lo que estará sujeto a disponibilidad de espacios.
El horario de estacionamiento será de 6:30 hrs a 17:00 hrs, en caso de no recoger su vehículo en el transcurso de 3 días naturales, se turnará a la autoridad correspondiente para la consignación del mismo.
No respondemos por siniestros ocasionados por derrumbes, terremotos, inundaciones y cualquier otro siniestro natural o siniestros que pongan en riesgo la integridad de su vehículo.
Todo el daño imputable al IAQ se realizará en nuestros talleres.
Deberá de respetar los espacios asignados para el vehículo sin invadir otro cajón, cuidando no golpear con las puertas o con su automóvil los vehículos contiguos.
La velocidad máxima de circulación dentro del estacionamiento es de 10 Km/h, debiendo respetar los señalamientos de circulación, cajones de minusválidos, sentido de la circulación interna, rampas, áreas de tránsito peatonal y cualquier otra existente.
Como peatón deberá circular por los accesos y salidas peatonales; en ningún caso podrá invadir las áreas de tránsito vehicular para evitar un accidente.
En caso de acudir con menores, siempre deberán estar acompañados por un adulto para su supervisión y cuidado.
Una vez estacionado el vehículo no podrá permanecer ningún pasajero en el mismo por más de media hora y en ningún caso deberá de permanecer un menor sin la supervisión de un adulto.
No se permitirá el acceso con mascotas en los vehículos.
El estacionamiento cuenta con un circuito cerrado de video vigilancia, el cual está en operación las 24 horas.
Para el acceso a los estacionamientos deberá esperar a que la pluma baje, acercarse con su vehículo y permitir que el TAG les dé el acceso; cualquier daño ocasionado al vehículo o propiedad del IAQ por no respetar esta indicación no será responsabilidad del IAQ y en su caso pagará por los daños ocasionados a la pluma y su mecanismo.
Los lugares asignados como exclusivos de padres de familia tienen un tiempo de uso máximo de 30 minutos.
Para los alumnos de prepa que requieran TAG únicamente podrán acceder al estacionamiento 1, dentro del horario escolar y en caso de no respetarse puede retirarse el acceso al estacionamiento.
Cualquier situación no prevista en el presente documento se someterá a revisión por parte del IAQ.
El instituto se reserva el derecho de modificar las políticas de este reglamento; en caso de que se produjeran cambios serán aplicadas las vigentes.$regl$,
    true
)
on conflict (version) do update
    set contenido = excluded.contenido,
        vigente   = true;

-- Verificacion:
-- select version, vigente, array_length(string_to_array(contenido, E'\n'), 1) as clausulas
-- from reglamento_versiones order by version;   -- v2 vigente, 22 clausulas
