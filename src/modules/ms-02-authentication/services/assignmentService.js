import httpClient from '../../../shared/services/httpClient.js';
import { getEnv } from '../../../shared/utils/env.js';

const API_BASE_URL = getEnv('VITE_GATEWAY_API_URL', '');

class AssignmentService {

  async getUserRoles(userId) {
    try {
      const { data } = await httpClient.get(`${API_BASE_URL}/assignments/users/${userId}/roles`);
      const rows = Array.isArray(data) ? data : (data.content && Array.isArray(data.content) ? data.content : []);
      return rows.map((r) => ({
        userId: r.userId || r.id,
        username: r.username,
        roleId: r.roleId,
        roleName: r.roleName,
        roleDescription: r.roleDescription || "",
        expirationDate: r.expirationDate ?? null,
        active: r.active ?? true,
        assignedAt: r.assignedAt ?? null,
      }));
    } catch (error) {
      const msg = error.message || "Error al obtener roles del usuario";
      throw new Error(
        error.status === 500
          ? `${msg} (error del servidor — contacte al administrador)`
          : msg
      );
    }
  }

  async assignRoleToUser(userId, roleId, expirationDate = null) {
    try {
      const { data } = await httpClient.post(
        `${API_BASE_URL}/assignments/users/${userId}/roles/${roleId}`,
        { expirationDate: expirationDate || null, active: true }
      );
      return data || { success: true };
    } catch (error) {
      const msg = error.message || "Error al asignar rol al usuario";
      throw new Error(msg);
    }
  }

  async restoreRoleToUser(userId, roleId) {
    try {
      const { data } = await httpClient.patch(
        `${API_BASE_URL}/assignments/users/${userId}/roles/${roleId}/restore`
      );
      return data || { success: true };
    } catch (error) {
      const msg = error.message || "Error al restaurar rol al usuario";
      throw new Error(msg);
    }
  }

  async removeRoleFromUser(userId, roleId) {
    try {
      const response = await httpClient.delete(
        `${API_BASE_URL}/assignments/users/${userId}/roles/${roleId}`
      );
      return response.data;
    } catch (error) {
      const msg = error.message || "Error al quitar rol del usuario";
      throw new Error(msg);
    }
  }

  async getRolePermissions(roleId) {
    try {
      const { data } = await httpClient.get(
        `${API_BASE_URL}/assignments/roles/${roleId}/permissions`
      );
      const rows = Array.isArray(data) ? data : [];
      return rows.map((r) => ({
        roleId: r.roleId,
        roleName: r.roleName,
        permissionId: r.permissionId || r.id || r.permission?.id,
        permissionName: r.permissionName || r.name || r.permission?.name || r.permission?.displayName,
        permissionModule: r.permissionModule || r.module || r.permission?.module,
        permissionAction: r.permissionAction || r.action || r.permission?.action,
        permissionResource: r.permissionResource || r.resource || r.permission?.resource,
        permissionDescription: r.permissionDescription || r.description || r.permission?.description,
      }));
    } catch (error) {
      const msg = error.message || "Error al obtener permisos del rol";
      throw new Error(
        error.status === 500
          ? `${msg} (error del servidor — contacte al administrador)`
          : msg
      );
    }
  }

  async assignPermissionToRole(roleId, permissionId) {
    try {
      const response = await httpClient.post(
        `${API_BASE_URL}/assignments/roles/${roleId}/permissions/${permissionId}`
      );
      return response.data;
    } catch (error) {
      const msg = error.message || "Error al asignar permiso al rol";
      throw new Error(msg);
    }
  }

  async removePermissionFromRole(roleId, permissionId) {
    try {
      const response = await httpClient.delete(
        `${API_BASE_URL}/assignments/roles/${roleId}/permissions/${permissionId}`
      );
      return response.data;
    } catch (error) {
      const msg = error.message || "Error al quitar permiso del rol";
      throw new Error(msg);
    }
  }

  async restorePermissionToRole(roleId, permissionId) {
    try {
      const response = await httpClient.patch(
        `${API_BASE_URL}/assignments/roles/${roleId}/permissions/${permissionId}/restore`
      );
      return response.data;
    } catch (error) {
      const msg = error.message || "Error al restaurar permiso al rol";
      throw new Error(msg);
    }
  }

  async getUserEffectivePermissions(userId) {
    try {
      const { data } = await httpClient.get(
        `${API_BASE_URL}/assignments/users/${userId}/effective-permissions`
      );
      return data;
    } catch (error) {
      const msg = error.message || "Error al obtener permisos efectivos del usuario";
      throw new Error(msg);
    }
  }

  async getPositionAllowedRoles(positionId, areaId = null) {
    if (!positionId) return null;
    try {
      const params = areaId ? { areaId } : {};
      const { data } = await httpClient.get(
        `${API_BASE_URL}/assignments/positions/${positionId}/allowed-roles`,
        { params }
      );
      return data;
    } catch {
      return null;
    }
  }

  async postPositionAllowedRole(positionId, roleId, areaId = null, isDefault = false) {
    try {
      const { data } = await httpClient.post(
        `${API_BASE_URL}/assignments/positions/${positionId}/allowed-roles/${roleId}`,
        { areaId: areaId || null, isDefault }
      );
      return data;
    } catch (error) {
      const msg = error.message || "Error al asignar rol permitido al cargo";
      throw new Error(msg);
    }
  }

  async removePositionAllowedRole(positionId, roleId) {
    try {
      const response = await httpClient.delete(
        `${API_BASE_URL}/assignments/positions/${positionId}/allowed-roles/${roleId}`
      );
      return response.data;
    } catch (error) {
      const msg = error.message || "Error al quitar rol permitido del cargo";
      throw new Error(msg);
    }
  }
}

const assignmentService = new AssignmentService();
export default assignmentService;
