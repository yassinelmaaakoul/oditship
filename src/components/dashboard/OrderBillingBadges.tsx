import { Badge } from "@/components/ui/badge";
import type { InvoiceStatusInfo } from "@/lib/useInvoiceStatusMap";

const BILLABLE = ["livré", "delivered", "refusé", "refused", "annulé", "annule", "cancelled"];
const norm = (s: string) => (s || "").toLowerCase().trim();

export const OrderBillingBadges = ({
  status,
  info,
}: {
  status: string;
  info?: InvoiceStatusInfo;
}) => {
  if (!BILLABLE.includes(norm(status))) return null;
  const invoiced = !!info?.invoiced;
  const paid = !!info?.paid;
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {/* Use a distinctive amber/orange tone so "Facturé" stands out from green status badges */}
      <Badge
        className={
          invoiced
            ? "text-[10px] py-0 h-4 bg-amber-500 text-white hover:bg-amber-500/90 border-transparent"
            : "text-[10px] py-0 h-4 bg-muted text-muted-foreground border-transparent"
        }
      >
        {invoiced ? "Facturé" : "Non facturé"}
      </Badge>
      {invoiced && (
        <Badge
          className={
            paid
              ? "text-[10px] py-0 h-4 bg-emerald-600 text-white hover:bg-emerald-600/90 border-transparent"
              : "text-[10px] py-0 h-4 border-amber-500 text-amber-600 bg-transparent"
          }
        >
          {paid ? "Payée" : "Non payée"}
        </Badge>
      )}
    </div>
  );
};
