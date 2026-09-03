-- Keep the legacy Turno bridge state consistent when a legacy operational
-- session closes, and repair the one historically inconsistent closed Turno.

create or replace function public.cerrar_sesion_operativa(p_sesion_id uuid,p_idempotency_key uuid default null,p_observacion text default null)
returns jsonb language plpgsql security definer set search_path to 'public','private','pg_temp' as $function$
declare uid uuid:=auth.uid(); v_sesion record; turno_id uuid; cuadre_id uuid; entrega_id uuid;
begin
 if uid is null then raise exception 'No hay sesión activa.' using errcode='42501'; end if;
 if p_idempotency_key is null then raise exception 'Se requiere idempotency_key'; end if;
 select sc.*,c.almacen_id into v_sesion from public.sesiones_ciclo sc join public.ciclos_operativos c on c.id=sc.ciclo_id where sc.id=p_sesion_id for update;
 if not found then raise exception 'Sesión operativa no encontrada.' using errcode='23503'; end if;
 if v_sesion.estado<>'EN_CURSO' then raise exception 'La sesión no está en curso.' using errcode='P0001'; end if;
 if v_sesion.usuario_id<>uid and not public.tiene_permiso('ciclos','editar_any') then raise exception 'No podés cerrar una sesión que no es tuya.' using errcode='42501'; end if;
 select e.id into entrega_id from public.entregas_caja e where e.sesion_id=p_sesion_id and e.estado='DECLARADA' limit 1;
 if entrega_id is null then raise exception 'Antes de cerrar la sesión debés declarar el dinero entregado.' using errcode='23514'; end if;
 select t.id into turno_id from public.turnos t where t.sesion_id=p_sesion_id and t.estado='ABIERTO' limit 1;
 if turno_id is null then raise exception 'La sesión no tiene un turno abierto asociado.' using errcode='P0001'; end if;
 update public.turnos set estado='CERRADO',estado_maestro=case when estado_maestro='EN_CURSO' then 'CERRADO' else estado_maestro end,cierre_real=now(),observacion=coalesce(p_observacion,observacion),actualizado_en=now() where id=turno_id;
 insert into public.cuadres(turno_id,dinero_esperado,estado) values(turno_id,public.calcular_dinero_esperado_turno(turno_id),'PENDIENTE') returning id into cuadre_id;
 update public.sesiones_ciclo set estado='COMPLETADA',cierre_real=now(),observacion=coalesce(p_observacion,observacion) where id=p_sesion_id;
 update private.operaciones_idempotencia set resultado_id=p_sesion_id where idempotency_key=p_idempotency_key;
 perform public.registrar_auditoria('sesion_operativa','Sesión cerrada después de declarar entrega de caja','exito',p_sesion_id::text,p_idempotency_key,jsonb_build_object('entrega_id',entrega_id,'turno_id',turno_id,'cuadre_id',cuadre_id));
 return jsonb_build_object('id',p_sesion_id,'estado','COMPLETADA','turno_legacy_id',turno_id,'cuadre_id',cuadre_id,'entrega_caja_id',entrega_id);
end;$function$;

update public.turnos t
set estado_maestro='CERRADO', actualizado_en=now()
where t.estado='CERRADO'
  and t.estado_maestro='EN_CURSO'
  and t.ciclo_id is not null
  and t.sesion_id is not null
  and not exists (select 1 from public.turno_sesiones ts where ts.turno_id=t.id and ts.estado not in ('COMPLETADA','CANCELADA'))
  and not exists (select 1 from public.turno_tramos tr where tr.turno_id=t.id and tr.estado='ACTIVO');
