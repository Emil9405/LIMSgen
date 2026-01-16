// components/modals/UsageHistoryModal.js

import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import Modal from '../Modal';
import Input from '../Input';
import Button from '../Button';
import FormGroup from '../FormGroup';
import Table from '../Table';
import { SaveIcon, CloseIcon } from '../Icons';
import { styles } from './styles';

export const UsageHistoryModal = ({ isOpen, onClose, reagentId, batchId, batch, onSave }) => {
  // Support both direct props and batch object
  const actualReagentId = reagentId || batch?.reagent_id;
  const actualBatchId = batchId || batch?.id;
  const batchUnit = batch?.unit || '';
  const batchNumber = batch?.batch_number || '';
  const availableQuantity = batch?.quantity || 0;

  const [history, setHistory] = useState([]);
  const [usageForm, setUsageForm] = useState({ 
    quantity_used: '', 
    purpose: '', 
    notes: '' 
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && actualBatchId && actualReagentId) {
      loadHistory();
    }
    // eslint-disable-next-line
  }, [isOpen, actualBatchId, actualReagentId]);

  const loadHistory = async () => {
    try {
      setError('');
      const res = await api.getUsageHistory(actualReagentId, actualBatchId);
      const data = Array.isArray(res) ? res : (res.data?.data || res.data || []);
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load usage history:', err);
      setError(err.message || 'Failed to load history');
      setHistory([]);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!usageForm.quantity_used) return;
    
    const quantity = parseFloat(usageForm.quantity_used);
    if (quantity > availableQuantity) {
      setError(`Cannot use more than available (${availableQuantity} ${batchUnit})`);
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      await api.useReagent(actualReagentId, actualBatchId, { 
        ...usageForm, 
        quantity_used: quantity 
      });
      
      if (onSave) onSave();
      await loadHistory();
      setUsageForm({ quantity_used: '', purpose: '', notes: '' });
    } catch (err) { 
      console.error('Failed to record usage:', err);
      setError(err.message || 'Failed to record usage');
    } finally { 
      setLoading(false); 
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Reagent Usage${batchNumber ? ` - Batch ${batchNumber}` : ''}`}>
      {/* Batch Info */}
      {batch && (
        <div style={{ 
          background: '#edf2f7', 
          padding: '0.75rem 1rem', 
          borderRadius: '8px', 
          marginBottom: '1rem',
          display: 'flex',
          gap: '2rem',
          fontSize: '0.9rem'
        }}>
          <div><strong>Available:</strong> {availableQuantity} {batchUnit}</div>
          <div><strong>Status:</strong> {batch.status}</div>
          {batch.location && <div><strong>Location:</strong> {batch.location}</div>}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{ 
          background: '#fed7d7', 
          color: '#c53030', 
          padding: '0.75rem 1rem', 
          borderRadius: '8px', 
          marginBottom: '1rem' 
        }}>
          {error}
        </div>
      )}

      {/* Usage Form */}
      <form 
        onSubmit={handleAdd} 
        style={{ 
          background: '#f7fafc', 
          padding: '1rem', 
          borderRadius: '8px', 
          marginBottom: '1rem' 
        }}
      >
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '120px 1fr 1fr auto', 
          gap: '0.75rem', 
          alignItems: 'end' 
        }}>
          <FormGroup label={`Quantity (${batchUnit})`} required>
            <Input 
              type="number" 
              step="0.01"
              min="0.01"
              max={availableQuantity}
              value={usageForm.quantity_used} 
              onChange={e => setUsageForm({ ...usageForm, quantity_used: e.target.value })} 
              required 
              placeholder={`Max: ${availableQuantity}`}
            />
          </FormGroup>
          <FormGroup label="Purpose">
            <Input 
              value={usageForm.purpose} 
              onChange={e => setUsageForm({ ...usageForm, purpose: e.target.value })} 
              placeholder="Experiment, analysis..." 
            />
          </FormGroup>
          <FormGroup label="Notes">
            <Input 
              value={usageForm.notes} 
              onChange={e => setUsageForm({ ...usageForm, notes: e.target.value })} 
            />
          </FormGroup>
          <Button type="submit" variant="primary" loading={loading} icon={<SaveIcon size={16} />}>
            Use
          </Button>
        </div>
      </form>

      {/* History Table */}
      <Table
        data={history}
        columns={[
          { 
            key: 'used_at', 
            label: 'Date', 
            render: i => new Date(i.used_at || i.created_at).toLocaleDateString('ru-RU', { 
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
            })
          },
          { 
            key: 'quantity_used', 
            label: 'Quantity',
            render: i => `${i.quantity_used} ${i.unit || batchUnit}`
          },
          { key: 'purpose', label: 'Purpose', render: i => i.purpose || '—' },
          { key: 'username', label: 'User', render: i => i.username || '—' }
        ]}
        emptyMessage="No usage history yet"
      />

      <div style={styles.buttonContainer}>
        <Button variant="secondary" onClick={onClose} icon={<CloseIcon size={16} />}>
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default UsageHistoryModal;
