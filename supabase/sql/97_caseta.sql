-- =====================================================================
-- BLOQUE 97 — La caseta: el portero consulta por que no abre y reporta
--             cuando abre con el boton; Sistemas sigue esas aperturas.
--
-- SC-032 · 14/10/2026
--
-- POR QUE
--   Gerardo, 14-oct: Sistemas ya da de baja TAGs y sigue casos, pero eso no
--   le llega a los porteros, y ellos no tienen por donde reportar: cuando la
--   pluma no abre, abren con el boton y nadie se entera. ZK no guarda esas
--   aperturas (el bloque 78 descarta las filas sin tarjeta), asi que el
--   reporte del portero es el PRIMER registro que existe de ellas.
--
-- DECISIONES DE GERARDO (14-oct)
--   - Rol nuevo `portero`, SIN MFA: entra con contrasena en una Chromebook
--     compartida por turnos. Por eso NO se le agrega a ninguna politica: no lee
--     ninguna tabla. Lo que ve sale de tres RPC acotados con su propia guardia
--     (`caseta_exigir_rol`), que deja pasar a `portero` en aal1 y a ti / super
--     solo con aal2.
--   - Ve nombre completo, tipo, vehiculo, placa, plumas y su ultimo paso. NO ve
--     folio, gestionante, pagos, firma, permiso del menor ni los casos.
--   - EL VEREDICTO ES DE DOS COLORES (Gerardo, 14-oct, segunda vuelta): la
--     antena rechaza un TAG solo si esta dado de baja o si no le corresponde ese
--     estacionamiento. En los dos casos: NO ABRIR y negar el acceso. Sin TAG
--     activo en ZK (o sin TAG) tambien es no abrir. Si tiene acceso y no abrio,
--     el TAG no se leyo: abrir con el boton y reportarlo.
--   - Si el TAG esta dado de baja, el portero ve EL MOTIVO y la fecha (para
--     explicarselo a quien pregunte) y que el proceso es comprar un TAG nuevo. A
--     donde remitir una queja aun no se decide: la pantalla no lo dice.
--   - El portero ve los CAMBIOS DE SISTEMAS que le importan a la pluma (bajas
--     de quien sigue viniendo, cambios de acceso, TAGs nuevos) y da SEGUIMIENTO
--     a sus reportes: en que va su caso y con que motivo se cerro. No casos.
--   - Cada apertura con boton queda en la bitacora de la caseta y, si el
--     vehiculo se identifico, abre o suma una vez a un caso «Abierta con el
--     boton en caseta». Sistemas sigue a que carro se le abrio: por expediente,
--     por TAG o por la placa escrita, y puede ligar despues una apertura que el
--     portero no identifico.
--   - Quien abrio es SIEMPRE el correo de la sesion (JWT), nunca un dato del
--     formulario.
--   - Cada estacionamiento ve lo suyo: las bajas recientes traen sus lotes.
--
-- QUE HACE, EN ORDEN
--   0. Guardia.
--   1. Dos tipos de caso nuevos: `apertura-boton` y `reporte-caseta`.
--   2. `caseta_reportes` (la bitacora de la caseta) y `caseta_consultas` (quien
--      busco que: sin MFA, es el contrapeso). RLS, sin escritura directa.
--   3. Funciones internas (no se exponen a la API): la guardia, el rotulo de
--      cada motivo, el motivo de una baja, el veredicto y el caso de un reporte.
--   4. RPC: `caseta_buscar`, `caseta_inicio`, `caseta_reportar` (portero, ti,
--      super) y `ligar_reporte_caseta` (ti).
--   5. Verificacion de solo lectura: filas con ok = true.
--
-- QUE NO HACE
--   - No toca `panel_exigir_rol` ni ninguna politica que ya exista. Ninguna
--     tabla gana lectura para `portero`.
--   - No asigna el rol a nadie: eso va aparte, cuenta por cuenta
--     (supabase/manual/2026-10-14_cuentas_porteros.sql).
--
-- Este bloque solo AGREGA: va ANTES del deploy del cliente que lo usa. El
-- cliente de hoy no lee las columnas nuevas, asi que no le afecta.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regclass('public.caseta_reportes') is not null then
        raise exception 'El bloque 97 ya esta aplicado (existe caseta_reportes). No se aplico nada.';
    end if;
    if to_regprocedure('public.panel_exigir_rol(text[])') is null then
        raise exception 'Falta panel_exigir_rol (bloque 29). No se aplico nada.';
    end if;
    if to_regprocedure('public.zk_texto_comparable(text)') is null or to_regclass('public.zk_puertas') is null then
        raise exception 'Falta el bloque 93 (zk_texto_comparable / zk_puertas). No se aplico nada.';
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'zk_padron' and column_name = 'placa')
       or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'zk_padron' and column_name = 'id_zk') then
        raise exception 'Falta zk_padron.placa (86) o zk_padron.id_zk (93). No se aplico nada.';
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'casos' and column_name = 'ultima_vez') then
        raise exception 'Falta el bloque 90 (casos.veces / ultima_vez). No se aplico nada.';
    end if;
    if not exists (select 1 from pg_constraint where conname = 'casos_estado'
                    and pg_get_constraintdef(oid) like '%nuevo%') then
        raise exception 'El estado «nuevo» de los casos no existe (bloque 90). No se aplico nada.';
    end if;
    if exists (select 1 from casos_tipos where tipo in ('apertura-boton', 'reporte-caseta')) then
        raise exception 'Ya existe el tipo apertura-boton o reporte-caseta. Revise antes de aplicar. No se aplico nada.';
    end if;
    if (select count(*) from casos_familias where id in ('acceso', 'otro')) <> 2 then
        raise exception 'Faltan las familias acceso / otro (bloque 90). No se aplico nada.';
    end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname like 'caseta%') then
        raise exception 'Ya existe una funcion caseta_*. Revise antes de aplicar. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LOS TIPOS DE CASO DE LA CASETA
