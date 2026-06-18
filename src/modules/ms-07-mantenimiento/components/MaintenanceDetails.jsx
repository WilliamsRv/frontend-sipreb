import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Swal from "sweetalert2";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  TYPE_LABELS,
  TYPE_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from "../constants/maintenance.constants";
import maintenanceService from "../services/maintenanceService";
import { pdf } from "@react-pdf/renderer";
import SingleMaintenanceReport from "../reports/SingleMaintenanceReport";
import {
  normalizeMaintenance,
  computeFinancialSummary,
  mergeMaintenanceRecords,
} from "../utils/maintenanceMapper";
import { getMunicipalidadById } from "../../ms-01-tenant-management/services/municipalidadService";
import { loadCompressedLogo } from "../../../shared/reports";

const InfoRow = ({ label, value, full = false }) => {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1">
        {label}
      </dt>
      <dd className="text-sm text-slate-700 font-bold leading-tight">
        {isEmpty ? "—" : value}
      </dd>
    </div>
  );
};

export default function MaintenanceDetails({
  isOpen,
  onClose,
  maintenance,
  onUpdateMaintenance,
  getUserName,
  getPersonName,
  getSupplierName,
  assets,
  users,
  suppliers,
  onDownloadConformityAct,
  canUpdate = false,
  canExecute = false,
  canViewCosts = false,
}) {
  const [history, setHistory] = useState([]);
  const [parts, setParts] = useState([]);
  const [conformity, setConformity] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingParts, setLoadingParts] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [showAddPart, setShowAddPart] = useState(false);
  const [localMaintenance, setLocalMaintenance] = useState(null);
  const [reprogramming, setReprogramming] = useState(false);
  const [autoReprogrammed, setAutoReprogrammed] = useState(false);
  const [newPart, setNewPart] = useState({
    partName: "",
    partType: "SPARE_PART",
    quantity: 1,
    unitCost: "",
    unitOfMeasure: "UND",
  });
  const [addingPart, setAddingPart] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [supplierDisplay, setSupplierDisplay] = useState("—");
  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const autoReprogramDoneRef = useRef(false);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const municipalityId = useMemo(() => {
    try {
      const user = JSON.parse(sessionStorage.getItem("user") || "{}");
      return user?.municipalityId || user?.municipalidadId || null;
    } catch { return null; }
  }, []);

  const fetchParts = (id, controller) => {
    if (!mountedRef.current) return;
    setLoadingParts(true);
    maintenanceService
      .getParts(id, 0, 100, controller?.signal)
      .then((data) => {
        if (mountedRef.current && !controller?.signal?.aborted) {
          const arr = Array.isArray(data) ? data : data?.content || [];
          setParts(arr);
        }
      })
      .catch(() => {
        if (mountedRef.current && !controller?.signal?.aborted) setParts([]);
      })
      .finally(() => {
        if (mountedRef.current && !controller?.signal?.aborted) setLoadingParts(false);
      });
  };

  useEffect(() => {
    if (isOpen && maintenance?.id) {
      setHistory([]);
      setParts([]);
      setConformity(null);
      setLocalMaintenance(normalizeMaintenance(maintenance));
      setAutoReprogrammed(false);
      autoReprogramDoneRef.current = false;
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      maintenanceService
        .getById(maintenance.id, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted && data) {
            setLocalMaintenance((prev) =>
              mergeMaintenanceRecords(prev || maintenance, data),
            );
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            console.warn("[MaintenanceDetails] getById falló:", err?.message);
          }
        });

      setLoadingHistory(true);
      maintenanceService
        .getHistory(maintenance.id, 0, 100, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            const arr = Array.isArray(data) ? data : data?.content || [];
            setHistory(arr);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setHistory([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingHistory(false);
        });

      fetchParts(maintenance.id, controller);

      if (maintenance.maintenanceStatus === "CONFIRMED") {
        maintenanceService
          .getConformity(maintenance.id, controller.signal)
          .then((data) => {
            if (!controller.signal.aborted) setConformity(data);
          })
          .catch(() => {
            if (!controller.signal.aborted) setConformity(null);
          });
      } else {
        setConformity(null);
      }
    }
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [isOpen, maintenance]);

  const emptyMaintenance = useMemo(() => ({}), []);
  const currentMaintenance = useMemo(
    () =>
      normalizeMaintenance(localMaintenance || maintenance || emptyMaintenance),
    [localMaintenance, maintenance, emptyMaintenance],
  );

  const financialSummary = useMemo(
    () => computeFinancialSummary(currentMaintenance, parts),
    [currentMaintenance, parts],
  );

  useEffect(() => {
    const supplierId = currentMaintenance.serviceSupplierId;
    if (!supplierId) {
      setSupplierDisplay("—");
      return;
    }

    const name = getSupplierName(supplierId);
    if (name && name !== String(supplierId)) {
      setSupplierDisplay(name);
      return;
    }

    let active = true;
    maintenanceService
      .getSupplierDetails(supplierId)
      .then((data) => {
        if (!active) return;
        const resolved =
          data?.legalName ||
          data?.tradeName ||
          data?.name ||
          String(supplierId);
        setSupplierDisplay(resolved);
      })
      .catch(() => {
        if (active) setSupplierDisplay(String(supplierId));
      });

    return () => {
      active = false;
    };
  }, [currentMaintenance.serviceSupplierId, getSupplierName]);

  const handleAddPart = async (e) => {
    e.preventDefault();
    if (!newPart.partName || !newPart.quantity || !newPart.unitCost) return;
    try {
      setAddingPart(true);
      await maintenanceService.addPart(currentMaintenance.id || maintenance.id, {
        ...newPart,
        quantity: parseFloat(newPart.quantity) || 1,
        unitCost: parseFloat(newPart.unitCost) || 0,
      });
      setNewPart({
        partName: "",
        partType: "SPARE_PART",
        quantity: 1,
        unitCost: "",
        unitOfMeasure: "UND",
      });
      setShowAddPart(false);
      const partsController = new AbortController();
      fetchParts(currentMaintenance.id || maintenance.id, partsController);
    } catch (err) {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: "Error",
        text: err.message || "Error al agregar repuesto",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    } finally {
      setAddingPart(false);
    }
  };

  const getLogoBase64 = useCallback(() => loadCompressedLogo(80), []);

  const handleExportPDF = async () => {
    try {
      setPdfGenerating(true);
      const m = currentMaintenance;
      const assetDesc = assets?.find((a) => a.id === m.assetId);
      let supplierName = getSupplierName(m.serviceSupplierId);
      if (supplierName === "—" || supplierName.length > 20) {
        try {
          const sd = await maintenanceService.getSupplierDetails(
            m.serviceSupplierId,
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
        ...m,
        _assetName:
          assetDesc?.description ||
          assetDesc?.descripcion ||
          m.assetDescription ||
          m.assetId ||
          "—",
        _responsibleName: getUserName(m.technicalResponsibleId),
        _supplierName: supplierName,
        _supervisorName: getUserName(m.supervisorId),
        _requestedByName: getUserName(m.requestedBy),
      };
      const [logoBase64, muniName] = await Promise.all([
        getLogoBase64(),
        (async () => {
          try {
            const muni = await getMunicipalidadById(municipalityId);
            return muni?.nombre || "";
          } catch { return ""; }
        })(),
      ]);
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

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ficha_mantenimiento_${m.maintenanceCode || "doc"}.pdf`;
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
        text: "No se pudo generar la ficha PDF.",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const parseDateOnly = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value !== "string" || value.length !== 10) return null;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const addDays = (date, days) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

  const executionDaysValue =
    parseInt(currentMaintenance.executionDays || 0, 10) || 0;
  const scheduledDateObj = parseDateOnly(currentMaintenance.scheduledDate);
  const actualEndDate = parseDateOnly(currentMaintenance.endDate);
  const endDateObj = actualEndDate || (scheduledDateObj && executionDaysValue
    ? addDays(scheduledDateObj, executionDaysValue)
    : null);

  const today = new Date();
  const todayMid = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const diffDays = endDateObj
    ? Math.floor(
        (endDateObj.getTime() - todayMid.getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;
  const isOverdue = diffDays !== null && diffDays < 0;
  const isNearDue = diffDays !== null && diffDays >= 0 && diffDays <= 3;

  const handleReprogramPlusOne = useCallback(async () => {
    if (!currentMaintenance?.id) return;
    const nextDays = executionDaysValue + 1;
    setReprogramming(true);
    try {
      await onUpdateMaintenance(currentMaintenance.id, {
        executionDays: nextDays,
      });
      setLocalMaintenance((prev) => ({
        ...(prev || currentMaintenance),
        executionDays: nextDays,
      }));
      setAutoReprogrammed(true);
    } catch (err) {
      console.error("Error al reprogramar:", err.message);
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: "Error",
        text: `No se pudo reprogramar automáticamente: ${err.message}`,
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });
    } finally {
      setReprogramming(false);
    }
  }, [currentMaintenance, executionDaysValue, onUpdateMaintenance]);

  useEffect(() => {
    if (!isOpen || !currentMaintenance?.id) return;
    if (autoReprogramDoneRef.current || autoReprogrammed) return;
    if (!isOverdue) return;
    if (!currentMaintenance.scheduledDate || !executionDaysValue) return;
    if (!canUpdate) return;
    if (
      currentMaintenance.maintenanceStatus === "PENDING_CONFORMITY" ||
      currentMaintenance.maintenanceStatus === "CONFIRMED"
    )
      return;

    handleReprogramPlusOne();
    autoReprogramDoneRef.current = true;
  }, [
    currentMaintenance?.id,
    isOpen,
    autoReprogrammed,
    isOverdue,
    currentMaintenance?.scheduledDate,
    currentMaintenance?.maintenanceStatus,
    executionDaysValue,
    canUpdate,
    handleReprogramPlusOne,
  ]);

  if (!isOpen || !maintenance) return null;

  const formatDate = (date) => {
    if (!date) return "—";
    if (typeof date === "string" && date.length === 10) {
      const [year, month, day] = date.split("-");
      const months = [
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre",
      ];
      const monthIndex = parseInt(month, 10) - 1;
      const monthName = months[monthIndex] || `mes ${month}`;
      return `${day} de ${monthName} de ${year}`;
    }
    return new Date(date).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const formatDateTime = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount) => {
    const val = parseFloat(amount || 0);
    return `S/ ${val.toFixed(2)}`;
  };

  const sc = STATUS_COLORS[currentMaintenance.maintenanceStatus] || {
    bg: "#f1f5f9",
    text: "#64748b",
    dot: "#94a3b8",
  };
  const {
    partsTotal,
    laborCost,
    additionalCost,
    total: computedTotal,
  } = financialSummary;
  const serviceOrderRef =
    currentMaintenance.serviceReference || currentMaintenance.workOrder || "";
  const executionDaysDisplay =
    currentMaintenance.executionDays !== undefined &&
    currentMaintenance.executionDays !== null
      ? `${currentMaintenance.executionDays} día${currentMaintenance.executionDays === 1 ? "" : "s"}`
      : null;

  const tabs = [
    { id: "info", label: "Detalles" },
    { id: "history", label: "Línea de Tiempo" },
    { id: "parts", label: "Repuestos" },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: "fadeIn 0.3s ease-out" }}
      />
      <div
        className="relative bg-white w-full max-w-xl h-full shadow-[-20px_0_50px_-15px_rgba(0,0,0,0.1)] flex flex-col border-l border-slate-100"
        style={{ animation: "sheetSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Header */}
        <div className="px-8 py-7 shrink-0 border-b border-slate-50">
          <div className="flex items-start justify-between mb-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: sc.dot }}
                />
                <h2 className="text-2xl font-black text-slate-900 tracking-tighter">
                  {currentMaintenance.maintenanceCode}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm ring-1 ring-inset ring-slate-200/50"
                  style={{ backgroundColor: sc.bg, color: sc.text }}
                >
                  {STATUS_LABELS[currentMaintenance.maintenanceStatus]}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                  Ref: {currentMaintenance.id.substring(0, 8)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportPDF}
                disabled={pdfGenerating}
                className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all active:scale-90 disabled:opacity-50"
                title="Exportar PDF"
              >
                {pdfGenerating ? (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    ></path>
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
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
                )}
              </button>
              {currentMaintenance.maintenanceStatus === "CONFIRMED" && (
                <button
                  onClick={() => onDownloadConformityAct(currentMaintenance)}
                  className="w-10 h-10 flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-xl transition-all active:scale-90"
                  title="Descargar Acta SBN"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all active:scale-90"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex bg-slate-100/50 p-1 rounded-2xl gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                  activeTab === tab.id
                    ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          {activeTab === "info" && (
            <div className="space-y-10 animate-fadeIn">
              {/* Activo Card - Estilo Floating Badge */}
              {(() => {
                const asset = assets.find(
                  (a) => a.id === currentMaintenance.assetId,
                );
                const assetName = asset
                  ? asset.description || asset.descripcion
                  : currentMaintenance.assetDescription || "—";
                const assetCode = asset
                  ? asset.assetCode || asset.codigoBien
                  : currentMaintenance.assetCode || "—";

                return (
                  <section className="bg-white rounded-[2rem] p-6 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] border border-slate-100 relative overflow-hidden group">
                    <div className="relative z-10 flex items-center gap-5">
                      {/* Icono identificador */}
                      <div className="shrink-0 w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-500 shadow-sm shadow-indigo-100">
                        <svg
                          className="w-7 h-7"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Activo Vinculado
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 truncate mb-0.5 leading-tight">
                          {assetName}
                        </h3>
                        <p className="text-xs font-bold text-indigo-500/70 tracking-widest uppercase">
                          CÓDIGO: {assetCode}
                        </p>
                      </div>
                    </div>

                    {/* Decoración de fondo casi invisible */}
                    <div className="absolute -right-4 -bottom-4 text-slate-50/50 transform rotate-12">
                      <svg
                        className="w-32 h-32"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                      </svg>
                    </div>
                  </section>
                );
              })()}

              {/* Grid de Detalles */}
              <section className="grid grid-cols-2 gap-8">
                <InfoRow
                  label="Categoría"
                  value={
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tighter"
                      style={{
                        backgroundColor:
                          TYPE_COLORS[currentMaintenance.maintenanceType]?.bg,
                        color:
                          TYPE_COLORS[currentMaintenance.maintenanceType]?.text,
                      }}
                    >
                      {TYPE_LABELS[currentMaintenance.maintenanceType]}
                    </span>
                  }
                />
                <InfoRow
                  label="Prioridad"
                  value={
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tighter"
                      style={{
                        backgroundColor:
                          PRIORITY_COLORS[currentMaintenance.priority]?.bg,
                        color:
                          PRIORITY_COLORS[currentMaintenance.priority]?.text,
                      }}
                    >
                      {PRIORITY_LABELS[currentMaintenance.priority]}
                    </span>
                  }
                />
                <InfoRow
                  label="Programado"
                  value={formatDate(currentMaintenance.scheduledDate)}
                />
                <InfoRow
                  label="Garantía"
                  value={
                    currentMaintenance.hasWarranty
                      ? `Expira ${formatDate(currentMaintenance.warrantyExpirationDate)}`
                      : "No aplica"
                  }
                />
                <InfoRow label="O.S. / Referencia" value={serviceOrderRef} />
                <InfoRow
                  label="Días Fuera de Servicio"
                  value={executionDaysDisplay}
                />
                <InfoRow
                  label="Inicio Real"
                  value={formatDateTime(currentMaintenance.startDate)}
                />
                <InfoRow
                  label="Finalización"
                  value={formatDateTime(currentMaintenance.endDate)}
                />
              </section>

              {currentMaintenance.scheduledDate &&
                currentMaintenance.maintenanceStatus !== "PENDING_CONFORMITY" &&
                currentMaintenance.maintenanceStatus !== "CONFIRMED" && (
                  <section className="bg-slate-50 rounded-3xl p-5 border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {(isOverdue || isNearDue) && (
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${isOverdue ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}
                        >
                          {isOverdue ? "Vencido" : "Por vencer"}
                        </span>
                      )}
                      <p className="text-[11px] font-medium text-slate-500">
                        {isOverdue
                          ? "El plazo ya venció. Se reprograma automáticamente +1 día."
                          : "Puedes reprogramar +1 día si el trabajo sigue en curso."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleReprogramPlusOne}
                      disabled={!canUpdate || reprogramming}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        canUpdate
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95"
                          : "bg-slate-100 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      {reprogramming ? "Reprogramando..." : "+1 día"}
                    </button>
                  </section>
                )}

              {currentMaintenance.maintenanceStatus === "CONFIRMED" && (
                <section className="bg-emerald-50/30 rounded-[2rem] p-8 border border-emerald-100/50">
                  <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-6">
                    Conformidad SBN
                  </h4>
                  <div className="grid grid-cols-2 gap-y-8">
                    <InfoRow
                      label="Rep. Proveedor"
                      value={
                        conformity?.supplierRepresentativeName ||
                        currentMaintenance.supplierRepresentativeName
                      }
                    />
                    <InfoRow
                      label="DNI Rep."
                      value={
                        conformity?.supplierRepresentativeDni ||
                        currentMaintenance.supplierRepresentativeDni
                      }
                    />
                    <InfoRow
                      label="Responsable Área"
                      value={
                        conformity?.userAreaResponsibleName ||
                        currentMaintenance.userAreaResponsibleName
                      }
                    />
                    <InfoRow
                      label="Cargo / DNI"
                      value={`${conformity?.userAreaResponsiblePosition || currentMaintenance.userAreaResponsiblePosition || ""} (DNI: ${conformity?.userAreaResponsibleDni || currentMaintenance.userAreaResponsibleDni || ""})`}
                    />
                    <InfoRow
                      label="Calidad"
                      value={
                        conformity?.workQuality ||
                        currentMaintenance.workQuality
                      }
                    />
                    <InfoRow
                      label="Estado Final"
                      value={
                        conformity?.assetConditionAfter ||
                        currentMaintenance.assetConditionAfter
                      }
                    />
                    <InfoRow
                      label="Seguimiento"
                      value={
                        (
                          conformity
                            ? conformity.requiresFollowup
                            : currentMaintenance.requiresFollowup
                        )
                          ? "Sí"
                          : "No"
                      }
                    />
                    {(conformity
                      ? conformity.requiresFollowup
                      : currentMaintenance.requiresFollowup) && (
                      <InfoRow
                        label="Detalles Seguimiento"
                        value={
                          conformity?.followupDescription ||
                          currentMaintenance.followupDescription
                        }
                        full
                      />
                    )}
                  </div>
                  {(conformity?.digitalSignature ||
                    currentMaintenance.digitalSignature) && (
                    <div className="mt-6 pt-6 border-t border-emerald-100">
                      <dt className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.1em] mb-1">
                        Firma Digital
                      </dt>
                      <dd className="text-[8px] text-slate-400 break-all">
                        {conformity?.digitalSignature ||
                          currentMaintenance.digitalSignature}
                      </dd>
                    </div>
                  )}
                </section>
              )}

              {/* Bloques de Texto */}
              <section className="space-y-6">
                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                    Alcance del Trabajo
                  </h4>
                  <p className="text-sm text-slate-600 font-medium leading-relaxed whitespace-pre-line">
                    {currentMaintenance.workDescription ||
                      "Sin descripción técnica registrada."}
                  </p>
                </div>

                {currentMaintenance.reportedProblem && (
                  <div className="bg-amber-50/50 rounded-3xl p-6 border border-amber-100/50">
                    <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-4">
                      Problema Reportado
                    </h4>
                    <p className="text-sm text-amber-800 font-bold leading-relaxed">
                      {currentMaintenance.reportedProblem}
                    </p>
                  </div>
                )}
                {currentMaintenance.observations && (
                  <div className="bg-sky-50/50 rounded-3xl p-6 border border-sky-100/50">
                    <h4 className="text-[10px] font-black text-sky-600 uppercase tracking-widest mb-4">
                      Observaciones
                    </h4>
                    <p className="text-sm text-sky-800 font-bold leading-relaxed">
                      {currentMaintenance.observations}
                    </p>
                  </div>
                )}
                {currentMaintenance.appliedSolution && (
                  <div className="bg-emerald-50/50 rounded-3xl p-6 border border-emerald-100/50">
                    <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4">
                      Solución Implementada
                    </h4>
                    <p className="text-sm text-emerald-800 font-bold leading-relaxed">
                      {currentMaintenance.appliedSolution}
                    </p>
                  </div>
                )}
              </section>

              {/* Equipo Responsable */}
              <section className="bg-indigo-50/30 rounded-[2rem] p-8 border border-indigo-100/50">
                <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-6 text-center">
                  Equipo de Mantenimiento
                </h4>
                <div className="grid grid-cols-2 gap-y-8">
                  <InfoRow
                    label="Técnico"
                    value={(getPersonName || getUserName)(
                      currentMaintenance.technicalResponsibleId,
                    )}
                  />
                  <InfoRow label="Proveedor" value={supplierDisplay} />
                  <InfoRow
                    label="Supervisor"
                    value={getUserName(currentMaintenance.supervisorId)}
                  />
                  <InfoRow
                    label="Solicitante"
                    value={getUserName(currentMaintenance.requestedBy)}
                  />
                </div>
              </section>

              {canViewCosts && (
                <section className="pt-4">
                  <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-8 shadow-sm">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">
                      Resumen Financiero
                    </h4>
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">
                          Mano de Obra
                        </span>
                        <span className="text-slate-900 font-bold">
                          {formatCurrency(laborCost)}
                        </span>
                      </div>
                      {additionalCost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">
                            Costos Adicionales
                          </span>
                          <span className="text-slate-900 font-bold">
                            {formatCurrency(additionalCost)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">
                          Repuestos & Materiales
                        </span>
                        <span className="text-slate-900 font-bold">
                          {formatCurrency(partsTotal)}
                        </span>
                      </div>
                      <div className="pt-4 mt-4 border-t border-slate-100 flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-900 uppercase">
                          Inversión Total
                        </span>
                        <span className="text-2xl font-black text-indigo-600 tracking-tighter">
                          {formatCurrency(computedTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Secciones de Resumen Rápido (Timeline & Parts) */}
              <div className="grid grid-cols-1 gap-6">
                {/* Mini Timeline */}
                <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Últimos Eventos
                    </h4>
                    <button
                      onClick={() => setActiveTab("history")}
                      className="text-[10px] font-bold text-indigo-500 hover:underline uppercase"
                    >
                      Ver Todo
                    </button>
                  </div>
                  {history.length > 0 ? (
                    <div className="space-y-4">
                      {history.slice(0, 3).map((h, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <div
                            className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                            style={{
                              backgroundColor:
                                STATUS_COLORS[h.newStatus]?.dot || "#94a3b8",
                            }}
                          />
                          <div>
                            <p className="text-xs font-bold text-slate-700">
                              {STATUS_LABELS[h.newStatus] || h.newStatus}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium">
                              {formatDateTime(h.changedAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-bold italic">
                      No hay historial registrado
                    </p>
                  )}
                </div>

                {/* Mini Parts */}
                <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Insumos Registrados
                    </h4>
                    <button
                      onClick={() => setActiveTab("parts")}
                      className="text-[10px] font-bold text-indigo-500 hover:underline uppercase"
                    >
                      Ver Todo
                    </button>
                  </div>
                  {parts.length > 0 ? (
                    <div className="space-y-2">
                      {parts.slice(0, 3).map((p, i) => (
                        <div
                          key={p.id || i}
                          className="flex justify-between items-center bg-white/50 p-2 rounded-xl border border-slate-50"
                        >
                          <span className="text-[11px] font-bold text-slate-600">
                            {p.partName}
                          </span>
                          <span className="text-[11px] font-black text-slate-900">
                            {formatCurrency(
                              (p.quantity || 0) *
                                (p.unitPrice || p.unitCost || 0),
                            )}
                          </span>
                        </div>
                      ))}
                      {parts.length > 3 && (
                        <p className="text-[10px] text-slate-400 text-center font-bold">
                          +{parts.length - 3} más...
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-bold italic">
                      No hay insumos registrados
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="animate-fadeIn">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-500" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Sincronizando Historial
                  </p>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-24 opacity-40">
                  <p className="text-sm font-bold text-slate-400">
                    Sin registros en la línea de tiempo
                  </p>
                </div>
              ) : (
                <div className="relative pl-8">
                  <div className="absolute left-1 top-2 bottom-2 w-px bg-slate-100" />

                  {history.map((h, i) => {
                    const statusColor =
                      STATUS_COLORS[h.newStatus]?.dot || "#94a3b8";
                    return (
                      <div key={h.id || i} className="relative mb-10 last:mb-0">
                        <div
                          className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border-[3px] border-white ring-1 ring-slate-200"
                          style={{ backgroundColor: statusColor }}
                        />
                        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3 mb-4">
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase text-slate-400 bg-slate-50 ring-1 ring-slate-100">
                              {STATUS_LABELS[
                                h.previousStatus ||
                                  h.oldStatus ||
                                  h.previousState
                              ] ||
                                h.previousStatus ||
                                h.oldStatus ||
                                h.previousState ||
                                "INICIO"}
                            </span>
                            <svg
                              className="w-3 h-3 text-slate-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M13 7l5 5m0 0l-5 5m5-5H6"
                              />
                            </svg>
                            <span
                              className="px-2 py-0.5 rounded text-[9px] font-black uppercase shadow-sm"
                              style={{
                                backgroundColor:
                                  STATUS_COLORS[h.newStatus || h.newState]?.bg,
                                color:
                                  STATUS_COLORS[h.newStatus || h.newState]
                                    ?.text,
                              }}
                            >
                              {STATUS_LABELS[h.newStatus || h.newState] ||
                                h.newStatus ||
                                h.newState}
                            </span>
                          </div>
                          {(h.reason || h.observations) && (
                            <p className="text-xs text-slate-600 font-medium italic mb-2">
                              "{h.reason || h.observations}"
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400 font-bold uppercase">
                            {formatDateTime(h.changedAt || h.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "parts" && (
            <div className="space-y-8 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Control de Insumos
                </h4>
                <button
                  disabled={
                    !canExecute || maintenance.maintenanceStatus !== "IN_PROCESS"
                  }
                  onClick={() => setShowAddPart(!showAddPart)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    canExecute && maintenance.maintenanceStatus === "IN_PROCESS"
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {showAddPart ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M6 18L18 6M6 6l12 12"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Registrar
                    </>
                  )}
                </button>
              </div>

              {showAddPart && (
                <form
                  onSubmit={handleAddPart}
                  className="bg-slate-900 rounded-3xl p-6 space-y-6 shadow-xl animate-modalEntry"
                >
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                      Descripción del Insumo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Disco de freno, Filtro..."
                      value={newPart.partName}
                      onChange={(e) =>
                        setNewPart({ ...newPart, partName: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                        Cant. *
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={newPart.quantity}
                        onChange={(e) =>
                          setNewPart({
                            ...newPart,
                            quantity: parseInt(e.target.value),
                          })
                        }
                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-sm text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                        P. Unitario (S/)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={newPart.unitCost}
                        onChange={(e) =>
                          setNewPart({ ...newPart, unitCost: e.target.value })
                        }
                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-sm text-white outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={addingPart}
                    className="w-full py-3.5 bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-900/40"
                  >
                    {addingPart ? "Procesando..." : "Confirmar Registro"}
                  </button>
                </form>
              )}

              {loadingParts ? (
                <div className="flex justify-center py-24">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-slate-100 border-t-indigo-500" />
                </div>
              ) : parts.length === 0 ? (
                <div className="text-center py-24 bg-slate-50/50 border-2 border-dashed border-slate-100 rounded-[2rem]">
                  <p className="text-sm font-bold text-slate-400">
                    Sin repuestos cargados
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {parts.map((part, i) => (
                    <div
                      key={part.id || i}
                      className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:border-indigo-200 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-800">
                            {part.partName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                            {part.quantity} Unid. ×{" "}
                            {formatCurrency(part.unitPrice || part.unitCost)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-indigo-600 tracking-tight">
                            {formatCurrency(
                              (part.quantity || 0) *
                                (part.unitPrice || part.unitCost || 0),
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="bg-slate-900 rounded-3xl p-6 flex justify-between items-center mt-10 shadow-2xl shadow-slate-200">
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                        Total Materiales
                      </p>
                      <p className="text-2xl font-black text-white tracking-tighter">
                        {formatCurrency(
                          parts.reduce(
                            (sum, p) =>
                              sum +
                              (p.quantity || 0) *
                                (p.unitPrice || p.unitCost || 0),
                            0,
                          ),
                        )}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-indigo-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sheetSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
      `}</style>
    </div>
  );
}
