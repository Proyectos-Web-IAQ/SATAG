-- =====================================================================
-- BLOQUE 90 — El tablero de casos: estados del flujo, tipos editables.
--
-- SC-031 · 07/10/2026
--
-- POR QUE
--   Gerardo, 7-oct, aprobo el tablero A5 (boceto con datos reales): cuatro
--   columnas que dicen EN QUE PASO va cada caso —Nuevo, Por atender, Esperando,
--   Cerrado—, el tipo como etiqueta de color que el equipo edita «a
--   conveniencia», marcas de urgente y atorado, y cerrar siempre con motivo.
--   Con los estados del 89 (abierto, seguimiento, resuelto, descartado) los
--   191 «TAG sin uso» que esperan hasta abril de 2027 estaban revueltos con
--   los ~50 que piden trabajo hoy, y por eso la lista era interminable.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: el 89 aplicado y el 90 no.
--   1. `casos_familias`: las 6 familias (los grupos de tipos, con su color).
--   2. `casos_tipos`: familia, activo (retirar sin borrar) y motivos de
--      cierre. Tipo nuevo «salida-no-lee» (diagnostico del 7-oct).
--   3. `casos`: estados `nuevo` y `esperando` (con motivo: la persona, un
--      tercero o una fecha), urgente, atorado, motivo de cierre, caso
--      principal y «volvio a pasar» (veces, ultima_vez). `casos_notas`
--      admite las clases `marca` y `tipo`.
--   4. RLS de `casos_familias`: la misma lectura que los tipos.
--   5. RPC NUEVOS (ninguno cambia de firma; abrir_caso y anotar_caso siguen
--      intactos para el cliente publicado):
--        reportar_caso   abre en «Nuevo», con urgente (ti, contador, admin)
--        mover_casos     uno o varios a otro paso (ti, contador, admin)
--        marcar_casos    urgente, atorado, tipo (ti, contador, admin)
--        guardar_tipo_caso / borrar_tipo_caso  el catalogo (solo ti)
--   6. Verificacion de solo lectura: filas con ok = true.
--
-- QUE NO HACE
--   No mueve ningun caso de estado. Pasar los «TAG sin uso» a Esperando, los
--   «preguntar» a Esperando-a-la-persona y cargar los 25 «salida no lee» es
--   un SQL de DATOS aparte, DESPUES de publicar el cliente: el cliente de hoy
--   no conoce `nuevo` ni `esperando` y los pintaria mal.
--
-- Este bloque solo AGREGA (amplia el CHECK de estados, no lo restringe): va
-- ANTES del deploy del cliente que lo usa.
--
-- OJO: `anotar_caso` (89) no sabe de la espera. Cerrar con el un caso que esta
-- en Esperando lo frena el CHECK casos_espera. El cliente nuevo cambia de
-- estado SOLO con mover_casos y usa anotar_caso solo para notas sin estado.
--
-- Ensayado en la base local el 7-oct: verificacion 8/8, 26 escenarios con los
-- roles reales (admin, contador, ti, consulta), guardia al repetir, rollback
-- (deja los CHECK identicos a los del 89) y reaplicacion 8/8.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regprocedure('public.abrir_caso(text, text, text, uuid, text, jsonb, boolean, text, text, text, text)') is null
       or to_regprocedure('public.anotar_caso(uuid, text, text, text)') is null then
        raise exception 'Falta el bloque 89 (abrir_caso / anotar_caso). No se aplico nada.';
    end if;
    if to_regclass('public.casos_familias') is not null then
        raise exception 'El bloque 90 ya esta aplicado (existe casos_familias). No se aplico nada.';
    end if;
    if exists (select 1 from casos where estado not in ('abierto', 'seguimiento', 'resuelto', 'descartado')) then
        raise exception 'Hay casos con un estado que el 89 no conoce. Revise antes de aplicar. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LAS FAMILIAS (grupos de tipos; el color de la etiqueta)
