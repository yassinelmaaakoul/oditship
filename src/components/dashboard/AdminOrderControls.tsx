import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES } from "@/lib/orderStatus";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const AdminOrderControls = ({
  orderId,
  currentStatus,
  onChanged,
}: {
  orderId: number;
  currentStatus: string;
  onChanged?: () => void;
}) => {
  const { role } = useAuth();
  const [status, setStatus] = useState(currentStatus);
  const [entryStatus, setEntryStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (role !== "administrateur") return null;

  const changeStatus = async () => {
    if (status === currentStatus) return;
    setBusy(true);
    const { error } = await supabase
      .from("orders")
      .update({ status, status_note: note || null })
      .eq("id", orderId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Statut mis à jour");
    setNote("");
    onChanged?.();
  };

  const addHistory = async () => {
    setBusy(true);
    const { error } = await (supabase as any)
      .from("order_status_history")
      .insert({
        order_id: orderId,
        old_status: currentStatus,
        new_status: entryStatus,
        notes: note || null,
        actor_label: "Administrateur",
      });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Entrée ajoutée à la chronologie");
    setNote("");
    onChanged?.();
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4 space-y-3">
      <h4 className="text-sm font-semibold">Actions Administrateur</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Changer la statut principale</label>
          <div className="flex gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={changeStatus} disabled={busy || status === currentStatus}>
              Appliquer
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Ajouter une entrée à la chronologie</label>
          <div className="flex gap-2">
            <Select value={entryStatus} onValueChange={setEntryStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={addHistory} disabled={busy}>
              Ajouter
            </Button>
          </div>
        </div>
      </div>
      <Textarea
        placeholder="Note (optionnelle)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
    </div>
  );
};
