import { Logo } from "@/components/Logo";
import { Loader2 } from "lucide-react";

interface Props { label?: string }

/** Branded loading screen used everywhere instead of placeholder.svg */
export const AppLoading = ({ label = "Chargement…" }: Props) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
    <Logo />
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  </div>
);

export default AppLoading;
