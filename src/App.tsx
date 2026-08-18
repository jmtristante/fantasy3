import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Spinner } from '@heroui/react';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import Login from './pages/Login';
import LaLigaAuth from './pages/LaLigaAuth';
import LeagueSelector from './pages/LeagueSelector';
import Dashboard from './pages/Dashboard';

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
            </Route>
          </Routes>
        </BrowserRouter>
      </InitAuth>
    </QueryClientProvider>
  );
}

export default App;
