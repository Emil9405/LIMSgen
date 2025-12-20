// components/TextArea.js
import React from 'react';

const TextArea = ({ 
  value, 
  onChange, 
  rows = 3, 
  placeholder, 
  disabled, 
  name,
  required,
  style,
  ...props 
}) => (
  <textarea
    name={name}
    value={value || ''}
    onChange={onChange}
    rows={rows}
    placeholder={placeholder}
    disabled={disabled}
    required={required}
    style={{
      width: '100%',
      padding: '12px 16px',
      border: '2px solid #e2e8f0',
      borderRadius: '12px',
      fontSize: '16px',
      resize: 'vertical',
      transition: 'all 0.3s ease',
      fontFamily: 'inherit',
      ...style
    }}
    {...props}
  />
);

export default TextArea;