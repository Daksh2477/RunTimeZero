/**
 * Mock session store. Holds the signed-in role so the console can hide
 * areas a role is not allowed to see. Swap for real auth later.
 */
import { useEffect, useState } from "react";
import type { Role } from "./mockData";

export type ConsoleRole = Role | "admin";

const KEY = "rtz.role";
const EVENT = "rtz-session-change";

export const CONSOLE_ACCESS: Record<ConsoleRole, string[]> = {
  // Everyone can reach the marketplace to trade credits or products.
  farmer: ["/console/farmer", "/console/market"],
  investor: ["/console/investor", "/console/market"],
  researcher: ["/console/researcher", "/console/market"],
  admin: ["/console/farmer", "/console/investor", "/console/researcher", "/console/admin", "/console/market"],
};

export function setSessionRole(role: ConsoleRole) {
  localStorage.setItem(KEY, role);
  window.dispatchEvent(new Event(EVENT));
}

export function clearSessionRole() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function useSessionRole() {
  const [role, setRole] = useState<ConsoleRole | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
      setRole((localStorage.getItem(KEY) as ConsoleRole | null) ?? null);
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

  return { role, ready };
}

export function canAccess(role: ConsoleRole | null, path: string) {
  if (!role) return false;
  return CONSOLE_ACCESS[role].some((p) => path.startsWith(p));
}
