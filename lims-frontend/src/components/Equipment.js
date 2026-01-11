// components/Equipment.js
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import ErrorMessage from './ErrorMessage';
import Loading from './Loading';
import Badge from './Badge';
import Button from './Button';

// Import modular modals
import { CreateEquipmentModal, EditEquipmentModal } from './Modals';

// ==================== LOCAL STYLED COMPONENTS ====================

const FormGroup = ({ label, required, children, style }) => (
    <div style={{ marginBottom: '1rem', ...style }}>
      {label && (
          <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem', color: '#374151', fontSize: '0.875rem' }}>
            {label}{required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
          </label>
      )}
      {children}
    </div>
);

const inputStyle = {
  width: '100%', padding: '0.625rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px',
  fontSize: '0.875rem', color: '#1f2937', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box'
};

const FormInput = ({ label, required, type = 'text', ...props }) => (
    <FormGroup label={label} required={required}>
      <input type={type} style={inputStyle} {...props} />
    </FormGroup>
);

const FormSelect = ({ label, required, children, ...props }) => (
    <FormGroup label={label} required={required}>
      <select style={{ ...inputStyle, cursor: 'pointer' }} {...props}>{children}</select>
    </FormGroup>
);

// ==================== CONSTANTS ====================

const PART_STATUSES = {
  good: { label: 'Good', color: 'success' },
  needs_attention: { label: 'Needs Attention', color: 'warning' },
  needs_replacement: { label: 'Needs Replacement', color: 'danger' },
  replaced: { label: 'Replaced', color: 'info' },
  missing: { label: 'Missing', color: 'secondary' }
};

const EQUIPMENT_STATUSES = {
  available: { label: 'Available', color: 'success' },
  in_use: { label: 'In Use', color: 'info' },
  maintenance: { label: 'Maintenance', color: 'warning' },
  damaged: { label: 'Damaged', color: 'danger' },
  calibration: { label: 'Calibration', color: 'secondary' },
  retired: { label: 'Retired', color: 'secondary' }
};

const EQUIPMENT_TYPES = ['instrument', 'glassware', 'safety', 'storage', 'consumable', 'other'];

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const getFileUrl = (equipmentId, fileId) => `${API_BASE_URL}/api/v1/public/equipment/${equipmentId}/files/${fileId}`;

// ==================== HELPER COMPONENTS ====================

const HoverImage = ({ src, alt, size = 40, zoomSize = 200 }) => {
  const [error, setError] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e) => {
    if (!src || error) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.right + 10, y: rect.top });
    setShowZoom(true);
  };

  if (error || !src) {
    return (
        <div style={{ width: size, height: size, borderRadius: '6px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#718096', flexShrink: 0 }}>
          <i className="fas fa-image" style={{ fontSize: size * 0.4 }}></i>
        </div>
    );
  }

  return (
      <>
        <img
            src={src}
            alt={alt}
            style={{ width: size, height: size, objectFit: 'cover', borderRadius: '6px', flexShrink: 0, cursor: 'pointer' }}
            onError={() => setError(true)}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setShowZoom(false)}
        />
        {showZoom && (
            <div style={{ position: 'fixed', left: Math.min(position.x, window.innerWidth - zoomSize - 20), top: Math.max(10, Math.min(position.y, window.innerHeight - zoomSize - 20)), zIndex: 9999, pointerEvents: 'none' }}>
              <img src={src} alt={alt} style={{ width: zoomSize, height: zoomSize, objectFit: 'cover', borderRadius: '12px', border: '3px solid white', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }} />
            </div>
        )}
      </>
  );
};

// ==================== MAIN EQUIPMENT COMPONENT ====================

