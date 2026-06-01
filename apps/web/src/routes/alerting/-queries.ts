import { queryOptions } from '@tanstack/react-query';

import {
  getAlertRule,
  getAlertRuleGroup,
  getContactPoint,
  getMuteTiming,
  getSilence,
  listAlertInstances,
  listAlertRuleGroups,
  listAlertRules,
  listContactPoints,
  listMuteTimings,
  listNotificationPolicies,
  listSilences,
} from './-api';

export const alertRuleGroupsQueryOptions = () =>
  queryOptions({
    queryKey: ['alert-rule-groups'],
    queryFn: () => listAlertRuleGroups(),
  });

export const alertRuleGroupQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['alert-rule-group', id],
    queryFn: () => getAlertRuleGroup({ data: id }),
  });

export const alertRulesQueryOptions = () =>
  queryOptions({
    queryKey: ['alert-rules'],
    queryFn: () => listAlertRules(),
  });

export const alertRuleQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['alert-rule', id],
    queryFn: () => getAlertRule({ data: id }),
  });

export const alertInstancesQueryOptions = () =>
  queryOptions({
    queryKey: ['alert-instances'],
    queryFn: () => listAlertInstances(),
  });

export const contactPointsQueryOptions = () =>
  queryOptions({
    queryKey: ['contact-points'],
    queryFn: () => listContactPoints(),
  });

export const contactPointQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['contact-point', id],
    queryFn: () => getContactPoint({ data: id }),
  });

export const notificationPoliciesQueryOptions = () =>
  queryOptions({
    queryKey: ['notification-policies'],
    queryFn: () => listNotificationPolicies(),
  });

export const silencesQueryOptions = () =>
  queryOptions({
    queryKey: ['silences'],
    queryFn: () => listSilences(),
  });

export const silenceQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['silence', id],
    queryFn: () => getSilence({ data: id }),
  });

export const muteTimingsQueryOptions = () =>
  queryOptions({
    queryKey: ['mute-timings'],
    queryFn: () => listMuteTimings(),
  });

export const muteTimingQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['mute-timing', id],
    queryFn: () => getMuteTiming({ data: id }),
  });
