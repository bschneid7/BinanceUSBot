import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

// Define a simple loading component (or import a more complex one)
const LoadingSpinner = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    Loading authentication...
  </div>
);

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth(); // <-- Get isLoading state
  const location = useLocation();

  if (isLoading) {
    // Show loading indicator while checking auth status
    console.log('[ProtectedRoute] Auth is loading...');
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    // Redirect to login if not authenticated *after* loading is complete
    console.log('[ProtectedRoute] Not authenticated, redirecting to login.');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Render children if authenticated and loading is complete
  console.log('[ProtectedRoute] Authenticated, rendering children.');
  return <>{children}</>;
}

