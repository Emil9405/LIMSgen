// src/components/Experiments.js
// ПОЛНОСТЬЮ ОБНОВЛЕННЫЙ ФАЙЛ с поддержкой комнат и без drag-and-drop

import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const Experiments = ({ user }) => {
  const [experiments, setExperiments] = useState([]);
  const [batches, setBatches] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedExperiment, setSelectedExperiment] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarStatusFilter, setCalendarStatusFilter] = useState([]);
  const [experimentTypeFilter, setExperimentTypeFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState('');
  const [showRoomManager, setShowRoomManager] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    experiment_date: '',
    experiment_type: 'research',
    instructor: '',
    student_group: '',
    location: '',
    room_id: '',
    start_time: '',
    end_time: '',
  });

  useEffect(() => {
    loadData();
  }, [searchTerm, statusFilter, locationFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Автоматически обновляем статусы экспериментов
      try {
        await api.autoUpdateExperimentStatuses();
      } catch (e) {
        console.log('Auto-update statuses skipped:', e.message);
      }
      
      const params = {};
      if (searchTerm) params.search = searchTerm;
      if (statusFilter) params.status = statusFilter;
      if (locationFilter) params.location = locationFilter;

      const [experimentsData, batchesData, equipmentData, roomsData] = await Promise.all([
        api.getExperiments(params),
        api.getAllBatches(),
        api.getEquipment(),
        api.getRooms().catch(() => []), // Если API комнат не готово
      ]);

      setExperiments(experimentsData.data || experimentsData);
      setBatches(batchesData.data || batchesData);
      setEquipment(equipmentData.data || equipmentData);
      setRooms(roomsData.data || roomsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTimeChange = (e) => {
    const { name, value } = e.target;
    let cleaned = value.replace(/[^\d:]/g, '');
    
    if (cleaned.length > 5) {
      cleaned = cleaned.substring(0, 5);
    }
    
    if (cleaned.length === 2 && !cleaned.includes(':')) {
      const hours = parseInt(cleaned);
      if (hours > 23) {
        cleaned = '23';
      }
      cleaned = cleaned + ':';
    }
    
    if (cleaned.length >= 2) {
      const hoursPart = cleaned.split(':')[0];
      if (hoursPart && parseInt(hoursPart) > 23) {
        cleaned = '23' + cleaned.substring(2);
      }
    }
    
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      if (parts[1] && parts[1].length === 2) {
        const minutes = parseInt(parts[1]);
        if (minutes > 59) {
          cleaned = parts[0] + ':59';
        }
      }
    }
    
    setFormData(prev => ({ ...prev, [name]: cleaned }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title || !formData.experiment_date) {
      alert('Please fill in required fields');
      return;
    }

    if (formData.experiment_type === 'educational') {
      if (!formData.start_time || !formData.end_time) {
        alert('Educational experiments require start and end time');
        return;
      }
      
      const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      if (!timeRegex.test(formData.start_time) || !timeRegex.test(formData.end_time)) {
        alert('Invalid time format. Use HH:MM (00:00 - 23:59)');
        return;
      }
      
      const [startH, startM] = formData.start_time.split(':').map(Number);
      const [endH, endM] = formData.end_time.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      
      if (endMinutes <= startMinutes) {
        alert('End time must be after start time');
        return;
      }
      
      const durationMinutes = endMinutes - startMinutes;
      if (durationMinutes < 15 || durationMinutes > 480) {
        alert('Experiment duration must be between 15 minutes and 8 hours');
        return;
      }
    }

    try {
      const [year, month, day] = formData.experiment_date.split('-').map(Number);
      
      const toUTCString = (dateStr, timeStr) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        if (timeStr) {
          const [hours, minutes] = timeStr.split(':').map(Number);
          const localDate = new Date(y, m - 1, d, hours, minutes, 0);
          return localDate.toISOString();
        } else {
          const localDate = new Date(y, m - 1, d, 12, 0, 0);
          return localDate.toISOString();
        }
      };

      // Находим имя комнаты по room_id
      const selectedRoom = rooms.find(r => r.id === formData.room_id);
      const locationValue = selectedRoom ? selectedRoom.name : formData.location;

      const dataToSubmit = {
        title: formData.title,
        description: formData.description || '',
        experiment_date: toUTCString(formData.experiment_date, formData.start_time || '12:00'),
        experiment_type: formData.experiment_type || 'research',
        instructor: formData.instructor || '',
        student_group: formData.student_group || '',
        location: locationValue,
        room_id: formData.room_id || null,
      };
      
      if (formData.start_time) {
        dataToSubmit.start_date = toUTCString(formData.experiment_date, formData.start_time);
      }
      if (formData.end_time) {
        dataToSubmit.end_date = toUTCString(formData.experiment_date, formData.end_time);
      }

      if (editingId) {
        await api.updateExperiment(editingId, dataToSubmit);
        alert('Experiment updated successfully');
      } else {
        await api.createExperiment(dataToSubmit);
        alert('Experiment created successfully');
      }

      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving experiment:', error);
      alert('Failed to save experiment: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      experiment_date: '',
      experiment_type: 'research',
      instructor: '',
      student_group: '',
      location: '',
      room_id: '',
      start_time: '',
      end_time: '',
    });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (experiment) => {
    const utcToLocalTime = (isoString) => {
      if (!isoString) return '';
      try {
        const date = new Date(isoString);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
      } catch {
        return '';
      }
    };
    
    const utcToLocalDate = (isoString) => {
      if (!isoString) return '';
      try {
        const date = new Date(isoString);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch {
        return isoString.split('T')[0];
      }
    };

    // Находим room_id по имени location
    const room = rooms.find(r => r.name === experiment.location);
    
    setFormData({
      title: experiment.title,
      description: experiment.description || '',
      experiment_date: utcToLocalDate(experiment.experiment_date),
      experiment_type: experiment.experiment_type || 'research',
      instructor: experiment.instructor || '',
      student_group: experiment.student_group || '',
      location: experiment.location || '',
      room_id: room?.id || experiment.room_id || '',
      start_time: utcToLocalTime(experiment.start_date),
      end_time: utcToLocalTime(experiment.end_date),
    });
    setEditingId(experiment.id);
    setShowForm(true);
    setViewMode('list');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this experiment?')) {
      return;
    }

    try {
      await api.deleteExperiment(id);
      alert('Experiment deleted successfully');
      loadData();
    } catch (error) {
      console.error('Error deleting experiment:', error);
      alert('Failed to delete experiment: ' + error.message);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.updateExperiment(id, { status: newStatus });
      setExperiments(prev => prev.map(exp => 
        exp.id === id ? { ...exp, status: newStatus } : exp
      ));
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status: ' + error.message);
    }
  };

  const handleViewDetails = async (id) => {
    try {
      const details = await api.getExperimentDetails(id);
      setSelectedExperiment(details);
      setShowDetails(true);
    } catch (error) {
      console.error('Error loading experiment details:', error);
      alert('Failed to load experiment details: ' + error.message);
    }
  };

  const toggleCalendarStatusFilter = (status) => {
    setCalendarStatusFilter(prev => {
      if (prev.includes(status)) {
        return prev.filter(s => s !== status);
      } else {
        return [...prev, status];
      }
    });
  };

  const getFilteredExperiments = () => {
    let filtered = experiments;
    
    if (searchTerm) {
      filtered = filtered.filter(exp =>
        exp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (exp.description && exp.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (exp.instructor && exp.instructor.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (exp.student_group && exp.student_group.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (statusFilter) {
      filtered = filtered.filter(exp => exp.status === statusFilter);
    }
    
    if (calendarStatusFilter.length > 0) {
      filtered = filtered.filter(exp => calendarStatusFilter.includes(exp.status));
    }

    if (selectedRoomFilter) {
      filtered = filtered.filter(exp => exp.location === selectedRoomFilter);
    }
    
    return filtered;
  };

  const canCreate = () => ['Admin', 'Researcher'].includes(user?.role);
  const canEdit = () => ['Admin', 'Researcher'].includes(user?.role);
  const canDelete = () => user?.role === 'Admin';

  // Получить цвет комнаты
  const getRoomColor = (location) => {
    const room = rooms.find(r => r.name === location || r.id === location);
    return room?.color || '#667eea';
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>;
  }

  const filteredExperiments = getFilteredExperiments();

  return (
    <div style={{ 
      paddingTop: '100px',
      paddingRight: '20px',
      paddingBottom: '20px',
      paddingLeft: '20px',
      maxWidth: '1400px', 
      margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '15px',
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}>
        <h2 style={{ 
          margin: 0,
          fontSize: '24px',
          fontWeight: '600',
          color: '#1f2937',
        }}>
          <i className="fas fa-flask" style={{ marginRight: '10px', color: '#667eea' }}></i>
          Experiments Management
        </h2>

        <div style={{ 
          display: 'flex', 
          gap: '10px', 
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          {/* View Mode Switcher */}
          <div style={{
            display: 'inline-flex',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            padding: '4px',
          }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '8px 16px',
                backgroundColor: viewMode === 'list' ? '#667eea' : 'transparent',
                color: viewMode === 'list' ? 'white' : '#4b5563',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fas fa-list"></i>
              List
            </button>
            <button
              onClick={() => {
                setViewMode('week');
                setShowForm(false);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: viewMode === 'week' ? '#667eea' : 'transparent',
                color: viewMode === 'week' ? 'white' : '#4b5563',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fas fa-calendar-week"></i>
              Week
            </button>
            <button
              onClick={() => {
                setViewMode('calendar');
                setShowForm(false);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: viewMode === 'calendar' ? '#667eea' : 'transparent',
                color: viewMode === 'calendar' ? 'white' : '#4b5563',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fas fa-calendar"></i>
              Month
            </button>
          </div>

          {/* Manage Rooms Button */}
          {canCreate() && (
            <button 
              onClick={() => setShowRoomManager(true)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="fas fa-door-open"></i>
              Rooms
            </button>
          )}

          {/* New Experiment Button */}
          {canCreate() && (
            <button 
              onClick={() => setShowForm(!showForm)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="fas fa-plus"></i>
              New Experiment
            </button>
          )}
        </div>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          marginBottom: '20px',
        }}>
          <h3 style={{ margin: '0 0 20px 0' }}>
            {editingId ? 'Edit Experiment' : 'Create New Experiment'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Date *
                </label>
                <input
                  type="date"
                  name="experiment_date"
                  value={formData.experiment_date}
                  onChange={handleInputChange}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Type
                </label>
                <select
                  name="experiment_type"
                  value={formData.experiment_type}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                >
                  <option value="research">Research</option>
                  <option value="educational">Educational</option>
                </select>
              </div>

              {/* Room Selection */}
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  <i className="fas fa-door-open" style={{ marginRight: '5px', color: '#8b5cf6' }}></i>
                  Room
                </label>
                <select
                  name="room_id"
                  value={formData.room_id}
                  onChange={(e) => {
                    const room = rooms.find(r => r.id === e.target.value);
                    setFormData(prev => ({
                      ...prev,
                      room_id: e.target.value,
                      location: room ? room.name : prev.location,
                    }));
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                >
                  <option value="">Select Room</option>
                  {rooms.filter(r => r.status === 'available').map(room => (
                    <option key={room.id} value={room.id}>
                      {room.name} {room.capacity ? `(${room.capacity} seats)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Start Time {formData.experiment_type === 'educational' && '*'}
                </label>
                <input
                  type="text"
                  name="start_time"
                  value={formData.start_time}
                  onChange={handleTimeChange}
                  placeholder="HH:MM"
                  required={formData.experiment_type === 'educational'}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  End Time {formData.experiment_type === 'educational' && '*'}
                </label>
                <input
                  type="text"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleTimeChange}
                  placeholder="HH:MM"
                  required={formData.experiment_type === 'educational'}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Instructor
                </label>
                <input
                  type="text"
                  name="instructor"
                  value={formData.instructor}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Student Group
                </label>
                <input
                  type="text"
                  name="student_group"
                  value={formData.student_group}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
              <button
                type="submit"
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                {editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters for List View */}
      {viewMode === 'list' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px',
          marginBottom: '20px'
        }}>
          <input
            type="text"
            placeholder="Search experiments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '5px',
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '5px',
            }}
          >
            <option value="">All Statuses</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={selectedRoomFilter}
            onChange={(e) => setSelectedRoomFilter(e.target.value)}
            style={{
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '5px',
            }}
          >
            <option value="">All Rooms</option>
            {rooms.map(room => (
              <option key={room.id} value={room.name}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Week View */}
      {viewMode === 'week' && (
        <WeekView
          experiments={filteredExperiments}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          onExperimentClick={handleViewDetails}
          canEdit={canEdit()}
          rooms={rooms}
          selectedRoomFilter={selectedRoomFilter}
          setSelectedRoomFilter={setSelectedRoomFilter}
          getRoomColor={getRoomColor}
        />
      )}

      {/* Month View */}
      {viewMode === 'calendar' && (
        <CalendarView
          experiments={filteredExperiments}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          onExperimentClick={handleViewDetails}
          canEdit={canEdit()}
          rooms={rooms}
          getRoomColor={getRoomColor}
        />
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div style={{ display: 'grid', gap: '15px' }}>
          {filteredExperiments.length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              backgroundColor: 'white',
              borderRadius: '8px',
              color: '#6b7280',
            }}>
              No experiments found
            </div>
          ) : (
            filteredExperiments.map(exp => (
              <div
                key={exp.id}
                style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  borderLeft: `4px solid ${getRoomColor(exp.location)}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#1f2937' }}>{exp.title}</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', fontSize: '14px', color: '#6b7280' }}>
                      <span>
                        <i className="fas fa-calendar" style={{ marginRight: '5px' }}></i>
                        {new Date(exp.experiment_date).toLocaleDateString()}
                      </span>
                      <span>
                        <i className={exp.experiment_type === 'educational' ? 'fas fa-graduation-cap' : 'fas fa-microscope'} 
                           style={{ marginRight: '5px', color: exp.experiment_type === 'educational' ? '#8b5cf6' : '#06b6d4' }}></i>
                        {exp.experiment_type === 'educational' ? 'Educational' : 'Research'}
                      </span>
                      {exp.location && (
                        <span>
                          <i className="fas fa-door-open" style={{ marginRight: '5px', color: getRoomColor(exp.location) }}></i>
                          {exp.location}
                        </span>
                      )}
                      {/* Status */}
                      {canEdit() ? (
                        <select
                          value={exp.status}
                          onChange={(e) => handleStatusChange(exp.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #ddd',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: '500',
                          }}
                        >
                          <option value="planned">PLANNED</option>
                          <option value="in_progress">IN PROGRESS</option>
                          <option value="completed">COMPLETED</option>
                          <option value="cancelled">CANCELLED</option>
                        </select>
                      ) : (
                        <span>{exp.status.toUpperCase()}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button
                      onClick={() => handleViewDetails(exp.id)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <i className="fas fa-eye"></i>
                    </button>
                    {canEdit() && (
                      <button
                        onClick={() => handleEdit(exp)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                    )}
                    {canDelete() && (
                      <button
                        onClick={() => handleDelete(exp.id)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                </div>

                {exp.description && (
                  <p style={{ margin: '10px 0 0 0', color: '#4b5563' }}>{exp.description}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Details Modal */}
      {showDetails && selectedExperiment && (
        <ExperimentDetails
          experiment={selectedExperiment}
          batches={batches}
          equipment={equipment}
          onClose={() => {
            setShowDetails(false);
            setSelectedExperiment(null);
          }}
          onUpdate={loadData}
          canEdit={canEdit()}
          user={user}
          rooms={rooms}
          getRoomColor={getRoomColor}
        />
      )}

      {/* Room Manager Modal */}
      {showRoomManager && (
        <RoomManager
          rooms={rooms}
          onClose={() => setShowRoomManager(false)}
          onUpdate={loadData}
        />
      )}
    </div>
  );
};

// ==================== WEEK VIEW (БЕЗ DRAG-AND-DROP) ====================

const WeekView = ({ 
  experiments, 
  currentDate, 
  setCurrentDate, 
  onExperimentClick, 
  canEdit,
  rooms,
  selectedRoomFilter,
  setSelectedRoomFilter,
  getRoomColor
}) => {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const workStart = 7;
  const workEnd = 22;
  const hourHeight = 60;
  
  const hourSlots = [];
  for (let i = workStart; i <= workEnd; i++) {
    hourSlots.push(i);
  }

  const getWeekDates = () => {
    const curr = new Date(currentDate);
    const currentDay = curr.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() + diff);
    
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getWeekDates();
  const startDateWeek = weekDates[0];
  const endDateWeek = weekDates[6];

  const previousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const nextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getExperimentsForDate = (date) => {
    const dateStr = formatLocalDate(date);
    let filtered = experiments.filter(exp => {
      const expDate = formatLocalDate(new Date(exp.experiment_date));
      if (expDate === dateStr) return true;
      if (exp.start_date) {
        const startDate = formatLocalDate(new Date(exp.start_date));
        if (startDate === dateStr) return true;
      }
      return false;
    });

    if (selectedRoomFilter) {
      filtered = filtered.filter(exp => exp.location === selectedRoomFilter);
    }

    return filtered;
  };

  const getExperimentTimeRange = (experiment) => {
    const startDate = experiment.start_date ? new Date(experiment.start_date) : new Date(experiment.experiment_date);
    const endDate = experiment.end_date ? new Date(experiment.end_date) : null;
    
    const startHour = startDate.getHours();
    const startMinute = startDate.getMinutes();
    
    let endHour, endMinute;
    if (endDate) {
      endHour = endDate.getHours();
      endMinute = endDate.getMinutes();
    } else {
      endHour = startHour + 1;
      endMinute = startMinute;
    }
    
    return {
      startHour,
      startMinute,
      endHour,
      endMinute,
      startTotal: startHour * 60 + startMinute,
      endTotal: endHour * 60 + endMinute,
    };
  };

  const getExperimentStyle = (experiment) => {
    const { startTotal, endTotal } = getExperimentTimeRange(experiment);
    
    const startFromWorkStart = Math.max(0, startTotal - workStart * 60);
    const top = (startFromWorkStart / 60) * hourHeight;
    
    let durationMinutes = endTotal - startTotal;
    if (durationMinutes <= 0) durationMinutes = 60;
    
    const height = Math.max(30, (durationMinutes / 60) * hourHeight - 4);
    
    return { top, height };
  };

  const calculateOverlapColumns = (dayExperiments) => {
    if (dayExperiments.length === 0) return { expColumns: new Map(), totalColumns: 0 };

    const sorted = [...dayExperiments].sort((a, b) => {
      const aRange = getExperimentTimeRange(a);
      const bRange = getExperimentTimeRange(b);
      return aRange.startTotal - bRange.startTotal;
    });

    const expColumns = new Map();

    for (const exp of sorted) {
      const range = getExperimentTimeRange(exp);
      let column = 0;
      
      while (true) {
        let canUse = true;
        
        for (const [id, col] of expColumns) {
          if (col !== column) continue;
          
          const otherExp = dayExperiments.find(e => e.id === id);
          if (!otherExp) continue;
          
          const otherRange = getExperimentTimeRange(otherExp);
          
          if (!(range.endTotal <= otherRange.startTotal || range.startTotal >= otherRange.endTotal)) {
            canUse = false;
            break;
          }
        }
        
        if (canUse) break;
        column++;
      }
      
      expColumns.set(exp.id, column);
    }

    const totalColumns = expColumns.size > 0 ? Math.max(...expColumns.values()) + 1 : 0;
    return { expColumns, totalColumns };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'in_progress': return '#f59e0b';
      case 'cancelled': return '#ef4444';
      default: return '#667eea';
    }
  };

  const getStatusBgColor = (status) => {
    switch (status) {
      case 'completed': return 'rgba(16, 185, 129, 0.15)';
      case 'in_progress': return 'rgba(245, 158, 11, 0.15)';
      case 'cancelled': return 'rgba(239, 68, 68, 0.15)';
      default: return 'rgba(102, 126, 234, 0.15)';
    }
  };

  const isToday = (date) => {
    const today = new Date();
    return today.toDateString() === date.toDateString();
  };

  const formatTimeRange = (experiment) => {
    const { startHour, startMinute, endHour, endMinute } = getExperimentTimeRange(experiment);
    return `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')} - ${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
  };

  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      padding: '20px',
    }}>
      {/* Week Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <button onClick={previousWeek} style={{
          padding: '8px 16px',
          backgroundColor: '#f3f4f6',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}>
          <i className="fas fa-chevron-left"></i>
        </button>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
            Week {getWeekNumber(currentDate)}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            {startDateWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - {endDateWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>

        {/* Room Filter */}
        <select
          value={selectedRoomFilter}
          onChange={(e) => setSelectedRoomFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #e5e7eb',
            fontSize: '14px',
            backgroundColor: 'white',
            minWidth: '140px',
          }}
        >
          <option value="">All Rooms</option>
          {rooms.map(room => (
            <option key={room.id} value={room.name}>
              {room.name}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={goToToday} style={{
            padding: '8px 16px',
            backgroundColor: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}>
            Today
          </button>
          <button onClick={nextWeek} style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}>
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>

      {/* Room Legend */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        marginBottom: '15px',
        padding: '10px',
        backgroundColor: '#f9fafb',
        borderRadius: '4px',
      }}>
        {rooms.map(room => (
          <div key={room.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#4b5563',
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              backgroundColor: room.color || '#667eea',
            }}></div>
            {room.name}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div style={{ display: 'flex', overflow: 'auto' }}>
        {/* Time Column */}
        <div style={{ width: '60px', flexShrink: 0 }}>
          <div style={{ height: '50px', borderBottom: '1px solid #e5e7eb' }}></div>
          {hourSlots.map(hour => (
            <div key={hour} style={{
              height: `${hourHeight}px`,
              borderBottom: '1px solid #f3f4f6',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              paddingRight: '8px',
              paddingTop: '2px',
              fontSize: '12px',
              color: '#9ca3af',
            }}>
              {hour}:00
            </div>
          ))}
        </div>

        {/* Days Columns */}
        {weekDates.map((date, dayIndex) => {
          const dayExperiments = getExperimentsForDate(date);
          const todayClass = isToday(date);
          const { expColumns, totalColumns } = calculateOverlapColumns(dayExperiments);
          
          return (
            <div key={dayIndex} style={{
              flex: 1,
              minWidth: '140px',
              borderLeft: '1px solid #e5e7eb',
            }}>
              {/* Day Header */}
              <div style={{
                height: '50px',
                padding: '8px',
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: todayClass ? '#eef2ff' : '#f9fafb',
                textAlign: 'center',
              }}>
                <div style={{
                  fontSize: '12px',
                  color: todayClass ? '#4f46e5' : '#6b7280',
                  fontWeight: '500',
                }}>
                  {dayNames[dayIndex]}
                </div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  width: '32px',
                  height: '32px',
                  lineHeight: '32px',
                  margin: '0 auto',
                  borderRadius: '50%',
                  backgroundColor: todayClass ? '#4f46e5' : 'transparent',
                  color: todayClass ? 'white' : '#1f2937',
                }}>
                  {date.getDate()}
                </div>
              </div>

              {/* Time Slots */}
              <div style={{
                position: 'relative',
                height: `${hourSlots.length * hourHeight}px`,
              }}>
                {hourSlots.map((hour, idx) => (
                  <div
                    key={hour}
                    style={{
                      position: 'absolute',
                      top: `${idx * hourHeight}px`,
                      left: 0,
                      right: 0,
                      height: `${hourHeight}px`,
                      borderBottom: '1px solid #f3f4f6',
                      backgroundColor: todayClass ? 'rgba(238, 242, 255, 0.3)' : 'transparent',
                    }}
                  />
                ))}

                {/* Experiment Blocks */}
                {dayExperiments.map((exp) => {
                  const { top, height } = getExperimentStyle(exp);
                  const timeRange = getExperimentTimeRange(exp);
                  const isEducational = exp.experiment_type === 'educational';
                  
                  if (timeRange.startHour > workEnd || timeRange.endHour < workStart) {
                    return null;
                  }

                  const column = expColumns.get(exp.id) || 0;
                  const columnWidth = totalColumns > 1 ? 100 / totalColumns : 100;
                  const leftOffset = column * columnWidth;
                  const roomColor = exp.location ? getRoomColor(exp.location) : getStatusColor(exp.status);
                  
                  return (
                    <div
                      key={exp.id}
                      onClick={() => onExperimentClick(exp.id)}
                      style={{
                        position: 'absolute',
                        top: `${top}px`,
                        left: `calc(${leftOffset}% + 2px)`,
                        width: `calc(${columnWidth}% - 4px)`,
                        height: `${height}px`,
                        backgroundColor: isEducational 
                          ? 'rgba(139, 92, 246, 0.15)'
                          : getStatusBgColor(exp.status),
                        borderLeft: `4px solid ${roomColor}`,
                        borderRadius: '4px',
                        padding: '4px 6px',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        zIndex: 10,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                        e.currentTarget.style.zIndex = '100';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                        e.currentTarget.style.zIndex = '10';
                      }}
                      title={`${exp.title}\n${formatTimeRange(exp)}\nType: ${isEducational ? 'Educational' : 'Research'}\nStatus: ${exp.status}${exp.location ? '\nRoom: ' + exp.location : ''}`}
                    >
                      <div style={{
                        fontSize: '10px',
                        fontWeight: '600',
                        color: roomColor,
                        marginBottom: '2px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {formatTimeRange(exp)}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '500',
                        color: '#1f2937',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {exp.title}
                      </div>
                      {height > 45 && exp.location && (
                        <div style={{
                          fontSize: '9px',
                          color: '#6b7280',
                          marginTop: '2px',
                        }}>
                          <i className="fas fa-door-open" style={{ fontSize: '8px', marginRight: '3px' }}></i>
                          {exp.location}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==================== CALENDAR VIEW (БЕЗ DRAG-AND-DROP) ====================

const CalendarView = ({ experiments, currentDate, setCurrentDate, onExperimentClick, canEdit, rooms, getRoomColor }) => {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const previousMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const formatLocalDate = (date) => {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getExperimentsForDate = (day) => {
    const dateStr = formatLocalDate(new Date(year, month, day));
    return experiments.filter(exp => {
      const expDate = formatLocalDate(new Date(exp.experiment_date));
      return expDate === dateStr;
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'in_progress': return '#f59e0b';
      case 'cancelled': return '#ef4444';
      default: return '#667eea';
    }
  };

  const isToday = (day) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
  };

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <button onClick={previousMonth} style={{
          padding: '8px 16px',
          backgroundColor: '#f3f4f6',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}>
          <i className="fas fa-chevron-left"></i>
        </button>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
            {monthNames[month]} {year}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={goToToday} style={{
            padding: '8px 16px',
            backgroundColor: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}>
            Today
          </button>
          <button onClick={nextMonth} style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}>
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>

      {/* Day Names */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '1px',
        marginBottom: '1px',
      }}>
        {dayNames.map(day => (
          <div key={day} style={{
            padding: '10px',
            textAlign: 'center',
            fontWeight: '600',
            color: '#6b7280',
            fontSize: '14px',
            backgroundColor: '#f9fafb',
          }}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '1px',
        backgroundColor: '#e5e7eb',
      }}>
        {days.map((day, index) => {
          const dayExperiments = day ? getExperimentsForDate(day) : [];
          
          return (
            <div
              key={index}
              style={{
                minHeight: '100px',
                padding: '8px',
                backgroundColor: day ? (isToday(day) ? '#eef2ff' : 'white') : '#f9fafb',
              }}
            >
              {day && (
                <>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: isToday(day) ? '700' : '500',
                    color: isToday(day) ? '#4f46e5' : '#1f2937',
                    marginBottom: '5px',
                  }}>
                    {day}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {dayExperiments.slice(0, 3).map(exp => (
                      <div
                        key={exp.id}
                        onClick={() => onExperimentClick(exp.id)}
                        style={{
                          padding: '2px 6px',
                          backgroundColor: getRoomColor(exp.location) + '20',
                          borderLeft: `3px solid ${getRoomColor(exp.location)}`,
                          borderRadius: '3px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={exp.title}
                      >
                        {exp.title}
                      </div>
                    ))}
                    {dayExperiments.length > 3 && (
                      <div style={{
                        fontSize: '10px',
                        color: '#6b7280',
                        textAlign: 'center',
                      }}>
                        +{dayExperiments.length - 3} more
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==================== ROOM MANAGER ====================

const RoomManager = ({ rooms, onClose, onUpdate }) => {
  const [localRooms, setLocalRooms] = useState(rooms);
  const [newRoom, setNewRoom] = useState({ name: '', color: '#667eea', description: '', capacity: '' });
  const [editingRoom, setEditingRoom] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAddRoom = async () => {
    if (!newRoom.name.trim()) {
      alert('Please enter room name');
      return;
    }

    setLoading(true);
    try {
      const result = await api.createRoom({
        name: newRoom.name.trim(),
        color: newRoom.color,
        description: newRoom.description.trim() || null,
        capacity: newRoom.capacity ? parseInt(newRoom.capacity) : null,
      });
      
      setLocalRooms(prev => [...prev, result.data || result]);
      setNewRoom({ name: '', color: '#667eea', description: '', capacity: '' });
      onUpdate();
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRoom = async (roomId) => {
    if (!editingRoom || !editingRoom.name.trim()) {
      alert('Please enter room name');
      return;
    }

    setLoading(true);
    try {
      await api.updateRoom(roomId, {
        name: editingRoom.name.trim(),
        color: editingRoom.color,
        description: editingRoom.description?.trim() || null,
        capacity: editingRoom.capacity ? parseInt(editingRoom.capacity) : null,
      });
      
      setLocalRooms(prev => prev.map(r => r.id === roomId ? { ...r, ...editingRoom } : r));
      setEditingRoom(null);
      onUpdate();
    } catch (error) {
      console.error('Error updating room:', error);
      alert('Failed to update room: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Are you sure you want to delete this room?')) {
      return;
    }

    setLoading(true);
    try {
      await api.deleteRoom(roomId);
      setLocalRooms(prev => prev.filter(r => r.id !== roomId));
      onUpdate();
    } catch (error) {
      console.error('Error deleting room:', error);
      alert('Failed to delete room: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#1f2937' }}>
            <i className="fas fa-door-open" style={{ marginRight: '10px', color: '#8b5cf6' }}></i>
            Manage Rooms
          </h2>
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#6b7280',
          }}>×</button>
        </div>

        {/* Add New Room */}
        <div style={{
          backgroundColor: '#f9fafb',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
        }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#374151' }}>
            Add New Room
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 1fr auto', gap: '10px', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Name *</label>
              <input
                type="text"
                value={newRoom.name}
                onChange={(e) => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Lab 104"
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Color</label>
              <input
                type="color"
                value={newRoom.color}
                onChange={(e) => setNewRoom(prev => ({ ...prev, color: e.target.value }))}
                style={{ width: '100%', height: '38px', padding: '2px', border: '1px solid #e5e7eb', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Capacity</label>
              <input
                type="number"
                value={newRoom.capacity}
                onChange={(e) => setNewRoom(prev => ({ ...prev, capacity: e.target.value }))}
                placeholder="20"
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Description</label>
              <input
                type="text"
                value={newRoom.description}
                onChange={(e) => setNewRoom(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional"
                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}
              />
            </div>
            <button
              onClick={handleAddRoom}
              disabled={loading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              <i className="fas fa-plus"></i> Add
            </button>
          </div>
        </div>

        {/* Room List */}
        <div style={{ display: 'grid', gap: '10px' }}>
          {localRooms.map(room => (
            <div
              key={room.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                borderLeft: `4px solid ${room.color || '#667eea'}`,
              }}
            >
              {editingRoom?.id === room.id ? (
                <>
                  <input
                    type="text"
                    value={editingRoom.name}
                    onChange={(e) => setEditingRoom(prev => ({ ...prev, name: e.target.value }))}
                    style={{ flex: 1, padding: '6px', border: '1px solid #e5e7eb', borderRadius: '4px' }}
                  />
                  <input
                    type="color"
                    value={editingRoom.color || '#667eea'}
                    onChange={(e) => setEditingRoom(prev => ({ ...prev, color: e.target.value }))}
                    style={{ width: '40px', height: '30px' }}
                  />
                  <button onClick={() => handleUpdateRoom(room.id)} style={{
                    padding: '6px 12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                  }}>Save</button>
                  <button onClick={() => setEditingRoom(null)} style={{
                    padding: '6px 12px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                  }}>Cancel</button>
                </>
              ) : (
                <>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '6px',
                    backgroundColor: room.color || '#667eea', flexShrink: 0,
                  }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', color: '#1f2937' }}>
                      {room.name}
                      {room.capacity && <span style={{ color: '#6b7280', fontWeight: 'normal' }}> ({room.capacity} seats)</span>}
                    </div>
                    {room.description && <div style={{ fontSize: '12px', color: '#6b7280' }}>{room.description}</div>}
                  </div>
                  <button onClick={() => setEditingRoom({ ...room })} style={{
                    padding: '6px 10px', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer'
                  }}><i className="fas fa-edit"></i></button>
                  <button onClick={() => handleDeleteRoom(room.id)} style={{
                    padding: '6px 10px', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer'
                  }}><i className="fas fa-trash"></i></button>
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button onClick={onClose} style={{
            padding: '10px 24px', backgroundColor: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500'
          }}>Done</button>
        </div>
      </div>
    </div>
  );
};

// ==================== EXPERIMENT DETAILS COMPONENT ====================
const ExperimentDetails = ({ experiment, batches, equipment, onClose, onUpdate, canEdit, user, rooms, getRoomColor }) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [showAddReagent, setShowAddReagent] = useState(false);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [reagentQuantity, setReagentQuantity] = useState('');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [equipmentQuantity, setEquipmentQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  
  // Получаем данные из experiment (может быть {experiment: {...}, reagents: [...]} или просто эксперимент)
  const exp = experiment?.experiment || experiment;
  const reagents = experiment?.reagents || [];
  const expEquipment = experiment?.equipment || [];
  const documents = experiment?.documents || [];

  const getStatusColor = (status) => {
    const colors = {
      planned: { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
      in_progress: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
      completed: { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
      cancelled: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    };
    return colors[status] || colors.planned;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleStatusChange = async (newStatus) => {
    if (!canEdit) return;
    
    try {
      setLoading(true);
      
      if (newStatus === 'in_progress' && exp.status === 'planned') {
        await api.startExperiment(exp.id);
      } else if (newStatus === 'completed' && exp.status === 'in_progress') {
        await api.completeExperiment(exp.id);
      } else if (newStatus === 'cancelled') {
        await api.cancelExperiment(exp.id);
      } else {
        await api.updateExperiment(exp.id, { status: newStatus });
      }
      
      alert(`Status changed to ${newStatus}`);
      onUpdate();
    } catch (error) {
      console.error('Error changing status:', error);
      alert('Failed to change status: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddReagent = async () => {
    if (!selectedBatchId || !reagentQuantity) {
      alert('Please select batch and enter quantity');
      return;
    }

    try {
      setLoading(true);
      await api.addExperimentReagent(exp.id, {
        batch_id: selectedBatchId,
        quantity_used: parseFloat(reagentQuantity),
        notes: notes || undefined
      });
      alert('Reagent added successfully');
      setShowAddReagent(false);
      setSelectedBatchId('');
      setReagentQuantity('');
      setNotes('');
      onUpdate();
    } catch (error) {
      console.error('Error adding reagent:', error);
      alert('Failed to add reagent: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveReagent = async (reagentRecordId) => {
    if (!window.confirm('Remove this reagent from experiment?')) return;

    try {
      setLoading(true);
      await api.removeExperimentReagent(exp.id, reagentRecordId);
      alert('Reagent removed');
      onUpdate();
    } catch (error) {
      console.error('Error removing reagent:', error);
      alert('Failed to remove reagent: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConsumeReagent = async (reagentRecordId) => {
    if (!window.confirm('Mark this reagent as consumed? This will deduct from batch quantity.')) return;

    try {
      setLoading(true);
      await api.consumeExperimentReagent(exp.id, reagentRecordId);
      alert('Reagent consumed');
      onUpdate();
    } catch (error) {
      console.error('Error consuming reagent:', error);
      alert('Failed to consume reagent: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEquipment = async () => {
    if (!selectedEquipmentId) {
      alert('Please select equipment');
      return;
    }

    try {
      setLoading(true);
      await api.addExperimentEquipment(exp.id, {
        equipment_id: selectedEquipmentId,
        quantity_used: parseInt(equipmentQuantity) || 1,
        notes: notes || undefined
      });
      alert('Equipment added successfully');
      setShowAddEquipment(false);
      setSelectedEquipmentId('');
      setEquipmentQuantity('1');
      setNotes('');
      onUpdate();
    } catch (error) {
      console.error('Error adding equipment:', error);
      alert('Failed to add equipment: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveEquipment = async (equipmentRecordId) => {
    if (!window.confirm('Remove this equipment from experiment?')) return;

    try {
      setLoading(true);
      await api.removeExperimentEquipment(exp.id, equipmentRecordId);
      alert('Equipment removed');
      onUpdate();
    } catch (error) {
      console.error('Error removing equipment:', error);
      alert('Failed to remove equipment: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const statusColors = getStatusColor(exp?.status);

  // Доступные батчи для добавления
  const availableBatches = batches.filter(b => b.status === 'available' && b.quantity > 0);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px',
        maxWidth: '900px', width: '95%', maxHeight: '90vh', 
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#1f2937' }}>
              {exp?.title || 'Experiment Details'}
            </h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600',
                backgroundColor: statusColors.bg,
                color: statusColors.color,
                border: `1px solid ${statusColors.border}`
              }}>
                {exp?.status?.toUpperCase()}
              </span>
              <span style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '500',
                backgroundColor: exp?.experiment_type === 'educational' ? '#f3e8ff' : '#e0f2fe',
                color: exp?.experiment_type === 'educational' ? '#7c3aed' : '#0369a1',
              }}>
                {exp?.experiment_type === 'educational' ? 'Educational' : 'Research'}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '24px',
            cursor: 'pointer', color: '#6b7280', padding: '0'
          }}>x</button>
        </div>

        {/* Status Actions */}
        {canEdit && (
          <div style={{
            padding: '12px 24px',
            backgroundColor: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            {exp?.status === 'planned' && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Start Experiment
              </button>
            )}
            {exp?.status === 'in_progress' && (
              <button
                onClick={() => handleStatusChange('completed')}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Complete & Consume Reagents
              </button>
            )}
            {['planned', 'in_progress'].includes(exp?.status) && (
              <button
                onClick={() => handleStatusChange('cancelled')}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Cancel Experiment
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          padding: '0 24px'
        }}>
          {['info', 'reagents', 'equipment', 'documents'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontWeight: '500',
                color: activeTab === tab ? '#667eea' : '#6b7280',
                borderBottom: activeTab === tab ? '2px solid #667eea' : '2px solid transparent',
                marginBottom: '-1px'
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'reagents' && reagents.length > 0 && ` (${reagents.length})`}
              {tab === 'equipment' && expEquipment.length > 0 && ` (${expEquipment.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {/* Info Tab */}
          {activeTab === 'info' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>General Information</h4>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <div><strong>Date:</strong> {formatDate(exp?.experiment_date)}</div>
                  <div><strong>Location:</strong> {exp?.location || 'Not specified'}</div>
                  <div><strong>Instructor:</strong> {exp?.instructor || 'N/A'}</div>
                  <div><strong>Student Group:</strong> {exp?.student_group || 'N/A'}</div>
                </div>
              </div>
              <div>
                <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>Schedule</h4>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <div><strong>Start:</strong> {formatDate(exp?.start_date)}</div>
                  <div><strong>End:</strong> {formatDate(exp?.end_date)}</div>
                  <div><strong>Created:</strong> {formatDate(exp?.created_at)}</div>
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>Description</h4>
                <p style={{ margin: 0, color: '#4b5563', whiteSpace: 'pre-wrap' }}>
                  {exp?.description || 'No description provided'}
                </p>
              </div>
              {exp?.protocol && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>Protocol</h4>
                  <p style={{ margin: 0, color: '#4b5563', whiteSpace: 'pre-wrap' }}>
                    {exp.protocol}
                  </p>
                </div>
              )}
              {exp?.results && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>Results</h4>
                  <p style={{ margin: 0, color: '#4b5563', whiteSpace: 'pre-wrap' }}>
                    {exp.results}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Reagents Tab */}
          {activeTab === 'reagents' && (
            <div>
              {canEdit && exp?.status !== 'completed' && exp?.status !== 'cancelled' && (
                <div style={{ marginBottom: '20px' }}>
                  {!showAddReagent ? (
                    <button
                      onClick={() => setShowAddReagent(true)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      + Add Reagent
                    </button>
                  ) : (
                    <div style={{
                      padding: '16px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <h4 style={{ margin: '0 0 12px 0' }}>Add Reagent</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: '10px', alignItems: 'end' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Batch *</label>
                          <select
                            value={selectedBatchId}
                            onChange={(e) => setSelectedBatchId(e.target.value)}
                            style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          >
                            <option value="">Select batch...</option>
                            {availableBatches.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.reagent_name || 'Unknown'} - {b.batch_number} ({b.quantity} {b.unit})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Quantity *</label>
                          <input
                            type="number"
                            step="0.01"
                            value={reagentQuantity}
                            onChange={(e) => setReagentQuantity(e.target.value)}
                            style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Notes</label>
                          <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          />
                        </div>
                      </div>
                      <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
                        <button onClick={handleAddReagent} disabled={loading} style={{
                          padding: '8px 16px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                        }}>Add</button>
                        <button onClick={() => setShowAddReagent(false)} style={{
                          padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                        }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {reagents.length === 0 ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>
                  No reagents added to this experiment
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Reagent</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Batch</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Quantity</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                      {canEdit && <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {reagents.map(r => (
                      <tr key={r.id}>
                        <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>{r.reagent_name}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>{r.batch_number}</td>
                        <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>
                          {r.quantity_used} {r.unit}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            backgroundColor: r.is_consumed ? '#d1fae5' : '#fef3c7',
                            color: r.is_consumed ? '#065f46' : '#92400e'
                          }}>
                            {r.is_consumed ? 'Consumed' : 'Reserved'}
                          </span>
                        </td>
                        {canEdit && (
                          <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                            {!r.is_consumed && exp?.status === 'in_progress' && (
                              <button
                                onClick={() => handleConsumeReagent(r.id)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#10b981',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  marginRight: '4px',
                                  fontSize: '12px'
                                }}
                              >
                                Consume
                              </button>
                            )}
                            {!r.is_consumed && ['planned', 'in_progress'].includes(exp?.status) && (
                              <button
                                onClick={() => handleRemoveReagent(r.id)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#ef4444',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Equipment Tab */}
          {activeTab === 'equipment' && (
            <div>
              {canEdit && exp?.status !== 'completed' && exp?.status !== 'cancelled' && (
                <div style={{ marginBottom: '20px' }}>
                  {!showAddEquipment ? (
                    <button
                      onClick={() => setShowAddEquipment(true)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#8b5cf6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      + Add Equipment
                    </button>
                  ) : (
                    <div style={{
                      padding: '16px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <h4 style={{ margin: '0 0 12px 0' }}>Add Equipment</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: '10px', alignItems: 'end' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Equipment *</label>
                          <select
                            value={selectedEquipmentId}
                            onChange={(e) => setSelectedEquipmentId(e.target.value)}
                            style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          >
                            <option value="">Select equipment...</option>
                            {(Array.isArray(equipment) ? equipment : []).map(eq => (
                              <option key={eq.id} value={eq.id}>
                                {eq.name} ({eq.status})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={equipmentQuantity}
                            onChange={(e) => setEquipmentQuantity(e.target.value)}
                            style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Notes</label>
                          <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                          />
                        </div>
                      </div>
                      <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
                        <button onClick={handleAddEquipment} disabled={loading} style={{
                          padding: '8px 16px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                        }}>Add</button>
                        <button onClick={() => setShowAddEquipment(false)} style={{
                          padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                        }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {expEquipment.length === 0 ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>
                  No equipment added to this experiment
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Equipment</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Quantity</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Notes</th>
                      {canEdit && <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {expEquipment.map(eq => (
                      <tr key={eq.id}>
                        <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>{eq.equipment_name}</td>
                        <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>
                          {eq.quantity_used} {eq.unit || 'pcs'}
                        </td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>{eq.notes || '-'}</td>
                        {canEdit && ['planned', 'in_progress'].includes(exp?.status) && (
                          <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                            <button
                              onClick={() => handleRemoveEquipment(eq.id)}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div>
              {documents.length === 0 ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>
                  No documents attached to this experiment
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {documents.map(doc => (
                    <div key={doc.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div>
                        <div style={{ fontWeight: '500' }}>{doc.original_filename}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          Uploaded: {formatDate(doc.created_at)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <a
                          href={`/api/v1/experiments/${exp.id}/documents/${doc.id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#667eea',
                            color: 'white',
                            borderRadius: '4px',
                            textDecoration: 'none',
                            fontSize: '12px'
                          }}
                        >
                          View
                        </a>
                        <a
                          href={`/api/v1/experiments/${exp.id}/documents/${doc.id}/download`}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            borderRadius: '4px',
                            textDecoration: 'none',
                            fontSize: '12px'
                          }}
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              backgroundColor: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default Experiments;