-- ---------------------------------------------------------------------
insert into casos_tipos (tipo, titulo, categoria, que_hacer, automatico, orden, familia, motivos_cierre) values
    ('apertura-boton', 'Abierta con el botón en caseta', 'acceso',
     'La caseta abrió la pluma con el botón. Si tenía acceso, revisar el TAG (colocación, lectura) o el lector; si no lo tenía, corregir ZK o hablar con la persona. Cada apertura nueva suma una vez a este caso.',
     false, 115, 'acceso',
     array['Se recolocó o se cambió el TAG', 'Se corrigió su acceso en ZK', 'Se habló con la persona', 'Se revisó el lector']),
    ('reporte-caseta', 'Reporte de caseta', 'datos',
     'Lo que la caseta reportó de esta persona o de su vehículo. Leer la nota, cambiarlo al tipo que corresponda si hace falta y atenderlo.',
     false, 990, 'otro',
     array['Atendido', 'No procede']);


-- ---------------------------------------------------------------------
-- 2. LA BITACORA DE LA CASETA Y LA DE CONSULTAS
-- ---------------------------------------------------------------------
create table caseta_reportes (
    id             uuid primary key default gen_random_uuid(),
    clase          text not null,
    puerta         text not null,
    motivo         text not null,
    registro_id    uuid references registros (id) on delete restrict,
    tarjeta        text,
    -- La placa del vehiculo, en mayusculas y sin signos: la del expediente o
    -- ZK si se identifico, la que escribio el portero si no. Con ella se sigue
    -- a un carro que se repite sin expediente.
    placa_norm     text,
    vehiculo_texto text,
    nota           text not null default '',
    -- Lo que la pantalla le decia al portero en ese momento.
    veredicto      text,
    caso_id        uuid references casos (id) on delete set null,
    hecho_por      text not null,
    hecho_por_uid  uuid,
    hecho_en       timestamptz not null default now(),
    -- Cuando TI liga despues una apertura que el portero no identifico.
    ligado_por     text,
    ligado_en      timestamptz,
    constraint caseta_rep_clase     check (clase in ('apertura', 'reporte')),
    constraint caseta_rep_puerta    check (puerta in ('E1-entrada', 'E1-salida', 'E2-entrada', 'E2-salida')),
    constraint caseta_rep_motivo    check (motivo ~ '^[a-z][a-z-]*$'),
    constraint caseta_rep_tarjeta   check (tarjeta is null or tarjeta ~ '^[0-9]{4,12}$'),
    constraint caseta_rep_placa     check (placa_norm is null or placa_norm ~ '^[A-Z0-9]{1,12}$'),
    constraint caseta_rep_vehiculo  check (vehiculo_texto is null or char_length(vehiculo_texto) <= 120),
    constraint caseta_rep_nota      check (char_length(nota) <= 500),
    constraint caseta_rep_veredicto check (veredicto is null or veredicto in ('abre', 'no-abre')),
    constraint caseta_rep_ligado    check ((ligado_por is null) = (ligado_en is null))
);
create index ix_caseta_reportes_en on caseta_reportes (hecho_en desc);
create index ix_caseta_reportes_registro on caseta_reportes (registro_id) where registro_id is not null;
create index ix_caseta_reportes_tarjeta on caseta_reportes (tarjeta) where tarjeta is not null;
create index ix_caseta_reportes_placa on caseta_reportes (placa_norm) where placa_norm is not null;

comment on table caseta_reportes is 'Bloque 97. Aperturas con el boton y reportes de la caseta. hecho_por sale del JWT. PII: liga a un expediente y trae placa.';
comment on column caseta_reportes.veredicto is 'El veredicto que la pantalla mostraba al reportar (null si el vehiculo no se identifico).';

create table caseta_consultas (
    id          bigint generated always as identity primary key,
    hecho_por   text not null,
    hecho_en    timestamptz not null default now(),
    puerta      text not null,
    texto       text not null,
    resultados  int not null,
    constraint caseta_con_texto check (char_length(texto) <= 80)
);
create index ix_caseta_consultas_en on caseta_consultas (hecho_en desc);
comment on table caseta_consultas is 'Bloque 97. Quien busco que desde la caseta. El portero entra sin MFA: esta bitacora es el contrapeso. Solo la leen ti y super.';

alter table caseta_reportes  enable row level security;
alter table caseta_consultas enable row level security;

create policy caseta_reportes_lectura on caseta_reportes for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));
create policy caseta_consultas_lectura on caseta_consultas for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'super'));

revoke all on table caseta_reportes, caseta_consultas from anon, public;
revoke insert, update, delete, truncate, references, trigger on table caseta_reportes, caseta_consultas from authenticated;
grant  select on table caseta_reportes, caseta_consultas to authenticated;
revoke all on sequence caseta_consultas_id_seq from anon, public, authenticated;


-- ---------------------------------------------------------------------
-- 3. FUNCIONES INTERNAS (no se exponen a la API)
-- ---------------------------------------------------------------------
-- 3.1 La guardia de la caseta. `portero` entra sin MFA (decision del 14-oct);
-- ti y super, con MFA, para revisar la pantalla.
create function caseta_exigir_rol() returns text
language plpgsql
stable
set search_path = public
as $exigir$
declare
    v_rol text := coalesce(auth.jwt() -> 'app_metadata' ->> 'rol', '');
begin
    if v_rol = 'portero' then
        return v_rol;
    end if;
    if v_rol in ('ti', 'super') then
        if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
            raise exception 'Se requiere sesión con segundo factor (MFA)';
        end if;
        return v_rol;
    end if;
    raise exception 'Su usuario no tiene permiso para la caseta.';
end;
$exigir$;

-- 3.2 El rotulo de cada motivo. null = el motivo no existe. Las claves son las
-- de lib/caseta.ts (una prueba unitaria las compara con este archivo).
create function caseta_rotulo_motivo(p_clase text, p_motivo text) returns text
language sql
immutable
set search_path = public
as $rotulo$
    select case
        when p_clase = 'apertura' then case p_motivo
            when 'no-leyo'    then 'Tiene acceso y el TAG no se leyó'
            when 'sin-tag'    then 'Viene sin TAG o con el TAG despegado'
            when 'no-aparece' then 'No aparece en SATAG'
            when 'sin-acceso' then 'No tiene acceso y se le abrió'
            when 'visita'     then 'Visita o proveedor'
            when 'emergencia' then 'Emergencia o servicio'
            when 'falla'      then 'Falla de la pluma o del lector'
            when 'otro'       then 'Otro motivo'
            end
        when p_clase = 'reporte' then case p_motivo
            when 'falla'      then 'La pluma o el lector fallan'
            when 'tag-danado' then 'TAG dañado o despegado'
            when 'conducta'   then 'Conducta en el estacionamiento'
            when 'dato'       then 'Un dato está mal (placa, vehículo o nombre)'
            when 'otro'       then 'Otro'
            end
        end
