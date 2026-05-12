import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import PackManager from "@/components/dashboard/PackManager";

const db = supabase as any;

const LivreurTarifs = () => {
  const { user } = useAuth();
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: hl } = await db.from("hub_livreur").select("hub_id").eq("livreur_id", user.id);
      const hubIds = (hl ?? []).map((x: any) => x.hub_id);
      if (hubIds.length === 0) { setCities([]); return; }
      const { data: hc } = await db.from("hub_cities").select("city_name").in("hub_id", hubIds);
      setCities(Array.from(new Set((hc ?? []).map((x: any) => x.city_name))));
    })();
  }, [user]);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Mes tarifs de livraison</h2>
      </div>
      <Card className="p-4">
        <p className="text-sm text-muted-foreground mb-4">
          Définissez vos tarifs de livraison pour les villes qui vous sont assignées. L'administrateur peut consulter et modifier ces tarifs.
        </p>
        <PackManager
          scope="livreur"
          ownerId={user.id}
          showPickupDimension={false}
          hideDelay
          allowedDestinationCities={cities}
          title={`Villes restreintes à vos hubs (${cities.length})`}
        />
      </Card>
    </div>
  );
};

export default LivreurTarifs;
