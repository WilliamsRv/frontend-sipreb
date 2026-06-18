-- ============================================================================
-- ANÁLISIS DEL MÓDULO DE GESTIÓN PATRIMONIAL (ms-04-patrimonio)
-- Proyecto: vg-web-sipreb
-- Fecha: 2026-05-21
-- ============================================================================
-- CONTENIDO:
--   1.  Resumen general del análisis
--   2.  Flujo de alta de bien (AssetModal.jsx) — NO crea movimiento
--   3.  Flujo de disposición/baja (disposalService.js) — SÍ crea movimiento
--   4.  Tabla de tipos de movimiento (movementTypes.js)
--   5.  assetStatusSyncService — saga que sincroniza estado tras movimiento
--   6.  sbnCatalogService — catálogo SBN en memoria
--   7.  Normalización de estados a inglés (cambios aplicados)
--   8.  Decisiones clave adoptadas
--   9.  Brechas SBN/SIGA identificadas
--   10. APIs del módulo (api.js)
--   11. Inserción de 50 bienes patrimoniales de prueba
-- ============================================================================



-- ============================================================================
-- 1.  RESUMEN GENERAL
-- ============================================================================
-- El módulo ms-04-patrimonio gestiona el registro, consulta, actualización y
-- disposición de bienes patrimoniales municipales. Está construido en React
-- con Vite, Tailwind CSS y se comunica con un API Gateway en:
--     https://lab.vallegrande.edu.pe/gateway/api/v1/assets
--
-- La autenticación usa tokens JWT almacenados en sessionStorage ('accessToken').
-- La base de datos es Supabase (PostgreSQL):
--     https://uannlnmvkwrfpyimaaby.supabase.co
--
-- Convenciones:
--   - La tabla assets usa snake_case (asset_code, acquisition_date, etc.)
--   - El frontend api.js traduce a camelCase automaticamente
--   - asset_status se almacena en INGLÉS (AVAILABLE, IN_USE, etc.)
--   - La UI muestra etiquetas en español mediante getters



-- ============================================================================
-- 2.  FLUJO DE ALTA DE BIEN (AssetModal.jsx)
-- ============================================================================
-- Ubicación: src/modules/ms-04-patrimonio/components/assets/AssetModal.jsx
--
-- El modal de creación de activos:
--   1. Recibe datos del formulario (descripción, SBN code, marca, modelo,
--      serial, color, dimensiones, peso, material, fecha_adquisición,
--      tipo_adquisición, factura, OC, PECOSA, valor, vida_útil,
--      es_depreciable, requiere_mantenimiento, estado_físico,
--      tipo_doc_alta, nro_doc_alta, fecha_alta)
--   2. Asigna automáticamente created_by (usuario actual), municipality_id,
--      asset_code (autogenerado BP-YYYY-NNN), asset_status = 'AVAILABLE'
--   3. Llama a createBienPatrimonial(payload) del api.js
--   4. En caso de éxito: Toast de éxito, cierra modal, refresca lista
--   5. En caso de error: Toast de error
--
-- PUNTO CRÍTICO: NO se crea ningún movimiento (asset_movements) después
-- del alta. Esto es CORRECTO según SBN: el alta (registro) no implica
-- asignación. La asignación (a un área/responsable) es un paso posterior.



-- ============================================================================
-- 3.  FLUJO DE DISPOSICIÓN/BAJA (disposalService.js)
-- ============================================================================
-- Ubicación: src/modules/ms-04-patrimonio/services/disposalService.js
--
-- El servicio de disposición maneja el proceso de baja de activos:
--
--   finalizeDisposal(disposalData):
--     1. Obtiene la lista de IDs de bienes a dar de baja
--     2. Para CADA bien, llama a:
--          assetMovementService.createMovement({
--            bien_id: bien.id,
--            tipo_movimiento: 'DISPOSAL',
--            fecha_movimiento: disposalData.fecha_baja,
--            motivo: disposalData.motivo_baja,
--            documento_referencia: disposalData.documento_baja,
--            observaciones: disposalData.observaciones,
--            usuario_id: currentUser.id,
--            municipio_id: currentMunicipality.id
--          })
--     3. La creación del movimiento DISPOSAL dispara el saga de
--        assetStatusSyncService, que actualiza asset_status = 'INACTIVE'
--        y envía notificaciones
--
-- Este es el único flujo que crea movimientos actualmente.



-- ============================================================================
-- 4.  TIPOS DE MOVIMIENTO (movementTypes.js)
-- ============================================================================
-- Ubicación: src/modules/ms-05-movements/types/movementTypes.js
--
-- Tipos de movimiento disponibles:
--
--   CÓDIGO                | VALOR ALMACENADO      | SPANISH
--   ----------------------+-----------------------+-------------------
--   INITIAL_ASSIGNMENT    | INITIAL_ASSIGNMENT    | Asignación Inicial
--   TRANSFER              | TRANSFER              | Transferencia
--   LOAN                  | LOAN                  | Préstamo
--   RETURN                | RETURN                | Devolución
--   MAINTENANCE_IN        | MAINTENANCE_IN        | Ingreso a Mantenimiento
--   MAINTENANCE_OUT       | MAINTENANCE_OUT       | Salida de Mantenimiento
--   DISPOSAL              | DISPOSAL              | Disposición/Baja
--   STATUS_CHANGE         | STATUS_CHANGE         | Cambio de Estado
--
-- Cada tipo tiene:
--   - id (string en inglés usado para envío a API/DB)
--   - label (string en español para UI)
--   - description (texto explicativo)
--   - allowedStatuses (array de estados permitidos para el bien origen)
--   - targetStatus (nuevo estado del bien tras el movimiento)



