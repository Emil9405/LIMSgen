// components/FormGroup.js
import React from 'react';

const FormGroup = ({ label, children, required = false, error = null, hint = null }) => (
  <div style={{ marginBottom: '1.25rem' }}>
    {label && (
      <label style={{
        display: 'block',
        marginBottom: '0.5rem',
        color: error ? '#e53e3e' : '#2d3748',
        fontWeight: '500',
        fontSize: '0.875rem'
      }}>
        {label} {required && <span style={{ color: '#e53e3e' }}>*</span>}
      </label>
    )}
    {children}
    {hint && !error && (
      <p style={{
        margin: '0.25rem 0 0 0',
        fontSize: '0.75rem',
        color: '#718096'
      }}>
        {hint}
      </p>
    )}
    {error && (
      <p style={{
        margin: '0.25rem 0 0 0',
        fontSize: '0.75rem',
        color: '#e53e3e'
      }}>
        {error}
      </p>
    )}
  </div>
);

export default FormGroup;
