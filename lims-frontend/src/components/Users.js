// Updated components/Users.js with implemented modals and reset password action
// components/Users.js - Updated with CreateUserModal, EditUserModal, and reset password
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import ErrorMessage from './ErrorMessage';
import Loading from './Loading';
import Table from './Table';
import Badge from './Badge';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { CreateUserModal, EditUserModal, ViewUserModal } from './Modals';  // Imported new modals

const Users = ({ user }) => {
  // All hooks at the top, unconditionally
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Conditionally load only if admin
    if (user?.role?.toLowerCase() !== 'admin') {
      setLoading(false);
      return;
    }
    loadUsers();
  }, [user]);  // Depend on user to re-check role if it changes

  // Only admin can access - early return AFTER hooks
  if (user?.role?.toLowerCase() !== 'admin') {
    return (
      <div style={{ padding: '6rem 2rem 2rem 2rem' }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <p>Access denied. Admin privileges required.</p>
        </div>
      </div>
    );
  }

  const loadUsers = async () => {
    try {
      setError('');
      const data = await api.getUsers();
      
      if (Array.isArray(data)) {
        setUsers(data);
      } else if (data && Array.isArray(data.users)) {
        setUsers(data.users);
      } else if (data && data.data && Array.isArray(data.data)) {
        setUsers(data.data);
      } else {
        console.warn('Unexpected data format from API:', data);
        setUsers([]);
        setError('Received unexpected data format from server');
      }
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.message || 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action, item) => {
    try {
      if (action === 'view') {
        setSelectedUser(item);
        setShowViewModal(true);
      } else if (action === 'edit') {
        setSelectedUser(item);
        setShowEditModal(true);
      } else if (action === 'delete') {
        if (window.confirm(`Are you sure you want to delete user "${item.username || item.email}"?`)) {
          await api.deleteUser(item.id);
          loadUsers();
        }
      } else if (action === 'reset') {
        const newPassword = prompt('Enter new password for user:');
        if (newPassword) {
          await api.resetUserPassword(item.id, newPassword);
          alert('Password reset successfully');
        }
      }
    } catch (err) {
      console.error(`Failed to ${action} user:`, err);
      setError(err.message || `Failed to ${action} user`);
    }
  };

  const filteredUsers = Array.isArray(users) ? users.filter(u => {
    if (!u) return false;
    
    const matchesSearch = !searchTerm || 
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  }) : [];

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    loadUsers();
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    setSelectedUser(null);
    loadUsers();
  };

  return (
    <div style={{ padding: '6rem 2rem 2rem 2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: '600',
          color: '#2d3748',
          marginBottom: '0.5rem'
        }}>
          Users
        </h1>
        <p style={{ color: '#718096' }}>
          Manage system users
        </p>
      </div>

      {error && <ErrorMessage message={error} onDismiss={() => setError('')} />}

      <div style={{
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          padding: '1.5rem 2rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#2d3748',
            margin: 0
          }}>
            User List
          </h2>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            + Add User
          </Button>
        </div>

        <div style={{ padding: '2rem' }}>
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1rem',
            flexWrap: 'wrap'
          }}>
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, minWidth: '200px' }}
            />
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ width: '150px' }}
            >
              <option value="">All Roles</option>
              <option value="Admin">Admin</option>
              <option value="Researcher">Researcher</option>
              <option value="Technician">Technician</option>
            </Select>
          </div>

          {loading ? (
            <Loading text="Loading users..." />
          ) : (
            <Table
              data={filteredUsers}
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'email', label: 'Email' },
                {
                  key: 'role',
                  label: 'Role',
                  render: (item) => (
                    <Badge variant={item.role === 'Admin' ? 'danger' : 'success'}>
                      {item.role || 'Unknown'}
                    </Badge>
                  )
                },
                { key: 'created_at', label: 'Created' }  // Форматируйте дату если нужно
              ]}
              actions={{
                view: true,
                edit: true,
                delete: true,
                reset: true  // New reset action for password
              }}
              onAction={handleAction}
              loading={false}
              emptyMessage={
                users.length === 0 ? 
                  "No users found." :
                  "No users match your search criteria. Try adjusting your filters."
              }
            />
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateUserModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateSuccess}
        />
      )}

      {showEditModal && selectedUser && (
        <EditUserModal
          isOpen={showEditModal}
          user={selectedUser}
          onClose={() => {
            setShowEditModal(false);
            setSelectedUser(null);
          }}
          onSave={handleEditSuccess}
        />
      )}

      {showViewModal && selectedUser && (
        <ViewUserModal
          isOpen={showViewModal}
          user={selectedUser}
          onClose={() => {
            setShowViewModal(false);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
};

export default Users;