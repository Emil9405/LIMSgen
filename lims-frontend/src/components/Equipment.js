// components/Equipment.js - Full-featured equipment management
// Version 3.1 - Hover zoom, global parts search, reactive updates
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import ErrorMessage from './ErrorMessage';
import Loading from './Loading';
import Badge from './Badge';
import Button from './Button';
import Modal from './Modal';

// ==================== STYLED FORM COMPONENTS ====================

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

const FormTextarea = ({ label, required, ...props }) => (
  <FormGroup label={label} required={required}>
    <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} {...props} />
  </FormGroup>
);

// ==================== CONSTANTS ====================

const FILE_TYPES = { manual: 'Manual', image: 'Image', certificate: 'Certificate', specification: 'Specification', maintenance_log: 'Maintenance Log', other: 'Other' };

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

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const getFileUrl = (equipmentId, fileId) => `${API_BASE_URL}/api/v1/public/equipment/${equipmentId}/files/${fileId}`;

// ==================== IMAGE PREVIEW (FOR FORMS) ====================

const ImagePreview = ({ file, onRemove }) => {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(file);
    } else setPreview(null);
  }, [file]);

  if (!preview) return null;
  return (
    <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.5rem' }}>
      <img src={preview} alt="Preview" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #e2e8f0' }} />
      <button type="button" onClick={onRemove} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', fontSize: '0.75rem' }}>
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};

// ==================== HOVER IMAGE (ZOOM ON HOVER) ====================

const HoverImage = ({ src, alt, size = 40, zoomSize = 200 }) => {
  const [error, setError] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);

  const handleMouseEnter = (e) => {
    if (!src || error) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({
      x: rect.right + 10,
      y: rect.top
    });
    setShowZoom(true);
  };

  const handleMouseLeave = () => {
    setShowZoom(false);
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
        ref={imgRef}
        src={src}
        alt={alt}
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: '6px', flexShrink: 0, cursor: 'pointer', transition: 'transform 0.2s' }}
        onError={() => setError(true)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
      {showZoom && (
        <div style={{
          position: 'fixed',
          left: Math.min(position.x, window.innerWidth - zoomSize - 20),
          top: Math.max(10, Math.min(position.y, window.innerHeight - zoomSize - 20)),
          zIndex: 9999,
          pointerEvents: 'none'
        }}>
          <img
            src={src}
            alt={alt}
            style={{
              width: zoomSize,
              height: zoomSize,
              objectFit: 'cover',
              borderRadius: '12px',
              border: '3px solid white',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
            }}
          />
        </div>
      )}
    </>
  );
};

// ==================== MAIN EQUIPMENT COMPONENT ====================

