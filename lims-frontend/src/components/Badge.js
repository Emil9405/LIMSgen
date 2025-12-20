import React from 'react';

const Badge = ({ children, variant = 'info' }) => {
  const variants = {
    success: { backgroundColor: '#c6f6d5', color: '#22543d' },
    warning: { backgroundColor: '#fefcbf', color: '#744210' },
    danger: { backgroundColor: '#fed7d7', color: '#742a2a' },
    info: { backgroundColor: '#bee3f8', color: '#2a4365' }
  };

  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '0.75rem',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      ...variants[variant]
    }}>
      {children}
    </span>
  );
};

export default Badge;
