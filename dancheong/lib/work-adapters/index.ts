import type { ScenarioPack } from "../scenario";
import { fateSeoulAdapter } from "./fate-seoul";

export type WorkAdapter = typeof fateSeoulAdapter;

const adapters: readonly WorkAdapter[] = [fateSeoulAdapter];

export const resolveWorkAdapter = (
  pack: ScenarioPack,
): WorkAdapter | undefined => adapters.find((adapter) => adapter.matches(pack));

export const resolveWorkAdapterByRouteId = (
  routeId: string,
): WorkAdapter | undefined => adapters.find(
  (adapter) => adapter.routeId === routeId,
);

export { fateSeoulAdapter } from "./fate-seoul";
