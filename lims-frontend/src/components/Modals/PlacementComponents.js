// components/modals/PlacementComponents.js
//
// Компоненты для управления размещением батчей по комнатам/полкам
// - BatchPlacementRow: строка размещения
// - PlacementQuickForm: inline-форма для размещения
// - MovePopover: popover перемещения между локациями
// - PlacementSummary: сводка размещений батча

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import Button from '../Button';
import Input from '../Input';
import Select from '../Select';
import FormGroup from '../FormGroup';
import { EditIcon, TrashIcon, CheckIcon, CloseIcon, AlertCircleIcon } from '../Icons';

// ==================== STYLES ====================

const placementStyles = {
  container: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    backgroundColor: '#f7fafc',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.35rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    transition: 'background 0.15s',
  },
  rowHover: {
    backgroundColor: '#edf2f7',
  },
  roomBadge: (color) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '600',
    backgroundColor: color ? `${color}18` : '#e2e8f0',
    color: color || '#4a5568',
    border: `1px solid ${color ? `${color}40` : '#cbd5e0'}`,
    whiteSpace: 'nowrap',
  }),
  shelfText: {
    fontSize: '0.75rem',
    color: '#718096',
  },
  quantityText: {
    marginLeft: 'auto',
    fontWeight: '600',
    fontSize: '0.8rem',
    color: '#2d3748',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    gap: '2px',
    marginLeft: '0.25rem',
  },
  actionBtn: {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: '3px',
    borderRadius: '3px',
    color: '#a0aec0',
    display: 'flex',
    alignItems: 'center',
  },
  unplaced: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.35rem 0.5rem',
    fontSize: '0.8rem',
    color: '#dd6b20',
    fontWeight: '500',
  },
  quickForm: {
    padding: '0.75rem',
    marginTop: '0.5rem',
    backgroundColor: '#fffff0',
    borderRadius: '6px',
    border: '1px solid #ecc94b',
  },
  quickFormRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  popover: {
    position: 'absolute',
    zIndex: 100,
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
    padding: '1rem',
    minWidth: '280px',
  },
  popoverHeader: {
    fontSize: '0.85rem',
    fontWeight: '600',
    marginBottom: '0.75rem',
    color: '#2d3748',
  },
  error: {
    fontSize: '0.75rem',
    color: '#c53030',
    marginTop: '0.25rem',
  },
  fullPlaced: {
    fontSize: '0.75rem',
    color: '#38a169',
    padding: '0.25rem 0.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
};

// ==================== MoveIcon ====================

const MoveIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <path d="M21 3l-7 7" />
    <polyline points="9 21 3 21 3 15" />
    <path d="M3 21l7-7" />
  </svg>
);

const MapPinIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

// ==================== BatchPlacementRow ====================

