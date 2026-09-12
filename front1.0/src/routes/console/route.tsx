import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Leaf, LineChart, FlaskConical, Users, LogOut, Lock, ShoppingCart } from "lucide-react";
import { ROLE_META } from "@/lib/mockData";
import { canAccess, clearSessionRole, setSessionRole, useSessionRole } from "@/lib/session";

export const Route = createFileRoute("/console")({
  component: ConsoleLayout,
});

const NAV = [
  { to: "/console/farmer", label: "Farmer", icon: Leaf },
  { to: "/console/market", label: "Marketplace", icon: ShoppingCart },
  { to: "/console/investor", label: "Investor", icon: LineChart },
  { to: "/console/researcher", label: "Researcher", icon: FlaskConical },
  { to: "/console/admin", label: "Admin", icon: Users },
] as const;

function ConsoleLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role, ready } = useSessionRole();
  const visible = NAV.filter((n) => canAccess(role, n.to));
  const allowed = canAccess(role, pathname);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-panel text-panel-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-display font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-md bg-accent text-accent-foreground">
              <Leaf className="size-4" />
            </span>
            RunTimeZero
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {visible.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  pathname.startsWith(to)
                    ? "bg-panel-foreground/12 text-panel-foreground"
                    : "text-panel-foreground/60 hover:text-panel-foreground"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
          {role && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-panel-foreground/60">View as:</span>
              <select 
                value={role} 
                onChange={(e) => setSessionRole(e.target.value as any)}
                className="rounded-md bg-panel-foreground/10 px-2 py-1.5 text-xs font-semibold text-panel-foreground border-none focus:outline-none cursor-pointer"
              >
                <option value="farmer" className="bg-panel text-panel-foreground">Farmer</option>
                <option value="investor" className="bg-panel text-panel-foreground">Investor</option>
                <option value="researcher" className="bg-panel text-panel-foreground">Researcher</option>
                <option value="admin" className="bg-panel text-panel-foreground">Admin</option>
              </select>
            </div>
          )}
          <Link
            to="/"
            onClick={() => clearSessionRole()}
            className="flex items-center gap-1.5 text-sm text-panel-foreground/60 hover:text-panel-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </Link>
        </div>
      </header>

      {!ready ? null : allowed ? (
        <Outlet />
      ) : (
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary">
            <Lock className="size-5 text-muted-foreground" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold">This area is not open to you</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {role
              ? "Your account does not have access to this section. Use the menu above to go back to your own screens."
              : "Please sign in again to continue."}
          </p>
          <Link
            to={visible[0]?.to ?? "/"}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            {role ? "Back to my console" : "Go to sign in"}
          </Link>
        </div>
      )}
    </div>
  );
}
