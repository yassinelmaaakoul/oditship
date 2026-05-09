import { ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { ProfileModal } from "@/components/dashboard/ProfileModal";
import { cn } from "@/lib/utils";
import { LogOut, Menu, UserCircle2, X } from "lucide-react";

export interface TopNavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permKey?: string;
}

interface Props {
  title: string;
  nav: TopNavItem[];
}

export const TopNav = ({ title, nav }: Props) => {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const isAgent = role === "agent" || profile?.agent_of != null;
  const agentPages = (profile?.agent_pages ?? null) as Record<string, boolean> | null;
  const visibleNav = nav.filter((i) => !isAgent || !i.permKey || agentPages?.[i.permKey] === true);

  const handleSignOut = async () => { await signOut(); navigate("/login"); };

  const linkCn = ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
      isActive
        ? "text-primary-foreground bg-white/10"
        : "text-primary-foreground/75 hover:text-primary-foreground hover:bg-white/5"
    );

  return (
    <>
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground border-b border-white/10 shadow-elegant">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:px-6">
          <div className="flex items-center gap-3 shrink-0">
            <Logo variant="light" />
            <span className="hidden md:inline-block h-6 w-px bg-white/20" />
            <span className="hidden md:inline-block text-xs uppercase tracking-wider text-primary-foreground/60">{title}</span>
          </div>

          <nav className="hidden lg:flex items-center gap-1 mx-auto">
            {visibleNav.map((item) => (
              <NavLink key={item.to} to={item.to} end className={linkCn}>
                {item.icon}{item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 ml-auto lg:ml-0">
            <span className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-semibold truncate max-w-[160px]">{profile?.full_name || profile?.username}</span>
              <span className="text-[11px] capitalize text-primary-foreground/60">{role}</span>
            </span>
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10" onClick={() => setProfileOpen(true)} aria-label="Profil">
              <UserCircle2 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10 hidden sm:inline-flex" onClick={handleSignOut} aria-label="Déconnexion">
              <LogOut className="h-5 w-5" />
            </Button>
            <button className="lg:hidden p-2 rounded-md hover:bg-white/10" onClick={() => setOpen((v) => !v)} aria-label="Menu">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="lg:hidden border-t border-white/10 bg-primary">
            <nav className="px-3 py-2 space-y-1">
              {visibleNav.map((item) => (
                <NavLink key={item.to} to={item.to} end onClick={() => setOpen(false)} className={linkCn}>
                  {item.icon}{item.label}
                </NavLink>
              ))}
              <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-primary-foreground/80 hover:bg-white/5">
                <LogOut className="h-4 w-4" /> Déconnexion
              </button>
            </nav>
          </div>
        )}
      </header>
      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
};
