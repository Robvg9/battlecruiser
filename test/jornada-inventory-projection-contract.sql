INSERT INTO public.almacenes(id,nombre,tipo,activo) VALUES
('10000000-0000-4000-8000-000000000001','Cafetería La Cueva','minorista',true),
('10000000-0000-4000-8000-000000000002','Almacén Mayorista','mayorista',true);

INSERT INTO public.productos(id,nombre,unidad,activo,inventario_mixto,producto_padre_id,variante_nombre) VALUES
('20000000-0000-4000-8000-000000000001','Biscochos',NULL,true,false,NULL,NULL),
('20000000-0000-4000-8000-000000000002','Jugo La Estancia',NULL,true,true,NULL,NULL),
('20000000-0000-4000-8000-000000000003','Jugo La Estancia - Manzana',NULL,true,false,'20000000-0000-4000-8000-000000000002','Manzana'),
('20000000-0000-4000-8000-000000000004','Leche Condensada',NULL,true,false,NULL,NULL);

INSERT INTO public.stock(id,producto_id,almacen_id,cantidad,minimo) VALUES
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',999,2),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',200,2),
('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',333,0),
('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',444,0);

INSERT INTO public.productos_stock_mixto_minimos(id,producto_id,almacen_id,minimo) VALUES
('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',10);

INSERT INTO public.turnos(id,apertura_real,estado) VALUES
('40000000-0000-4000-8000-000000000001','2026-11-09 13:00:00+00','ABIERTO');
INSERT INTO public.turno_jornada_programacion(id,fecha,hora_inicio_prevista,zona_horaria) VALUES
('50000000-0000-4000-8000-000000000001','2026-11-09','07:00','America/Havana');
INSERT INTO public.turno_sesiones(id,turno_id,almacen_id,jornada_programacion_id,fecha,bloque,estado,apertura_retroactiva) VALUES
('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','2026-11-09','JORNADA','EN_CURSO',true);

INSERT INTO public.turno_jornada_inventario_cortes(id,turno_sesion_id,tipo,estado,creado_en,confirmado_en) VALUES
('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','INICIAL','CONFIRMADO','2026-11-10 18:00:00+00','2026-11-10 18:00:00+00');
INSERT INTO public.turno_jornada_inventario_lineas(id,corte_id,producto_id,cantidad_contada) VALUES
('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',107),
('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',78),
('71000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',5),
('71000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004',23);

-- Same-day transfer before the programmed 07:00 start: excluded.
INSERT INTO public.transferencias(id,almacen_origen_id,almacen_destino_id,estado,fecha) VALUES
('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','completada','2026-11-09 10:45:00+00'),
-- Same-day transfer at 07:15, before the administrative 08:00 opening: included.
('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','completada','2026-11-09 12:15:00+00'),
-- Same-day linked transfer after the programmed start: included.
('80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','completada','2026-11-09 14:00:00+00'),
-- Same-day unlinked transfer during the programmed jornada: included too.
('80000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','completada','2026-11-09 15:00:00+00'),
-- Transfer of the next day: included.
('80000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','completada','2026-11-10 16:00:00+00'),
-- Transfer out during the jornada: deducted.
('80000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','completada','2026-11-10 17:00:00+00');

INSERT INTO public.transferencias_lineas(id,transferencia_id,producto_id,cantidad) VALUES
('81000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',140),
('81000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',10),
('81000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003',3),
('81000000-0000-4000-8000-000000000004','80000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001',99),
('81000000-0000-4000-8000-000000000005','80000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001',8),
('81000000-0000-4000-8000-000000000006','80000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001',4),
('81000000-0000-4000-8000-000000000007','80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',55);
INSERT INTO public.turno_jornada_entradas_vinculadas(id,turno_sesion_id,transferencia_id) VALUES
('82000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000003');

INSERT INTO public.lotes_compra(id,almacen_id,producto_id,origen,fecha_compra,cantidad_inicial,cantidad_restante,costo_unitario) VALUES
('83000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','compra','2026-11-10 12:00:00+00',6,6,10);

INSERT INTO public.reinversiones(id,almacen_id,turno_sesion_id,estado,fecha_revision) VALUES
('84000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','APROBADA','2026-11-10 12:30:00+00');
INSERT INTO public.reinversiones_lineas(id,reinversion_id,producto_id,cantidad_base) VALUES
('85000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',2);

