// components/Modals.js - Fixed and Complete
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import Modal from './Modal';
import Input from './Input';
import Select from './Select';
import TextArea from './TextArea';
import Button from './Button';
import FormGroup from './FormGroup';
import ErrorMessage from './ErrorMessage';
import Table from './Table';
const cleanPayload = (data) => {
  const cleaned = {};
  
  for (const [key, value] of Object.entries(data)) {
    // ÐŸÑ€Ð¾Ð¿ÑƒÑÐºÐ°ÐµÐ¼ null, undefined Ð¸ Ð¿ÑƒÑÑ‚Ñ‹Ðµ ÑÑ‚Ñ€Ð¾ÐºÐ¸
    if (value === null || value === undefined) {
      continue;
    }
    
    // Ð”Ð»Ñ ÑÑ‚Ñ€Ð¾Ðº - trim Ð¸ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐºÐ° Ð½Ð° Ð¿ÑƒÑÑ‚Ð¾Ñ‚Ñƒ
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== '') {
        cleaned[key] = trimmed;
      }
    } 
    // Ð”Ð»Ñ Ñ‡Ð¸ÑÐµÐ» - Ð²ÐºÐ»ÑŽÑ‡Ð°ÐµÐ¼ Ð´Ð°Ð¶Ðµ 0
    else if (typeof value === 'number') {
      cleaned[key] = value;
    }
    // Ð”Ð»Ñ boolean - Ð²ÐºÐ»ÑŽÑ‡Ð°ÐµÐ¼ Ð²ÑÐµ Ð·Ð½Ð°Ñ‡ÐµÐ½Ð¸Ñ
    else if (typeof value === 'boolean') {
      cleaned[key] = value;
    }
    // Ð”Ð»Ñ Ð¼Ð°ÑÑÐ¸Ð²Ð¾Ð² Ð¸ Ð¾Ð±ÑŠÐµÐºÑ‚Ð¾Ð²
    else if (Array.isArray(value) && value.length > 0) {
      cleaned[key] = value;
    }
    else if (typeof value === 'object' && Object.keys(value).length > 0) {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
};
// Consolidated styles
const styles = {
  formGrid: {
    display: 'grid',
    gap: '1rem',
    marginBottom: '1rem'
  },
  buttonContainer: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end',
    marginTop: '2rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e2e8f0'
  },
  error: {
    color: '#e53e3e',
    backgroundColor: '#fff5f5',
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.875rem',
    border: '1px solid #feb2b2'
  },
  infoContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1.5rem',
    marginBottom: '2rem',
    padding: '1.5rem',
    backgroundColor: '#f7fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0'
  },
  infoItem: {
    marginBottom: '0.75rem'
  },
  label: {
    fontWeight: '600',
    color: '#2d3748',
    marginRight: '0.5rem'
  },
  value: {
    color: '#4a5568'
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  }
};

// Common hook for form submission
const useFormSubmit = (onSubmit, validate) => {
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (validate && !validate()) return;
    try {
      await onSubmit();
    } catch (err) {
      console.error('Form submit error:', err);
    }
  }, [onSubmit, validate]);

  return handleSubmit;
};

