import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { PublicLayout } from "@/components/PublicLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Home from "./pages/Home";
import Pricing from "./pages/Pricing";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Terms from "./pages/Terms";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import Impersonate from "./pages/Impersonate";
import DashboardRouter from "./pages/DashboardRouter";
import DashboardPlaceholder from "./pages/DashboardPlaceholder";
import NotFound from "./pages/NotFound.tsx";

import VendeurDashboard from "./pages/vendeur/VendeurDashboard";
import VendeurColis from "./pages/vendeur/VendeurColis";
import VendeurFacturation from "./pages/vendeur/VendeurFacturation";
import VendeurGraphique from "./pages/vendeur/VendeurGraphique";
import VendeurTeam from "./pages/vendeur/VendeurTeam";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminColis from "./pages/admin/AdminColis";
import AdminUtilisateurs from "./pages/admin/AdminUtilisateurs";
import AdminParametres from "./pages/admin/AdminParametres";
import AdminLivreurWorkflows from "./pages/admin/AdminLivreurWorkflows";
import AdminLivreursPage from "./pages/admin/AdminLivreursPage";
import AdminFacturation from "./pages/admin/AdminFacturation";

import LivreurDashboard from "./pages/livreur/LivreurDashboard";
import LivreurColis from "./pages/livreur/LivreurColis";
import LivreurTarifs from "./pages/livreur/LivreurTarifs";
import LivreurDocApi from "./pages/livreur/LivreurDocApi";

import RamassoireDashboard, { RamassoireList, ListeRamassage } from "./pages/ramassoire/RamassoireDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public layout */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/terms" element={<Terms />} />
            </Route>

            {/* Auth (no public chrome) */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/impersonate" element={<Impersonate />} />

            {/* Dashboard router */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardRouter /></ProtectedRoute>} />
            <Route path="/dashboard/placeholder" element={<ProtectedRoute><DashboardPlaceholder /></ProtectedRoute>} />

            {/* Vendeur */}
            <Route path="/dashboard/vendeur" element={<ProtectedRoute allowedRoles={["vendeur","agent","administrateur"]}><VendeurDashboard /></ProtectedRoute>}>
              <Route index element={<Navigate to="colis" replace />} />
              <Route path="colis" element={<ProtectedRoute allowedRoles={["vendeur","agent","administrateur"]} agentPage="colis"><VendeurColis /></ProtectedRoute>} />
              <Route path="facturation" element={<ProtectedRoute allowedRoles={["vendeur","agent","administrateur"]} agentPage="facturation"><VendeurFacturation /></ProtectedRoute>} />
              <Route path="graphique" element={<ProtectedRoute allowedRoles={["vendeur","agent","administrateur"]} agentPage="graphique"><VendeurGraphique /></ProtectedRoute>} />
              <Route path="team" element={<ProtectedRoute allowedRoles={["vendeur","agent","administrateur"]} agentPage="team"><VendeurTeam /></ProtectedRoute>} />
            </Route>

            {/* Administrateur */}
            <Route path="/dashboard/administrateur" element={<ProtectedRoute allowedRoles={["administrateur","superviseur"]}><AdminDashboard /></ProtectedRoute>}>
              <Route index element={<Navigate to="colis" replace />} />
              <Route path="colis" element={<AdminColis />} />
              <Route path="utilisateurs" element={<AdminUtilisateurs />} />
              <Route path="livreurs" element={<AdminLivreursPage />} />
              <Route path="facturation" element={<AdminFacturation />} />
              <Route path="parametres" element={<AdminParametres />} />
            </Route>
            <Route path="/admin/livreurs/:livreurId/workflows" element={<ProtectedRoute allowedRoles={["administrateur"]}><AdminLivreurWorkflows /></ProtectedRoute>} />

            {/* Livreur */}
            <Route path="/dashboard/livreur" element={<ProtectedRoute allowedRoles={["livreur","administrateur"]}><LivreurDashboard /></ProtectedRoute>}>
              <Route index element={<Navigate to="colis" replace />} />
              <Route path="colis" element={<LivreurColis />} />
              <Route path="tarifs" element={<LivreurTarifs />} />
              <Route path="doc-api" element={<LivreurDocApi />} />
            </Route>

            {/* Ramassoire */}
            <Route path="/dashboard/ramassoire" element={<ProtectedRoute allowedRoles={["ramassoire","administrateur"]}><RamassoireDashboard /></ProtectedRoute>}>
              <Route index element={<Navigate to="colis" replace />} />
              <Route path="colis" element={<RamassoireList />} />
              <Route path="liste-ramassage" element={<ListeRamassage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
