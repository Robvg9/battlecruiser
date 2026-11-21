\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('app.test_permissions','auditoria:crear',false);
select set_config('app.test_admin','false',false);

-- Retail/minorista warehouses are rejected server-side.
do $$
declare v_rejected boolean := false;
begin
  begin perform public.inventario_auditoria_iniciar('00000000-0000-0000-0000-000000000102');
  exception when others then
    v_rejected := position('solo está disponible para almacenes de almacenamiento' in lower(sqlerrm)) > 0;
  end;
  perform public.test_assert(v_rejected,'physical audit must reject retail warehouses');
end $$;

-- Start a storage count and verify snapshot, zero stock, mixed variants and active pointer.
do $$
declare v_audit uuid; v_total integer; v_zero integer;
begin
  v_audit := public.inventario_auditoria_iniciar('00000000-0000-0000-0000-000000000101');
  perform set_config('app.test_audit_id',v_audit::text,false);
  select count(*) into v_total from public.inventario_auditoria_lineas where auditoria_id=v_audit;
  select count(*) into v_zero from public.inventario_auditoria_lineas where auditoria_id=v_audit and cantidad_sistema=0;
  perform public.test_assert(v_total=3,'snapshot includes normal products and active variants, excludes mixed parents and archived products');
  perform public.test_assert(v_zero=2,'products without stock rows are snapshotted as zero');
  perform set_config('app.test_line_product_1',(select id::text from public.inventario_auditoria_lineas where auditoria_id=v_audit and producto_id='00000000-0000-0000-0000-000000000201'),false);
  perform set_config('app.test_line_product_2',(select id::text from public.inventario_auditoria_lineas where auditoria_id=v_audit and producto_id='00000000-0000-0000-0000-000000000202'),false);
  perform set_config('app.test_line_variant',(select id::text from public.inventario_auditoria_lineas where auditoria_id=v_audit and producto_id='00000000-0000-0000-0000-000000000204'),false);
  perform public.test_assert((select auditoria_inventario_activa_id=v_audit from public.almacenes where id='00000000-0000-0000-0000-000000000101'),'start sets active warehouse pointer');
end $$;

-- Stock INSERT, UPDATE and DELETE are blocked while count remains open.
do $$
declare v_blocked boolean;
begin
  v_blocked:=false;
  begin insert into public.stock(producto_id,almacen_id,cantidad) values
    ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000101',4);
  exception when sqlstate '55006' then v_blocked:=true; end;
  perform public.test_assert(v_blocked,'stock INSERT blocked during count');

  v_blocked:=false;
  begin update public.stock set cantidad=99 where producto_id='00000000-0000-0000-0000-000000000201' and almacen_id='00000000-0000-0000-0000-000000000101';
  exception when sqlstate '55006' then v_blocked:=true; end;
  perform public.test_assert(v_blocked,'stock UPDATE blocked during count');

  v_blocked:=false;
  begin delete from public.stock where producto_id='00000000-0000-0000-0000-000000000201' and almacen_id='00000000-0000-0000-0000-000000000101';
  exception when sqlstate '55006' then v_blocked:=true; end;
  perform public.test_assert(v_blocked,'stock DELETE blocked during count');
  perform public.test_assert((select cantidad=8 from public.stock where producto_id='00000000-0000-0000-0000-000000000201' and almacen_id='00000000-0000-0000-0000-000000000101'),'blocked writes leave stock unchanged');
end $$;

-- Incomplete counts and discrepancies without a reason cannot finish.
do $$
declare
  v_audit uuid:=current_setting('app.test_audit_id')::uuid;
  v_rejected boolean:=false; v_error text; v_saved integer; v_state text;
