# Sistema de Permisos - Módulo de Mantenimiento

## Arquitectura

El módulo funciona con un sistema **100% basado en permisos**, no en roles. Los roles pueden variar, pero lo que realmente controla el acceso a cada funcionalidad son los **permisos individuales** que el backend otorga al usuario autenticado.

## Permisos Disponibles

| Permiso | Función en Frontend | ¿Qué controla? |
|---------|--------------------|----------------|
| `mantenimiento.read` | `canRead` | Acceso general al módulo |
| `mantenimiento.create` | `canCreate` | Botón **"Nueva Solicitud"** |
| `mantenimiento.update` | `canUpdate` | Editar mantenimiento, suspender, cancelar, reprogramar, agregar repuestos |
| `mantenimiento.execute` / `mantenimiento.process` | `canExecute` | **Iniciar** y **Completar** mantenimiento |
| `mantenimiento.confirm` / `mantenimiento.sign` | `canConfirm` | Botón de **Conformidad SBN** |
| `mantenimiento.viewCosts` | `canViewCosts` | Visualizar costos en detalles y PDFs |

## Mapeo de Acciones vs Permisos

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

| Acción | Permiso Requerido |
|--------|-------------------|
| Reprogramar +1 día | `canUpdate` |
| Agregar repuestos | `canExecute` (solo en estado IN_PROCESS) |
| Ver resumen financiero | `canViewCosts` |

### Formulario de Creación/Edición (`MaintenanceForm`)

| Acción | Permiso Requerido |
|--------|-------------------|
| Crear nuevo mantenimiento | `canCreate` |
| Editar mantenimiento existente | `canUpdate` |

## Lógica de Garantía y Proveedores

La selección del proveedor está desacoplada de los permisos y sigue esta lógica:

1. **Garantía Vigente**: El proveedor se bloquea automáticamente al del bien seleccionado.
2. **Garantía Vencida o Sin Garantía**: El usuario puede seleccionar cualquier proveedor libremente.

## Cómo se obtienen los permisos

En `useMaintenance.js`:

```js
const { canDo } = usePermissions();

const canCreate = canDo("mantenimiento", "create");
const canUpdate = canDo("mantenimiento", "update");
const canExecute = canDo("mantenimiento", "execute", "process");
const canConfirm = canDo("mantenimiento", "confirm", "sign");
const canViewCosts = canDo("mantenimiento", "viewCosts");
```

`canDo` recibe el módulo y uno o más permisos. Retorna `true` si el usuario tiene **al menos uno** de los permisos listados.

## Notas importantes

- **No se usan roles** en las verificaciones del frontend. No existe `isTecnico`, `isGestor`, etc. como control de acceso.
- El único caso especial es `isSuperAdmin` que muestra una pantalla de "Acceso Restringido" porque el Super Administrador no debe operar módulos municipales.
- El backend es la fuente de verdad de los permisos. El frontend solo consulta y reacciona.
