import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/ui/theme-provider';
import { Toaster } from './components/ui/toaster';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';

// Eager load auth pages (needed immediately)
import { Login } from './pages/Login';
import { Register } from './pages/Register';

// Lazy load all other pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Positions = lazy(() => import('./pages/Positions').then(m => ({ default: m.Positions })));
const TradeHistory = lazy(() => import('./pages/TradeHistory').then(m => ({ default: m.TradeHistory })));
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));
const Configuration = lazy(() => import('./pages/Configuration').then(m => ({ default: m.Configuration })));
const Account = lazy(() => import('./pages/Account').then(m => ({ default: m.Account })));
const TaxReports = lazy(() => import('./pages/TaxReports').then(m => ({ default: m.TaxReports })));
const Controls = lazy(() => import('./pages/Controls').then(m => ({ default: m.Controls })));
const MLDashboard = lazy(() => import('./pages/MLDashboard'));
const BlankPage = lazy(() => import('./pages/BlankPage').then(m => ({ default: m.BlankPage })));

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <ThemeProvider defaultTheme="light" storageKey="ui-theme">
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="positions" element={<Positions />} />
                <Route path="trades" element={<TradeHistory />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="config" element={<Configuration />} />
                <Route path="account" element={<Account />} />
                <Route path="tax" element={<TaxReports />} />
                <Route path="controls" element={<Controls />} />
                <Route path="ml" element={<MLDashboard />} />
              </Route>
              <Route path="*" element={<BlankPage />} />
            </Routes>
          </Suspense>
        </Router>
        <Toaster />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;

