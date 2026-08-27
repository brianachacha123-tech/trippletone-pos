import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ManagerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
    { to: '/manager/kegs', icon: '🍺', label: 'Keg Management' },
    { to: '/manager/clb', icon: '🍸', label: 'CLB Management' },
    { to: '/manager/cash', icon: '💵', label: 'Cash Management' },
    { to: '/manager/reports', icon: '📈', label: 'Reports' },
    { to: '/manager/cashier-performance', icon: '👥', label: 'Cashier Performance' },
    { to: '/manager/settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <div className="app-layout">
      <aside className="sidebar">
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
    </div>
  );
}
