export const MaintenanceType = {
  PREVENTIVE: 'PREVENTIVE',
  CORRECTIVE: 'CORRECTIVE',
  PREDICTIVE: 'PREDICTIVE',
  EMERGENCY: 'EMERGENCY',
};

export const TYPE_LABELS = {
  PREVENTIVE: 'Preventivo',
  CORRECTIVE: 'Correctivo',
  PREDICTIVE: 'Predictivo',
  EMERGENCY: 'Emergencia',
};

export const TYPE_COLORS = {
  PREVENTIVE: { bg: '#EEF2FF', text: '#4338CA' },
  CORRECTIVE: { bg: '#FFF7ED', text: '#C2410C' },
  PREDICTIVE: { bg: '#F0FDF4', text: '#15803D' },
  EMERGENCY: { bg: '#FEF2F2', text: '#B91C1C' },
};

export const Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

export const PRIORITY_LABELS = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const PRIORITY_COLORS = {
  LOW: { bg: '#F1F5F9', text: '#475569' },
  MEDIUM: { bg: '#E0F2FE', text: '#0369A1' },
  HIGH: { bg: '#FFEDD5', text: '#9A3412' },
  CRITICAL: { bg: '#FEE2E2', text: '#991B1B' },
};

export const MaintenanceStatus = {
  SCHEDULED: 'SCHEDULED',
  IN_PROCESS: 'IN_PROCESS',
  PENDING_CONFORMITY: 'PENDING_CONFORMITY',
  CONFIRMED: 'CONFIRMED',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
};

export const STATUS_LABELS = {
  SCHEDULED: 'Programado',
  IN_PROCESS: 'En Proceso',
  PENDING_CONFORMITY: 'Pend. Conformidad',
  CONFIRMED: 'Confirmado',
  SUSPENDED: 'Suspendido',
  CANCELLED: 'Cancelado',
};

export const STATUS_COLORS = {
  SCHEDULED: { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8' },
  IN_PROCESS: { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  PENDING_CONFORMITY: { bg: '#F0FDFA', text: '#0F766E', dot: '#14B8A6' },
  CONFIRMED: { bg: '#EEF2FF', text: '#4338CA', dot: '#6366F1' },
  SUSPENDED: { bg: '#FFF7ED', text: '#C2410C', dot: '#F97316' },
  CANCELLED: { bg: '#FEF2F2', text: '#B91C1C', dot: '#EF4444' },
};

export const STATUS_TRANSITIONS = {
  SCHEDULED: [
    { action: 'start', label: 'Iniciar', color: '#F59E0B' },
    { action: 'suspend', label: 'Suspender', color: '#F97316' },
    { action: 'reschedule', label: 'Reprogramar', color: '#6366F1' },
    { action: 'cancel', label: 'Cancelar', color: '#EF4444' },
  ],
  IN_PROCESS: [
    { action: 'complete', label: 'Completar', color: '#10B981' },
    { action: 'suspend', label: 'Suspender', color: '#F97316' },
    { action: 'cancel', label: 'Cancelar', color: '#EF4444' },
  ],
  PENDING_CONFORMITY: [
    { action: 'confirm', label: 'Conformidad', color: '#14B8A6' },
  ],
  SUSPENDED: [
    { action: 'reschedule', label: 'Reanudar', color: '#6366F1' },
    { action: 'cancel', label: 'Cancelar', color: '#EF4444' },
  ],
};

export const WORK_QUALITY_LABELS = {
  EXCELLENT: 'Excelente',
  GOOD: 'Bueno',
  ACCEPTABLE: 'Aceptable',
  DEFICIENT: 'Deficiente',
};

export const ASSET_CONDITION_LABELS = {
  OPTIMAL: 'Óptimo / Como nuevo',
  OPERATIONAL: 'Operativo',
  PARTIAL: 'Operatividad parcial',
  REQUIRES_FOLLOWUP: 'Requiere seguimiento',
  NON_OPERATIONAL: 'No operativo',
};

