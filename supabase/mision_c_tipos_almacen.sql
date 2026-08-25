-- BattleCruiser — Misión C
-- Clasificación operativa de almacenes.

begin;

alter table public.almacenes drop constraint if exists almacenes_tipo_check;

update public.almacenes
set tipo = case
  when lower(coalesce(tipo,'')) in ('mayorista','wholesale') then 'mayorista'
  when lower(coalesce(tipo,'')) in ('minorista','venta','retail') then 'minorista'
  else 'almacenamiento'
end;

alter table public.almacenes
  add constraint almacenes_tipo_check
  check (tipo in ('almacenamiento','minorista','mayorista'));

alter table public.almacenes
  alter column tipo set default 'almacenamiento';

comment on column public.almacenes.tipo is 'Clasificación operativa: almacenamiento, minorista o mayorista.';

commit;
