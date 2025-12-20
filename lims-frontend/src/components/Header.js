// components/Header.js - Updated with Experiments menu item
import React, { useState } from 'react';
import Badge from './Badge';
import Button from './Button';
import { ChangePasswordModal } from './Modals';

const Header = ({ user, onLogout, currentPage, setCurrentPage }) => {
  const [showChangePassword, setShowChangePassword] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'reagents', label: 'Reagents', icon: '🧪' },
    { id: 'experiments', label: 'Experiments', icon: '🔬' },
    { id: 'equipment', label: 'Equipment', icon: '⚙️' },
    { id: 'reports', label: 'Reports', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' }
  ];

  const handlePasswordChangeSuccess = () => {
    setShowChangePassword(false);
    alert('Password changed successfully!');
  };

  return (
    <>
      <header style={{
        background: 'white',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        padding: '0 2rem',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        height: '70px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#4a5568'
        }}>
          🧪 LIMS
        </div>
        
        <nav className="header-nav" style={{ display: 'flex', gap: '2rem' }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              style={{
                background: 'none',
                border: 'none',
                color: currentPage === item.id ? '#667eea' : '#4a5568',
                cursor: 'pointer',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: currentPage === item.id ? '600' : '400',
                transition: 'all 0.2s'
              }}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </nav>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4a5568' }}>
            👤 <span>{user?.username}</span>
            <Badge variant="info">{user?.role}</Badge>
          </div>
          <Button variant="secondary" onClick={() => setShowChangePassword(true)}>
            🔒 Change Password
          </Button>
          <Button variant="danger" onClick={onLogout}>
            🚪 Logout
          </Button>
        </div>
      </header>
      
      {showChangePassword && (
        <ChangePasswordModal 
          isOpen={showChangePassword}
          onClose={() => setShowChangePassword(false)}
          onSave={handlePasswordChangeSuccess}
        />
      )}
    </>
  );
};

export default Header;