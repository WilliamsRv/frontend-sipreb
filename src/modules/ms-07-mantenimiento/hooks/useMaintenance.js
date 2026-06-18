import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import maintenanceService from "../services/maintenanceService";
import {
  extractMaintenancesList,
  normalizeMaintenance,
  buildMaintenanceWritePayload,
} from "../utils/maintenanceMapper";
import userService from "../../ms-02-authentication/services/userService";
import personService from "../../ms-02-authentication/services/personService";
import { getProveedores } from "../../ms-03-configuration/services/api";
import { usePermissions } from "../../../hooks/usePermissions";

function getMunicipalityIdFromJWT() {
  try {
    const token = sessionStorage.getItem("accessToken");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (
      payload.municipalityId ||
      payload.municipality_id ||
      payload.municipalCode ||
      payload.municipal_code ||
      null
    );
  } catch {
    return null;
  }
}

function getUserIdFromJWT() {
  try {
    const token = sessionStorage.getItem("accessToken");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.user_id || payload.userId || payload.sub || null;
  } catch {
    return null;
  }
}

export function useMaintenance() {
  const { canDo, hasRole } = usePermissions();
  const [maintenances, setMaintenances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filters, setFilters] = useState({ status: 'SCHEDULED', type: '', priority: '', search: '' });
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [persons, setPersons] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const abortRef = useRef(null);

  const municipalityId = useMemo(() => getMunicipalityIdFromJWT(), []);
  const currentUserId = useMemo(() => getUserIdFromJWT(), []);
  const isSuperAdmin = hasRole("SUPER_ADMIN");

  const canRead = canDo("mantenimiento", "read");
  const canCreate = canDo("mantenimiento", "create");
  const canUpdate = canDo("mantenimiento", "update");
  const canExecute = canDo("mantenimiento", "execute", "process");
  const canConfirm = canDo("mantenimiento", "confirm", "sign");
  const canViewCosts = canDo("mantenimiento", "viewCosts");

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const safeSet = (setter, value) => {
    if (mountedRef.current) setter(value);
  };

  const loadMaintenances = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      safeSet(setLoading, true);
      safeSet(setError, null);
      const data = await maintenanceService.getAll(
        municipalityId,
        page,
        size,
        filters,
        controller.signal,
      );
      if (!controller.signal.aborted && mountedRef.current) {
        if (data && data.content !== undefined) {
          safeSet(setMaintenances, extractMaintenancesList(data.content));
          safeSet(setTotalElements, data.totalElements || 0);
          safeSet(setTotalPages, data.totalPages || 0);
        } else {
          safeSet(setMaintenances, extractMaintenancesList(data));
          safeSet(setTotalElements, 0);
          safeSet(setTotalPages, 0);
        }
      }
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError" && mountedRef.current) {
        safeSet(setError, err.message);
      }
    } finally {
      if (mountedRef.current) {
        safeSet(setLoading, false);
      }
    }
  }, [page, size, filtersKey, municipalityId]);

  const loadCrossData = useCallback(async () => {
    const promises = [];

    promises.push(
      (async () => {
        try {
          const userData = await userService.getAllUsers();
          let arr = [];
          if (Array.isArray(userData)) arr = userData;
          else if (userData?.data && Array.isArray(userData.data))
            arr = userData.data;
          else if (userData?.content && Array.isArray(userData.content))
            arr = userData.content;
          safeSet(setUsers, arr);
        } catch {
          safeSet(setUsers, []);
        }
      })(),
    );

    promises.push(
      (async () => {
        try {
          const personData = await personService.getAllPersons();
          let arr = [];
          if (Array.isArray(personData)) arr = personData;
          else if (personData?.data && Array.isArray(personData.data))
            arr = personData.data;
          else if (personData?.content && Array.isArray(personData.content))
            arr = personData.content;
          safeSet(setPersons, arr);
        } catch {
          safeSet(setPersons, []);
        }
      })(),
    );

    promises.push(
      (async () => {
        try {
          const supplierData = await getProveedores();
          let arr = [];
          if (Array.isArray(supplierData)) arr = supplierData;
          else if (supplierData?.data && Array.isArray(supplierData.data))
            arr = supplierData.data;
          else if (supplierData?.content && Array.isArray(supplierData.content))
            arr = supplierData.content;
          safeSet(setSuppliers, arr);
        } catch {
          safeSet(setSuppliers, []);
        }
      })(),
    );

    promises.push(
      (async () => {
        try {
          const assetData = await maintenanceService.getAllAssets(municipalityId);
          let arr = [];
          if (Array.isArray(assetData)) arr = assetData;
          else if (assetData?.data && Array.isArray(assetData.data))
            arr = assetData.data;
          else if (assetData?.content && Array.isArray(assetData.content))
            arr = assetData.content;
          const excluded = [
            "BAJA",
            "BAJA_PERMANENTE",
            "OBSOLETO",
            "PERDIDO",
            "ROBADO",
            "DESTRUIDO",
          ];
          safeSet(setAssets, arr.filter(
              (a) =>
                !excluded.includes(
                  a.assetStatus || a.estadoBien || a.status || "",
                ),
            ));
        } catch {
          safeSet(setAssets, []);
        }
      })(),
    );

    await Promise.allSettled(promises);
  }, [municipalityId]);

  useEffect(() => {
    Promise.all([loadMaintenances(), loadCrossData()]).catch(() => {});
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [loadMaintenances, loadCrossData]);

  const getAssetName = useCallback(
    (assetId) => {
      if (!assetId) return "—";
      const asset = assets.find((a) => String(a.id) === String(assetId));
      return asset
        ? asset.description || asset.descripcion || String(assetId)
        : String(assetId).slice(0, 8) + "…";
    },
    [assets],
  );

  const getUserName = useCallback(
    (userId) => {
      if (!userId) return "—";
      const user = users.find((u) => String(u.id) === String(userId));
      return user
        ? user.username ||
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            String(userId)
        : String(userId).slice(0, 8) + "…";
    },
    [users],
  );

  const getPersonName = useCallback(
    (personId) => {
      if (!personId) return "—";
      const person = persons.find((p) => String(p.id) === String(personId));
      if (person) {
        return (
          person.fullName ||
          `${person.firstName || ""} ${person.lastName || ""}`.trim() ||
          String(personId)
        );
      }
      const user = users.find((u) => String(u.id) === String(personId));
      if (user) {
        return (
          user.username ||
          `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
          String(personId)
        );
      }
      return String(personId).slice(0, 8) + "…";
    },
    [persons, users],
  );

  const getSupplierName = useCallback(
    (supplierId) => {
      if (!supplierId) return "—";
      const s = suppliers.find(
        (s) =>
          String(s.id) === String(supplierId) ||
          String(s.ruc) === String(supplierId) ||
          String(s.idProvider) === String(supplierId) ||
          String(s.numeroDocumento) === String(supplierId) ||
          String(s.documentNumber) === String(supplierId),
      );
      if (s) {
        return (
          s.legalName ||
          s.tradeName ||
          s.razonSocial ||
          s.name ||
          String(supplierId)
        );
      }
      return String(supplierId).length > 20
        ? String(supplierId).slice(0, 8) + "…"
        : String(supplierId);
    },
    [suppliers],
  );

  const createMaintenance = useCallback(
    async (data) => {
      const payload = buildMaintenanceWritePayload(data, {
        municipalityId,
        isCreate: true,
      });

      if (payload.assetId) {
        const selectedAsset = assets.find(
          (a) => String(a.id) === String(payload.assetId),
        );
        if (selectedAsset) {
          payload.assetCode =
            selectedAsset.assetCode || selectedAsset.codigoBien || "";
          payload.assetDescription =
            selectedAsset.description || selectedAsset.descripcion || "";
        }
      }

      if (!municipalityId) {
        throw new Error(
          "No se pudo identificar la municipalidad de su sesión. Cierre sesión e ingrese nuevamente.",
        );
      }

      if (!payload.requestedBy && currentUserId)
        payload.requestedBy = currentUserId;
      const result = await maintenanceService.create(payload);
      await loadMaintenances();
      return normalizeMaintenance(result);
    },
    [currentUserId, loadMaintenances, assets, municipalityId],
  );

  const updateMaintenance = useCallback(
    async (id, data) => {
      const payload = buildMaintenanceWritePayload(data, {
        municipalityId,
        isCreate: false,
      });

      if (payload.assetId) {
        const selectedAsset = assets.find(
          (a) => String(a.id) === String(payload.assetId),
        );
        if (selectedAsset) {
          payload.assetCode =
            selectedAsset.assetCode || selectedAsset.codigoBien || "";
          payload.assetDescription =
            selectedAsset.description || selectedAsset.descripcion || "";
        }
      }

      const result = await maintenanceService.update(id, payload);
      await loadMaintenances();
      return normalizeMaintenance(result);
    },
    [loadMaintenances, assets, municipalityId],
  );

  const startMaintenance = useCallback(
    async (id, observations = "") => {
      const result = await maintenanceService.startMaintenance(id, {
        observations,
      });
      await loadMaintenances();
      return result;
    },
    [loadMaintenances],
  );

  const completeMaintenance = useCallback(
    async (id, body) => {
      const result = await maintenanceService.completeMaintenance(id, body);
      await loadMaintenances();
      return result;
    },
    [loadMaintenances],
  );


  const confirmMaintenance = useCallback(
    async (id, conformityData) => {
      const result = await maintenanceService.confirmMaintenance(id, conformityData);
      await loadMaintenances();
      return result;
    },
    [loadMaintenances],
  );

  const suspendMaintenance = useCallback(
    async (id, nextDate, observations = "") => {
      const result = await maintenanceService.suspendMaintenance(id, {
        nextDate,
        observations,
      });
      await loadMaintenances();
      return result;
    },
    [loadMaintenances],
  );

  const rescheduleMaintenance = useCallback(
    async (id, nextDate, observations = "") => {
      const result = await maintenanceService.rescheduleMaintenance(id, {
        nextDate,
        observations,
      });
      await loadMaintenances();
      return result;
    },
    [loadMaintenances],
  );

  const cancelMaintenance = useCallback(
    async (id, observations = "") => {
      const result = await maintenanceService.cancelMaintenance(id, {
        observations,
      });
      await loadMaintenances();
      return result;
    },
    [loadMaintenances],
  );

  return {
    maintenances,
    loading,
    error,
    page,
    setPage,
    size,
    setSize,
    totalElements,
    totalPages,
    filters,
    setFilters,
    municipalityId,
    currentUserId,
    isSuperAdmin,
    canRead,
    canCreate,
    canUpdate,
    canExecute,
    canConfirm,
    canViewCosts,
    assets,
    users,
    persons,
    suppliers,
    getAssetName,
    getUserName,
    getPersonName,
    getSupplierName,
    loadMaintenances,
    createMaintenance,
    updateMaintenance,
    startMaintenance,
    completeMaintenance,
    confirmMaintenance,
    suspendMaintenance,
    rescheduleMaintenance,
    cancelMaintenance,
  };
}

export default useMaintenance;
