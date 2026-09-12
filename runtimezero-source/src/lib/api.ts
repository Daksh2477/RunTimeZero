/**
 * Thin API wrappers. Today they resolve mock data; point BASE at apps/api
 * (Express) and swap each body for a fetch call without touching the UI.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CREDIT_BATCHES,
  EARNED_CREDITS,
  PONDS,
  ROLE_META,
  SITES,
  USERS,
  type Role,
} from "./mockData";

const latency = <T,>(value: T, ms = 220) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const api = {
  listPonds: (userId?: string) => {
    const user = USERS.find((u) => u.id === userId);
    return latency(user?.pondIds.length ? PONDS.filter((p) => user.pondIds.includes(p.id)) : PONDS);
  },
  listSites: () => latency(SITES),
  listCreditBatches: () => latency(CREDIT_BATCHES),
  getEarnedCredits: () => latency(EARNED_CREDITS),
  listUsers: () => latency(USERS),
  /** Account abstraction: a wallet is derived silently after social/OTP login. */
  signIn: async (input: { role: Role; identifier: string; method: string }) => {
    const user = USERS.find((u) => u.role === input.role) ?? USERS[0]!;
    return latency(
      {
        user: { ...user, email: input.identifier || user.email },
        method: input.method,
        redirectTo: ROLE_META[input.role].consolePath,
        walletProvisioned: true,
      },
      600,
    );
  },
};

export const useSites = () => useQuery({ queryKey: ["sites"], queryFn: api.listSites });
export const usePonds = (userId?: string) =>
  useQuery({ queryKey: ["ponds", userId], queryFn: () => api.listPonds(userId) });
export const useCreditBatches = () =>
  useQuery({ queryKey: ["credit-batches"], queryFn: api.listCreditBatches });
export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: api.listUsers });
export const useSignIn = () => useMutation({ mutationFn: api.signIn });