-- ---------------------------------------------------------------------
create table casos_familias (
    id      text primary key,
    titulo  text not null,
    orden   int  not null,
    fondo   text not null,
    tinta   text not null,
    constraint casos_familias_formato check (id ~ '^[a-z][a-z-]*$'),
    constraint casos_familias_color   check (fondo ~ '^#[0-9a-fA-F]{6}$' and tinta ~ '^#[0-9a-fA-F]{6}$')
);
comment on table casos_familias is 'Familias de tipos de caso (bloque 90): agrupan los tipos y les dan color. Son pocas y casi no cambian; los tipos si.';

insert into casos_familias (id, titulo, orden, fondo, tinta) values
    ('tag',      'TAG y credencial',       10, '#e7edf6', '#1d4f91'),
    ('acceso',   'Acceso a la pluma',      20, '#fdf0e1', '#8a5214'),
    ('datos',    'Datos del expediente',   30, '#e4f1e8', '#1f6f43'),
    ('vinculo',  'Vinculo con el colegio', 40, '#e3f1f1', '#0f5f5c'),
    ('conducta', 'Conducta',               50, '#f4ebe4', '#7a4a2a'),
    ('otro',     'Otro',                   99, '#eef1f4', '#56606e');


-- ---------------------------------------------------------------------
-- 2. LOS TIPOS: familia, activo, motivos de cierre
-- ---------------------------------------------------------------------
alter table casos_tipos
    add column familia         text references casos_familias (id),
    add column activo          boolean not null default true,
    add column motivos_cierre  text[]  not null default '{}',
    add column actualizado_por text,
    add column actualizado_en  timestamptz;

-- El tipo nuevo del diagnostico de entradas y salidas del 7-oct.
insert into casos_tipos (tipo, titulo, categoria, que_hacer, automatico, orden) values
    ('salida-no-lee', 'La salida no lee el TAG', 'credencial',
     'Un lector casi nunca lee este TAG: muchas de sus estancias quedan sin salida (o sin entrada). Revisar la colocacion del TAG en el parabrisas (centrado, arriba, sin pelicula metalica) o la antena de ese lector.', true, 65);

update casos_tipos set familia = case
        when tipo in ('salida-no-lee', 'dos-tags-mismo-coche', 'credencial-sin-nombre', 'tag-sin-uso',
                      'reposicion-tag', 'tag-anterior-abre', 'sin-padron') then 'tag'
        when tipo in ('departamento-distinto', 'excepcion-acceso', 'rechazo-diario', 'vivo-en-bajas',
                      'baja-que-abre', 'sin-uso') then 'acceso'
        when tipo in ('preguntar', 'abre-sin-expediente', 'tipo-distinto') then 'datos'
        when tipo = 'exempleado-tag-vivo' then 'vinculo'
        when tipo in ('conducta', 'mal-uso-tag') then 'conducta'
        else 'otro'
    end;

update casos_tipos t set motivos_cierre = m.motivos
  from (values
    ('salida-no-lee',         array['Se recoloco el TAG', 'Se cambio el TAG', 'Se reviso la antena del lector']),
    ('dos-tags-mismo-coche',  array['Se dio de baja el TAG sobrante', 'Placa confirmada con la persona']),
    ('credencial-sin-nombre', array['Identificada y registrada', 'Dada de baja en ZK']),
    ('tag-sin-uso',           array['Se le quitaron los niveles al TAG', 'Se recogio el TAG', 'Lo volvio a usar']),
    ('reposicion-tag',        array['TAG nuevo instalado y expediente actualizado']),
    ('departamento-distinto', array['Movido en ZK al departamento que le toca', 'Su departamento actual es el correcto']),
    ('excepcion-acceso',      array['Excepcion renovada', 'Excepcion retirada']),
    ('rechazo-diario',        array['Se corrigieron sus niveles en ZK', 'Se le aviso que use su estacionamiento']),
    ('preguntar',             array['La persona lo confirmo', 'La persona lo corrigio (dato actualizado)']),
    ('abre-sin-expediente',   array['Alta registrada', 'Acceso retirado en ZK']),
    ('exempleado-tag-vivo',   array['Pasado a BAJAS en ZK, niveles quitados', 'Sigue trabajando: no era baja']),
    ('conducta',              array['Se hablo con la persona']),
    ('mal-uso-tag',           array['TAG dado de baja', 'Se hablo con la persona'])
  ) as m (tipo, motivos)
 where t.tipo = m.tipo;

