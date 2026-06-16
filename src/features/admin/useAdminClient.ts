// useAdminClient — the admin console's ClickHouse access, connection-aware.
//
// The legacy admin talked to a single `clickHouseClient` from workspaceStore.
// This hook returns a drop-in replacement whose `.query({query, query_params})`
// / `.command({query})` surface matches what the admin code already calls, but
// routes through the per-connection workbench transport (getTransport) when an
// active ClickHouse connection is selected. With no active CH connection it
// falls back to the legacy client, so behavior is unchanged unless the user is
// on a workbench ClickHouse connection.
//
// ch-ui-pev. Note: the legacy fallback also keeps the admin unit tests (which
// mock workspaceStore.clickHouseClient) working unchanged.
import { useMemo } from "react";
import useAppStore from "@/stores/workspaceStore";
import { useActiveClickHouseConnectionId } from "@/stores/workbenchStore";
import { getTransport } from "@/lib/transport";

export interface AdminQueryOptions {
  query: string;
  query_params?: Record<string, unknown>;
  format?: string;
}

/** Minimal surface of the ClickHouse client that the admin console uses. */
export interface AdminClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(opts: AdminQueryOptions): Promise<{ json(): Promise<any> }>;
  command(opts: { query: string }): Promise<unknown>;
}

export function useAdminClient(): AdminClient | null {
  const connectionId = useActiveClickHouseConnectionId();
  // Destructure (no selector) so the admin tests' useAppStore mock works.
  const { clickHouseClient } = useAppStore();

  return useMemo<AdminClient | null>(() => {
    // No active workbench ClickHouse connection → legacy single-CH client.
    if (!connectionId) {
      return (clickHouseClient as unknown as AdminClient) ?? null;
    }

    const transport = getTransport(connectionId);
    return {
      async query(opts: AdminQueryOptions) {
        // transport params are strings; CH binds them per the {name:Type} hints.
        const params = opts.query_params
          ? Object.fromEntries(
              Object.entries(opts.query_params).map(([k, v]) => [k, String(v)]),
            )
          : undefined;
        const result = await transport.query(opts.query, params);
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async json(): Promise<any> {
            return {
              data: result.data,
              meta: result.meta,
              rows: result.rows,
              statistics: result.statistics,
            };
          },
        };
      },
      async command(opts: { query: string }) {
        await transport.command(opts.query);
        return {};
      },
    };
  }, [connectionId, clickHouseClient]);
}
