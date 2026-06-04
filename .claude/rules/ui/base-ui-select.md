---
paths:
  - 'apps/web/src/routes/**'
  - 'packages/ui/src/components/select.tsx'
---

# Base UI Select — items prop required for trigger labels

`Select.Value` renders the **raw value** unless `Select.Root` receives an `items` prop. The
children text inside `<SelectItem>` only affects the dropdown list, NOT the closed trigger.
Every `<Select>` must pass `items`.

## Pattern: single-source option array

Define one array, feed it to both `items` (trigger label resolution) and `.map()` (dropdown):

```tsx
const OPTIONS = [
  { value: 'prometheus', label: 'Prometheus' },
  { value: 'sql', label: 'SQL' },
] as const;

<Select value={current} onValueChange={handleChange} items={OPTIONS}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {OPTIONS.map(o => (
      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

For dynamic data, compute the array from the data source:

```tsx
const dsItems = useMemo(() => datasources.map(ds => ({ value: ds.id, label: ds.name })), [datasources]);
```

## Checklist (every Select)

- [ ] `items` prop present on `Select.Root` — either a static `as const` array or a `useMemo`
- [ ] `SelectItem` children rendered from the same array (no duplicated labels)
- [ ] `disabled` items use `disabled` prop on `SelectItem`, not in the `items` array
