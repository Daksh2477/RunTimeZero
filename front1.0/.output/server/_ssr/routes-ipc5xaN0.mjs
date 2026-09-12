import { i as __toESM } from "../_runtime.mjs";
import { n as AnimatePresence, t as motion } from "../_libs/framer-motion+[...].mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-collection+[...].mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { n as Label, t as Input } from "./label-CmIE8x5o.mjs";
import { c as SITES, l as USERS, n as EARNED_CREDITS, o as PONDS, s as ROLE_META, t as CREDIT_BATCHES } from "./mockData-CPGb_Aq0.mjs";
import { C as FlaskConical, I as BadgeCheck, L as ArrowRight, P as ChartLine, S as KeyRound, a as Wallet, b as Lock, m as ShieldCheck, p as Smartphone, v as Mail, x as Leaf } from "../_libs/lucide-react.mjs";
import { r as setSessionRole } from "./session-CG_MZ3g9.mjs";
import { _ as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as useMutation } from "../_libs/tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-ipc5xaN0.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Thin API wrappers. Today they resolve mock data; point BASE at apps/api
* (Express) and swap each body for a fetch call without touching the UI.
*/
var latency = (value, ms = 220) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
var api = {
	listPonds: (userId) => {
		const user = USERS.find((u) => u.id === userId);
		return latency(user?.pondIds.length ? PONDS.filter((p) => user.pondIds.includes(p.id)) : PONDS);
	},
	listSites: () => latency(SITES),
	listCreditBatches: () => latency(CREDIT_BATCHES),
	getEarnedCredits: () => latency(EARNED_CREDITS),
	listUsers: () => latency(USERS),
	/** Account abstraction: a wallet is derived silently after social/OTP login. */
	signIn: async (input) => {
		const user = USERS.find((u) => u.role === input.role) ?? USERS[0];
		return latency({
			user: {
				...user,
				email: input.identifier || user.email
			},
			method: input.method,
			redirectTo: ROLE_META[input.role].consolePath,
			walletProvisioned: true
		}, 600);
	}
};
var useSignIn = () => useMutation({ mutationFn: api.signIn });
var ROLES = [
	"farmer",
	"investor",
	"researcher"
];
var roleIcon = {
	farmer: Leaf,
	investor: ChartLine,
	researcher: FlaskConical
};
function AuthPage() {
	const [role, setRole] = (0, import_react.useState)("farmer");
	const [identifier, setIdentifier] = (0, import_react.useState)("");
	const [secret, setSecret] = (0, import_react.useState)("");
	const navigate = useNavigate();
	const signIn = useSignIn();
	const meta = ROLE_META[role];
	const submit = (method) => {
		signIn.mutate({
			role,
			identifier,
			method
		}, { onSuccess: () => {
			setSessionRole(role);
			if (role === "farmer") navigate({ to: "/console/farmer" });
			else if (role === "investor") navigate({ to: "/console/investor" });
			else navigate({ to: "/console/researcher" });
		} });
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "relative hidden flex-col justify-between bg-panel p-12 text-panel-foreground lg:flex",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2 font-display text-lg font-semibold tracking-tight",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "grid size-9 place-items-center rounded-md bg-accent text-accent-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leaf, { className: "size-5" })
						}),
						"RunTimeZero",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-panel-foreground/50",
							children: "/ AlgaCarbon"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-16 max-w-lg font-display text-4xl leading-tight font-semibold tracking-tight",
					children: "Microalgae telemetry, growth simulation and verified carbon credits in one control plane."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-5 max-w-md text-sm text-panel-foreground/60",
					children: "Live pond sensing, a Rust/WebAssembly growth engine and on-chain credit issuance — one platform for the field, the desk and the lab."
				})
			] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
				className: "grid grid-cols-3 gap-6 border-t border-panel-foreground/10 pt-8",
				children: [
					{
						k: "Ponds monitored",
						v: "20"
					},
					{
						k: "Biomass tracked",
						v: "68.8 t"
					},
					{
						k: "Credits issued",
						v: "2,970"
					}
				].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
					className: "text-xs tracking-wide text-panel-foreground/50 uppercase",
					children: s.k
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
					className: "mt-1 font-display text-2xl font-semibold",
					children: s.v
				})] }, s.k))
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
			className: "flex items-center justify-center bg-background px-5 py-12 sm:px-10",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "w-full max-w-md",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase",
						children: "Sign in"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "mt-2 font-display text-2xl font-semibold tracking-tight",
						children: "Choose how you work"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-6 grid grid-cols-3 gap-2 rounded-lg border border-border bg-card p-1.5",
						children: ROLES.map((r) => {
							const Icon = roleIcon[r];
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => setRole(r),
								className: `flex flex-col items-center gap-1.5 rounded-md px-2 py-3 text-xs font-medium transition-colors ${r === role ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-4" }), ROLE_META[r].label]
							}, r);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AnimatePresence, {
						mode: "wait",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(motion.div, {
							initial: {
								opacity: 0,
								y: 8
							},
							animate: {
								opacity: 1,
								y: 0
							},
							exit: {
								opacity: 0,
								y: -8
							},
							transition: { duration: .18 },
							className: "mt-5 rounded-xl border border-border bg-card p-6 shadow-sm",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "font-display text-sm font-semibold",
									children: meta.tagline
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-xs text-muted-foreground",
									children: meta.authMode
								}),
								role === "farmer" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-5 space-y-4",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "space-y-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
												htmlFor: "ident",
												children: "Mobile number or email"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												id: "ident",
												inputMode: "email",
												placeholder: "+91 98765 43210",
												value: identifier,
												onChange: (e) => setIdentifier(e.target.value),
												className: "h-12 text-base"
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
											className: "h-12 w-full text-base",
											disabled: signIn.isPending,
											onClick: () => submit("sms_otp"),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Smartphone, { className: "size-4" }), " Send one-time code"]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
											variant: "outline",
											className: "h-12 w-full text-base",
											disabled: signIn.isPending,
											onClick: () => submit("magic_link"),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mail, { className: "size-4" }), " Email me a magic link"]
										})
									]
								}),
								role === "investor" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-5 space-y-4",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "space-y-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
												htmlFor: "work-email",
												children: "Work email"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												id: "work-email",
												type: "email",
												placeholder: "desk@fund.com",
												value: identifier,
												onChange: (e) => setIdentifier(e.target.value)
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "space-y-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
												htmlFor: "pw",
												children: "Password"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												id: "pw",
												type: "password",
												placeholder: "••••••••",
												value: secret,
												onChange: (e) => setSecret(e.target.value)
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
											className: "w-full",
											disabled: signIn.isPending,
											onClick: () => submit("password"),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, { className: "size-4" }), " Continue"]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "grid grid-cols-2 gap-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												variant: "outline",
												onClick: () => submit("oauth_google"),
												children: "Google"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												variant: "outline",
												onClick: () => submit("oauth_linkedin"),
												children: "LinkedIn"
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BadgeCheck, { className: "size-4 text-status-warning" }), "Identity check runs after first sign-in — trading unlocks once verified."]
										})
									]
								}),
								role === "researcher" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-5 space-y-4",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "space-y-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
												htmlFor: "invite",
												children: "Invitation code"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												id: "invite",
												placeholder: "RTZ-LAB-XXXX",
												value: secret,
												onChange: (e) => setSecret(e.target.value)
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "space-y-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
												htmlFor: "lab-email",
												children: "Institutional email"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												id: "lab-email",
												type: "email",
												placeholder: "you@lab.org",
												value: identifier,
												onChange: (e) => setIdentifier(e.target.value)
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
											className: "w-full",
											disabled: signIn.isPending,
											onClick: () => submit("invitation"),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyRound, { className: "size-4" }), " Redeem invitation"]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "size-4" }), "Lab accounts are created by an administrator — no self sign-up."]
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-5 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, { className: "size-4 text-accent" }), "A secure wallet is created for you automatically. No seed phrases, no extensions."]
								}),
								signIn.isPending && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-3 flex items-center gap-2 text-xs font-medium text-accent",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "size-3.5 animate-pulse" }),
										" Preparing your",
										" ",
										meta.label.toLowerCase(),
										" console…"
									]
								})
							]
						}, role)
					})
				]
			})
		})]
	});
}
//#endregion
export { AuthPage as component };