begin
  begin perform public.inventario_auditoria_finalizar(v_audit);
  exception when others then v_rejected:=position('faltan' in lower(sqlerrm))>0; end;
  perform public.test_assert(v_rejected,'un-counted lines prevent completion');

  v_saved:=public.inventario_auditoria_guardar_conteos(v_audit,jsonb_build_array(
    jsonb_build_object('linea_id',current_setting('app.test_line_product_1')::uuid,'cantidad_fisica',8),
    jsonb_build_object('linea_id',current_setting('app.test_line_product_2')::uuid,'cantidad_fisica',2),
    jsonb_build_object('linea_id',current_setting('app.test_line_variant')::uuid,'cantidad_fisica',0)
  ));
  perform public.test_assert(v_saved=3,'creator with create permission saves all count lines');

  v_rejected:=false; v_error:='';
  begin perform public.inventario_auditoria_finalizar(v_audit);
  exception when others then v_error:=sqlerrm; v_rejected:=position('debes explicar cada diferencia' in lower(sqlerrm))>0; end;
  perform public.test_assert(v_rejected,'discrepancy without reason prevents completion: '||v_error);

  perform public.inventario_auditoria_guardar_conteos(v_audit,jsonb_build_array(
    jsonb_build_object('linea_id',current_setting('app.test_line_product_2')::uuid,'cantidad_fisica',2,'motivo','Reconteo verificado')
  ));
  v_state:=public.inventario_auditoria_finalizar(v_audit);
  perform public.test_assert(v_state='COMPLETADA_CON_DIFERENCIAS','completion records discrepancy state');
  perform public.test_assert((select auditoria_inventario_activa_id is null from public.almacenes where id='00000000-0000-0000-0000-000000000101'),'finish releases warehouse lock');
  perform public.test_assert((select cantidad=8 from public.stock where producto_id='00000000-0000-0000-0000-000000000201' and almacen_id='00000000-0000-0000-0000-000000000101'),'finish never auto-adjusts stock');
  perform public.test_assert(not exists(select 1 from public.stock where producto_id='00000000-0000-0000-0000-000000000202' and almacen_id='00000000-0000-0000-0000-000000000101'),'finish does not create missing stock rows');
end $$;

-- A different creator with create permission cannot edit or cancel the owner's audit.
do $$
declare v_audit uuid; v_rejected boolean;
begin
  v_audit:=public.inventario_auditoria_iniciar('00000000-0000-0000-0000-000000000101');
  perform set_config('app.test_cancel_audit_id',v_audit::text,false);
  perform set_config('app.test_cancel_line_id',(select id::text from public.inventario_auditoria_lineas where auditoria_id=v_audit and producto_id='00000000-0000-0000-0000-000000000201'),false);
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
  perform set_config('app.test_permissions','auditoria:crear',false);

  v_rejected:=false;
  begin perform public.inventario_auditoria_guardar_conteos(v_audit,jsonb_build_array(
    jsonb_build_object('linea_id',current_setting('app.test_cancel_line_id')::uuid,'cantidad_fisica',99)
  ));
  exception when sqlstate '42501' then v_rejected:=true; end;
  perform public.test_assert(v_rejected,'create alone does not permit editing another creator''s audit');

  v_rejected:=false;
  begin perform public.inventario_auditoria_cancelar(v_audit,'Not my audit');
  exception when sqlstate '42501' then v_rejected:=true; end;
  perform public.test_assert(v_rejected,'create alone does not permit cancelling another creator''s audit');
end $$;

-- editar_any alone permits cross-audit save/cancel; cancellation reason is mandatory.
do $$
declare v_audit uuid:=current_setting('app.test_cancel_audit_id')::uuid; v_rejected boolean:=false; v_state text;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
  perform set_config('app.test_permissions','auditoria:editar_any',false);
  perform public.test_assert(public.inventario_auditoria_guardar_conteos(v_audit,jsonb_build_array(
    jsonb_build_object('linea_id',current_setting('app.test_cancel_line_id')::uuid,'cantidad_fisica',8)
  ))=1,'editar_any without create permits save');

  begin perform public.inventario_auditoria_cancelar(v_audit,'   ');
  exception when others then v_rejected:=position('motivo' in lower(sqlerrm))>0; end;
  perform public.test_assert(v_rejected,'cancellation requires a reason');

  v_state:=public.inventario_auditoria_cancelar(v_audit,'Conteo iniciado en almacén equivocado');
  perform public.test_assert(v_state='CANCELADA','authorized cross-audit editor can cancel');
  perform public.test_assert((select estado='CANCELADA' and observaciones='Conteo iniciado en almacén equivocado' and finalizado_por='00000000-0000-0000-0000-000000000003' from public.inventario_auditorias where id=v_audit),'cancel persists reason and finalizer');
  perform public.test_assert((select auditoria_inventario_activa_id is null from public.almacenes where id='00000000-0000-0000-0000-000000000101'),'cancel releases warehouse lock');
  perform public.test_assert((select cantidad=8 from public.stock where producto_id='00000000-0000-0000-0000-000000000201' and almacen_id='00000000-0000-0000-0000-000000000101'),'cancel does not alter stock');
