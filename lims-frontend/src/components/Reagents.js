// components/ReagentsEnhanced.js - Accordion-only version with improved layout
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import ErrorMessage from './ErrorMessage';
import Loading from './Loading';
import Badge from './Badge';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { CreateReagentModal, EditReagentModal, ViewReagentModal, CreateBatchModal, EditBatchModal, UsageHistoryModal } from './Modals';
import BatchImportModal from './BatchImportModal';

// ==================== Accordion Styles ====================
const accordionStyles = {
  container: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    overflow: 'hidden',
    marginBottom: '8px',
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#f8fafc',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background-color 0.2s',
    gap: '12px'
  },
  headerHover: {
    backgroundColor: '#f1f5f9'
  },
  expandIcon: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    transition: 'transform 0.2s',
    flexShrink: 0
  },
  reagentInfo: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 80px 1fr 1fr 1fr 100px',
    gap: '12px',
    alignItems: 'center'
  },
  reagentName: {
    fontWeight: '600',
    color: '#1e293b',
    fontSize: '0.95rem'
  },
  reagentField: {
    color: '#64748b',
    fontSize: '0.875rem'
  },
  batchesContainer: {
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    padding: '16px',
    animation: 'slideDown 0.2s ease-out'
  },
  batchesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  batchesTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#475569'
  },
  batchCard: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#fff',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    marginBottom: '8px',
    alignItems: 'center'
  },
  batchField: {
    fontSize: '0.875rem'
  },
  batchLabel: {
    color: '#94a3b8',
    fontSize: '0.75rem',
    marginBottom: '2px'
  },
  batchValue: {
    color: '#334155',
    fontWeight: '500'
  },
  noBatches: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: '20px',
    fontSize: '0.875rem'
  },
  expiryWarning: {
    color: '#f59e0b',
    fontWeight: '500'
  },
  expiryDanger: {
    color: '#ef4444',
    fontWeight: '500'
  },
  expiryOk: {
    color: '#10b981'
  }
};