const BatchPlacementRow = ({ placement, unit, onEdit, onDelete, onMove, readOnly = false }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ ...placementStyles.row, ...(hovered ? placementStyles.rowHover : {}) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <MapPinIcon size={12} color={placement.room_color || '#718096'} />
      <span style={placementStyles.roomBadge(placement.room_color)}>
        {placement.room_name}
      </span>
      {placement.shelf && (
        <span style={placementStyles.shelfText}>/ {placement.shelf}</span>
      )}
      {placement.position && (
        <span style={placementStyles.shelfText}>/ {placement.position}</span>
      )}
      <span style={placementStyles.quantityText}>
        {placement.quantity} {unit}
      </span>
      {!readOnly && (
        <div style={placementStyles.actions}>
          <button
            style={placementStyles.actionBtn}
            onClick={() => onMove?.(placement)}
            title="Move to another location"
          >
            <MoveIcon size={12} />
          </button>
          <button
            style={placementStyles.actionBtn}
            onClick={() => onEdit?.(placement)}
            title="Edit placement"
          >
            <EditIcon size={12} />
          </button>
          <button
            style={{ ...placementStyles.actionBtn, color: '#fc8181' }}
            onClick={() => onDelete?.(placement)}
            title="Remove placement"
          >
            <TrashIcon size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

// ==================== PlacementQuickForm ====================

const PlacementQuickForm = ({
  batchId,
  unplacedQty,
  unit,
  rooms = [],
  onSave,
  onCancel,
  editPlacement = null,
}) => {
  const isEdit = !!editPlacement;
  const [roomId, setRoomId] = useState(editPlacement?.room_id || '');
  const [shelf, setShelf] = useState(editPlacement?.shelf || '');
  const [position, setPosition] = useState(editPlacement?.position || '');
  const [quantity, setQuantity] = useState(
    editPlacement ? editPlacement.quantity : unplacedQty
  );
  const [notes, setNotes] = useState(editPlacement?.notes || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!roomId) { setError('Select a room'); return; }
    if (!quantity || parseFloat(quantity) <= 0) { setError('Quantity must be > 0'); return; }

    setLoading(true);
    setError('');
    try {
      const payload = {
        room_id: roomId,
        shelf: shelf || null,
        position: position || null,
        quantity: parseFloat(quantity),
        notes: notes || null,
      };

      if (isEdit) {
        await api.updatePlacement(batchId, editPlacement.id, payload);
      } else {
        await api.createPlacement(batchId, payload);
      }
      onSave();
    } catch (err) {
      setError(err.message || 'Failed to save placement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={placementStyles.quickForm}>
      {error && <div style={placementStyles.error}><AlertCircleIcon size={12} /> {error}</div>}
      <div style={placementStyles.quickFormRow}>
        <FormGroup label="Room" style={{ margin: 0, flex: '1 1 120px' }}>
          <Select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '0.35rem' }}
          >
            <option value="">Select room...</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </FormGroup>
        <FormGroup label="Shelf" style={{ margin: 0, flex: '0 1 80px' }}>
          <Input
            value={shelf}
            onChange={(e) => setShelf(e.target.value)}
            placeholder="A-2"
            style={{ fontSize: '0.8rem', padding: '0.35rem' }}
          />
        </FormGroup>
        <FormGroup label="Position" style={{ margin: 0, flex: '0 1 60px' }}>
          <Input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="1"
            style={{ fontSize: '0.8rem', padding: '0.35rem' }}
          />
        </FormGroup>
        <FormGroup label={`Qty (${unit})`} style={{ margin: 0, flex: '0 1 80px' }}>
          <Input
            type="number"
            step="any"
            min="0.001"
            max={isEdit ? undefined : unplacedQty}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '0.35rem' }}
          />
        </FormGroup>
        <div style={{ display: 'flex', gap: '4px', paddingTop: '1.1rem' }}>
          <Button
            size="small"
            variant="primary"
            onClick={handleSave}
            loading={loading}
            icon={<CheckIcon size={12} />}
          >
            {isEdit ? 'Save' : 'Place'}
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={onCancel}
            icon={<CloseIcon size={12} />}
          />
        </div>
      </div>
    </div>
  );
};

// ==================== MovePopover ====================

