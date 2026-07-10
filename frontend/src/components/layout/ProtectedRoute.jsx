import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/spinner';

/**
 * Guards a route subtree.
 * - While auth is bootstrapping -> full-screen spinner.
 * - Unauthenticated -> redirect to /login (preserving the attempted path).
 * - Authenticated but lacking `requiredRole` -> redirect to '/'.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.requiredRole] e.g. 'admin'
 */
function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export { ProtectedRoute };
export default ProtectedRoute;
