// components/StatsCard.js
import React from 'react';
import './Toast.css'; // Contains StatsCard styles

const StatsCard = ({ 
  value, 
  label, 
  icon, 
  color = 'primary', 
  onClick, 
  trend, 
  loading = false 
}) => {
  if (loading) {
    return (
      <div className={`stat-card stat-card-${color} stat-card-skeleton`}>
        <div className="stat-card-header">
          <div className="skeleton skeleton-icon" style={{ width: '40px', height: '40px', borderRadius: '8px' }}></div>
        </div>
        <div className="stat-card-body">
          <div className="skeleton skeleton-value"></div>
          <div className="skeleton skeleton-label"></div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`stat-card stat-card-${color} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="stat-card-header">
        <div className="stat-card-icon">
          <i className={icon}></i>
        </div>
        {trend && (
          <div className={`stat-trend ${trend.direction}`}>
            <i className={`fas fa-arrow-${trend.direction === 'up' ? 'up' : 'down'}`}></i>
            {trend.value}%
          </div>
        )}
      </div>
      <div className="stat-card-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
      {trend && trend.description && (
        <div className="stat-card-footer">
          <span className="trend-description">{trend.description}</span>
        </div>
      )}
    </div>
  );
};

export default StatsCard;