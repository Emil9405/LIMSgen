// components/modals/UsageHistoryModal.js
// v3.0: History-only modal (usage moved to inline BatchUsageInput)

import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import Modal from '../Modal';
import Button from '../Button';
import Table from '../Table';
import { CloseIcon } from '../Icons';
import { styles } from './styles';

export const UsageHistoryModal = ({ isOpen, onClose, reagentId, batchId, batch }) => {
  const actualReagentId = reagentId || batch?.reagent_id;
  const actualBatchId = batchId || batch?.id;
  const batchUnit = batch?.unit || '';
  const batchNumber = batch?.batch_number || '';

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Statistics
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, lastUsed: null });

  useEffect(() => {
    if (isOpen && actualBatchId && actualReagentId) {
      loadHistory();
    }
    // eslint-disable-next-line
  }, [isOpen, actualBatchId, actualReagentId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      setError('');
      const res = await api.getUsageHistory(actualReagentId, actualBatchId);
      const data = Array.isArray(res) ? res : (res.data?.data || res.data || []);
      const historyData = Array.isArray(data) ? data : [];
      setHistory(historyData);
      
      // Calculate stats
      if (historyData.length > 0) {
        const total = historyData.reduce((sum, h) => sum + (parseFloat(h.quantity_used) || 0), 0);
        const now = new Date();
        const thisMonth = historyData
          .filter(h => {
            const d = new Date(h.used_at || h.created_at);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          })
          .reduce((sum, h) => sum + (parseFloat(h.quantity_used) || 0), 0);
        const lastUsed = historyData[0]?.used_at || historyData[0]?.created_at;
        
        setStats({ total, thisMonth, lastUsed });
      } else {
        setStats({ total: 0, thisMonth: 0, lastUsed: null });
      }
    } catch (err) {
      console.error('Failed to load usage history:', err);
      setError(err.message || 'Failed to load history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`Usage History${batchNumber ? ` — Batch ${batchNumber}` : ''}`}
    >
      {/* Stats summary */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        <div style={{
          background: '#f7fafc',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>
            Total Used
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#2d3748' }}>
            {stats.total.toFixed(1)} {batchUnit}
          </div>
        </div>
        
        <div style={{
          background: '#f7fafc',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>
            This Month
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#3182ce' }}>
            {stats.thisMonth.toFixed(1)} {batchUnit}
          </div>
        </div>
        
        <div style={{
          background: '#f7fafc',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>
            Last Used
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: '500', color: '#2d3748' }}>
            {stats.lastUsed 
              ? new Date(stats.lastUsed).toLocaleDateString('ru-RU', { 
                  day: '2-digit', month: '2-digit', year: 'numeric' 
                })
              : '—'
            }
          </div>
        </div>
      </div>

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

      {/* History Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
          Loading...
        </div>
      ) : (
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
              render: i => (
                <span style={{ fontWeight: '500' }}>
                  {i.quantity_used} {i.unit || batchUnit}
                </span>
              )
            },
            { 
              key: 'purpose', 
              label: 'Purpose', 
              render: i => i.purpose || <span style={{ color: '#a0aec0' }}>—</span> 
            },
            { 
              key: 'username', 
              label: 'User', 
              render: i => i.username || <span style={{ color: '#a0aec0' }}>—</span> 
            }
          ]}
          emptyMessage="No usage history yet"
        />
      )}

      {/* Total records count */}
      {history.length > 0 && (
        <div style={{ 
          marginTop: '0.75rem', 
          fontSize: '0.85rem', 
          color: '#718096',
          textAlign: 'right'
        }}>
          {history.length} record{history.length !== 1 ? 's' : ''}
        </div>
      )}

      <div style={styles.buttonContainer}>
        <Button variant="secondary" onClick={onClose} icon={<CloseIcon size={16} />}>
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default UsageHistoryModal;
