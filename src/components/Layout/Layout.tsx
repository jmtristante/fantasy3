import { Outlet, Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Trophy, ShoppingCart, Shield, TrendingUp, LogOut, Moon, Sun, Swords, Calendar, Wallet, Activity, Search } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../contexts/ThemeContext';

const menuItems = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/lineup', label: 'Alineación', icon: Swords },
  { path: '/jornadas', label: 'Jornadas', icon: Calendar },
  { path: '/market', label: 'Mercado', icon: ShoppingCart },
  { path: '/busqueda', label: 'Buscar', icon: Search },
  { path: '/equipos', label: 'Equipos', icon: Wallet },
  { path: '/standings', label: 'Clasif.', icon: Trophy },
  { path: '/activity', label: 'Movim.', icon: Activity },
  { path: '/rentabilidad', label: 'Rentab.', icon: TrendingUp },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const leagueName = useAuthStore((s) => s.leagueName);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Sidebar - desktop only */}
      <aside className={`hidden md:flex sidebar ${theme === 'dark' ? 'dark' : ''}`}>
        <div className={`p-5 border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
          <h1 className="text-xl font-bold text-primary">Fantasy</h1>
          {leagueName && (
            <button
              onClick={() => navigate('/select-league')}
              className="flex items-center gap-1 text-xs text-muted hover:text-foreground mt-1.5 truncate w-full text-left transition-colors"
            >
              <span className="truncate">{leagueName}</span>
            </button>
          )}
        </div>
        <nav className="flex-1 p-2 space-y-1">
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
          <button onClick={toggleTheme} className="sidebar-link sidebar-link-inactive w-full">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Claro' : 'Oscuro'}
          </button>
          <button onClick={() => logout()} className="sidebar-link sidebar-link-inactive w-full">
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav - mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-40">
        <div className="flex items-center overflow-x-auto scrollbar-hide py-2 px-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <RouterLink
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors flex-shrink-0 ${
                  isActive ? 'text-primary' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
              </RouterLink>
            );
          })}
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-gray-400 dark:text-gray-500 flex-shrink-0"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-medium whitespace-nowrap">Salir</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
