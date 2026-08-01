import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/** Authenticated app shell — URL drives the active workspace module. */
function AppShell() {
  return (
    <ProtectedRoute>
      <ErrorBoundary fallbackTitle="This view failed to load">
        <Index />
      </ErrorBoundary>
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

                {/* Workspace routes (production-style paths) */}
                <Route path="/" element={<AppShell />} />
                <Route path="/finance" element={<AppShell />} />
                <Route path="/finance/:tab" element={<AppShell />} />
                <Route path="/planner" element={<AppShell />} />
                <Route path="/planner/:tab" element={<AppShell />} />
                <Route path="/diary" element={<AppShell />} />
                <Route path="/gmail" element={<AppShell />} />
                <Route path="/documents" element={<AppShell />} />
                <Route path="/settings" element={<AppShell />} />
                <Route path="/settings/:section" element={<AppShell />} />

                {/* Legacy query deep-links → canonical paths */}
                <Route
                  path="/app"
                  element={<Navigate to="/" replace />}
                />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </NotificationProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
