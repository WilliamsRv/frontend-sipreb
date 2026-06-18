import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Swal from "sweetalert2";
import { pdf } from "@react-pdf/renderer";
import useMaintenance from "../hooks/useMaintenance";
import { useNotifications } from "../../ms-09-notificaciones/hooks/useNotifications";
import MaintenanceStats from "../components/MaintenanceStats";
import MaintenanceFilters from "../components/MaintenanceFilters";
import MaintenanceTable from "../components/MaintenanceTable";
import MaintenanceForm from "../components/MaintenanceForm";
import MaintenanceDetails from "../components/MaintenanceDetails";
import MaintenanceStatusFlow from "../components/MaintenanceStatusFlow";
import MaintenanceReport from "../reports/MaintenanceReport";
import SingleMaintenanceReport from "../reports/SingleMaintenanceReport";
import maintenanceService from "../services/maintenanceService";
import ConformityActReport from "../reports/ConformityActReport";
import { getMunicipalidadById } from "../../ms-01-tenant-management/services/municipalidadService";
import { loadCompressedLogo } from "../../../shared/reports";
import { extractMaintenancesList } from "../utils/maintenanceMapper";

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef(null);

  const setDebouncedValue = useCallback(
    (val) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setDebounced(val), delay);
    },
    [delay],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return [debounced, setDebouncedValue];
}

