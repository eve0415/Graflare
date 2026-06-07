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

const STALE_30S = 30 * 1000;
const STALE_5M = 5 * 60 * 1000;

export const alertRuleGroupsQueryOptions = () =>
  queryOptions({
    queryKey: ['alert-rule-groups'],
    queryFn: () => listAlertRuleGroups(),
    staleTime: STALE_30S,
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
    staleTime: STALE_30S,
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
    staleTime: STALE_5M,
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
    staleTime: STALE_5M,
  });

export const silencesQueryOptions = () =>
  queryOptions({
    queryKey: ['silences'],
    queryFn: () => listSilences(),
    staleTime: STALE_5M,
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
    staleTime: STALE_5M,
  });

export const muteTimingQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['mute-timing', id],
    queryFn: () => getMuteTiming({ data: id }),
  });
