-- DOCUMENTAL — YA EXISTE EN PRODUCCIÓN — NO EJECUTAR COMO MIGRACIÓN NUEVA
--
-- Extraído por introspección real (information_schema + pg_constraint + pg_indexes)
-- contra Supabase producción (project_ref: papxnkkjtkxsitcsvcme) el 2026-08-20.
-- Objetivo: dejar en el repo el DDL de las 16 tablas base que existían en
-- producción sin archivo .sql fuente versionado.
--
-- Orden respetado por dependencias de FK (padres antes que hijos).

-- =========================================================
-- roles
-- =========================================================
CREATE TABLE public.roles (
    id         uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre     text NOT NULL,
    creado_en  timestamptz NOT NULL DEFAULT now(),
    activo     boolean NOT NULL DEFAULT true,
    CONSTRAINT roles_pkey PRIMARY KEY (id),
    CONSTRAINT roles_nombre_key UNIQUE (nombre)
);

-- =========================================================
-- permisos
-- =========================================================
CREATE TABLE public.permisos (
    id        uuid NOT NULL DEFAULT gen_random_uuid(),
    role_id   uuid NOT NULL,
    seccion   text NOT NULL,
    accion    text NOT NULL,
    permitido boolean NOT NULL DEFAULT false,
    CONSTRAINT permisos_pkey PRIMARY KEY (id),
    CONSTRAINT permisos_role_id_seccion_accion_key UNIQUE (role_id, seccion, accion),
    CONSTRAINT permisos_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE,
    CONSTRAINT permisos_accion_check CHECK (accion = ANY (ARRAY['ver'::text, 'crear'::text, 'editar'::text, 'borrar'::text, 'editar_any'::text])),
    CONSTRAINT permisos_seccion_check CHECK (seccion = ANY (ARRAY[
        'productos'::text, 'categorias'::text, 'almacenes'::text, 'stock'::text,
        'transferencias'::text, 'vales_salida'::text, 'ventas'::text, 'reportes'::text,
        'usuarios'::text, 'presentaciones'::text, 'auditoria'::text, 'turnos'::text,
        'comunicacion'::text, 'unidades'::text
    ]))
);

-- =========================================================
-- usuarios
-- =========================================================
CREATE TABLE public.usuarios (
    id        uuid NOT NULL,
    nombre    text NOT NULL,
    role_id   uuid,
    activo    boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT usuarios_pkey PRIMARY KEY (id),
    CONSTRAINT usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT usuarios_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE SET NULL
);
CREATE INDEX idx_usuarios_role ON public.usuarios USING btree (role_id);

-- =========================================================
-- categorias
-- =========================================================
CREATE TABLE public.categorias (
    id         uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre     text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    activo     boolean NOT NULL DEFAULT true,
    CONSTRAINT categorias_pkey PRIMARY KEY (id),
    CONSTRAINT categorias_nombre_key UNIQUE (nombre)
);

-- =========================================================
-- presentaciones
-- =========================================================
CREATE TABLE public.presentaciones (
    id         uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre     text NOT NULL,
    activo     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT presentaciones_pkey PRIMARY KEY (id),
    CONSTRAINT presentaciones_nombre_key UNIQUE (nombre)
);

-- =========================================================
-- unidades
-- =========================================================
CREATE TABLE public.unidades (
    id         uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre     text NOT NULL,
    activo     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unidades_pkey PRIMARY KEY (id),
    CONSTRAINT unidades_nombre_key UNIQUE (nombre)
);

-- =========================================================
-- almacenes
-- =========================================================
CREATE TABLE public.almacenes (
    id         uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre     text NOT NULL,
    tipo       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    activo     boolean NOT NULL DEFAULT true,
    CONSTRAINT almacenes_pkey PRIMARY KEY (id),
    CONSTRAINT almacenes_nombre_key UNIQUE (nombre),
    CONSTRAINT almacenes_tipo_check CHECK (tipo = ANY (ARRAY['venta'::text, 'mayorista'::text]))
);

-- =========================================================
-- productos
-- =========================================================
CREATE TABLE public.productos (
    id                uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre            text NOT NULL,
    categoria_id      uuid,
    unidad            text,
    precio_normal     numeric(12,2) NOT NULL DEFAULT 0,
    precio_mayorista  numeric(12,2) DEFAULT 0,
    activo            boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    presentacion_id   uuid,
    imagen_url        text,
    CONSTRAINT productos_pkey PRIMARY KEY (id),
    CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id),
    CONSTRAINT productos_presentacion_id_fkey FOREIGN KEY (presentacion_id) REFERENCES public.presentaciones(id)
);
CREATE INDEX idx_productos_categoria ON public.productos USING btree (categoria_id);
CREATE INDEX idx_productos_nombre ON public.productos USING btree (nombre);
CREATE INDEX idx_productos_presentacion ON public.productos USING btree (presentacion_id);