-- ============================================================================
-- 5.  assetStatusSyncService — SAGA DE SINCRONIZACIÓN
-- ============================================================================
-- Ubicación: src/modules/ms-05-movements/services/assetStatusSyncService.js
--
-- Implementa un patrón SAGA: tras crear un movimiento, sincroniza el estado
-- del bien automáticamente.
--
-- Flujo:
--   1. Recibe el movimiento creado
--   2. Determina el nuevo estado según tipo_movimiento
--      - INITIAL_ASSIGNMENT -> IN_USE
--      - TRANSFER           -> IN_USE
--      - LOAN               -> LOANED
--      - RETURN             -> AVAILABLE
--      - DISPOSAL           -> INACTIVE
--      - MAINTENANCE_IN     -> MAINTENANCE
--      - MAINTENANCE_OUT    -> IN_USE
--      - STATUS_CHANGE      -> (el que indique el usuario)
--   3. Llama a la API para actualizar asset_status del bien
--   4. Envía notificación de cambio de estado
--   5. Si falla, ejecuta compensación (rollback del movimiento)



-- ============================================================================
-- 6.  sbnCatalogService — CATÁLOGO SBN EN MEMORIA
-- ============================================================================
-- Ubicación: src/modules/ms-04-patrimonio/services/sbnCatalogService.js
--
-- Catálogo temporal de códigos SBN mientras no esté listo el microservicio.
-- Las familias principales son:
--
--   3381  - Refrigeración y Aire Acondicionado
--   3331  - Vehículos
--   3341  - Instrumentos de Medición
--   3361  - Equipo Médico
--   4611  - Bienes Culturales
--   5111  - Mobiliario
--   6412  - Equipos de Cómputo
--   6532  - Maquinaria y Equipo
--
-- Cada código SBN tiene 12 dígitos (8 familia + 4 correlativo).
-- Ej: 51111001 = Familia 5111 (Mobiliario), ítem 1001 (Escritorio gerencial)



-- ============================================================================
-- 7.  NORMALIZACIÓN DE ESTADOS A INGLÉS (cambios aplicados)
-- ============================================================================
-- Archivos modificados para usar valores en inglés (coincidiendo con DB):
--
-- a) AssetModal.jsx (líneas de estado por defecto y <option>)
--    Antes: 'DISPONIBLE', 'ASIGNADO', 'INACTIVO', etc.
--    Después: 'AVAILABLE', 'IN_USE', 'INACTIVE', 'MAINTENANCE', 'LOANED'
--
-- b) api.js
--    deleteBienPatrimonial(id):
--      Antes: { asset_status: 'INACTIVO' }
--      Después: { asset_status: 'INACTIVE' }
--    restaurarBienPatrimonial(id):
--      Antes: { asset_status: 'DISPONIBLE' }
--      Después: { asset_status: 'AVAILABLE' }
--
-- c) AssetListPage.jsx (NO modificado en valores, solo display)
--    Las funciones de traducción (getStatusText, getConservationText) y
--    los filtros (getStatusOptions) permanecen bilingües para soportar
--    bienes legacy que aún tengan valores en español en la DB.
--
-- NOTA: Estos cambios solo afectan a ms-04-patrimonio (frontend).
--       La DB ya almacena valores en inglés.



-- ============================================================================
-- 8.  DECISIONES CLAVE ADOPTADAS
-- ============================================================================
--
-- Decisión 1: NO crear movimiento automático al dar de alta un bien.
--   Motivo: SBN/SIGA separan registro (alta) de asignación (entrega).
--   El alta es un evento contable/catastral; la asignación es un evento
--   de custodia. Son dos transacciones distintas.
--   Impacto: El responsable se asigna después mediante una asignación
--   manual que SÍ creará un movimiento INITIAL_ASSIGNMENT.
--
-- Decisión 2: Almacenar estados en inglés en la DB.
--   Motivo: Coherencia con el backend y convención del equipo.
--   Los valores son: AVAILABLE, IN_USE, INACTIVE, MAINTENANCE, LOANED.
--   La UI muestra etiquetas en español mediante funciones getStatusText().
--
-- Decisión 3: Áreas y Ubicaciones Físicas son entidades separadas.
--   Motivo: Una oficina (ubicación física) puede albergar varias áreas
--   (unidades orgánicas) y viceversa. SBN las trata como conceptos
--   distintos: área = responsable presupuestal, ubicación = lugar físico.
--
-- Decisión 4: Estado inicial del bien = 'AVAILABLE'.
--   Motivo: Al registrarse sin asignación inmediata, el bien está
--   disponible para futura asignación. Coincide con SBN.



