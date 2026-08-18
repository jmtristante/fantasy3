import { Outlet, Link as RouterLink, useLocation } from 'react-router-dom';
import { Home, Trophy, ShoppingCart, Shield, TrendingUp, LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

const menuItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/standings', label: 'Clasificación', icon: Trophy },
  { path: '/market', label: 'Mercado', icon: ShoppingCart },
  { path: '/clauses', label: 'Cláusulas', icon: Shield },
  { path: '/rentabilidad', label: 'Rentabilidad', icon: TrendingUp },
];

export default function Layout() {
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const leagueName = useAuthStore((s) => s.leagueName);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-divider flex flex-col">
        <div className="p-4 border-b border-divider">
          <h1 className="text-xl font-bold text-primary">Fantasy</h1>
          {leagueName && <p className="text-xs text-muted truncate">{leagueName}</p>}
        </div>
        <nav className="flex-1 p-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <RouterLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground/70 hover:bg-default-100'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </RouterLink>
            );
          })}
        </nav>
        <div className="p-2 border-t border-divider">
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground/70 hover:bg-default-100 w-full"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