-- =========================================================
-- producto_presentaciones
-- =========================================================
CREATE TABLE public.producto_presentaciones (
    id               uuid NOT NULL DEFAULT gen_random_uuid(),
    producto_id      uuid NOT NULL,
    presentacion_id  uuid NOT NULL,
    factor           numeric NOT NULL,
    activo           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT producto_presentaciones_pkey PRIMARY KEY (id),
    CONSTRAINT fk_producto_presentaciones_producto FOREIGN KEY (producto_id) REFERENCES public.productos(id),
    CONSTRAINT fk_producto_presentaciones_presentacion FOREIGN KEY (presentacion_id) REFERENCES public.presentaciones(id),
    CONSTRAINT chk_producto_presentaciones_factor_positivo CHECK (factor > (0)::numeric)
);
CREATE INDEX idx_producto_presentaciones_presentacion ON public.producto_presentaciones USING btree (presentacion_id);
-- Índice único parcial: impide la misma presentación activa duplicada por producto
CREATE UNIQUE INDEX uq_producto_presentaciones_activa ON public.producto_presentaciones USING btree (producto_id, presentacion_id) WHERE (activo = true);

-- =========================================================
-- stock
-- =========================================================
CREATE TABLE public.stock (
    id          uuid NOT NULL DEFAULT gen_random_uuid(),
    producto_id uuid NOT NULL,
    almacen_id  uuid NOT NULL,
    cantidad    numeric(12,3) NOT NULL DEFAULT 0,
    minimo      numeric(12,3) NOT NULL DEFAULT 0,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stock_pkey PRIMARY KEY (id),
    CONSTRAINT stock_producto_id_almacen_id_key UNIQUE (producto_id, almacen_id),
    CONSTRAINT stock_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE,
    CONSTRAINT stock_almacen_id_fkey FOREIGN KEY (almacen_id) REFERENCES public.almacenes(id) ON DELETE CASCADE
);
CREATE INDEX idx_stock_almacen ON public.stock USING btree (almacen_id);

-- =========================================================
-- lotes_compra
-- =========================================================
CREATE TABLE public.lotes_compra (
    id                 uuid NOT NULL DEFAULT gen_random_uuid(),
    producto_id        uuid NOT NULL,
    almacen_id         uuid NOT NULL,
    cantidad_inicial   numeric NOT NULL,
    cantidad_restante  numeric NOT NULL,
    costo_unitario     numeric NOT NULL,
    fecha_compra       timestamptz NOT NULL DEFAULT now(),
    origen             text NOT NULL DEFAULT 'compra'::text,
    usuario_id         uuid,
    creado_en          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lotes_compra_pkey PRIMARY KEY (id),
    CONSTRAINT lotes_compra_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id),
    CONSTRAINT lotes_compra_almacen_id_fkey FOREIGN KEY (almacen_id) REFERENCES public.almacenes(id),
    CONSTRAINT lotes_compra_cantidad_inicial_check CHECK (cantidad_inicial > (0)::numeric),
    CONSTRAINT lotes_compra_cantidad_restante_check CHECK (cantidad_restante >= (0)::numeric),
    CONSTRAINT lotes_compra_costo_unitario_check CHECK (costo_unitario >= (0)::numeric),
    CONSTRAINT lotes_compra_origen_check CHECK (origen = ANY (ARRAY['compra'::text, 'transferencia'::text]))
);
CREATE INDEX idx_lotes_compra_almacen ON public.lotes_compra USING btree (almacen_id);
CREATE INDEX idx_lotes_compra_origen ON public.lotes_compra USING btree (origen);
CREATE INDEX idx_lotes_compra_producto_almacen_fecha ON public.lotes_compra USING btree (producto_id, almacen_id, fecha_compra);

-- =========================================================
-- transferencias
-- =========================================================
CREATE TABLE public.transferencias (
    id                  uuid NOT NULL DEFAULT gen_random_uuid(),
    almacen_origen_id   uuid NOT NULL,
    almacen_destino_id  uuid NOT NULL,
    estado              text NOT NULL DEFAULT 'completada'::text,
    creado_por          uuid,
    fecha               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT transferencias_pkey PRIMARY KEY (id),
    CONSTRAINT transferencias_almacen_origen_id_fkey FOREIGN KEY (almacen_origen_id) REFERENCES public.almacenes(id),
    CONSTRAINT transferencias_almacen_destino_id_fkey FOREIGN KEY (almacen_destino_id) REFERENCES public.almacenes(id),
    CONSTRAINT transferencias_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id),
    CONSTRAINT transferencias_estado_check CHECK (estado = ANY (ARRAY['completada'::text, 'cancelada'::text]))
);
CREATE INDEX idx_transferencias_creado_por ON public.transferencias USING btree (creado_por);
CREATE INDEX idx_transferencias_destino ON public.transferencias USING btree (almacen_destino_id);
CREATE INDEX idx_transferencias_origen ON public.transferencias USING btree (almacen_origen_id);

