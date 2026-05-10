import { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { TopNav, TopNavItem } from "@/components/dashboard/TopNav";

export type NavItem = TopNavItem;

interface Props {
  title: string;
  nav: NavItem[];
}

export const DashboardLayout = ({ title, nav }: Props) => (
  // 0.85 ≈ -15% global zoom for the dashboard surface (less cramped UI)
  <div className="min-h-screen bg-secondary/40 flex flex-col" style={{ zoom: 0.85 }}>
    <TopNav title={title} nav={nav} />
    <main className="flex-1 mx-auto w-full max-w-[1600px] px-4 lg:px-6 py-6">
      <Outlet />
    </main>
  </div>
);
