import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import { isAppPath, resolvePathAlias } from "@/appRoutes";

const queryClient = new QueryClient();

/**
 * Single authenticated shell for all workspace URLs.
 * One mounted Index instance — pathname alone drives module / tab / document.title.
 */
function AppShell() {
  const location = useLocation();
  const alias = resolvePathAlias(location.pathname);
  if (alias) {
    return <Navigate to={`${alias}${location.search}${location.hash}`} replace />;
  }
  if (!isAppPath(location.pathname)) {
    return <NotFound />;
  }
  return (
    <ProtectedRoute>
      <Index />
    </ProtectedRoute>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <NotificationProvider>
              <Routes>
                <Route path="/signin" element={<SignIn mode="signin" />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/auth/callback" element={<AuthCallback />} />

                {/* Legacy entry → home */}
                <Route path="/app" element={<Navigate to="/" replace />} />

                {/* All workspace modules share one shell (URL is source of truth) */}
                <Route path="/*" element={<AppShell />} />
              </Routes>
            </NotificationProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