// =============== ChangePasswordModal ===============
export const ChangePasswordModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    current_password: '',
    new_password: '',
    confirm_new_password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validate = useCallback(() => {
    if (formData.new_password !== formData.confirm_new_password) {
      setError('New passwords do not match');
      return false;
    }
    setError('');
    return true;
  }, [formData]);

  const handleSubmit = useFormSubmit(async () => {
    setLoading(true);
    try {
      const response = await api.changePassword({
        current_password: formData.current_password,
        new_password: formData.new_password
      });
      
      if (response && response.success) {
        onSave();
        onClose();
      } else {
        setError(response?.message || 'Failed to change password');
      }
    } catch (err) {
      setError(err.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  }, validate);

  const handleChange = useCallback((e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }, [formData]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Your Password">
      {error && <div style={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={styles.formGrid}>
          <FormGroup label="Current Password" required>
            <Input
              type="password"
              name="current_password"
              value={formData.current_password}
              onChange={handleChange}
              required
            />
          </FormGroup>
          <FormGroup label="New Password" required>
            <Input
              type="password"
              name="new_password"
              value={formData.new_password}
              onChange={handleChange}
              required
            />
          </FormGroup>
          <FormGroup label="Confirm New Password" required>
            <Input
              type="password"
              name="confirm_new_password"
              value={formData.confirm_new_password}
              onChange={handleChange}
              required
            />
          </FormGroup>
        </div>
        <div style={styles.buttonContainer}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? 'Changing...' : 'Change Password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// =============== Equipment Form Modal ===============
const EquipmentFormModal = ({ isOpen, onClose, title, equipment = null, onSave }) => {
  const isEdit = !!equipment;
  const [formData, setFormData] = useState({
    name: '',
    type_: 'equipment',
    quantity: 1,
    unit: '',
    status: 'available',
    location: '',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (equipment) {
      setFormData({
        name: equipment.name || '',
        type_: equipment.type_ || 'equipment',
        quantity: equipment.quantity || 1,
        unit: equipment.unit || '',
        status: equipment.status || 'available',
        location: equipment.location || '',
        description: equipment.description || ''
      });
    }
  }, [equipment]);

  const validate = useCallback(() => {
    if (!formData.name) {
      setError('Name is required');
      return false;
    }
    if (!formData.type_) {
      setError('Type is required');
      return false;
    }
    setError('');
    return true;
  }, [formData.name, formData.type_]);

  const handleSubmit = useFormSubmit(async () => {
  setLoading(true);
  try {
    const payload = cleanPayload(formData);
    
    let response;
    if (isEdit) {
      response = await api.updateEquipment(equipment.id, payload);
    } else {
      response = await api.createEquipment(payload);
    }
    
    if (response && response.success !== false) {
      onSave();
      onClose();
    } else {
      setError(response?.message || `Failed to ${isEdit ? 'update' : 'create'} equipment`);
    }
  } catch (err) {
    setError(err.message || `Failed to ${isEdit ? 'update' : 'create'} equipment`);
  } finally {
    setLoading(false);
  }
}, validate);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    if (name === 'quantity') {
      setFormData({ ...formData, [name]: parseInt(value) || 1 });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  }, [formData]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {error && <div style={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={styles.formGrid}>
          <FormGroup label="Name" required>
            <Input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </FormGroup>
          <FormGroup label="Type" required>
            <Select
              name="type_"
              value={formData.type_}
              onChange={handleChange}
              required
            >
              <option value="equipment">Equipment</option>
              <option value="labware">Labware</option>
            </Select>
          </FormGroup>
          <FormGroup label="Quantity" required>
            <Input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              min="1"
              required
            />
          </FormGroup>
          <FormGroup label="Unit">
            <Input
              name="unit"
              value={formData.unit}
              onChange={handleChange}
              placeholder="e.g., pieces, set"
            />
          </FormGroup>
          <FormGroup label="Status" required>
            <Select
              name="status"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="available">Available</option>
              <option value="in_use">In Use</option>
              <option value="maintenance">Maintenance</option>
              <option value="damaged">Damaged</option>
            </Select>
          </FormGroup>
          <FormGroup label="Location">
            <Input
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="e.g., Cabinet A1"
            />
          </FormGroup>
          <FormGroup label="Description">
            <TextArea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
            />
          </FormGroup>
        </div>
        <div style={styles.buttonContainer}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? `${isEdit ? 'Updating' : 'Creating'}...` : `${isEdit ? 'Update' : 'Create'} Equipment`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export const CreateEquipmentModal = (props) => <EquipmentFormModal {...props} title="Create New Equipment" equipment={null} />;
export const EditEquipmentModal = (props) => <EquipmentFormModal {...props} title="Edit Equipment" />;

// =============== Batch Form Modal ===============
// ÐŸÐ¾Ð»Ð½Ð¾ÑÑ‚ÑŒÑŽ Ð¸ÑÐ¿Ñ€Ð°Ð²Ð»ÐµÐ½Ð½Ð°Ñ Ð²ÐµÑ€ÑÐ¸Ñ BatchFormModal Ñ Ð¿Ñ€Ð°Ð²Ð¸Ð»ÑŒÐ½Ð¾Ð¹ Ð¾Ð±Ñ€Ð°Ð±Ð¾Ñ‚ÐºÐ¾Ð¹ Ð´Ð°Ñ‚

const BatchFormModal = ({ isOpen, onClose, title, reagentId, batch = null, onSave }) => {
  const isEdit = !!batch;
  const [formData, setFormData] = useState({
    batch_number: '',
    quantity: null,
    unit: 'g',
    supplier: '',
    manufacturer: '',
    received_date: '',
    expiry_date: '',
    location: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (batch) {
      setFormData({
        batch_number: batch.batch_number || '',
        quantity: batch.quantity != null ? parseFloat(batch.quantity) : null,
        unit: batch.unit || 'g',
        supplier: batch.supplier || '',
        manufacturer: batch.manufacturer || '',
        received_date: batch.received_date ? batch.received_date.split('T')[0] : '',
        expiry_date: batch.expiry_date ? batch.expiry_date.split('T')[0] : '',
        location: batch.location || '',
        notes: batch.notes || ''
      });
    }
  }, [batch]);

  const validate = useCallback(() => {
    if (!formData.batch_number || formData.quantity === null || isNaN(formData.quantity)) {
      setError('Batch Number and a valid Quantity are required');
      return false;
    }
    if (!formData.unit) {
      setError('Unit is required');
      return false;
    }
    setError('');
    return true;
  }, [formData.batch_number, formData.quantity, formData.unit]);

  // Ð¤ÑƒÐ½ÐºÑ†Ð¸Ñ Ð´Ð»Ñ ÐºÐ¾Ð½Ð²ÐµÑ€Ñ‚Ð°Ñ†Ð¸Ð¸ Ð´Ð°Ñ‚Ñ‹ Ð² ISO Ñ„Ð¾Ñ€Ð¼Ð°Ñ‚ Ñ Ð²Ñ€ÐµÐ¼ÐµÐ½ÐµÐ¼
  const formatDateForServer = (dateString) => {
    if (!dateString || !dateString.trim()) return null;
    
    // Ð”Ð¾Ð±Ð°Ð²Ð»ÑÐµÐ¼ Ð²Ñ€ÐµÐ¼Ñ 00:00:00 Ð¸ UTC timezone
    return `${dateString}T00:00:00Z`;
  };

  const handleSubmit = useFormSubmit(async () => {
    setLoading(true);
    
    console.log('=== Batch Submit ===');
    console.log('Raw formData:', formData);
    
    // Ð¡Ð¾Ð·Ð´Ð°ÐµÐ¼ Ð±Ð°Ð·Ð¾Ð²Ñ‹Ð¹ payload Ñ Ð¾Ð±ÑÐ·Ð°Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¼Ð¸ Ð¿Ð¾Ð»ÑÐ¼Ð¸
    const payload = {
      batch_number: formData.batch_number.trim(),
      quantity: Number(formData.quantity),
      unit: formData.unit.trim()
    };
    
    // Ð”Ð¾Ð±Ð°Ð²Ð»ÑÐµÐ¼ Ð¾Ð¿Ñ†Ð¸Ð¾Ð½Ð°Ð»ÑŒÐ½Ñ‹Ðµ Ð¿Ð¾Ð»Ñ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ ÐµÑÐ»Ð¸ Ð¾Ð½Ð¸ Ð½Ðµ Ð¿ÑƒÑÑ‚Ñ‹Ðµ
    if (formData.supplier && formData.supplier.trim()) {
      payload.supplier = formData.supplier.trim();
    }
    if (formData.manufacturer && formData.manufacturer.trim()) {
      payload.manufacturer = formData.manufacturer.trim();
    }
    
    // Ð’ÐÐ–ÐÐž: ÐšÐ¾Ð½Ð²ÐµÑ€Ñ‚Ð¸Ñ€ÑƒÐµÐ¼ Ð´Ð°Ñ‚Ñ‹ Ð² ISO 8601 Ñ„Ð¾Ñ€Ð¼Ð°Ñ‚ Ñ Ð²Ñ€ÐµÐ¼ÐµÐ½ÐµÐ¼
    const receivedDate = formatDateForServer(formData.received_date);
    if (receivedDate) {
      payload.received_date = receivedDate;
    }
    
    const expiryDate = formatDateForServer(formData.expiry_date);
    if (expiryDate) {
      payload.expiry_date = expiryDate;
    }
    
    if (formData.location && formData.location.trim()) {
      payload.location = formData.location.trim();
    }
    if (formData.notes && formData.notes.trim()) {
      payload.notes = formData.notes.trim();
    }
    
    console.log('Final payload:', payload);
    console.log('Payload JSON:', JSON.stringify(payload));
    
    try {
      let response;
      if (isEdit) {
        console.log(`Updating batch: reagentId=${reagentId}, batchId=${batch.id}`);
        response = await api.updateBatch(reagentId, batch.id, payload);
      } else {
        console.log(`Creating batch: reagentId=${reagentId}`);
        response = await api.createBatch(reagentId, payload);
      }
      
      console.log('API Response:', response);
      
      if (response && response.success !== false) {
        onSave();
        onClose();
      } else {
        const errorMsg = response?.message || `Failed to ${isEdit ? 'update' : 'create'} batch`;
        console.error('Operation failed:', errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      console.error('Batch operation error:', err);
      setError(err.message || `Failed to ${isEdit ? 'update' : 'create'} batch`);
    } finally {
      setLoading(false);
    }
  }, validate);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    if (name === 'quantity') {
      const numericValue = value === '' ? null : parseFloat(value);
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  }, []);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {error && <div style={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={styles.formGrid}>
          <FormGroup label="Batch Number" required>
            <Input
              name="batch_number"
              value={formData.batch_number}
              onChange={handleChange}
              required
              placeholder="e.g., BATCH-001"
            />
          </FormGroup>
          <FormGroup label="Quantity" required>
            <Input
              type="number"
              name="quantity"
              value={formData.quantity ?? ''}
              onChange={handleChange}
              step="0.01"
              min="0"
              required
              placeholder="e.g., 100"
            />
          </FormGroup>
          <FormGroup label="Unit" required>
            <Select
              name="unit"
              value={formData.unit}
              onChange={handleChange}
              required
            >
              <option value="g">Grams (g)</option>
              <option value="kg">Kilograms (kg)</option>
              <option value="mg">Milligrams (mg)</option>
              <option value="mL">Milliliters (mL)</option>
              <option value="L">Liters (L)</option>
              <option value="pieces">Pieces</option>
            </Select>
          </FormGroup>
          <FormGroup label="Supplier">
            <Input
              name="supplier"
              value={formData.supplier}
              onChange={handleChange}
              placeholder="e.g., Sigma-Aldrich"
            />
          </FormGroup>
          <FormGroup label="Manufacturer">
            <Input
              name="manufacturer"
              value={formData.manufacturer}
              onChange={handleChange}
              placeholder="e.g., XYZ Corp"
            />
          </FormGroup>
          <FormGroup label="Received Date">
            <Input
              type="date"
              name="received_date"
              value={formData.received_date}
              onChange={handleChange}
            />
          </FormGroup>
          <FormGroup label="Expiry Date">
            <Input
              type="date"
              name="expiry_date"
              value={formData.expiry_date}
              onChange={handleChange}
            />
          </FormGroup>
          <FormGroup label="Location">
            <Input
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="e.g., Freezer A, Shelf 2"
            />
          </FormGroup>
          <FormGroup label="Notes">
            <TextArea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Additional notes..."
            />
          </FormGroup>
        </div>
        <div style={styles.buttonContainer}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? `${isEdit ? 'Updating' : 'Creating'}...` : `${isEdit ? 'Update' : 'Create'} Batch`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export const CreateBatchModal = (props) => <BatchFormModal {...props} title="Add New Batch" batch={null} />;
export const EditBatchModal = (props) => <BatchFormModal {...props} title="Edit Batch" />;

// =============== Reagent Form Modal ===============
const ReagentFormModal = ({ isOpen, onClose, title, reagent = null, onSave }) => {
  const isEdit = !!reagent;
  const [formData, setFormData] = useState({
    name: '',
    formula: '',
    molecular_weight: '',
    cas_number: '',
    manufacturer: '',
    status: 'active',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (reagent) {
      setFormData({
        name: reagent.name || '',
        formula: reagent.formula || '',
        molecular_weight: reagent.molecular_weight || '',
        cas_number: reagent.cas_number || '',
        manufacturer: reagent.manufacturer || '',
        status: reagent.status || 'active',
        description: reagent.description || ''
      });
    }
  }, [reagent]);

  const validate = useCallback(() => {
    if (!formData.name) {
      setError('Name is required');
      return false;
    }
    setError('');
    return true;
  }, [formData.name]);

 const handleSubmit = useFormSubmit(async () => {
  setLoading(true);
  try {
    const payload = cleanPayload(formData);
    
    // Преобразуем molecular_weight в число
    if (payload.molecular_weight) {
      payload.molecular_weight = parseFloat(payload.molecular_weight);
      if (isNaN(payload.molecular_weight)) {
        delete payload.molecular_weight;
      }
    }
    
    let response;
    if (isEdit) {
      response = await api.updateReagent(reagent.id, payload);
    } else {
      response = await api.createReagent(payload);
    }
    
    if (response && response.success !== false) {
      onSave();
      onClose();
    } else {
      setError(response?.message || `Failed to ${isEdit ? 'update' : 'create'} reagent`);
    }
  } catch (err) {
    setError(err.message || `Failed to ${isEdit ? 'update' : 'create'} reagent`);
  } finally {
    setLoading(false);
  }
}, validate);

  const handleChange = useCallback((e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }, [formData]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {error && <div style={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={styles.formGrid}>
          <FormGroup label="Name" required>
            <Input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </FormGroup>
          <FormGroup label="Formula">
            <Input
              name="formula"
              value={formData.formula}
              onChange={handleChange}
            />
          </FormGroup>
          <FormGroup label="Molecular Weight (g/mol)">
            <Input
              name="molecular_weight"
              type="number"
              step="0.01"
              min="0"
              value={formData.molecular_weight}
              onChange={handleChange}
              placeholder="e.g. 58.44"
            />
          </FormGroup>
          <FormGroup label="CAS Number">
            <Input
              name="cas_number"
              value={formData.cas_number}
              onChange={handleChange}
            />
          </FormGroup>
          <FormGroup label="Manufacturer">
            <Input
              name="manufacturer"
              value={formData.manufacturer}
              onChange={handleChange}
            />
          </FormGroup>
          <FormGroup label="Status" required>
            <Select
              name="status"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="discontinued">Discontinued</option>
            </Select>
          </FormGroup>
          <FormGroup label="Description">
            <TextArea
              name="description"
              value={formData.description}
              onChange={handleChange}
            />
          </FormGroup>
        </div>
        <div style={styles.buttonContainer}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? `${isEdit ? 'Updating' : 'Creating'}...` : `${isEdit ? 'Update' : 'Create'} Reagent`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export const CreateReagentModal = ({ isOpen, onClose, onSave }) => (
  <ReagentFormModal 
    isOpen={isOpen}
    title="Create New Reagent" 
    reagent={null} 
    onClose={onClose}
    onSave={onSave}
  />
);

export const EditReagentModal = ({ isOpen, reagent, onClose, onSave }) => (
  <ReagentFormModal 
    isOpen={isOpen}
    title="Edit Reagent" 
    reagent={reagent}
    onClose={onClose}
    onSave={onSave}
  />
);
// =============== ViewReagentModal ===============
export const ViewReagentModal = ({ isOpen, onClose, reagent, onSave, loading: initialLoading }) => {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(initialLoading);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [showEditBatch, setShowEditBatch] = useState(false);
  const [showUsageHistory, setShowUsageHistory] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);

  useEffect(() => {
    if (isOpen && reagent?.id) {
      loadBatches();
    }
  }, [isOpen, reagent?.id]);

  const loadBatches = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getReagentBatches(reagent.id);
      setBatches(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load batches:', err);
    } finally {
      setLoading(false);
    }
  }, [reagent?.id]);

  const handleCreateBatchSuccess = useCallback(() => {
    setShowCreateBatch(false);
    loadBatches();
  }, [loadBatches]);

  const handleEditBatchSuccess = useCallback(() => {
    setShowEditBatch(false);
    setSelectedBatch(null);
    loadBatches();
  }, [loadBatches]);

  const handleBatchAction = useCallback(async (action, item) => {
    if (action === 'view') {
      setSelectedBatch(item);
      setShowUsageHistory(true);
    } else if (action === 'edit') {
      setSelectedBatch(item);
      setShowEditBatch(true);
    } else if (action === 'delete') {
      if (window.confirm(`Are you sure you want to delete batch "${item.batch_number}"?`)) {
        try {
          await api.deleteBatch(item.id);
          loadBatches();
        } catch (err) {
          console.error('Failed to delete batch:', err);
        }
      }
    }
  }, [reagent?.id, loadBatches]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '900px',
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid #e2e8f0'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#2d3748' }}>
            Reagent Details
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#718096',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%'
            }}
          >
            Ã—
          </button>
        </div>

        <div style={styles.infoContainer}>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.125rem', color: '#2d3748' }}>
              Reagent Information
            </h3>
            <div style={styles.infoItem}>
              <span style={styles.label}>Name:</span>
              <span style={styles.value}>{reagent.name}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.label}>Formula:</span>
              <span style={styles.value}>{reagent.formula || 'N/A'}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.label}>Molecular Weight:</span>
              <span style={styles.value}>
                {reagent.molecular_weight ? `${reagent.molecular_weight} g/mol` : 'N/A'}
              </span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.label}>CAS Number:</span>
              <span style={styles.value}>{reagent.cas_number || 'N/A'}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.label}>Manufacturer:</span>
              <span style={styles.value}>{reagent.manufacturer || 'N/A'}</span>
            </div>
          </div>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.125rem', color: '#2d3748' }}>
              Additional Information
            </h3>
            <div style={styles.infoItem}>
              <span style={styles.label}>Description:</span>
              <span style={styles.value}>{reagent.description || 'No description available'}</span>
            </div>
          </div>
        </div>

        <div>
          <div style={styles.sectionHeader}>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#2d3748' }}>
              Batches
            </h3>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={() => setShowCreateBatch(true)}
            >
              + Add Batch
            </Button>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }}>
              Loading batches...
            </p>
          ) : (
            <Table
  data={batches}
  columns={[
    { key: 'batch_number', label: 'Batch Number' },
    { 
      key: 'quantity', 
      label: 'Quantity',
      render: (item) => `${item.quantity} ${item.unit}`
    },
    { key: 'status', label: 'Status' },
    { 
      key: 'expiry_date', 
      label: 'Expiry Date',
      render: (item) => item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'N/A'
    },
    { key: 'location', label: 'Location', render: (item) => item.location || 'N/A' },
    {
      key: 'custom_actions',
      label: 'Actions',
      render: (item) => (
        <div style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => handleBatchAction('view', item)}
          >
            Record Usage
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            onClick={() => handleBatchAction('edit', item)}
          >
            Edit
          </Button>
          <Button 
            variant="danger" 
            size="sm" 
            onClick={() => handleBatchAction('delete', item)}
          >
            Delete
          </Button>
        </div>
      )
    }
  ]}
  emptyMessage="No batches found. Add batches to track inventory for this reagent."
/>
          )}
        </div>

        <div style={{ ...styles.buttonContainer, marginTop: '1.5rem' }}>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>

        {showCreateBatch && (
          <CreateBatchModal 
            isOpen={showCreateBatch}
            reagentId={reagent.id}
            onClose={() => setShowCreateBatch(false)}
            onSave={handleCreateBatchSuccess}
          />
        )}
        {showEditBatch && selectedBatch && (
          <EditBatchModal 
            isOpen={showEditBatch}
            reagentId={reagent.id}
            batch={selectedBatch}
            onClose={() => setShowEditBatch(false)}
            onSave={handleEditBatchSuccess}
          />
        )}
        {showUsageHistory && selectedBatch && (
  <UsageHistoryModal 
    isOpen={showUsageHistory}
    onClose={() => setShowUsageHistory(false)}
    reagentId={reagent.id}
    batchId={selectedBatch.id}
    onSave={loadBatches}
          />
        )}
      </div>
    </div>
  );
};

// =============== UsageHistoryModal ===============
export const UsageHistoryModal = ({ isOpen, onClose, reagentId, batchId, onSave }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddUsage, setShowAddUsage] = useState(true);
  const [usageForm, setUsageForm] = useState({
    quantity_used: '',
    purpose: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && batchId) {
      loadUsageHistory();
    }
  }, [isOpen, batchId, reagentId]);

  const loadUsageHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.getUsageHistory(reagentId, batchId);
      console.log('Usage history response:', response);
      
      // Backend Ð²Ð¾Ð·Ð²Ñ€Ð°Ñ‰Ð°ÐµÑ‚ PaginatedResponse Ð² Ñ„Ð¾Ñ€Ð¼Ð°Ñ‚Ðµ: 
      // { success: true, data: { data: [...], total, page, per_page, total_pages } }
      // api.js ÑƒÐ¶Ðµ Ð¸Ð·Ð²Ð»ÐµÐºÐ°ÐµÑ‚ data, Ð¿Ð¾ÑÑ‚Ð¾Ð¼Ñƒ response = { data: [...], total, page, ... }
      
      let historyData = [];
      
      if (Array.isArray(response)) {
        // Ð•ÑÐ»Ð¸ ÑÑ‚Ð¾ Ð¼Ð°ÑÑÐ¸Ð² Ð½Ð°Ð¿Ñ€ÑÐ¼ÑƒÑŽ
        historyData = response;
      } else if (response && Array.isArray(response.data)) {
        // Ð•ÑÐ»Ð¸ ÑÑ‚Ð¾ PaginatedResponse Ñ data Ð²Ð½ÑƒÑ‚Ñ€Ð¸
        historyData = response.data;
      } else if (response && response.success && response.data && Array.isArray(response.data.data)) {
        // Ð•ÑÐ»Ð¸ Ð²Ð»Ð¾Ð¶ÐµÐ½Ð½Ñ‹Ð¹ Ñ„Ð¾Ñ€Ð¼Ð°Ñ‚ { success: true, data: { data: [...] } }
        historyData = response.data.data;
      } else {
        console.warn('Unexpected data format:', response);
      }
      
      console.log('Parsed history data:', historyData);
      setHistory(historyData);
    } catch (err) {
      console.error('Error loading usage history:', err);
      setError(err.message || 'Failed to load usage history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [reagentId, batchId]);

  const handleAddUsage = async (e) => {
    e.preventDefault();
    
    if (!usageForm.quantity_used || parseFloat(usageForm.quantity_used) <= 0) {
      setError('Please enter a valid quantity');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await api.useReagent(reagentId, batchId, {
        quantity_used: parseFloat(usageForm.quantity_used),
        purpose: usageForm.purpose || undefined,
        notes: usageForm.notes || undefined
      });

      // Reset form
      setUsageForm({
        quantity_used: '',
        purpose: '',
        notes: ''
      });
      setShowAddUsage(true); // Ð”ÐµÑ€Ð¶Ð¸Ð¼ Ñ„Ð¾Ñ€Ð¼Ñƒ Ð¾Ñ‚ÐºÑ€Ñ‹Ñ‚Ð¾Ð¹ Ð´Ð»Ñ ÑÐ»ÐµÐ´ÑƒÑŽÑ‰ÐµÐ¹ Ð·Ð°Ð¿Ð¸ÑÐ¸

      // Reload history
      await loadUsageHistory();
      
      // ÐžÐ±Ð½Ð¾Ð²Ð¸Ñ‚ÑŒ ÑÐ¿Ð¸ÑÐ¾Ðº Ð±Ð°Ñ‚Ñ‡ÐµÐ¹ Ð² Ñ€Ð¾Ð´Ð¸Ñ‚ÐµÐ»ÑŒÑÐºÐ¾Ð¼ ÐºÐ¾Ð¼Ð¿Ð¾Ð½ÐµÐ½Ñ‚Ðµ
      if (onSave) {
        onSave();
      }
    } catch (err) {
      setError(err.message || 'Failed to record usage');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Batch Usage">
      {error && <div style={styles.error}>{error}</div>}
      
      {/* ÐšÐ½Ð¾Ð¿ÐºÐ° Ð¿ÐµÑ€ÐµÐºÐ»ÑŽÑ‡ÐµÐ½Ð¸Ñ Ñ„Ð¾Ñ€Ð¼Ñ‹ - Ñ‚ÐµÐ¿ÐµÑ€ÑŒ Ñ„Ð¾Ñ€Ð¼Ð° Ð¾Ñ‚ÐºÑ€Ñ‹Ñ‚Ð° Ð¿Ð¾ ÑƒÐ¼Ð¾Ð»Ñ‡Ð°Ð½Ð¸ÑŽ */}
      <div style={{ marginBottom: '1rem' }}>
        <Button 
          variant={showAddUsage ? 'secondary' : 'primary'}
          onClick={() => setShowAddUsage(!showAddUsage)}
          size="sm"
        >
          {showAddUsage ? 'Hide Form' : '+ Record Usage'}
        </Button>
      </div>

      {/* Ð¤Ð¾Ñ€Ð¼Ð° Ð´Ð¾Ð±Ð°Ð²Ð»ÐµÐ½Ð¸Ñ Ð¸ÑÐ¿Ð¾Ð»ÑŒÐ·Ð¾Ð²Ð°Ð½Ð¸Ñ */}
      {showAddUsage && (
        <form onSubmit={handleAddUsage} style={{ 
          marginBottom: '1.5rem', 
          padding: '1rem', 
          background: '#f7fafc', 
          borderRadius: '8px' 
        }}>
          <div style={styles.formGrid}>
            <FormGroup label="Quantity Used" required>
              <Input
                type="number"
                value={usageForm.quantity_used}
                onChange={(e) => setUsageForm({ ...usageForm, quantity_used: e.target.value })}
                step="0.01"
                min="0"
                required
                placeholder="e.g., 10.5"
              />
            </FormGroup>
            <FormGroup label="Purpose">
              <Input
                value={usageForm.purpose}
                onChange={(e) => setUsageForm({ ...usageForm, purpose: e.target.value })}
                placeholder="e.g., Experiment #123"
              />
            </FormGroup>
            <FormGroup label="Notes">
              <TextArea
                value={usageForm.notes}
                onChange={(e) => setUsageForm({ ...usageForm, notes: e.target.value })}
                rows={2}
                placeholder="Additional notes..."
              />
            </FormGroup>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <Button 
              type="submit" 
              variant="primary" 
              disabled={submitting}
            >
              {submitting ? 'Recording...' : 'Record Usage'}
            </Button>
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => setShowAddUsage(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Ð˜ÑÑ‚Ð¾Ñ€Ð¸Ñ Ð¸ÑÐ¿Ð¾Ð»ÑŒÐ·Ð¾Ð²Ð°Ð½Ð¸Ñ */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }}>
          Loading usage history...
        </p>
      ) : (
        <Table
          data={history}
          columns={[
            { 
              key: 'used_at', 
              label: 'Date',
              render: (item) => new Date(item.used_at).toLocaleString()
            },
            { 
              key: 'username', 
              label: 'User',
              render: (item) => item.username || 'Unknown User'
            },
            { 
              key: 'quantity_used', 
              label: 'Amount Used',
              render: (item) => `${item.quantity_used} ${item.unit || ''}`
            },
            { 
              key: 'purpose', 
              label: 'Purpose', 
              render: (item) => item.purpose || 'N/A' 
            },
            { 
              key: 'notes', 
              label: 'Notes', 
              render: (item) => item.notes || 'N/A' 
            }
          ]}
          emptyMessage="No usage history found for this batch. Record usage above to add the first entry."
        />
      )}
      <div style={styles.buttonContainer}>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
};
// =============== User Modals ===============

// Role configuration - backend expects lowercase: admin, researcher, viewer
const USER_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'viewer', label: 'Viewer' }
];

