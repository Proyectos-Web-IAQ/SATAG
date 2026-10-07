-- =====================================================================
-- BLOQUE 89 — Los casos del estacionamiento, con su evidencia.
--
-- SC-031 · 06/10/2026
--
-- POR QUE
--   Gerardo, 6-oct: «quiero que SATAG sea el centro de toda la administracion
--   del estacionamiento». Lo que pasa con una persona o un TAG —entro en
--   sentido contrario, despego su TAG, tiene un permiso especial, hay que
--   preguntarle algo cuando llegue, lleva dos TAGs en el mismo coche— hoy se
--   anota «a lo wey» en las observaciones de la hoja de calculo o del
--   expediente, sin dueno, sin estado y sin evidencia. Ademas, cada caso tiene
--   que documentar POR QUE SATAG dice lo que dice.
--
--   El bloque 87 solo guardaba el seguimiento de los casos que la pantalla
--   CALCULA (clave tipo:tarjeta). Aqui el caso EXISTE por si mismo: se abre a
--   mano o lo abre una regla, esta ligado a un expediente y/o a un TAG, tiene
--   estado, historial y evidencia. Lo que ya tenia seguimiento en el 87 se
--   migra (seccion 5) y las tablas del 87 se conservan como respaldo.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: panel_exigir_rol (29), registros, y el 87 aplicado.
--   1. `casos_tipos`: el catalogo (titulo, categoria, que hacer, si lo abre
--      una regla). Agregar un tipo es un insert, no un cambio de cliente.
--   2. `casos` y `casos_notas` (el historial).
--   3. RLS: leen ti, contador, admin y super con MFA; escribir, solo por RPC.
--   4. RPC `abrir_caso` y `anotar_caso` (roles ti, contador y admin; super
--      pasa siempre). Nombres NUEVOS a proposito: `seguir_caso` (87) sigue
--      viva y reusar su nombre con otra firma dejaria dos sobrecargas.
--   5. Migracion del seguimiento del 87. Se puede repetir: no duplica.
--   6. Verificacion de solo lectura: ocho filas con ok = true.
--
-- Datos personales: el caso guarda numero de TAG y lo que TI escribe; el
-- nombre vive en el expediente. Misma RLS que la bitacora y el padron de ZK.
--
-- Este bloque solo AGREGA: va ANTES del deploy del cliente que lo usa.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regprocedure('public.panel_exigir_rol(text[])') is null then
        raise exception 'Falta panel_exigir_rol: aplique antes el bloque 29. No se aplico nada.';
    end if;
    if to_regclass('public.registros') is null then
        raise exception 'Falta la tabla registros. No se aplico nada.';
    end if;
    if to_regclass('public.casos_seguimiento') is null then
        raise exception 'Falta el bloque 87 (casos_seguimiento): apliquelo antes. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. EL CATALOGO DE TIPOS
-- ---------------------------------------------------------------------
create table if not exists casos_tipos (
    tipo        text primary key,
    titulo      text not null,
    categoria   text not null,
    que_hacer   text not null default '',
    automatico  boolean not null default false,
    orden       int not null default 100,
    constraint casos_tipos_formato    check (tipo ~ '^[a-z][a-z-]*$'),
    constraint casos_tipos_categoria  check (categoria in ('conducta', 'credencial', 'acceso', 'datos', 'uso'))
);
comment on table casos_tipos is 'Catalogo de tipos de caso (bloque 89). Agregar un tipo es un insert; el cliente lo lee de aqui.';

