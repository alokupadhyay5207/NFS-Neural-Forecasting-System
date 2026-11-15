import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabaseConfigured } from "../lib/supabase";
import { ConfigMissing, LoadingScreen } from "./Screens";

/** Blocks the dashboard until a real Supabase session exists. */
export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (!supabaseConfigured) return <ConfigMissing />;
  if (loading) return <LoadingScreen text="Checking your session…" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