$rotulo$;

-- 3.3 El motivo de una baja, para que el portero se lo explique a quien pregunte.
-- Primero el de Sistemas: el caso que mando el TAG a un departamento de ZK sin
-- niveles (BAJAS y similares), con su tipo y su motivo de cierre. Si no, el
-- motivo de baja del expediente. Si no hay ninguno, null: la pantalla dice que no
-- hay motivo registrado (la mayoria de las bajas viejas de ZK no lo tienen).
create function caseta_motivo_baja(p_tarjeta text, p_registro_id uuid) returns jsonb
language sql
stable
security definer
set search_path = public
as $baja$
    select coalesce(
        (select jsonb_build_object('motivo', t.titulo || coalesce(': ' || nullif(btrim(c.cierre_motivo), ''), ''),
                                   'fecha', coalesce(c.cerrado_en, m.creado_en), 'caso', c.numero)
           from zk_movimientos m
           join zk_departamentos d on d.id = m.depto_destino and cardinality(d.niveles) = 0
           join casos c on c.id = m.caso_id
           join casos_tipos t on t.tipo = c.tipo
          where p_tarjeta is not null and m.tarjeta = p_tarjeta and m.que = 'departamento' and m.estado <> 'cancelado'
          order by m.creado_en desc
          limit 1),
        (select jsonb_build_object('motivo', btrim(r.motivo_baja), 'fecha', r.fecha_baja)
           from registros r
          where r.estado = 'baja' and nullif(btrim(r.motivo_baja), '') is not null
            and (r.id = p_registro_id or (p_tarjeta is not null and r.no_dispositivo = p_tarjeta))
          order by r.fecha_baja desc nulls last
          limit 1))
$baja$;

-- 3.4 El veredicto de un vehiculo en una puerta. DOS COLORES (Gerardo, 14-oct):
-- la antena rechaza un TAG solo si esta dado de baja o si no le corresponde ese
-- estacionamiento, y en los dos casos no se abre. Sin TAG activo en ZK, tampoco.
-- Cada motivo lleva su `clave`: baja, otro-lote, sin-tag o acceso. Si hay
-- cualquiera que no sea `acceso`, el veredicto es no-abre.
create function caseta_evaluar(p_registro_id uuid, p_tarjeta text, p_puerta text) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $evaluar$
declare
    v_lote     text := split_part(p_puerta, '-', 1);
    v_otro     text;
    r          registros%rowtype;
    z          zk_padron%rowtype;
    v_niveles  text[];
    v_tarjeta  text;
    v_puertas  boolean;
    v_motivos  jsonb := '[]'::jsonb;
    v_baja     jsonb;
    v_paso     jsonb;
begin
    if p_registro_id is not null then
        select * into r from registros where id = p_registro_id;
    end if;
    v_tarjeta := coalesce(nullif(btrim(coalesce(p_tarjeta, '')), ''), nullif(btrim(coalesce(r.no_dispositivo, '')), ''));

    -- SATAG
    if r.id is not null and r.estado = 'baja' then
        v_motivos := v_motivos || jsonb_build_object('clave', 'baja', 'texto', 'Su expediente está dado de baja en SATAG.');
    elsif r.id is not null and r.estado = 'bloqueado' then
        v_motivos := v_motivos || jsonb_build_object('clave', 'baja', 'texto', 'Su expediente está bloqueado en SATAG.');
        v_baja := jsonb_build_object('motivo', r.bloqueo_motivo, 'fecha', r.bloqueado_en);
    end if;
    if r.id is not null and v_tarjeta is not null
       and v_tarjeta is distinct from r.no_dispositivo and v_tarjeta is distinct from r.tag_apartado_no then
        v_motivos := v_motivos || jsonb_build_object('clave', 'baja',
            'texto', 'El TAG ' || v_tarjeta || ' se reemplazó por otro: ese ya no abre.');
    end if;

    -- ZK
    if v_tarjeta is null then
        v_motivos := v_motivos || jsonb_build_object('clave', 'sin-tag',
            'texto', case when r.estado = 'pendiente' then 'Aún no tiene TAG instalado: su trámite está pendiente.'
                          else 'No tiene TAG registrado.' end);
    else
        select * into z from zk_padron where tarjeta = v_tarjeta;
        if z.tarjeta is null then
            v_motivos := v_motivos || jsonb_build_object('clave', 'sin-tag',
                'texto', 'Su TAG no está dado de alta en ZK: la pluma no lo reconoce.');
        elsif not z.vigente then
            v_motivos := v_motivos || jsonb_build_object('clave', 'baja', 'texto', 'Su TAG se borró de ZK.');
        else
            select niveles into v_niveles from zk_departamentos where id = z.departamento_id;
            v_niveles := coalesce(v_niveles, '{}');
            -- El «Personal de Apertura» de la puerta, si ya se cargo, manda sobre el departamento.
            v_puertas := z.id_zk <> '' and exists (select 1 from zk_puertas where puerta = p_puerta);
            if (v_puertas and exists (select 1 from zk_puertas where puerta = p_puerta and id_zk = z.id_zk))
               or (not v_puertas and v_lote = any (v_niveles)) then
                v_motivos := v_motivos || jsonb_build_object('clave', 'acceso',
                    'texto', 'Tiene acceso por esta puerta. Si no abrió, el TAG no se leyó.');
            elsif cardinality(v_niveles) = 0 then
                v_motivos := v_motivos || jsonb_build_object('clave', 'baja',
                    'texto', 'Su TAG está dado de baja en ZK («' || z.departamento || '»).');
            else
                select string_agg(x, ' y ' order by x) into v_otro from unnest(v_niveles) x where x <> v_lote;
                v_motivos := v_motivos || jsonb_build_object('clave', 'otro-lote',
                    'texto', case when v_otro is not null then 'Le corresponde el ' || v_otro || ', no el ' || v_lote || ': que entre por su estacionamiento.'
                                  else 'No tiene acceso por esta puerta.' end);
            end if;
        end if;

        select jsonb_build_object('en', to_char(e.ocurrio_en, 'YYYY-MM-DD"T"HH24:MI:SS'),
                                  'puerta', e.lote || '-' || e.sentido, 'concedido', e.concedido)
          into v_paso
          from zk_eventos e
         where e.tarjeta = v_tarjeta and not e.repeticion
         order by e.ocurrio_en desc
         limit 1;
    end if;

    -- Si es una baja, su motivo (el del bloqueo ya se puso arriba).
    if v_baja is null and exists (select 1 from jsonb_array_elements(v_motivos) m where m ->> 'clave' = 'baja') then
        v_baja := caseta_motivo_baja(v_tarjeta, r.id);
        if v_baja is null then
            v_baja := jsonb_build_object('motivo', null, 'fecha', null);
        end if;
    end if;

    -- Cada motivo con su color, para la pantalla.
    select coalesce(jsonb_agg(m || jsonb_build_object('veredicto', case when m ->> 'clave' = 'acceso' then 'abre' else 'no-abre' end)), '[]'::jsonb)
      into v_motivos
      from jsonb_array_elements(v_motivos) m;

    return jsonb_build_object(
        'veredicto', case when exists (select 1 from jsonb_array_elements(v_motivos) m where m ->> 'clave' <> 'acceso')
                          then 'no-abre' else 'abre' end,
        'motivos', v_motivos,
        'baja', v_baja,
        'tarjeta', v_tarjeta,
        'departamentoZk', nullif(z.departamento, ''),
        'placaZk', nullif(btrim(coalesce(z.placa, '')), ''),
        'nombreZk', nullif(btrim(coalesce(z.nombre, '')), ''),
        'ultimoPaso', v_paso);
