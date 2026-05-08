// Single source of truth for ODiT order statuses.
// Database stores statuses verbatim; UI displays them with labels & colors.

export const ORDER_STATUSES = [
  "Crée", "Confirmé", "Pickup", "Ramassé", "Transit", "En route",
  "Reporté", "Programmé", "livré", "Refusé", "Annulé", "Returned", "Intéressé",
  "ASSIGN", "whatsapp", "Appel sortant",
] as const;

export type OrderStatus = typeof ORDER_STATUSES[number];

// Display label override (only "livré" → "Livré" per spec)
export const statusLabel = (s: string): string => (s === "livré" ? "Livré" : s);

export interface StatusStyle { bg: string; text: string; ring: string; hex: string; }

export const statusColor = (s: string): StatusStyle => {
  switch (s) {
    case "Crée":      return { bg: "bg-slate-100",    text: "text-slate-700",   ring: "ring-slate-200",    hex: "hsl(215 16% 65%)" };
    case "Confirmé":  return { bg: "bg-blue-100",     text: "text-blue-700",    ring: "ring-blue-200",     hex: "hsl(217 91% 60%)" };
    case "Pickup":    return { bg: "bg-violet-100",   text: "text-violet-700",  ring: "ring-violet-200",   hex: "hsl(262 83% 58%)" };
    case "Ramassé":   return { bg: "bg-indigo-100",   text: "text-indigo-700",  ring: "ring-indigo-200",   hex: "hsl(239 84% 67%)" };
    case "Transit":   return { bg: "bg-cyan-100",     text: "text-cyan-700",    ring: "ring-cyan-200",     hex: "hsl(189 94% 43%)" };
    case "En route":  return { bg: "bg-sky-100",      text: "text-sky-700",     ring: "ring-sky-200",      hex: "hsl(199 89% 48%)" };
    case "Reporté":   return { bg: "bg-amber-100",    text: "text-amber-700",   ring: "ring-amber-200",    hex: "hsl(38 92% 50%)" };
    case "Programmé": return { bg: "bg-yellow-100",   text: "text-yellow-700",  ring: "ring-yellow-200",   hex: "hsl(48 96% 53%)" };
    case "livré":     return { bg: "bg-emerald-100",  text: "text-emerald-700", ring: "ring-emerald-200",  hex: "hsl(142 71% 45%)" };
    case "Refusé":    return { bg: "bg-rose-100",     text: "text-rose-700",    ring: "ring-rose-200",     hex: "hsl(0 84% 60%)" };
    case "Annulé":    return { bg: "bg-red-100",      text: "text-red-700",     ring: "ring-red-200",      hex: "hsl(0 70% 45%)" };
    case "Returned":  return { bg: "bg-orange-100",   text: "text-orange-700",  ring: "ring-orange-200",   hex: "hsl(13 87% 55%)" };
    case "Intéressé": return { bg: "bg-pink-100",     text: "text-pink-700",    ring: "ring-pink-200",     hex: "hsl(330 81% 60%)" };
    default:          return { bg: "bg-gray-100",     text: "text-gray-700",    ring: "ring-gray-200",     hex: "hsl(220 9% 50%)" };
  }
};