export const CreateUserModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'researcher'  // lowercase!
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({ username: '', email: '', password: '', role: 'researcher' });
      setError('');
    }
  }, [isOpen]);

  const validate = useCallback(() => {
    if (!formData.username || formData.username.length < 3) {
      setError('Username must be at least 3 characters');
      return false;
    }
    if (!formData.email || !formData.email.includes('@')) {
      setError('Valid email is required');
      return false;
    }
    if (!formData.password || formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }
    if (!/[A-Z]/.test(formData.password)) {
      setError('Password must contain at least one uppercase letter');
      return false;
    }
    if (!/[a-z]/.test(formData.password)) {
      setError('Password must contain at least one lowercase letter');
      return false;
    }
    if (!/[0-9]/.test(formData.password)) {
      setError('Password must contain at least one digit');
      return false;
    }
    setError('');
    return true;
  }, [formData]);

  const handleSubmit = useFormSubmit(async () => {
    setLoading(true);
    try {
      // Ensure role is lowercase for backend
      const payload = {
        ...formData,
        role: formData.role.toLowerCase()
      };
      const response = await api.createUser(payload);
      if (response && (response.success || response.user)) {
        onSave();
        onClose();
      } else {
        setError(response?.message || 'Failed to create user');
      }
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  }, validate);

  const handleChange = useCallback((e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }, [formData]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New User">
      {error && <div style={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={styles.formGrid}>
          <FormGroup label="Username" required hint="3-50 characters">
            <Input
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Enter username"
              required
            />
          </FormGroup>
          <FormGroup label="Email" required>
            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="user@example.com"
              required
            />
          </FormGroup>
          <FormGroup label="Password" required hint="Min 8 chars, uppercase, lowercase, digit">
            <Input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter secure password"
              required
            />
          </FormGroup>
          <FormGroup label="Role" required>
            <Select
              name="role"
              value={formData.role}
              onChange={handleChange}
            >
              {USER_ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </FormGroup>
        </div>
        <div style={styles.buttonContainer}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create User'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export const EditUserModal = ({ isOpen, onClose, user: initialUser, onSave }) => {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialUser) {
      setFormData({
        ...initialUser,
        // Normalize role to lowercase
        role: (initialUser.role || 'researcher').toLowerCase()
      });
      setError('');
    }
  }, [initialUser]);

  const validate = useCallback(() => {
    if (!formData.username || formData.username.length < 3) {
      setError('Username must be at least 3 characters');
      return false;
    }
    if (!formData.email || !formData.email.includes('@')) {
      setError('Valid email is required');
      return false;
    }
    setError('');
    return true;
  }, [formData]);

  const handleSubmit = useFormSubmit(async () => {
    setLoading(true);
    try {
      // Ensure role is lowercase for backend
      const payload = {
        username: formData.username,
        email: formData.email,
        role: formData.role.toLowerCase(),
        is_active: formData.is_active
      };
      const response = await api.updateUser(initialUser.id, payload);
      if (response && (response.success || response.user)) {
        onSave();
        onClose();
      } else {
        setError(response?.message || 'Failed to update user');
      }
    } catch (err) {
      setError(err.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  }, validate);

  const handleChange = useCallback((e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }, [formData]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit User">
      {error && <div style={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={styles.formGrid}>
          <FormGroup label="Username" required>
            <Input
              name="username"
              value={formData.username || ''}
              onChange={handleChange}
              required
            />
          </FormGroup>
          <FormGroup label="Email" required>
            <Input
              type="email"
              name="email"
              value={formData.email || ''}
              onChange={handleChange}
              required
            />
          </FormGroup>
          <FormGroup label="Role" required>
            <Select
              name="role"
              value={formData.role || 'researcher'}
              onChange={handleChange}
            >
              {USER_ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </FormGroup>
        </div>
        <div style={styles.buttonContainer}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? 'Updating...' : 'Update User'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// =============== ViewUserModal ===============
export const ViewUserModal = ({ isOpen, onClose, user }) => {
  if (!isOpen || !user) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const getRoleLabel = (role) => {
    const r = USER_ROLES.find(x => x.value === role?.toLowerCase());
    return r ? r.label : role;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Details">
      <div style={styles.infoContainer}>
        <div>
          <div style={styles.infoItem}>
            <span style={styles.label}>Username:</span>
            <span style={styles.value}>{user.username || 'N/A'}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.label}>Email:</span>
            <span style={styles.value}>{user.email || 'N/A'}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.label}>Role:</span>
            <span style={styles.value}>{getRoleLabel(user.role)}</span>
          </div>
        </div>
        <div>
          <div style={styles.infoItem}>
            <span style={styles.label}>Status:</span>
            <span style={styles.value}>{user.is_active !== false ? 'Active' : 'Inactive'}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.label}>Created:</span>
            <span style={styles.value}>{formatDate(user.created_at)}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.label}>Updated:</span>
            <span style={styles.value}>{formatDate(user.updated_at)}</span>
          </div>
        </div>
      </div>
      <div style={styles.buttonContainer}>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
};

// Default export with all modals
export default {
  ChangePasswordModal,
  CreateBatchModal,
  EditBatchModal,
  CreateEquipmentModal,
  CreateReagentModal,
  CreateUserModal,
  EditEquipmentModal,
  EditReagentModal,
  EditUserModal,
  UsageHistoryModal,
  ViewReagentModal,
  ViewUserModal,
};