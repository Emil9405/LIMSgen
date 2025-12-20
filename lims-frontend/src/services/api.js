// services/api.js - API с правильными путями для бекэнда
// ✅ ОБНОВЛЕННАЯ ВЕРСИЯ v4.0
// Добавлены: getLowStockItems, getExpiringItems, getReagentsFiltered, getReagentDetails
// Добавлены: методы для просмотра/скачивания документов, поддержка типов экспериментов
// Добавлены: Equipment Parts, Maintenance, Files API

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const API_V1_BASE = `${API_BASE_URL}/api/v1`;

const getAuthToken = () => {
  return localStorage.getItem('token');
};

const apiCall = async (url, options = {}) => {
  const token = getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response:', text);
      throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}`);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
};

const apiBlobCall = async (url, options = {}) => {
  const token = getAuthToken();
  
  const headers = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status}: ${text}`);
    }

    return await response.blob();
  } catch (error) {
    console.error('API blob call error:', error);
    throw error;
  }
};

export const api = {
  token: null,

  init: function() {
    this.token = localStorage.getItem('token');
  },

  clearToken: function() {
    this.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  // ==================== AUTH ====================

  login: async (usernameOrCredentials, password) => {
    let username, pwd;
    
    if (typeof usernameOrCredentials === 'object' && usernameOrCredentials !== null) {
      username = usernameOrCredentials.username;
      pwd = usernameOrCredentials.password;
    } else {
      username = usernameOrCredentials;
      pwd = password;
    }

    const response = await apiCall(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password: pwd }),
    });
    
    if (response.data && response.data.token) {
      localStorage.setItem('token', response.data.token);
      api.token = response.data.token;
      
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
    }
    
    return response.data.user || response.data;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    api.token = null;
  },

  getProfile: async () => {
    try {
      const response = await apiCall(`${API_V1_BASE}/auth/profile`);
      return { success: true, data: response.data || response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  changePassword: async (passwordData) => {
    const response = await apiCall(`${API_V1_BASE}/auth/change-password`, {
      method: 'POST',
      body: JSON.stringify(passwordData),
    });
    return response.data || response;
  },

  // ==================== USERS MANAGEMENT ====================

  getUsers: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await apiCall(`${API_V1_BASE}/auth/users?${queryString}`);
    return response.data || response;
  },

  createUser: async (userData) => {
    const response = await apiCall(`${API_V1_BASE}/auth/users`, {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    return response.data || response;
  },

  updateUser: async (id, userData) => {
    const response = await apiCall(`${API_V1_BASE}/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
    return response.data || response;
  },

  deleteUser: async (id) => {
    const response = await apiCall(`${API_V1_BASE}/auth/users/${id}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  resetUserPassword: async (id, newPassword) => {
    const response = await apiCall(`${API_V1_BASE}/auth/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });
    return response.data || response;
  },

  // ==================== REAGENTS ====================

  getReagents: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await apiCall(`${API_V1_BASE}/reagents?${queryString}`);
    return response.data || response;
  },

  getReagentsFiltered: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await apiCall(`${API_V1_BASE}/reagents?${queryString}`);
    if (response && response.data !== undefined) {
      if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
        return response.data;
      }
      return { data: response.data, total: response.data?.length || 0, total_pages: 1 };
    }
    if (Array.isArray(response)) {
      return { data: response, total: response.length, total_pages: 1 };
    }
    return response;
  },

  getReagent: async (id) => {
    const response = await apiCall(`${API_V1_BASE}/reagents/${id}`);
    return response.data || response;
  },

  getReagentById: async (id) => {
    const response = await apiCall(`${API_V1_BASE}/reagents/${id}`);
    return response.data || response;
  },

  getReagentDetails: async (id) => {
    try {
      const response = await apiCall(`${API_V1_BASE}/reagents/${id}/details`);
      return response.data || response;
    } catch (error) {
      console.warn('Details endpoint not available, using standard endpoint');
      const response = await apiCall(`${API_V1_BASE}/reagents/${id}`);
      return response.data || response;
    }
  },

  createReagent: async (reagentData) => {
    const response = await apiCall(`${API_V1_BASE}/reagents`, {
      method: 'POST',
      body: JSON.stringify(reagentData),
    });
    return response.data || response;
  },

  updateReagent: async (id, reagentData) => {
    const response = await apiCall(`${API_V1_BASE}/reagents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(reagentData),
    });
    return response.data || response;
  },

  deleteReagent: async (id) => {
    const response = await apiCall(`${API_V1_BASE}/reagents/${id}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  exportReagents: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const blob = await apiBlobCall(`${API_V1_BASE}/reagents/export?${queryString}`);
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reagents-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  importReagentsJSON: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = getAuthToken();
    const response = await fetch(`${API_V1_BASE}/reagents/import/json`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Import failed');
    }
    
    const result = await response.json();
    return result.data || result;
  },

  importReagentsExcel: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = getAuthToken();
    const response = await fetch(`${API_V1_BASE}/reagents/import/excel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Import failed');
    }
    
    const result = await response.json();
    return result.data || result;
  },

  importReagents: async (previewData, options = {}) => {
    const results = [];
    
    for (const item of previewData) {
      try {
        let result = { success: false, error: null };
        
        if (item.action === 'create_new') {
          const reagentData = {
            name: item.reagent.name,
            formula: item.reagent.formula || '',
            cas_number: item.reagent.cas_number || '',
            manufacturer: item.reagent.manufacturer || item.batch.manufacturer || '',
            description: item.reagent.description || '',
          };
          
          const createdReagent = await api.createReagent(reagentData);
          const reagentId = createdReagent.id || createdReagent;
          
          const batchData = {
            batch_number: item.batch.batch_number,
            quantity: parseFloat(item.batch.quantity) || 0,
            original_quantity: parseFloat(item.batch.quantity) || 0,
            unit: item.batch.unit || 'g',
            expiry_date: item.batch.expiry_date || null,
            supplier: item.batch.supplier || '',
            manufacturer: item.batch.manufacturer || '',
            location: item.batch.location || '',
            cat_number: item.batch.cat_number || '',
            notes: item.batch.notes || '',
            status: 'available',
          };
          
          await api.createBatch(reagentId, batchData);
          result = { success: true, reagentId, action: 'create_new' };
          
        } else if (item.action === 'add_batch') {
          const reagentId = item.existingReagent?.id || item.reagent.id;
          
          const batchData = {
            batch_number: item.batch.batch_number,
            quantity: parseFloat(item.batch.quantity) || 0,
            original_quantity: parseFloat(item.batch.quantity) || 0,
            unit: item.batch.unit || 'g',
            expiry_date: item.batch.expiry_date || null,
            supplier: item.batch.supplier || '',
            manufacturer: item.batch.manufacturer || '',
            location: item.batch.location || '',
            cat_number: item.batch.cat_number || '',
            notes: item.batch.notes || '',
            status: 'available',
          };
          
          await api.createBatch(reagentId, batchData);
          result = { success: true, reagentId, action: 'add_batch' };
          
        } else if (item.action === 'update_quantity') {
          const reagentId = item.existingReagent?.id || item.reagent.id;
          const batchId = item.existingBatch?.id;
          
          if (batchId) {
            const newQuantity = parseFloat(item.newQuantity) || (item.existingBatch.quantity + parseFloat(item.batch.quantity));
            
            await api.updateBatch(reagentId, batchId, {
              quantity: newQuantity,
            });
            result = { success: true, reagentId, batchId, action: 'update_quantity', newQuantity };
          } else {
            result = { success: false, error: 'Batch ID not found for update' };
          }
          
        } else if (item.action === 'skip') {
          result = { success: true, action: 'skip', skipped: true };
        } else {
          result = { success: false, error: `Unknown action: ${item.action}` };
        }
        
        results.push(result);
        
      } catch (error) {
        console.error('[Import] Error processing item:', item, error);
        results.push({ success: false, error: error.message });
      }
    }
    
    return results;
  },

  // ==================== BATCHES ====================

  getBatches: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await apiCall(`${API_V1_BASE}/batches?${queryString}`);
    return response.data || response;
  },

  getAllBatches: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await apiCall(`${API_V1_BASE}/batches?${queryString}`);
    return response.data || response;
  },

  getBatch: async (reagentId, batchId) => {
    const response = await apiCall(`${API_V1_BASE}/reagents/${reagentId}/batches/${batchId}`);
    return response.data || response;
  },

  getReagentBatches: async (reagentId, params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await apiCall(`${API_V1_BASE}/reagents/${reagentId}/batches?${queryString}`);
    return response.data || response;
  },

  createBatch: async (reagentId, batchData) => {
    const response = await apiCall(`${API_V1_BASE}/reagents/${reagentId}/batches`, {
      method: 'POST',
      body: JSON.stringify(batchData),
    });
    return response.data || response;
  },

  updateBatch: async (reagentId, batchId, batchData) => {
    const response = await apiCall(`${API_V1_BASE}/reagents/${reagentId}/batches/${batchId}`, {
      method: 'PUT',
      body: JSON.stringify(batchData),
    });
    return response.data || response;
  },

  deleteBatch: async (reagentId, batchId) => {
    console.log(`Deleting batch: reagentId=${reagentId}, batchId=${batchId}`);
    const response = await apiCall(`${API_V1_BASE}/reagents/${reagentId}/batches/${batchId}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  useBatch: async (reagentId, batchId, usageData) => {
    const response = await apiCall(`${API_V1_BASE}/reagents/${reagentId}/batches/${batchId}/use`, {
      method: 'POST',
      body: JSON.stringify(usageData),
    });
    return response.data || response;
  },

  useReagent: async (reagentId, batchId, usageData) => {
    const response = await apiCall(`${API_V1_BASE}/reagents/${reagentId}/batches/${batchId}/use`, {
      method: 'POST',
      body: JSON.stringify(usageData),
    });
    return response.data || response;
  },

  getUsageHistory: async (reagentId, batchId, params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString 
      ? `${API_V1_BASE}/reagents/${reagentId}/batches/${batchId}/usage?${queryString}`
      : `${API_V1_BASE}/reagents/${reagentId}/batches/${batchId}/usage`;
    const response = await apiCall(url);
    return response.data || response;
  },

  getLowStockItems: async (threshold = 10) => {
    try {
      const response = await apiCall(`${API_V1_BASE}/batches/low-stock?threshold=${threshold}`);
      return response.data || response || [];
    } catch (error) {
      console.warn('getLowStockItems fallback:', error);
      const allBatches = await api.getAllBatches({ per_page: 1000 });
      const batches = Array.isArray(allBatches) ? allBatches : (allBatches.data || []);
      return batches.filter(b => b.status === 'available' && b.quantity <= threshold);
    }
  },

  getExpiringItems: async (days = 30) => {
    try {
      const response = await apiCall(`${API_V1_BASE}/batches/expiring?days=${days}`);
      return response.data || response || [];
    } catch (error) {
      console.warn('getExpiringItems fallback:', error);
      const allBatches = await api.getAllBatches({ per_page: 1000 });
      const batches = Array.isArray(allBatches) ? allBatches : (allBatches.data || []);
      const now = new Date();
      const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      return batches.filter(b => {
        if (!b.expiry_date || b.status === 'expired' || b.status === 'depleted') return false;
        const expiry = new Date(b.expiry_date);
        return expiry <= futureDate && expiry >= now;
      }).map(b => ({
        ...b,
        days_until_expiry: Math.ceil((new Date(b.expiry_date) - now) / (1000 * 60 * 60 * 24))
      }));
    }
  },

  // ==================== EQUIPMENT ====================

  getEquipment: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await apiCall(`${API_V1_BASE}/equipment?${queryString}`);
    return response.data || response;
  },

  getEquipmentItem: async (id) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${id}`);
    return response.data || response;
  },

  createEquipment: async (equipmentData) => {
    const response = await apiCall(`${API_V1_BASE}/equipment`, {
      method: 'POST',
      body: JSON.stringify(equipmentData),
    });
    return response.data || response;
  },

  updateEquipment: async (id, equipmentData) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${id}`, {
      method: 'PUT',
      body: JSON.stringify(equipmentData),
    });
    return response.data || response;
  },

  deleteEquipment: async (id) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${id}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  exportEquipment: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const blob = await apiBlobCall(`${API_V1_BASE}/equipment/export?${queryString}`);
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `equipment-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  importEquipmentJSON: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = getAuthToken();
    const response = await fetch(`${API_V1_BASE}/equipment/import/json`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Import failed');
    }
    
    const result = await response.json();
    return result.data || result;
  },

  importEquipmentExcel: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = getAuthToken();
    const response = await fetch(`${API_V1_BASE}/equipment/import/excel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Import failed');
    }
    
    const result = await response.json();
    return result.data || result;
  },

  // ==================== EQUIPMENT PARTS ====================

  getEquipmentParts: async (equipmentId) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/parts`);
    return response.data || response;
  },

  getEquipmentPart: async (equipmentId, partId) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/parts/${partId}`);
    return response.data || response;
  },

  createEquipmentPart: async (equipmentId, partData) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/parts`, {
      method: 'POST',
      body: JSON.stringify(partData),
    });
    return response.data || response;
  },

  updateEquipmentPart: async (equipmentId, partId, partData) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/parts/${partId}`, {
      method: 'PUT',
      body: JSON.stringify(partData),
    });
    return response.data || response;
  },

  deleteEquipmentPart: async (equipmentId, partId) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/parts/${partId}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  // ==================== EQUIPMENT MAINTENANCE ====================

  getEquipmentMaintenance: async (equipmentId) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/maintenance`);
    return response.data || response;
  },

  createMaintenance: async (equipmentId, maintenanceData) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/maintenance`, {
      method: 'POST',
      body: JSON.stringify(maintenanceData),
    });
    return response.data || response;
  },

  updateMaintenance: async (equipmentId, maintenanceId, maintenanceData) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/maintenance/${maintenanceId}`, {
      method: 'PUT',
      body: JSON.stringify(maintenanceData),
    });
    return response.data || response;
  },

  completeMaintenance: async (equipmentId, maintenanceId, completionData) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/maintenance/${maintenanceId}/complete`, {
      method: 'POST',
      body: JSON.stringify(completionData),
    });
    return response.data || response;
  },

  deleteMaintenance: async (equipmentId, maintenanceId) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/maintenance/${maintenanceId}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  getUpcomingMaintenance: async (days = 30, limit = 10) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/maintenance/upcoming?days=${days}&limit=${limit}`);
    return response.data || response;
  },

  getOverdueMaintenance: async () => {
    const response = await apiCall(`${API_V1_BASE}/equipment/maintenance/overdue`);
    return response.data || response;
  },

  // ==================== EQUIPMENT FILES ====================

  getEquipmentFiles: async (equipmentId) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/files`);
    return response.data || response;
  },

  uploadEquipmentFile: async (equipmentId, file, options = {}) => {
    const { file_type = 'other', description = '', part_id = null } = options;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', file_type);
    if (description) formData.append('description', description);
    if (part_id) formData.append('part_id', part_id);
    
    const token = getAuthToken();
    const response = await fetch(`${API_V1_BASE}/equipment/${equipmentId}/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Upload failed');
    }
    
    const result = await response.json();
    return result.data || result;
  },

  getPartFiles: async (equipmentId, partId) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/parts/${partId}/files`);
    return response.data || response;
  },

  deleteEquipmentFile: async (equipmentId, fileId) => {
    const response = await apiCall(`${API_V1_BASE}/equipment/${equipmentId}/files/${fileId}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  downloadEquipmentFile: async (equipmentId, fileId, filename) => {
    const blob = await apiBlobCall(`${API_V1_BASE}/equipment/${equipmentId}/files/${fileId}/download`);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  // ==================== EXPERIMENTS ====================

  getExperiments: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await apiCall(`${API_V1_BASE}/experiments?${queryString}`);
    return response.data || response;
  },

  getExperimentDetails: async (id) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${id}`);
    return response.data || response;
  },

  createExperiment: async (experimentData) => {
    const response = await apiCall(`${API_V1_BASE}/experiments`, {
      method: 'POST',
      body: JSON.stringify(experimentData),
    });
    return response.data || response;
  },

  updateExperiment: async (id, experimentData) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(experimentData),
    });
    return response.data || response;
  },

  deleteExperiment: async (id) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${id}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  getExperimentsByDateRange: async (startDate, endDate, params = {}) => {
    const queryParams = new URLSearchParams({
      ...params,
      date_from: startDate,
      date_to: endDate,
    }).toString();
    const response = await apiCall(`${API_V1_BASE}/experiments?${queryParams}`);
    return response.data || response;
  },

  getExperimentsStats: async () => {
    const response = await apiCall(`${API_V1_BASE}/experiments/stats`);
    return response.data || response;
  },

  addExperimentReagent: async (experimentId, reagentData) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${experimentId}/reagents`, {
      method: 'POST',
      body: JSON.stringify(reagentData),
    });
    return response.data || response;
  },

  removeExperimentReagent: async (experimentId, reagentId) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${experimentId}/reagents/${reagentId}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  consumeExperimentReagent: async (experimentId, reagentId) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${experimentId}/reagents/${reagentId}/consume`, {
      method: 'POST',
    });
    return response.data || response;
  },

  startExperiment: async (experimentId) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${experimentId}/start`, {
      method: 'POST',
    });
    return response.data || response;
  },

  completeExperiment: async (experimentId) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${experimentId}/complete`, {
      method: 'POST',
    });
    return response.data || response;
  },

  cancelExperiment: async (experimentId) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${experimentId}/cancel`, {
      method: 'POST',
    });
    return response.data || response;
  },

  autoUpdateExperimentStatuses: async () => {
    const response = await apiCall(`${API_V1_BASE}/experiments/auto-update-statuses`, {
      method: 'POST',
    });
    return response.data || response;
  },

  diagnoseExperimentDates: async () => {
    const response = await apiCall(`${API_V1_BASE}/experiments/diagnose-dates`);
    return response.data || response;
  },

  addExperimentEquipment: async (experimentId, equipmentData) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${experimentId}/equipment`, {
      method: 'POST',
      body: JSON.stringify(equipmentData),
    });
    return response.data || response;
  },

  removeExperimentEquipment: async (experimentId, equipmentId) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${experimentId}/equipment/${equipmentId}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  uploadExperimentDocument: async (experimentId, file) => {
    const formData = new FormData();
    formData.append('document', file);
    
    const token = getAuthToken();
    const response = await fetch(`${API_V1_BASE}/experiments/${experimentId}/documents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Upload failed');
    }

    const result = await response.json();
    return result.data || result;
  },

  uploadExperimentDocuments: async (experimentId, files) => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('documents', files[i]);
    }
    
    const token = getAuthToken();
    const response = await fetch(`${API_V1_BASE}/experiments/${experimentId}/documents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Upload failed');
    }

    const result = await response.json();
    return result.data || result;
  },

  getExperimentDocumentUrl: async (experimentId, documentId) => {
    const token = getAuthToken();
    return `${API_V1_BASE}/experiments/${experimentId}/documents/${documentId}/view?token=${encodeURIComponent(token)}`;
  },

  downloadExperimentDocument: async (experimentId, documentId) => {
    const blob = await apiBlobCall(
      `${API_V1_BASE}/experiments/${experimentId}/documents/${documentId}/download`
    );
    return blob;
  },

  downloadAndSaveExperimentDocument: async (experimentId, documentId, filename) => {
    const blob = await apiBlobCall(
      `${API_V1_BASE}/experiments/${experimentId}/documents/${documentId}/download`
    );
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  deleteExperimentDocument: async (experimentId, documentId) => {
    const response = await apiCall(`${API_V1_BASE}/experiments/${experimentId}/documents/${documentId}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },

  // ==================== STATISTICS & REPORTS ====================

  getDashboardStats: async () => {
    const response = await apiCall(`${API_V1_BASE}/dashboard/stats`);
    return response.data || response;
  },

  getActivityLog: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await apiCall(`${API_V1_BASE}/activity?${queryString}`);
    return response.data || response;
  },

  getReports: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await apiCall(`${API_V1_BASE}/reports?${queryString}`);
    return response.data || response;
  },

  generateReport: async (reportTypeOrConfig, params = {}) => {
    let requestBody;
    
    if (typeof reportTypeOrConfig === 'object' && reportTypeOrConfig !== null) {
      requestBody = reportTypeOrConfig;
    } else if (typeof reportTypeOrConfig === 'string') {
      const presetMap = {
        'low-stock': 'low_stock',
        'lowstock': 'low_stock',
        'expiring': 'expiring_soon',
        'expiring-soon': 'expiring_soon',
        'all-batches': 'all_batches',
        'allbatches': 'all_batches',
        'expired': 'expired',
      };
      requestBody = {
        preset: presetMap[reportTypeOrConfig] || reportTypeOrConfig,
        preset_params: params,
        ...params
      };
    } else {
      requestBody = params;
    }
    
    try {
      const response = await apiCall(`${API_V1_BASE}/reports/generate`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      return response.data || response;
    } catch (error) {
      console.warn('generateReport API failed, trying fallback:', error.message);
      return api.generateReportFallback(requestBody);
    }
  },

  getReportPresets: async () => {
    try {
      const response = await apiCall(`${API_V1_BASE}/reports/presets`);
      return response.data || response || [];
    } catch (error) {
      console.warn('getReportPresets error:', error);
      return [
        { id: 'all_batches', name: 'All Batches', description: 'Complete list of all batches' },
        { id: 'low_stock', name: 'Low Stock Items', description: 'Batches below threshold', default_params: { threshold: 10 } },
        { id: 'expiring_soon', name: 'Expiring Soon', description: 'Batches expiring soon', default_params: { days: 30 } },
        { id: 'expired', name: 'Expired Items', description: 'Expired batches' },
      ];
    }
  },

  getReportFields: async () => {
    try {
      const response = await apiCall(`${API_V1_BASE}/reports/fields`);
      return response.data || response || [];
    } catch (error) {
      console.warn('getReportFields error:', error);
      return [
        { field: 'status', label: 'Status', data_type: 'enum', operators: ['eq', 'ne', 'in'], values: ['available', 'reserved', 'expired', 'depleted'] },
        { field: 'quantity', label: 'Quantity', data_type: 'number', operators: ['eq', 'gt', 'gte', 'lt', 'lte'] },
        { field: 'expiry_date', label: 'Expiry Date', data_type: 'date', operators: ['eq', 'gt', 'lt', 'is_null'] },
        { field: 'location', label: 'Location', data_type: 'text', operators: ['eq', 'like', 'is_null'] },
        { field: 'supplier', label: 'Supplier', data_type: 'text', operators: ['eq', 'like'] },
      ];
    }
  },

  getReportColumns: async () => {
    try {
      const response = await apiCall(`${API_V1_BASE}/reports/columns`);
      return response.data || response || [];
    } catch (error) {
      console.warn('getReportColumns error:', error);
      return [
        { field: 'reagent_name', label: 'Reagent', data_type: 'text', visible: true, sortable: true },
        { field: 'batch_number', label: 'Batch Number', data_type: 'text', visible: true, sortable: true },
        { field: 'quantity', label: 'Quantity', data_type: 'quantity', visible: true, sortable: true },
        { field: 'unit', label: 'Unit', data_type: 'text', visible: false, sortable: false },
        { field: 'expiry_date', label: 'Expiry Date', data_type: 'date', visible: true, sortable: true },
        { field: 'days_until_expiry', label: 'Days Left', data_type: 'number', visible: false, sortable: true },
        { field: 'status', label: 'Status', data_type: 'status', visible: true, sortable: true },
        { field: 'location', label: 'Location', data_type: 'text', visible: true, sortable: true },
        { field: 'supplier', label: 'Supplier', data_type: 'text', visible: false, sortable: true },
        { field: 'received_date', label: 'Received', data_type: 'date', visible: false, sortable: true },
        { field: 'original_quantity', label: 'Original Qty', data_type: 'quantity', visible: false, sortable: true },
      ];
    }
  },

  getReportFieldValues: async (field) => {
    try {
      const response = await apiCall(`${API_V1_BASE}/reports/field-values/${field}`);
      return response.data || response || [];
    } catch (error) {
      console.warn(`getReportFieldValues(${field}) error:`, error);
      return [];
    }
  },

  generateReportFallback: async (params = {}) => {
    const { preset, preset_params = {}, page = 1, per_page = 50, sort_by, sort_order } = params;
    
    let data = [];

    try {
      if (preset === 'low_stock') {
        const threshold = preset_params.threshold || 10;
        data = await api.getLowStockItems(threshold);
      } else if (preset === 'expiring_soon') {
        const days = preset_params.days || 30;
        data = await api.getExpiringItems(days);
      } else {
        const response = await api.getAllBatches({ page, per_page });
        data = Array.isArray(response) ? response : response.data || [];
      }

      if (sort_by && data.length > 0) {
        data.sort((a, b) => {
          const aVal = a[sort_by] || '';
          const bVal = b[sort_by] || '';
          const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return sort_order === 'ASC' ? cmp : -cmp;
        });
      }

      const startIdx = (page - 1) * per_page;
      const paginatedData = data.slice(startIdx, startIdx + per_page);

      return {
        data: paginatedData,
        metadata: {
          name: preset === 'low_stock' ? 'Low Stock Items' : 
                preset === 'expiring_soon' ? 'Expiring Soon' : 'All Batches',
          preset: preset || 'all_batches',
          total_items: data.length,
          generated_at: new Date().toISOString(),
          columns: [],
        },
        pagination: {
          page,
          per_page,
          total: data.length,
          total_pages: Math.ceil(data.length / per_page),
        },
      };
    } catch (err) {
      console.error('generateReportFallback error:', err);
      throw err;
    }
  },

  exportReportCSV: async (params = {}) => {
    try {
      const response = await apiBlobCall(`${API_V1_BASE}/reports/export/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      
      const url = window.URL.createObjectURL(response);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${params.preset || 'custom'}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      return true;
    } catch (error) {
      console.warn('exportReportCSV API error:', error);
      throw error;
    }
  },

  getFieldValues: async (field) => {
    try {
      const response = await apiCall(`${API_V1_BASE}/reports/field-values/${field}`);
      return response.data || response || [];
    } catch (error) {
      console.warn('getFieldValues error:', error);
      return [];
    }
  },

  // ==================== ROOMS ====================

  getRooms: async () => {
    const response = await apiCall(`${API_V1_BASE}/rooms`);
    return response.data || response;
  },

  getRoom: async (id) => {
    const response = await apiCall(`${API_V1_BASE}/rooms/${id}`);
    return response.data || response;
  },

  getAvailableRooms: async () => {
    const response = await apiCall(`${API_V1_BASE}/rooms/available`);
    return response.data || response;
  },

  createRoom: async (data) => {
    const response = await apiCall(`${API_V1_BASE}/rooms`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data || response;
  },

  updateRoom: async (id, data) => {
    const response = await apiCall(`${API_V1_BASE}/rooms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.data || response;
  },

  deleteRoom: async (id) => {
    const response = await apiCall(`${API_V1_BASE}/rooms/${id}`, {
      method: 'DELETE',
    });
    return response.data || response;
  },
};

export default api;