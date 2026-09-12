import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-collection+[...].mjs";
import { s as ROLE_META } from "./mockData-CPGb_Aq0.mjs";
import { C as FlaskConical, P as ChartLine, b as Lock, o as Users, x as Leaf, y as LogOut } from "../_libs/lucide-react.mjs";
import { i as useSessionRole, n as clearSessionRole, t as canAccess } from "./session-CG_MZ3g9.mjs";
import { f as Outlet, g as Link, l as useRouterState } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/route-DhPnCbCI.js
var import_jsx_runtime = require_jsx_runtime();
var NAV = [
	{
		to: "/console/farmer",
		label: "Farmer",
		icon: Leaf
	},
	{
		to: "/console/investor",
		label: "Market",
		icon: ChartLine
	},
	{
		to: "/console/researcher",
		label: "Researcher",
		icon: FlaskConical
	},
	{
		to: "/console/admin",
		label: "Admin",
		icon: Users
	}
];
function ConsoleLayout() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { role, ready } = useSessionRole();
	const visible = NAV.filter((n) => canAccess(role, n.to));
	const allowed = canAccess(role, pathname);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen bg-background",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
			className: "sticky top-0 z-20 border-b border-border bg-panel text-panel-foreground",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/",
						className: "flex items-center gap-2 font-display font-semibold tracking-tight",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "grid size-8 place-items-center rounded-md bg-accent text-accent-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leaf, { className: "size-4" })
						}), "RunTimeZero"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
						className: "flex flex-1 flex-wrap items-center gap-1",
						children: visible.map(({ to, label, icon: Icon }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to,
							className: `flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pathname.startsWith(to) ? "bg-panel-foreground/12 text-panel-foreground" : "text-panel-foreground/60 hover:text-panel-foreground"}`,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-4" }), label]
						}, to))
					}),
					role && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded-full bg-panel-foreground/10 px-3 py-1 text-xs font-semibold",
						children: role === "admin" ? "Admin" : ROLE_META[role].label
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/",
						onClick: () => clearSessionRole(),
						className: "flex items-center gap-1.5 text-sm text-panel-foreground/60 hover:text-panel-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogOut, { className: "size-4" }), " Sign out"]
					})
				]
			})
		}), !ready ? null : allowed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto max-w-md px-4 py-24 text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mx-auto grid size-12 place-items-center rounded-full bg-secondary",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, { className: "size-5 text-muted-foreground" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-4 font-display text-xl font-semibold",
					children: "This area is not open to you"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: role ? "Your account does not have access to this section. Use the menu above to go back to your own screens." : "Please sign in again to continue."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: visible[0]?.to ?? "/",
					className: "mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground",
					children: role ? "Back to my console" : "Go to sign in"
				})
			]
		})]
	});
}
//#endregion
export { ConsoleLayout as component };