// ==================== ReagentAccordionItem Component ====================
const ReagentAccordionItem = ({ 
  reagent, 
  isExpanded, 
  onToggle, 
  onAction, 
  onBatchAction,
  onReagentsRefresh,
  canEdit,
  canDelete 
}) => {
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [showEditBatch, setShowEditBatch] = useState(false);
  const [showUsageHistory, setShowUsageHistory] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);

  // Load batches when expanded
  useEffect(() => {
    if (isExpanded && batches.length === 0) {
      loadBatches();
    }
  }, [isExpanded]);

  const loadBatches = async () => {
    setLoadingBatches(true);
    try {
      const data = await api.getReagentBatches(reagent.id);
      setBatches(Array.isArray(data) ? data : (data.data || []));
    } catch (err) {
      console.error('Failed to load batches:', err);
      setBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleBatchCreated = () => {
    setShowCreateBatch(false);
    loadBatches();
    // Обновляем реагенты для правильных агрегированных данных
    if (onReagentsRefresh) {
      onReagentsRefresh();
    }
  };

  const handleBatchUpdated = () => {
    setShowEditBatch(false);
    setSelectedBatch(null);
    loadBatches();
    // Обновляем реагенты для правильных агрегированных данных
    if (onReagentsRefresh) {
      onReagentsRefresh();
    }
  };

  const handleDeleteBatch = async (batch) => {
    if (window.confirm(`Delete batch "${batch.batch_number}"?`)) {
      try {
        console.log('Deleting batch:', batch.reagent_id, batch.id);
        await api.deleteBatch(batch.reagent_id, batch.id);
        loadBatches();
        // Обновляем реагенты для правильных агрегированных данных
        if (onReagentsRefresh) {
          onReagentsRefresh();
        }
      } catch (err) {
        console.error('Failed to delete batch:', err);
        alert(err.message || 'Failed to delete batch');
      }
    }
  };

  const getExpiryStatus = (expiryDate) => {
    if (!expiryDate) return { style: {}, text: 'N/A' };
    
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      return { style: accordionStyles.expiryDanger, text: `Expired ${Math.abs(daysUntilExpiry)}d ago` };
    } else if (daysUntilExpiry <= 30) {
      return { style: accordionStyles.expiryWarning, text: `${daysUntilExpiry}d left` };
    } else {
      return { style: accordionStyles.expiryOk, text: expiry.toLocaleDateString() };
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      'available': 'success',
      'reserved': 'warning', 
      'depleted': 'danger',
      'expired': 'danger'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  return (
    <div style={accordionStyles.container}>
      {/* Accordion Header */}
      <div 
        style={{
          ...accordionStyles.header,
          ...(isHovered ? accordionStyles.headerHover : {})
        }}
        onClick={onToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={{
          ...accordionStyles.expandIcon,
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
        }}>
          ▶
        </div>
        
        <div style={accordionStyles.reagentInfo}>
          <div style={accordionStyles.reagentName}>{reagent.name}</div>
          <div style={accordionStyles.reagentField}>{reagent.formula || '—'}</div>
          <div style={accordionStyles.reagentField}>
            {reagent.molecular_weight ? `${reagent.molecular_weight} g/mol` : '—'}
          </div>
          <div style={accordionStyles.reagentField}>{reagent.cas_number || '—'}</div>
          <div style={accordionStyles.reagentField}>{reagent.manufacturer || '—'}</div>
          <div>
            <Badge
              variant={
                reagent.status === 'active' ? 'success' :
                reagent.status === 'inactive' ? 'warning' : 'danger'
              }
            >
              {reagent.status || 'Unknown'}
            </Badge>
          </div>
          <div style={{
            ...accordionStyles.reagentField,
            color: reagent.total_display === 'No stock' ? '#ef4444' : '#10b981',
            fontWeight: '500'
          }}>
            {reagent.total_display || 'N/A'}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="secondary" onClick={() => onAction('view', reagent)}>
            Details
          </Button>
          {canEdit && (
            <Button size="sm" variant="primary" onClick={() => onAction('edit', reagent)}>
              Edit
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="danger" onClick={() => onAction('delete', reagent)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Batches Section */}
      {isExpanded && (
        <div style={accordionStyles.batchesContainer}>
          <div style={accordionStyles.batchesHeader}>
            <span style={accordionStyles.batchesTitle}>
              Batches ({batches.length})
            </span>
            <Button size="sm" variant="primary" onClick={() => setShowCreateBatch(true)}>
              + Add Batch
            </Button>
          </div>

          {loadingBatches ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Loading />
            </div>
          ) : batches.length === 0 ? (
            <div style={accordionStyles.noBatches}>
              No batches found. Click "+ Add Batch" to create the first batch.
            </div>
          ) : (
            <div>
              {/* Batch table header */}
              <div style={{
                ...accordionStyles.batchCard,
                backgroundColor: '#f1f5f9',
                fontWeight: '600',
                fontSize: '0.75rem',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                <div>Batch #</div>
                <div>Quantity</div>
                <div>Status</div>
                <div>Expiry Date</div>
                <div>Location</div>
                <div>Actions</div>
              </div>
              
              {batches.map(batch => {
                const expiryStatus = getExpiryStatus(batch.expiry_date);
                return (
                  <div key={batch.id} style={accordionStyles.batchCard}>
                    <div style={accordionStyles.batchValue}>{batch.batch_number}</div>
                    <div style={accordionStyles.batchValue}>
                      {batch.quantity} {batch.unit}
                      {batch.reserved_quantity > 0 && (
                        <span style={{ color: '#f59e0b', fontSize: '0.75rem', marginLeft: '4px' }}>
                          ({batch.reserved_quantity} reserved)
                        </span>
                      )}
                    </div>
                    <div>{getStatusBadge(batch.status)}</div>
                    <div style={expiryStatus.style}>{expiryStatus.text}</div>
                    <div style={accordionStyles.batchField}>{batch.location || '—'}</div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => {
                          setSelectedBatch(batch);
                          setShowUsageHistory(true);
                        }}
                      >
                        Use
                      </Button>
                      {canEdit && (
                        <Button 
                          size="sm" 
                          variant="primary"
                          onClick={() => {
                            setSelectedBatch(batch);
                            setShowEditBatch(true);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button 
                          size="sm" 
                          variant="danger"
                          onClick={() => handleDeleteBatch(batch)}
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Batch Modals */}
      {showCreateBatch && (
        <CreateBatchModal
          isOpen={showCreateBatch}
          reagentId={reagent.id}
          onClose={() => setShowCreateBatch(false)}
          onSave={handleBatchCreated}
        />
      )}

      {showEditBatch && selectedBatch && (
        <EditBatchModal
          isOpen={showEditBatch}
          batch={selectedBatch}
          reagentId={reagent.id}
          onClose={() => {
            setShowEditBatch(false);
            setSelectedBatch(null);
          }}
          onSave={handleBatchUpdated}
        />
      )}

      {showUsageHistory && selectedBatch && (
        <UsageHistoryModal
          isOpen={showUsageHistory}
          reagentId={selectedBatch.reagent_id}
          batchId={selectedBatch.id}
          onClose={() => {
            setShowUsageHistory(false);
            setSelectedBatch(null);
            loadBatches(); // Reload to get updated quantities
          }}
          onSave={() => {
            loadBatches();
            if (onReagentsRefresh) {
              onReagentsRefresh();
            }
          }}
        />
      )}
    </div>
  );
};

// ==================== Main ReagentsEnhanced Component ====================
const ReagentsEnhanced = ({ user }) => {
  const [reagents, setReagents] = useState([]);
  const [allBatches, setAllBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Expanded reagents for accordion view
  const [expandedReagents, setExpandedReagents] = useState(new Set());
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [casNumberFilter, setCasNumberFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Manufacturers list for filter
  const [manufacturers, setManufacturers] = useState([]);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedReagent, setSelectedReagent] = useState(null);
  const [loadingReagentDetail, setLoadingReagentDetail] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Show/hide advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    loadReagents();
    loadAllBatches();
  }, [currentPage, statusFilter, manufacturerFilter, casNumberFilter, stockFilter, sortBy, sortOrder]);

  useEffect(() => {
    loadManufacturers();
  }, []);

  // Debounce for search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage === 1) {
        loadReagents();
      } else {
        setCurrentPage(1);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadManufacturers = async () => {
    try {
      const data = await api.getReagents();
      const allReagents = Array.isArray(data) ? data : (data.data || []);
      
      const uniqueManufacturers = [...new Set(
        allReagents
          .map(r => r.manufacturer)
          .filter(m => m && m.trim() !== '')
      )].sort();
      
      setManufacturers(uniqueManufacturers);
    } catch (err) {
      console.error('Failed to load manufacturers:', err);
    }
  };

  const loadAllBatches = async () => {
    try {
      const response = await api.getAllBatches({ per_page: 1000 });
      const batches = Array.isArray(response) ? response : (response.data || []);
      setAllBatches(batches);
    } catch (err) {
      console.error('Failed to load batches:', err);
      setAllBatches([]);
    }
  };

  const loadReagents = async () => {
    try {
      setError('');
      setLoading(true);
      
      const params = {
        page: currentPage,
        per_page: 20,
      };

      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }
      
      if (statusFilter) {
        params.status = statusFilter;
      }
      
      if (manufacturerFilter) {
        params.manufacturer = manufacturerFilter;
      }
      
      if (casNumberFilter.trim()) {
        params.cas_number = casNumberFilter.trim();
      }
      
      if (stockFilter === 'in_stock') {
        params.has_stock = true;
      } else if (stockFilter === 'out_of_stock') {
        params.has_stock = false;
      }
      
      if (sortBy) {
        params.sort_by = sortBy;
        params.sort_order = sortOrder;
      }

      const response = await api.getReagents(params);
      
      if (response && response.data) {
        setReagents(response.data);
        setTotalItems(response.total || response.data.length);
        setTotalPages(response.total_pages || Math.ceil((response.total || response.data.length) / 20));
      } else if (Array.isArray(response)) {
        setReagents(response);
        setTotalItems(response.length);
        setTotalPages(1);
      } else {
        setReagents([]);
        setTotalItems(0);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Failed to load reagents:', err);
      setError('Failed to load reagents. Please try again.');
      setReagents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action, reagent) => {
    switch (action) {
      case 'view':
        setLoadingReagentDetail(true);
        setSelectedReagent(reagent);
        setShowViewModal(true);
        try {
          const detailed = await api.getReagentById(reagent.id);
          setSelectedReagent(detailed.data || detailed);
        } catch (err) {
          console.error('Failed to load reagent details:', err);
        } finally {
          setLoadingReagentDetail(false);
        }
        break;
      case 'edit':
        setSelectedReagent(reagent);
        setShowEditModal(true);
        break;
      case 'delete':
        if (window.confirm(`Are you sure you want to delete "${reagent.name}"?`)) {
          try {
            await api.deleteReagent(reagent.id);
            loadReagents();
          } catch (err) {
            setError(`Failed to delete reagent: ${err.message}`);
          }
        }
        break;
      default:
        break;
    }
  };

  const handleExport = async () => {
    try {
      const blob = await api.exportReagents();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reagents_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    }
  };

  const handleImport = async (file, options) => {
    try {
      await api.importReagents(file, options);
      loadReagents();
      loadAllBatches();
      setShowImportModal(false);
    } catch (err) {
      throw err;
    }
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    loadReagents();
    loadManufacturers();
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    setSelectedReagent(null);
    loadReagents();
    loadManufacturers();
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setManufacturerFilter('');
    setCasNumberFilter('');
    setStockFilter('');
    setSortBy('created_at');
    setSortOrder('desc');
    setCurrentPage(1);
  };

  const canEditReagents = () => {
    return user && ['Admin', 'Researcher'].includes(user.role);
  };

  const canCreateReagents = () => {
    return user && ['Admin', 'Researcher'].includes(user.role);
  };

  const handleViewClose = () => {
    setShowViewModal(false);
    setSelectedReagent(null);
  };

  const handleViewSave = async () => {
    loadReagents();
    handleViewClose();
  };

  // Toggle accordion item
  const toggleAccordion = (reagentId) => {
    setExpandedReagents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(reagentId)) {
        newSet.delete(reagentId);
      } else {
        newSet.add(reagentId);
      }
      return newSet;
    });
  };

  // Expand/collapse all
  const expandAll = () => {
    setExpandedReagents(new Set(reagents.map(r => r.id)));
  };

  const collapseAll = () => {
    setExpandedReagents(new Set());
  };

  // Count active filters
  const activeFiltersCount = [
    searchTerm,
    statusFilter,
    manufacturerFilter,
    casNumberFilter,
    stockFilter
  ].filter(f => f && f !== '').length;

  return (
    <div style={{ padding: '20px', marginTop: '60px' }}>
      {/* Header with Title and Actions - AT TOP */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        <h2 style={{ margin: 0 }}>Reagents Management</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={handleExport} disabled={loading}>
            Export
          </Button>
          <Button variant="secondary" onClick={() => setShowImportModal(true)}>
            Import
          </Button>
          {canCreateReagents() && (
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              + Add Reagent
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorMessage message={error} onDismiss={() => setError('')} />}

      {/* Search and Filters */}
      <div style={{ 
        marginBottom: '20px', 
        padding: '15px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '250px' }}>
            <Input
              type="text"
              placeholder="Search reagents by name, formula, CAS..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button 
            variant="secondary" 
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          >
            {showAdvancedFilters ? 'Hide Filters' : 'Show Filters'} 
            {activeFiltersCount > 0 && ` (${activeFiltersCount})`}
          </Button>
          {activeFiltersCount > 0 && (
            <Button variant="danger" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          )}
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div style={{ 
            marginTop: '15px', 
            paddingTop: '15px', 
            borderTop: '1px solid #dee2e6' 
          }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#495057' }}>
              Advanced Filters
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  Status
                </label>
                <Select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="discontinued">Discontinued</option>
                </Select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  Manufacturer
                </label>
                <Select
                  value={manufacturerFilter}
                  onChange={(e) => {
                    setManufacturerFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">All Manufacturers</option>
                  {manufacturers.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  Stock Status
                </label>
                <Select
                  value={stockFilter}
                  onChange={(e) => {
                    setStockFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">All</option>
                  <option value="in_stock">In Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                </Select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  CAS Number
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 7732-18-5"
                  value={casNumberFilter}
                  onChange={(e) => setCasNumberFilter(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  Sort By
                </label>
                <Select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="created_at">Date Added</option>
                  <option value="name">Name</option>
                  <option value="manufacturer">Manufacturer</option>
                </Select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  Sort Order
                </label>
                <Select
                  value={sortOrder}
                  onChange={(e) => {
                    setSortOrder(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search Results Summary */}
      <div style={{ 
        marginBottom: '15px', 
        color: '#6c757d',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>
          Showing {reagents.length} of {totalItems} reagents
          {activeFiltersCount > 0 && ` (${activeFiltersCount} filter${activeFiltersCount > 1 ? 's' : ''} active)`}
        </span>
        
        {reagents.length > 0 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" variant="secondary" onClick={expandAll}>
              Expand All
            </Button>
            <Button size="sm" variant="secondary" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        )}
      </div>

      {/* Reagents Display - Accordion Only */}
      <div className="reagents-content">
        {loading ? (
          <Loading />
        ) : (
          <div>
            {/* Accordion Header */}
            <div style={{
              display: 'flex',
              padding: '12px 16px',
              backgroundColor: '#e2e8f0',
              borderRadius: '8px 8px 0 0',
              fontWeight: '600',
              fontSize: '0.75rem',
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '2px',
              gap: '12px'
            }}>
              <div style={{ width: '32px' }}></div>
              <div style={{ 
                flex: 1, 
                display: 'grid', 
                gridTemplateColumns: '2fr 1fr 80px 1fr 1fr 1fr 100px',
                gap: '12px'
              }}>
                <div>Name</div>
                <div>Formula</div>
                <div>MW</div>
                <div>CAS Number</div>
                <div>Manufacturer</div>
                <div>Status</div>
                <div>Stock</div>
              </div>
              <div style={{ width: '200px' }}>Actions</div>
            </div>

            {reagents.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px', 
                color: '#94a3b8',
                backgroundColor: '#f8fafc',
                borderRadius: '0 0 8px 8px'
              }}>
                {activeFiltersCount > 0
                  ? "No reagents match your search criteria. Try adjusting your filters."
                  : "No reagents found. Click '+ Add Reagent' to create your first reagent."}
              </div>
            ) : (
              reagents.map(reagent => (
                <ReagentAccordionItem
                  key={reagent.id}
                  reagent={reagent}
                  isExpanded={expandedReagents.has(reagent.id)}
                  onToggle={() => toggleAccordion(reagent.id)}
                  onAction={handleAction}
                  onReagentsRefresh={loadReagents}
                  canEdit={canEditReagents()}
                  canDelete={user?.role === 'Admin'}
                />
              ))
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            marginTop: '20px',
            padding: '10px'
          }}>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span style={{ margin: '0 15px' }}>
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateReagentModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateSuccess}
        />
      )}

      {showEditModal && selectedReagent && (
        <EditReagentModal
          isOpen={showEditModal}
          reagent={selectedReagent}
          onClose={() => {
            setShowEditModal(false);
            setSelectedReagent(null);
          }}
          onSave={handleEditSuccess}
        />
      )}

      {showViewModal && selectedReagent && (
        <ViewReagentModal
          isOpen={showViewModal}
          onClose={handleViewClose}
          reagent={selectedReagent}
          onSave={handleViewSave}
          loading={loadingReagentDetail}
        />
      )}

      {showImportModal && (
        <BatchImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
          existingReagents={reagents}
          existingBatches={allBatches}
        />
      )}
    </div>
  );
};

export default ReagentsEnhanced;