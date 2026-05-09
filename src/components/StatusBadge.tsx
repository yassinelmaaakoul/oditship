import { cn } from "@/lib/utils";
import { statusColor, statusLabel } from "@/lib/orderStatus";
import { getStatusBadgeOverride } from "@/lib/statusBadgeOverrides";

export const StatusBadge = ({ status }: { status: string }) => {
  const override = getStatusBadgeOverride(status);
  if (override) {
    return (
      <span
        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset whitespace-nowrap"
        style={{
          backgroundColor: override.bg,
          color: override.text,
          boxShadow: `inset 0 0 0 1px ${override.border ?? override.text}`,
        }}
      >
        {statusLabel(status)}
      </span>
    );
  }
  const c = statusColor(status);
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset whitespace-nowrap", c.bg, c.text, c.ring)}>
      {statusLabel(status)}
    </span>
  );
};
