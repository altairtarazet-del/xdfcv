import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Inbox,
  BarChart3,
  Users,
  Shield,
  Bell,
  LogOut,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/api/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  minRole?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    to: "/all-emails",
    label: "All Emails",
    icon: Inbox,
  },
  {
    to: "/analytics",
    label: "Analytics",
    minRole: "admin",
    icon: BarChart3,
  },
  {
    to: "/portal-users",
    label: "Customers",
    icon: Users,
  },
  {
    to: "/team",
    label: "Team",
    minRole: "admin",
    icon: Shield,
  },
];

const ROLE_LEVELS: Record<string, number> = {
  super_admin: 3,
  admin: 2,
  operator: 1,
  viewer: 1,
};

const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/all-emails": "All Emails",
  "/analytics": "Analytics",
  "/portal-users": "Customers",
  "/team": "Team",
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const adminRole = localStorage.getItem("admin_role") || "admin";
  const userLevel = ROLE_LEVELS[adminRole] || 1;

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    return userLevel >= (ROLE_LEVELS[item.minRole] || 0);
  });

  useEffect(() => {
    api
      .get<{
        stage_counts: Record<string, number>;
        total_accounts: number;
        unread_alerts: number;
      }>("/api/dashboard/stats")
      .then((data) => setUnreadAlerts(data.unread_alerts))
      .catch(() => {});
  }, []);

  function logout() {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_refresh_token");
    localStorage.removeItem("admin_role");
    navigate("/login");
  }

  // Build breadcrumb from current path
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const currentLabel =
    ROUTE_LABELS[location.pathname] ||
    pathSegments[pathSegments.length - 1]
      ?.replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) ||
    "Dashboard";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <span className="font-bold text-sm">D</span>
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">DasherHelp</span>
                    <span className="truncate text-xs text-muted-foreground">
                      DD Operations
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNavItems.map((item) => {
                  const isActive =
                    item.to === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                      >
                        <NavLink to={item.to} end={item.to === "/"}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                      {item.to === "/" && unreadAlerts > 0 && (
                        <SidebarMenuBadge className="bg-primary text-primary-foreground rounded-full text-[10px] font-bold min-w-5 h-5 flex items-center justify-center">
                          {unreadAlerts > 99 ? "99+" : unreadAlerts}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                        {adminRole === "super_admin" ? "SA" : "AD"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">Admin</span>
                      <span className="truncate text-xs text-muted-foreground capitalize">
                        {adminRole.replace("_", " ")}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                          {adminRole === "super_admin" ? "SA" : "AD"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">Admin</span>
                        <span className="truncate text-xs text-muted-foreground capitalize">
                          {adminRole.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="cursor-pointer">
                    <LogOut />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link to="/">DasherHelp</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {currentLabel !== "Dashboard" && (
                <>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
              {currentLabel === "Dashboard" && (
                <>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Dashboard</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          {unreadAlerts > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <Link
                to="/"
                className="relative inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unreadAlerts > 99 ? "99+" : unreadAlerts}
                </span>
              </Link>
            </div>
          )}
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
