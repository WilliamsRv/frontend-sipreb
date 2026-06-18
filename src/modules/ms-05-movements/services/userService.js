import httpClient from '../../../shared/services/httpClient.js';
import { getEnv } from '../../../shared/utils/env.js';
const API_BASE_URL = getEnv('VITE_GATEWAY_API_URL', 'http://localhost:5005');
class UserService {
  async getUsersByMunicipality(_municipalityId) {
    try {
      const { data } = await httpClient.get(`${API_BASE_URL}/users`);
      return data;
    } catch {
      return [
        { id: '48cc4cf0-699f-4001-8b14-e3f76f9210ae', firstName: 'Usuario', lastName: 'Demo' }
      ];
    }
  }
}
export default new UserService();