const Equipment = ({ user }) => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, per_page: 20, total: 0, total_pages: 1 });
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Auxiliary data
  const [allParts, setAllParts] = useState({});
  const [allFiles, setAllFiles] = useState({});

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [error, setError] = useState('');
  const [expandedRows, setExpandedRows] = useState({});

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load equipment - FIXED VERSION
  const loadEquipment = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params = {
        page: pagination.page,
        per_page: pagination.per_page,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        type_: typeFilter || undefined,
        sort_by: sortConfig.key,
        sort_order: sortConfig.direction
      };

      // Clean undefined params
      Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

      const response = await api.getEquipment(params);

      // Universal response parsing
      let items = [];
      let meta = { total: 0, page: 1, total_pages: 1 };

      if (Array.isArray(response)) {
        // Backend returned plain array
        items = response;
        meta.total = response.length;
      } else if (response && typeof response === 'object') {
        // Backend returned object with data/pagination
        items = response.data || [];
        if (!Array.isArray(items)) {
          items = [];
        }
        meta = {
          total: response.pagination?.total || response.total || items.length,
          page: response.pagination?.page || response.pagination?.current_page || pagination.page,
          total_pages: response.pagination?.total_pages || Math.ceil((response.pagination?.total || items.length) / pagination.per_page) || 1
        };
      }

      console.log('Equipment loaded:', { itemsCount: items.length, meta, rawResponse: response });

      setEquipment(items);
      setPagination(prev => ({ ...prev, total: meta.total, total_pages: meta.total_pages }));

      // Load parts/files for visible items
      const partsMap = {};
      const filesMap = {};
      await Promise.all(items.map(async (item) => {
        try {
          const [parts, files] = await Promise.all([
            api.getEquipmentParts(item.id),
            api.getEquipmentFiles(item.id)
          ]);
          partsMap[item.id] = Array.isArray(parts) ? parts : [];
          filesMap[item.id] = Array.isArray(files) ? files : [];
        } catch (e) {
          partsMap[item.id] = [];
          filesMap[item.id] = [];
        }
      }));
      setAllParts(partsMap);
      setAllFiles(filesMap);

    } catch (err) {
      console.error('Failed to load equipment:', err);
      setError(err.message || 'Failed to load equipment');
      setEquipment([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.per_page, debouncedSearch, statusFilter, typeFilter, sortConfig]);

  useEffect(() => { loadEquipment(); }, [loadEquipment]);

  // Reset page when filters change
  useEffect(() => {
    setPagination(p => ({ ...p, page: 1 }));
  }, [debouncedSearch, statusFilter, typeFilter]);

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      setPagination(p => ({ ...p, page: newPage }));
    }
  };

  const refreshEquipmentData = async (equipmentId) => {
    try {
      const [parts, files] = await Promise.all([
        api.getEquipmentParts(equipmentId),
        api.getEquipmentFiles(equipmentId)
      ]);
      setAllParts(prev => ({ ...prev, [equipmentId]: Array.isArray(parts) ? parts : [] }));
      setAllFiles(prev => ({ ...prev, [equipmentId]: Array.isArray(files) ? files : [] }));
    } catch (e) { console.error(e); }
  };

  const toggleExpand = (equipmentId) => {
    setExpandedRows(prev => ({ ...prev, [equipmentId]: !prev[equipmentId] }));
  };

  const handleDelete = async (item) => {
    if (window.confirm(`Delete "${item.name}"?`)) {
      try {
        await api.deleteEquipment(item.id);
        loadEquipment();
      } catch (err) { setError(err.message); }
    }
  };

  const getEquipmentImage = (equipmentId) => {
    const files = allFiles[equipmentId] || [];
    const img = files.find(f => f.file_type === 'image' && !f.part_id);
    return img ? getFileUrl(equipmentId, img.id) : null;
  };

  const canEdit = () => ['Admin', 'Researcher'].includes(user?.role);

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <i className="fas fa-sort" style={{ marginLeft: '5px', color: '#cbd5e0', fontSize: '0.8em' }}></i>;
    return <i className={`fas fa-sort-${sortConfig.direction === 'asc' ? 'up' : 'down'}`} style={{ marginLeft: '5px', color: '#4a5568', fontSize: '0.8em' }}></i>;
  };

  return (
      <div style={{ padding: '6rem 2rem 2rem 2rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '600', color: '#2d3748', marginBottom: '0.5rem' }}>Equipment Management</h1>
          <p style={{ color: '#718096' }}>Track and manage laboratory equipment</p>
        </div>

        {error && <ErrorMessage message={error} onDismiss={() => setError('')} />}

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
              type="text"
              placeholder="Search equipment..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ ...inputStyle, maxWidth: '300px' }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, maxWidth: '150px' }}>
            <option value="">All Statuses</option>
            {Object.entries(EQUIPMENT_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...inputStyle, maxWidth: '150px' }}>
            <option value="">All Types</option>
            {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <div style={{ marginLeft: 'auto' }}>
            {canEdit() && (
                <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                  <i className="fas fa-plus" style={{ marginRight: '0.5rem' }}></i>Add Equipment
                </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          {loading ? <Loading /> : equipment.length > 0 ? (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                  <tr style={{ background: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ width: '40px', padding: '1rem' }}></th>
                    <th style={{ width: '60px', padding: '1rem' }}></th>
                    <th style={{ textAlign: 'left', padding: '1rem', cursor: 'pointer', color: '#4a5568', fontWeight: '600' }} onClick={() => handleSort('name')}>
                      Name <SortIcon column="name" />
                    </th>
                    <th style={{ textAlign: 'left', padding: '1rem', cursor: 'pointer', color: '#4a5568', fontWeight: '600' }} onClick={() => handleSort('type_')}>
                      Type <SortIcon column="type_" />
                    </th>
                    <th style={{ textAlign: 'left', padding: '1rem', cursor: 'pointer', color: '#4a5568', fontWeight: '600' }} onClick={() => handleSort('status')}>
                      Status <SortIcon column="status" />
                    </th>
                    <th style={{ textAlign: 'left', padding: '1rem', color: '#4a5568', fontWeight: '600' }}>Location</th>
                    <th style={{ textAlign: 'left', padding: '1rem', color: '#4a5568', fontWeight: '600' }}>S/N</th>
                    {canEdit() && <th style={{ textAlign: 'right', padding: '1rem', color: '#4a5568', fontWeight: '600' }}>Actions</th>}
                  </tr>
                  </thead>
                  <tbody>
                  {equipment.map(item => (
                      <React.Fragment key={item.id}>
                        <tr style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => toggleExpand(item.id)}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <i className={`fas fa-chevron-${expandedRows[item.id] ? 'down' : 'right'}`} style={{ color: '#a0aec0', fontSize: '0.8em' }}></i>
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <HoverImage src={getEquipmentImage(item.id)} alt={item.name} size={40} />
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: '500', color: '#2d3748' }}>{item.name}</td>
                          <td style={{ padding: '0.75rem 1rem', color: '#718096', textTransform: 'capitalize' }}>{item.type_}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <Badge variant={EQUIPMENT_STATUSES[item.status]?.color || 'secondary'}>
                              {EQUIPMENT_STATUSES[item.status]?.label || item.status}
                            </Badge>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#718096' }}>{item.location || '-'}</td>
                          <td style={{ padding: '0.75rem 1rem', color: '#718096', fontFamily: 'monospace', fontSize: '0.85em' }}>{item.serial_number || '-'}</td>
                          {canEdit() && (
                              <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                <button onClick={() => { setSelectedEquipment(item); setShowDetailsModal(true); }} style={{ background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', padding: '0.25rem 0.5rem' }} title="View">
                                  <i className="fas fa-eye"></i>
                                </button>
                                <button onClick={() => setEditingEquipment(item)} style={{ background: 'none', border: 'none', color: '#4299e1', cursor: 'pointer', padding: '0.25rem 0.5rem' }} title="Edit">
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button onClick={() => handleDelete(item)} style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: '0.25rem 0.5rem' }} title="Delete">
                                  <i className="fas fa-trash"></i>
                                </button>
                              </td>
                          )}
                        </tr>
                        {expandedRows[item.id] && (
                            <tr>
                              <td colSpan={canEdit() ? 8 : 7} style={{ padding: 0, background: '#f8fafc' }}>
                                <ExpandedPartsPanel
                                    equipmentId={item.id}
                                    parts={allParts[item.id] || []}
                                    files={allFiles[item.id] || []}
                                    canEdit={canEdit()}
                                    onRefresh={() => refreshEquipmentData(item.id)}
                                />
                              </td>
                            </tr>
                        )}
                      </React.Fragment>
                  ))}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                <div style={{ padding: '1rem 2rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#718096' }}>
                Page {pagination.page} of {pagination.total_pages} ({pagination.total} items)
              </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                        variant="secondary"
                        size="small"
                        disabled={pagination.page <= 1}
                        onClick={() => handlePageChange(pagination.page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                        variant="secondary"
                        size="small"
                        disabled={pagination.page >= pagination.total_pages}
                        onClick={() => handlePageChange(pagination.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
          ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#a0aec0' }}>
                <i className="fas fa-tools" style={{ fontSize: '3rem', marginBottom: '1rem' }}></i>
                <p>No equipment found</p>
              </div>
          )}
        </div>

        {/* MODAL INTEGRATIONS */}

        {/* 1. Create Modal */}
        {showCreateModal && (
            <CreateEquipmentModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSave={() => { setShowCreateModal(false); loadEquipment(); }}
            />
        )}

        {/* 2. Edit Modal */}
        {editingEquipment && (
            <EditEquipmentModal
                isOpen={!!editingEquipment}
                equipment={editingEquipment}
                existingImage={getEquipmentImage(editingEquipment.id)}
                onClose={() => setEditingEquipment(null)}
                onSave={() => { setEditingEquipment(null); loadEquipment(); }}
            />
        )}

        {/* 3. Details Modal */}
        {showDetailsModal && selectedEquipment && (
            <EquipmentDetailsModal
                equipment={selectedEquipment}
                user={user}
                onClose={() => { setShowDetailsModal(false); setSelectedEquipment(null); }}
                onUpdate={() => { loadEquipment(); refreshEquipmentData(selectedEquipment.id); }}
            />
        )}
      </div>
  );
};

// ==================== SUB-COMPONENTS ====================

const ExpandedPartsPanel = ({ equipmentId, parts, files, canEdit, onRefresh }) => {
  const [showAddModal, setShowAddModal] = useState(false);

  const handleDelete = async (partId) => {
    if (window.confirm('Delete this part?')) {
      try {
        await api.deleteEquipmentPart(equipmentId, partId);
        onRefresh();
      } catch (err) { console.error(err); }
    }
  };

  const getPartImage = (partId) => {
    const img = files.find(f => f.file_type === 'image' && f.part_id === partId);
    return img ? getFileUrl(equipmentId, img.id) : null;
  };

  return (
      <div style={{ padding: '1rem 1rem 1rem 4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.875rem', color: '#4a5568', fontWeight: '600' }}>
            <i className="fas fa-cogs" style={{ marginRight: '0.5rem', color: '#667eea' }}></i>Parts ({parts.length})
          </h4>
          {canEdit && <Button variant="primary" size="small" onClick={() => setShowAddModal(true)}><i className="fas fa-plus"></i> Add Part</Button>}
        </div>
        {parts.length === 0 ? (
            <p style={{ color: '#a0aec0', fontSize: '0.875rem', margin: '0.5rem 0' }}>No parts registered</p>
        ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
              <tr style={{ background: '#edf2f7' }}>
                <th style={{ width: '50px', padding: '0.5rem' }}></th>
                <th style={{ textAlign: 'left', padding: '0.5rem', color: '#4a5568' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', color: '#4a5568' }}>P/N</th>
                <th style={{ textAlign: 'center', padding: '0.5rem', color: '#4a5568' }}>Qty</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', color: '#4a5568' }}>Status</th>
                {canEdit && <th style={{ textAlign: 'right', padding: '0.5rem' }}>Actions</th>}
              </tr>
              </thead>
              <tbody>
              {parts.map(part => (
                  <tr key={part.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '0.5rem' }}><HoverImage src={getPartImage(part.id)} alt={part.name} size={36} zoomSize={180} /></td>
                    <td style={{ padding: '0.5rem', fontWeight: '500' }}>{part.name}</td>
                    <td style={{ padding: '0.5rem', color: '#718096', fontFamily: 'monospace' }}>{part.part_number || '-'}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{part.quantity}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <Badge variant={PART_STATUSES[part.status]?.color || 'secondary'}>
                        {PART_STATUSES[part.status]?.label || part.status}
                      </Badge>
                    </td>
                    {canEdit && (
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                          <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(part.id); }}
                              style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: '0.25rem' }}
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </td>
                    )}
                  </tr>
              ))}
              </tbody>
            </table>
        )}
        {showAddModal && (
            <PartFormModal
                equipmentId={equipmentId}
                onClose={() => setShowAddModal(false)}
                onSave={() => { setShowAddModal(false); onRefresh(); }}
            />
        )}
      </div>
  );
};

// ==================== LOCAL MODALS ====================

const PartFormModal = ({ equipmentId, onClose, onSave }) => {
  const [formData, setFormData] = useState({ name: '', part_number: '', quantity: 1, status: 'good' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.createEquipmentPart(equipmentId, formData);
      onSave();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
          <h3 style={{ marginTop: 0, color: '#2d3748' }}>Add Part</h3>
          <form onSubmit={handleSubmit}>
            <FormInput
                label="Part Name"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormInput
                  label="Part Number"
                  value={formData.part_number}
                  onChange={e => setFormData({ ...formData, part_number: e.target.value })}
              />
              <FormInput
                  label="Quantity"
                  type="number"
                  min="1"
                  required
                  value={formData.quantity}
                  onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>
            <FormSelect
                label="Status"
                required
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value })}
            >
              {Object.keys(PART_STATUSES).map(k => (
                  <option key={k} value={k}>{PART_STATUSES[k].label}</option>
              ))}
            </FormSelect>
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
              <Button variant="primary" type="submit" disabled={loading}>
                {loading ? 'Adding...' : 'Add Part'}
              </Button>
            </div>
          </form>
        </div>
      </div>
  );
};

const EquipmentDetailsModal = ({ equipment, user, onClose, onUpdate }) => (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{equipment.name}</h2>
        <p><strong>Type:</strong> {equipment.type_}</p>
        <p><strong>S/N:</strong> {equipment.serial_number || '-'}</p>
        <p><strong>Status:</strong> {EQUIPMENT_STATUSES[equipment.status]?.label || equipment.status}</p>
        <p><strong>Location:</strong> {equipment.location || '-'}</p>
        <p><strong>Description:</strong> {equipment.description || '-'}</p>
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
);

export default Equipment;