import { Outlet } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Package, Users, Settings, Truck } from "lucide-react";

const AdminDashboard = () => (
  <DashboardLayout
    title="Administrateur"
    nav={[
      { to: "/dashboard/administrateur/colis", label: "Colis", icon: <Package className="h-4 w-4" /> },
      { to: "/dashboard/administrateur/utilisateurs", label: "Access", icon: <Users className="h-4 w-4" /> },
      { to: "/dashboard/administrateur/livreurs", label: "Livreurs", icon: <Truck className="h-4 w-4" /> },
      { to: "/dashboard/administrateur/parametres", label: "Paramètres", icon: <Settings className="h-4 w-4" /> },
    ]}
  />
);

export default AdminDashboard;
