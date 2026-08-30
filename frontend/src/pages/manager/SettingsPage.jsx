import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    business_name: '',
    business_phone: '',
    business_location: '',
    currency: 'KSh',
    tax_rate: 0,
    week_start_day: 1,
    keg_profit_limit: 5000
  });
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', full_name: '', role: 'cashier', phone: '', email: '' });
  const [activeTab, setActiveTab] = useState('business');

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [settingsRes, usersRes, logsRes] = await Promise.all([
        api.get('/settings'),
        api.get('/settings/users'),
        api.get('/settings/audit-logs?limit=50')
      ]);
      setSettings(settingsRes.data);
      setUsers(usersRes.data);
      setAuditLogs(logsRes.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      alert('Settings saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save settings');
    }
    setSaving(false);
  };

  const addUser = async () => {
    try {
      await api.post('/settings/users', newUser);
      setShowAddUser(false);
      setNewUser({ username: '', password: '', full_name: '', role: 'cashier', phone: '', email: '' });
      loadSettings();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add user');
    }
  };

  const toggleUser = async (userId, isActive) => {
    try {
      const user = users.find(u => u.id === userId);
      await api.put(`/settings/users/${userId}`, { ...user, is_active: !isActive });
      loadSettings();
    } catch (err) { console.error(err); }
  };

  const weekDays = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading settings...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>⚙️ Settings</h1>
        <p>Configure business settings, users, and system preferences</p>
      </div>

      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '4px', 
        marginBottom: '24px',
        padding: '4px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #eee'
      }}>
        {[
          { id: 'business', label: '💼 Business', icon: '💼' },
          { id: 'weekly', label: '📅 Weekly Config', icon: '📅' },
          { id: 'keg', label: '🍺 Keg Settings', icon: '🍺' },
          { id: 'users', label: '👥 Users', icon: '👥' },
          { id: 'audit', label: '📋 Audit Logs', icon: '📋' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? '600' : '400',
              backgroundColor: activeTab === tab.id ? '#fff' : 'transparent',
              color: activeTab === tab.id ? '#0f3460' : '#666',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Business Settings */}
      {activeTab === 'business' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '16px' }}>Business Information</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>Business Name</label>
              <input 
                type="text" 
                value={settings.business_name} 
                onChange={e => setSettings({...settings, business_name: e.target.value})}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>Phone</label>
              <input 
                type="tel" 
                value={settings.business_phone} 
                onChange={e => setSettings({...settings, business_phone: e.target.value})}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>Location</label>
              <input 
                type="text" 
                value={settings.business_location} 
                onChange={e => setSettings({...settings, business_location: e.target.value})}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>Currency</label>
              <input 
                type="text" 
                value={settings.currency} 
                onChange={e => setSettings({...settings, currency: e.target.value})}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>Tax Rate (%)</label>
              <input 
                type="number" 
                value={settings.tax_rate} 
                onChange={e => setSettings({...settings, tax_rate: parseFloat(e.target.value) || 0})}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                min="0"
                max="100"
                step="0.1"
              />
            </div>
          </div>
          
          <div style={{ marginTop: '24px' }}>
            <button 
              className="btn btn-primary" 
              onClick={saveSettings}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Weekly Configuration */}
      {activeTab === 'weekly' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '16px' }}>📅 Weekly Configuration</h3>
          
          <div style={{ 
            padding: '16px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '8px', 
            marginBottom: '24px',
            borderLeft: '4px solid #0f3460'
          }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>
              <strong>Weekly Reset:</strong> Configure when your business week starts. 
              At the end of each week, a report will be generated and the dashboard will reset 
              to start tracking a new week.
            </p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                Week Starts On
              </label>
              <select 
                value={settings.week_start_day} 
                onChange={e => setSettings({...settings, week_start_day: parseInt(e.target.value)})}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                {weekDays.map(day => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
              <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                Current week: {weekDays.find(d => d.value === settings.week_start_day)?.label}
              </p>
            </div>
          </div>
          
          <div style={{ 
            marginTop: '24px',
            padding: '16px',
            backgroundColor: '#e8f5e9',
            borderRadius: '8px'
          }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#2e7d32' }}>
              ℹ️ How Weekly Reset Works
            </h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#333' }}>
              <li>At the end of each week, a comprehensive report is generated</li>
              <li>The dashboard resets to start tracking a new week</li>
              <li>Money available for keg purchases is calculated from the week's profit</li>
              <li>Total business profit accumulates across weeks</li>
              <li>Stock value remains constant (not affected by weekly reset)</li>
            </ul>
          </div>
          
          <div style={{ marginTop: '24px' }}>
            <button 
              className="btn btn-primary" 
              onClick={saveSettings}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Weekly Config'}
            </button>
          </div>
        </div>
      )}

      {/* Keg Settings */}
      {activeTab === 'keg' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '16px' }}>🍺 Keg Profit Settings</h3>
          
          <div style={{ 
            padding: '16px', 
            backgroundColor: '#fff3e0', 
            borderRadius: '8px', 
            marginBottom: '24px',
            borderLeft: '4px solid #f39c12'
          }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>
              <strong>Profit Limit:</strong> Set the profit limit for each keg. 
              When a keg reaches this limit, it will be highlighted in green. 
              Keg profits are added to your total business profit.
            </p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                Keg Profit Limit (KSh)
              </label>
              <input 
                type="number" 
                value={settings.keg_profit_limit} 
                onChange={e => setSettings({...settings, keg_profit_limit: parseFloat(e.target.value) || 5000})}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                min="0"
                step="100"
              />
              <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                Current limit: KSh {settings.keg_profit_limit?.toLocaleString()}
              </p>
            </div>
          </div>
          
          <div style={{ 
            marginTop: '24px',
            padding: '16px',
            backgroundColor: '#f3e5f5',
            borderRadius: '8px'
          }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#6a1b9a' }}>
              📊 Keg Status Indicators
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#27ae60' }} />
                <span style={{ fontSize: '13px' }}>✅ Limit Reached (Green)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#f39c12' }} />
                <span style={{ fontSize: '13px' }}>⚠️ Approaching Limit (Orange)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#3498db' }} />
                <span style={{ fontSize: '13px' }}>📈 On Track (Blue)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#9b59b6' }} />
                <span style={{ fontSize: '13px' }}>🌱 Early Stage (Purple)</span>
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: '24px' }}>
            <button 
              className="btn btn-primary" 
              onClick={saveSettings}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Keg Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>👥 User Management</h3>
            <button className="btn btn-primary" onClick={() => setShowAddUser(true)}>+ Add User</button>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Full Name</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 600 }}>{user.username}</td>
                    <td>{user.full_name}</td>
                    <td><span className={`badge badge-${user.role === 'manager' ? 'info' : 'success'}`}>{user.role}</span></td>
                    <td>{user.phone || '-'}</td>
                    <td><span className={`badge badge-${user.is_active ? 'success' : 'danger'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <button 
                        className="btn btn-sm btn-outline"
                        onClick={() => toggleUser(user.id, user.is_active)}
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Logs Tab */}
      {activeTab === 'audit' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '16px' }}>📋 Audit Logs</h3>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>Date</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>User</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>Action</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px', fontSize: '13px' }}>
                      {new Date(log.date).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px', fontSize: '13px', fontWeight: '500' }}>
                      {log.user_name}
                    </td>
                    <td style={{ padding: '10px', fontSize: '13px' }}>
                      {log.action}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#666' }}>
                      {log.details || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <div className="modal-overlay" onClick={() => setShowAddUser(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add New User</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Username</label>
                <input 
                  type="text" 
                  value={newUser.username} 
                  onChange={e => setNewUser({...newUser, username: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Password</label>
                <input 
                  type="password" 
                  value={newUser.password} 
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Full Name</label>
                <input 
                  type="text" 
                  value={newUser.full_name} 
                  onChange={e => setNewUser({...newUser, full_name: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Role</label>
                <select 
                  value={newUser.role} 
                  onChange={e => setNewUser({...newUser, role: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                >
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Phone</label>
                <input 
                  type="tel" 
                  value={newUser.phone} 
                  onChange={e => setNewUser({...newUser, phone: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Email</label>
                <input 
                  type="email" 
                  value={newUser.email} 
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowAddUser(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addUser}>Add User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
