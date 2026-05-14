import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export type SubStatusValue = "all" | "non_facture" | "facture" | "non_payee" | "payee";

export const SubStatusFilter = ({
  value,
  onChange,
}: {
  value: SubStatusValue;
  onChange: (v: SubStatusValue) => void;
}) => (
  <Select value={value} onValueChange={(v) => onChange(v as SubStatusValue)}>
    <SelectTrigger>
      <SelectValue placeholder="Sous-statut" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Tous sous-statuts</SelectItem>
      <SelectItem value="non_facture">Non facturé</SelectItem>
      <SelectItem value="facture">Facturé</SelectItem>
      <SelectItem value="non_payee">Non payée</SelectItem>
      <SelectItem value="payee">Payée</SelectItem>
    </SelectContent>
  </Select>
);

export const matchesSubStatus = (
  info: { invoiced?: boolean; paid?: boolean } | undefined,
  filter: SubStatusValue,
): boolean => {
  const invoiced = !!info?.invoiced;
  const paid = !!info?.paid;
  switch (filter) {
    case "all":
      return true;
    case "non_facture":
      return !invoiced;
    case "facture":
      return invoiced;
    case "non_payee":
      return invoiced && !paid;
    case "payee":
      return invoiced && paid;
  }
};
