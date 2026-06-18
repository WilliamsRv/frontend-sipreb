import { useState, useEffect, useRef } from 'react';
import authService from '../../ms-02-authentication/services/auth.service';
import { getBienPatrimonialById } from '../../ms-04-patrimonio/services/api';
import assetMovementService from '../services/assetMovementService';
import {
  uploadMultipleMovementDocuments,
  prepareAttachedDocuments,
  parseAttachedDocuments,
  validateMovementFile,
} from '../services/movementDocumentService';
import { filterAssetsByMovementType, getAssetFilterMessage } from '../utils/assetFilters';
import {
  resolveAssetAssignmentContext,
  getOriginFromContext,
  isMovementTypeAllowed,
  validateAssetStatusForContext,
  validateAssetGroupCompatibility,
  buildGroupAssignmentContext,
  getNewAssetIncompatibilityMessage,
  validateEachAssetForMovementType,
  validateMovementQuantityForAsset,
  getMaxQuantityForMovement,
} from '../utils/movementAssetContext';
import {
  SUPPORTING_DOCUMENT_TYPE_DEFAULT,
  validateField,
  validateForm,
  validateCrossFields,
  validateSupportingDocumentNumber,
  isSupportingDocumentNumberDuplicate,
  generateNextSupportingDocumentNumber,
  rememberSupportingDocumentNumber,
} from '../utils/movementFormValidation';
import { MovementType, MovementStatus } from '../types/movementTypes';
import {
  getRequestingUsersForArea,
  getRequestingUserFilterAreaId,
  getUserAccountId,
  requestingUserUsesAreaFilter,
} from '../utils/movementUserAreaUtils';
import { normalizeMovementForForm } from '../utils/movementReportHelpers';
const INITIAL_FORM = {
  assetId: '',
  assetIds: [],
  assetItems: [],
  movementType: '',
  movementSubtype: '',
  originResponsibleId: '',
  destinationResponsibleId: '',
  originAreaId: '',
  destinationAreaId: '',
  originLocationId: '',
  destinationLocationId: '',
  reason: '',
  observations: '',
  specialConditions: '',
  supportingDocumentNumber: '',
  supportingDocumentType: '',
  attachedDocuments: '',
  requiresApproval: true,
  movementStatus: MovementStatus.REQUESTED,
  requestingUser: '',
  executingUser: '',
};
const getCurrentUserId = () => {
  const currentUser = authService.getCurrentUser();
  if (currentUser?.userId || currentUser?.id) return currentUser.userId || currentUser.id;
  try {
    const stored = JSON.parse(sessionStorage.getItem('user') || 'null');
    if (stored?.userId || stored?.id) return stored.userId || stored.id;
  } catch {  }
  try {
    const token = sessionStorage.getItem('accessToken');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id || payload.sub || payload.userId || payload.id;
    }
  } catch {  }
  return null;
};
const findWarehouseArea = (areas) =>
  areas.find(a => {
    const code = (a.areaCode || '').toUpperCase();
    const name = (a.name || '').toLowerCase();
    return code === 'DGA-PAT-06' || name.includes('almacen') || name.includes('almacén') || name.includes('logistica') || name.includes('logística') || name.includes('abastecimiento');
  });
const findWarehouseLocation = (locations) =>
  locations.find(l => {
    const code = (l.locationCode || '').toUpperCase();
    const name = (l.name || '').toLowerCase();
    return code === 'LOC-003' || name.includes('logística y abastecimiento') ||
      name.includes('logistica y abastecimiento') || name.includes('almacén') || name.includes('almacen') || name.includes('logistica') || name.includes('logística');
  });
