import { datasourceAuthType, datasourceType } from '@graflare/shared/schemas/datasource';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { DatasourceForm } from '../-components/datasource-form';
import { getDatasource } from '../../../lib/api';

const EditDatasourcePage = () => {
  const ds = Route.useLoaderData();

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
  loader: ({ params }) => getDatasource({ data: params.id }),
  component: EditDatasourcePage,
});
