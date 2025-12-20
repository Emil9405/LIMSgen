// components/Reports.js - Full-featured Reports with Filters & Columns
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import ErrorMessage from './ErrorMessage';
import Loading from './Loading';
import Table from './Table';
import Badge from './Badge';
import Button from './Button';
import Select from './Select';
import Input from './Input';

const Reports = ({ user }) => {
  // State
  const [activeReport, setActiveReport] = useState('low_stock');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState([]);
  const [reportMetadata, setReportMetadata] = useState(null);
  
  // Preset parameters
  const [threshold, setThreshold] = useState(10);
  const [expiringDays, setExpiringDays] = useState(30);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  // Search and sort
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');

  // Columns & Filters from backend
  const [availableColumns, setAvailableColumns] = useState([]);
  const [availableFields, setAvailableFields] = useState([
    // Default fields - will be replaced by API response
    { field: 'status', label: 'Status', data_type: 'enum', operators: ['eq', 'ne', 'in'], values: ['available', 'reserved', 'expired', 'depleted'] },
    { field: 'quantity', label: 'Quantity', data_type: 'number', operators: ['eq', 'gt', 'gte', 'lt', 'lte'] },
    { field: 'expiry_date', label: 'Expiry Date', data_type: 'date', operators: ['eq', 'gt', 'lt', 'is_null'] },
    { field: 'location', label: 'Location', data_type: 'text', operators: ['eq', 'like', 'is_null'] },
    { field: 'supplier', label: 'Supplier', data_type: 'text', operators: ['eq', 'like'] },
    { field: 'days_until_expiry', label: 'Days Until Expiry', data_type: 'number', operators: ['eq', 'gt', 'gte', 'lt', 'lte'] },
  ]);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [activeFilters, setActiveFilters] = useState([]);
  
  // UI toggles
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  
  // New filter form
  const [newFilter, setNewFilter] = useState({ field: '', operator: '', value: '' });
  const [fieldValues, setFieldValues] = useState({});

  // Report presets
  const reportPresets = [
    { value: 'low_stock', label: '📉 Low Stock', description: 'Batches with quantity below threshold' },
    { value: 'expiring_soon', label: '⏰ Expiring Soon', description: 'Batches expiring within specified days' },
    { value: 'expired', label: '❌ Expired', description: 'Batches that have expired' },
    { value: 'all_batches', label: '📋 All Batches', description: 'Complete list of all batches' },
    { value: 'custom', label: '🔧 Custom', description: 'Build your own report with filters' },
  ];

  // Operator display names
  const operatorLabels = {
    eq: '= equals',
    ne: '≠ not equals',
    gt: '> greater than',
    gte: '≥ greater or equal',
    lt: '< less than',
    lte: '≤ less or equal',
    like: '~ contains',
    in: '∈ in list',
    not_in: '∉ not in list',
    is_null: '∅ is empty',
    is_not_null: '✓ is not empty',
  };

  const operatorShortLabels = {
    eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤',
    like: '~', in: '∈', not_in: '∉', is_null: '∅', is_not_null: '✓',
  };

  // Load metadata from backend on mount
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        // Load available fields for filtering
        console.log('Loading report fields...');
        const fieldsResponse = await api.getReportFields();
        console.log('Fields response:', fieldsResponse);
        const fields = fieldsResponse?.data || fieldsResponse || [];
        console.log('Parsed fields:', fields);
        if (fields.length > 0) {
          setAvailableFields(fields);
        } else {
          console.warn('No fields returned from API, using defaults');
        }

        // Load available columns
        console.log('Loading report columns...');
        const columnsResponse = await api.getReportColumns();
        console.log('Columns response:', columnsResponse);
        const columns = columnsResponse?.data || columnsResponse || [];
        console.log('Parsed columns:', columns);
        if (columns.length > 0) {
          setAvailableColumns(columns);
          
          // Set default visible columns
          const defaultVisible = columns
            .filter(c => c.visible !== false)
            .map(c => c.field);
          setVisibleColumns(defaultVisible.length > 0 ? defaultVisible : [
            'reagent_name', 'batch_number', 'quantity', 'expiry_date', 'status', 'location'
          ]);
        }
      } catch (err) {
        console.error('Failed to load report metadata:', err);
        // Use defaults
        setAvailableFields([
          { field: 'status', label: 'Status', data_type: 'enum', operators: ['eq', 'ne', 'in'], values: ['available', 'reserved', 'expired', 'depleted'] },
          { field: 'quantity', label: 'Quantity', data_type: 'number', operators: ['eq', 'gt', 'gte', 'lt', 'lte'] },
          { field: 'expiry_date', label: 'Expiry Date', data_type: 'date', operators: ['eq', 'gt', 'lt', 'is_null'] },
          { field: 'location', label: 'Location', data_type: 'text', operators: ['eq', 'like', 'is_null'] },
          { field: 'supplier', label: 'Supplier', data_type: 'text', operators: ['eq', 'like'] },
          { field: 'days_until_expiry', label: 'Days Until Expiry', data_type: 'number', operators: ['gt', 'gte', 'lt', 'lte'] },
        ]);
        setAvailableColumns([
          { field: 'reagent_name', label: 'Reagent', data_type: 'text', visible: true, sortable: true },
          { field: 'batch_number', label: 'Batch #', data_type: 'text', visible: true, sortable: true },
          { field: 'quantity', label: 'Quantity', data_type: 'number', visible: true, sortable: true },
          { field: 'unit', label: 'Unit', data_type: 'text', visible: false, sortable: false },
          { field: 'expiry_date', label: 'Expiry Date', data_type: 'date', visible: true, sortable: true },
          { field: 'days_until_expiry', label: 'Days Left', data_type: 'number', visible: true, sortable: true },
          { field: 'status', label: 'Status', data_type: 'enum', visible: true, sortable: true },
          { field: 'location', label: 'Location', data_type: 'text', visible: true, sortable: true },
          { field: 'supplier', label: 'Supplier', data_type: 'text', visible: false, sortable: true },
          { field: 'manufacturer', label: 'Manufacturer', data_type: 'text', visible: false, sortable: true },
          { field: 'cat_number', label: 'Cat #', data_type: 'text', visible: false, sortable: true },
          { field: 'received_date', label: 'Received', data_type: 'date', visible: false, sortable: true },
          { field: 'notes', label: 'Notes', data_type: 'text', visible: false, sortable: false },
        ]);
        setVisibleColumns(['reagent_name', 'batch_number', 'quantity', 'expiry_date', 'status', 'location']);
      }
    };
    loadMetadata();
  }, []);

  // Load field values when needed
  const loadFieldValues = async (field) => {
    if (fieldValues[field]) return;
    try {
      const response = await api.getReportFieldValues(field);
      const values = response?.data || response || [];
      setFieldValues(prev => ({ ...prev, [field]: values }));
    } catch (err) {
      console.warn(`Failed to load values for ${field}:`, err);
    }
  };

  // Load report data
  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      // Build request
      const presetParams = {};
      if (activeReport === 'low_stock') {
        presetParams.threshold = threshold;
      } else if (activeReport === 'expiring_soon') {
        presetParams.days = expiringDays;
      }

      const requestBody = {
        preset: activeReport,
        preset_params: presetParams,
        page,
        per_page: perPage,
        sort_by: sortBy,
        sort_order: sortOrder,
        search: searchTerm || undefined,
        columns: visibleColumns,
        // FIX #1B: Конвертируем строки в числа для числовых полей
        filters: activeFilters.map(f => {
          const fieldDef = availableFields.find(af => af.field === f.field);
          let value = f.value;
          
          // Конвертируем строку в число для числовых полей и операторов
          if (fieldDef?.data_type === 'number' && typeof value === 'string') {
            const num = parseFloat(value);
            if (!isNaN(num)) {
              value = num;
            }
          }
          
          return {
            field: f.field,
            operator: f.operator,
            value,
          };
        }),
      };

      const response = await api.generateReport(requestBody);
      
      if (response && response.data) {
        setReportData(response.data);
        setReportMetadata(response.metadata);
        if (response.pagination) {
          setTotalPages(response.pagination.total_pages || 1);
          setTotalItems(response.pagination.total || 0);
        }
      } else if (Array.isArray(response)) {
        setReportData(response);
        setTotalItems(response.length);
      } else {
        setReportData([]);
      }
    } catch (err) {
      console.error('Failed to load report:', err);
      setError(err.message || 'Failed to load report');
      setReportData([]);
    } finally {
      setLoading(false);
    }
  }, [activeReport, threshold, expiringDays, page, perPage, sortBy, sortOrder, searchTerm, visibleColumns, activeFilters, availableFields]);

  // Load on mount and when dependencies change
  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Reset page when changing filters
  useEffect(() => {
    setPage(1);
  }, [activeReport, searchTerm, threshold, expiringDays, activeFilters]);

  // Add filter
  const addFilter = () => {
    if (!newFilter.field || !newFilter.operator) return;
    
    const filterToAdd = {
      ...newFilter,
      id: Date.now(),
      value: ['is_null', 'is_not_null'].includes(newFilter.operator) ? true : newFilter.value,
    };
    setActiveFilters(prev => [...prev, filterToAdd]);
    setNewFilter({ field: '', operator: '', value: '' });
  };

  // Remove filter
  const removeFilter = (id) => {
    setActiveFilters(prev => prev.filter(f => f.id !== id));
  };

  // Toggle column
  const toggleColumn = (field) => {
    setVisibleColumns(prev =>
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  // Handle sort
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  // Export CSV
  const exportToCSV = async () => {
    if (!reportData || reportData.length === 0) {
      alert('No data to export');
      return;
    }

    try {
      // Try server-side export first
      const presetParams = {};
      if (activeReport === 'low_stock') presetParams.threshold = threshold;
      if (activeReport === 'expiring_soon') presetParams.days = expiringDays;

      const response = await api.exportReportCSV({
        preset: activeReport,
        preset_params: presetParams,
        filters: activeFilters,
      });

      const blob = new Blob([response], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${activeReport}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback to client-side
      const headers = visibleColumns.map(f => {
        const col = availableColumns.find(c => c.field === f);
        return col?.label || f;
      });
      
      const rows = reportData.map(item =>
        visibleColumns.map(f => {
          let val = item[f];
          if (f.includes('date') && val) val = new Date(val).toLocaleDateString();
          return val ?? '';
        })
      );

      const csvContent = [headers.join(','), ...rows.map(r => 
        r.map(c => typeof c === 'string' && (c.includes(',') || c.includes('"')) 
          ? `"${c.replace(/"/g, '""')}"` : c
        ).join(',')
      )].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${activeReport}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Get status badge variant
  const getStatusVariant = (item) => {
    if (item.days_until_expiry !== null && item.days_until_expiry !== undefined) {
      if (item.days_until_expiry < 0) return 'danger';
      if (item.days_until_expiry < 7) return 'danger';
      if (item.days_until_expiry < 30) return 'warning';
    }
    if (item.status === 'expired') return 'danger';
    if (item.status === 'depleted') return 'secondary';
    if (item.status === 'reserved') return 'warning';
    return 'success';
  };

  // Render cell
  const renderCell = (item, field) => {
    const value = item[field];
    
    switch (field) {
      case 'quantity':
        return (
          <span style={{ 
            color: value < 10 ? '#e53e3e' : value < 20 ? '#dd6b20' : 'inherit',
            fontWeight: value < 10 ? 'bold' : 'normal'
          }}>
            {value} {item.unit || ''}
          </span>
        );
      case 'expiry_date':
        if (!value) return <span style={{ color: '#a0aec0' }}>—</span>;
        const date = new Date(value);
        const days = item.days_until_expiry;
        return (
          <div>
            <div>{date.toLocaleDateString()}</div>
            {days !== null && days !== undefined && (
              <small style={{ 
                color: days < 0 ? '#e53e3e' : days < 7 ? '#e53e3e' : days < 30 ? '#dd6b20' : '#718096' 
              }}>
                {days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`}
              </small>
            )}
          </div>
        );
      case 'days_until_expiry':
        if (value === null || value === undefined) return '—';
        return (
          <span style={{ 
            color: value < 0 ? '#e53e3e' : value < 7 ? '#e53e3e' : value < 30 ? '#dd6b20' : 'inherit',
            fontWeight: value < 7 ? 'bold' : 'normal'
          }}>
            {value}
          </span>
        );
      case 'status':
        return (
          <Badge variant={getStatusVariant(item)}>
            {item.expiration_status === 'expired' ? 'Expired' :
             item.expiration_status === 'critical' ? 'Critical' :
             item.expiration_status === 'warning' ? 'Warning' :
             value || 'Available'}
          </Badge>
        );
      case 'received_date':
        return value ? new Date(value).toLocaleDateString() : '—';
      default:
        return value || '—';
    }
  };

  // Build table columns
  const tableColumns = visibleColumns.map(field => {
    const col = availableColumns.find(c => c.field === field) || { field, label: field };
    return {
      key: field,
      label: col.label,
      sortable: col.sortable !== false,
      render: (item) => renderCell(item, field),
    };
  });

  // Get current field config
  const currentFieldConfig = availableFields.find(f => f.field === newFilter.field);

  return (
    <div style={{ 
      padding: '1.5rem',
      marginTop: '70px', // Отступ от header
      minHeight: 'calc(100vh - 70px)',
      backgroundColor: '#f7fafc'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem',
        backgroundColor: '#fff',
        padding: '1rem 1.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#2d3748' }}>📊 Reports</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button 
            variant={showFiltersPanel ? 'primary' : 'secondary'}
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
          >
            🔍 Filters {activeFilters.length > 0 && `(${activeFilters.length})`}
          </Button>
          <Button 
            variant={showColumnsPanel ? 'primary' : 'secondary'}
            onClick={() => setShowColumnsPanel(!showColumnsPanel)}
          >
            📋 Columns
          </Button>
          <Button onClick={loadReport} disabled={loading}>🔄 Refresh</Button>
          <Button onClick={exportToCSV} disabled={loading || !reportData.length}>📥 Export</Button>
        </div>
      </div>

      {/* Presets */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '1rem',
        flexWrap: 'wrap',
        backgroundColor: '#fff',
        padding: '1rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        {reportPresets.map(preset => (
          <Button
            key={preset.value}
            variant={activeReport === preset.value ? 'primary' : 'secondary'}
            onClick={() => {
              setActiveReport(preset.value);
              if (preset.value === 'custom') setShowFiltersPanel(true);
            }}
            title={preset.description}
            style={{ minWidth: '120px' }}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Filters Panel */}
      {showFiltersPanel && (
        <div style={{ 
          backgroundColor: '#fff',
          padding: '1rem',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '1rem'
        }}>
          <h4 style={{ margin: '0 0 1rem 0', color: '#4a5568' }}>🔍 Filter Builder</h4>
          
          {/* Debug info - remove in production */}
          {availableFields.length === 0 && (
            <div style={{ padding: '0.5rem', backgroundColor: '#fff3cd', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
              ⚠️ No filter fields loaded. Check console for errors.
            </div>
          )}
          
          {/* Add new filter */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
            <div style={{ minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#718096', marginBottom: '0.25rem' }}>Field ({availableFields.length} available)</label>
              {/* Using native select as fallback for debugging */}
              <select
                value={newFilter.field}
                onChange={(e) => {
                  const field = e.target.value;
                  console.log('Selected field:', field);
                  setNewFilter({ field, operator: '', value: '' });
                  if (field) loadFieldValues(field);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.875rem',
                  backgroundColor: '#fff'
                }}
              >
                <option value="">Select field...</option>
                {availableFields.map(f => (
                  <option key={f.field} value={f.field}>{f.label}</option>
                ))}
              </select>
            </div>

            {newFilter.field && currentFieldConfig && (
              <div style={{ minWidth: '160px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#718096', marginBottom: '0.25rem' }}>Operator</label>
                <select
                  value={newFilter.operator}
                  onChange={(e) => {
                    console.log('Selected operator:', e.target.value);
                    setNewFilter(prev => ({ ...prev, operator: e.target.value, value: '' }));
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.875rem',
                    backgroundColor: '#fff'
                  }}
                >
                  <option value="">Select...</option>
                  {currentFieldConfig.operators.map(op => (
                    <option key={op} value={op}>{operatorLabels[op] || op}</option>
                  ))}
                </select>
              </div>
            )}

            {newFilter.field && newFilter.operator && !['is_null', 'is_not_null'].includes(newFilter.operator) && (
              <div style={{ minWidth: '200px', flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#718096', marginBottom: '0.25rem' }}>Value</label>
                {currentFieldConfig?.values || fieldValues[newFilter.field] ? (
                  <select
                    value={newFilter.value}
                    onChange={(e) => {
                      console.log('Selected value:', e.target.value);
                      setNewFilter(prev => ({ ...prev, value: e.target.value }));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.875rem',
                      backgroundColor: '#fff'
                    }}
                  >
                    <option value="">Select value...</option>
                    {(currentFieldConfig?.values || fieldValues[newFilter.field] || []).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={currentFieldConfig?.data_type === 'number' ? 'number' : 'text'}
                    value={newFilter.value}
                    onChange={(e) => {
                      console.log('Entered value:', e.target.value);
                      setNewFilter(prev => ({ ...prev, value: e.target.value }));
                    }}
                    placeholder="Enter value..."
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.875rem'
                    }}
                  />
                )}
              </div>
            )}

            <button 
              onClick={() => {
                console.log('Adding filter:', newFilter);
                addFilter();
              }}
              disabled={!newFilter.field || !newFilter.operator || (!['is_null', 'is_not_null'].includes(newFilter.operator) && !newFilter.value)}
              style={{ 
                height: '38px',
                padding: '0.5rem 1rem',
                backgroundColor: (!newFilter.field || !newFilter.operator || (!['is_null', 'is_not_null'].includes(newFilter.operator) && !newFilter.value)) ? '#e2e8f0' : '#667eea',
                color: (!newFilter.field || !newFilter.operator || (!['is_null', 'is_not_null'].includes(newFilter.operator) && !newFilter.value)) ? '#a0aec0' : '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: (!newFilter.field || !newFilter.operator || (!['is_null', 'is_not_null'].includes(newFilter.operator) && !newFilter.value)) ? 'not-allowed' : 'pointer',
                fontWeight: '500'
              }}
            >
              ➕ Add
            </button>
          </div>

          {/* Active filters */}
          {activeFilters.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>Active:</span>
              {activeFilters.map(filter => {
                const fieldDef = availableFields.find(f => f.field === filter.field);
                return (
                  <span 
                    key={filter.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      backgroundColor: '#edf2f7',
                      borderRadius: '4px',
                      fontSize: '0.875rem'
                    }}
                  >
                    <strong>{fieldDef?.label || filter.field}</strong>
                    <span style={{ color: '#667eea' }}>{operatorShortLabels[filter.operator]}</span>
                    {!['is_null', 'is_not_null'].includes(filter.operator) && (
                      <span style={{ color: '#38a169' }}>"{filter.value}"</span>
                    )}
                    <button
                      onClick={() => removeFilter(filter.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0 0.25rem',
                        color: '#e53e3e',
                        fontWeight: 'bold'
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              <Button variant="link" onClick={() => setActiveFilters([])}>Clear all</Button>
            </div>
          )}
        </div>
      )}

      {/* Columns Panel */}
      {showColumnsPanel && (
        <div style={{ 
          backgroundColor: '#fff',
          padding: '1rem',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '1rem'
        }}>
          <h4 style={{ margin: '0 0 1rem 0', color: '#4a5568' }}>📋 Select Columns</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {availableColumns.map(col => (
              <label
                key={col.field}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.75rem',
                  backgroundColor: visibleColumns.includes(col.field) ? '#ebf4ff' : '#f7fafc',
                  border: `1px solid ${visibleColumns.includes(col.field) ? '#667eea' : '#e2e8f0'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  transition: 'all 0.15s'
                }}
              >
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(col.field)}
                  onChange={() => toggleColumn(col.field)}
                  style={{ cursor: 'pointer' }}
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Search & Preset Params */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '1rem',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        backgroundColor: '#fff',
        padding: '1rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#718096', marginBottom: '0.25rem' }}>Search</label>
          <Input
            type="text"
            placeholder="Search reagents, batches..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && loadReport()}
          />
        </div>

        {activeReport === 'low_stock' && (
          <div style={{ width: '140px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#718096', marginBottom: '0.25rem' }}>Threshold</label>
            <Input
              type="number"
              min="1"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value) || 10)}
            />
          </div>
        )}

        {activeReport === 'expiring_soon' && (
          <div style={{ width: '140px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#718096', marginBottom: '0.25rem' }}>Days ahead</label>
            <Input
              type="number"
              min="1"
              value={expiringDays}
              onChange={(e) => setExpiringDays(parseInt(e.target.value) || 30)}
            />
          </div>
        )}

        <div style={{ width: '100px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#718096', marginBottom: '0.25rem' }}>Per page</label>
          <Select
            value={perPage}
            onChange={(e) => setPerPage(parseInt(e.target.value))}
            options={[
              { value: 25, label: '25' },
              { value: 50, label: '50' },
              { value: 100, label: '100' },
              { value: 200, label: '200' },
            ]}
          />
        </div>
      </div>

      {/* Error */}
      {error && <ErrorMessage message={error} onDismiss={() => setError('')} />}

      {/* Metadata */}
      {reportMetadata && (
        <div style={{ 
          backgroundColor: '#edf2f7', 
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          fontSize: '0.875rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>{reportMetadata.name}</strong>
            {reportMetadata.description && (
              <span style={{ color: '#718096', marginLeft: '0.5rem' }}>— {reportMetadata.description}</span>
            )}
          </div>
          <span style={{ fontWeight: '600', color: '#4a5568' }}>
            {totalItems} items
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && <Loading message="Loading report..." />}

      {/* Table */}
      {!loading && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <Table
            data={reportData}
            columns={tableColumns}
            onSort={handleSort}
            sortBy={sortBy}
            sortOrder={sortOrder}
            emptyMessage={`No ${reportPresets.find(p => p.value === activeReport)?.label || 'items'} found`}
          />
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          gap: '0.5rem',
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <Button variant="secondary" onClick={() => setPage(1)} disabled={page <= 1}>⏮️</Button>
          <Button variant="secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>◀️</Button>
          <span style={{ padding: '0 1rem', fontWeight: '500' }}>Page {page} of {totalPages}</span>
          <Button variant="secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>▶️</Button>
          <Button variant="secondary" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>⏭️</Button>
        </div>
      )}
    </div>
  );
};

export default Reports;