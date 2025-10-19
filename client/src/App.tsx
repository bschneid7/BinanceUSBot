import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/ui/theme-provider';
import { Toaster } from './components/ui/toaster';
import { AuthProvider } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Positions } from './pages/Positions';
import { TradeHistory } from './pages/TradeHistory';
import { Analytics } from './pages/Analytics';
import { Configuration } from './pages/Configuration';
import { Account } from "./pages/Account";
import { TaxReports } from './pages/TaxReports';
import { Controls } from './pages/Controls';
import { BlankPage } from './pages/BlankPage';
import MLDashboard from './pages/MLDashboard';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider defaultTheme="light" storageKey="ui-theme">
        <Router>
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
        </Router>
        <Toaster />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;