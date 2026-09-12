import { i as __toESM } from "../_runtime.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-collection+[...].mjs";
import { c as HeadContent, d as createRouter, f as Outlet, g as Link, h as createRootRouteWithContext, m as createFileRoute, p as lazyRouteComponent, s as Scripts, v as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as QueryClientProvider } from "../_libs/tanstack__react-query.mjs";
import { t as QueryClient } from "../_libs/tanstack__query-core.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-mryjwlP_.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var styles_default = "/assets/styles-BYRBK2Mj.css";
function reportLovableError(error, context = {}) {
	if (typeof window === "undefined") return;
	window.__lovableEvents?.captureException?.(error, {
		source: "react_error_boundary",
		route: window.location.pathname,
		...context
	}, {
		mechanism: "react_error_boundary",
		handled: false,
		severity: "error"
	});
	const message = error instanceof Response ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}` : error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : void 0;
	window.__lovableReportRuntimeError?.({
		message,
		...stack !== void 0 && { stack },
		filename: window.location.pathname
	});
}
function NotFoundComponent() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-7xl font-bold text-foreground",
					children: "404"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-4 text-xl font-semibold text-foreground",
					children: "Page not found"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "The page you're looking for doesn't exist or has been moved."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-6",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/",
						className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
						children: "Go home"
					})
				})
			]
		})
	});
}
function ErrorComponent({ error, reset }) {
	console.error(error);
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		reportLovableError(error, { boundary: "tanstack_root_error_component" });
	}, [error]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-xl font-semibold tracking-tight text-foreground",
					children: "This page didn't load"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "Something went wrong on our end. You can try refreshing or head back home."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6 flex flex-wrap justify-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => {
							router.invalidate();
							reset();
						},
						className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
						children: "Try again"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "/",
						className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent",
						children: "Go home"
					})]
				})
			]
		})
	});
}
var Route$6 = createRootRouteWithContext()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: "RunTimeZero — AlgaCarbon" },
			{
				name: "description",
				content: "Microalgae telemetry, growth simulation and verified carbon credit trading for farmers, investors and researchers."
			},
			{
				property: "og:title",
				content: "RunTimeZero — AlgaCarbon"
			},
			{
				property: "og:description",
				content: "Microalgae telemetry, growth simulation and verified carbon credit trading."
			},
			{
				property: "og:type",
				content: "website"
			},
			{
				name: "twitter:card",
				content: "summary_large_image"
			},
			{
				name: "twitter:site",
				content: "@Lovable"
			}
		],
		links: [
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "icon",
				href: "/favicon.ico",
				type: "image/x-icon"
			},
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com"
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
			}
		]
	}),
	shellComponent: RootShell,
	component: RootComponent,
	notFoundComponent: NotFoundComponent,
	errorComponent: ErrorComponent
});
function RootShell({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})] })]
	});
}
function RootComponent() {
	const { queryClient } = Route$6.useRouteContext();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueryClientProvider, {
		client: queryClient,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {})
	});
}
var $$splitComponentImporter$5 = () => import("./routes-ipc5xaN0.mjs");
var Route$5 = createFileRoute("/")({
	head: () => ({ meta: [
		{ title: "Sign in — RunTimeZero AlgaCarbon" },
		{
			name: "description",
			content: "Sign in to RunTimeZero AlgaCarbon: microalgae pond telemetry, growth simulation and a verified carbon credit marketplace for farmers, investors and researchers."
		},
		{
			property: "og:title",
			content: "Sign in — RunTimeZero AlgaCarbon"
		},
		{
			property: "og:description",
			content: "Passwordless field access for farmers, verified marketplace access for investors, invite-only lab access for researchers."
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
var $$splitComponentImporter$4 = () => import("./route-DhPnCbCI.mjs");
var Route$4 = createFileRoute("/console")({ component: lazyRouteComponent($$splitComponentImporter$4, "component") });
var $$splitComponentImporter$3 = () => import("./admin-CpRctcDN.mjs");
var Route$3 = createFileRoute("/console/admin")({
	head: () => ({ meta: [
		{ title: "Admin panel — RunTimeZero AlgaCarbon" },
		{
			name: "description",
			content: "Invite users, assign roles and pond access, register pond units and calibrate sensor thresholds."
		},
		{
			property: "og:title",
			content: "Admin panel — RunTimeZero AlgaCarbon"
		},
		{
			property: "og:description",
			content: "User administration plus facility and pond configuration."
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
var $$splitComponentImporter$2 = () => import("./farmer-DEf_1EPi.mjs");
var Route$2 = createFileRoute("/console/farmer")({
	head: () => ({ meta: [
		{ title: "Field console — RunTimeZero AlgaCarbon" },
		{
			name: "description",
			content: "Live pond weather, heat and wind warnings, hour-by-hour forecast and growth outlook for algae farmers."
		},
		{
			property: "og:title",
			content: "Field console — RunTimeZero AlgaCarbon"
		},
		{
			property: "og:description",
			content: "Weather now, what is coming next and how much your ponds will earn this week."
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
var $$splitComponentImporter$1 = () => import("./investor-DMHhc82s.mjs");
var Route$1 = createFileRoute("/console/investor")({
	head: () => ({ meta: [
		{ title: "Investor hub — RunTimeZero AlgaCarbon" },
		{
			name: "description",
			content: "Live facility performance, a verified carbon credit marketplace and portfolio yield analytics for investors."
		},
		{
			property: "og:title",
			content: "Investor hub — RunTimeZero AlgaCarbon"
		},
		{
			property: "og:description",
			content: "Track facilities, trade verified carbon credits and follow portfolio yield."
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
var $$splitComponentImporter = () => import("./researcher-Bjxdab2p.mjs");
var Route = createFileRoute("/console/researcher")({
	head: () => ({ meta: [
		{ title: "Research lab — RunTimeZero AlgaCarbon" },
		{
			name: "description",
			content: "Drive the WebAssembly growth engine, inspect pond time-series telemetry and export raw datasets."
		},
		{
			property: "og:title",
			content: "Research lab — RunTimeZero AlgaCarbon"
		},
		{
			property: "og:description",
			content: "Simulation controls, telemetry deep-dive and one-click data export."
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
var IndexRoute = Route$5.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$6
});
var ConsoleRouteRoute = Route$4.update({
	id: "/console",
	path: "/console",
	getParentRoute: () => Route$6
});
var ConsoleRouteRouteChildren = {
	ConsoleAdminRoute: Route$3.update({
		id: "/admin",
		path: "/admin",
		getParentRoute: () => ConsoleRouteRoute
	}),
	ConsoleFarmerRoute: Route$2.update({
		id: "/farmer",
		path: "/farmer",
		getParentRoute: () => ConsoleRouteRoute
	}),
	ConsoleInvestorRoute: Route$1.update({
		id: "/investor",
		path: "/investor",
		getParentRoute: () => ConsoleRouteRoute
	}),
	ConsoleResearcherRoute: Route.update({
		id: "/researcher",
		path: "/researcher",
		getParentRoute: () => ConsoleRouteRoute
	})
};
var rootRouteChildren = {
	IndexRoute,
	ConsoleRouteRoute: ConsoleRouteRoute._addFileChildren(ConsoleRouteRouteChildren)
};
var routeTree = Route$6._addFileChildren(rootRouteChildren)._addFileTypes();
var getRouter = () => {
	const queryClient = new QueryClient();
	return createRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreloadStaleTime: 0
	});
};
//#endregion
export { getRouter };
