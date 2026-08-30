import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ManagerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/manager', icon: '📊', label: 'Dashboard', end: true },
    { to: '/manager/sales', icon: '💰', label: 'Sales' },
    { to: '/manager/expenses', icon: '💸', label: 'Expenses' },
    { to: '/manager/purchases', icon: '📦', label: 'Purchases' },
    { to: '/manager/inventory', icon: '🏪', label: 'Inventory' },
    { to: '/manager/products', icon: '🏷️', label: 'Products' },
    { to: '/manager/suppliers', icon: '🤝', label: 'Suppliers' },
    { to: '/manager/kegs', icon: '🍺', label: 'Kegs' },
    { to: '/manager/clb', icon: '🍸', label: 'CLB' },
    { to: '/manager/cash', icon: '💵', label: 'Cash' },
    { to: '/manager/reports', icon: '📈', label: 'Reports' },
    { to: '/manager/cashier-performance', icon: '👥', label: 'Cashiers' },
    { to: '/manager/settings', icon: '⚙️', label: 'Settings' },
  ];

  // Bottom nav items (compact subset for mobile)
  const bottomNavItems = [
    { to: '/manager', icon: '📊', label: 'Dashboard', end: true },
    { to: '/manager/sales', icon: '💰', label: 'Sales' },
    { to: '/manager/products', icon: '🏷️', label: 'Products' },
    { to: '/manager/inventory', icon: '🏪', label: 'Stock' },
    { to: '/manager/reports', icon: '📈', label: 'Reports' },
    { to: '/manager/settings', icon: '⚙️', label: 'More' },
  ];

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-layout">
      {/* Mobile hamburger button */}
      <button
        className="mobile-hamburger"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle navigation"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar overlay for mobile */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <h2>🍺 Trippletone Bar</h2>
          <p>Manager Back Office</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => isActive ? 'active' : ''}
              onClick={closeSidebar}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            👤 {user?.full_name} • Manager
          </div>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="mobile-bottom-nav">
        <div className="mobile-bottom-nav-inner">
          {bottomNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
