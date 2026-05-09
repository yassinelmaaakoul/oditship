import { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { TopNav, TopNavItem } from "@/components/dashboard/TopNav";

export type NavItem = TopNavItem;

interface Props {
  title: string;
  nav: NavItem[];
}

export const DashboardLayout = ({ title, nav }: Props) => (
  <div className="min-h-screen bg-secondary/40 flex flex-col">
    <TopNav title={title} nav={nav} />
    <main className="flex-1 mx-auto w-full max-w-7xl px-4 lg:px-6 py-6">
      <Outlet />
    </main>
  </div>
);
