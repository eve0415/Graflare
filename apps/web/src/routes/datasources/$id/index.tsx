import { datasourceAuthType, datasourceType } from '@graflare/shared/schemas/datasource';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { DatasourceForm } from '../-components/datasource-form';
import { datasourceQueryOptions } from '../../../lib/query-options';

const EditDatasourcePage = () => {
  const { id } = Route.useParams();
  const { data: ds } = useSuspenseQuery(datasourceQueryOptions(id));

  const initialData = useMemo(
    () =>
      ds === null
        ? null
        : {
            id: ds.id,
            name: ds.name,
            type: datasourceType.parse(ds.type),
            url: ds.url,
            authType: datasourceAuthType.parse(ds.authType),
            queryTimeoutMs: ds.queryTimeoutMs,
          },
    [ds],
  );

  if (initialData === null) {
    return <p className='text-muted-foreground text-sm'>Data source not found.</p>;
  }

  return <DatasourceForm mode='edit' initialData={initialData} />;
};

export const Route = createFileRoute('/datasources/$id/')({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(datasourceQueryOptions(params.id)),
  component: EditDatasourcePage,
});
