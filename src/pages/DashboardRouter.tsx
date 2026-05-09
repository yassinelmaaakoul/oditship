import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLoading } from "@/components/AppLoading";

const DashboardRouter = () => {
  const { role, loading, user, profile } = useAuth();

  if (loading) return <AppLoading />;

  if (!user) return <Navigate to="/login" replace />;

  let basePath = "/dashboard/placeholder";
  switch (role) {
    case "vendeur":
      basePath = "/dashboard/vendeur/colis";
      break;
    case "agent": {
      const pages = (profile?.agent_pages ?? null) as Record<string, boolean> | null;
      const firstAllowed = ["colis", "facturation", "graphique", "team"].find((key) => pages?.[key] === true);
      basePath = firstAllowed ? `/dashboard/vendeur/${firstAllowed}` : "/dashboard/placeholder";
      break;
    }
    case "administrateur":
    case "superviseur":
      basePath = "/dashboard/administrateur/colis";
      break;
    case "livreur":
      basePath = "/dashboard/livreur/colis";
      break;
    case "ramassoire":
      basePath = "/dashboard/ramassoire/colis";
      break;
    default:
      basePath = "/dashboard/placeholder";
  }

  return <Navigate to={basePath} replace />;
};

export default DashboardRouter;
