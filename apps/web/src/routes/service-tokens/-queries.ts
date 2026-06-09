import { queryOptions } from '@tanstack/react-query';

import { listServiceTokens } from './-api';

const STALE_5M = 5 * 60 * 1000;

// Only token METADATA is cached here (id, client_id, name, timestamps). The one-time
// `clientSecret` is never returned by this query and never enters the query cache — it
// lives only in the reveal panel's local state.
export const serviceTokensQueryOptions = () =>
  queryOptions({
    queryKey: ['service-tokens'],
    queryFn: () => listServiceTokens(),
    staleTime: STALE_5M,
  });
