import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import InstallPrompt from './components/InstallPrompt';
import Login from './pages/Login';
import ChangePasswordPage from './pages/ChangePasswordPage';
import CashierLayout from './pages/cashier/CashierLayout';
import ManagerLayout from './pages/manager/ManagerLayout';
import Dashboard from './pages/manager/Dashboard';
import SalesPage from './pages/manager/SalesPage';
import ExpensesPage from './pages/manager/ExpensesPage';
import PurchasesPage from './pages/manager/PurchasesPage';
import InventoryPage from './pages/manager/InventoryPage';
import ProductsPage from './pages/manager/ProductsPage';
import SuppliersPage from './pages/manager/SuppliersPage';
import KegPage from './pages/manager/KegPage';
import CLBPage from './pages/manager/CLBPage';
import CashManagement from './pages/manager/CashManagement';
import ReportsPage from './pages/manager/ReportsPage';
import CashierPerformance from './pages/manager/CashierPerformance';
import SettingsPage from './pages/manager/SettingsPage';

function PrivateRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{padding: '40px', textAlign: 'center'}}>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'cashier' ? '/cashier' : '/manager'} />;
  }
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  
  if (loading) return <div style={{padding: '40px', textAlign: 'center'}}>Loading...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'cashier' ? '/cashier' : '/manager'} /> : <Login />} />
      <Route path="/change-password" element={
        !user ? <Navigate to="/login" /> : <ChangePasswordPage />
      } />
      
      {/* Cashier Routes */}
      <Route path="/cashier" element={
        <PrivateRoute><CashierLayout /></PrivateRoute>
      } />
      
      {/* Manager Routes */}
      <Route path="/manager" element={
        <PrivateRoute role="manager"><ManagerLayout /></PrivateRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="kegs" element={<KegPage />} />
        <Route path="clb" element={<CLBPage />} />
        <Route path="cash" element={<CashManagement />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="cashier-performance" element={<CashierPerformance />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <InstallPrompt />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
