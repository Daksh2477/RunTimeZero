import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Leaf,
  ShieldCheck,
  Smartphone,
  Mail,
  Lock,
  KeyRound,
  Wallet,
  ArrowRight,
  BadgeCheck,
  FlaskConical,
  LineChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_META, type Role } from "@/lib/mockData";
import { setSessionRole } from "@/lib/session";
import { useSignIn } from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — RunTimeZero AlgaCarbon" },
      {
        name: "description",
        content:
          "Sign in to RunTimeZero AlgaCarbon: microalgae pond telemetry, growth simulation and a verified carbon credit marketplace for farmers, investors and researchers.",
      },
      { property: "og:title", content: "Sign in — RunTimeZero AlgaCarbon" },
      {
        property: "og:description",
        content:
          "Passwordless field access for farmers, verified marketplace access for investors, invite-only lab access for researchers.",
      },
    ],
  }),
  component: AuthPage,
});

const ROLES: Role[] = ["farmer", "investor", "researcher"];

const roleIcon: Record<Role, typeof Leaf> = {
  farmer: Leaf,
  investor: LineChart,
  researcher: FlaskConical,
};

function AuthPage() {
  const [role, setRole] = useState<Role>("farmer");
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
  const navigate = useNavigate();
  const signIn = useSignIn();
  const meta = ROLE_META[role];

  const submit = (method: string) => {
    signIn.mutate(
      { role, identifier, method },
      {
        onSuccess: () => {
          setSessionRole(role);
          if (role === "farmer") navigate({ to: "/console/farmer" });
          else if (role === "investor") navigate({ to: "/console/investor" });
          else navigate({ to: "/console/researcher" });
        },
      },
    );
  };

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-panel p-12 text-panel-foreground lg:flex">
        {/* Decorative background elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-50" />
        <div className="absolute -top-40 -left-40 size-96 rounded-full bg-primary/20 blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-accent/20 blur-[100px]" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <span className="grid size-9 place-items-center rounded-md bg-accent text-accent-foreground shadow-lg">
              <Leaf className="size-5" />
            </span>
            RunTimeZero
            <span className="text-panel-foreground/50">/ AlgaCarbon</span>
          </div>
          <h1 className="mt-16 max-w-lg font-display text-5xl leading-[1.1] font-semibold tracking-tight">
            Microalgae telemetry, growth simulation and verified carbon credits.
          </h1>
          <p className="mt-6 max-w-md text-base text-panel-foreground/70 leading-relaxed">
            Live pond sensing, a Rust/WebAssembly growth engine and on-chain credit issuance —
            one platform for the field, the desk and the lab.
          </p>
        </div>

        <dl className="relative z-10 grid grid-cols-3 gap-6 border-t border-panel-foreground/10 pt-8">
          {[
            { k: "Ponds monitored", v: "20" },
            { k: "Biomass tracked", v: "68.8 t" },
            { k: "Credits issued", v: "2,970" },
          ].map((s) => (
            <div key={s.k}>
              <dt className="text-xs tracking-wide text-panel-foreground/60 uppercase">{s.k}</dt>
              <dd className="mt-1 font-display text-3xl font-semibold tracking-tight">{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="relative flex items-center justify-center bg-background/95 px-5 py-12 sm:px-10 overflow-hidden">
        {/* Soft background glows for right pane */}
        <div className="absolute top-1/4 -right-20 size-72 rounded-full bg-primary/10 blur-[80px]" />
        <div className="absolute bottom-1/4 -left-20 size-72 rounded-full bg-accent/10 blur-[80px]" />
        
        <div className="relative z-10 w-full max-w-md px-4 sm:px-0">
          <div className="mb-8 text-center lg:text-left">
            <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
              Welcome Back
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">
              Choose how you work
            </h2>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2 rounded-xl border border-border/50 bg-card/60 backdrop-blur-xl p-1.5 shadow-sm">
            {ROLES.map((r) => {
              const Icon = roleIcon[r];
              const active = r === role;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex flex-col items-center gap-1.5 rounded-md px-2 py-3 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon className="size-4" />
                  {ROLE_META[r].label}
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={role}
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.98 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="mt-6 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-2xl p-7 shadow-xl shadow-primary/5"
            >
              <p className="font-display text-base font-semibold">{meta.tagline}</p>
              <p className="mt-1 text-xs text-muted-foreground">{meta.authMode}</p>

              {role === "farmer" && (
                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ident">Mobile number or email</Label>
                    <Input
                      id="ident"
                      inputMode="email"
                      placeholder="+91 98765 43210"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="h-12 text-base w-full"
                    />
                  </div>
                  <Button
                    className="h-12 w-full text-base"
                    disabled={signIn.isPending}
                    onClick={() => submit("sms_otp")}
                  >
                    <Smartphone className="size-4 mr-2" /> Send one-time code
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 w-full text-base"
                    disabled={signIn.isPending}
                    onClick={() => submit("magic_link")}
                  >
                    <Mail className="size-4 mr-2" /> Email me a magic link
                  </Button>
                </div>
              )}

              {role === "investor" && (
                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="work-email">Work email</Label>
                    <Input
                      id="work-email"
                      type="email"
                      placeholder="desk@fund.com"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw">Password</Label>
                    <Input
                      id="pw"
                      type="password"
                      placeholder="••••••••"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={signIn.isPending}
                    onClick={() => submit("password")}
                  >
                    <Lock className="size-4 mr-2" /> Continue
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => submit("oauth_google")}>
                      Google
                    </Button>
                    <Button variant="outline" onClick={() => submit("oauth_linkedin")}>
                      LinkedIn
                    </Button>
                  </div>
                  <p className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
                    <BadgeCheck className="size-4 text-status-warning" />
                    Identity check runs after first sign-in — trading unlocks once verified.
                  </p>
                </div>
              )}

              {role === "researcher" && (
                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite">Invitation code</Label>
                    <Input
                      id="invite"
                      placeholder="RTZ-LAB-XXXX"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lab-email">Institutional email</Label>
                    <Input
                      id="lab-email"
                      type="email"
                      placeholder="you@lab.org"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={signIn.isPending}
                    onClick={() => submit("invitation")}
                  >
                    <KeyRound className="size-4 mr-2" /> Redeem invitation
                  </Button>
                  <p className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
                    <ShieldCheck className="size-4" />
                    Lab accounts are created by an administrator — no self sign-up.
                  </p>
                </div>
              )}

              <p className="mt-6 flex items-center gap-2 border-t border-border/50 pt-5 text-xs text-muted-foreground">
                <Wallet className="size-4 text-accent" />
                A secure wallet is created for you automatically. No seed phrases, no extensions.
              </p>

              {signIn.isPending && (
                <p className="mt-4 flex justify-center items-center gap-2 text-xs font-medium text-accent">
                  <ArrowRight className="size-3.5 animate-pulse" /> Preparing your console…
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}
