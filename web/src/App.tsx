import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoadingScreen } from "./components/Screens";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Every page is code-split; three.js (login/signup scene) and Recharts load only when needed.
const Login = lazy(() => import("./pages/auth/Login"));
const Signup = lazy(() => import("./pages/auth/Signup"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const Terms = lazy(() => import("./pages/auth/Legal").then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import("./pages/auth/Legal").then((m) => ({ default: m.Privacy })));
const Overview = lazy(() => import("./pages/Overview"));
const Predict = lazy(() => import("./pages/Predict"));
const Batch = lazy(() => import("./pages/Batch"));
const History = lazy(() => import("./pages/History"));
const Performance = lazy(() => import("./pages/Performance"));
const Segments = lazy(() => import("./pages/Segments"));
const Workflow = lazy(() => import("./pages/Workflow"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ErrorBoundary>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route index element={<Navigate to="/overview" replace />} />
                    <Route path="overview" element={<Overview />} />
                    <Route path="predict" element={<Predict />} />
                    <Route path="batch" element={<Batch />} />
                    <Route path="history" element={<History />} />
                    <Route path="performance" element={<Performance />} />
                    <Route path="segments" element={<Segments />} />
                    <Route path="workflow" element={<Workflow />} />
                    <Route path="assistant" element={<Assistant />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Route>
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
