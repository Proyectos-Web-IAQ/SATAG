-- =====================================================================
-- 06_grants_catalogos.sql
-- Permisos SQL base para catalogos sin PII.
-- =====================================================================

grant usage on schema public to anon, authenticated;

grant select on
    estacionamientos,
    cat_marcas,
    cat_modelos,
    cat_colores
to anon, authenticated;

grant select, insert, update, delete on
    estacionamientos,
    cat_marcas,
    cat_modelos,
    cat_colores
to authenticated;

-- Nota de auditoria:
-- RLS sigue siendo la barrera principal. Estos grants solo habilitan que las
-- politicas puedan evaluarse para los roles anon/authenticated de Supabase.

