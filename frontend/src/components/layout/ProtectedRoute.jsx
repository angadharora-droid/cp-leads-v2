import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { hasModule, homeFor } from '@/lib/modules';
import { Spinner } from '@/components/ui/spinner';

/**
 * Guards a route subtree.
 * - While auth is bootstrapping -> full-screen spinner.
 * - Unauthenticated -> redirect to /login (preserving the attempted path).
 * - Authenticated but lacking `requiredRole` -> redirect to '/'.
 * - Authenticated but without `module` assigned -> redirect to their own home.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.requiredRole] e.g. 'admin'
 * @param {string} [props.module] e.g. 'leads' | 'prospectus'
 */
function ProtectedRoute({ children, requiredRole, module }) {
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

  if (requiredRole && !(Array.isArray(requiredRole) ? requiredRole : [requiredRole]).includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  // A section the account has not been given opens on the one it does have.
  if (module && !hasModule(user, module)) {
    return <Navigate to={homeFor(user)} replace />;
  }

  return children;
}

export { ProtectedRoute };
export default ProtectedRoute;
