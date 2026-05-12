import { Badge } from "@/components/ui/badge";
import type { InvoiceStatusInfo } from "@/lib/useInvoiceStatusMap";

const BILLABLE = ["Livré", "Delivered", "Refusé", "Refused", "Annulé", "Cancelled", "Annule"];

export const OrderBillingBadges = ({
  status,
  info,
}: {
  status: string;
  info?: InvoiceStatusInfo;
}) => {
  if (!BILLABLE.includes(status)) return null;
  const invoiced = !!info?.invoiced;
  const paid = !!info?.paid;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      <Badge variant={invoiced ? "default" : "secondary"} className="text-[10px] py-0 h-4">
        {invoiced ? "Facturé" : "Non facturé"}
      </Badge>
      {invoiced && (
        <Badge variant={paid ? "default" : "outline"} className="text-[10px] py-0 h-4">
          {paid ? "Payée" : "Non payée"}
        </Badge>
      )}
    </div>
  );
};
