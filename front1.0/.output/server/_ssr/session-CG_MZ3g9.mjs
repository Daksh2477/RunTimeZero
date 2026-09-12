import { i as __toESM } from "../_runtime.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/session-CG_MZ3g9.js
var import_react = /* @__PURE__ */ __toESM(require_react());
/**
* Mock session store. Holds the signed-in role so the console can hide
* areas a role is not allowed to see. Swap for real auth later.
*/
var KEY = "rtz.role";
var EVENT = "rtz-session-change";
var CONSOLE_ACCESS = {
	farmer: ["/console/farmer", "/console/investor"],
	investor: ["/console/investor"],
	researcher: ["/console/researcher"],
	admin: [
		"/console/farmer",
		"/console/investor",
		"/console/researcher",
		"/console/admin"
	]
};
function setSessionRole(role) {
	localStorage.setItem(KEY, role);
	window.dispatchEvent(new Event(EVENT));
}
function clearSessionRole() {
	localStorage.removeItem(KEY);
	window.dispatchEvent(new Event(EVENT));
}
function useSessionRole() {
	const [role, setRole] = (0, import_react.useState)(null);
	const [ready, setReady] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const read = () => {
			setRole(localStorage.getItem(KEY) ?? null);
			setReady(true);
		};
		read();
		window.addEventListener(EVENT, read);
		window.addEventListener("storage", read);
		return () => {
			window.removeEventListener(EVENT, read);
			window.removeEventListener("storage", read);
		};
	}, []);
	return {
		role,
		ready
	};
}
function canAccess(role, path) {
	if (!role) return false;
	return CONSOLE_ACCESS[role].some((p) => path.startsWith(p));
}
//#endregion
export { useSessionRole as i, clearSessionRole as n, setSessionRole as r, canAccess as t };
