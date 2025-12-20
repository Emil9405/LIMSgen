// components/Dashboard.js - Fixed version with proper navigation
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import StatsCard from './StatsCard';
import LoadingOverlay from './LoadingOverlay';
import Button from './Button';
import './Dashboard.css';

const Dashboard = ({ user, showToast, onNavigate }) => {
  const [stats, setStats] = useState({
    total_reagents: 0,
    total_batches: 0,
    low_stock: 0,
    expiring_soon: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);
  const [quickActions, setQuickActions] = useState([]);

  useEffect(() => {
    loadDashboardData();
    loadRecentActivity();
    setupQuickActions();
  }, [user]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Parallel API calls for better performance
      const [statsData, reagentsData, batchesData, lowStockData, expiringData] = await Promise.all([
        api.getDashboardStats().catch(() => null),
        api.getReagents({ page: 1, per_page: 1 }).catch(() => null),
        api.getAllBatches({ page: 1, per_page: 1 }).catch(() => null),
        api.getLowStockItems(10).catch(() => []),
        api.getExpiringItems(30).catch(() => [])
      ]);

      const newStats = {
        total_reagents: statsData?.total_reagents || reagentsData?.total || 0,
        total_batches: statsData?.total_batches || batchesData?.total || 0,
        low_stock: statsData?.low_stock || lowStockData?.length || 0,
        expiring_soon: statsData?.expiring_soon || expiringData?.length || 0
      };

      setStats(newStats);
      if (showToast) {
        showToast('Dashboard data loaded successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      if (showToast) {
        showToast('Failed to load dashboard data', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadRecentActivity = async () => {
    // Simulate recent activity - replace with actual API call
    const activities = [
      { id: 1, type: 'reagent_added', message: 'New reagent "Sodium Chloride" added', time: '2 hours ago', icon: 'fas fa-plus-circle', color: 'success' },
      { id: 2, type: 'batch_used', message: 'Used 50g from batch #B-2024-001', time: '3 hours ago', icon: 'fas fa-flask', color: 'info' },
      { id: 3, type: 'low_stock', message: 'Ethanol running low (< 100mL)', time: '5 hours ago', icon: 'fas fa-exclamation-triangle', color: 'warning' },
      { id: 4, type: 'batch_expired', message: 'Batch #B-2023-145 expired', time: '1 day ago', icon: 'fas fa-calendar-times', color: 'danger' }
    ];
    setRecentActivity(activities);
  };

  const setupQuickActions = () => {
    const actions = [];
    
    if (canCreateReagents()) {
      actions.push({
        id: 'add-reagent',
        label: 'Add Reagent',
        icon: 'fas fa-plus',
        color: 'primary',
        action: () => handleNavigate('reagents')
      });
    }
    
    actions.push({
      id: 'view-reports',
      label: 'View Reports',
      icon: 'fas fa-chart-bar',
      color: 'secondary',
      action: () => handleNavigate('reports')
    });
    
    if (canManageEquipment()) {
      actions.push({
        id: 'manage-equipment',
        label: 'Equipment',
        icon: 'fas fa-tools',
        color: 'secondary',
        action: () => handleNavigate('equipment')
      });
    }
    
    if (isAdmin()) {
      actions.push({
        id: 'manage-users',
        label: 'Manage Users',
        icon: 'fas fa-users',
        color: 'secondary',
        action: () => handleNavigate('users')
      });
    }
    
    setQuickActions(actions);
  };

  const handleNavigate = (page) => {
    if (onNavigate && typeof onNavigate === 'function') {
      onNavigate(page);
    } else {
      console.warn('onNavigate function not provided to Dashboard');
    }
  };

  const canCreateReagents = () => ['Admin', 'Researcher'].includes(user?.role);
  const canManageEquipment = () => ['Admin', 'Researcher'].includes(user?.role);
  const isAdmin = () => user?.role === 'Admin';

  const statsConfig = [
    {
      key: 'total_reagents',
      label: 'Total Reagents',
      icon: 'fas fa-vial',
      color: 'primary',
      onClick: () => handleNavigate('reagents'),
      trend: { direction: 'up', value: 12, description: 'vs last month' }
    },
    {
      key: 'total_batches',
      label: 'Total Batches',
      icon: 'fas fa-boxes',
      color: 'success',
      onClick: () => handleNavigate('reagents'),
      trend: { direction: 'up', value: 8 }
    },
    {
      key: 'low_stock',
      label: 'Low Stock Items',
      icon: 'fas fa-exclamation-triangle',
      color: 'warning',
      onClick: () => handleNavigate('reports'),
      trend: stats.low_stock > 0 ? { direction: 'up', value: 5 } : null
    },
    {
      key: 'expiring_soon',
      label: 'Expiring Soon',
      icon: 'fas fa-clock',
      color: 'danger',
      onClick: () => handleNavigate('reports'),
      trend: stats.expiring_soon > 0 ? { direction: 'down', value: 3 } : null
    }
  ];

  return (
    <div className="dashboard">
      {loading && <LoadingOverlay />}
      
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Welcome back, {user?.username}!</p>
          </div>
          <div className="page-header-actions">
            <Button variant="primary" onClick={loadDashboardData}>
              <i className="fas fa-sync"></i>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Stats Cards Section */}
        <div className="dashboard-section stats-section">
          <div className="stats-grid">
            {statsConfig.map(stat => (
              <StatsCard
                key={stat.key}
                value={stats[stat.key]}
                label={stat.label}
                icon={stat.icon}
                color={stat.color}
                onClick={stat.onClick}
                trend={stat.trend}
                loading={loading}
              />
            ))}
          </div>
        </div>

        <div className="dashboard-row">
          {/* Quick Actions */}
          <div className="dashboard-section quick-actions-section">
            <div className="section-header">
              <h2 className="section-title">
                <i className="fas fa-rocket"></i>
                Quick Actions
              </h2>
            </div>
            <div className="quick-actions-grid">
              {quickActions.map(action => (
                <button
                  key={action.id}
                  className={`quick-action-card btn-${action.color}`}
                  onClick={action.action}
                >
                  <i className={`${action.icon} quick-action-icon`}></i>
                  <span className="quick-action-label">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="dashboard-section recent-activity-section">
            <div className="section-header">
              <h2 className="section-title">
                <i className="fas fa-history"></i>
                Recent Activity
              </h2>
              <button className="btn-link">View All</button>
            </div>
            <div className="activity-timeline">
              {recentActivity.map(activity => (
                <div key={activity.id} className="activity-item">
                  <div className={`activity-icon ${activity.color}`}>
                    <i className={activity.icon}></i>
                  </div>
                  <div className="activity-content">
                    <p className="activity-message">{activity.message}</p>
                    <span className="activity-time">{activity.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Charts Section (placeholder) */}
        <div className="dashboard-row">
          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2 className="section-title">
                <i className="fas fa-chart-line"></i>
                Inventory Trends
              </h2>
            </div>
            <div className="chart-placeholder">
              <div className="chart-skeleton">
                <i className="fas fa-chart-area"></i>
                <p>Inventory usage chart</p>
              </div>
            </div>
          </div>

          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2 className="section-title">
                <i className="fas fa-chart-pie"></i>
                Stock Distribution
              </h2>
            </div>
            <div className="chart-placeholder">
              <div className="chart-skeleton">
                <i className="fas fa-chart-pie"></i>
                <p>Stock by category</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;