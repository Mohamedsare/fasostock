import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Login from './pages/Login';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ShopProvider } from './components/context/ShopContext';
import { ThemeProvider } from './components/context/ThemeContext';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const location = useLocation();
  const { isLoadingAuth, isAuthenticated, authError, navigateToLogin } = useAuth();
  const isLoginPage = location.pathname === '/Login' || location.pathname === '/login';

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 bg-slate-50 dark:bg-[#0F172A] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-300 dark:border-slate-700 border-t-orange-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isLoginPage) {
    return isAuthenticated ? <Navigate to="/" replace /> : <Login />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0F172A] flex items-center justify-center p-4">
        <div className="text-center text-slate-600 dark:text-slate-400">
          <p>{authError.message}</p>
          <button onClick={() => navigateToLogin()} className="mt-4 text-orange-500 dark:text-orange-400 hover:underline">
            Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <ShopProvider>
      <Routes>
        <Route path="/" element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        } />
        {Object.entries(Pages).map(([path, Page]) => {
          if (path === 'Login') return null;
          return (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <LayoutWrapper currentPageName={path}>
                  <Page />
                </LayoutWrapper>
              }
            />
          );
        })}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </ShopProvider>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
