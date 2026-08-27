import { Outlet, Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Trophy, ShoppingCart, Shield, TrendingUp, LogOut, Moon, Sun, Swords, Calendar, Wallet, Activity, Search } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../contexts/ThemeContext';

// Main tabs for mobile bottom nav
const mainTabs = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/lineup', label: 'Juego', icon: Swords, children: [
    { path: '/lineup', label: 'Alineación' },
    { path: '/jornadas', label: 'Jornadas' },
    { path: '/standings', label: 'Clasificación' },
  ]},
  { path: '/market', label: 'Mercado', icon: ShoppingCart, children: [
    { path: '/market', label: 'Mercado' },
    { path: '/clauses', label: 'Cláusulas' },
    { path: '/busqueda', label: 'Buscar' },
  ]},
  { path: '/equipos', label: 'Datos', icon: Wallet, children: [
    { path: '/equipos', label: 'Equipos' },
    { path: '/activity', label: 'Movimientos' },
    { path: '/rentabilidad', label: 'Rentabilidad' },
  ]},
];

// Desktop sidebar items (all routes)
const desktopItems = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/lineup', label: 'Alineación', icon: Swords },
  { path: '/jornadas', label: 'Jornadas', icon: Calendar },
  { path: '/market', label: 'Mercado', icon: ShoppingCart },
  { path: '/clauses', label: 'Cláusulas', icon: Shield },
  { path: '/busqueda', label: 'Buscar', icon: Search },
  { path: '/equipos', label: 'Equipos', icon: Wallet },
  { path: '/standings', label: 'Clasif.', icon: Trophy },
  { path: '/activity', label: 'Movim.', icon: Activity },
  { path: '/rentabilidad', label: 'Rentab.', icon: TrendingUp },
];

function getActiveTab(pathname: string) {
  for (const tab of mainTabs) {
    if (tab.children) {
      if (tab.children.some(c => pathname === c.path || pathname.startsWith(c.path + '/'))) return tab;
    }
    if (pathname === tab.path) return tab;
  }
  return mainTabs[0];
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { theme, toggleTheme } = useTheme();

  const activeTab = getActiveTab(location.pathname);
  const subTabs = activeTab?.children || [];

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Sidebar - desktop only */}
      <aside className={`hidden md:flex sidebar ${theme === 'dark' ? 'dark' : ''}`}>
        <div className={`p-5 border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
          <h1 className="text-xl font-bold text-primary">Fantasy</h1>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {desktopItems.map((item) => {
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
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        {/* Sub-tabs - mobile only */}
        {subTabs.length > 0 && (
          <div className="md:hidden sticky top-0 z-30 flex border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-sm">
            {subTabs.map((sub) => {
              const isActive = location.pathname === sub.path;
              return (
                <RouterLink
                  key={sub.path}
                  to={sub.path}
                  className={`flex-1 py-3 text-center text-[11px] font-semibold tracking-wide transition-all ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400 border-b-[3px] border-indigo-600 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20'
                      : 'text-gray-400 dark:text-gray-500 border-b-[3px] border-transparent hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  {sub.label}
                </RouterLink>
              );
            })}
          </div>
        )}
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav - mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-40">
        <div className="flex items-center justify-around py-1.5">
          {mainTabs.map((tab) => {
            const isActive = activeTab?.path === tab.path;
            return (
              <RouterLink
                key={tab.path}
                to={tab.path}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
                  isActive ? 'text-primary' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </RouterLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