alter table casos_tipos alter column familia set not null;
comment on column casos_tipos.activo is 'false = retirado: ya no se ofrece al reportar; sus casos lo conservan. Un tipo con casos no se borra.';
comment on column casos_tipos.motivos_cierre is 'Los motivos que se ofrecen al cerrar un caso de este tipo (ademas de los generales del cliente).';


-- ---------------------------------------------------------------------
-- 3. LOS CASOS: pasos del flujo, marcas, motivo de cierre
-- ---------------------------------------------------------------------
alter table casos
    add column urgente        boolean not null default false,
    add column atorado        boolean not null default false,
    add column espera_motivo  text,
    add column espera_hasta   date,
    add column espera_texto   text,
    add column cierre_motivo  text,
    add column caso_principal uuid references casos (id) on delete set null,
    add column veces          int not null default 1,
    add column ultima_vez     timestamptz;

-- Se AMPLIA la lista de estados: `abierto` es «Por atender»; `seguimiento`
-- queda por compatibilidad con el cliente publicado (el nuevo lo pinta en
-- Esperando).
alter table casos drop constraint casos_estado;
alter table casos add constraint casos_estado
    check (estado in ('nuevo', 'abierto', 'esperando', 'seguimiento', 'resuelto', 'descartado'));
alter table casos add constraint casos_espera
    check ((estado = 'esperando') = (espera_motivo is not null)
           and (espera_motivo is null or espera_motivo in ('persona', 'tercero', 'fecha'))
           and (espera_motivo is distinct from 'fecha' or espera_hasta is not null));
alter table casos add constraint casos_veces check (veces >= 1);
alter table casos add constraint casos_no_principal_de_si check (caso_principal is distinct from id);

alter table casos_notas drop constraint casos_notas_clase;
alter table casos_notas add constraint casos_notas_clase
    check (clase in ('apertura', 'nota', 'estado', 'marca', 'tipo'));

comment on column casos.espera_motivo is 'Solo en Esperando: persona (vuelve cuando su TAG pase por la pluma), tercero (espera_texto dice a quien) o fecha (espera_hasta).';
comment on column casos.veces is 'Cuantas veces lo ha detectado una regla. Si el hecho se repite, se suma aqui en vez de abrir otro caso.';


-- ---------------------------------------------------------------------
-- 4. RLS DE LAS FAMILIAS (la misma lectura que los tipos)
-- ---------------------------------------------------------------------
alter table casos_familias enable row level security;
create policy casos_familias_lectura on casos_familias for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));
revoke all on table casos_familias from anon, public;
revoke insert, update, delete, truncate, references, trigger on table casos_familias from authenticated;
grant  select on table casos_familias to authenticated;


