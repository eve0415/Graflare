import type { NotificationPolicy } from '@graflare/shared/schemas/notification-policy';

/**
 * Build the parent-policy Select options from the full policy list. Policies have no name of
 * their own, so each is labelled by its contact point (mirroring the list page) with a short id
 * suffix to disambiguate. Pass `excludeId` on the edit route to drop the policy being edited so
 * it can't become its own parent.
 */
export const buildParentOptions = (
  policies: readonly Pick<NotificationPolicy, 'id' | 'contactPointId'>[],
  contactPoints: readonly { id: string; name: string }[],
  excludeId?: string,
): { value: string; label: string }[] => {
  const cpNames = new Map<string, string>();
  for (const cp of contactPoints) {
    cpNames.set(cp.id, cp.name);
  }
  const options: { value: string; label: string }[] = [];
  for (const policy of policies) {
    if (policy.id === excludeId) continue;
    const shortId = policy.id.slice(0, 8);
    const cpName = policy.contactPointId === null ? null : cpNames.get(policy.contactPointId);
    options.push({ value: policy.id, label: cpName === null || cpName === undefined ? `Policy ${shortId}` : `${cpName} (${shortId})` });
  }
  return options;
};