insert into casos_tipos (tipo, titulo, categoria, que_hacer, automatico, orden) values
    -- Se registran a mano (TI, contador o Administracion).
    ('conducta', 'Conducta en el estacionamiento', 'conducta',
     'Algo que alguien vio: entrar en sentido contrario, estacionarse donde no debe, exceso de velocidad. Anotar que paso, cuando y quien lo vio; cerrar cuando se haya hablado con la persona.', false, 10),
    ('mal-uso-tag', 'Mal uso del TAG', 'conducta',
     'El TAG se despego, se presto o se uso en otro coche. Si TI lo dio de baja, anotarlo aqui; si se le da otro, registrarlo en este mismo caso.', false, 20),
    ('excepcion-acceso', 'Excepcion de acceso', 'acceso',
     'Una persona con un permiso que no le da su departamento (por ejemplo, abre los dos estacionamientos pero debe usar uno). Anotar la regla acordada y darle seguimiento con su uso de la pluma.', false, 30),
    ('preguntar', 'Preguntar al presentarse', 'datos',
     'Hay un dato que solo la persona puede confirmar (parentesco, nombre, vehiculo). Cuando se presente, preguntarle y cerrar el caso con la respuesta.', false, 40),
    ('reposicion-tag', 'Reposicion de TAG', 'credencial',
     'La persona necesita un TAG nuevo (danado, perdido o dado de baja). Cerrar cuando el nuevo este instalado y su expediente actualizado.', false, 50),
    ('dos-tags-mismo-coche', 'Dos TAGs en el mismo coche', 'credencial',
     'La pluma lee dos TAGs juntos, a pocos segundos, en dias distintos: van en el mismo parabrisas. Decidir cual se queda y documentar el otro.', true, 60),
    ('tag-sin-uso', 'TAG sin uso de una persona activa', 'credencial',
     'La persona usa otro TAG y este sigue con derecho sin abrir la pluma. Se documenta; no se le quitan niveles sin decision.', true, 70),
    ('credencial-sin-nombre', 'Credencial sin nombre', 'credencial',
     'Abre la pluma y en ZK no tiene nombre. Si viaja con alguien, probablemente es un segundo TAG de esa persona; si no, preguntar a quien la traiga.', true, 80),
    ('exempleado-tag-vivo', 'Exempleado con TAG vivo', 'acceso',
     'GES lo tiene de baja como personal y su TAG sigue con derecho. Si tenia el TAG por su trabajo y no es tutor vigente, pasarlo a BAJAS en ZK.', false, 90),
    ('departamento-distinto', 'Departamento de ZK distinto al que le toca', 'acceso',
     'Lo que dice GES (tutor, puesto) no corresponde con su departamento en ZK. Moverlo en ZK; nada sale de BAJAS sin preguntarle a TI por que esta ahi.', false, 100),
    -- Los que ya calculaba la pestana Casos (bloque 87). Mismo titulo.
    ('rechazo-diario', 'La pluma le niega el paso', 'acceso',
     'Tiene expediente vivo y la pluma lo rechaza en dias distintos. Decidir si se le da ese estacionamiento en ZK o se le avisa que use el suyo.', true, 110),
    ('vivo-en-bajas', 'Expediente vivo que en ZK esta en BAJAS', 'acceso',
     'SATAG lo tiene activo y ZK lo dio de baja. Confirmar cual de los dos tiene razon y corregir el otro.', true, 120),
    ('baja-que-abre', 'Dado de baja en SATAG y su TAG sigue abriendo', 'acceso',
     'El expediente esta de baja pero la pluma le abre. Quitarle el acceso en ZK o reactivar el expediente.', true, 130),
    ('tag-anterior-abre', 'Un TAG que ya se cambio sigue abriendo', 'credencial',
     'Es el TAG anterior de un expediente. Si ya no debe abrir, darlo de baja en ZK.', true, 140),
    ('abre-sin-expediente', 'Abre la pluma y no tiene expediente', 'datos',
     'Esta en ZK pero no entro solo a SATAG (BAJAS, STOCK o sin nombre). Revisar en ZK de quien es.', true, 150),
    ('sin-padron', 'Credencial que no esta en ningun padron', 'credencial',
     'Ni SATAG ni ZK saben de quien es. Si se averigua, registrarla en el expediente de su dueno.', true, 160),
    ('tipo-distinto', 'SATAG y ZK no coinciden en el tipo', 'datos',
     'El expediente dice una cosa (padre, docente, administrativo...) y el departamento de ZK otra. Corregir donde este mal.', true, 170),
    ('sin-uso', 'Expediente vivo que no abre la pluma', 'uso',
     'Solo son candidatos a baja: confirmar con la persona o con Administracion antes de dar de baja.', true, 180),
    ('otro', 'Otro', 'datos', 'Lo que no encaje en otro tipo. Describirlo bien en el detalle.', false, 999)
