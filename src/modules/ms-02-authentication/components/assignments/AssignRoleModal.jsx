import { useEffect, useState, useCallback } from "react";
import Swal from "sweetalert2";
import assignmentService from "../../services/assignmentService";

export default function AssignRoleModal({
  isOpen,
  onClose,
  onSuccess,
  user,
  roles,
  assignedRoles,
}) {
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [expirationDate, setExpirationDate] = useState("");
  const [isTemporary, setIsTemporary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allowedRoles, setAllowedRoles] = useState(null);
  const [loadingAllowed, setLoadingAllowed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const loadAllowedRoles = useCallback(async () => {
    try {
      setLoadingAllowed(true);
      const data = await assignmentService.getPositionAllowedRoles(user.positionId, user.areaId);
      setAllowedRoles(data);
    } catch {
      setAllowedRoles(null);
    } finally {
      setLoadingAllowed(false);
    }
  }, [user?.positionId, user?.areaId]);

  useEffect(() => {
    if (isOpen && user?.positionId) {
      loadAllowedRoles();
    } else {
      setAllowedRoles(null);
    }
  }, [isOpen, user, loadAllowedRoles]);

  if (!isOpen) return null;

  const getPositionName = (id) => {
    if (!id) return "Sin cargo";
    try {
      const cached = sessionStorage.getItem("positions_cache");
      if (cached) {
        const { data } = JSON.parse(cached);
        const pos = data.find((p) => p.id === id);
        return pos ? pos.name : "Cargo no encontrado";
      }
    } catch {
      // Ignore cache errors
    }
    return "Cargando...";
  };

  const availableRoles = roles.filter((role) => {
    const isAlreadyAssigned = assignedRoles.some((ar) => ar.roleId === role.id);
    if (isAlreadyAssigned) return false;

    if (allowedRoles === null) return true;

    return allowedRoles.some((ar) => ar.roleId === role.id);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedRoleIds.length === 0) {
      Swal.fire({
        title: "Error",
        text: "Debes seleccionar al menos un rol",
        icon: "error",
        customClass: { confirmButton: "btn-confirm-danger" },
      });
      return;
    }

    try {
      setLoading(true);

      if (isTemporary && !expirationDate) {
        Swal.fire({
          title: "Fecha requerida",
          text: "Debes seleccionar una fecha de expiración para roles temporales",
          icon: "warning",
          customClass: { confirmButton: "btn-confirm-primary" },
        });
        return;
      }

      await Promise.all(
        selectedRoleIds.map((roleId) =>
          assignmentService.assignRoleToUser(
            user.id,
            roleId,
            isTemporary ? expirationDate : null
          )
        )
      );

      Swal.fire({
        title: "¡Éxito!",
        text: `${selectedRoleIds.length} rol(es) asignado(s) correctamente`,
        icon: "success",
        customClass: { confirmButton: "btn-confirm-success" },
        timer: 2000,
        showConfirmButton: false,
      });

      setSelectedRoleIds([]);
      setExpirationDate("");
      setIsTemporary(false);
      onSuccess();
    } catch (err) {
      Swal.fire({
        title: "Error",
        text: err.message || "No se pudieron asignar los roles",
        icon: "error",
        customClass: { confirmButton: "btn-confirm-danger" },
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredAvailableRoles = availableRoles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (role.description && role.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full border border-slate-200 flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Asignar rol</h2>
              <p className="text-sm text-slate-500 mt-0.5">Usuario: {user?.username}</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 overflow-y-auto flex-1">
            <div className="mb-5">
              <label className="block text-xs font-medium text-slate-500 mb-2">
                Seleccionar rol <span className="text-red-500">*</span>
              </label>

              {availableRoles.length === 0 ? (
                <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-md">
                  <p className="text-sm text-slate-600">No hay roles disponibles para asignar</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      placeholder="Buscar rol..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400"
                    />
                  </div>

                  {filteredAvailableRoles.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        {selectedRoleIds.length} seleccionado(s)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedRoleIds.length === filteredAvailableRoles.length) {
                            setSelectedRoleIds([]);
                          } else {
                            setSelectedRoleIds(filteredAvailableRoles.map((r) => String(r.id)));
                          }
                        }}
                        className="text-xs text-slate-600 hover:text-slate-900 underline"
                      >
                        {selectedRoleIds.length === filteredAvailableRoles.length
                          ? "Deseleccionar todos"
                          : "Seleccionar todos"}
                      </button>
                    </div>
                  )}

                  <div className="space-y-1 max-h-[280px] overflow-y-auto">
                    {loadingAllowed ? (
                      <div className="py-8 text-center">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-slate-600 mb-2" />
                        <p className="text-slate-500 text-sm">Cargando roles permitidos...</p>
                      </div>
                    ) : filteredAvailableRoles.length === 0 ? (
                      <div className="py-6 text-center">
                        <p className="text-slate-400 text-sm">No se encontraron roles</p>
                      </div>
                    ) : (
                      filteredAvailableRoles.map((role) => {
                        const isDefault = allowedRoles?.find(
                          (ar) => ar.roleId === role.id
                        )?.default;
                        const isSelected = selectedRoleIds.includes(String(role.id));

                        const toggleRole = () => {
                          setSelectedRoleIds((prev) =>
                            prev.includes(String(role.id))
                              ? prev.filter((id) => id !== String(role.id))
                              : [...prev, String(role.id)]
                          );
                        };

                        return (
                          <label
                            key={role.id}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors border ${
                              isSelected
                                ? "bg-slate-100 border-slate-300"
                                : "bg-white border-slate-100 hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={toggleRole}
                              className="h-4 w-4 text-slate-900 rounded border-slate-300 focus:ring-slate-400 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-900">
                                {role.description?.trim() || role.name}
                              </div>
                              {role.description?.trim() && (
                                <div className="text-xs text-slate-500 mt-0.5">{role.name}</div>
                              )}
                              {isDefault && (
                                <div className="text-xs text-slate-500 mt-0.5">Recomendado</div>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {!loadingAllowed && allowedRoles && availableRoles.length > 0 && (
              <div className="mb-5 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Los roles marcados como <strong>Recomendado</strong> corresponden al cargo de{" "}
                  <strong>{getPositionName(user?.positionId)}</strong>.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTemporary}
                  onChange={(e) => {
                    setIsTemporary(e.target.checked);
                    if (!e.target.checked) setExpirationDate("");
                  }}
                  className="h-4 w-4 text-slate-900 rounded border-slate-300 focus:ring-slate-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">Rol temporal</span>
                  <p className="text-xs text-slate-500">
                    El acceso se revocará en la fecha indicada
                  </p>
                </div>
              </label>
            </div>

            {isTemporary && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 mb-2">
                  Fecha de expiración <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400"
                  min={new Date().toISOString().split("T")[0]}
                  required={isTemporary}
                />
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-slate-200 flex-shrink-0 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || selectedRoleIds.length === 0}
            >
              {loading ? "Asignando..." : `Asignar (${selectedRoleIds.length})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
