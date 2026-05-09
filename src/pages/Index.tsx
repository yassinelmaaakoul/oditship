import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLoading } from "@/components/AppLoading";

const Index = () => {
  const { user, loading } = useAuth();
  if (loading) return <AppLoading />;
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
};

export default Index;
