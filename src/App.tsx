import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Spinner } from '@heroui/react';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { ThemeProvider } from './contexts/ThemeContext';
import { PreciosActualesProvider } from './contexts/PreciosActualesContext';
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import Login from './pages/Login';
import LaLigaAuth from './pages/LaLigaAuth';
import LeagueSelector from './pages/LeagueSelector';
import Dashboard from './pages/Dashboard';
import Activity from './pages/Activity';
import Market from './pages/Market';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function InitAuth({ children }: { children: React.ReactNode }) {
  const initFromStorage = useAuthStore((s) => s.initFromStorage);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initFromStorage().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <InitAuth>
        <ThemeProvider>
          <PreciosActualesProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/laliga-auth" element={
              <ProtectedRoute>
                <LaLigaAuth />
              </ProtectedRoute>
            } />
            <Route path="/select-league" element={
              <ProtectedRoute>
                <LeagueSelector />
              </ProtectedRoute>
            } />
            <Route element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route path="/" element={<Dashboard />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/market" element={<Market />} />
            </Route>
          </Routes>
          </BrowserRouter>
          </PreciosActualesProvider>
        </ThemeProvider>
      </InitAuth>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}

export default App;