export default function MantenimientoPage() {
  const {
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
    assets,
    users,
    suppliers,
    isSuperAdmin,
    municipalityId,
    canCreate,
    canUpdate,
    canExecute,
    canConfirm,
    canViewCosts,
    persons,
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
    cancelMaintenance,
    rescheduleMaintenance,
  } = useMaintenance();

  const {
    notifications,
    markAsRead,
  } = useNotifications();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useDebounce("", 400);
  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [statusFlowOpen, setStatusFlowOpen] = useState(false);
  const [selectedMaintenance, setSelectedMaintenance] = useState(null);
  const [statusFlowAction, setStatusFlowAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const processedNotificationsRef = useRef(new Set());

  // Limpiar el ref de notificaciones procesadas al desmontar
  useEffect(() => {
    return () => {
      processedNotificationsRef.current.clear();
    };
  }, []);

  const getLogoBase64 = useCallback(() => loadCompressedLogo(80), []);

  const fetchMuniData = useCallback(async (id) => {
    if (!id) return {};
    const cached = sessionStorage.getItem("muniData");
    if (cached) {
      try { return JSON.parse(cached); } catch {}
    }
    try {
      const muni = await getMunicipalidadById(id);
      if (muni?.nombre) sessionStorage.setItem("muniData", JSON.stringify(muni));
      return muni || {};
    } catch {
      return {};
    }
  }, []);

  const fetchMuniName = useCallback(async (id) => {
    const muni = await fetchMuniData(id);
    return muni?.nombre || "";
  }, [fetchMuniData]);

  const handleSearchChange = (val) => {
    setSearchInput(val);
    setDebouncedSearch(val);
    setPage(0);
  };

  useEffect(() => {
    setFilters((prev) => ({ ...prev, search: debouncedSearch }));
  }, [debouncedSearch, setFilters]);

  const handleStatusChange = (val) => {
    setFilters((prev) => ({ ...prev, status: val }));
    setPage(0);
  };

  const handleTypeChange = (val) => {
    setFilters((prev) => ({ ...prev, type: val }));
    setPage(0);
  };

  const handlePriorityChange = (val) => {
    setFilters((prev) => ({ ...prev, priority: val }));
    setPage(0);
  };

  const handleCreateNew = () => {
    setSelectedMaintenance(null);
    setFormOpen(true);
  };

  const handleView = (maintenance) => {
    const latest =
      maintenances.find((m) => m.id === maintenance.id) || maintenance;
    setSelectedMaintenance(latest);
    setDetailsOpen(true);
  };

  const handleEdit = (maintenance) => {
    setSelectedMaintenance(maintenance);
    setFormOpen(true);
    setDetailsOpen(false);
  };

  const handleFormSave = async (data) => {
    try {
      setSaving(true);
      if (selectedMaintenance) {
        const updated = await updateMaintenance(selectedMaintenance.id, data);
        if (updated && detailsOpen) {
          setSelectedMaintenance(updated);
        }
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Mantenimiento actualizado correctamente",
          showConfirmButton: false,
          timer: 2000,
          timerProgressBar: true,
        });
      } else {
        const result = await createMaintenance(data);
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: `Mantenimiento ${result?.maintenanceCode || ""} creado`,
          showConfirmButton: false,
          timer: 2000,
          timerProgressBar: true,
        });
      }
      setFormOpen(false);
      setSelectedMaintenance(null);
    } catch (err) {
      const detail = err.message || "No se pudo guardar el mantenimiento";

      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: "No se pudo guardar",
        text: detail,
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAction = (maintenance, action) => {
    setSelectedMaintenance(maintenance);
    setStatusFlowAction(action);
    setStatusFlowOpen(true);
    setDetailsOpen(false);
  };

  const handleStatusExecute = async (action, maintenance, formData) => {
    switch (action) {
      case "start":
        return startMaintenance(maintenance.id, formData.observations);
      case "complete":
        return completeMaintenance(maintenance.id, {
          workOrder: formData.workOrder,
          laborCost: formData.laborCost ? parseFloat(formData.laborCost) : null,
          additionalCost: formData.additionalCost
            ? parseFloat(formData.additionalCost)
            : null,
          appliedSolution: formData.appliedSolution,
          observations: formData.observations,
          invoiceNumber: formData.invoiceNumber || "",
        });
      case "confirm":
        return confirmMaintenance(maintenance.id, {
          conformityNumber: formData.conformityNumber,
          workQuality: formData.workQuality,
          assetConditionAfter: formData.assetConditionAfter,
          observations: formData.observations,
          supplierRepresentativeName: formData.supplierRepresentativeName,
          supplierRepresentativeDni: formData.supplierRepresentativeDni,
          userAreaResponsibleName: formData.userAreaResponsibleName,
          userAreaResponsiblePosition: formData.userAreaResponsiblePosition,
          userAreaResponsibleDni: formData.userAreaResponsibleDni,
          requiresFollowup: formData.requiresFollowup,
          followupDescription: formData.followupDescription,
          digitalSignature: formData.digitalSignature,
          patrimonialControllerName: formData.patrimonialControllerName,
          patrimonialControllerDni: formData.patrimonialControllerDni,
        });
      case "suspend":
        return suspendMaintenance(
          maintenance.id,
          formData.nextDate,
          formData.observations,
        );
      case "cancel":
        return cancelMaintenance(maintenance.id, formData.observations);
      case "reschedule":
        return rescheduleMaintenance(
          maintenance.id,
          formData.nextDate,
          formData.observations,
        );
      default:
        throw new Error("Acción no reconocida");
    }
  };

  const handleExportPDF = async () => {
    try {
      setPdfGenerating(true);
      const [logoBase64, muniName] = await Promise.all([
        getLogoBase64(),
        fetchMuniName(municipalityId),
      ]);
      const MAX_PDF_PAGES = 100;
      let pdfData = maintenances;
      if (totalPages > 1) {
        const pagesToFetch = Math.min(totalPages, MAX_PDF_PAGES);
        if (totalPages > MAX_PDF_PAGES) {
          Swal.fire({
            icon: "warning",
            title: "Exportación parcial",
            text: `El reporte tiene ${totalPages} páginas. Se exportarán solo las primeras ${MAX_PDF_PAGES} (${MAX_PDF_PAGES * size} registros).`,
            confirmButtonText: "Continuar",
          });
        }
        const pagePromises = [];
        for (let p = 0; p < pagesToFetch; p++) {
          pagePromises.push(maintenanceService.getAll(municipalityId, p, size, filters));
        }
        const allPageData = await Promise.all(pagePromises);
        const allItems = [];
        for (const pageData of allPageData) {
          const items = pageData?.content ? extractMaintenancesList(pageData.content) : (Array.isArray(pageData) ? pageData : []);
          allItems.push(...items);
        }
        pdfData = allItems;
      }
      const assetMap = {}, userMap = {}, supplierMap = {};
      users.forEach((u) => { userMap[u.id] = u; });
      persons.forEach((p) => { userMap[p.id] = p; });
      (suppliers || []).forEach((s) => { supplierMap[s.id || s.supplierId] = s; });
      (assets || []).forEach((a) => { assetMap[a.id] = a; });
      const enrichedMaintenances = pdfData.map((m) => ({
        ...m,
        _assetName: assetMap[m.assetId]?.name || assetMap[m.assetId]?.nombre || m.assetId || "—",
        _responsibleName: userMap[m.technicalResponsibleId]?.nombre || userMap[m.technicalResponsibleId]?.name || m.technicalResponsibleId || "—",
        _supplierName: supplierMap[m.serviceSupplierId]?.name || supplierMap[m.serviceSupplierId]?.nombre || m.serviceSupplierId || "—",
      }));
      const blob = await pdf(
        <MaintenanceReport
          maintenances={enrichedMaintenances}
          municipalityLogo={logoBase64}
          municipalityName={muniName}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reporte_mantenimientos_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      Swal.close();
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: "Error",
        text: "No se pudo generar el documento PDF.",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleDownloadIndividual = async (maintenance) => {
    try {
      Swal.fire({
        title: "Generando PDF...",
        html: '<div class="swal-loading-spinner"><div class="spinner"></div><p style="margin-top:12px;font-size:13px;color:#64748b;">Obteniendo detalles adicionales</p></div>',
        allowOutsideClick: false,
        showConfirmButton: false,
      });

      const [logoBase64, muniName, parts, history] = await Promise.all([
        getLogoBase64(),
        fetchMuniName(municipalityId),
        maintenanceService.getParts(maintenance.id, 0, 1000),
        maintenanceService.getHistory(maintenance.id, 0, 1000).catch(() => []),
      ]);

      let supplierName = getSupplierName(maintenance.serviceSupplierId);
      if (supplierName === "—" || supplierName.length > 20) {
        try {
          const sd = await maintenanceService.getSupplierDetails(
            maintenance.serviceSupplierId,
          );
          supplierName =
            sd?.legalName ||
            sd?.tradeName ||
            sd?.razonSocial ||
            sd?.nombre ||
            sd?.name ||
            sd?.nombreComercial ||
            sd?.fullName ||
            supplierName;
        } catch {}
      }

      const enrichedMaintenance = {
        ...maintenance,
        _assetName: getAssetName(maintenance.assetId),
        _responsibleName: getUserName(maintenance.technicalResponsibleId),
        _supplierName: supplierName,
        _supervisorName: getUserName(maintenance.supervisorId),
        _requestedByName: getUserName(maintenance.requestedBy),
      };
      const blob = await pdf(
        <SingleMaintenanceReport
          maintenance={enrichedMaintenance}
          parts={parts}
          history={history}
          hideCosts={!canViewCosts}
          municipalityLogo={logoBase64}
          municipalityName={muniName}
        />,
      ).toBlob();

      Swal.close();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ficha_${maintenance.maintenanceCode || "doc"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      Swal.close();
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: "Error",
        text: "No se pudo generar la ficha individual.",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    }
  };

  const handleDownloadConformityAct = async (maintenance) => {
    try {
      Swal.fire({
        title: "Generando Acta SBN...",
        html: '<div class="swal-loading-spinner"><div class="spinner"></div><p style="margin-top:12px;font-size:13px;color:#64748b;">Obteniendo datos de patrimonio y proveedor</p></div>',
        allowOutsideClick: false,
        showConfirmButton: false,
      });

      // 0. Obtener detalle completo (la lista no trae campos detallados)
      const fullMaintenance = await maintenanceService.getById(maintenance.id);

      // 1. Obtener repuestos
      const parts = await maintenanceService.getParts(fullMaintenance.id, 0, 1000);

      // 2. Obtener detalles del bien desde ms-patrimonio
      let assetDetails = {};
      try {
        assetDetails = await maintenanceService.getAssetDetails(
          maintenance.assetId,
        );
      } catch (err) {
        console.warn("No se pudieron obtener detalles del bien:", err);
      }

      // 3. Obtener detalles del proveedor desde ms-configuracion
      let supplierDetails = {};
      try {
        if (maintenance.serviceSupplierId) {
          supplierDetails = await maintenanceService.getSupplierDetails(
            maintenance.serviceSupplierId,
          );
        }
      } catch (err) {
        console.warn("No se pudieron obtener detalles del proveedor:", err);
      }

      // 4. Obtener datos de la municipalidad
      const [logoBase64, muniData] = await Promise.all([
        getLogoBase64(),
        fetchMuniData(municipalityId),
      ]);
      const muniName = muniData?.nombre || "";
      const muniPlace = [muniData?.distrito, muniData?.provincia]
        .filter(Boolean)
        .join(", ") || "";
      const municipalityDetails = { name: muniName };

      // 5. Preparar props para el reporte
      const reportProps = {
        maintenance: {
          workOrder: fullMaintenance.workOrder,
          serviceReference: fullMaintenance.serviceReference,
          executionDays: fullMaintenance.executionDays,
          maintenanceType: fullMaintenance.maintenanceType,
          supplierRuc: fullMaintenance.supplierRuc || supplierDetails?.ruc,
          assetCode: fullMaintenance.assetCode,
          assetDescription: fullMaintenance.assetDescription,
          endDate: fullMaintenance.endDate,
          maintenanceCode: fullMaintenance.maintenanceCode,
          appliedSolution: fullMaintenance.appliedSolution,
          requiresFollowup: fullMaintenance.requiresFollowup,
          followupDescription: fullMaintenance.followupDescription,
        },
        conformity: {
          conformityNumber:
            fullMaintenance.conformityNumber ||
            `CONF-${fullMaintenance.maintenanceCode}`,
          workQuality: fullMaintenance.workQuality,
          assetConditionAfter: fullMaintenance.assetConditionAfter,
          supplierRepresentativeName: fullMaintenance.supplierRepresentativeName,
          supplierRepresentativeDni: fullMaintenance.supplierRepresentativeDni,
          userAreaResponsibleName: fullMaintenance.userAreaResponsibleName,
          userAreaResponsiblePosition: fullMaintenance.userAreaResponsiblePosition,
          userAreaResponsibleDni: fullMaintenance.userAreaResponsibleDni,
          patrimonialControllerName: fullMaintenance.patrimonialControllerName || "",
          patrimonialControllerDni: fullMaintenance.patrimonialControllerDni || "—",
          digitalSignature: fullMaintenance.digitalSignature,
        },
        parts: parts,
        asset: {
          assetCode: assetDetails.assetCode || fullMaintenance.assetCode,
          description: assetDetails.description || fullMaintenance.assetDescription,
          brand: assetDetails.brand || "—",
          model: assetDetails.model || "—",
          serialNumber: assetDetails.serialNumber || "—",
        },
        supplier: {
          legalName:
            supplierDetails.legalName ||
            supplierDetails.tradeName ||
            supplierDetails.razonSocial ||
            supplierDetails.nombre ||
            supplierDetails.name ||
            getSupplierName(fullMaintenance.serviceSupplierId),
          ruc:
            supplierDetails.ruc ||
            supplierDetails.numeroDocumento ||
            fullMaintenance.supplierRuc ||
            "—",
        },
        municipality: municipalityDetails,
        userAreaResponsible: {
          name: fullMaintenance.userAreaResponsibleName || "—",
          position: fullMaintenance.userAreaResponsiblePosition || "—",
          dni: fullMaintenance.userAreaResponsibleDni || "—",
        },
        place: muniPlace || "San Luis, Cañete",
        municipalityLogo: logoBase64,
        officeName: muniData?.oficinaPatrimonial || "Oficina de Control Patrimonial / Unidad de Logística",
      };

      const blob = await pdf(<ConformityActReport {...reportProps} />).toBlob();

      Swal.close();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `acta_conformidad_${fullMaintenance.maintenanceCode || "doc"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      Swal.close();
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: "Error",
        text: "No se pudo generar el acta de conformidad.",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    }
  };

  // Efecto para manejar notificaciones de mantenimiento
  useEffect(() => {
    const maintenanceNotifications = notifications.filter((n) => {
      const isMaintenanceRelated = 
        n.referenceType === "maintenance" || 
        n.sourceService === "vg-ms-mantenimiento-service" ||
        (n.title && n.title.toLowerCase().includes("mantenimiento")) ||
        (n.message && n.message.toLowerCase().includes("mantenimiento"));
      return isMaintenanceRelated;
    });

    if (maintenanceNotifications.length > 0) {
      // Procesar notificaciones no leídas más recientes
      const unreadNotifications = maintenanceNotifications.filter(n => !n.read);
      
      unreadNotifications.forEach(notification => {
        // Evitar procesar la misma notificación múltiples veces
        if (processedNotificationsRef.current.has(notification.id)) {
          return;
        }
        
        // Solo mostrar toast si la notificación es reciente (últimos 60 segundos)
        const notificationTime = new Date(notification.createdAt || Date.now());
        const now = new Date();
        const diffInSeconds = (now - notificationTime) / 1000;
        
        if (diffInSeconds < 60) {
          const toastIcon = notification.type === "ERROR" ? "error" : 
                            notification.type === "WARNING" ? "warning" : 
                            notification.type === "SUCCESS" ? "success" : "info";

          Swal.fire({
            toast: true,
            position: "top-end",
            icon: toastIcon,
            title: notification.title || "Notificación de Mantenimiento",
            text: notification.message || "",
            showConfirmButton: false,
            timer: 4000,
            timerProgressBar: true,
          });

          // Marcar como leída automáticamente y agregar a procesadas
          processedNotificationsRef.current.add(notification.id);
          markAsRead(notification.id);
        } else {
          // Si es antigua, marcarla como procesada para evitar re-procesamiento
          processedNotificationsRef.current.add(notification.id);
        }

        // Si la notificación contiene un referenceId válido, actualizar la lista de mantenimientos
        if (notification.referenceId && diffInSeconds < 60) {
          loadMaintenances();
        }
      });
      
      // Marcar notificaciones leídas como procesadas para evitar re-procesamiento
      maintenanceNotifications
        .filter(n => n.read)
        .forEach(n => processedNotificationsRef.current.add(n.id));
    }
  }, [notifications, loadMaintenances, markAsRead]);

  if (isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-red-100">
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">
              Acceso Restringido
            </h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              El rol de <b>Super Administrador</b> no tiene privilegios para
              acceder a módulos municipales específicos. Por favor, ingrese con
              una cuenta de municipio válida.
            </p>
            <button
              onClick={() => (window.location.href = "/")}
              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-200"
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && maintenances.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-200 border-t-orange-600 mb-3"></div>
        <p className="text-slate-600 font-medium">Inicializando módulos...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 p-4">
      <div className="bg-orange-600 shadow-lg mb-5 rounded-2xl">
        <div className="px-5 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-inner text-white">
                <svg
                  className="w-7 h-7"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Módulo de Mantenimientos
                </h1>
                <p className="text-orange-100 text-xs font-medium">
                  {totalElements || maintenances.length} registros activos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportPDF}
                disabled={pdfGenerating}
                className="flex items-center gap-2 px-5 py-2.5 bg-transparent border-2 border-white/70 hover:bg-white/20 text-white rounded-xl font-semibold transition-all duration-200 text-sm disabled:opacity-50"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Reporte PDF
              </button>
              {canCreate && (
                <button
                  onClick={handleCreateNew}
                  className="flex items-center gap-2 px-5 py-2.5 bg-transparent border-2 border-white/70 hover:bg-white/20 text-white rounded-xl font-semibold transition-all duration-200 text-sm"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  Nueva Solicitud
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-sm flex items-center justify-between">
          <div>
            <p className="font-medium">Error de sincronización</p>
            <p className="text-sm">{error}</p>
          </div>
          <button
            onClick={loadMaintenances}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {maintenances.length > 0 && (
        <div className="mb-4 bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <MaintenanceStats maintenances={maintenances} />
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 mb-4">
        <MaintenanceFilters
          searchQuery={searchInput}
          onSearchChange={handleSearchChange}
          statusFilter={filters.status}
          onStatusChange={handleStatusChange}
          typeFilter={filters.type}
          onTypeChange={handleTypeChange}
          priorityFilter={filters.priority}
          onPriorityChange={handlePriorityChange}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden relative">
        {loading && maintenances.length > 0 && (
          <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center">
            <div className="flex items-center gap-3 px-6 py-3 bg-white rounded-2xl shadow-lg border border-gray-100">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-orange-200 border-t-orange-600"></div>
              <span className="text-sm font-semibold text-slate-600">Actualizando...</span>
            </div>
          </div>
        )}
        <MaintenanceTable
          maintenances={maintenances}
          loading={loading}
          getAssetName={getAssetName}
          getUserName={getUserName}
          getPersonName={getPersonName}
          getSupplierName={getSupplierName}
          onView={handleView}
          onEdit={handleEdit}
          onStatusAction={handleStatusAction}
          onDownload={handleDownloadIndividual}
          onDownloadConformityAct={handleDownloadConformityAct}
          canUpdate={canUpdate}
          canExecute={canExecute}
          canConfirm={canConfirm}
          page={page}
          setPage={setPage}
          size={size}
          setSize={setSize}
          totalPages={totalPages}
        />
      </div>

      <MaintenanceForm
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setSelectedMaintenance(null);
        }}
        onSave={handleFormSave}
        maintenance={selectedMaintenance}
        assets={assets}
        users={users}
        persons={persons}
        suppliers={suppliers}
        saving={saving}
      />

      <MaintenanceDetails
        isOpen={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setSelectedMaintenance(null);
        }}
        maintenance={selectedMaintenance}
        onUpdateMaintenance={updateMaintenance}
        getUserName={getUserName}
        getPersonName={getPersonName}
        getSupplierName={getSupplierName}
        assets={assets}
        users={users}
        suppliers={suppliers}
        onDownloadConformityAct={handleDownloadConformityAct}
        canUpdate={canUpdate}
        canExecute={canExecute}
        canViewCosts={canViewCosts}
      />

      <MaintenanceStatusFlow
        isOpen={statusFlowOpen}
        action={statusFlowAction}
        maintenance={selectedMaintenance}
        onClose={() => {
          setStatusFlowOpen(false);
          setStatusFlowAction(null);
          setSelectedMaintenance(null);
        }}
        onExecute={handleStatusExecute}
      />
    </div>
  );
}