-- ============================================================================
-- 9.  BRECHAS SBN/SIGA IDENTIFICADAS
-- ============================================================================
--
-- Brecha 1: No hay exportación SIMI/TXT para reporte anual SBN.
--   La SBN exige reportes en formato TXT con estructura fija (cabecera +
--   detalle de bienes). No existe endpoint ni componente para generar este
--   archivo.
--   Posible solución: Nuevo servicio que consulte assets y genere TXT.
--
-- Brecha 2: No hay cierre contable mensual / lote de depreciación.
--   La depreciación mensual debería calcularse en batch para todos los
--   bienes depreciables (useful_life > 0, is_depreciable = true).
--   Tasas SBN: 10% (muebles/AC), 20% (vehículos), 25% (cómputo).
--   Posible solución: Nuevo módulo ms-06-depreciación con job programado.
--
-- Brecha 3: No hay registro automático de ingreso (alta) como movimiento.
--   Aunque decidimos no crearlo automáticamente, cuando se asigne un bien
--   por primera vez (INITIAL_ASSIGNMENT), quedará trazabilidad completa.
--
-- Brecha 4: Códigos SBN hardcodeados en sbnCatalogService.js.
--   Deberían venir del microservicio de catálogo SBN cuando esté listo.
--
-- Brecha 5: asset_code = BP-YYYY-NNN no sigue formato SBN.
--   SBN usa código correlativo por familia, no por año. El asset_code
--   actual es interno del sistema.



