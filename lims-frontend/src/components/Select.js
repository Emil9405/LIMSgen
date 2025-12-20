// components/Select.js
import React from 'react';

const Select = ({ value, onChange, children, disabled, ...props }) => (
  <select
    value={value || ''}
    onChange={onChange}
    disabled={disabled}
    style={{
      width: '100%',
      padding: '12px 16px',
      border: '2px solid #e2e8f0',
      borderRadius: '12px',
      fontSize: '16px',
      backgroundColor: 'white',
      fontFamily: 'inherit'
    }}
    {...props}
  >
    {children}
  </select>
);
export default Select;