on conflict (tipo) do nothing;


-- ---------------------------------------------------------------------
-- 2. LOS CASOS Y SU HISTORIAL
-- ---------------------------------------------------------------------
create sequence if not exists casos_numero_seq;

create table if not exists casos (
    id                        uuid primary key default gen_random_uuid(),
    numero                    bigint not null unique default nextval('casos_numero_seq'),
    tipo                      text not null references casos_tipos (tipo),
    registro_id               uuid references registros (id) on delete restrict,
    tarjeta                   text,
    titulo                    text not null,
    detalle                   text not null default '',
    evidencia                 jsonb not null default '{}'::jsonb,
    estado                    text not null default 'abierto',
    origen                    text not null default 'manual',
    regla                     text,
    clave                     text unique,
    preguntar_al_presentarse  boolean not null default false,
    creado_por                text not null,
    creado_en                 timestamptz not null default now(),
    actualizado_en            timestamptz not null default now(),
    cerrado_por               text,
    cerrado_en                timestamptz,
    cierre_nota               text,
    constraint casos_ligado        check (registro_id is not null or tarjeta is not null),
    constraint casos_tarjeta       check (tarjeta is null or tarjeta ~ '^[0-9]{4,12}$'),
    constraint casos_titulo        check (char_length(btrim(titulo)) between 3 and 200),
    constraint casos_detalle       check (char_length(detalle) <= 4000),
    constraint casos_estado        check (estado in ('abierto', 'seguimiento', 'resuelto', 'descartado')),
    constraint casos_origen        check (origen in ('manual', 'regla', 'migracion')),
    constraint casos_cierre        check ((estado in ('resuelto', 'descartado')) = (cierre_nota is not null and cerrado_en is not null)),
    constraint casos_evidencia_obj check (jsonb_typeof(evidencia) = 'object')
);
alter sequence casos_numero_seq owned by casos.numero;

create index if not exists ix_casos_registro on casos (registro_id) where registro_id is not null;
create index if not exists ix_casos_tarjeta  on casos (tarjeta) where tarjeta is not null;
create index if not exists ix_casos_estado   on casos (estado, tipo);

comment on table casos is 'Casos del estacionamiento (bloque 89): ligados a un expediente y/o un TAG, con estado, evidencia e historial (casos_notas).';
comment on column casos.evidencia is 'Lo que sostiene el caso: lecturas de la pluma, placas, lo que dice cada fuente. La llena la regla o quien lo registra.';
comment on column casos.clave is 'Solo para casos de regla o migrados: tipo:tarjeta[:lote]. Evita abrir dos veces el mismo caso.';

create table if not exists casos_notas (
    id              bigint generated always as identity primary key,
    caso_id         uuid not null references casos (id) on delete cascade,
    clase           text not null,
    estado_antes    text,
    estado_despues  text,
    nota            text not null default '',
    hecho_por       text not null,
    hecho_en        timestamptz not null default now(),
    constraint casos_notas_clase check (clase in ('apertura', 'nota', 'estado')),
    constraint casos_notas_largo check (char_length(nota) <= 4000)
);
create index if not exists ix_casos_notas_caso on casos_notas (caso_id, hecho_en);
comment on table casos_notas is 'Historial de cada caso (bloque 89): apertura, notas de seguimiento y cambios de estado, con quien y cuando.';


-- ---------------------------------------------------------------------
-- 3. RLS: leen ti, contador, admin y super con MFA; nadie escribe directo
-- ---------------------------------------------------------------------
alter table casos_tipos enable row level security;
alter table casos       enable row level security;
alter table casos_notas enable row level security;

drop policy if exists casos_tipos_lectura on casos_tipos;
create policy casos_tipos_lectura on casos_tipos for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));