end;
$evaluar$;

-- 3.5 El caso de un reporte ya ligado a un expediente o a un TAG: suma una vez
-- al caso vivo del mismo tipo o abre uno en «Nuevo». Lo usan caseta_reportar y
-- ligar_reporte_caseta. Devuelve el numero del caso.
create function caseta_caso_de_reporte(p_reporte uuid, p_hecho_por text, p_prefijo text default '') returns jsonb
language plpgsql
security definer
set search_path = public
as $caso$
declare
    cr        caseta_reportes%rowtype;
    v_tipo    text;
    v_rotulo  text;
    v_titulo  text;
    v_linea   text;
    v_urgente boolean;
    v_caso    uuid;
    v_numero  bigint;
    v_nuevo   boolean := false;
begin
    select * into cr from caseta_reportes where id = p_reporte;
    if cr.id is null or (cr.registro_id is null and cr.tarjeta is null) then
        return jsonb_build_object('caso', null, 'casoNuevo', false);
    end if;

    v_tipo := case cr.clase when 'apertura' then 'apertura-boton' else 'reporte-caseta' end;
    v_rotulo := caseta_rotulo_motivo(cr.clase, cr.motivo);
    v_titulo := case cr.clase when 'apertura' then 'Abierta con el botón en ' || replace(cr.puerta, '-', ' ') || ': ' || v_rotulo
                              else 'Caseta: ' || v_rotulo end;
    -- Una apertura ligada despues no tiene veredicto (null): no es urgente.
    v_urgente := cr.clase = 'apertura' and coalesce(cr.veredicto = 'no-abre', false);
    v_linea := concat_ws('. ', nullif(p_prefijo, ''), v_titulo, nullif(cr.nota, ''),
                         case when v_urgente then 'La pantalla decía que no tenía acceso' end);

    select id, numero into v_caso, v_numero
      from casos
     where tipo = v_tipo
       and estado not in ('resuelto', 'descartado')
       and ((cr.registro_id is not null and registro_id = cr.registro_id)
            or (cr.registro_id is null and registro_id is null and tarjeta = cr.tarjeta))
     order by creado_en desc
     limit 1
     for update;

    if v_caso is not null then
        update casos
           set veces          = veces + 1,
               ultima_vez     = greatest(coalesce(ultima_vez, cr.hecho_en), cr.hecho_en),
               actualizado_en = now(),
               urgente        = urgente or v_urgente
         where id = v_caso;
        insert into casos_notas (caso_id, clase, nota, hecho_por)
        values (v_caso, 'nota', left(v_linea, 4000), p_hecho_por);
    else
        insert into casos (tipo, registro_id, tarjeta, titulo, detalle, evidencia, estado, origen,
                           creado_por, urgente, ultima_vez)
        values (v_tipo, cr.registro_id,
                coalesce(cr.tarjeta, (select nullif(btrim(no_dispositivo), '') from registros where id = cr.registro_id)),
                left(v_titulo, 200), cr.nota,
                jsonb_build_object('caseta', jsonb_build_object('puerta', cr.puerta, 'motivo', cr.motivo,
                                                                'veredicto', cr.veredicto, 'reporte', cr.id)),
                'nuevo', 'manual', p_hecho_por, v_urgente, cr.hecho_en)
        returning id, numero into v_caso, v_numero;
        insert into casos_notas (caso_id, clase, estado_despues, nota, hecho_por)
        values (v_caso, 'apertura', 'nuevo', left(v_linea, 4000), p_hecho_por);
        v_nuevo := true;
    end if;

    update caseta_reportes set caso_id = v_caso where id = cr.id;
    return jsonb_build_object('caso', v_numero, 'casoNuevo', v_nuevo);
end;
$caso$;