INSERT INTO public.vales_salida(id,almacen_id,producto_id,cantidad,fecha,estado) VALUES
('86000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'2026-11-10 13:00:00+00','COMPLETADO');
INSERT INTO public.bajas(id,almacen_id,producto_id,cantidad,estado,fecha_revision,actualizado_en,creado_en) VALUES
('87000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',3,'APROBADA','2026-11-10 14:00:00+00','2026-11-10 14:00:00+00','2026-11-10 13:50:00+00');
INSERT INTO public.mermas(id,almacen_id,producto_id,cantidad,estado,fecha_revision,actualizado_en,creado_en) VALUES
('88000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',2,'APROBADA','2026-11-10 14:10:00+00','2026-11-10 14:10:00+00','2026-11-10 14:00:00+00');
INSERT INTO public.ventas(id,almacen_id,estado,fecha) VALUES
('89000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','COMPLETADA','2026-11-10 14:20:00+00');
INSERT INTO public.ventas_lineas(id,venta_id,producto_id,cantidad) VALUES
('8a000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',5);

DO $$
DECLARE
  v_qty numeric;
  v_store_qty numeric;
  v_family_qty numeric;
  v_variants jsonb;
  v_unit text;
  v_state text;
BEGIN
  SELECT cantidad_actual INTO v_qty
  FROM public.bc7_jornada_saldos_operativos('60000000-0000-4000-8000-000000000001')
  WHERE producto_id = '20000000-0000-4000-8000-000000000001';
  IF v_qty IS DISTINCT FROM 357::numeric THEN
    RAISE EXCEPTION 'Saldo esperado 357 para Biscochos; obtenido %', v_qty;
  END IF;

  SELECT cantidad INTO v_store_qty
  FROM public.inventario_enriquecido('10000000-0000-4000-8000-000000000001')
  WHERE producto_id = '20000000-0000-4000-8000-000000000001';
  IF v_store_qty IS DISTINCT FROM 357::numeric THEN
    RAISE EXCEPTION 'RPC de almacén no proyecta saldo 357; obtenido %', v_store_qty;
  END IF;

  SELECT cantidad, estado INTO v_store_qty, v_state
  FROM public.inventario_enriquecido('10000000-0000-4000-8000-000000000001')
  WHERE producto_id = '20000000-0000-4000-8000-000000000004';
  IF v_store_qty IS DISTINCT FROM 23::numeric THEN
    RAISE EXCEPTION 'No se incluyó el producto del corte sin fila stock; obtenido %', v_store_qty;
  END IF;
  IF v_state IS DISTINCT FROM 'sin_minimo' THEN
    RAISE EXCEPTION 'El producto sin asignación debe mostrarse sin mínimo; estado recibido %', v_state;
  END IF;

  SELECT cantidad INTO v_store_qty
  FROM public.inventario_enriquecido('10000000-0000-4000-8000-000000000002')
  WHERE producto_id = '20000000-0000-4000-8000-000000000001';
  IF v_store_qty IS DISTINCT FROM 200::numeric THEN
    RAISE EXCEPTION 'El almacén mayorista debe conservar su stock 200; obtenido %', v_store_qty;
  END IF;

  SELECT cantidad, variantes INTO v_family_qty, v_variants
  FROM public.inventario_mixto_enriquecido('10000000-0000-4000-8000-000000000001')
  WHERE producto_id = '20000000-0000-4000-8000-000000000002';
  IF v_family_qty IS DISTINCT FROM 86::numeric THEN
    RAISE EXCEPTION 'Familia mixta debe sumar 78 genéricas + 8 variante; obtenido %', v_family_qty;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_variants) v
    WHERE v->>'nombre' = 'Inventario inicial sin distribuir'
      AND (v->>'cantidad')::numeric = 78
      AND v->'producto_id' = 'null'::jsonb
  ) THEN
    RAISE EXCEPTION 'La cantidad genérica del corte no se preservó como variante sin distribuir: %', v_variants;
  END IF;

  SELECT cantidad INTO v_store_qty
  FROM public.stock
  WHERE producto_id = '20000000-0000-4000-8000-000000000001'
    AND almacen_id = '10000000-0000-4000-8000-000000000001';
  IF v_store_qty IS DISTINCT FROM 999::numeric THEN
    RAISE EXCEPTION 'La consulta modificó stock global; esperado 999 y recibido %', v_store_qty;
  END IF;

  SELECT unidad INTO v_unit FROM public.productos
  WHERE id = '20000000-0000-4000-8000-000000000001';
  IF v_unit IS DISTINCT FROM 'unidad' THEN
    RAISE EXCEPTION 'La unidad base debe normalizarse a unidad; recibido %', v_unit;
  END IF;

  INSERT INTO public.productos(id,nombre,unidad,activo,inventario_mixto)
  VALUES ('20000000-0000-4000-8000-000000000005','Producto futuro',NULL,true,false);
  SELECT unidad INTO v_unit FROM public.productos
  WHERE id = '20000000-0000-4000-8000-000000000005';
  IF v_unit IS DISTINCT FROM 'unidad' THEN
    RAISE EXCEPTION 'Trigger no normalizó unidad de producto nuevo; recibido %', v_unit;
  END IF;
END
$$;
