import { Outlet, Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Trophy, ShoppingCart, Shield, TrendingUp, LogOut, ChevronRight, Activity, Moon, Sun } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../contexts/ThemeContext';

const menuItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/activity', label: 'Actividad', icon: Activity },
  { path: '/standings', label: 'Clasificación', icon: Trophy },
  { path: '/market', label: 'Mercado', icon: ShoppingCart },
  { path: '/clauses', label: 'Cláusulas', icon: Shield },
  { path: '/rentabilidad', label: 'Rentabilidad', icon: TrendingUp },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const leagueName = useAuthStore((s) => s.leagueName);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <aside className={`sidebar ${theme === 'dark' ? 'dark' : ''}`}>
        <div className={`p-5 border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
          <h1 className="text-xl font-bold text-white tracking-tight">Fantasy</h1>
          {leagueName && (
            <button
              onClick={() => navigate('/select-league')}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 mt-1.5 truncate w-full text-left transition-colors"
              title="Cambiar liga"
            >
              <span className="truncate">{leagueName}</span>
              <ChevronRight className="w-3 h-3 flex-shrink-0" />
            </button>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <RouterLink
                key={item.path}
                to={item.path}
                className={`sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </RouterLink>
            );
          })}
        </nav>
        <div className={`p-3 border-t ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} space-y-1`}>
          <button
            onClick={toggleTheme}
            className="sidebar-link sidebar-link-inactive w-full"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
          <button
            onClick={() => logout()}
            className="sidebar-link sidebar-link-inactive w-full"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