end $$;

-- Receiver persists through the new wrapper, the share payload is complete,
-- and the historical four-argument RPC still works without inventing a receiver.
do $$
declare v_transfer uuid; v_legacy uuid; v_payload jsonb; v_receiver uuid; v_rejected boolean:=false;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
  perform set_config('app.test_permissions','transferencias:crear,transferencias:ver',false);
  perform public.test_assert((select count(*)=4 from public.listar_receptores_transferencia()),'receiver list excludes inactive and archived users');

  v_transfer:=public.registrar_transferencia(
    '00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102',
    jsonb_build_array(jsonb_build_object('producto_id','00000000-0000-0000-0000-000000000201','cantidad',2)),
    gen_random_uuid(),'00000000-0000-0000-0000-000000000004'
  );
  select recibido_por into v_receiver from public.transferencias where id=v_transfer;
  perform public.test_assert(v_receiver='00000000-0000-0000-0000-000000000004','five-argument RPC persists receiver');
  v_payload:=public.obtener_transferencia_compartir(v_transfer);
  perform public.test_assert(v_payload->>'almacen'='Punto Minorista','share returns destination warehouse');
  perform public.test_assert(v_payload->>'recibe'='Transfer Receiver','share returns receiver name');
  perform public.test_assert(jsonb_array_length(v_payload->'lineas')=1,'share returns product line');
  perform public.test_assert(v_payload->'lineas'->0->>'cantidad'='2','share preserves transferred quantity');

  v_legacy:=public.registrar_transferencia(
    '00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102',
    jsonb_build_array(jsonb_build_object('producto_id','00000000-0000-0000-0000-000000000201','cantidad',1)),
    gen_random_uuid()
  );
  perform public.test_assert((select recibido_por is null from public.transferencias where id=v_legacy),'legacy four-argument RPC remains compatible and does not invent receiver');

  begin
    perform public.registrar_transferencia(
      '00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102',
      jsonb_build_array(jsonb_build_object('producto_id','00000000-0000-0000-0000-000000000201','cantidad',1)),
      gen_random_uuid(),'00000000-0000-0000-0000-000000000005'
    );
  exception when others then v_rejected:=position('no está activa' in sqlerrm)>0; end;
  perform public.test_assert(v_rejected,'inactive receiver must be rejected');
end $$;

-- Verify private table grants and RPC execution ACLs.
do $$
begin
  perform public.test_assert(has_function_privilege('authenticated','public.inventario_auditoria_cancelar(uuid,text)','EXECUTE'),'authenticated can execute cancel RPC');
  perform public.test_assert(not has_function_privilege('anon','public.inventario_auditoria_cancelar(uuid,text)','EXECUTE'),'anon cannot execute cancel RPC');
  perform public.test_assert(not has_table_privilege('authenticated','public.inventario_auditorias','SELECT'),'authenticated has no direct audit table read grant');
  perform public.test_assert(not has_table_privilege('authenticated','public.inventario_auditoria_lineas','SELECT'),'authenticated has no direct audit line read grant');
  perform public.test_assert((select relrowsecurity from pg_class where oid='public.inventario_auditorias'::regclass),'audit header RLS enabled');
  perform public.test_assert((select relrowsecurity from pg_class where oid='public.inventario_auditoria_lineas'::regclass),'audit line RLS enabled');
end $$;

select 'PASS inventory audit migration: storage-only, snapshots, stock lock, owner/editor permissions, cancel reason, no auto-adjustment, transfer receiver, share payload, legacy RPC and ACLs' as result;
