// components/Toast.js
import React, { useEffect } from 'react';
import './Toast.css';

const Toast = ({ show, message, type = 'info', duration = 5000, onClose }) => {
  useEffect(() => {
    if (show && duration) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);

  if (!show) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <i className="fas fa-check-circle"></i>;
      case 'error':
        return <i className="fas fa-exclamation-circle"></i>;
      case 'warning':
        return <i className="fas fa-exclamation-triangle"></i>;
      case 'info':
      default:
        return <i className="fas fa-info-circle"></i>;
    }
  };

  return (
    <div className="toast-container">
      <div className={`toast toast-${type} toast-enter`}>
        <div className="toast-icon">{getIcon()}</div>
        <div className="toast-content">
          <p className="toast-message">{message}</p>
        </div>
        <button className="toast-close" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>
        <div className="toast-progress">
          <div 
            className="toast-progress-bar" 
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      </div>
    </div>
  );
};

export default Toast;