drop policy if exists casos_lectura on casos;
create policy casos_lectura on casos for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));

drop policy if exists casos_notas_lectura on casos_notas;
create policy casos_notas_lectura on casos_notas for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));

revoke all on table casos_tipos, casos, casos_notas from anon, public;
revoke insert, update, delete, truncate, references, trigger on table casos_tipos, casos, casos_notas from authenticated;
grant  select on table casos_tipos, casos, casos_notas to authenticated;
revoke all on sequence casos_numero_seq from anon, public, authenticated;


-- ---------------------------------------------------------------------
-- 4. LOS RPC
-- ---------------------------------------------------------------------
-- Abrir un caso. Con `p_clave` (casos de regla o carga) no duplica: si ya
-- existe un caso con esa clave, lo devuelve sin tocarlo.
create or replace function abrir_caso(
    p_tipo        text,
    p_titulo      text,
    p_detalle     text    default '',
    p_registro_id uuid    default null,
    p_tarjeta     text    default null,
    p_evidencia   jsonb   default '{}'::jsonb,
    p_preguntar   boolean default false,
    p_clave       text    default null,
    p_origen      text    default 'manual',
    p_regla       text    default null,
    p_hecho_por   text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $abrir$
declare
    v_quien   text;
    v_tarjeta text := nullif(btrim(coalesce(p_tarjeta, '')), '');
    v_clave   text := nullif(btrim(coalesce(p_clave, '')), '');
    v_origen  text := coalesce(nullif(btrim(coalesce(p_origen, '')), ''), 'manual');
    v_id      uuid;
    v_numero  bigint;
begin
    perform panel_exigir_rol(array['ti', 'contador', 'admin']);

    if not exists (select 1 from casos_tipos where tipo = p_tipo) then
        raise exception 'El tipo de caso «%» no existe. Elija uno de la lista.', p_tipo;
    end if;
    if char_length(btrim(coalesce(p_titulo, ''))) < 3 then
        raise exception 'Escriba en pocas palabras que paso.';
    end if;
    if char_length(coalesce(p_detalle, '')) > 4000 then
        raise exception 'El detalle es demasiado largo: use menos de 4,000 caracteres.';
    end if;
    if v_origen not in ('manual', 'regla', 'migracion') then
        raise exception 'El origen del caso no es valido.';
    end if;
    if p_evidencia is not null and jsonb_typeof(p_evidencia) <> 'object' then
        raise exception 'La evidencia del caso no tiene el formato esperado.';
    end if;
    if p_registro_id is not null and not exists (select 1 from registros where id = p_registro_id) then
        raise exception 'El expediente del caso no existe. Vuelva a abrir la ficha y reintente.';
    end if;
    if v_tarjeta is not null and v_tarjeta !~ '^[0-9]{4,12}$' then
        raise exception 'El numero de TAG solo lleva digitos.';
    end if;
    -- Ligado al expediente sin TAG: se toma el TAG vigente del expediente.
    if v_tarjeta is null and p_registro_id is not null then
        select nullif(btrim(no_dispositivo), '') into v_tarjeta from registros where id = p_registro_id;
    end if;
    if p_registro_id is null and v_tarjeta is null then
        raise exception 'El caso tiene que estar ligado a un expediente o a un TAG.';
    end if;

    if v_clave is not null then
        select id, numero into v_id, v_numero from casos where clave = v_clave;
        if found then
            return jsonb_build_object('id', v_id, 'numero', v_numero, 'yaExistia', true);
        end if;
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    insert into casos (tipo, registro_id, tarjeta, titulo, detalle, evidencia, preguntar_al_presentarse,
                       origen, regla, clave, creado_por)
    values (p_tipo, p_registro_id, v_tarjeta, btrim(p_titulo), coalesce(p_detalle, ''),
            coalesce(p_evidencia, '{}'::jsonb), coalesce(p_preguntar, false),
            v_origen, nullif(btrim(coalesce(p_regla, '')), ''), v_clave, v_quien)
    returning id, numero into v_id, v_numero;

    insert into casos_notas (caso_id, clase, estado_despues, nota, hecho_por)
    values (v_id, 'apertura', 'abierto', btrim(p_titulo), v_quien);

    return jsonb_build_object('id', v_id, 'numero', v_numero, 'yaExistia', false);
end;
$abrir$;

-- Dar seguimiento: una nota, un cambio de estado, o los dos. Cerrar
-- (resuelto o descartado) exige nota; reabrir limpia el cierre.
create or replace function anotar_caso(
    p_caso      uuid,
    p_nota      text default '',
    p_estado    text default null,
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $anotar$
declare
    v_quien  text;
    v_nota   text := btrim(coalesce(p_nota, ''));
    v_nuevo  text := nullif(btrim(coalesce(p_estado, '')), '');
    v_antes  text;
    v_cierra boolean;
begin
    perform panel_exigir_rol(array['ti', 'contador', 'admin']);

    select estado into v_antes from casos where id = p_caso for update;
    if not found then
        raise exception 'El caso no existe. Vuelva a abrir la pantalla y reintente.';
    end if;
    if v_nuevo is not null and v_nuevo not in ('abierto', 'seguimiento', 'resuelto', 'descartado') then
        raise exception 'El estado tiene que ser abierto, en seguimiento, resuelto o descartado.';
    end if;
    if v_nuevo = v_antes then
        v_nuevo := null;
    end if;
    if v_nuevo is null and v_nota = '' then
        raise exception 'Escriba la nota de seguimiento.';
    end if;
    if char_length(v_nota) > 4000 then
        raise exception 'La nota es demasiado larga: use menos de 4,000 caracteres.';
    end if;
    v_cierra := v_nuevo in ('resuelto', 'descartado');
    if v_cierra and v_nota = '' then
        raise exception 'Para cerrar el caso, escriba en la nota que se hizo o por que se descarta.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    if v_nuevo is not null then
        update casos
           set estado = v_nuevo,
               actualizado_en = now(),
               cerrado_por = case when v_cierra then v_quien end,
               cerrado_en  = case when v_cierra then now() end,
               cierre_nota = case when v_cierra then v_nota end
         where id = p_caso;
    else
        update casos set actualizado_en = now() where id = p_caso;
    end if;

    insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
    values (p_caso, case when v_nuevo is null then 'nota' else 'estado' end,
            v_antes, coalesce(v_nuevo, v_antes), v_nota, v_quien);

    return jsonb_build_object('id', p_caso, 'estado', coalesce(v_nuevo, v_antes), 'hechoPor', v_quien);
end;
$anotar$;

revoke all     on function abrir_caso(text, text, text, uuid, text, jsonb, boolean, text, text, text, text) from public, anon;
grant  execute on function abrir_caso(text, text, text, uuid, text, jsonb, boolean, text, text, text, text) to authenticated;
revoke all     on function anotar_caso(uuid, text, text, text) from public, anon;
grant  execute on function anotar_caso(uuid, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5. MIGRACION DEL SEGUIMIENTO DEL 87 (se puede repetir: no duplica)
-- ---------------------------------------------------------------------
-- pendiente -> abierto, revision -> seguimiento, resuelto -> resuelto. La
-- clave del 87 se conserva, asi el caso calculado y el migrado son el mismo.
insert into casos (tipo, tarjeta, titulo, detalle, estado, origen, clave, creado_por, creado_en,
                   actualizado_en, cerrado_por, cerrado_en, cierre_nota)
select split_part(s.clave, ':', 1),
       split_part(s.clave, ':', 2),
       t.titulo || coalesce(' (' || nullif(split_part(s.clave, ':', 3), '') || ')', ''),
       s.nota,
       case s.estado when 'pendiente' then 'abierto' when 'revision' then 'seguimiento' else 'resuelto' end,
       'migracion',
       s.clave,
       s.actualizado_por,
       coalesce((select min(h.hecho_en) from casos_seguimiento_historial h where h.clave = s.clave), s.actualizado_en),
       s.actualizado_en,
       case when s.estado = 'resuelto' then s.actualizado_por end,
       case when s.estado = 'resuelto' then s.actualizado_en end,
       case when s.estado = 'resuelto' then coalesce(nullif(s.nota, ''), 'Resuelto en el seguimiento del bloque 87.') end
  from casos_seguimiento s
  join casos_tipos t on t.tipo = split_part(s.clave, ':', 1)
 where split_part(s.clave, ':', 2) ~ '^[0-9]{4,12}$'
on conflict (clave) do nothing;

insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por, hecho_en)
select c.id, 'estado', null,
       case h.estado when 'pendiente' then 'abierto' when 'revision' then 'seguimiento' else 'resuelto' end,
       h.nota, h.hecho_por, h.hecho_en
  from casos_seguimiento_historial h
  join casos c on c.clave = h.clave and c.origen = 'migracion'
 where not exists (select 1 from casos_notas n where n.caso_id = c.id and n.hecho_en = h.hecho_en and n.hecho_por = h.hecho_por);

commit;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 6. VERIFICACION (solo lectura). Ocho filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'existen casos_tipos, casos y casos_notas' as que,
       to_regclass('public.casos_tipos') is not null and to_regclass('public.casos') is not null
       and to_regclass('public.casos_notas') is not null as ok
union all
select 2, 'catalogo con sus 19 tipos', (select count(*) from casos_tipos) >= 19
union all
select 3, 'las tres tablas tienen RLS',
       (select bool_and(relrowsecurity) from pg_class
         where oid in ('public.casos_tipos'::regclass, 'public.casos'::regclass, 'public.casos_notas'::regclass))
union all
select 4, 'anon fuera; authenticated solo lee',
       not has_table_privilege('anon', 'casos', 'SELECT')
       and has_table_privilege('authenticated', 'casos', 'SELECT')
       and not has_table_privilege('authenticated', 'casos', 'INSERT')
       and not has_table_privilege('authenticated', 'casos', 'UPDATE')
       and not has_table_privilege('authenticated', 'casos_notas', 'INSERT')
       and not has_table_privilege('authenticated', 'casos_tipos', 'INSERT')
union all
select 5, 'abrir_caso y anotar_caso: security definer, anon no, authenticated si',
       (select count(*) from pg_proc where proname in ('abrir_caso', 'anotar_caso') and prosecdef) = 2
       and not has_function_privilege('anon', 'abrir_caso(text, text, text, uuid, text, jsonb, boolean, text, text, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'abrir_caso(text, text, text, uuid, text, jsonb, boolean, text, text, text, text)', 'EXECUTE')
       and not has_function_privilege('anon', 'anotar_caso(uuid, text, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'anotar_caso(uuid, text, text, text)', 'EXECUTE')
union all
select 6, 'una sola forma de cada RPC (sin sobrecargas para PostgREST)',
       (select count(*) from pg_proc where proname = 'abrir_caso') = 1
       and (select count(*) from pg_proc where proname = 'anotar_caso') = 1
union all
select 7, 'todo el seguimiento del 87 quedo migrado',
       (select count(*) from casos_seguimiento s where split_part(s.clave, ':', 2) ~ '^[0-9]{4,12}$'
                                                   and exists (select 1 from casos_tipos t where t.tipo = split_part(s.clave, ':', 1)))
       = (select count(*) from casos where origen = 'migracion')
union all
select 8, 'ningun mensaje tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|reintenta|verifica|escribe|apliquelo)\M')
          from pg_proc where proname in ('abrir_caso', 'anotar_caso'))
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Primero revertir el deploy del cliente. Se pierden
-- los casos abiertos despues de aplicar este bloque; el seguimiento del 87
-- sigue intacto en sus tablas.
--
--   begin;
--   drop function if exists anotar_caso(uuid, text, text, text);
--   drop function if exists abrir_caso(text, text, text, uuid, text, jsonb, boolean, text, text, text, text);
--   drop table if exists casos_notas;
--   drop table if exists casos;
--   drop table if exists casos_tipos;
--   commit;
--   notify pgrst, 'reload schema';
