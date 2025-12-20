// components/Button.js
import React from 'react';

const Button = ({ onClick, children, variant = 'primary', disabled = false, type = 'button', ...props }) => {
  const baseStyle = {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    fontWeight: '500',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.875rem',
    margin: '2px',
    opacity: disabled ? 0.6 : 1,
    fontFamily: 'inherit'
  };

  const variants = {
    primary: { backgroundColor: '#667eea', color: 'white' },
    secondary: { backgroundColor: '#edf2f7', color: '#4a5568' },
    success: { backgroundColor: '#48bb78', color: 'white' },
    danger: { backgroundColor: '#e53e3e', color: 'white' }
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ ...baseStyle, ...variants[variant] }}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
