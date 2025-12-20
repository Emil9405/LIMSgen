// components/LoadingOverlay.js
import React from 'react';
import './Toast.css'; // Contains LoadingOverlay styles

const LoadingOverlay = ({ 
  size = 'medium', 
  message = 'Loading...', 
  fullscreen = false,
  transparent = false 
}) => {
  const className = `loading-overlay ${fullscreen ? 'fullscreen' : 'absolute'} ${transparent ? 'transparent' : ''}`;
  
  return (
    <div className={className}>
      <div className="loading-content">
        <div className={`loading-spinner ${size}`}>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        {message && <div className="loading-message">{message}</div>}
      </div>
    </div>
  );
};

export default LoadingOverlay;