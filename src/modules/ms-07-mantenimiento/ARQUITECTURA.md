# Arquitectura del Módulo de Mantenimiento

## Flujo de Autenticación y Permisos

```
Gateway (Nginx/Kong)
  │
  ├─ Header X-User-Id       → UUID del usuario autenticado
  ├─ Header X-Roles         → Roles del usuario (separados por coma)
  ├─ Header X-Permissions   → Permisos del usuario (separados por coma)
  ├─ Header X-Municipal-Code → ID de la municipalidad
  │
  ▼
GatewayHeaderAuthenticationFilter (backend)
  │
  ├─ Extrae permisos de X-Permissions o JWT payload "permissions"
  ├─ Formatea como authorities: "mantenimiento:create:*"
  ├─ Extrae userId del X-User-Id o JWT "sub"
  └─ Crea Authentication en el contexto reactivo
      │
      ▼
  MaintenanceController (@PreAuthorize)
      │
      ├─ create  → @PreAuthorize("hasAnyAuthority('mantenimiento:create:*')")
      ├─ read    → @PreAuthorize("hasAnyAuthority('mantenimiento:read:*')")
      ├─ update  → @PreAuthorize("hasAnyAuthority('mantenimiento:update:*')")
      ├─ start/complete/suspend/cancel/reschedule
      │          → @PreAuthorize("hasAnyAuthority('mantenimiento:execute:process')")
      ├─ confirm → @PreAuthorize("hasAnyAuthority('mantenimiento:confirm:sign')")
      └─ addPart → @PreAuthorize("hasAnyAuthority('mantenimiento:execute:process')")
                    (corregido: antes era update:*)
```

## Permisos Finales

| Permiso | Backend (`@PreAuthorize`) | Frontend | ¿Qué controla? |
|---------|--------------------------|----------|----------------|
| `mantenimiento:create:*` | `create` | `canCreate` | Crear nueva solicitud |
| `mantenimiento:read:*` | `findById`, `findAll`, `findByStatus`, `getParts`, `getHistory`, `getConformity` | — | Acceso general |
| `mantenimiento:update:*` | `update` | `canUpdate` | Editar mantenimiento |
| `mantenimiento:execute:process` | `addPart`, `start`, `complete`, `suspend`, `cancel`, `reschedule` | `canExecute` | Agregar repuestos, cambiar estados |
| `mantenimiento:confirm:sign` | `confirm` | `canConfirm` | Conformidad SBN |
| `mantenimiento:viewCosts:*` | — | `canViewCosts` | Ver costos en frontend |

## Mapeo de Acciones vs Permisos (Frontend corregido)

### Tabla de Mantenimientos (`MaintenanceTable`)

| Acción | Permiso Requerido | Visible cuando... |
|--------|-------------------|-------------------|
| Editar | `canUpdate` | Estado SCHEDULED o SUSPENDED |
| Descargar Ficha | *Siempre* | — |
| Acta SBN (Conformidad) | *Siempre* | Estado CONFIRMED |
| Iniciar | `canExecute` | Estado SCHEDULED |
| Completar | `canExecute` | Estado IN_PROCESS |
| Suspender | `canExecute` | Estado SCHEDULED o IN_PROCESS |
| Cancelar | `canExecute` | Estado SCHEDULED, IN_PROCESS o SUSPENDED |
| Reprogramar | `canExecute` | Estado SCHEDULED o SUSPENDED |
| Conformidad | `canConfirm` | Estado PENDING_CONFORMITY |

### Detalle de Mantenimiento (`MaintenanceDetails`)

| Acción | Permiso Requerido | Visible cuando... |
|--------|-------------------|-------------------|
| Reprogramar +1 día | `canUpdate` | Vencido o por vencer |
| Agregar repuestos | `canExecute` | Estado IN_PROCESS |
| Ver resumen financiero | `canViewCosts` | Siempre |

## Lógica de Garantía y Proveedores (Requerimiento 1)

### Backend (`PatrimonioServiceClient.fillAssetDetails()`)

```java
if (response.getSupplierId() != null) {
    boolean hasValidWarranty = Boolean.TRUE.equals(response.getHasWarranty())
            && response.getWarrantyExpirationDate() != null
            && !response.getWarrantyExpirationDate().isBefore(LocalDate.now());
    if (hasValidWarranty) {
        maintenance.setServiceSupplierId(response.getSupplierId());
    }
}
```

### ¿Cuándo se ejecuta?

- **`create()`** — Se llama después de generar el código, antes de guardar. Auto-asigna el proveedor según la garantía del activo.
- **`update()`** — Ahora también llama a `fillAssetDetails()` antes de guardar (corregido). Revalida la garantía al editar.

### Comportamiento

| Escenario | Backend hace | Frontend muestra |
|-----------|-------------|-----------------|
| Activo con garantía vigente + proveedor asignado | Auto-asigna `serviceSupplierId` del activo | Selector de proveedor bloqueado (solo lectura) |
| Activo con garantía vencida | No modifica `serviceSupplierId` | Selector de proveedor libre |
| Activo sin garantía | No modifica `serviceSupplierId` | Selector de proveedor libre |

## Cambios Realizados

### Backend

| Archivo | Cambio |
|---------|--------|
| `MaintenanceController.java:466` | `addPart`: `update:*` → `execute:process` |
| `MaintenanceUseCase.java:152-153` | `update()` ahora llama a `fillAssetDetails()` para revalidar garantía |

### Frontend

| Archivo | Cambio |
|---------|--------|
| `MaintenanceTable.jsx:512` | `suspend`/`cancel`/`reschedule`: `canUpdate` → `canExecute` |
| `MaintenanceDetails.jsx:47` | Agregada prop `canExecute` |
| `MaintenanceDetails.jsx:1168,1172` | Botón "Registrar" repuesto: `canUpdate` → `canExecute` |
| `index.jsx:761` | Pasada prop `canExecute` a `MaintenanceDetails` |

### Cambios Anteriores (Frontend)

| Archivo | Cambio |
|---------|--------|
| `hooks/useMaintenance.js` | Eliminado `isTecnico` (rol), filtro por defecto vacío |
| `pages/index.jsx` | Botón crear usa `canCreate`, props muertas eliminadas |
| `MaintenanceForm.jsx` | Validación corregida, `hasWarranty` delegado al mapper |
| `MaintenanceStatusFlow.jsx` | `serviceSupplierId` al init del modal confirm |
| `utils/maintenanceMapper.js` | Único responsable de procesar `hasWarranty` |
| `PERMISOS.md` | Documentación creada |

## Notas

- **El sistema es 100% permisivo, no por roles.** No existe `isTecnico` ni `isGestor` en el frontend.
- **El backend es la fuente de verdad.** El frontend solo oculta/muestra botones según permisos.
- **`addPart` ahora requiere `execute:process`** para que el técnico pueda agregar repuestos sin tener permiso de actualización general.
- **La garantía se revalida en cada actualización** del mantenimiento, no solo al crearlo.
