import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const laligaAuthenticated = useAuthStore((s) => s.laligaAuthenticated);
  const leagueId = useAuthStore((s) => s.leagueId);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!laligaAuthenticated && location.pathname !== '/laliga-auth') {
    return <Navigate to="/laliga-auth" replace />;
  }
  if (!leagueId && location.pathname !== '/select-league' && location.pathname !== '/laliga-auth') {
    return <Navigate to="/select-league" replace />;
  }

  return <>{children}</>;
}
