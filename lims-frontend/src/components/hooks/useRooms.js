// hooks/useRooms.js
// Shared hook для загрузки списка комнат (используется PlacementComponents и другими)

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';

/**
 * Hook для загрузки списка комнат
 * @param {boolean} onlyAvailable - загрузить только доступные комнаты
 * @returns {{ rooms, loading, error, refresh }}
 */
export const useRooms = (onlyAvailable = false) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = onlyAvailable
        ? await api.getAvailableRooms()
        : await api.getRooms();
      const data = response?.data || response;
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load rooms:', err);
      setError(err.message);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [onlyAvailable]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  return { rooms, loading, error, refresh: loadRooms };
};

export default useRooms;