const Equipment = ({ user }) => {
  const [equipment, setEquipment] = useState([]);
  const [allParts, setAllParts] = useState({}); // {equipmentId: [parts]}
  const [allFiles, setAllFiles] = useState({}); // {equipmentId: [files]}
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [error, setError] = useState('');
  const [expandedRows, setExpandedRows] = useState({});

  // Load all equipment
  const loadEquipment = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const data = await api.getEquipment();
      const items = Array.isArray(data) ? data : data?.data || [];
      setEquipment(items);
      
      // Preload parts and files for all equipment (for global search)
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
      setError(err.message || 'Failed to load equipment');
      setEquipment([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadEquipment(); }, [loadEquipment]);

  // Refresh single equipment data
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

  // Get equipment image
  const getEquipmentImage = (equipmentId) => {
    const files = allFiles[equipmentId] || [];
    const img = files.find(f => f.file_type === 'image' && !f.part_id);
    return img ? getFileUrl(equipmentId, img.id) : null;
  };

  // Global search: equipment name/serial/manufacturer + parts name/part_number
  const filteredEquipment = equipment.filter(item => {
    if (!item) return false;
    
    const matchesStatus = !statusFilter || item.status === statusFilter;
    const matchesType = !typeFilter || item.type_ === typeFilter;
    
    if (!matchesStatus || !matchesType) return false;
    
    if (!searchTerm) return true;
    
    const term = searchTerm.toLowerCase();
    
    // Search in equipment fields
    const matchesEquipment = 
      item.name?.toLowerCase().includes(term) ||
      item.serial_number?.toLowerCase().includes(term) ||
      item.manufacturer?.toLowerCase().includes(term);
    
    if (matchesEquipment) return true;
    
    // Search in parts
    const parts = allParts[item.id] || [];
    const matchesParts = parts.some(part => 
      part.name?.toLowerCase().includes(term) ||
      part.part_number?.toLowerCase().includes(term)
    );
    
    return matchesParts;
  });

  const canEdit = () => ['Admin', 'Researcher'].includes(user?.role);
  const equipmentTypes = [...new Set(equipment.map(e => e.type_).filter(Boolean))];

  // Count matching parts for search highlight
  const getMatchingPartsCount = (equipmentId) => {
    if (!searchTerm) return 0;
    const term = searchTerm.toLowerCase();
    const parts = allParts[equipmentId] || [];
    return parts.filter(p => 
      p.name?.toLowerCase().includes(term) || 
      p.part_number?.toLowerCase().includes(term)
    ).length;
  };

  return (
    <div style={{ padding: '6rem 2rem 2rem 2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '600', color: '#2d3748', marginBottom: '0.5rem' }}>Equipment Management</h1>
        <p style={{ color: '#718096' }}>Manage laboratory equipment, parts, and maintenance</p>
      </div>

      {error && <ErrorMessage message={error} onDismiss={() => setError('')} />}

      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#2d3748', margin: 0 }}>Equipment List</h2>
            <p style={{ fontSize: '0.875rem', color: '#718096', margin: '0.25rem 0 0 0' }}>Total: {filteredEquipment.length} items</p>
          </div>
          {canEdit() && <Button variant="primary" onClick={() => setShowCreateModal(true)}><i className="fas fa-plus"></i> Add Equipment</Button>}
        </div>

        {/* Filters */}
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#718096', marginBottom: '0.25rem' }}>
              Search equipment & parts (name, S/N, P/N)
            </label>
            <input 
              placeholder="Search..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              style={inputStyle} 
            />
          </div>
          <div style={{ width: '180px' }}>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">All Types</option>
              {equipmentTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div style={{ width: '180px' }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">All Statuses</option>
              {Object.entries(EQUIPMENT_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {/* Equipment Table */}
        <div style={{ padding: '0' }}>
          {loading ? <div style={{ padding: '2rem' }}><Loading /></div> : filteredEquipment.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ width: '40px', padding: '1rem' }}></th>
                  <th style={{ width: '60px', padding: '1rem' }}></th>
                  <th style={{ textAlign: 'left', padding: '1rem', color: '#4a5568', fontWeight: '600' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '1rem', color: '#4a5568', fontWeight: '600' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '1rem', color: '#4a5568', fontWeight: '600' }}>S/N</th>
                  <th style={{ textAlign: 'left', padding: '1rem', color: '#4a5568', fontWeight: '600' }}>Location</th>
                  <th style={{ textAlign: 'left', padding: '1rem', color: '#4a5568', fontWeight: '600' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '1rem', color: '#4a5568', fontWeight: '600' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEquipment.map(item => {
                  const matchingParts = getMatchingPartsCount(item.id);
                  return (
                    <React.Fragment key={item.id}>
                      <tr style={{ borderBottom: expandedRows[item.id] ? 'none' : '1px solid #e2e8f0', background: expandedRows[item.id] ? '#f0f4ff' : 'white', cursor: 'pointer' }}
                        onMouseEnter={(e) => { if (!expandedRows[item.id]) e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { if (!expandedRows[item.id]) e.currentTarget.style.background = 'white'; }}>
                        <td style={{ padding: '1rem', textAlign: 'center' }} onClick={() => toggleExpand(item.id)}>
                          <i className={`fas fa-chevron-${expandedRows[item.id] ? 'down' : 'right'}`} style={{ color: '#667eea', fontSize: '0.875rem' }}></i>
                        </td>
                        <td style={{ padding: '0.5rem' }} onClick={() => toggleExpand(item.id)}>
                          <HoverImage src={getEquipmentImage(item.id)} alt={item.name} size={44} zoomSize={250} />
                        </td>
                        <td style={{ padding: '1rem' }} onClick={() => toggleExpand(item.id)}>
                          <div>
                            <div style={{ fontWeight: '500', color: '#2d3748' }}>{item.name}</div>
                            {item.manufacturer && <div style={{ fontSize: '0.75rem', color: '#718096' }}>{item.manufacturer}</div>}
                            {matchingParts > 0 && (
                              <div style={{ fontSize: '0.7rem', color: '#667eea', marginTop: '0.25rem' }}>
                                <i className="fas fa-cogs"></i> {matchingParts} matching part{matchingParts > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '1rem', color: '#4a5568' }} onClick={() => toggleExpand(item.id)}>{item.type_}</td>
                        <td style={{ padding: '1rem', color: '#718096', fontFamily: 'monospace', fontSize: '0.875rem' }} onClick={() => toggleExpand(item.id)}>{item.serial_number || '-'}</td>
                        <td style={{ padding: '1rem', color: '#4a5568' }} onClick={() => toggleExpand(item.id)}>{item.location || '-'}</td>
                        <td style={{ padding: '1rem' }} onClick={() => toggleExpand(item.id)}>
                          <Badge variant={EQUIPMENT_STATUSES[item.status]?.color || 'secondary'}>{EQUIPMENT_STATUSES[item.status]?.label || item.status}</Badge>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <Button variant="secondary" size="small" onClick={() => { setSelectedEquipment(item); setShowDetailsModal(true); }} style={{ marginRight: '0.5rem' }} title="View">
                            <i className="fas fa-eye"></i>
                          </Button>
                          {canEdit() && (
                            <>
                              <Button variant="primary" size="small" onClick={() => setEditingEquipment(item)} style={{ marginRight: '0.5rem' }} title="Edit">
                                <i className="fas fa-edit"></i>
                              </Button>
                              <Button variant="danger" size="small" onClick={() => handleDelete(item)} title="Delete">
                                <i className="fas fa-trash"></i>
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                      {expandedRows[item.id] && (
                        <tr>
                          <td colSpan="8" style={{ padding: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <ExpandedPartsPanel 
                              equipmentId={item.id} 
                              parts={allParts[item.id] || []} 
                              files={allFiles[item.id] || []}
                              searchTerm={searchTerm}
                              canEdit={canEdit()} 
                              onRefresh={() => refreshEquipmentData(item.id)} 
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#a0aec0' }}>
              <i className="fas fa-tools" style={{ fontSize: '3rem', marginBottom: '1rem' }}></i>
              <p>No equipment found</p>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateEquipmentModal 
          onClose={() => setShowCreateModal(false)} 
          onSave={() => { setShowCreateModal(false); loadEquipment(); }} 
        />
      )}
      {editingEquipment && (
        <EditEquipmentModal 
          equipment={editingEquipment} 
          existingImage={getEquipmentImage(editingEquipment.id)}
          onClose={() => setEditingEquipment(null)} 
          onSave={() => { setEditingEquipment(null); loadEquipment(); }} 
        />
      )}
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

// ==================== EXPANDED PARTS PANEL ====================

const ExpandedPartsPanel = ({ equipmentId, parts, files, searchTerm, canEdit, onRefresh }) => {
  const [showAddModal, setShowAddModal] = useState(false);

  const handleDelete = async (partId) => {
    if (window.confirm('Delete this part?')) {
      await api.deleteEquipmentPart(equipmentId, partId);
      onRefresh();
    }
  };

  // Get part image
  const getPartImage = (partId) => {
    const img = files.find(f => f.file_type === 'image' && f.part_id === partId);
    return img ? getFileUrl(equipmentId, img.id) : null;
  };

  // Highlight matching parts
  const isPartMatching = (part) => {
    if (!searchTerm) return false;
    const term = searchTerm.toLowerCase();
    return part.name?.toLowerCase().includes(term) || part.part_number?.toLowerCase().includes(term);
  };

  return (
    <div style={{ padding: '1rem 1rem 1rem 4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.875rem', color: '#4a5568', fontWeight: '600' }}>
          <i className="fas fa-cogs" style={{ marginRight: '0.5rem', color: '#667eea' }}></i>Parts ({parts.length})
        </h4>
        {canEdit && <Button variant="primary" size="small" onClick={() => setShowAddModal(true)}><i className="fas fa-plus"></i> Add</Button>}
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
              <tr key={part.id} style={{ 
                borderBottom: '1px solid #e2e8f0',
                background: isPartMatching(part) ? '#fef3c7' : 'transparent'
              }}>
                <td style={{ padding: '0.5rem' }}>
                  <HoverImage src={getPartImage(part.id)} alt={part.name} size={36} zoomSize={180} />
                </td>
                <td style={{ padding: '0.5rem', fontWeight: '500' }}>{part.name}</td>
                <td style={{ padding: '0.5rem', color: '#718096', fontFamily: 'monospace' }}>{part.part_number || '-'}</td>
                <td style={{ padding: '0.5rem', textAlign: 'center' }}>{part.quantity}</td>
                <td style={{ padding: '0.5rem' }}>
                  <Badge variant={PART_STATUSES[part.status]?.color || 'secondary'}>{PART_STATUSES[part.status]?.label || part.status}</Badge>
                </td>
                {canEdit && (
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    <button onClick={() => handleDelete(part.id)} style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: '0.25rem' }}>
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

// ==================== EQUIPMENT DETAILS MODAL ====================

const EquipmentDetailsModal = ({ equipment, user, onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState('details');
  const [parts, setParts] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canEdit = useCallback(() => ['Admin', 'Researcher'].includes(user?.role), [user?.role]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [p, m, f] = await Promise.all([
        api.getEquipmentParts(equipment.id),
        api.getEquipmentMaintenance(equipment.id),
        api.getEquipmentFiles(equipment.id)
      ]);
      setParts(Array.isArray(p) ? p : []);
      setMaintenance(Array.isArray(m) ? m : []);
      setFiles(Array.isArray(f) ? f : []);
    } catch (err) { 
      setError(err.message); 
    } finally { 
      setLoading(false); 
    }
  }, [equipment.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = () => {
    loadAll();
    onUpdate();
  };

  const tabs = [
    { id: 'details', label: 'Details', icon: 'fas fa-info-circle' },
    { id: 'parts', label: 'Parts', icon: 'fas fa-cogs' },
    { id: 'maintenance', label: 'Maintenance', icon: 'fas fa-wrench' },
    { id: 'files', label: 'Files', icon: 'fas fa-file-alt' },
  ];

  const mainImage = files.find(f => f.file_type === 'image' && !f.part_id);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
      <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '1000px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#2d3748' }}>{equipment.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#718096' }}><i className="fas fa-times"></i></button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem 2rem' }}>
          {error && <ErrorMessage message={error} onDismiss={() => setError('')} />}
          
          {/* Header with Photo */}
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
            <div style={{ flexShrink: 0 }}>
              {mainImage ? (
                <HoverImage src={getFileUrl(equipment.id, mainImage.id)} alt={equipment.name} size={120} zoomSize={300} />
              ) : (
                <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', borderRadius: '8px', color: '#718096' }}>
                  <i className="fas fa-tools" style={{ fontSize: '2.5rem' }}></i>
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#2d3748' }}>{equipment.name}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.875rem', color: '#718096' }}>
                {equipment.type_ && <span><i className="fas fa-tag"></i> {equipment.type_}</span>}
                {equipment.manufacturer && <span><i className="fas fa-industry"></i> {equipment.manufacturer}</span>}
                {equipment.serial_number && <span><i className="fas fa-barcode"></i> {equipment.serial_number}</span>}
                {equipment.location && <span><i className="fas fa-map-marker-alt"></i> {equipment.location}</span>}
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <Badge variant={EQUIPMENT_STATUSES[equipment.status]?.color || 'secondary'}>{EQUIPMENT_STATUSES[equipment.status]?.label || equipment.status}</Badge>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem' }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: '0.75rem 1.5rem', border: 'none', background: 'none', cursor: 'pointer',
                color: activeTab === tab.id ? '#667eea' : '#718096',
                borderBottom: activeTab === tab.id ? '2px solid #667eea' : '2px solid transparent',
                marginBottom: '-2px', fontWeight: activeTab === tab.id ? '600' : '400',
              }}>
                <i className={tab.icon} style={{ marginRight: '0.5rem' }}></i>{tab.label}
              </button>
            ))}
          </div>

          {loading && <Loading />}

          {activeTab === 'details' && !loading && <DetailsTab equipment={equipment} />}
          {activeTab === 'parts' && !loading && <PartsTab equipmentId={equipment.id} parts={parts} files={files} canEdit={canEdit()} onRefresh={handleRefresh} />}
          {activeTab === 'maintenance' && !loading && <MaintenanceTab equipmentId={equipment.id} maintenance={maintenance} canEdit={canEdit()} onRefresh={handleRefresh} />}
          {activeTab === 'files' && !loading && <FilesTab equipmentId={equipment.id} files={files} canEdit={canEdit()} onRefresh={handleRefresh} />}
        </div>
      </div>
    </div>
  );
};

// ==================== DETAILS TAB ====================

const DetailsTab = ({ equipment }) => {
  const fields = [
    { key: 'name', label: 'Name' },
    { key: 'type_', label: 'Type' },
    { key: 'status', label: 'Status', render: (v) => EQUIPMENT_STATUSES[v]?.label || v },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    { key: 'serial_number', label: 'Serial Number' },
    { key: 'manufacturer', label: 'Manufacturer' },
    { key: 'model', label: 'Model' },
    { key: 'location', label: 'Location' },
    { key: 'purchase_date', label: 'Purchase Date', render: (v) => v ? new Date(v).toLocaleDateString() : '-' },
    { key: 'warranty_until', label: 'Warranty Until', render: (v) => v ? new Date(v).toLocaleDateString() : '-' },
    { key: 'description', label: 'Description' },
  ];

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {fields.map(field => (
          <tr key={field.key} style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '0.75rem 1rem', width: '200px', background: '#f8fafc', fontWeight: '500', color: '#4a5568', fontSize: '0.875rem' }}>{field.label}</td>
            <td style={{ padding: '0.75rem 1rem', color: equipment[field.key] ? '#2d3748' : '#a0aec0' }}>
              {field.render ? field.render(equipment[field.key]) : (equipment[field.key] || '-')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ==================== PARTS TAB ====================

const PartsTab = ({ equipmentId, parts, files, canEdit, onRefresh }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleDelete = async (partId) => {
    if (window.confirm('Delete this part?')) {
      await api.deleteEquipmentPart(equipmentId, partId);
      onRefresh();
    }
  };

  const getPartImage = (partId) => {
    const img = files.find(f => f.file_type === 'image' && f.part_id === partId);
    return img ? getFileUrl(equipmentId, img.id) : null;
  };

  const filteredParts = parts.filter(part => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return part.name?.toLowerCase().includes(term) || part.part_number?.toLowerCase().includes(term);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
        <div style={{ flex: 1, maxWidth: '300px' }}>
          <input placeholder="Search parts..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={inputStyle} />
        </div>
        {canEdit && <Button variant="primary" onClick={() => setShowAddModal(true)}><i className="fas fa-plus"></i> Add Part</Button>}
      </div>

      {filteredParts.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }}>{parts.length === 0 ? 'No parts registered' : 'No parts match search'}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ width: '60px', padding: '0.75rem 1rem' }}></th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: '#4a5568', fontWeight: '600' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: '#4a5568', fontWeight: '600' }}>Part Number</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: '#4a5568', fontWeight: '600' }}>Manufacturer</th>
              <th style={{ textAlign: 'center', padding: '0.75rem 1rem', color: '#4a5568', fontWeight: '600' }}>Qty</th>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', color: '#4a5568', fontWeight: '600' }}>Status</th>
              {canEdit && <th style={{ textAlign: 'right', padding: '0.75rem 1rem', color: '#4a5568', fontWeight: '600' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredParts.map(part => (
              <tr key={part.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.5rem 1rem' }}>
                  <HoverImage src={getPartImage(part.id)} alt={part.name} size={40} zoomSize={200} />
                </td>
                <td style={{ padding: '0.75rem 1rem', fontWeight: '500', color: '#2d3748' }}>{part.name}</td>
                <td style={{ padding: '0.75rem 1rem', color: '#718096', fontFamily: 'monospace' }}>{part.part_number || '-'}</td>
                <td style={{ padding: '0.75rem 1rem', color: '#718096' }}>{part.manufacturer || '-'}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{part.quantity}</td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <Badge variant={PART_STATUSES[part.status]?.color || 'secondary'}>{PART_STATUSES[part.status]?.label || part.status}</Badge>
                </td>
                {canEdit && (
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <Button variant="secondary" size="small" onClick={() => setEditingPart(part)} style={{ marginRight: '0.5rem' }}><i className="fas fa-edit"></i></Button>
                    <Button variant="danger" size="small" onClick={() => handleDelete(part.id)}><i className="fas fa-trash"></i></Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAddModal && <PartFormModal equipmentId={equipmentId} onClose={() => setShowAddModal(false)} onSave={() => { setShowAddModal(false); onRefresh(); }} />}
      {editingPart && <PartFormModal equipmentId={equipmentId} part={editingPart} existingImageUrl={getPartImage(editingPart.id)} onClose={() => setEditingPart(null)} onSave={() => { setEditingPart(null); onRefresh(); }} />}
    </div>
  );
};

// ==================== MAINTENANCE TAB ====================

const MaintenanceTab = ({ equipmentId, maintenance, canEdit, onRefresh }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const handleDelete = async (id) => { if (window.confirm('Delete?')) { await api.deleteMaintenance(equipmentId, id); onRefresh(); } };
  const handleComplete = async (id) => { const by = prompt('Performed by:'); if (by) { await api.completeMaintenance(equipmentId, id, { performed_by: by }); onRefresh(); } };
  const statusColors = { scheduled: 'info', in_progress: 'warning', completed: 'success', cancelled: 'secondary', overdue: 'danger' };

  return (
    <div>
      {canEdit && <div style={{ marginBottom: '1rem' }}><Button variant="primary" onClick={() => setShowAddModal(true)}><i className="fas fa-plus"></i> Schedule</Button></div>}
      {maintenance.length === 0 ? <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }}>No maintenance records</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Type</th>
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Scheduled</th>
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Performed By</th>
            {canEdit && <th style={{ textAlign: 'right', padding: '0.75rem' }}>Actions</th>}
          </tr></thead>
          <tbody>
            {maintenance.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.75rem' }}>{m.maintenance_type?.replace('_', ' ').toUpperCase()}</td>
                <td style={{ padding: '0.75rem' }}>{m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : '-'}</td>
                <td style={{ padding: '0.75rem' }}><Badge variant={statusColors[m.status] || 'secondary'}>{m.status?.toUpperCase()}</Badge></td>
                <td style={{ padding: '0.75rem', color: '#718096' }}>{m.performed_by || '-'}</td>
                {canEdit && (
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                    {m.status === 'scheduled' && <Button variant="success" size="small" onClick={() => handleComplete(m.id)} style={{ marginRight: '0.5rem' }}><i className="fas fa-check"></i></Button>}
                    <Button variant="danger" size="small" onClick={() => handleDelete(m.id)}><i className="fas fa-trash"></i></Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showAddModal && <MaintenanceFormModal equipmentId={equipmentId} onClose={() => setShowAddModal(false)} onSave={() => { setShowAddModal(false); onRefresh(); }} />}
    </div>
  );
};

// ==================== FILES TAB ====================

const FilesTab = ({ equipmentId, files, canEdit, onRefresh }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({ file: null, file_type: 'image', description: '' });
  const [uploadError, setUploadError] = useState('');
  const fileTypeIcons = { manual: 'fa-book', image: 'fa-image', certificate: 'fa-certificate', specification: 'fa-file-alt', maintenance_log: 'fa-clipboard-list', other: 'fa-file' };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) return;
    try {
      setUploading(true); setUploadError('');
      await api.uploadEquipmentFile(equipmentId, uploadForm.file, { file_type: uploadForm.file_type, description: uploadForm.description });
      setUploadForm({ file: null, file_type: 'image', description: '' });
      document.getElementById('equipment-file-input').value = '';
      onRefresh();
    } catch (err) { setUploadError(err.message); } finally { setUploading(false); }
  };

  const handleDownload = async (file) => { try { await api.downloadEquipmentFile(equipmentId, file.id, file.original_filename); } catch (err) { alert(err.message); } };
  const handleDelete = async (fileId) => { if (window.confirm('Delete?')) { await api.deleteEquipmentFile(equipmentId, fileId); onRefresh(); } };

  const equipmentImages = files.filter(f => f.file_type === 'image' && !f.part_id);
  const partImages = files.filter(f => f.file_type === 'image' && f.part_id);
  const documents = files.filter(f => f.file_type !== 'image');

  return (
    <div>
      {canEdit && (
        <form onSubmit={handleUpload} style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f7fafc', borderRadius: '8px' }}>
          {uploadError && <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '6px', color: '#dc2626', marginBottom: '1rem' }}>{uploadError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
            <FormGroup label="File"><input id="equipment-file-input" type="file" onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files[0] })} /></FormGroup>
            <FormSelect label="Type" value={uploadForm.file_type} onChange={(e) => setUploadForm({ ...uploadForm, file_type: e.target.value })}>{Object.entries(FILE_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</FormSelect>
            <FormInput label="Description" value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} placeholder="Optional" />
            <div style={{ marginBottom: '1rem' }}><Button variant="primary" type="submit" disabled={!uploadForm.file || uploading}>{uploading ? 'Uploading...' : 'Upload'}</Button></div>
          </div>
        </form>
      )}

      {equipmentImages.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 1rem 0', color: '#4a5568', fontSize: '0.875rem' }}><i className="fas fa-images"></i> Equipment Photos ({equipmentImages.length})</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {equipmentImages.map(file => (
              <div key={file.id} style={{ position: 'relative' }}>
                <HoverImage src={getFileUrl(equipmentId, file.id)} alt={file.original_filename} size={120} zoomSize={300} />
                {canEdit && <button onClick={() => handleDelete(file.id)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(220,38,38,0.9)', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer' }}><i className="fas fa-times"></i></button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {partImages.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 1rem 0', color: '#4a5568', fontSize: '0.875rem' }}><i className="fas fa-cogs"></i> Part Photos ({partImages.length})</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {partImages.map(file => (
              <div key={file.id} style={{ position: 'relative' }}>
                <HoverImage src={getFileUrl(equipmentId, file.id)} alt={file.original_filename} size={80} zoomSize={200} />
                {file.description && <div style={{ fontSize: '0.7rem', color: '#718096', textAlign: 'center', marginTop: '0.25rem', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.description}</div>}
                {canEdit && <button onClick={() => handleDelete(file.id)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(220,38,38,0.9)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '0.6rem' }}><i className="fas fa-times"></i></button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 1rem 0', color: '#4a5568', fontSize: '0.875rem' }}><i className="fas fa-folder"></i> Documents ({documents.length})</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
            {documents.map(file => (
              <div key={file.id} style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <i className={`fas ${fileTypeIcons[file.file_type] || 'fa-file'}`} style={{ fontSize: '1.5rem', marginRight: '0.75rem', color: '#667eea' }}></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.original_filename}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#718096' }}>{FILE_TYPES[file.file_type]} • {(file.file_size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="secondary" size="small" onClick={() => handleDownload(file)}><i className="fas fa-download"></i></Button>
                  {canEdit && <Button variant="danger" size="small" onClick={() => handleDelete(file.id)}><i className="fas fa-trash"></i></Button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 && <p style={{ textAlign: 'center', color: '#718096', padding: '2rem' }}>No files uploaded</p>}
    </div>
  );
};

// ==================== CREATE EQUIPMENT MODAL ====================

const CreateEquipmentModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({ name: '', type_: 'instrument', quantity: 1, unit: 'pcs', model: '', serial_number: '', manufacturer: '', description: '', location: '', purchase_date: '', warranty_until: '' });
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) { setError('Name is required'); return; }
    try {
      setLoading(true); setError('');
      const payload = { name: formData.name.trim(), type_: formData.type_, quantity: parseInt(formData.quantity) || 1 };
      ['unit', 'model', 'serial_number', 'manufacturer', 'description', 'location', 'purchase_date', 'warranty_until'].forEach(k => { if (formData[k]?.trim()) payload[k] = formData[k].trim(); });
      const created = await api.createEquipment(payload);
      if (photo && created?.id) {
        try { await api.uploadEquipmentFile(created.id, photo, { file_type: 'image', description: 'Equipment photo' }); } catch (e) { console.error('Photo upload failed:', e); }
      }
      onSave();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
      <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#2d3748' }}>Add Equipment</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#718096' }}><i className="fas fa-times"></i></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem 2rem' }}>
          {error && <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '6px', color: '#dc2626', marginBottom: '1rem' }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '2rem' }}>
              <div>
                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#374151', fontSize: '0.875rem', fontWeight: '600' }}>Required</h4>
                  <FormInput label="Name" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <FormSelect label="Type" required value={formData.type_} onChange={(e) => setFormData({...formData, type_: e.target.value})}>
                      <option value="instrument">Instrument</option><option value="glassware">Glassware</option><option value="safety">Safety</option><option value="storage">Storage</option><option value="consumable">Consumable</option><option value="other">Other</option>
                    </FormSelect>
                    <FormInput label="Quantity" required type="number" min="1" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 1})} />
                  </div>
                </div>
                <h4 style={{ margin: '0 0 1rem 0', color: '#374151', fontSize: '0.875rem', fontWeight: '600' }}>Additional</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <FormInput label="Unit" value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} />
                  <FormInput label="Model" value={formData.model} onChange={(e) => setFormData({...formData, model: e.target.value})} />
                  <FormInput label="Serial Number" value={formData.serial_number} onChange={(e) => setFormData({...formData, serial_number: e.target.value})} />
                  <FormInput label="Manufacturer" value={formData.manufacturer} onChange={(e) => setFormData({...formData, manufacturer: e.target.value})} />
                  <FormInput label="Purchase Date" type="date" value={formData.purchase_date} onChange={(e) => setFormData({...formData, purchase_date: e.target.value})} />
                  <FormInput label="Warranty Until" type="date" value={formData.warranty_until} onChange={(e) => setFormData({...formData, warranty_until: e.target.value})} />
                </div>
                <FormInput label="Location" value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} />
                <FormTextarea label="Description" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
              </div>
              <div>
                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#374151', fontSize: '0.875rem', fontWeight: '600' }}>Photo</h4>
                  <div style={{ border: '2px dashed #d1d5db', borderRadius: '8px', padding: '1rem', textAlign: 'center', background: photo ? '#f0fdf4' : 'white' }}>
                    {photo ? <ImagePreview file={photo} onRemove={() => setPhoto(null)} /> : <><i className="fas fa-camera" style={{ fontSize: '2rem', color: '#9ca3af', marginBottom: '0.5rem' }}></i><p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Add photo</p></>}
                    <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} style={{ display: photo ? 'none' : 'block', width: '100%', marginTop: '0.5rem' }} />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', marginTop: '1rem' }}>
              <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Equipment'}</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ==================== EDIT EQUIPMENT MODAL ====================

const EditEquipmentModal = ({ equipment, existingImage, onClose, onSave }) => {
  const [formData, setFormData] = useState({ ...equipment });
  const [newPhoto, setNewPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const statusOptions = Object.keys(EQUIPMENT_STATUSES);
  const typeOptions = ['instrument', 'glassware', 'safety', 'storage', 'consumable', 'other'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim()) { setError('Name is required'); return; }
    try {
      setLoading(true); setError('');
      await api.updateEquipment(equipment.id, formData);
      if (newPhoto) {
        try { await api.uploadEquipmentFile(equipment.id, newPhoto, { file_type: 'image', description: 'Equipment photo' }); } catch (e) { console.error(e); }
      }
      onSave();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
      <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#2d3748' }}>Edit Equipment</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#718096' }}><i className="fas fa-times"></i></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem 2rem' }}>
          {error && <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '6px', color: '#dc2626', marginBottom: '1rem' }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '2rem' }}>
              <div>
                <FormInput label="Name" required value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <FormSelect label="Type" value={formData.type_ || ''} onChange={(e) => setFormData({...formData, type_: e.target.value})}>
                    {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </FormSelect>
                  <FormSelect label="Status" value={formData.status || ''} onChange={(e) => setFormData({...formData, status: e.target.value})}>
                    {statusOptions.map(s => <option key={s} value={s}>{EQUIPMENT_STATUSES[s].label}</option>)}
                  </FormSelect>
                  <FormInput label="Quantity" type="number" min="1" value={formData.quantity || 1} onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 1})} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <FormInput label="Unit" value={formData.unit || ''} onChange={(e) => setFormData({...formData, unit: e.target.value})} />
                  <FormInput label="Model" value={formData.model || ''} onChange={(e) => setFormData({...formData, model: e.target.value})} />
                  <FormInput label="Serial Number" value={formData.serial_number || ''} onChange={(e) => setFormData({...formData, serial_number: e.target.value})} />
                  <FormInput label="Manufacturer" value={formData.manufacturer || ''} onChange={(e) => setFormData({...formData, manufacturer: e.target.value})} />
                  <FormInput label="Purchase Date" type="date" value={formData.purchase_date || ''} onChange={(e) => setFormData({...formData, purchase_date: e.target.value})} />
                  <FormInput label="Warranty Until" type="date" value={formData.warranty_until || ''} onChange={(e) => setFormData({...formData, warranty_until: e.target.value})} />
                </div>
                <FormInput label="Location" value={formData.location || ''} onChange={(e) => setFormData({...formData, location: e.target.value})} />
                <FormTextarea label="Description" value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} />
              </div>
              <div>
                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#374151', fontSize: '0.875rem', fontWeight: '600' }}>Photo</h4>
                  {existingImage && !newPhoto && (
                    <div style={{ marginBottom: '1rem' }}>
                      <img src={existingImage} alt="Current" style={{ width: '100%', maxWidth: '150px', borderRadius: '8px' }} />
                      <p style={{ fontSize: '0.75rem', color: '#718096', margin: '0.5rem 0 0 0' }}>Current</p>
                    </div>
                  )}
                  <div style={{ border: '2px dashed #d1d5db', borderRadius: '8px', padding: '1rem', textAlign: 'center', background: newPhoto ? '#f0fdf4' : 'white' }}>
                    {newPhoto ? <ImagePreview file={newPhoto} onRemove={() => setNewPhoto(null)} /> : <><i className="fas fa-camera" style={{ fontSize: '1.5rem', color: '#9ca3af' }}></i><p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>{existingImage ? 'Replace' : 'Add'}</p></>}
                    <input type="file" accept="image/*" onChange={(e) => setNewPhoto(e.target.files[0])} style={{ display: newPhoto ? 'none' : 'block', width: '100%', marginTop: '0.5rem', fontSize: '0.75rem' }} />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', marginTop: '1rem' }}>
              <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ==================== PART FORM MODAL ====================

const PartFormModal = ({ equipmentId, part, existingImageUrl, onClose, onSave }) => {
  const [formData, setFormData] = useState(part || { name: '', part_number: '', manufacturer: '', quantity: 1, min_quantity: 0, status: 'good', notes: '' });
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim()) { setError('Part name is required'); return; }
    try {
      setLoading(true); setError('');
      const payload = { name: formData.name.trim(), quantity: parseInt(formData.quantity) || 1, min_quantity: parseInt(formData.min_quantity) || 0, status: formData.status || 'good' };
      ['part_number', 'manufacturer', 'notes'].forEach(k => { if (formData[k]?.trim()) payload[k] = formData[k].trim(); });
      
      if (part) { 
        await api.updateEquipmentPart(equipmentId, part.id, payload);
        if (photo) {
          try { await api.uploadEquipmentFile(equipmentId, photo, { file_type: 'image', description: `Part: ${formData.name.trim()}`, part_id: part.id }); } catch (e) { console.error(e); }
        }
      } else {
        const created = await api.createEquipmentPart(equipmentId, payload);
        if (photo && created?.id) {
          try { await api.uploadEquipmentFile(equipmentId, photo, { file_type: 'image', description: `Part: ${formData.name.trim()}`, part_id: created.id }); } catch (e) { console.error(e); }
        }
      }
      onSave();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '2rem' }}>
      <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#2d3748' }}>{part ? 'Edit Part' : 'Add Part'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#718096' }}><i className="fas fa-times"></i></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem 2rem' }}>
          {error && <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '6px', color: '#dc2626', marginBottom: '1rem' }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '1.5rem' }}>
              <div>
                <FormInput label="Name" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <FormInput label="Part Number" value={formData.part_number} onChange={(e) => setFormData({...formData, part_number: e.target.value})} />
                  <FormInput label="Manufacturer" value={formData.manufacturer} onChange={(e) => setFormData({...formData, manufacturer: e.target.value})} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <FormInput label="Qty" type="number" min="0" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 0})} />
                  <FormInput label="Min" type="number" min="0" value={formData.min_quantity} onChange={(e) => setFormData({...formData, min_quantity: parseInt(e.target.value) || 0})} />
                  <FormSelect label="Status" value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})}>
                    {Object.entries(PART_STATUSES).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                  </FormSelect>
                </div>
                <FormTextarea label="Notes" value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
              </div>
              <div>
                <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', color: '#374151', fontSize: '0.75rem', fontWeight: '600' }}>Photo</h4>
                  {existingImageUrl && !photo && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <img src={existingImageUrl} alt="Current" style={{ width: '100%', maxWidth: '120px', borderRadius: '6px' }} />
                      <p style={{ fontSize: '0.7rem', color: '#718096', margin: '0.25rem 0 0 0' }}>Current</p>
                    </div>
                  )}
                  <div style={{ border: '2px dashed #d1d5db', borderRadius: '8px', padding: '0.75rem', textAlign: 'center', background: photo ? '#f0fdf4' : 'white' }}>
                    {photo ? <ImagePreview file={photo} onRemove={() => setPhoto(null)} /> : <><i className="fas fa-camera" style={{ fontSize: '1.5rem', color: '#9ca3af' }}></i><p style={{ margin: '0.25rem 0 0 0', fontSize: '0.7rem', color: '#6b7280' }}>{existingImageUrl ? 'Replace' : 'Add'}</p></>}
                    <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} style={{ display: photo ? 'none' : 'block', width: '100%', marginTop: '0.5rem', fontSize: '0.7rem' }} />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', marginTop: '1rem' }}>
              <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ==================== MAINTENANCE FORM MODAL ====================

const MaintenanceFormModal = ({ equipmentId, onClose, onSave }) => {
  const [formData, setFormData] = useState({ maintenance_type: 'scheduled', scheduled_date: new Date().toISOString().split('T')[0], description: '', cost: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true); setError('');
      const payload = { maintenance_type: formData.maintenance_type, scheduled_date: formData.scheduled_date };
      if (formData.description?.trim()) payload.description = formData.description.trim();
      if (formData.cost && parseFloat(formData.cost) > 0) payload.cost = parseFloat(formData.cost);
      await api.createMaintenance(equipmentId, payload);
      onSave();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Schedule Maintenance">
      {error && <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '6px', color: '#dc2626', marginBottom: '1rem' }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <FormSelect label="Type" value={formData.maintenance_type} onChange={(e) => setFormData({...formData, maintenance_type: e.target.value})}>
            <option value="scheduled">Scheduled</option><option value="calibration">Calibration</option><option value="repair">Repair</option><option value="inspection">Inspection</option><option value="cleaning">Cleaning</option><option value="part_replacement">Part Replacement</option>
          </FormSelect>
          <FormInput label="Date" required type="date" value={formData.scheduled_date} onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})} />
        </div>
        <FormInput label="Cost" type="number" step="0.01" min="0" value={formData.cost} onChange={(e) => setFormData({...formData, cost: e.target.value})} />
        <FormTextarea label="Description" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={loading}>{loading ? 'Scheduling...' : 'Schedule'}</Button>
        </div>
      </form>
    </Modal>
  );
};

export default Equipment;