-- ============================================================================
-- 10.  APIs DEL MÓDULO (api.js)
-- ============================================================================
-- Ubicación: src/modules/ms-04-patrimonio/services/api.js
--
-- Endpoints consumidos (base: https://lab.vallegrande.edu.pe/gateway/api/v1/assets):
--
--   GET    /assets                              - Listar bienes (con filtros)
--   GET    /assets/:id                          - Obtener bien por ID
--   POST   /assets                              - Crear bien patrimonial
--   PUT    /assets/:id                          - Actualizar bien
--   DELETE /assets/:id                          - Eliminar (cambia estado a INACTIVE)
--   PATCH  /assets/:id/restore                  - Restaurar (cambia estado a AVAILABLE)
--   POST   /assets/bulk                         - Creación masiva
--
--   POST   /assets/:id/assign                   - Asignar bien a responsable
--   POST   /assets/:id/transfer                 - Transferir bien entre áreas
--   GET    /assets/:id/history                  - Historial de movimientos del bien
--
--   GET    /asset-types                         - Tipos de bien
--   GET    /categories                          - Categorías
--   GET    /departments                         - Departamentos/Áreas
--
--   POST   /disposals                           - Crear disposición
--   POST   /disposals/:id/finalize              - Finalizar disposición
--
--   GET    /sbn-catalog                         - Catálogo SBN
--   GET    /sbn-catalog/:family                 - Ítems por familia SBN



-- ============================================================================
-- 11.  INSERCIÓN DE 50 BIENES PATRIMONIALES DE PRUEBA
-- ============================================================================
-- Los siguientes 50 registros insertan bienes patrimoniales realistas para
-- pruebas del módulo ms-04-patrimonio.
--
-- Municipalidad ID: 9178e6e2-5d38-466c-87b0-251ebfe07e53
-- Usuario (created_by): cb4ef95b-3275-4e18-8a0f-ae8671ce7d85
--
-- Distribución:
--   Mobiliario                     (SBN 5111) : 14 bienes  (#1  al #14)
--   Equipos de Cómputo             (SBN 6412) : 16 bienes  (#15 al #30)
--   Maquinaria y Equipo            (SBN 6532) : 5 bienes   (#31 al #35)
--   Refrigeración y AC             (SBN 3381) : 5 bienes   (#36 al #40)
--   Vehículos                      (SBN 3331) : 4 bienes   (#41 al #44)
--   Instrumentos de Medición       (SBN 3341) : 4 bienes   (#45 al #48)
--   Bienes Culturales              (SBN 4611) : 2 bienes   (#49 al #50)
--
-- Todos se insertan con asset_status = 'AVAILABLE' y conservation_status = 'NEW'
-- ============================================================================

-- NOTA: Si category_id da error NOT NULL, consulta tus categorías:
--   SELECT id, name FROM categories;
-- Luego agrega el campo category_id con el UUID correspondiente.

INSERT INTO assets (
  asset_code,
  description,
  sbn_code,
  brand,
  model,
  serial_number,
  color,
  dimensions,
  weight,
  material,
  acquisition_date,
  acquisition_type,
  invoice_number,
  purchase_order_number,
  pecosa_number,
  acquisition_value,
  useful_life,
  is_depreciable,
  requires_maintenance,
  asset_status,
  conservation_status,
  alta_doc_type,
  alta_doc_number,
  alta_date,
  created_by,
  municipality_id
) VALUES

-- ============ MOBILIARIO (SBN 5111) ============

-- 1
(
  'BP-2026-001',
  'Escritorio de madera tipo gerencial de 1.60 m con cajones laterales',
  '51111001',
  'MueblesPerú',
  'GER-160',
  NULL,
  'Caoba',
  '160x80x75 cm',
  45.0,
  'Madera',
  '2026-01-15',
  'PURCHASE',
  'F001-00012001',
  'OC-2026-0001',
  'PECOSA-2026-001',
  1800.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-001',
  '2026-01-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 2
(
  'BP-2026-002',
  'Escritorio de madera tipo oficinista de 1.20 m con bandeja teclado',
  '51111001',
  'MueblesPerú',
  'OFI-120',
  NULL,
  'Caoba',
  '120x60x75 cm',
  35.0,
  'Madera',
  '2026-01-15',
  'PURCHASE',
  'F001-00012001',
  'OC-2026-0001',
  'PECOSA-2026-001',
  1200.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-001',
  '2026-01-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 3
(
  'BP-2026-003',
  'Escritorio de madera tipo oficinista de 1.20 m con bandeja teclado',
  '51111001',
  'MueblesPerú',
  'OFI-120',
  NULL,
  'Caoba',
  '120x60x75 cm',
  35.0,
  'Madera',
  '2026-01-15',
  'PURCHASE',
  'F001-00012001',
  'OC-2026-0001',
  'PECOSA-2026-001',
  1200.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-001',
  '2026-01-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 4
(
  'BP-2026-004',
  'Escritorio de madera tipo oficinista de 1.20 m con bandeja teclado',
  '51111001',
  'MueblesPerú',
  'OFI-120',
  NULL,
  'Caoba',
  '120x60x75 cm',
  35.0,
  'Madera',
  '2026-01-15',
  'PURCHASE',
  'F001-00012001',
  'OC-2026-0001',
  'PECOSA-2026-001',
  1200.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-001',
  '2026-01-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 5
(
  'BP-2026-005',
  'Silla giratoria ergonómica tipo ejecutiva con reposabrazos ajustable',
  '51111002',
  'MueblesPerú',
  'ERG-300',
  NULL,
  'Negro',
  '60x60x110 cm',
  12.0,
  'Cuero sintético/Metal',
  '2026-01-15',
  'PURCHASE',
  'F001-00012002',
  'OC-2026-0001',
  'PECOSA-2026-001',
  650.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-001',
  '2026-01-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 6
(
  'BP-2026-006',
  'Silla giratoria ergonómica tipo ejecutiva con reposabrazos ajustable',
  '51111002',
  'MueblesPerú',
  'ERG-300',
  NULL,
  'Negro',
  '60x60x110 cm',
  12.0,
  'Cuero sintético/Metal',
  '2026-01-15',
  'PURCHASE',
  'F001-00012002',
  'OC-2026-0001',
  'PECOSA-2026-001',
  650.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-001',
  '2026-01-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 7
(
  'BP-2026-007',
  'Silla giratoria ergonómica tipo oficinista estándar',
  '51111002',
  'MueblesPerú',
  'ERG-200',
  NULL,
  'Negro',
  '55x55x100 cm',
  10.0,
  'Malla/Metal',
  '2026-01-15',
  'PURCHASE',
  'F001-00012002',
  'OC-2026-0001',
  'PECOSA-2026-001',
  350.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-001',
  '2026-01-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 8
(
  'BP-2026-008',
  'Silla giratoria ergonómica tipo oficinista estándar',
  '51111002',
  'MueblesPerú',
  'ERG-200',
  NULL,
  'Negro',
  '55x55x100 cm',
  10.0,
  'Malla/Metal',
  '2026-01-15',
  'PURCHASE',
  'F001-00012002',
  'OC-2026-0001',
  'PECOSA-2026-001',
  350.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-001',
  '2026-01-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 9
(
  'BP-2026-009',
  'Silla giratoria ergonómica tipo oficinista estándar',
  '51111002',
  'MueblesPerú',
  'ERG-200',
  NULL,
  'Negro',
  '55x55x100 cm',
  10.0,
  'Malla/Metal',
  '2026-01-15',
  'PURCHASE',
  'F001-00012002',
  'OC-2026-0001',
  'PECOSA-2026-001',
  350.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-001',
  '2026-01-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 10
(
  'BP-2026-010',
  'Archivador metálico 4 gavetas tipo oficinista con cierre de seguridad',
  '51111003',
  'MetálicasPerú',
  'GAV-4',
  NULL,
  'Gris',
  '130x50x60 cm',
  35.0,
  'Metal',
  '2026-01-20',
  'PURCHASE',
  'F001-00012003',
  'OC-2026-0002',
  'PECOSA-2026-002',
  850.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-002',
  '2026-01-20',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 11
(
  'BP-2026-011',
  'Archivador metálico 4 gavetas tipo oficinista con cierre de seguridad',
  '51111003',
  'MetálicasPerú',
  'GAV-4',
  NULL,
  'Gris',
  '130x50x60 cm',
  35.0,
  'Metal',
  '2026-01-20',
  'PURCHASE',
  'F001-00012003',
  'OC-2026-0002',
  'PECOSA-2026-002',
  850.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-002',
  '2026-01-20',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 12
(
  'BP-2026-012',
  'Estante de madera de 5 niveles para archivo de documentos',
  '51111004',
  'MueblesPerú',
  'EST-5N',
  NULL,
  'Caoba',
  '200x40x180 cm',
  40.0,
  'Madera',
  '2026-01-20',
  'PURCHASE',
  'F001-00012004',
  'OC-2026-0002',
  'PECOSA-2026-002',
  680.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-002',
  '2026-01-20',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 13
(
  'BP-2026-013',
  'Estante de madera de 5 niveles para archivo de documentos',
  '51111004',
  'MueblesPerú',
  'EST-5N',
  NULL,
  'Caoba',
  '200x40x180 cm',
  40.0,
  'Madera',
  '2026-01-20',
  'PURCHASE',
  'F001-00012004',
  'OC-2026-0002',
  'PECOSA-2026-002',
  680.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-002',
  '2026-01-20',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 14
(
  'BP-2026-014',
  'Mesa de reuniones rectangular para 8 personas con base metálica',
  '51111005',
  'MueblesPerú',
  'MR-8',
  NULL,
  'Almendra',
  '240x120x75 cm',
  65.0,
  'Madera/Metal',
  '2026-01-25',
  'PURCHASE',
  'F001-00012005',
  'OC-2026-0003',
  'PECOSA-2026-003',
  2500.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-003',
  '2026-01-25',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- ============ EQUIPOS DE CÓMPUTO (SBN 6412) ============

-- 15
(
  'BP-2026-015',
  'Computadora de escritorio todo-en-uno HP ProOne 440 G9 i5/16GB/512SSD',
  '64121001',
  'HP',
  'ProOne 440 G9',
  'HP-ABC-001-2026',
  'Negro',
  '54x35x5 cm',
  6.5,
  'Plástico/Metal',
  '2026-02-01',
  'PURCHASE',
  'F001-00013001',
  'OC-2026-0005',
  'PECOSA-2026-005',
  3500.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-005',
  '2026-02-01',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 16
(
  'BP-2026-016',
  'Computadora de escritorio todo-en-uno HP ProOne 440 G9 i5/16GB/512SSD',
  '64121001',
  'HP',
  'ProOne 440 G9',
  'HP-ABC-002-2026',
  'Negro',
  '54x35x5 cm',
  6.5,
  'Plástico/Metal',
  '2026-02-01',
  'PURCHASE',
  'F001-00013001',
  'OC-2026-0005',
  'PECOSA-2026-005',
  3500.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-005',
  '2026-02-01',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 17
(
  'BP-2026-017',
  'Computadora de escritorio todo-en-uno HP ProOne 440 G9 i5/16GB/512SSD',
  '64121001',
  'HP',
  'ProOne 440 G9',
  'HP-ABC-003-2026',
  'Negro',
  '54x35x5 cm',
  6.5,
  'Plástico/Metal',
  '2026-02-01',
  'PURCHASE',
  'F001-00013001',
  'OC-2026-0005',
  'PECOSA-2026-005',
  3500.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-005',
  '2026-02-01',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 18
(
  'BP-2026-018',
  'Computadora de escritorio todo-en-uno HP ProOne 440 G9 i5/16GB/512SSD',
  '64121001',
  'HP',
  'ProOne 440 G9',
  'HP-ABC-004-2026',
  'Negro',
  '54x35x5 cm',
  6.5,
  'Plástico/Metal',
  '2026-02-01',
  'PURCHASE',
  'F001-00013001',
  'OC-2026-0005',
  'PECOSA-2026-005',
  3500.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-005',
  '2026-02-01',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 19
(
  'BP-2026-019',
  'Computadora de escritorio todo-en-uno HP ProOne 440 G9 i5/16GB/512SSD',
  '64121001',
  'HP',
  'ProOne 440 G9',
  'HP-ABC-005-2026',
  'Negro',
  '54x35x5 cm',
  6.5,
  'Plástico/Metal',
  '2026-02-01',
  'PURCHASE',
  'F001-00013001',
  'OC-2026-0005',
  'PECOSA-2026-005',
  3500.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-005',
  '2026-02-01',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 20
(
  'BP-2026-020',
  'Computadora portátil Lenovo ThinkPad X1 Carbon Gen 12 i7/32GB/1TB',
  '64121002',
  'Lenovo',
  'ThinkPad X1 Carbon Gen 12',
  'LEN-SN-001-2026',
  'Gris oscuro',
  '31x22x1.5 cm',
  1.2,
  'Aluminio',
  '2026-02-05',
  'PURCHASE',
  'F001-00013002',
  'OC-2026-0006',
  'PECOSA-2026-006',
  5200.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-006',
  '2026-02-05',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 21
(
  'BP-2026-021',
  'Computadora portátil Lenovo ThinkPad X1 Carbon Gen 12 i7/32GB/1TB',
  '64121002',
  'Lenovo',
  'ThinkPad X1 Carbon Gen 12',
  'LEN-SN-002-2026',
  'Gris oscuro',
  '31x22x1.5 cm',
  1.2,
  'Aluminio',
  '2026-02-05',
  'PURCHASE',
  'F001-00013002',
  'OC-2026-0006',
  'PECOSA-2026-006',
  5200.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-006',
  '2026-02-05',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 22
(
  'BP-2026-022',
  'Computadora portátil Lenovo ThinkPad X1 Carbon Gen 12 i7/32GB/1TB',
  '64121002',
  'Lenovo',
  'ThinkPad X1 Carbon Gen 12',
  'LEN-SN-003-2026',
  'Gris oscuro',
  '31x22x1.5 cm',
  1.2,
  'Aluminio',
  '2026-02-05',
  'PURCHASE',
  'F001-00013002',
  'OC-2026-0006',
  'PECOSA-2026-006',
  5200.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-006',
  '2026-02-05',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 23
(
  'BP-2026-023',
  'Computadora portátil Lenovo ThinkPad X1 Carbon Gen 12 i7/32GB/1TB',
  '64121002',
  'Lenovo',
  'ThinkPad X1 Carbon Gen 12',
  'LEN-SN-004-2026',
  'Gris oscuro',
  '31x22x1.5 cm',
  1.2,
  'Aluminio',
  '2026-02-05',
  'PURCHASE',
  'F001-00013002',
  'OC-2026-0006',
  'PECOSA-2026-006',
  5200.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-006',
  '2026-02-05',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 24
(
  'BP-2026-024',
  'Impresora láser monocromática HP LaserJet Enterprise M507',
  '64121003',
  'HP',
  'LaserJet Enterprise M507',
  'HP-IMP-001-2026',
  'Blanco',
  '50x40x30 cm',
  15.0,
  'Plástico/Metal',
  '2026-02-10',
  'PURCHASE',
  'F001-00013003',
  'OC-2026-0007',
  'PECOSA-2026-007',
  2800.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-007',
  '2026-02-10',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 25
(
  'BP-2026-025',
  'Impresora láser monocromática HP LaserJet Enterprise M507',
  '64121003',
  'HP',
  'LaserJet Enterprise M507',
  'HP-IMP-002-2026',
  'Blanco',
  '50x40x30 cm',
  15.0,
  'Plástico/Metal',
  '2026-02-10',
  'PURCHASE',
  'F001-00013003',
  'OC-2026-0007',
  'PECOSA-2026-007',
  2800.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-007',
  '2026-02-10',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 26
(
  'BP-2026-026',
  'Impresora multifuncional HP LaserJet Pro MFP M428fdw',
  '64121003',
  'HP',
  'LaserJet Pro MFP M428fdw',
  'HP-MFP-001-2026',
  'Blanco',
  '42x38x35 cm',
  12.0,
  'Plástico/Metal',
  '2026-02-10',
  'PURCHASE',
  'F001-00013004',
  'OC-2026-0007',
  'PECOSA-2026-007',
  3200.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-007',
  '2026-02-10',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 27
(
  'BP-2026-027',
  'Monitor LCD/LED HP 24 pulgadas Full HD',
  '64121006',
  'HP',
  'P24v G5',
  'HP-MON-001-2026',
  'Negro',
  '54x18x40 cm',
  3.5,
  'Plástico',
  '2026-02-01',
  'PURCHASE',
  'F001-00013001',
  'OC-2026-0005',
  'PECOSA-2026-005',
  550.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-005',
  '2026-02-01',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 28
(
  'BP-2026-028',
  'Monitor LCD/LED HP 24 pulgadas Full HD',
  '64121006',
  'HP',
  'P24v G5',
  'HP-MON-002-2026',
  'Negro',
  '54x18x40 cm',
  3.5,
  'Plástico',
  '2026-02-01',
  'PURCHASE',
  'F001-00013001',
  'OC-2026-0005',
  'PECOSA-2026-005',
  550.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-005',
  '2026-02-01',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 29
(
  'BP-2026-029',
  'Servidor Dell PowerEdge R360 Xeon/32GB/2TB RAID',
  '64121007',
  'Dell',
  'PowerEdge R360',
  'DELL-SRV-001-2026',
  'Negro',
  '48x73x4.5 cm',
  12.0,
  'Metal',
  '2026-02-15',
  'PURCHASE',
  'F001-00013005',
  'OC-2026-0008',
  'PECOSA-2026-008',
  18500.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-008',
  '2026-02-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 30
(
  'BP-2026-030',
  'Teléfono celular Samsung Galaxy XCover6 Pro para uso institucional',
  '64121009',
  'Samsung',
  'Galaxy XCover6 Pro',
  'SAM-CEL-001-2026',
  'Negro',
  '17x8x1 cm',
  0.3,
  'Plástico/Vidrio',
  '2026-02-20',
  'PURCHASE',
  'F001-00013006',
  'OC-2026-0009',
  'PECOSA-2026-009',
  2500.00,
  4,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-009',
  '2026-02-20',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- ============ MAQUINARIA Y EQUIPO (SBN 6532) ============

-- 31
(
  'BP-2026-031',
  'Fotocopiadora multifuncional Canon imageRUNNER 2625i blanco/negro',
  '65321001',
  'Canon',
  'imageRUNNER 2625i',
  'CAN-COP-001-2026',
  'Blanco/Gris',
  '60x65x110 cm',
  65.0,
  'Plástico/Metal',
  '2026-02-25',
  'PURCHASE',
  'F001-00014001',
  'OC-2026-0010',
  'PECOSA-2026-010',
  8500.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-010',
  '2026-02-25',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 32
(
  'BP-2026-032',
  'Proyector multimedia Epson PowerLite L200 láser WUXGA',
  '65321002',
  'Epson',
  'PowerLite L200',
  'EPS-PRO-001-2026',
  'Negro',
  '35x25x12 cm',
  3.5,
  'Plástico',
  '2026-03-01',
  'DONATION',
  NULL,
  NULL,
  'PECOSA-2026-011',
  4200.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'RESOLUTION',
  'Res. N° 015-2026-OGA',
  '2026-03-01',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 33
(
  'BP-2026-033',
  'Ecógrafo portátil Samsung HS70A para diagnóstico por imágenes',
  '65321002',
  'Samsung',
  'HS70A',
  'SAM-ECO-001-2026',
  'Negro/Gris',
  '40x30x15 cm',
  8.0,
  'Plástico/Metal',
  '2026-03-05',
  'PURCHASE',
  'F001-00014002',
  'OC-2026-0011',
  'PECOSA-2026-012',
  45000.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-012',
  '2026-03-05',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 34
(
  'BP-2026-034',
  'Electrocardiógrafo digital Cardioline ClickECG 12 derivaciones',
  '33611001',
  'Cardioline',
  'ClickECG',
  'CAR-ECG-001-2026',
  'Blanco',
  '30x25x10 cm',
  2.5,
  'Plástico',
  '2026-03-05',
  'PURCHASE',
  'F001-00014002',
  'OC-2026-0011',
  'PECOSA-2026-012',
  8500.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-012',
  '2026-03-05',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 35
(
  'BP-2026-035',
  'Silla de ruedas plegable aluminio reforzado con reposapiés',
  '33611004',
  'Ortomédica',
  'SR-500',
  NULL,
  'Plata',
  '100x60x90 cm',
  15.0,
  'Aluminio/Tela',
  '2026-03-10',
  'PURCHASE',
  'F001-00014003',
  'OC-2026-0012',
  'PECOSA-2026-013',
  650.00,
  10,
  true,
  false,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-013',
  '2026-03-10',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- ============ REFRIGERACIÓN Y AC (SBN 3381) ============

-- 36
(
  'BP-2026-036',
  'Aire acondicionado tipo split 12000 BTU Samsung AR12RVH',
  '33811001',
  'Samsung',
  'AR12RVH',
  'SAM-AA-001-2026',
  'Blanco',
  '80x30x25 cm',
  12.0,
  'Plástico/Metal',
  '2026-03-15',
  'PURCHASE',
  'F001-00014004',
  'OC-2026-0013',
  'PECOSA-2026-014',
  2500.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-014',
  '2026-03-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 37
(
  'BP-2026-037',
  'Aire acondicionado tipo split 12000 BTU Samsung AR12RVH',
  '33811001',
  'Samsung',
  'AR12RVH',
  'SAM-AA-002-2026',
  'Blanco',
  '80x30x25 cm',
  12.0,
  'Plástico/Metal',
  '2026-03-15',
  'PURCHASE',
  'F001-00014004',
  'OC-2026-0013',
  'PECOSA-2026-014',
  2500.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-014',
  '2026-03-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 38
(
  'BP-2026-038',
  'Aire acondicionado tipo split 18000 BTU LG Dual Inverter',
  '33811001',
  'LG',
  'Dual Inverter 18K',
  'LG-AA-001-2026',
  'Blanco',
  '90x35x30 cm',
  14.0,
  'Plástico/Metal',
  '2026-03-15',
  'PURCHASE',
  'F001-00014004',
  'OC-2026-0013',
  'PECOSA-2026-014',
  3200.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-014',
  '2026-03-15',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 39
(
  'BP-2026-039',
  'Refrigeradora Samsung 12 pies cúbicos uso institucional',
  '33811003',
  'Samsung',
  'RT29K5030S8',
  'SAM-REF-001-2026',
  'Inoxidable',
  '70x75x170 cm',
  55.0,
  'Metal',
  '2026-03-20',
  'PURCHASE',
  'F001-00014005',
  'OC-2026-0014',
  'PECOSA-2026-015',
  2200.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-015',
  '2026-03-20',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 40
(
  'BP-2026-040',
  'Congeladora industrial horizontal 500 L marca Indurama',
  '33811004',
  'Indurama',
  'CH-500',
  'IND-CONG-001-2026',
  'Blanco',
  '150x80x90 cm',
  60.0,
  'Metal',
  '2026-03-20',
  'PURCHASE',
  'F001-00014006',
  'OC-2026-0014',
  'PECOSA-2026-015',
  3800.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-015',
  '2026-03-20',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- ============ VEHÍCULOS (SBN 3331) ============

-- 41
(
  'BP-2026-041',
  'Camioneta pick-up Toyota Hilux 4x4 doble cabina diésel',
  '33311002',
  'Toyota',
  'Hilux 4x4 SRV',
  '8AJAB3CD6K0001001',
  'Blanco',
  '530x180x180 cm',
  2100.0,
  'Metal',
  '2026-03-25',
  'PURCHASE',
  'F001-00015001',
  'OC-2026-0015',
  'PECOSA-2026-016',
  95000.00,
  5,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-016',
  '2026-03-25',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 42
(
  'BP-2026-042',
  'Camioneta pick-up Toyota Hilux 4x4 doble cabina diésel',
  '33311002',
  'Toyota',
  'Hilux 4x4 SRV',
  '8AJAB3CD6K0001002',
  'Blanco',
  '530x180x180 cm',
  2100.0,
  'Metal',
  '2026-03-25',
  'PURCHASE',
  'F001-00015001',
  'OC-2026-0015',
  'PECOSA-2026-016',
  95000.00,
  5,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-016',
  '2026-03-25',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 43
(
  'BP-2026-043',
  'Automóvil sedán Toyota Corolla Cross 4x2 gasolina',
  '33311001',
  'Toyota',
  'Corolla Cross 4x2',
  '8AJAB3CD6K0002001',
  'Plateado',
  '450x180x160 cm',
  1400.0,
  'Metal',
  '2026-03-25',
  'PURCHASE',
  'F001-00015002',
  'OC-2026-0015',
  'PECOSA-2026-016',
  75000.00,
  5,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-016',
  '2026-03-25',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 44
(
  'BP-2026-044',
  'Motocicleta lineal Honda Tornado XR 250 para uso de campo',
  '33311003',
  'Honda',
  'Tornado XR 250',
  'HONDA-MOTO-001-2026',
  'Rojo',
  '220x85x120 cm',
  120.0,
  'Metal',
  '2026-03-25',
  'PURCHASE',
  'F001-00015003',
  'OC-2026-0015',
  'PECOSA-2026-016',
  15000.00,
  5,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-016',
  '2026-03-25',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- ============ INSTRUMENTOS DE MEDICIÓN (SBN 3341) ============

-- 45
(
  'BP-2026-045',
  'Balanza electrónica de precisión granataria 3000 g x 0.01 g',
  '33411001',
  'Ohaus',
  'Scout SPX3000',
  'OHAUS-BAL-001-2026',
  'Gris',
  '30x25x15 cm',
  4.0,
  'Plástico/Metal',
  '2026-04-01',
  'PURCHASE',
  'F001-00016001',
  'OC-2026-0016',
  'PECOSA-2026-017',
  2800.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-017',
  '2026-04-01',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 46
(
  'BP-2026-046',
  'Termómetro industrial digital infrarrojo -50°C a 550°C',
  '33411003',
  'Fluke',
  '62 MAX+',
  'FLUKE-TERM-001-2026',
  'Amarillo',
  '20x5x3 cm',
  0.3,
  'Plástico',
  '2026-04-01',
  'PURCHASE',
  'F001-00016001',
  'OC-2026-0016',
  'PECOSA-2026-017',
  850.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-017',
  '2026-04-01',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 47
(
  'BP-2026-047',
  'Osciloscopio digital 2 canales 100 MHz Siglent SDS1102CML+',
  '33411002',
  'Siglent',
  'SDS1102CML+',
  'SIG-OSC-001-2026',
  'Gris/Azul',
  '35x15x20 cm',
  3.0,
  'Plástico/Metal',
  '2026-04-05',
  'PURCHASE',
  'F001-00016002',
  'OC-2026-0017',
  'PECOSA-2026-018',
  4200.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-018',
  '2026-04-05',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 48
(
  'BP-2026-048',
  'Balanza electrónica de precisión analítica 220 g x 0.0001 g',
  '33411001',
  'Ohaus',
  'Analytical PA224',
  'OHAUS-BAL-002-2026',
  'Gris',
  '25x20x35 cm',
  6.0,
  'Plástico/Metal',
  '2026-04-05',
  'PURCHASE',
  'F001-00016002',
  'OC-2026-0017',
  'PECOSA-2026-018',
  6500.00,
  10,
  true,
  true,
  'AVAILABLE',
  'NEW',
  'PECOSA',
  'PECOSA-2026-018',
  '2026-04-05',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- ============ BIENES CULTURALES (SBN 4611) ============

-- 49
(
  'BP-2026-049',
  'Óleo sobre lienzo "Paisaje Andino" del artista local José Quispe (2025)',
  '46111001',
  NULL,
  NULL,
  NULL,
  'Multicolor',
  '80x60x3 cm',
  2.0,
  'Lienzo/Madera',
  '2026-04-10',
  'DONATION',
  NULL,
  NULL,
  'PECOSA-2026-019',
  3500.00,
  NULL,
  false,
  false,
  'AVAILABLE',
  'NEW',
  'RESOLUTION',
  'Res. N° 030-2026-OGA',
  '2026-04-10',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
),

-- 50
(
  'BP-2026-050',
  'Escultura en bronce "El Cóndor" del escultor local Juan Pérez',
  '46111002',
  NULL,
  NULL,
  NULL,
  'Bronce',
  '40x30x60 cm',
  15.0,
  'Bronce',
  '2026-04-10',
  'DONATION',
  NULL,
  NULL,
  'PECOSA-2026-019',
  5500.00,
  NULL,
  false,
  false,
  'AVAILABLE',
  'NEW',
  'RESOLUTION',
  'Res. N° 030-2026-OGA',
  '2026-04-10',
  'cb4ef95b-3275-4e18-8a0f-ae8671ce7d85',
  '9178e6e2-5d38-466c-87b0-251ebfe07e53'
);