-- ---------------------------------------------------------------------
-- 4. LOS RPC
-- ---------------------------------------------------------------------
-- 4.1 Buscar un vehiculo: placa, modelo, nombre o TAG. La busqueda la hace la
-- base y devuelve como mucho 8: el padron nunca baja completo a la caseta.
-- La caseta cubre un estacionamiento completo (entrada y salida) o los dos
-- (Gerardo, 14-oct): `p_lotes` son los que cubre, y el veredicto sale para
-- cada uno, medido en su entrada.
create function caseta_buscar(p_texto text, p_lotes text[]) returns jsonb
language plpgsql
security definer
set search_path = public
as $buscar$
declare
    v_q        text := zk_texto_comparable(left(coalesce(p_texto, ''), 80));
    v_palabras text[];
    v_compacto text;
    v_res      jsonb;
    v_n        int;
begin
    perform caseta_exigir_rol();
    if p_lotes is null or cardinality(p_lotes) = 0 or not (p_lotes <@ array['E1', 'E2']) then
        raise exception 'Elija qué estacionamiento cubre la caseta.';
    end if;
    v_q := btrim(regexp_replace(v_q, '[^A-Z0-9 ]', ' ', 'g'));
    v_q := regexp_replace(v_q, '\s+', ' ', 'g');
    if char_length(replace(v_q, ' ', '')) < 3 then
        raise exception 'Escriba al menos 3 letras o números.';
    end if;
    v_palabras := regexp_split_to_array(v_q, ' ');
    v_compacto := replace(v_q, ' ', '');

    with por_registro as (
        select r.id as registro_id, r.no_dispositivo as tarjeta,
               (r.no_dispositivo = v_compacto or regexp_replace(upper(coalesce(r.placas, '')), '[^A-Z0-9]', '', 'g') = v_compacto) as exacto
          from registros r
         where (select bool_and(zk_texto_comparable(concat_ws(' ', r.usuario_nombre_completo, r.placas, r.marca, r.modelo,
                                                              r.color, r.no_dispositivo, r.tag_apartado_no)) like '%' || w || '%')
                  from unnest(v_palabras) w)
            or regexp_replace(upper(coalesce(r.placas, '')), '[^A-Z0-9]', '', 'g') like '%' || v_compacto || '%'
    ),
    -- Un TAG que ya se cambio: se busca por el numero que el portero lee en el parabrisas.
    por_tag_anterior as (
        select distinct m.registro_id, v_compacto as tarjeta, true as exacto
          from movimientos m
         where v_compacto ~ '^[0-9]{6,12}$' and m.no_dispositivo_anterior = v_compacto
    ),
    por_zk as (
        select (select r.id from registros r where r.no_dispositivo = z.tarjeta
                 order by (r.estado = 'baja'), r.created_at desc limit 1) as registro_id,
               z.tarjeta,
               (z.tarjeta = v_compacto or regexp_replace(upper(coalesce(z.placa, '')), '[^A-Z0-9]', '', 'g') = v_compacto) as exacto
          from zk_padron z
         where (select bool_and(zk_texto_comparable(concat_ws(' ', z.nombre, z.placa, z.tarjeta)) like '%' || w || '%')
                  from unnest(v_palabras) w)
            or regexp_replace(upper(coalesce(z.placa, '')), '[^A-Z0-9]', '', 'g') like '%' || v_compacto || '%'
    ),
    todos as (
        select * from por_registro union all select * from por_tag_anterior union all select * from por_zk
    ),
    -- Uno por TAG (o por expediente si no tiene TAG): gana el expediente vivo.
    unicos as (
        select distinct on (coalesce(t.tarjeta, t.registro_id::text))
               t.registro_id, t.tarjeta,
               bool_or(t.exacto) over (partition by coalesce(t.tarjeta, t.registro_id::text)) as exacto,
               r.estado, coalesce(r.usuario_nombre_completo, z.nombre, '') as nombre
          from todos t
          left join registros r on r.id = t.registro_id
          left join zk_padron z on z.tarjeta = t.tarjeta
         order by coalesce(t.tarjeta, t.registro_id::text),
                  (r.estado is null), (r.estado = 'baja'), r.created_at desc
    ),
    elegidos as (
        select * from unicos
         order by exacto desc, (estado = 'activo') desc nulls last, nombre
         limit 8
    )
    select coalesce(jsonb_agg(jsonb_build_object(
               'registroId', e.registro_id,
               'nombre', nullif(e.nombre, ''),
               'tipo', r.tipo_usuario,
               'estado', r.estado,
               'marca', r.marca, 'modelo', r.modelo, 'color', r.color,
               'placa', r.placas,
               'plumas', coalesce((select array_agg(x.estacionamiento_clave order by x.estacionamiento_clave)
                                     from registro_estacionamientos x where x.registro_id = e.registro_id), '{}'),
               -- Contexto (Gerardo, 14-oct): sus ultimas lecturas en la pluma, las que
               -- abrieron y las que rechazo, para armar sus ultimas estancias. Llegan
               -- hasta el ultimo archivo de ZK que subio Sistemas: no es tiempo real.
               'pasos', coalesce((select jsonb_agg(p order by p.en)
                                    from (select to_char(ev.ocurrio_en, 'YYYY-MM-DD"T"HH24:MI:SS') as en, ev.lote, ev.sentido, ev.concedido
                                            from zk_eventos ev
                                           where e.tarjeta is not null and ev.tarjeta = e.tarjeta and not ev.repeticion
                                           order by ev.ocurrio_en desc
                                           limit 16) p), '[]'::jsonb),
               'evaluaciones', (select jsonb_object_agg(l, caseta_evaluar(e.registro_id, e.tarjeta, l || '-entrada'))
                                  from unnest(p_lotes) l))
             order by e.exacto desc, (e.estado = 'activo') desc nulls last, e.nombre), '[]'::jsonb),
           count(*)
      into v_res, v_n
      from elegidos e
      left join registros r on r.id = e.registro_id;

    insert into caseta_consultas (hecho_por, puerta, texto, resultados)
    values (coalesce(auth.jwt() ->> 'email', '(sin correo)'), array_to_string(p_lotes, '+'), left(btrim(coalesce(p_texto, '')), 80), v_n);

    return v_res;
end;
$buscar$;