export function useMovementForm({ movement, assets, users, persons, areas, locations, loadingData, onSave }) {
  const [formData, setFormData] = useState({ ...INITIAL_FORM });
  const [displayAssets, setDisplayAssets] = useState([]);
  const [assetFilterMessage, setAssetFilterMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loadingAssetLocation, setLoadingAssetLocation] = useState(false);
  const [assetLocationLoaded, setAssetLocationLoaded] = useState(false);
  const [isFirstAssignment, setIsFirstAssignment] = useState(false);
  const [activeTab, setActiveTab] = useState('basica');
  const [formProgress, setFormProgress] = useState({ completed: 0, total: 0, percentage: 0 });
  const [checkingActiveMovements, setCheckingActiveMovements] = useState(false);
  const [activeMovementWarning, setActiveMovementWarning] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [checkingDocumentDuplicate, setCheckingDocumentDuplicate] = useState(false);
  const [suggestedMovementType, setSuggestedMovementType] = useState(null);
  const [assetMovementStatus, setAssetMovementStatus] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [assetContextMap, setAssetContextMap] = useState({});
  const [assetPickerValue, setAssetPickerValue] = useState('');

  const canEditAssets = !movement
    || [MovementStatus.REQUESTED, MovementStatus.APPROVED].includes(
      formData.movementStatus || movement?.movementStatus
    );

  const syncAssetFields = (items) => {
    const normalized = (items || []).map((item) => ({
      assetId: item.assetId,
      quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    }));
    return {
      assetItems: normalized,
      assetIds: normalized.map((item) => item.assetId),
      assetId: normalized[0]?.assetId || '',
    };
  };

  const resolveAssetId = (asset) => asset?.id || asset?.assetId || asset?.uuid || null;

  const fetchAssetContextEntry = async (assetId, assetFromList = null) => {
    const asset =
      assetFromList ||
      selectedAssets.find((a) => resolveAssetId(a) === assetId) ||
      assets?.find((a) => resolveAssetId(a) === assetId) ||
      (await getBienPatrimonialById(assetId));
    const movements = await assetMovementService.getMovementsByAsset(assetId);
    const context = resolveAssetAssignmentContext(asset, movements);
    return { assetId, asset, context };
  };

  const applyGroupContextFromEntries = (entries, { clearGroupError = true } = {}) => {
    const map = Object.fromEntries(entries.map((entry) => [entry.assetId, entry]));
    setAssetContextMap(map);
    setSelectedAssets(entries.map((entry) => entry.asset).filter(Boolean));
    setSelectedAsset(entries[0]?.asset || null);

    const contexts = entries.map((entry) => entry.context);
    const compat = validateAssetGroupCompatibility(contexts);
    if (!compat.valid) {
      setAssetMovementStatus({
        label: 'Bienes incompatibles en el mismo acta',
        description: compat.message,
        isError: true,
      });
      setAssignmentContext(null);
      setIsFirstAssignment(false);
      setHasCompletedMovements(false);
      setSuggestedMovementType(null);
      setErrors((prev) => ({ ...prev, assetId: compat.message }));
      return null;
    }

    const groupCtx = buildGroupAssignmentContext(contexts);
    if (groupCtx) applyAssignmentContext(groupCtx);

    if (clearGroupError) {
      setErrors((prev) => {
        const next = { ...prev };
        const assetError = next.assetId || '';
        if (
          assetError.includes('agrupar') ||
          assetError.includes('corresponde a') ||
          assetError.includes('no comparte') ||
          assetError.includes('incompatible')
        ) {
          delete next.assetId;
        }
        return next;
      });
    }

    return groupCtx;
  };

  const syncAssetContexts = async (items, { syncOrigin = false, assetHints = [] } = {}) => {
    if (!items?.length) {
      setAssetContextMap({});
      applyAssignmentContext(null);
      setSelectedAssets([]);
      setSelectedAsset(null);
      return null;
    }

    const hintsById = Object.fromEntries(
      assetHints
        .map((asset) => {
          const id = resolveAssetId(asset);
          return id ? [id, asset] : null;
        })
        .filter(Boolean)
    );

    const entries = await Promise.all(
      items.map(async (item) => {
        const cached = assetContextMap[item.assetId];
        if (cached?.context && cached?.asset) return cached;
        const hint = hintsById[item.assetId] || cached?.asset;
        try {
          return await fetchAssetContextEntry(item.assetId, hint);
        } catch (error) {
          console.error('Error loading asset context:', error);
          const asset = hint || assets?.find((a) => resolveAssetId(a) === item.assetId);
          return {
            assetId: item.assetId,
            asset,
            context: resolveAssetAssignmentContext(asset, []),
          };
        }
      })
    );

    const groupCtx = applyGroupContextFromEntries(entries);

    if (syncOrigin && entries[0] && groupCtx) {
      const origin = getOriginFromContext(entries[0].asset, groupCtx.lastMovement, formData.movementType);
      if (origin.originAreaId || origin.originLocationId || origin.originResponsibleId) {
        setFormData((prev) => ({ ...prev, ...origin }));
        setAssetLocationLoaded(true);
        setTimeout(() => setAssetLocationLoaded(false), 5000);
      }
    }

    return groupCtx;
  };
  const [hasCompletedMovements, setHasCompletedMovements] = useState(false);
  const [assignmentContext, setAssignmentContext] = useState(null);
  const [suggestedDocumentNumber, setSuggestedDocumentNumber] = useState('');
  const [suggestedDocumentSource, setSuggestedDocumentSource] = useState('server');
  const [loadingSuggestedDoc, setLoadingSuggestedDoc] = useState(false);
  const [cachedMovements, setCachedMovements] = useState([]);
  const fileInputRef = useRef(null);
  const docDuplicateTimerRef = useRef(null);

  const refreshCachedMovements = async () => {
    try {
      const all = await assetMovementService.getAllMovements();
      const list = Array.isArray(all) ? all : [];
      setCachedMovements(list);
      return { list, serverListLoaded: true };
    } catch {
      setCachedMovements([]);
      return { list: [], serverListLoaded: false };
    }
  };

  const computeSuggestedDocumentNumber = (movementsList = cachedMovements, serverListLoaded = true) => {
    const result = generateNextSupportingDocumentNumber(movementsList, {
      excludeMovementId: movement?.id,
      serverListLoaded,
    });
    setSuggestedDocumentNumber(result.number);
    setSuggestedDocumentSource(result.source);
    return result.number;
  };

  const applySuggestedDocumentNumber = () => {
    const next =
      suggestedDocumentNumber ||
      computeSuggestedDocumentNumber(cachedMovements);
    setFormData((prev) => ({ ...prev, supportingDocumentNumber: next }));
    setErrors((prev) => {
      const n = { ...prev };
      delete n.supportingDocumentNumber;
      return n;
    });
  };
  useEffect(() => {
    if (!assets || !Array.isArray(assets)) {
      setDisplayAssets([]);
      setAssetFilterMessage('');
      return;
    }
    const selectedCount = formData.assetItems?.length
      || formData.assetIds?.length
      || (formData.assetId ? 1 : 0);
    const hasAssignmentHistoryForFilter = selectedCount > 0
      ? (assignmentContext?.isTransfer ?? false)
      : (assignmentContext?.hasCompletedMovements ?? false);

    let filtered = filterAssetsByMovementType(assets, formData.movementType, {
      hasAssignmentHistory: hasAssignmentHistoryForFilter,
    });

    if (selectedCount > 0 && !assignmentContext && filtered.length <= selectedCount) {
      filtered = filterAssetsByMovementType(assets, formData.movementType, {
        hasAssignmentHistory: false,
      });
    }

    const pinnedIds = new Set(
      (formData.assetItems?.length
        ? formData.assetItems.map((item) => item.assetId)
        : (formData.assetIds?.length ? formData.assetIds : [formData.assetId].filter(Boolean)))
    );
    pinnedIds.forEach((selectedId) => {
      const alreadyInList = filtered.some(
        (a) => (a.id || a.assetId || a.uuid) === selectedId
      );
      if (!alreadyInList) {
        const pinned =
          selectedAssets.find((a) => (a.id || a.assetId || a.uuid) === selectedId) ||
          selectedAsset ||
          assets.find((a) => (a.id || a.assetId || a.uuid) === selectedId);
        if (pinned) filtered = [pinned, ...filtered];
      }
    });
    setDisplayAssets(filtered);
    setAssetFilterMessage(getAssetFilterMessage(formData.movementType));
  }, [assets, formData.movementType, formData.assetId, formData.assetIds, formData.assetItems, selectedAsset, selectedAssets, assignmentContext]);

  const applyAssignmentContext = (ctx) => {
    if (!ctx) {
      setAssignmentContext(null);
      setIsFirstAssignment(false);
      setHasCompletedMovements(false);
      setSuggestedMovementType(null);
      setAssetMovementStatus(null);
      return;
    }
    setAssignmentContext(ctx);
    setIsFirstAssignment(ctx.isFirstAssignment);
    setHasCompletedMovements(ctx.hasCompletedMovements);
    setSuggestedMovementType(ctx.suggestedMovementType);
    setAssetMovementStatus(ctx.statusInfo);
  };

  const getValidationContext = (asset) => ({
    assignmentContext,
    asset: asset || selectedAsset,
    assetContextEntries: Object.values(assetContextMap),
    isEditing: !!movement,
    isFirstAssignment: assignmentContext?.isFirstAssignment ?? false,
    hasCompletedMovements: assignmentContext?.hasCompletedMovements ?? false,
    users,
  });
  useEffect(() => {
    if (movement || loadingData || areas.length === 0 || locations.length === 0) return;
    const warehouseArea = findWarehouseArea(areas);
    const warehouseLocation = findWarehouseLocation(locations);
    if (formData.movementType === MovementType.INITIAL_ASSIGNMENT) {
      if (warehouseArea || warehouseLocation) {
        setFormData(prev => ({
          ...prev,
          originAreaId: prev.originAreaId || warehouseArea?.id || '',
          originLocationId: prev.originLocationId || warehouseLocation?.id || '',
        }));
      }
    } else if (formData.movementType === MovementType.RETURN) {
      if (warehouseArea || warehouseLocation) {
        setFormData(prev => ({
          ...prev,
          destinationAreaId: prev.destinationAreaId || warehouseArea?.id || '',
          destinationLocationId: prev.destinationLocationId || warehouseLocation?.id || '',
        }));
      }
    }
  }, [formData.movementType, areas, locations, movement, loadingData]);
  useEffect(() => {
    if (!movement?.assetId || !assets?.length || loadingData) return;
    const inList = assets.find(a => (a.id || a.assetId || a.uuid) === movement.assetId);
    if (!inList) {
      getBienPatrimonialById(movement.assetId)
        .then(asset => {
          if (asset) setDisplayAssets(prev => {
            const exists = prev.some(a => (a.id || a.assetId || a.uuid) === movement.assetId);
            return exists ? prev : [asset, ...prev];
          });
        })
        .catch(() => {});
    }
  }, [movement, assets, loadingData]);

  useEffect(() => {
    if (!movement?.assetId || loadingData) return;
    const asset = assets?.find((a) => (a.id || a.assetId || a.uuid) === movement.assetId);
    // En edición no sobrescribir origen/destino guardados en el movimiento.
    loadCurrentAssetLocation(movement.assetId, asset || null, { syncOriginToForm: false });
  }, [movement?.id, movement?.assetId, loadingData]);

  useEffect(() => {
    const currentUserId = getCurrentUserId();
    if (movement) {
      const record = normalizeMovementForForm(movement);
      const editAssetItems = Array.isArray(record.assetItems) && record.assetItems.length > 0
        ? record.assetItems.map((item) => ({
            assetId: item.assetId,
            quantity: item.quantity || 1,
          }))
        : (Array.isArray(record.assetIds) && record.assetIds.length > 0
          ? record.assetIds.map((id) => ({ assetId: id, quantity: 1 }))
          : (record.assetId ? [{ assetId: record.assetId, quantity: 1 }] : []));
      const assetFields = syncAssetFields(editAssetItems);
      setFormData({
        movementNumber: record.movementNumber || '',
        ...assetFields,
        movementType: record.movementType || MovementType.REASSIGNMENT,
        movementSubtype: record.movementSubtype || '',
        originResponsibleId: record.originResponsibleId || '',
        destinationResponsibleId: record.destinationResponsibleId || '',
        originAreaId: record.originAreaId || '',
        destinationAreaId: record.destinationAreaId || '',
        originLocationId: record.originLocationId || '',
        destinationLocationId: record.destinationLocationId || '',
        reason: record.reason || '',
        observations: record.observations || '',
        specialConditions: record.specialConditions || '',
        supportingDocumentNumber: record.supportingDocumentNumber || '',
        supportingDocumentType: record.supportingDocumentType || SUPPORTING_DOCUMENT_TYPE_DEFAULT,
        attachedDocuments: record.attachedDocuments || '',
        requiresApproval: record.requiresApproval !== undefined ? record.requiresApproval : true,
        movementStatus: record.movementStatus || MovementStatus.REQUESTED,
        requestingUser: record.requestingUser || '',
        executingUser: record.executingUser || '',
      });
      if (record.attachedDocuments) {
        try { setUploadedDocuments(parseAttachedDocuments(record.attachedDocuments)); }
        catch { setUploadedDocuments([]); }
      } else {
        setUploadedDocuments([]);
      }
      const matchedAssets = editAssetItems
        .map((item) => (assets || []).find((a) => (a.id || a.assetId || a.uuid) === item.assetId))
        .filter(Boolean);
      setSelectedAssets(matchedAssets);
      setSelectedAsset(matchedAssets[0] || null);
    } else {
      setFormData(prev => ({
        ...prev,
        requestingUser: currentUserId || '',
        executingUser: currentUserId || '',
        supportingDocumentType: prev.supportingDocumentType || SUPPORTING_DOCUMENT_TYPE_DEFAULT,
      }));
      setUploadedDocuments([]);
      setSelectedFiles([]);
    }
  }, [movement, assets]);

  useEffect(() => {
    if (movement) return;
    let cancelled = false;
    setLoadingSuggestedDoc(true);
    refreshCachedMovements()
      .then(({ list, serverListLoaded }) => {
        if (!cancelled) computeSuggestedDocumentNumber(list, serverListLoaded);
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestedDoc(false);
      });
    return () => {
      cancelled = true;
    };
  }, [movement?.id]);

  useEffect(() => {
    if (movement || formData.supportingDocumentNumber?.trim()) return;
    if (activeTab === 'documentacion' && suggestedDocumentNumber) {
      setFormData((prev) => ({
        ...prev,
        supportingDocumentNumber: prev.supportingDocumentNumber || suggestedDocumentNumber,
      }));
    }
  }, [activeTab, suggestedDocumentNumber, movement, formData.supportingDocumentNumber]);

  const mergeCrossFieldErrors = (data, assetCtx = selectedAsset) => {
    const cross = validateCrossFields(data, {
      ...getValidationContext(assetCtx),
    });
    setErrors((prev) => {
      const next = { ...prev };
      ['originAreaId', 'destinationAreaId', 'destinationResponsibleId', 'movementType'].forEach((k) => {
        if (prev[k] && !cross[k]) delete next[k];
      });
      return { ...next, ...cross };
    });
  };

  useEffect(() => {
    mergeCrossFieldErrors(formData);
  }, [
    formData.originAreaId,
    formData.destinationAreaId,
    formData.originResponsibleId,
    formData.destinationResponsibleId,
    formData.movementType,
    assignmentContext,
    selectedAsset,
    movement,
  ]);

  /** Mantiene solicitante coherente con el área según tipo (SBN). */
  useEffect(() => {
    if (movement || loadingData) return;
    if (!requestingUserUsesAreaFilter(formData.movementType)) return;

    const areaId = getRequestingUserFilterAreaId(
      formData.movementType,
      formData.originAreaId,
      formData.destinationAreaId
    );
    const allowed = areaId
      ? getRequestingUsersForArea(
          users,
          formData.movementType,
          formData.originAreaId,
          formData.destinationAreaId
        )
      : [];
    const allowedIds = new Set(
      allowed.map((u) => String(getUserAccountId(u))).filter(Boolean)
    );

    setFormData((prev) => {
      let nextUser = prev.requestingUser;
      if (!areaId) {
        if (nextUser) nextUser = '';
      } else if (nextUser && !allowedIds.has(String(nextUser))) {
        nextUser = '';
      }
      if (!nextUser && areaId) {
        const sessionId = getCurrentUserId();
        if (sessionId && allowedIds.has(String(sessionId))) nextUser = sessionId;
      }
      if (nextUser === prev.requestingUser) return prev;
      return { ...prev, requestingUser: nextUser };
    });
  }, [
    formData.movementType,
    formData.originAreaId,
    formData.destinationAreaId,
    users,
    loadingData,
    movement,
  ]);

  /** Ejecutor: siempre el usuario en sesión al crear (no editable). */
  useEffect(() => {
    if (movement) return;
    const sessionId = getCurrentUserId();
    if (!sessionId) return;

    setFormData((prev) => {
      if (String(prev.executingUser) === String(sessionId)) return prev;
      return { ...prev, executingUser: sessionId };
    });
  }, [movement, users, loadingData]);

  useEffect(() => {
    const docNum = (formData.supportingDocumentNumber || '').trim();
    if (!docNum || validateSupportingDocumentNumber(docNum, { required: false })) {
      setCheckingDocumentDuplicate(false);
      return;
    }
    if (docDuplicateTimerRef.current) clearTimeout(docDuplicateTimerRef.current);
    docDuplicateTimerRef.current = setTimeout(async () => {
      setCheckingDocumentDuplicate(true);
      try {
        const refreshed = cachedMovements.length
          ? { list: cachedMovements, serverListLoaded: true }
          : await refreshCachedMovements();
        const duplicate = isSupportingDocumentNumberDuplicate(docNum, refreshed.list, movement?.id);
        setErrors((prev) => {
          const next = { ...prev };
          if (duplicate) {
            next.supportingDocumentNumber =
              'Este número de documento ya está registrado en el sistema. Ingrese uno diferente.';
          } else if (
            next.supportingDocumentNumber?.includes('ya está registrado')
          ) {
            delete next.supportingDocumentNumber;
          }
          return next;
        });
      } catch {
        /* verificación en segundo plano */
      } finally {
        setCheckingDocumentDuplicate(false);
      }
    }, 400);
    return () => {
      if (docDuplicateTimerRef.current) clearTimeout(docDuplicateTimerRef.current);
    };
  }, [formData.supportingDocumentNumber, movement?.id]);
  useEffect(() => {
    const hasAssets = (formData.assetIds?.length > 0) || formData.assetId;
    const required = [hasAssets, formData.movementType, formData.reason, formData.requestingUser];
    if (formData.movementType === MovementType.INITIAL_ASSIGNMENT || formData.movementType === MovementType.RETURN) {
      required.push(formData.originResponsibleId);
    }
    const optional = [
      formData.movementSubtype, formData.originResponsibleId, formData.destinationResponsibleId,
      formData.originAreaId, formData.destinationAreaId, formData.originLocationId,
      formData.destinationLocationId, formData.observations, formData.specialConditions,
      formData.supportingDocumentNumber, formData.supportingDocumentType, formData.executingUser,
    ];
    const hasDocuments = uploadedDocuments.length > 0 || selectedFiles.length > 0;
    const total = required.length + optional.length + 1;
    const completed = required.filter(f => f?.toString().trim()).length +
      optional.filter(f => f?.toString().trim()).length + (hasDocuments ? 1 : 0);
    setFormProgress({ completed, total, percentage: Math.round((completed / total) * 100) });
  }, [formData, uploadedDocuments, selectedFiles]);
  const validate = async () => {
    const newErrors = validateForm(formData, getValidationContext());
    const docNum = (formData.supportingDocumentNumber || '').trim();
    if (docNum && !newErrors.supportingDocumentNumber) {
      try {
        const refreshed = cachedMovements.length
          ? { list: cachedMovements, serverListLoaded: true }
          : await refreshCachedMovements();
        if (isSupportingDocumentNumberDuplicate(docNum, refreshed.list, movement?.id)) {
          newErrors.supportingDocumentNumber =
            'Este número de documento ya está registrado en el sistema. Ingrese uno diferente.';
        }
      } catch {
        /* continuar si la verificación falla */
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const getAssetForValidation = (assetId, data = formData) => {
    if (!assetId) return null;
    return (
      selectedAsset ||
      assets?.find((a) => (a.id || a.assetId || a.uuid) === assetId) ||
      displayAssets.find((a) => (a.id || a.assetId || a.uuid) === assetId) ||
      null
    );
  };

  const applyRealtimeFieldError = (fieldName, fieldValue, nextFormData) => {
    const data = nextFormData || formData;
    const err = validateField(fieldName, fieldValue);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[fieldName] = err;
      else delete next[fieldName];

      const contextEntries = Object.values(assetContextMap);
      if (contextEntries.length > 0 && data.movementType && !movement) {
        const perAssetErrors = validateEachAssetForMovementType(contextEntries, data.movementType);
        if (perAssetErrors.length > 0) {
          const movementTypeErrors = perAssetErrors.filter(
            (msg) => msg.includes('corresponde a Primera Asignación') || msg.includes('no admite el tipo')
          );
          if (movementTypeErrors.length > 0) next.movementType = movementTypeErrors[0];
          else next.assetId = perAssetErrors[0];
        } else {
          if (prev.movementType?.includes('corresponde a Primera Asignación')) delete next.movementType;
          if (prev.assetId?.includes('estado')) delete next.assetId;
        }
      } else if (data.assetId && data.movementType && assignmentContext) {
        const asset = getAssetForValidation(data.assetId, data);
        const statusCheck = validateAssetStatusForContext(
          asset,
          data.movementType,
          assignmentContext
        );
        if (!statusCheck.valid) next.assetId = statusCheck.message;
        else if (prev.assetId?.includes('estado')) delete next.assetId;
      }

      const cross = validateCrossFields(data, {
        ...getValidationContext(getAssetForValidation(data.assetId, data)),
      });
      ['originAreaId', 'destinationAreaId', 'destinationResponsibleId', 'movementType'].forEach((k) => {
        if (cross[k]) next[k] = cross[k];
        else if (['originAreaId', 'destinationAreaId', 'destinationResponsibleId', 'movementType'].includes(k) && prev[k] && !cross[k]) {
          delete next[k];
        }
      });
      return next;
    });
  };

  const handleChange = async (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'executingUser') return;
    const newValue = type === 'checkbox' ? checked : value;
    const nextFormData = { ...formData, [name]: newValue };
    setFormData(nextFormData);

    const realtimeFields = [
      'movementSubtype',
      'supportingDocumentNumber',
      'supportingDocumentType',
      'reason',
      'observations',
      'specialConditions',
      'originAreaId',
      'destinationAreaId',
      'originResponsibleId',
      'destinationResponsibleId',
      'movementType',
      'assetId',
    ];
    if (realtimeFields.includes(name)) {
      applyRealtimeFieldError(name, newValue, nextFormData);
    } else if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }

    if (name === 'supportingDocumentType' && !value?.trim()) {
      setFormData((prev) => ({ ...prev, supportingDocumentType: SUPPORTING_DOCUMENT_TYPE_DEFAULT }));
    }
    if (name === 'movementType' && !movement && areas.length > 0 && locations.length > 0) {
      const warehouseArea = findWarehouseArea(areas);
      const warehouseLocation = findWarehouseLocation(locations);
      
      if (value === MovementType.INITIAL_ASSIGNMENT && (warehouseArea || warehouseLocation)) {
        setFormData(prev => ({ ...prev, [name]: value, originAreaId: warehouseArea?.id || '', originLocationId: warehouseLocation?.id || '' }));
        return;
      }
      
      if (value === MovementType.RETURN) {
        // Si ya hay un activo seleccionado, cargar su ubicación actual como origen
        if (formData.assetId) {
          setFormData(prev => ({ ...prev, [name]: value }));
          await loadCurrentAssetLocation(formData.assetId);
          return;
        }
        // Si no hay activo, solo prellenar el destino con almacén
        if (warehouseArea || warehouseLocation) {
          setFormData(prev => ({ ...prev, [name]: value, destinationAreaId: warehouseArea?.id || '', destinationLocationId: warehouseLocation?.id || '' }));
          return;
        }
      }
    }
    if (name === 'assetId' && !movement && !formData.assetIds?.length) {
      setActiveMovementWarning(null);
      applyAssignmentContext(null);
      setSelectedAsset(null);
      if (value) {
        const asset = (assets || []).find((a) => (a.id || a.assetId || a.uuid) === value) || null;
        setSelectedAsset(asset);
        setCheckingActiveMovements(true);
        try {
          const result = await assetMovementService.checkActiveMovements(value);
          if (result.hasActiveMovement) {
            const active = result.activeMovements[0];
            setActiveMovementWarning({ movementNumber: active.movementNumber, movementType: active.movementType, movementStatus: active.movementStatus, count: result.activeMovements.length });
          }
        } catch {  }
        finally { setCheckingActiveMovements(false); }

        setFormData((prev) => ({ ...prev, originAreaId: '', originLocationId: '', originResponsibleId: '' }));

        const ctx = await loadCurrentAssetLocation(value, asset);
        if (!movement && ctx) {
          const warehouseArea = findWarehouseArea(areas);
          const warehouseLocation = findWarehouseLocation(locations);
          setFormData((prev) => {
            const keepType = isMovementTypeAllowed(prev.movementType, ctx)
              ? prev.movementType
              : ctx.suggestedMovementType;
            const next = {
              ...prev,
              movementType: keepType || ctx.suggestedMovementType,
              supportingDocumentType: prev.supportingDocumentType || SUPPORTING_DOCUMENT_TYPE_DEFAULT,
            };
            if (keepType === MovementType.RETURN && (warehouseArea || warehouseLocation)) {
              next.destinationAreaId = prev.destinationAreaId || warehouseArea?.id || '';
              next.destinationLocationId = prev.destinationLocationId || warehouseLocation?.id || '';
            }
            return next;
          });
          mergeCrossFieldErrors(
            {
              ...formData,
              assetId: value,
              movementType: isMovementTypeAllowed(formData.movementType, ctx)
                ? formData.movementType || ctx.suggestedMovementType
                : ctx.suggestedMovementType,
            },
            asset
          );
        }
      } else {
        setFormData((prev) => ({ ...prev, originAreaId: '', originLocationId: '', originResponsibleId: '' }));
        applyAssignmentContext(null);
      }
    }

    if (name === 'movementType' && assignmentContext && !movement) {
      const asset = getAssetForValidation(formData.assetId);
      applyRealtimeFieldError('movementType', newValue, nextFormData);
      if (asset && newValue) {
        const statusCheck = validateAssetStatusForContext(asset, newValue, assignmentContext);
        setErrors((prev) => {
          const next = { ...prev };
          if (!statusCheck.valid) next.assetId = statusCheck.message;
          else if (next.assetId?.includes('estado')) delete next.assetId;
          return next;
        });
      }
    }
  };

  const loadCurrentAssetLocation = async (
    assetId,
    assetFromList = null,
    { syncOriginToForm = true } = {}
  ) => {
    if (!assetId) return null;
    setLoadingAssetLocation(true);
    setAssetLocationLoaded(false);

    try {
      const items = formData.assetItems?.length
        ? formData.assetItems
        : [{ assetId, quantity: 1 }];
      return await syncAssetContexts(items, {
        syncOrigin: syncOriginToForm,
        assetHints: assetFromList ? [assetFromList] : [],
      });
    } finally {
      setLoadingAssetLocation(false);
    }
  };
  const processFiles = (files) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    if (selectedFiles.length + uploadedDocuments.length + arr.length > 10) {
      setUploadError('Máximo 10 archivos permitidos'); return;
    }
    const oversized = arr.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length) { setUploadError(`Archivos muy grandes (máx 10MB): ${oversized.map(f => f.name).join(', ')}`); return; }
    const invalid = arr.filter(f => !validateMovementFile(f).valid);
    if (invalid.length) {
      setUploadError(validateMovementFile(invalid[0]).error);
      return;
    }
    setSelectedFiles(prev => [...prev, ...arr]);
    setUploadError(null);
  };
  const handleFileChange = (e) => { processFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ''; };
  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); if (!uploadingFiles && !saving && selectedFiles.length + uploadedDocuments.length < 10) setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (!uploadingFiles && !saving && e.dataTransfer.files?.length) processFiles(e.dataTransfer.files); };
  const removeSelectedFile = (i) => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i));
  const removeUploadedDocument = (i) => setUploadedDocuments(prev => prev.filter((_, idx) => idx !== i));
  const handleAddAsset = async (assetId) => {
    if (!assetId || !canEditAssets) return;
    const currentIds = formData.assetIds?.length
      ? [...formData.assetIds]
      : (formData.assetId ? [formData.assetId] : []);
    if (currentIds.includes(assetId)) {
      setAssetPickerValue('');
      return;
    }

    const asset = (assets || []).find((a) => (a.id || a.assetId || a.uuid) === assetId) || null;
    const nextAssets = [...selectedAssets, asset].filter(Boolean);
    const nextItems = [
      ...(formData.assetItems?.length
        ? formData.assetItems
        : currentIds.map((id) => ({ assetId: id, quantity: 1 }))),
      { assetId, quantity: 1 },
    ];
    const nextIds = nextItems.map((item) => item.assetId);

    setCheckingActiveMovements(true);
    setActiveMovementWarning(null);
    try {
      const result = await assetMovementService.checkActiveMovements(assetId);
      if (result.hasActiveMovement) {
        const activeMovements = (result.activeMovements || []).filter(
          (m) => m.id !== movement?.id
        );
        if (activeMovements.length > 0) {
          const active = activeMovements[0];
          setActiveMovementWarning({
            movementNumber: active.movementNumber,
            movementType: active.movementType,
            movementStatus: active.movementStatus,
            count: activeMovements.length,
            assetId,
          });
          return;
        }
      }
    } catch { /* continuar */ }
    finally { setCheckingActiveMovements(false); }

    let newEntry;
    try {
      newEntry = await fetchAssetContextEntry(assetId, asset);
    } catch {
      setErrors((prev) => ({
        ...prev,
        assetId: 'No se pudo verificar el historial del bien. Intente nuevamente.',
      }));
      setAssetPickerValue('');
      return;
    }

    const existingContexts = currentIds.map((id) => assetContextMap[id]?.context).filter(Boolean);
    const assetName =
      asset?.description || asset?.descripcion || asset?.assetCode || asset?.code || assetId;
    const incompatibility = getNewAssetIncompatibilityMessage(
      newEntry.context,
      existingContexts,
      assetName
    );
    if (incompatibility) {
      setErrors((prev) => ({ ...prev, assetId: incompatibility }));
      setAssetPickerValue('');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      ...syncAssetFields(nextItems),
      ...(nextIds.length === 1 && !movement
        ? { originAreaId: '', originLocationId: '', originResponsibleId: '' }
        : {}),
    }));
    setAssetPickerValue('');

    const groupCtx = await syncAssetContexts(nextItems, {
      syncOrigin: nextIds.length === 1,
      assetHints: nextAssets.filter(Boolean),
    });

    if (groupCtx) {
      const warehouseArea = findWarehouseArea(areas);
      const warehouseLocation = findWarehouseLocation(locations);
      setFormData((prev) => {
        const keepType = isMovementTypeAllowed(prev.movementType, groupCtx)
          ? prev.movementType
          : groupCtx.suggestedMovementType;
        const next = {
          ...prev,
          ...syncAssetFields(nextItems),
          movementType: keepType || groupCtx.suggestedMovementType,
          supportingDocumentType: prev.supportingDocumentType || SUPPORTING_DOCUMENT_TYPE_DEFAULT,
        };
        if (keepType === MovementType.RETURN && (warehouseArea || warehouseLocation)) {
          next.destinationAreaId = prev.destinationAreaId || warehouseArea?.id || '';
          next.destinationLocationId = prev.destinationLocationId || warehouseLocation?.id || '';
        }
        return next;
      });
    }

    setErrors((prev) => {
      const next = { ...prev };
      delete next.assetId;
      return next;
    });
  };

  const handleAssetQuantityChange = (assetId, quantity) => {
    if (!assetId || !canEditAssets) return;
    const entry = assetContextMap[assetId];
    const isStockItem = entry?.context?.stock?.isStockItem;
    const maxQty = isStockItem && formData.movementType && entry?.context
      ? getMaxQuantityForMovement(entry.context, formData.movementType)
      : 9999;
    const parsed = Math.min(maxQty, Math.max(1, parseInt(quantity, 10) || 1));
    const currentItems = formData.assetItems?.length
      ? formData.assetItems
      : (formData.assetIds || []).map((id) => ({ assetId: id, quantity: 1 }));
    const nextItems = currentItems.map((item) =>
      item.assetId === assetId ? { ...item, quantity: parsed } : item
    );
    setFormData((prev) => ({ ...prev, ...syncAssetFields(nextItems) }));

    if (formData.movementType && entry?.context) {
      const qtyCheck = validateMovementQuantityForAsset(
        entry.context,
        formData.movementType,
        parsed
      );
      setErrors((prev) => {
        const next = { ...prev };
        if (!qtyCheck.valid) next.assetId = qtyCheck.message;
        else if (next.assetId?.includes('unidad')) delete next.assetId;
        return next;
      });
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.assetId;
        return next;
      });
    }
  };

  const handleRemoveAsset = (assetId) => {
    if (!assetId || !canEditAssets) return;
    const currentItems = formData.assetItems?.length
      ? formData.assetItems
      : (formData.assetIds || []).map((id) => ({ assetId: id, quantity: 1 }));
    const nextItems = currentItems.filter((item) => item.assetId !== assetId);
    const nextIds = nextItems.map((item) => item.assetId);
    const nextAssets = selectedAssets.filter((a) => (a.id || a.assetId || a.uuid) !== assetId);
    if (nextIds.length === 0) {
      setFormData((prev) => ({
        ...prev,
        assetItems: [],
        assetIds: [],
        assetId: '',
        originAreaId: '',
        originLocationId: '',
        originResponsibleId: '',
      }));
      setSelectedAssets([]);
      setSelectedAsset(null);
      setAssetContextMap({});
      applyAssignmentContext(null);
      return;
    }
    setFormData((prev) => ({
      ...prev,
      ...syncAssetFields(nextItems),
    }));
    syncAssetContexts(nextItems, {
      syncOrigin: nextIds.length === 1,
      assetHints: nextAssets.filter(Boolean),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!(await validate())) return;
    setSaving(true);
    setErrors({});
    setUploadError(null);
    try {
      const currentUserId = getCurrentUserId();
      let documentsToAttach = [...uploadedDocuments];
      if (selectedFiles.length > 0) {
        setUploadingFiles(true);
        try {
          const uploaded = await uploadMultipleMovementDocuments(selectedFiles, movement?.id || null, null, currentUserId);
          if (uploaded.length > 0) {
            documentsToAttach = [...documentsToAttach, ...uploaded];
            setSelectedFiles([]);
            setUploadedDocuments(documentsToAttach);
          } else {
            setUploadError('Advertencia: No se pudieron subir los archivos. El movimiento se guardará sin documentos adjuntos.');
          }
        } catch {
          setUploadError('Advertencia: Error al subir archivos. El movimiento se guardará sin documentos adjuntos.');
        } finally { setUploadingFiles(false); }
      }
      const normalized = documentsToAttach.map(doc => ({
        fileName: doc.fileName || 'Documento sin nombre',
        fileUrl: doc.fileUrl || doc.url || '',
        fileType: doc.fileType || '',
        fileSize: doc.fileSize || 0,
        uploadedAt: doc.uploadedAt || new Date().toISOString(),
        uploadedBy: doc.uploadedBy || currentUserId || null,
      }));
      const resolvedAssetItems = formData.assetItems?.length
        ? formData.assetItems.map((item) => ({
            assetId: item.assetId,
            quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
          }))
        : (formData.assetIds?.length
          ? formData.assetIds.map((id) => ({ assetId: id, quantity: 1 }))
          : (formData.assetId ? [{ assetId: formData.assetId, quantity: 1 }] : []));
      const resolvedAssetIds = resolvedAssetItems.map((item) => item.assetId);
      const dataToSave = {
        ...formData,
        assetItems: resolvedAssetItems,
        assetIds: resolvedAssetIds,
        assetId: resolvedAssetIds[0] || formData.assetId,
        ...(movement ? {} : { movementNumber: undefined }),
        attachedDocuments: normalized.length > 0 ? JSON.stringify(normalized) : null,
      };
      if (!movement) delete dataToSave.movementNumber;
      rememberSupportingDocumentNumber(dataToSave.supportingDocumentNumber);
      await onSave(dataToSave);
    } catch (error) {
      setErrors({ submit: error.message || 'Error al guardar el movimiento' });
    } finally { setSaving(false); }
  };
  const isTabComplete = (tabId) => {
    switch (tabId) {
      case 'basica': return !!((formData.assetIds?.length || formData.assetId) && formData.movementType && formData.reason);
      case 'origen-destino': return !!(formData.originResponsibleId || formData.destinationResponsibleId || formData.originAreaId || formData.destinationAreaId);
      case 'usuarios-detalles': return !!(formData.requestingUser);
      case 'documentacion': return uploadedDocuments.length > 0 || selectedFiles.length > 0;
      default: return false;
    }
  };
  const hasTabErrors = (tabId) => {
    const keys = Object.keys(errors);
    const map = {
      'basica': ['assetId', 'movementType', 'movementSubtype', 'reason'],
      'origen-destino': [
        'originResponsibleId', 'destinationResponsibleId',
        'originAreaId', 'destinationAreaId', 'originLocationId', 'destinationLocationId',
      ],
      'usuarios-detalles': ['requestingUser', 'executingUser', 'observations', 'specialConditions'],
      'documentacion': ['supportingDocumentNumber', 'supportingDocumentType'],
    };
    return keys.some(k => (map[tabId] || []).includes(k));
  };
  return {
    formData, displayAssets, assetFilterMessage, errors, saving, loadingAssetLocation,
    assetLocationLoaded, isFirstAssignment, activeTab, setActiveTab, formProgress,
    checkingActiveMovements, activeMovementWarning, checkingDocumentDuplicate,
    suggestedDocumentNumber, suggestedDocumentSource, loadingSuggestedDoc, applySuggestedDocumentNumber,
    suggestedMovementType, assetMovementStatus,     allowedMovementTypes: assignmentContext?.allowedMovementTypes ?? null,
    assignmentContext,
    selectedFiles, uploadedDocuments,
    uploadingFiles, uploadError, isDragging, fileInputRef,
    selectedAssets, assetContextMap, assetPickerValue, setAssetPickerValue,
    handleChange, handleAddAsset, handleRemoveAsset, handleAssetQuantityChange, handleSubmit,
    handleFileChange, handleDragEnter, handleDragLeave,
    handleDragOver, handleDrop, removeSelectedFile, removeUploadedDocument,
    isTabComplete, hasTabErrors, canEditAssets,
  };
}
