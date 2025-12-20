// components/Input.js
import React from 'react';

const Input = ({ type = "text", value, onChange, required, placeholder, disabled, ...props }) => (
  <input
    type={type}
    value={value || ''}
    onChange={onChange}
    required={required}
    placeholder={placeholder}
    disabled={disabled}
    style={{
      width: '100%',
      padding: '12px 16px',
      border: '2px solid #e2e8f0',
      borderRadius: '12px',
      fontSize: '16px',
      transition: 'all 0.3s ease',
      fontFamily: 'inherit'
    }}
    {...props}
  />
);

export default Input;