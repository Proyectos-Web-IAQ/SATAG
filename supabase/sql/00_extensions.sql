-- =====================================================================
-- 00_extensions.sql
-- Extensiones requeridas por SATAG.
-- =====================================================================

-- pgcrypto:
-- - gen_random_uuid() para llaves primarias UUID.
-- - digest() para hash SHA-256 de evidencias de firma.
-- En Supabase pgcrypto vive en el schema `extensions` (no en public). Por eso
-- las funciones que usan digest() deben incluir `extensions` en su search_path
-- (ver crear_registro: set search_path = public, extensions).
create extension if not exists pgcrypto;

