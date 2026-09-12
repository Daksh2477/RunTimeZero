globalThis.__nitro_main__ = import.meta.url;
import { i as HTTPError, n as defineLazyEventHandler, t as H3Core } from "./_libs/h3+rou3+srvx.mjs";
import { t as HookableCore } from "./_libs/hookable.mjs";
import { r as FastResponse } from "./_libs/h3-v2+rou3+srvx.mjs";
//#region #nitro-vite-setup
function lazyService(loader) {
	let promise, mod;
	return { fetch(req) {
		if (mod) return mod.fetch(req);
		if (!promise) promise = loader().then((_mod) => mod = _mod.default || _mod);
		return promise.then((mod) => mod.fetch(req));
	} };
}
var services = { ["ssr"]: lazyService(() => import("./_ssr/ssr.mjs")) };
globalThis.__nitro_vite_envs__ = services;
//#endregion
//#region #nitro/virtual/public-assets-data
var public_assets_data_default = {
	"/assets/button-DNR9ngmZ.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"7ce3-YIxi/Nr2xl+VvHkNsIW7sWxA2GE\"",
		"mtime": "2026-09-12T09:42:39.339Z",
		"size": 31971,
		"path": "../public/assets/button-DNR9ngmZ.js"
	},
	"/assets/AreaChart-BjKX2bvx.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"2bd8-DDBzzyMYGw3DPhZpewz3IgiUchQ\"",
		"mtime": "2026-09-12T09:42:39.322Z",
		"size": 11224,
		"path": "../public/assets/AreaChart-BjKX2bvx.js"
	},
	"/assets/admin-Av5qoQYL.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"17dc8-cQXJBnIlmyr7OYodsPnlwA7aCqU\"",
		"mtime": "2026-09-12T09:42:39.336Z",
		"size": 97736,
		"path": "../public/assets/admin-Av5qoQYL.js"
	},
	"/assets/farmer-DM-gqlZR.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"32ce-JAQaw85VfSZJIHDY0sL3GK5ho18\"",
		"mtime": "2026-09-12T09:42:39.351Z",
		"size": 13006,
		"path": "../public/assets/farmer-DM-gqlZR.js"
	},
	"/assets/createLucideIcon-GbkIog0d.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"4ab-bE0625NoUfmUOMhS6HSRsuzW/PE\"",
		"mtime": "2026-09-12T09:42:39.347Z",
		"size": 1195,
		"path": "../public/assets/createLucideIcon-GbkIog0d.js"
	},
	"/assets/investor-Dtb25_PL.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1f2a-zOqvuQOjn+pJqLJv6qHZqgNy+YE\"",
		"mtime": "2026-09-12T09:42:39.361Z",
		"size": 7978,
		"path": "../public/assets/investor-Dtb25_PL.js"
	},
	"/assets/label-TXe_eicK.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"6c5-J9ErfVv6TqBqCG9makEVyfls6VM\"",
		"mtime": "2026-09-12T09:42:39.366Z",
		"size": 1733,
		"path": "../public/assets/label-TXe_eicK.js"
	},
	"/assets/jsx-runtime-D3jfb0Ew.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"22c5-Qh7NbnnF5pPMnr2eoPNshytf37o\"",
		"mtime": "2026-09-12T09:42:39.364Z",
		"size": 8901,
		"path": "../public/assets/jsx-runtime-D3jfb0Ew.js"
	},
	"/assets/Line-tSlLThzG.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"2a43-R749nfBdDFmALKTXKN9yh1Pzv0I\"",
		"mtime": "2026-09-12T09:42:39.332Z",
		"size": 10819,
		"path": "../public/assets/Line-tSlLThzG.js"
	},
	"/assets/mockData-Do2neJd1.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"13d7-Dogj+fFofeqPAflfLnsNBPcYTqs\"",
		"mtime": "2026-09-12T09:42:39.369Z",
		"size": 5079,
		"path": "../public/assets/mockData-Do2neJd1.js"
	},
	"/robots.txt": {
		"type": "text/plain; charset=utf-8",
		"etag": "\"a0-CKGXSIe7TSsqDTmGm/nY1t/o5d0\"",
		"mtime": "2026-09-12T09:32:29.768Z",
		"size": 160,
		"path": "../public/robots.txt"
	},
	"/assets/react-dom-CwdmouWZ.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"f17-QemzpnA5Tqxk5YG3QZZamATuNCY\"",
		"mtime": "2026-09-12T09:42:39.378Z",
		"size": 3863,
		"path": "../public/assets/react-dom-CwdmouWZ.js"
	},
	"/assets/researcher-VplgfdQL.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"102d-skXlyyI6sdljJMHIGJr9wOhWsA0\"",
		"mtime": "2026-09-12T09:42:39.384Z",
		"size": 4141,
		"path": "../public/assets/researcher-VplgfdQL.js"
	},
	"/favicon.ico": {
		"type": "image/vnd.microsoft.icon",
		"etag": "\"4f95-3RXc3p2mhEAs1WBwaIvE0Y0uu0Y\"",
		"mtime": "2026-09-12T09:32:29.728Z",
		"size": 20373,
		"path": "../public/favicon.ico"
	},
	"/assets/route-7RJOYSeD.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"cba-RnW0iWaCjU5ZFY8xOzoqVPm26hw\"",
		"mtime": "2026-09-12T09:42:39.403Z",
		"size": 3258,
		"path": "../public/assets/route-7RJOYSeD.js"
	},
	"/assets/index-BP670Rps.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"5a23a-VFWZpjThMoMVp0MlDULpmNn5DK8\"",
		"mtime": "2026-09-12T09:42:39.320Z",
		"size": 369210,
		"path": "../public/assets/index-BP670Rps.js"
	},
	"/assets/generateCategoricalChart-CBU0E8Dd.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"59d2f-Y2fkPJDdMN3QmFRRVwKZlWXU5hw\"",
		"mtime": "2026-09-12T09:42:39.355Z",
		"size": 367919,
		"path": "../public/assets/generateCategoricalChart-CBU0E8Dd.js"
	},
	"/assets/shield-check-uWDGVtnq.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"140-7GZONstXYhkot8gSDrPIjAYP48M\"",
		"mtime": "2026-09-12T09:42:39.413Z",
		"size": 320,
		"path": "../public/assets/shield-check-uWDGVtnq.js"
	},
	"/assets/session-Bf037XF3.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"671-1PUV+xxt4inzx9B1GRxo/fFhhRQ\"",
		"mtime": "2026-09-12T09:42:39.410Z",
		"size": 1649,
		"path": "../public/assets/session-Bf037XF3.js"
	},
	"/assets/waves-oG4zD11A.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1ac-vgrjy5xXE93bpK1TWb2Wi+iqbDE\"",
		"mtime": "2026-09-12T09:42:39.416Z",
		"size": 428,
		"path": "../public/assets/waves-oG4zD11A.js"
	},
	"/assets/styles-BYRBK2Mj.css": {
		"type": "text/css; charset=utf-8",
		"etag": "\"1350f-tVaAElyNSLG4XvOAaFwrAvZh6UM\"",
		"mtime": "2026-09-12T09:42:39.417Z",
		"size": 79119,
		"path": "../public/assets/styles-BYRBK2Mj.css"
	},
	"/assets/routes-yvVrTSXE.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"21099-awKeGPCXZpTWLwxNZWm6d5sM3NQ\"",
		"mtime": "2026-09-12T09:42:39.408Z",
		"size": 135321,
		"path": "../public/assets/routes-yvVrTSXE.js"
	}
};
//#endregion
//#region #nitro/virtual/public-assets
var publicAssetBases = {};
function isPublicAssetURL(id = "") {
	if (public_assets_data_default[id]) return true;
	for (const base in publicAssetBases) if (id.startsWith(base)) return true;
	return false;
}
//#endregion
//#region node_modules/nitro/dist/runtime/internal/route-rules.mjs
var headers = ((m) => function headersRouteRule(event) {
	for (const [key, value] of Object.entries(m.options || {})) event.res.headers.set(key, value);
});
//#endregion
//#region #nitro/virtual/routing
var findRouteRules = /* @__PURE__ */ (() => {
	const $0 = [{
		name: "headers",
		route: "/assets/**",
		handler: headers,
		options: { "cache-control": "public, max-age=31536000, immutable" }
	}];
	return (m, p) => {
		let r = [];
		if (p.charCodeAt(p.length - 1) === 47) p = p.slice(0, -1) || "/";
		let s = p.split("/");
		if (s.length > 1) {
			if (s[1] === "assets") r.unshift({
				data: $0,
				params: { "_": s.slice(2).join("/") }
			});
		}
		return r;
	};
})();
var _lazy_aZV6ey = defineLazyEventHandler(() => import("./_chunks/ssr-renderer.mjs"));
var findRoute = /* @__PURE__ */ (() => {
	const data = {
		route: "/**",
		handler: _lazy_aZV6ey
	};
	return ((_m, p) => {
		return {
			data,
			params: { "_": p.slice(1) }
		};
	});
})();
[].filter(Boolean);
//#endregion
//#region node_modules/nitro/dist/runtime/internal/error/prod.mjs
var errorHandler = (error, event) => {
	const res = defaultHandler(error, event);
	return new FastResponse(typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2), res);
};
function defaultHandler(error, event) {
	const unhandled = error.unhandled ?? !HTTPError.isError(error);
	const { status = 500, statusText = "" } = unhandled ? {} : error;
	if (status === 404) {
		const url = event.url || new URL(event.req.url);
		const baseURL = "/";
		if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) return {
			status: 302,
			headers: new Headers({ location: `${baseURL}${url.pathname.slice(1)}${url.search}` })
		};
	}
	const headers = new Headers(unhandled ? {} : error.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	return {
		status,
		statusText,
		headers,
		body: {
			error: true,
			...unhandled ? {
				status,
				unhandled: true
			} : typeof error.toJSON === "function" ? error.toJSON() : {
				status,
				statusText,
				message: error.message
			}
		}
	};
}
//#endregion
//#region #nitro/virtual/error-handler
var errorHandlers = [errorHandler];
async function error_handler_default(error, event) {
	for (const handler of errorHandlers) try {
		const response = await handler(error, event, { defaultHandler });
		if (response) return response;
	} catch (error) {
		console.error(error);
	}
}
//#endregion
//#region #nitro/virtual/app
function createNitroApp() {
	const captureError = (error, errorCtx) => {
		if (errorCtx?.event) {
			const errors = errorCtx.event.req.context?.nitro?.errors;
			if (errors) errors.push({
				error,
				context: errorCtx
			});
		}
	};
	const h3App = createH3App({ onError(error, event) {
		return error_handler_default(error, event);
	} });
	let appHandler = (req) => {
		req.context ||= {};
		req.context.nitro = req.context.nitro || { errors: [] };
		return h3App.fetch(req);
	};
	return {
		fetch: appHandler,
		h3: h3App,
		hooks: void 0,
		captureError
	};
}
function createH3App(config) {
	const h3App = new H3Core(config);
	h3App["~findRoute"] = (event) => findRoute(event.req.method, event.url.pathname);
	h3App["~getMiddleware"] = (event, route) => {
		const pathname = event.url.pathname;
		const method = event.req.method;
		const middleware = [];
		const routeRules = getRouteRules(method, pathname);
		event.context.routeRules = routeRules?.routeRules;
		if (routeRules?.routeRuleMiddleware.length) middleware.push(...routeRules.routeRuleMiddleware);
		if (route?.data?.middleware?.length) middleware.push(...route.data.middleware);
		return middleware;
	};
	return h3App;
}
//#endregion
//#region node_modules/nitro/dist/runtime/internal/app.mjs
var APP_ID = "default";
function useNitroApp() {
	let instance = useNitroApp._instance;
	if (instance) return instance;
	instance = useNitroApp._instance = createNitroApp();
	globalThis.__nitro__ = globalThis.__nitro__ || {};
	globalThis.__nitro__[APP_ID] = instance;
	return instance;
}
function useNitroHooks() {
	const nitroApp = useNitroApp();
	const hooks = nitroApp.hooks;
	if (hooks) return hooks;
	return nitroApp.hooks = new HookableCore();
}
function getRouteRules(method, pathname) {
	const m = findRouteRules(method, pathname);
	if (!m?.length) return { routeRuleMiddleware: [] };
	const routeRules = {};
	for (const layer of m) for (const rule of layer.data) {
		const currentRule = routeRules[rule.name];
		if (currentRule) {
			if (rule.options === false) {
				delete routeRules[rule.name];
				continue;
			}
			if (typeof currentRule.options === "object" && typeof rule.options === "object") currentRule.options = {
				...currentRule.options,
				...rule.options
			};
			else currentRule.options = rule.options;
			currentRule.route = rule.route;
			currentRule.params = {
				...currentRule.params,
				...layer.params
			};
		} else if (rule.options !== false) routeRules[rule.name] = {
			...rule,
			params: layer.params
		};
	}
	const middleware = [];
	const orderedRules = Object.values(routeRules).sort((a, b) => (a.handler?.order || 0) - (b.handler?.order || 0));
	for (const rule of orderedRules) {
		if (rule.options === false || !rule.handler) continue;
		middleware.push(rule.handler(rule));
	}
	return {
		routeRules,
		routeRuleMiddleware: middleware
	};
}
//#endregion
//#region node_modules/nitro/dist/presets/cloudflare/runtime/_module-handler.mjs
function createHandler(hooks) {
	const nitroApp = useNitroApp();
	const nitroHooks = useNitroHooks();
	return {
		async fetch(request, env, context) {
			globalThis.__env__ = env;
			augmentReq(request, {
				env,
				context
			});
			const ctxExt = {};
			const url = new URL(request.url);
			if (hooks.fetch) {
				const res = await hooks.fetch(request, env, context, url, ctxExt);
				if (res) return res;
			}
			return await nitroApp.fetch(request);
		},
		scheduled(controller, env, context) {
			globalThis.__env__ = env;
			context.waitUntil(nitroHooks.callHook("cloudflare:scheduled", {
				controller,
				env,
				context
			}) || Promise.resolve());
		},
		email(message, env, context) {
			globalThis.__env__ = env;
			context.waitUntil(nitroHooks.callHook("cloudflare:email", {
				message,
				event: message,
				env,
				context
			}) || Promise.resolve());
		},
		queue(batch, env, context) {
			globalThis.__env__ = env;
			context.waitUntil(nitroHooks.callHook("cloudflare:queue", {
				batch,
				event: batch,
				env,
				context
			}) || Promise.resolve());
		},
		tail(traces, env, context) {
			globalThis.__env__ = env;
			context.waitUntil(nitroHooks.callHook("cloudflare:tail", {
				traces,
				env,
				context
			}) || Promise.resolve());
		},
		trace(traces, env, context) {
			globalThis.__env__ = env;
			context.waitUntil(nitroHooks.callHook("cloudflare:trace", {
				traces,
				env,
				context
			}) || Promise.resolve());
		}
	};
}
function augmentReq(cfReq, ctx) {
	const req = cfReq;
	req.ip = cfReq.headers.get("cf-connecting-ip") || void 0;
	req.runtime ??= { name: "cloudflare" };
	req.runtime.cloudflare = {
		...req.runtime.cloudflare,
		...ctx
	};
	req.waitUntil = ctx.context?.waitUntil.bind(ctx.context);
}
//#endregion
//#region node_modules/nitro/dist/presets/cloudflare/runtime/cloudflare-module.mjs
var cloudflare_module_default = createHandler({ fetch(cfRequest, env, context, url) {
	if (env.ASSETS && isPublicAssetURL(url.pathname)) return env.ASSETS.fetch(cfRequest);
} });
//#endregion
export { cloudflare_module_default as default };