-- =========================================================
-- transferencias_lineas
-- =========================================================
CREATE TABLE public.transferencias_lineas (
    id                uuid NOT NULL DEFAULT gen_random_uuid(),
    transferencia_id  uuid NOT NULL,
    producto_id       uuid NOT NULL,
    cantidad          numeric NOT NULL,
    CONSTRAINT transferencias_lineas_pkey PRIMARY KEY (id),
    CONSTRAINT transferencias_lineas_transferencia_id_fkey FOREIGN KEY (transferencia_id) REFERENCES public.transferencias(id) ON DELETE CASCADE,
    CONSTRAINT transferencias_lineas_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id),
    CONSTRAINT transferencias_lineas_cantidad_check CHECK (cantidad > (0)::numeric)
);
CREATE INDEX idx_transferencias_lineas_producto ON public.transferencias_lineas USING btree (producto_id);
CREATE INDEX idx_transferencias_lineas_transferencia ON public.transferencias_lineas USING btree (transferencia_id);

-- =========================================================
-- vales_salida
-- =========================================================
CREATE TABLE public.vales_salida (
    id          uuid NOT NULL DEFAULT gen_random_uuid(),
    producto_id uuid NOT NULL,
    almacen_id  uuid NOT NULL,
    tipo        text NOT NULL,
    cantidad    numeric NOT NULL,
    estado      text NOT NULL DEFAULT 'completado'::text,
    creado_por  uuid,
    fecha       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT vales_salida_pkey PRIMARY KEY (id),
    CONSTRAINT vales_salida_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id),
    CONSTRAINT vales_salida_almacen_id_fkey FOREIGN KEY (almacen_id) REFERENCES public.almacenes(id),
    CONSTRAINT vales_salida_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id),
    CONSTRAINT vales_salida_cantidad_check CHECK (cantidad > (0)::numeric),
    CONSTRAINT vales_salida_estado_check CHECK (estado = ANY (ARRAY['completado'::text, 'cancelado'::text])),
    CONSTRAINT vales_salida_tipo_check CHECK (tipo = ANY (ARRAY['merma'::text, 'donacion'::text, 'regalo'::text, 'vencido'::text]))
);
CREATE INDEX idx_vales_salida_almacen ON public.vales_salida USING btree (almacen_id);
CREATE INDEX idx_vales_salida_creado_por ON public.vales_salida USING btree (creado_por);
CREATE INDEX idx_vales_salida_producto ON public.vales_salida USING btree (producto_id);

-- =========================================================
-- ventas
-- =========================================================
CREATE TABLE public.ventas (
    id          uuid NOT NULL DEFAULT gen_random_uuid(),
    almacen_id  uuid NOT NULL,
    total       numeric NOT NULL DEFAULT 0,
    estado      text NOT NULL DEFAULT 'completada'::text,
    creado_por  uuid,
    fecha       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ventas_pkey PRIMARY KEY (id),
    CONSTRAINT ventas_almacen_id_fkey FOREIGN KEY (almacen_id) REFERENCES public.almacenes(id),
    CONSTRAINT ventas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id),
    CONSTRAINT ventas_estado_check CHECK (estado = ANY (ARRAY['completada'::text, 'cancelada'::text])),
    CONSTRAINT ventas_total_check CHECK (total >= (0)::numeric)
);
CREATE INDEX idx_ventas_almacen_fecha ON public.ventas USING btree (almacen_id, fecha DESC);
CREATE INDEX idx_ventas_creado_por_fecha ON public.ventas USING btree (creado_por, fecha DESC);

-- =========================================================
-- ventas_lineas
-- =========================================================
CREATE TABLE public.ventas_lineas (
    id                    uuid NOT NULL DEFAULT gen_random_uuid(),
    venta_id              uuid NOT NULL,
    producto_id           uuid NOT NULL,
    cantidad              numeric NOT NULL,
    precio_unitario       numeric NOT NULL,
    subtotal              numeric NOT NULL,
    costo_unitario_fifo   numeric,
    CONSTRAINT ventas_lineas_pkey PRIMARY KEY (id),
    CONSTRAINT ventas_lineas_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id),
    CONSTRAINT ventas_lineas_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id),
    CONSTRAINT ventas_lineas_cantidad_check CHECK (cantidad > (0)::numeric),
    CONSTRAINT ventas_lineas_precio_unitario_check CHECK (precio_unitario >= (0)::numeric),
    CONSTRAINT ventas_lineas_subtotal_check CHECK (subtotal >= (0)::numeric)
);
CREATE INDEX idx_ventas_lineas_producto ON public.ventas_lineas USING btree (producto_id);
CREATE INDEX idx_ventas_lineas_venta ON public.ventas_lineas USING btree (venta_id);
