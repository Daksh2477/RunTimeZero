/**
 * Pond simulator.
 *
 *   /sim              a sample pond, for anyone curious
 *   /sim?pond=<id>    YOUR pond, already filled in
 *
 * The query string is read inside SimWorkspace on the client, NOT here.
 * Doing `await searchParams` in this server component stopped the simulator
 * below from hydrating at all, silently. See components/sim-workspace.tsx.
 */

import { SimWorkspace } from '@/components/sim-workspace';

export const metadata = {
  title: 'Explore a virtual pond',
  description:
    'Run the same physics engine that checks carbon claims. Change the pond, '
    + 'stop the paddlewheel, and watch the numbers move.',
};

export default function SimPage() {
  return <SimWorkspace />;
}
