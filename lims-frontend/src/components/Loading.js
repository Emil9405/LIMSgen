// components/Loading.js
import React from 'react';

const Loading = ({ text = "Loading..." }) => (
  <div style={{ 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: '2rem',
    gap: '0.5rem'
  }}>
    <div style={{
      width: '16px',
      height: '16px',
      border: '2px solid #e2e8f0',
      borderRadius: '50%',
      borderTopColor: '#667eea',
      animation: 'spin 1s linear infinite'
    }}></div>
    <span>{text}</span>
  </div>
);

export default Loading;
