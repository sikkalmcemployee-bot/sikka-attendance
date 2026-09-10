import { 
  LayoutDashboard, 
  UserCheck, 
  FileText, 
  Users, 
  Calendar, 
  BarChart3, 
  Smartphone, 
  Factory, 
  Settings,
  type LucideIcon 
} from "lucide-react";

export interface AppModule {
  id: string;
  name: string;
  path: string;
  icon: LucideIcon;
  category: "Core" | "Operations" | "Management" | "Administration";
  description: string;
  defaultRoles: string[];
}

/**
 * Dynamic Master Registry of all application pages and modules.
 * Any newly added page or module in this configuration immediately becomes
 * available in the User Management Access Control center and sidebar navigation.
 */
export const APP_MODULES: AppModule[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
    category: "Core",
    description: "Operational metrics, attendance overview, and daily summaries.",
    defaultRoles: ["SUPER_ADMIN", "ADMIN", "HR", "SECURITY", "USER"]
  },
  {
    id: "attendance",
    name: "Mark Attendance",
    path: "/dashboard/attendance",
    icon: UserCheck,
    category: "Operations",
    description: "Employee daily shift punch, GPS plant bounds, and session records.",
    defaultRoles: ["EMPLOYEE", "SUPER_ADMIN", "ADMIN", "HR", "SECURITY", "USER"]
  },
  {
    id: "approvals",
    name: "Approvals",
    path: "/dashboard/approvals",
    icon: FileText,
    category: "Management",
    description: "Review, approve, or reject attendance punches and leave requests.",
    defaultRoles: ["SUPER_ADMIN", "ADMIN", "HR", "SECURITY"]
  },
  {
    id: "employees",
    name: "Employees",
    path: "/dashboard/employees",
    icon: Users,
    category: "Management",
    description: "Employee profiles, designations, contact numbers, and KYC details.",
    defaultRoles: ["SUPER_ADMIN", "ADMIN", "HR"]
  },
  {
    id: "holidays",
    name: "Holidays",
    path: "/dashboard/holidays",
    icon: Calendar,
    category: "Operations",
    description: "Official company holidays, festive leaves, and Sunday work calendars.",
    defaultRoles: ["SUPER_ADMIN", "ADMIN", "HR", "EMPLOYEE", "SECURITY", "USER"]
  },
  {
    id: "reports",
    name: "Reports",
    path: "/dashboard/reports",
    icon: BarChart3,
    category: "Management",
    description: "Exportable monthly attendance ledgers and muster roll reports.",
    defaultRoles: ["SUPER_ADMIN", "ADMIN", "HR", "SECURITY"]
  },
  {
    id: "activity",
    name: "Activity & Devices",
    path: "/dashboard/activity",
    icon: Smartphone,
    category: "Administration",
    description: "Hardware device registry, telemetry heartbeats, and audit logs.",
    defaultRoles: ["SUPER_ADMIN", "ADMIN", "SECURITY"]
  },
  {
    id: "firms",
    name: "Plants & Firms",
    path: "/dashboard/settings/firms",
    icon: Factory,
    category: "Administration",
    description: "Manage registered manufacturing plants, geofence coordinates, and legal firms.",
    defaultRoles: ["SUPER_ADMIN", "ADMIN"]
  },
  {
    id: "users",
    name: "Users & Access",
    path: "/dashboard/settings/users",
    icon: Settings,
    category: "Administration",
    description: "Manage security users, role permissions, and plant boundary access.",
    defaultRoles: ["SUPER_ADMIN"]
  },
];

/**
 * Returns a list of all module IDs for master "All Pages" selection
 */
export function getAllModuleIds(): string[] {
  return APP_MODULES.map(m => m.id);
}

/**
 * Helper to match path to a registered module
 */
export function getModuleByPath(path: string): AppModule | undefined {
  const normalizedPath = path.split("?")[0].replace(/\/$/, "");
  return APP_MODULES.find(m => m.path === normalizedPath || m.path === path);
}

/**
 * Checks if a user has access to a specific module or path
 */
export function checkUserModuleAccess(user: any, moduleOrPath: string): boolean {
  if (!user) return false;
  const role = String(user.role || "").toUpperCase();
  if (role === "SUPER_ADMIN") return true;

  const permissions: string[] = Array.isArray(user.permissions) ? user.permissions : [];
  
  // Wildcard grants all access
  if (
    permissions.includes("*") || 
    permissions.includes("all") || 
    permissions.includes("All") ||
    permissions.includes("ALL")
  ) {
    return true;
  }

  const normalized = moduleOrPath.split("?")[0].replace(/\/$/, "");

  // Find module by id, name, or path
  const targetModule = APP_MODULES.find(
    m => m.id.toLowerCase() === moduleOrPath.toLowerCase() || 
         m.path === normalized ||
         m.path === moduleOrPath ||
         m.name.toLowerCase() === moduleOrPath.toLowerCase()
  );

  if (!targetModule) {
    return permissions.some(p => 
      p.toLowerCase() === moduleOrPath.toLowerCase() || 
      p.toLowerCase() === normalized.toLowerCase()
    );
  }

  // Check matching against target module ID, name, or path (case-insensitive)
  return permissions.some(p => {
    const pl = p.toLowerCase();
    return (
      pl === targetModule.id.toLowerCase() ||
      pl === targetModule.name.toLowerCase() ||
      pl === targetModule.path.toLowerCase()
    );
  });
}