-- 4.2 Lo que la caseta ve al abrir (Gerardo, 14-oct): los CAMBIOS DE SISTEMAS que
-- le importan a la pluma, el SEGUIMIENTO de sus reportes y que tan frescos son los
-- datos de ZK. Que no se sature: 30 dias, 80 cambios, 40 reportes.
--
-- Cambios de Sistemas:
--   - baja: un TAG que Sistemas mando a un departamento de ZK sin niveles (ya hecho
--     en ZK) o cuyo expediente se dio de baja. Solo de quien paso por la pluma en
--     los ultimos 30 dias de la bitacora (contados desde el ultimo evento cargado:
--     la carga es semanal): una baja de alguien que ya no viene no le sirve.
--   - acceso: un TAG que Sistemas movio a un departamento con niveles (ya hecho en
--     ZK): ahora entra por esos estacionamientos.
--   - instalado: un TAG nuevo instalado por TI.
-- Cada cambio trae sus estacionamientos; el cliente filtra por los de la caseta.
--
-- Seguimiento: los reportes de quien esta en sesion (o de toda la caseta con
-- p_todos), con el paso en que va su caso y, si se cerro, el motivo de cierre (de
-- la lista del tipo: nunca la nota libre de Sistemas).
create function caseta_inicio(p_todos boolean default false) returns jsonb
language plpgsql
security definer
set search_path = public
as $inicio$
declare
    v_quien    text := auth.jwt() ->> 'email';
    v_desde    timestamp := (select max(ocurrio_en) from zk_eventos) - interval '30 days';
    v_cambios  jsonb;
    v_reportes jsonb;
begin
    perform caseta_exigir_rol();

    with movs as (
        select m.tarjeta, coalesce(m.verificado_en, m.actualizado_en) as en,
               case when cardinality(d.niveles) = 0 then 'baja' else 'acceso' end as clase,
               d.niveles, c.id as caso_id
          from zk_movimientos m
          join zk_departamentos d on d.id = m.depto_destino
          join casos c on c.id = m.caso_id
         where m.que = 'departamento' and m.estado in ('hecho', 'verificado')
           and coalesce(m.verificado_en, m.actualizado_en) > now() - interval '30 days'
    ),
    todos as (
        select tarjeta, en, clase, niveles from movs
        union all
        select r.no_dispositivo, r.fecha_baja::timestamptz, 'baja', '{}'::text[]
          from registros r
         where r.estado = 'baja' and r.no_dispositivo is not null
           and r.fecha_baja > (now() at time zone 'America/Mexico_City')::date - 30
        union all
        select r.no_dispositivo, coalesce(r.instalado_en, r.fecha_instalacion::timestamptz), 'instalado',
               coalesce((select array_agg(x.estacionamiento_clave order by x.estacionamiento_clave)
                           from registro_estacionamientos x where x.registro_id = r.id), '{}')
          from registros r
         where r.estado = 'activo' and r.no_dispositivo is not null
           and coalesce(r.instalado_en, r.fecha_instalacion::timestamptz) > now() - interval '30 days'
    ),
    -- El ultimo cambio de cada TAG; las bajas, solo de quien sigue viniendo.
    unicos as (
        select distinct on (t.tarjeta) t.*
          from todos t
         where t.clase <> 'baja'
            or (v_desde is not null
                and exists (select 1 from zk_eventos e where e.tarjeta = t.tarjeta and e.ocurrio_en >= v_desde))
         order by t.tarjeta, t.en desc
    )
    select coalesce(jsonb_agg(x order by x.en desc), '[]'::jsonb)
      into v_cambios
      from (
        select u.clase, u.tarjeta, u.en,
               coalesce(r.usuario_nombre_completo, nullif(z.nombre, '')) as nombre,
               r.marca, r.modelo, r.color,
               coalesce(r.placas, nullif(btrim(coalesce(z.placa, '')), '')) as placa,
               case when u.clase = 'baja' then caseta_motivo_baja(u.tarjeta, r.id) ->> 'motivo' end as motivo,
               case when u.clase = 'baja'
                    then coalesce((select array_agg(distinct e.lote order by e.lote) from zk_eventos e
                                    where e.tarjeta = u.tarjeta and e.ocurrio_en >= v_desde), '{}')
                    else u.niveles end as lotes
          from unicos u
          left join lateral (select * from registros r where r.no_dispositivo = u.tarjeta
                              order by (r.estado = 'activo') desc, r.created_at desc limit 1) r on true
          left join zk_padron z on z.tarjeta = u.tarjeta
         order by u.en desc
         limit 80
      ) x;

    select coalesce(jsonb_agg(m order by m.en desc), '[]'::jsonb)
      into v_reportes
      from (
        select cr.hecho_en as en, cr.clase, cr.puerta, cr.motivo, cr.veredicto,
               coalesce(r.usuario_nombre_completo, cr.placa_norm, cr.vehiculo_texto) as quien,
               cr.hecho_por = v_quien as mio,
               cr.ligado_en is not null as ligado,
               c.numero as caso, c.estado as "estadoCaso", c.cierre_motivo as "cierreMotivo", c.cerrado_en as "cerradoEn"
          from caseta_reportes cr
          left join registros r on r.id = cr.registro_id
          left join casos c on c.id = cr.caso_id
         where (cr.hecho_por = v_quien or coalesce(p_todos, false))
           and cr.hecho_en > now() - interval '30 days'
         order by cr.hecho_en desc
         limit 40
      ) m;

    return jsonb_build_object(
        'cambios', v_cambios,
        'reportes', v_reportes,
        'padronZkAl', (select max(cargado_en) from zk_padron_cargas),
        -- Hasta donde llegan las lecturas de la pluma (hora de pared de ZK).
        'eventosHasta', (select to_char(max(ocurrio_en), 'YYYY-MM-DD"T"HH24:MI:SS') from zk_eventos),
        'puertasZkAl', (select max(cargado_en) from zk_puertas_cargas));
end;
$inicio$;

