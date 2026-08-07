export type UserRole = 'admin' | 'qc_manager' | 'qc_inspector' | 'approver' | 'viewer';

export type Capability =
  | 'manageUsers'      // create/edit/deactivate users, change roles
  | 'manageTemplate'   // edit the QC checklist template (Phase 2+)
  | 'manageCustomers'  // upload customers, create QC jobs (Phase 3+)
  | 'assignJobs'       // assign/reassign a job (Phase 3+)
  | 'fillChecklist'    // fill a QC job as inspector (Phase 4+)
  | 'approveJobs'      // review/verdict/sign-off (Phase 6+)
  | 'viewAllJobs'      // see every job, not just own
  | 'viewReports'      // reports/dashboards/export
  | 'viewPresence';    // see the online-users list on Team

interface NavItem {
  to:    string;
  label: string;
  icon:  string; // lucide-react component name, resolved by Nav.tsx
}

interface RoleConfig {
  label:         string;
  badgeBg:       string; // tailwind class, e.g. 'bg-brand-blue'
  badgeText:     string; // tailwind class, e.g. 'text-white'
  defaultRoute:  string;
  navItems:      NavItem[];
  capabilities:  Capability[];
}

export const ROLES: Record<UserRole, RoleConfig> = {
  admin: {
    label: 'Admin', badgeBg: 'bg-brand-blue', badgeText: 'text-white',
    defaultRoute: '/dashboard',
    navItems: [
      { to: '/dashboard',  label: 'Home',      icon: 'LayoutDashboard' },
      { to: '/jobs',       label: 'Jobs',      icon: 'ClipboardList'   },
      { to: '/customers',  label: 'Customers', icon: 'Users'           },
      { to: '/approvals',  label: 'Approvals', icon: 'FileCheck'       },
      { to: '/team',       label: 'Team',      icon: 'Users'           },
      { to: '/template',   label: 'Template',  icon: 'FileText'       },
      { to: '/reports',    label: 'Reports',   icon: 'BarChart2'       },
      { to: '/error-logs', label: 'Error Logs',icon: 'AlertCircle'     },
    ],
    capabilities: ['manageUsers', 'manageTemplate', 'manageCustomers', 'assignJobs',
                   'approveJobs', 'viewAllJobs', 'viewReports', 'viewPresence'],
  },
  qc_manager: {
    label: 'QC Manager', badgeBg: 'bg-brand-navy', badgeText: 'text-white',
    defaultRoute: '/dashboard',
    navItems: [
      { to: '/dashboard', label: 'Home',      icon: 'LayoutDashboard' },
      { to: '/jobs',      label: 'Jobs',      icon: 'ClipboardList'   },
      { to: '/customers', label: 'Customers', icon: 'Users'           },
      { to: '/reports',   label: 'Reports',   icon: 'BarChart2'       },
    ],
    capabilities: ['manageCustomers', 'assignJobs', 'viewAllJobs', 'viewReports', 'viewPresence'],
  },
  qc_inspector: {
    label: 'QC Inspector', badgeBg: 'bg-brand-green', badgeText: 'text-white',
    defaultRoute: '/my-jobs',
    navItems: [
      { to: '/dashboard', label: 'Home',    icon: 'LayoutDashboard' },
      { to: '/my-jobs',   label: 'My Jobs', icon: 'ClipboardList'   },
    ],
    capabilities: ['fillChecklist'],
  },
  approver: {
    label: 'Approver', badgeBg: 'bg-amber-500', badgeText: 'text-white',
    defaultRoute: '/approvals',
    navItems: [
      { to: '/dashboard',  label: 'Home',      icon: 'LayoutDashboard' },
      { to: '/approvals',  label: 'Approvals', icon: 'FileCheck'       },
    ],
    capabilities: ['approveJobs', 'viewAllJobs'],
  },
  viewer: {
    label: 'Viewer', badgeBg: 'bg-gray-400', badgeText: 'text-white',
    defaultRoute: '/dashboard',
    navItems: [
      { to: '/dashboard', label: 'Home',    icon: 'LayoutDashboard' },
      { to: '/jobs',      label: 'Jobs',    icon: 'ClipboardList'   },
      { to: '/reports',   label: 'Reports', icon: 'BarChart2'       },
    ],
    capabilities: ['viewAllJobs', 'viewReports'],
  },
};

export const ALL_ROLES = Object.keys(ROLES) as UserRole[];

export function isValidRole(r: unknown): r is UserRole {
  return typeof r === 'string' && r in ROLES;
}

export function getRoleConfig(role?: string): RoleConfig | undefined {
  return role && isValidRole(role) ? ROLES[role] : undefined;
}

export function roleLabel(role?: string): string {
  return getRoleConfig(role)?.label ?? role ?? 'Unknown';
}

export function defaultRouteFor(role?: string): string {
  return getRoleConfig(role)?.defaultRoute ?? '/dashboard';
}

export function can(role: string | undefined, capability: Capability): boolean {
  return getRoleConfig(role)?.capabilities.includes(capability) ?? false;
}

// Employee-code prefixes — confirmed with Sarvesh (Phase 0).
export const ROLE_CODE_PREFIX: Partial<Record<UserRole, string>> = {
  qc_inspector: 'INS', approver: 'APR', qc_manager: 'MGR',
};