const MovePopover = ({ placement, unit, rooms = [], batchId, onMove, onCancel }) => {
  const [toRoomId, setToRoomId] = useState('');
  const [toShelf, setToShelf] = useState('');
  const [toPosition, setToPosition] = useState('');
  const [quantity, setQuantity] = useState(placement.quantity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Исключаем текущую комнату+полку из списка
  const availableRooms = rooms;

  const handleMove = async () => {
    if (!toRoomId) { setError('Select destination room'); return; }
    if (!quantity || parseFloat(quantity) <= 0) { setError('Quantity must be > 0'); return; }
    if (parseFloat(quantity) > placement.quantity) {
      setError(`Max: ${placement.quantity} ${unit}`); return;
    }

    setLoading(true);
    setError('');
    try {
      await api.movePlacement(batchId, {
        from_room_id: placement.room_id,
        from_shelf: placement.shelf || null,
        to_room_id: toRoomId,
        quantity: parseFloat(quantity),
        to_shelf: toShelf || null,
        to_position: toPosition || null,
      });
      onMove();
    } catch (err) {
      setError(err.message || 'Failed to move');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={placementStyles.popover}>
      <div style={placementStyles.popoverHeader}>
        <MoveIcon size={14} /> Move from {placement.room_name}
        {placement.shelf ? ` / ${placement.shelf}` : ''}
      </div>
      {error && <div style={placementStyles.error}><AlertCircleIcon size={12} /> {error}</div>}

      <FormGroup label="To room" style={{ marginBottom: '0.5rem' }}>
        <Select value={toRoomId} onChange={(e) => setToRoomId(e.target.value)}>
          <option value="">Select...</option>
          {availableRooms.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
      </FormGroup>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <FormGroup label="Shelf" style={{ margin: 0, flex: 1 }}>
          <Input
            value={toShelf}
            onChange={(e) => setToShelf(e.target.value)}
            placeholder="B-1"
          />
        </FormGroup>
        <FormGroup label={`Qty (max ${placement.quantity})`} style={{ margin: 0, flex: 1 }}>
          <Input
            type="number"
            step="any"
            max={placement.quantity}
            min="0.001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </FormGroup>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <Button size="small" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="primary"
          onClick={handleMove}
          loading={loading}
          icon={<MoveIcon size={12} />}
        >
          Move
        </Button>
      </div>
    </div>
  );
};

// ==================== PlacementSummary ====================
// Полный блок размещений для одного батча: rows + unplaced + quick form

const PlacementSummary = ({
  batch,
  rooms = [],
  onRefresh,
  readOnly = false,
}) => {
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editPlacement, setEditPlacement] = useState(null);
  const [movePlacement, setMovePlacement] = useState(null);
  const [unplacedQty, setUnplacedQty] = useState(0);

  const loadPlacements = useCallback(async () => {
    if (!batch?.id) return;
    setLoading(true);
    try {
      const response = await api.getPlacements(batch.id);
      const data = response?.data || response;
      if (data?.placements) {
        setPlacements(data.placements);
        setUnplacedQty(data.unplaced_quantity || 0);
      } else if (Array.isArray(data)) {
        setPlacements(data);
        const placed = data.reduce((sum, p) => sum + p.quantity, 0);
        setUnplacedQty(Math.max(0, batch.quantity - placed));
      }
    } catch (err) {
      console.error('Failed to load placements:', err);
      setPlacements([]);
    } finally {
      setLoading(false);
    }
  }, [batch?.id, batch?.quantity]);

  useEffect(() => {
    loadPlacements();
  }, [loadPlacements]);

  const handleSave = () => {
    setShowForm(false);
    setEditPlacement(null);
    loadPlacements();
    onRefresh?.();
  };

  const handleDelete = async (placement) => {
    if (!window.confirm(
      `Remove ${placement.quantity} ${batch.unit} from ${placement.room_name}${placement.shelf ? ' / ' + placement.shelf : ''}?`
    )) return;

    try {
      await api.deletePlacement(batch.id, placement.id);
      loadPlacements();
      onRefresh?.();
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  };

  const handleMoveComplete = () => {
    setMovePlacement(null);
    loadPlacements();
    onRefresh?.();
  };

  if (loading && placements.length === 0) {
    return <div style={{ fontSize: '0.75rem', color: '#a0aec0', padding: '0.25rem 0.5rem' }}>Loading...</div>;
  }

  return (
    <div style={placementStyles.container}>
      {/* Placement rows */}
      {placements.map(p => (
        <div key={p.id} style={{ position: 'relative' }}>
          <BatchPlacementRow
            placement={p}
            unit={batch.unit}
            readOnly={readOnly}
            onEdit={(pl) => { setEditPlacement(pl); setShowForm(true); setMovePlacement(null); }}
            onDelete={handleDelete}
            onMove={(pl) => { setMovePlacement(pl); setShowForm(false); setEditPlacement(null); }}
          />
          {/* Move popover */}
          {movePlacement?.id === p.id && (
            <MovePopover
              placement={p}
              unit={batch.unit}
              rooms={rooms}
              batchId={batch.id}
              onMove={handleMoveComplete}
              onCancel={() => setMovePlacement(null)}
            />
          )}
        </div>
      ))}

      {/* Unplaced indicator */}
      {unplacedQty > 0.001 && !readOnly && (
        <div style={placementStyles.unplaced}>
          <span>⚠️ Unplaced: {unplacedQty.toFixed(2)} {batch.unit}</span>
          {!showForm && (
            <Button
              size="small"
              variant="secondary"
              onClick={() => { setShowForm(true); setEditPlacement(null); }}
              icon={<MapPinIcon size={12} />}
            >
              Place
            </Button>
          )}
        </div>
      )}

      {/* Fully placed */}
      {unplacedQty <= 0.001 && placements.length > 0 && (
        <div style={placementStyles.fullPlaced}>
          ✅ Fully placed
          {!readOnly && (
            <Button
              size="small"
              variant="secondary"
              onClick={() => { setShowForm(true); setEditPlacement(null); }}
              style={{ marginLeft: '0.5rem' }}
              icon={<MapPinIcon size={12} />}
            >
              +
            </Button>
          )}
        </div>
      )}

      {/* No placements yet */}
      {placements.length === 0 && !readOnly && (
        <div style={{ ...placementStyles.unplaced, color: '#a0aec0' }}>
          <span>No placements yet — {batch.quantity} {batch.unit} unplaced</span>
          {!showForm && (
            <Button
              size="small"
              variant="secondary"
              onClick={() => { setShowForm(true); setEditPlacement(null); }}
              icon={<MapPinIcon size={12} />}
            >
              Place
            </Button>
          )}
        </div>
      )}

      {/* Quick form (create or edit) */}
      {showForm && (
        <PlacementQuickForm
          batchId={batch.id}
          unplacedQty={editPlacement ? editPlacement.quantity : unplacedQty}
          unit={batch.unit}
          rooms={rooms}
          editPlacement={editPlacement}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditPlacement(null); }}
        />
      )}
    </div>
  );
};

// ==================== EXPORTS ====================

export {
  BatchPlacementRow,
  PlacementQuickForm,
  MovePopover,
  PlacementSummary,
  MoveIcon,
  MapPinIcon,
};

export default PlacementSummary;
