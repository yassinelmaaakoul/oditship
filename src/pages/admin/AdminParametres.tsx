import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminCities from "./parametres/AdminCities";
import AdminHubs from "./parametres/AdminHubs";
import AdminLivreurs from "./parametres/AdminLivreurs";
import AdminSticker from "./parametres/AdminSticker";
import AdminColisPreview from "./parametres/AdminColisPreview";
import AdminTarifs from "./parametres/AdminTarifs";
import { useEffect, useState } from "react";

const PARAMETRES_TAB_KEY = "odit-admin-parametres-tab";

const AdminParametres = () => {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem(PARAMETRES_TAB_KEY) || "cities");

  useEffect(() => {
    localStorage.setItem(PARAMETRES_TAB_KEY, activeTab);
  }, [activeTab]);

  return <div className="space-y-4">
    <h2 className="text-2xl font-bold">Paramètres</h2>
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="cities">Villes</TabsTrigger>
        <TabsTrigger value="hubs">Hubs</TabsTrigger>
        <TabsTrigger value="livreurs">Livreurs & API</TabsTrigger>
        <TabsTrigger value="sticker">Sticker</TabsTrigger>
        <TabsTrigger value="tarifs">Tarifs & Délai Livraison</TabsTrigger>
        <TabsTrigger value="colis-preview">Info Colis</TabsTrigger>
      </TabsList>
      <TabsContent value="cities" className="mt-4"><AdminCities /></TabsContent>
      <TabsContent value="hubs" className="mt-4"><AdminHubs /></TabsContent>
      <TabsContent value="livreurs" className="mt-4"><AdminLivreurs /></TabsContent>
      <TabsContent value="sticker" className="mt-4"><AdminSticker /></TabsContent>
      <TabsContent value="tarifs" className="mt-4"><AdminTarifs /></TabsContent>
      <TabsContent value="colis-preview" className="mt-4"><AdminColisPreview /></TabsContent>
    </Tabs>
  </div>;
};

export default AdminParametres;
