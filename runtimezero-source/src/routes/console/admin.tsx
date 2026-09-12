import { createFileRoute } from "@tanstack/react-router";
import { UserPlus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PONDS, SITES, USERS, statusToken } from "@/lib/mockData";

export const Route = createFileRoute("/console/admin")({
  head: () => ({
    meta: [
      { title: "Admin panel — RunTimeZero AlgaCarbon" },
      { name: "description", content: "Invite users, assign roles and pond access, register pond units and calibrate sensor thresholds." },
      { property: "og:title", content: "Admin panel — RunTimeZero AlgaCarbon" },
      { property: "og:description", content: "User administration plus facility and pond configuration." },
    ],
  }),
  component: AdminConsole,
});

function AdminConsole() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Administration</h1>
          <p className="mt-1 text-sm text-muted-foreground">Users, roles, ponds and sensor calibration</p>
        </div>
        <Button>
          <UserPlus className="size-4" /> Invite user
        </Button>
      </div>

      <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-secondary text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-5 py-3 font-medium">User</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Wallet</th>
              <th className="px-5 py-3 font-medium">Identity</th>
              <th className="px-5 py-3 font-medium">Scope</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-5 py-3">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td className="px-5 py-3 capitalize">{u.role}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{u.walletAddress}</td>
                <td className="px-5 py-3 text-xs capitalize">{u.kycStatus.replace("_", " ")}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {u.pondIds.length ? u.pondIds.join(", ") : u.permissionKeys.join(", ")}
                </td>
                <td className="px-5 py-3 text-right">
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        {SITES.map((site) => (
          <div key={site.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold">{site.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {site.region} · {site.activePonds} active ponds
                </p>
              </div>
              <Button variant="outline" size="sm">
                <Settings2 className="size-4" /> Configure
              </Button>
            </div>
            <ul className="mt-4 space-y-2">
              {PONDS.filter((p) => p.siteId === site.id).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${statusToken(p.status).color}`} />
                    {p.label}
                    <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    pH alert &lt; 6.8 · temp alert &gt; 32°C
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