-- 4.3 Reportar: una apertura con el boton o algo para Sistemas. Quien reporta
-- es el correo de la sesion. Si el vehiculo se identifico, abre (o suma una vez
-- a) su caso; si no, queda en la bitacora con la placa escrita.
create function caseta_reportar(
    p_clase       text,
    p_puerta      text,
    p_motivo      text,
    p_registro_id uuid default null,
    p_tarjeta     text default null,
    p_placa       text default null,
    p_vehiculo    text default null,
    p_nota        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $reportar$
declare
    v_quien    text := auth.jwt() ->> 'email';
    v_tarjeta  text := nullif(btrim(coalesce(p_tarjeta, '')), '');
    v_placa    text := nullif(regexp_replace(upper(coalesce(p_placa, '')), '[^A-Z0-9]', '', 'g'), '');
    v_vehiculo text := nullif(btrim(coalesce(p_vehiculo, '')), '');
    v_nota     text := btrim(coalesce(p_nota, ''));
    v_eval     jsonb;
    v_ver      text;
    v_rep      uuid;
    v_caso     jsonb;
begin
    perform caseta_exigir_rol();
    if v_quien is null or btrim(v_quien) = '' then
        raise exception 'Su sesión no trae correo. Cierre sesión y vuelva a entrar.';
    end if;
    if p_clase is null or p_clase not in ('apertura', 'reporte') then
        raise exception 'El tipo de reporte no es válido.';
    end if;
    if p_puerta is null or p_puerta not in ('E1-entrada', 'E1-salida', 'E2-entrada', 'E2-salida') then
        raise exception 'Elija en qué puerta está.';
    end if;
    if caseta_rotulo_motivo(p_clase, p_motivo) is null then
        raise exception 'Elija el motivo.';
    end if;
    if p_motivo in ('otro', 'sin-acceso') and char_length(v_nota) < 3 then
        raise exception 'Escriba en pocas palabras por qué.';
    end if;
    if char_length(v_nota) > 500 then
        raise exception 'La nota es demasiado larga: use menos de 500 caracteres.';
    end if;
    if char_length(coalesce(v_vehiculo, '')) > 120 then
        raise exception 'La descripción del vehículo es demasiado larga.';
    end if;
    if char_length(coalesce(v_placa, '')) > 12 then
        raise exception 'La placa es demasiado larga.';
    end if;
    if v_tarjeta is not null and v_tarjeta !~ '^[0-9]{4,12}$' then
        raise exception 'El número de TAG solo lleva dígitos.';
    end if;
    if p_registro_id is not null and not exists (select 1 from registros where id = p_registro_id) then
        raise exception 'Ese expediente no existe. Vuelva a buscar el vehículo.';
    end if;
    -- Sin vehiculo identificado, la apertura exige la placa (o, sin placas, como es
    -- el vehiculo): sin ella no se puede seguir al carro. Falla y emergencia, no.
    if p_registro_id is null and v_tarjeta is null and p_clase = 'apertura'
       and p_motivo not in ('falla', 'emergencia')
       and char_length(coalesce(v_placa, '')) < 3 and char_length(coalesce(v_vehiculo, '')) < 5 then
        raise exception 'Escriba la placa del vehículo o, si no tiene placas, cómo es.';
    end if;
    if p_registro_id is null and v_tarjeta is null and p_clase = 'reporte' and char_length(v_nota) < 3 then
        raise exception 'Escriba en pocas palabras qué pasó.';
    end if;

    if p_registro_id is not null or v_tarjeta is not null then
        v_eval := caseta_evaluar(p_registro_id, v_tarjeta, p_puerta);
        v_ver := v_eval ->> 'veredicto';
        v_tarjeta := v_eval ->> 'tarjeta';
        v_placa := coalesce(v_placa,
            nullif(regexp_replace(upper(coalesce(
                (select placas from registros where id = p_registro_id), v_eval ->> 'placaZk', '')), '[^A-Z0-9]', '', 'g'), ''));
    end if;

    insert into caseta_reportes (clase, puerta, motivo, registro_id, tarjeta, placa_norm, vehiculo_texto, nota,
                                 veredicto, hecho_por, hecho_por_uid)
    values (p_clase, p_puerta, p_motivo, p_registro_id, v_tarjeta, left(v_placa, 12), v_vehiculo, v_nota,
            v_ver, v_quien, auth.uid())
    returning id into v_rep;

    v_caso := caseta_caso_de_reporte(v_rep, v_quien);

    return jsonb_build_object('id', v_rep, 'caso', v_caso -> 'caso', 'casoNuevo', v_caso -> 'casoNuevo',
                              'veredicto', v_ver);
end;
$reportar$;

-- 4.4 Ligar a un expediente una apertura que el portero no identifico. Solo TI.
-- Desde ahi cuenta en su vehiculo y en su caso.
create function ligar_reporte_caseta(
    p_reporte     uuid,
    p_registro_id uuid,
    p_hecho_por   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $ligar$
declare
    v_quien   text;
    cr        caseta_reportes%rowtype;
    v_tarjeta text;
    v_placa   text;
begin
    perform panel_exigir_rol(array['ti']);
    select * into cr from caseta_reportes where id = p_reporte for update;
    if cr.id is null then
        raise exception 'Ese reporte no existe. Vuelva a abrir la pantalla.';
    end if;
    if cr.registro_id is not null or cr.tarjeta is not null then
        raise exception 'Ese reporte ya está ligado a un vehículo.';
    end if;
    select nullif(btrim(no_dispositivo), ''),
           nullif(regexp_replace(upper(coalesce(placas, '')), '[^A-Z0-9]', '', 'g'), '')
      into v_tarjeta, v_placa
      from registros where id = p_registro_id;
    if not found then
        raise exception 'Ese expediente no existe. Vuelva a buscar a la persona.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    update caseta_reportes
       set registro_id = p_registro_id,
           tarjeta     = v_tarjeta,
           placa_norm  = coalesce(placa_norm, left(v_placa, 12)),
           ligado_por  = v_quien,
           ligado_en   = now()
     where id = cr.id;

    return caseta_caso_de_reporte(cr.id, v_quien,
        'Ligada por Sistemas: apertura del ' || to_char(cr.hecho_en at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI')
        || ', reportada por ' || cr.hecho_por);
end;
$ligar$;


-- Permisos. Las internas, para nadie; los RPC, para authenticated (la guardia
-- decide el rol). El proyecto da EXECUTE por omision: se revoca explicito.
revoke all on function caseta_exigir_rol()                       from public, anon, authenticated;
revoke all on function caseta_rotulo_motivo(text, text)          from public, anon, authenticated;
revoke all on function caseta_motivo_baja(text, uuid)            from public, anon, authenticated;
revoke all on function caseta_evaluar(uuid, text, text)          from public, anon, authenticated;
revoke all on function caseta_caso_de_reporte(uuid, text, text)  from public, anon, authenticated;
revoke all on function caseta_buscar(text, text[])                 from public, anon;
revoke all on function caseta_inicio(boolean)                           from public, anon;
revoke all on function caseta_reportar(text, text, text, uuid, text, text, text, text) from public, anon;
revoke all on function ligar_reporte_caseta(uuid, uuid, text)    from public, anon;
grant execute on function caseta_buscar(text, text[])              to authenticated;
grant execute on function caseta_inicio(boolean)                        to authenticated;
grant execute on function caseta_reportar(text, text, text, uuid, text, text, text, text) to authenticated;
grant execute on function ligar_reporte_caseta(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 5. VERIFICACION (solo lectura): todas las filas con ok = true
-- ---------------------------------------------------------------------
select 1 as orden, 'existen los tipos apertura-boton y reporte-caseta' as que,
       (select count(*) from casos_tipos where tipo in ('apertura-boton', 'reporte-caseta') and activo) = 2 as ok
union all
select 2, 'caseta_reportes (con placa_norm y ligado_*) y caseta_consultas, con RLS',
       (select bool_and(relrowsecurity) from pg_class
         where oid in ('public.caseta_reportes'::regclass, 'public.caseta_consultas'::regclass))
       and (select count(*) from information_schema.columns
             where table_schema = 'public' and table_name = 'caseta_reportes'
               and column_name in ('placa_norm', 'ligado_por', 'ligado_en')) = 3
union all
select 3, 'anon no lee y authenticated no escribe la bitacora de la caseta',
       not has_table_privilege('anon', 'public.caseta_reportes', 'select')
       and not has_table_privilege('anon', 'public.caseta_consultas', 'select')
       and not has_table_privilege('authenticated', 'public.caseta_reportes', 'insert')
       and not has_table_privilege('authenticated', 'public.caseta_reportes', 'update')
       and not has_table_privilege('authenticated', 'public.caseta_consultas', 'insert')
union all
select 4, 'una sola forma de cada funcion de la caseta',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('caseta_exigir_rol', 'caseta_rotulo_motivo', 'caseta_motivo_baja', 'caseta_evaluar',
                             'caseta_caso_de_reporte', 'caseta_buscar', 'caseta_inicio', 'caseta_reportar',
                             'ligar_reporte_caseta')) = 9
       and (select bool_and(p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname in ('caseta_motivo_baja', 'caseta_evaluar', 'caseta_caso_de_reporte', 'caseta_buscar',
                                 'caseta_inicio', 'caseta_reportar', 'ligar_reporte_caseta'))
union all
select 5, 'anon no ejecuta ningun RPC de la caseta',
       not has_function_privilege('anon', 'public.caseta_buscar(text, text[])', 'execute')
       and not has_function_privilege('anon', 'public.caseta_inicio(boolean)', 'execute')
       and not has_function_privilege('anon', 'public.caseta_reportar(text, text, text, uuid, text, text, text, text)', 'execute')
       and not has_function_privilege('anon', 'public.ligar_reporte_caseta(uuid, uuid, text)', 'execute')
union all
select 6, 'las funciones internas no se exponen a la API',
       not has_function_privilege('authenticated', 'public.caseta_exigir_rol()', 'execute')
       and not has_function_privilege('authenticated', 'public.caseta_rotulo_motivo(text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.caseta_motivo_baja(text, uuid)', 'execute')
       and not has_function_privilege('authenticated', 'public.caseta_evaluar(uuid, text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.caseta_caso_de_reporte(uuid, text, text)', 'execute')
union all
select 7, 'authenticated ejecuta los RPC de la caseta',
       has_function_privilege('authenticated', 'public.caseta_buscar(text, text[])', 'execute')
       and has_function_privilege('authenticated', 'public.caseta_inicio(boolean)', 'execute')
       and has_function_privilege('authenticated', 'public.caseta_reportar(text, text, text, uuid, text, text, text, text)', 'execute')
       and has_function_privilege('authenticated', 'public.ligar_reporte_caseta(uuid, uuid, text)', 'execute')
union all
select 8, 'ninguna politica de tabla nombra a portero (no lee tablas)',
       not exists (select 1 from pg_policies where schemaname = 'public'
                    and (coalesce(qual, '') like '%portero%' or coalesce(with_check, '') like '%portero%'))
union all
select 9, 'ningun mensaje de la caseta tutea',
       not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and (p.proname like '%caseta%')
                      and p.prosrc ~* '\m(tu|tus|elige|escribe|vuelve|abre con|pidele|llama)\M')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Borra lo que agrego este bloque. Los casos que abrio la
-- caseta se borran con sus notas (on delete cascade): exportarlos antes si se
-- quieren conservar.
-- ---------------------------------------------------------------------
--   begin;
--   drop function if exists ligar_reporte_caseta(uuid, uuid, text);
--   drop function if exists caseta_reportar(text, text, text, uuid, text, text, text, text);
--   drop function if exists caseta_inicio(boolean);
--   drop function if exists caseta_buscar(text, text[]);
--   drop function if exists caseta_caso_de_reporte(uuid, text, text);
--   drop function if exists caseta_evaluar(uuid, text, text);
--   drop function if exists caseta_motivo_baja(text, uuid);
--   drop function if exists caseta_rotulo_motivo(text, text);
--   drop function if exists caseta_exigir_rol();
--   drop table if exists caseta_consultas;
--   drop table if exists caseta_reportes;
--   delete from casos where tipo in ('apertura-boton', 'reporte-caseta');
--   delete from casos_tipos where tipo in ('apertura-boton', 'reporte-caseta');
--   commit;
--   notify pgrst, 'reload schema';
--
-- Y las cuentas de los porteros vuelven a no tener rol:
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'rol'
--    where raw_app_meta_data ->> 'rol' = 'portero';