-- ---------------------------------------------------------------------
-- 5. LOS RPC
-- ---------------------------------------------------------------------
-- Reportar un caso: abre con abrir_caso (mismas reglas) y lo deja en «Nuevo».
create function reportar_caso(
    p_tipo        text,
    p_titulo      text,
    p_detalle     text    default '',
    p_registro_id uuid    default null,
    p_tarjeta     text    default null,
    p_urgente     boolean default false,
    p_evidencia   jsonb   default '{}'::jsonb,
    p_hecho_por   text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $reportar$
declare
    v jsonb;
begin
    perform panel_exigir_rol(array['ti', 'contador', 'admin']);
    if not exists (select 1 from casos_tipos where tipo = p_tipo and activo) then
        raise exception 'Ese tipo de caso ya no se usa. Elija otro de la lista.';
    end if;
    v := abrir_caso(p_tipo, p_titulo, p_detalle, p_registro_id, p_tarjeta, p_evidencia, false,
                    null, 'manual', null, p_hecho_por);
    update casos set estado = 'nuevo', urgente = coalesce(p_urgente, false)
     where id = (v ->> 'id')::uuid;
    update casos_notas set estado_despues = 'nuevo'
     where caso_id = (v ->> 'id')::uuid and clase = 'apertura';
    return v;
end;
$reportar$;

-- Mover uno o varios casos a otro paso del flujo. Esperar pide motivo; cerrar
-- pide motivo o nota. Cada caso guarda su propia linea de historial.
create function mover_casos(
    p_casos         uuid[],
    p_estado        text,
    p_nota          text default '',
    p_motivo        text default null,
    p_espera_motivo text default null,
    p_espera_hasta  date default null,
    p_espera_texto  text default null,
    p_hecho_por     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $mover$
declare
    v_quien   text;
    v_nota    text := btrim(coalesce(p_nota, ''));
    v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
    v_esp     text := nullif(btrim(coalesce(p_espera_motivo, '')), '');
    v_texto   text := nullif(btrim(coalesce(p_espera_texto, '')), '');
    v_cierra  boolean := p_estado in ('resuelto', 'descartado');
    v_linea   text;
    v_caso    record;
    v_movidos int := 0;
begin
    perform panel_exigir_rol(array['ti', 'contador', 'admin']);

    if p_casos is null or cardinality(p_casos) = 0 then
        raise exception 'Elija al menos un caso.';
    end if;
    if cardinality(p_casos) > 500 then
        raise exception 'Son demasiados casos a la vez: mueva menos de 500.';
    end if;
    if p_estado is null or p_estado not in ('abierto', 'esperando', 'resuelto', 'descartado') then
        raise exception 'El caso solo puede pasar a Por atender, Esperando o Cerrado.';
    end if;
    if char_length(v_nota) > 4000 or char_length(coalesce(v_motivo, '')) > 200 or char_length(coalesce(v_texto, '')) > 200 then
        raise exception 'El texto es demasiado largo.';
    end if;
    if p_estado = 'esperando' then
        if v_esp is null or v_esp not in ('persona', 'tercero', 'fecha') then
            raise exception 'Diga que se espera: a la persona, a alguien de fuera o una fecha.';
        end if;
        if v_esp = 'fecha' and (p_espera_hasta is null or p_espera_hasta <= (now() at time zone 'America/Mexico_City')::date) then
            raise exception 'La fecha de espera tiene que ser posterior a hoy.';
        end if;
        if v_esp = 'tercero' and v_texto is null then
            raise exception 'Escriba a quien o que se espera.';
        end if;
    end if;
    if v_cierra and v_motivo is null and v_nota = '' then
        raise exception 'Para cerrar, elija el motivo o escriba que se hizo.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    v_linea := case
        when v_cierra then concat_ws('. ', v_motivo, nullif(v_nota, ''))
        when p_estado = 'esperando' then concat_ws('. ',
            case v_esp when 'persona' then 'Esperando a que la persona se presente'
                       when 'tercero' then 'Esperando a ' || v_texto
                       else 'Esperando hasta el ' || to_char(p_espera_hasta, 'DD/MM/YYYY') end,
            nullif(v_nota, ''))
        else v_nota
    end;

    for v_caso in select id, estado from casos where id = any (p_casos) order by numero for update loop
        if v_caso.estado = p_estado then
            continue;
        end if;
        update casos
           set estado         = p_estado,
               actualizado_en = now(),
               espera_motivo  = case when p_estado = 'esperando' then v_esp end,
               espera_hasta   = case when p_estado = 'esperando' and v_esp = 'fecha' then p_espera_hasta end,
               espera_texto   = case when p_estado = 'esperando' then v_texto end,
               atorado        = case when p_estado = 'abierto' then atorado else false end,
               cerrado_por    = case when v_cierra then v_quien end,
               cerrado_en     = case when v_cierra then now() end,
               cierre_nota    = case when v_cierra then v_linea end,
               cierre_motivo  = case when v_cierra then v_motivo end
         where id = v_caso.id;
        insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
        values (v_caso.id, 'estado', v_caso.estado, p_estado,
                left(v_linea || case when cardinality(p_casos) > 1 then ' (junto con otros ' || (cardinality(p_casos) - 1) || ')' else '' end, 4000),
                v_quien);
        v_movidos := v_movidos + 1;
    end loop;

    if v_movidos = 0 and not exists (select 1 from casos where id = any (p_casos)) then
        raise exception 'Los casos no existen. Vuelva a abrir la pantalla y reintente.';
    end if;
    return jsonb_build_object('movidos', v_movidos, 'estado', p_estado, 'hechoPor', v_quien);
end;
$mover$;

-- Marcas: urgente, atorado (solo en Por atender) y cambio de tipo. Lo que llega
-- en null no se toca.
create function marcar_casos(
    p_casos     uuid[],
    p_urgente   boolean default null,
    p_atorado   boolean default null,
    p_tipo      text    default null,
    p_hecho_por text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $marcar$
declare
    v_quien  text;
    v_caso   record;
    v_titulo text;
    v_n      int := 0;
begin
    perform panel_exigir_rol(array['ti', 'contador', 'admin']);
    if p_casos is null or cardinality(p_casos) = 0 then
        raise exception 'Elija al menos un caso.';
    end if;
    if p_urgente is null and p_atorado is null and p_tipo is null then
        raise exception 'No hay nada que cambiar.';
    end if;
    if p_tipo is not null then
        select titulo into v_titulo from casos_tipos where tipo = p_tipo and activo;
        if not found then
            raise exception 'Ese tipo de caso no existe o ya no se usa. Elija otro de la lista.';
        end if;
    end if;
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    for v_caso in select c.id, c.estado, c.urgente, c.atorado, c.tipo, t.titulo as tipo_titulo
                    from casos c join casos_tipos t on t.tipo = c.tipo
                   where c.id = any (p_casos) order by c.numero for update of c loop
        if p_urgente is not null and p_urgente <> v_caso.urgente then
            update casos set urgente = p_urgente, actualizado_en = now() where id = v_caso.id;
            insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
            values (v_caso.id, 'marca', v_caso.estado, v_caso.estado, case when p_urgente then 'Marcado urgente' else 'Ya no es urgente' end, v_quien);
            v_n := v_n + 1;
        end if;
        if p_atorado is not null and p_atorado <> v_caso.atorado then
            if p_atorado and v_caso.estado <> 'abierto' then
                raise exception 'Solo un caso «Por atender» se puede marcar como atorado.';
            end if;
            update casos set atorado = p_atorado, actualizado_en = now() where id = v_caso.id;
            insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
            values (v_caso.id, 'marca', v_caso.estado, v_caso.estado, case when p_atorado then 'Marcado atorado' else 'Ya no esta atorado' end, v_quien);
            v_n := v_n + 1;
        end if;
        if p_tipo is not null and p_tipo <> v_caso.tipo then
            update casos set tipo = p_tipo, actualizado_en = now() where id = v_caso.id;
            insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
            values (v_caso.id, 'tipo', v_caso.estado, v_caso.estado, 'Tipo: ' || v_caso.tipo_titulo || ' -> ' || v_titulo, v_quien);
            v_n := v_n + 1;
        end if;
    end loop;
    return jsonb_build_object('cambios', v_n, 'hechoPor', v_quien);
end;
$marcar$;

-- El catalogo: crear (p_tipo null), editar o retirar un tipo. Solo ti (y super).
create function guardar_tipo_caso(
    p_tipo      text,
    p_titulo    text,
    p_familia   text,
    p_que_hacer text    default '',
    p_motivos   text[]  default '{}',
    p_activo    boolean default true,
    p_orden     int     default null,
    p_hecho_por text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $guardar$
declare
    v_quien  text;
    v_tipo   text := nullif(btrim(coalesce(p_tipo, '')), '');
    v_titulo text := btrim(coalesce(p_titulo, ''));
    v_base   text;
    v_n      int := 1;
    v_cat    text;
    v_motivos text[];
begin
    perform panel_exigir_rol(array['ti']);
    if char_length(v_titulo) < 3 or char_length(v_titulo) > 80 then
        raise exception 'El nombre del tipo debe tener de 3 a 80 caracteres.';
    end if;
    if not exists (select 1 from casos_familias where id = p_familia) then
        raise exception 'Elija una familia de la lista.';
    end if;
    if char_length(coalesce(p_que_hacer, '')) > 1000 then
        raise exception 'El «que hacer» es demasiado largo: use menos de 1,000 caracteres.';
    end if;
    select coalesce(array_agg(m), '{}') into v_motivos
      from (select btrim(x) as m from unnest(coalesce(p_motivos, '{}')) x where btrim(x) <> '') s;
    if cardinality(v_motivos) > 12 or exists (select 1 from unnest(v_motivos) m where char_length(m) > 120) then
        raise exception 'Use hasta 12 motivos de cierre, de menos de 120 caracteres cada uno.';
    end if;
    if exists (select 1 from casos_tipos where lower(titulo) = lower(v_titulo) and tipo is distinct from v_tipo) then
        raise exception 'Ya hay un tipo con ese nombre.';
    end if;
    -- `categoria` (89) se sigue llenando para el cliente anterior.
    v_cat := case p_familia when 'tag' then 'credencial' when 'acceso' then 'acceso' when 'vinculo' then 'acceso'
                            when 'conducta' then 'conducta' else 'datos' end;
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    if v_tipo is null then
        v_base := trim(both '-' from regexp_replace(lower(translate(v_titulo, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '[^a-z]+', '-', 'g'));
        if v_base = '' then
            v_base := 'tipo';
        end if;
        v_tipo := v_base;
        while exists (select 1 from casos_tipos where tipo = v_tipo) loop
            v_n := v_n + 1;
            v_tipo := v_base || '-' || chr(96 + least(v_n, 26));
        end loop;
        insert into casos_tipos (tipo, titulo, categoria, que_hacer, automatico, orden, familia, activo, motivos_cierre, actualizado_por, actualizado_en)
        values (v_tipo, v_titulo, v_cat, coalesce(p_que_hacer, ''), false,
                coalesce(p_orden, (select coalesce(max(orden), 0) + 10 from casos_tipos where familia = p_familia)),
                p_familia, coalesce(p_activo, true), v_motivos, v_quien, now());
        return jsonb_build_object('tipo', v_tipo, 'nuevo', true);
    end if;

    update casos_tipos
       set titulo = v_titulo, familia = p_familia, categoria = v_cat, que_hacer = coalesce(p_que_hacer, ''),
           motivos_cierre = v_motivos, activo = coalesce(p_activo, true), orden = coalesce(p_orden, orden),
           actualizado_por = v_quien, actualizado_en = now()
     where tipo = v_tipo;
    if not found then
        raise exception 'Ese tipo de caso no existe. Vuelva a abrir la pantalla y reintente.';
    end if;
    return jsonb_build_object('tipo', v_tipo, 'nuevo', false);
end;
$guardar$;

-- Borrar un tipo: solo si ningun caso lo usa (si no, se retira).
create function borrar_tipo_caso(p_tipo text) returns jsonb
language plpgsql
security definer
set search_path = public
as $borrar$
begin
    perform panel_exigir_rol(array['ti']);
    if exists (select 1 from casos where tipo = p_tipo) then
        raise exception 'Ese tipo tiene casos: no se borra, se retira.';
    end if;
    if p_tipo = 'otro' then
        raise exception 'El tipo «Otro» no se borra.';
    end if;
    delete from casos_tipos where tipo = p_tipo;
    if not found then
        raise exception 'Ese tipo de caso no existe.';
    end if;
    return jsonb_build_object('tipo', p_tipo, 'borrado', true);
end;
$borrar$;

revoke all     on function reportar_caso(text, text, text, uuid, text, boolean, jsonb, text) from public, anon;
grant  execute on function reportar_caso(text, text, text, uuid, text, boolean, jsonb, text) to authenticated;
revoke all     on function mover_casos(uuid[], text, text, text, text, date, text, text) from public, anon;
grant  execute on function mover_casos(uuid[], text, text, text, text, date, text, text) to authenticated;
revoke all     on function marcar_casos(uuid[], boolean, boolean, text, text) from public, anon;
grant  execute on function marcar_casos(uuid[], boolean, boolean, text, text) to authenticated;
revoke all     on function guardar_tipo_caso(text, text, text, text, text[], boolean, int, text) from public, anon;
grant  execute on function guardar_tipo_caso(text, text, text, text, text[], boolean, int, text) to authenticated;
revoke all     on function borrar_tipo_caso(text) from public, anon;
grant  execute on function borrar_tipo_caso(text) to authenticated;

commit;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 6. VERIFICACION (solo lectura). Todas las filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'seis familias con color' as que,
       (select count(*) from casos_familias) = 6 as ok
union all
select 2, 'todos los tipos tienen familia; existe «La salida no lee el TAG»',
       not exists (select 1 from casos_tipos where familia is null)
       and exists (select 1 from casos_tipos where tipo = 'salida-no-lee' and familia = 'tag' and activo)
union all
select 3, 'casos admite nuevo y esperando; ningun caso cambio de estado',
       (select pg_get_constraintdef(oid) from pg_constraint where conname = 'casos_estado') like '%nuevo%esperando%'
       and not exists (select 1 from casos where estado in ('nuevo', 'esperando'))
union all
select 4, 'columnas nuevas de casos y de casos_tipos',
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'casos'
          and column_name in ('urgente', 'atorado', 'espera_motivo', 'espera_hasta', 'espera_texto', 'cierre_motivo', 'caso_principal', 'veces', 'ultima_vez')) = 9
       and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'casos_tipos'
          and column_name in ('familia', 'activo', 'motivos_cierre', 'actualizado_por', 'actualizado_en')) = 5
union all
select 5, 'casos_familias: RLS, anon fuera, authenticated solo lee',
       (select relrowsecurity from pg_class where oid = 'public.casos_familias'::regclass)
       and not has_table_privilege('anon', 'casos_familias', 'SELECT')
       and has_table_privilege('authenticated', 'casos_familias', 'SELECT')
       and not has_table_privilege('authenticated', 'casos_familias', 'INSERT')
       and not has_table_privilege('authenticated', 'casos_tipos', 'UPDATE')
union all
select 6, 'los cinco RPC nuevos: security definer, anon no, authenticated si',
       (select count(*) from pg_proc where proname in ('reportar_caso', 'mover_casos', 'marcar_casos', 'guardar_tipo_caso', 'borrar_tipo_caso') and prosecdef) = 5
       and not has_function_privilege('anon', 'mover_casos(uuid[], text, text, text, text, date, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'mover_casos(uuid[], text, text, text, text, date, text, text)', 'EXECUTE')
       and not has_function_privilege('anon', 'guardar_tipo_caso(text, text, text, text, text[], boolean, int, text)', 'EXECUTE')
       and not has_function_privilege('anon', 'reportar_caso(text, text, text, uuid, text, boolean, jsonb, text)', 'EXECUTE')
       and not has_function_privilege('anon', 'marcar_casos(uuid[], boolean, boolean, text, text)', 'EXECUTE')
       and not has_function_privilege('anon', 'borrar_tipo_caso(text)', 'EXECUTE')
union all
select 7, 'una sola forma de cada RPC de casos (sin sobrecargas para PostgREST)',
       (select bool_and(n = 1) from (select count(*) as n from pg_proc
          where proname in ('abrir_caso', 'anotar_caso', 'reportar_caso', 'mover_casos', 'marcar_casos', 'guardar_tipo_caso', 'borrar_tipo_caso')
          group by proname) s)
       and (select count(distinct proname) from pg_proc
          where proname in ('abrir_caso', 'anotar_caso', 'reportar_caso', 'mover_casos', 'marcar_casos', 'guardar_tipo_caso', 'borrar_tipo_caso')) = 7
union all
select 8, 'ningun mensaje tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|reintenta|verifica|escribe|mueve|di)\M')
          from pg_proc where proname in ('reportar_caso', 'mover_casos', 'marcar_casos', 'guardar_tipo_caso', 'borrar_tipo_caso'))
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). ANTES DE NADA: revierta primero el deploy del
-- cliente que usa este bloque. Luego, si algun caso quedo en nuevo o
-- esperando, regreselo a abierto (si no, el CHECK del 89 no se puede poner).
-- Las lineas de los CHECK son las del bloque 89 (89_casos.sql:146 y :170).
--
--   begin;
--   update casos set estado = 'abierto' where estado in ('nuevo', 'esperando');
--   delete from casos_notas where clase in ('marca', 'tipo');
--   drop function if exists borrar_tipo_caso(text);
--   drop function if exists guardar_tipo_caso(text, text, text, text, text[], boolean, int, text);
--   drop function if exists marcar_casos(uuid[], boolean, boolean, text, text);
--   drop function if exists mover_casos(uuid[], text, text, text, text, date, text, text);
--   drop function if exists reportar_caso(text, text, text, uuid, text, boolean, jsonb, text);
--   alter table casos_notas drop constraint casos_notas_clase;
--   alter table casos_notas add constraint casos_notas_clase check (clase in ('apertura', 'nota', 'estado'));
--   alter table casos drop constraint casos_no_principal_de_si;
--   alter table casos drop constraint casos_veces;
--   alter table casos drop constraint casos_espera;
--   alter table casos drop constraint casos_estado;
--   alter table casos add constraint casos_estado check (estado in ('abierto', 'seguimiento', 'resuelto', 'descartado'));
--   alter table casos drop column ultima_vez, drop column veces, drop column caso_principal, drop column cierre_motivo,
--                     drop column espera_texto, drop column espera_hasta, drop column espera_motivo,
--                     drop column atorado, drop column urgente;
--   delete from casos_tipos where tipo = 'salida-no-lee' and not exists (select 1 from casos where tipo = 'salida-no-lee');
--   delete from casos_tipos where tipo not in (select distinct tipo from casos) and actualizado_por is not null
--                            and tipo not in ('conducta','mal-uso-tag','excepcion-acceso','preguntar','reposicion-tag',
--                                             'dos-tags-mismo-coche','tag-sin-uso','credencial-sin-nombre','exempleado-tag-vivo',
--                                             'departamento-distinto','rechazo-diario','vivo-en-bajas','baja-que-abre',
--                                             'tag-anterior-abre','abre-sin-expediente','sin-padron','tipo-distinto','sin-uso','otro');
--   alter table casos_tipos drop column actualizado_en, drop column actualizado_por, drop column motivos_cierre,
--                           drop column activo, drop column familia;
--   drop table casos_familias;
--   commit;
--   notify pgrst, 'reload schema';
