import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function SettingsPage() {
  const [tab, setTab] = useState('business');
  const [settings, setSettings] = useState({ business_name: '', business_phone: '', business_location: '', currency: 'KSh', tax_rate: 0 });
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ username: '', password: '', full_name: '', role: 'cashier', phone: '', email: '' });
  const [resetPwdUser, setResetPwdUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => { loadSettings(); loadUsers(); loadAuditLogs(); }, []);

  const loadSettings = async () => {
    try { const res = await api.get('/settings'); setSettings(res.data); } catch (err) { console.error(err); }
  };

  const loadUsers = async () => {
    try { const res = await api.get('/settings/users'); setUsers(res.data); } catch (err) { console.error(err); }
  };

  const loadAuditLogs = async () => {
    try { const res = await api.get('/settings/audit-logs'); setAuditLogs(res.data); } catch (err) { console.error(err); }
  };

  const saveSettings = async () => {
    try { await api.put('/settings', settings); alert('Settings saved!'); } catch (err) { alert('Error saving'); }
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.put(`/settings/users/${editingUser.id}`, userForm);
      } else {
        await api.post('/settings/users', userForm);
      }
      setShowUserModal(false);
      setEditingUser(null);
      setUserForm({ username: '', password: '', full_name: '', role: 'cashier', phone: '', email: '' });
      loadUsers();
    } catch (err) { alert(err.response?.data?.error || 'Error saving user'); }
  };

  const resetPassword = async () => {
    try {
      await api.put(`/settings/users/${resetPwdUser.id}/reset-password`, { new_password: newPassword });
      setResetPwdUser(null);
      setNewPassword('');
      alert('Password reset successfully');
    } catch (err) { alert('Error resetting password'); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>⚙️ Settings</h1>
        <p>Manage business settings, users, and system configuration</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'business' ? 'active' : ''}`} onClick={() => setTab('business')}>Business Info</button>
        <button className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Users</button>
        <button className={`tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>Audit Log</button>
      </div>

      {tab === 'business' && (
        <div className="card" style={{ maxWidth: '600px' }}>
          <h3 style={{ marginBottom: '20px' }}>Business Information</h3>
          <div className="form-group"><label>Business Name</label><input type="text" value={settings.business_name || ''} onChange={e => setSettings({...settings, business_name: e.target.value})} /></div>
          <div className="form-group"><label>Business Phone</label><input type="text" value={settings.business_phone || ''} onChange={e => setSettings({...settings, business_phone: e.target.value})} /></div>
          <div className="form-group"><label>Business Location</label><input type="text" value={settings.business_location || ''} onChange={e => setSettings({...settings, business_location: e.target.value})} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group"><label>Currency</label><input type="text" value={settings.currency || 'KSh'} onChange={e => setSettings({...settings, currency: e.target.value})} /></div>
            <div className="form-group"><label>Tax Rate (%)</label><input type="number" step="0.01" value={settings.tax_rate || 0} onChange={e => setSettings({...settings, tax_rate: e.target.value})} /></div>
          </div>
          <button className="btn btn-primary" onClick={saveSettings}>Save Settings</button>
        </div>
      )}

      {tab === 'users' && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <button className="btn btn-primary" onClick={() => { setEditingUser(null); setUserForm({ username: '', password: '', full_name: '', role: 'cashier', phone: '', email: '' }); setShowUserModal(true); }}>+ Add User</button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Username</th><th>Full Name</th><th>Role</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td>{u.full_name}</td>
                    <td><span className={`badge badge-${u.role === 'manager' ? 'info' : 'success'}`}>{u.role}</span></td>
                    <td>{u.phone || '-'}</td>
                    <td><span className={`badge badge-${u.is_active ? 'success' : 'danger'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => { setEditingUser(u); setUserForm({ username: u.username, full_name: u.full_name, role: u.role, phone: u.phone || '', email: u.email || '', is_active: u.is_active }); setShowUserModal(true); }} style={{ marginRight: '4px' }}>Edit</button>
                      <button className="btn btn-sm btn-warning" onClick={() => setResetPwdUser(u)}>Reset Password</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'audit' && (
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Date</th><th>User</th><th>Action</th><th>Details</th></tr>
            </thead>
            <tbody>
              {auditLogs.map(log => (
                <tr key={log.id}>
                  <td>{new Date(log.date).toLocaleString()}</td>
                  <td style={{ fontWeight: 600 }}>{log.user_name}</td>
                  <td><span className="badge badge-info">{log.action}</span></td>
                  <td>{log.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="modal-overlay" onClick={() => setShowUserModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editingUser ? 'Edit User' : 'Add User'}</h2>
            <form onSubmit={handleUserSubmit}>
              {!editingUser && <div className="form-group"><label>Username</label><input type="text" value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} required /></div>}
              {!editingUser && <div className="form-group"><label>Password</label><input type="password" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} required /></div>}
              <div className="form-group"><label>Full Name</label><input type="text" value={userForm.full_name} onChange={e => setUserForm({...userForm, full_name: e.target.value})} required /></div>
              <div className="form-group">
                <label>Role</label>
                <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div className="form-group"><label>Phone</label><input type="text" value={userForm.phone} onChange={e => setUserForm({...userForm, phone: e.target.value})} /></div>
              <div className="form-group"><label>Email</label><input type="email" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowUserModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingUser ? 'Update' : 'Create'} User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPwdUser && (
        <div className="modal-overlay" onClick={() => setResetPwdUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Reset Password for {resetPwdUser.username}</h2>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setResetPwdUser(null)}>Cancel</button>
              <button className="btn btn-warning" onClick={resetPassword}>Reset Password</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
