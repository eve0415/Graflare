import { annotationListQuerySchema, createAnnotationSchema } from '@graflare/shared/schemas/annotation';
import { createAlertRuleGroupSchema, updateAlertRuleGroupInputSchema } from '@graflare/shared/schemas/alert-rule-group';
import { createAlertRuleSchema, updateAlertRuleInputSchema } from '@graflare/shared/schemas/alert-rule';
import { alertInstanceListQuerySchema } from '@graflare/shared/schemas/alert-instance';
import { createContactPointSchema, updateContactPointInputSchema } from '@graflare/shared/schemas/contact-point';
import { createNotificationPolicySchema, updateNotificationPolicyInputSchema } from '@graflare/shared/schemas/notification-policy';
import { createSilenceSchema, updateSilenceInputSchema } from '@graflare/shared/schemas/silence';
import { createMuteTimingSchema, updateMuteTimingInputSchema } from '@graflare/shared/schemas/mute-timing';
import { alertRuleGroupIdSchema, alertRuleIdSchema, annotationIdSchema, contactPointIdSchema, muteTimingIdSchema, notificationPolicyIdSchema, silenceIdSchema } from '@graflare/shared/schemas/ids';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod/mini';
import { env } from 'cloudflare:workers';

export const listAlertRuleGroups = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = await env.API.listAlertRuleGroups('default');
  return rows.map(r => ({ id: r.id, orgId: r.orgId, folderId: r.folderId, name: r.name, evalIntervalS: r.evalIntervalS, createdAt: r.createdAt, updatedAt: r.updatedAt }));
});

export const getAlertRuleGroup = createServerFn({ method: 'GET' })
  .inputValidator(alertRuleGroupIdSchema)
  .handler(async ({ data: id }) => {
    const r = await env.API.getAlertRuleGroup('default', id);
    if (r === null) return null;
    return { id: r.id, orgId: r.orgId, folderId: r.folderId, name: r.name, evalIntervalS: r.evalIntervalS, createdAt: r.createdAt, updatedAt: r.updatedAt };
  });

export const createAlertRuleGroup = createServerFn({ method: 'POST' })
  .inputValidator(createAlertRuleGroupSchema)
  .handler(async ({ data }) => {
    const r = await env.API.createAlertRuleGroup('default', data);
    return { id: r.id, name: r.name };
  });

export const updateAlertRuleGroup = createServerFn({ method: 'POST' })
  .inputValidator(updateAlertRuleGroupInputSchema)
  .handler(async ({ data: { id, data } }) => {
    const r = await env.API.updateAlertRuleGroup('default', id, data);
    if (r === null) return null;
    return { id: r.id, name: r.name };
  });

export const deleteAlertRuleGroup = createServerFn({ method: 'POST' })
  .inputValidator(alertRuleGroupIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteAlertRuleGroup('default', id);
  });

export const listAlertRules = createServerFn({ method: 'GET' }).handler(() => {
  const rows =  env.API.listAlertRules('default');
  return rows.map(r => ({
    id: r.id, orgId: r.orgId, groupId: r.groupId, title: r.title, queries: r.queries,
    condition: r.condition, labels: r.labels, annotations: r.annotations, forDurationS: r.forDurationS,
    noDataState: r.noDataState, execErrState: r.execErrState, isPaused: r.isPaused,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  }));
});

export const getAlertRule = createServerFn({ method: 'GET' })
  .inputValidator(alertRuleIdSchema)
  .handler(async ({ data: id }) => {
    const r = await env.API.getAlertRule('default', id);
    if (r === null) return null;
    return {
      id: r.id, orgId: r.orgId, groupId: r.groupId, title: r.title, queries: r.queries,
      condition: r.condition, labels: r.labels, annotations: r.annotations, forDurationS: r.forDurationS,
      noDataState: r.noDataState, execErrState: r.execErrState, isPaused: r.isPaused,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
  });

export const createAlertRule = createServerFn({ method: 'POST' })
  .inputValidator(createAlertRuleSchema)
  .handler(async ({ data }) => {
    const r = await env.API.createAlertRule('default', data);
    if (r === null) return null;
    return { id: r.id, title: r.title };
  });

export const updateAlertRule = createServerFn({ method: 'POST' })
  .inputValidator(updateAlertRuleInputSchema)
  .handler(async ({ data: { id, data } }) => {
    const r = await env.API.updateAlertRule('default', id, data);
    if (r === null) return null;
    return { id: r.id, title: r.title };
  });

export const deleteAlertRule = createServerFn({ method: 'POST' })
  .inputValidator(alertRuleIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteAlertRule('default', id);
  });

export const listAlertInstances = createServerFn({ method: 'GET' })
  .inputValidator(z.optional(alertInstanceListQuerySchema))
  .handler(async ({ data: opts }) => {
    const rows = await env.API.listAlertInstances('default', opts);
    return rows.map(r => ({
      id: r.id, orgId: r.orgId, ruleId: r.ruleId, labelsHash: r.labelsHash,
      labels: r.labels, state: r.state, value: r.value, activeAt: r.activeAt, lastEvalAt: r.lastEvalAt,
    }));
  });

export const listContactPoints = createServerFn({ method: 'GET' }).handler(() => {
  const rows =  env.API.listContactPoints('default');
  return rows.map(r => ({ id: r.id, orgId: r.orgId, name: r.name, type: r.type, settings: r.settings, createdAt: r.createdAt, updatedAt: r.updatedAt }));
});

export const getContactPoint = createServerFn({ method: 'GET' })
  .inputValidator(contactPointIdSchema)
  .handler(async ({ data: id }) => {
    const r = await env.API.getContactPoint('default', id);
    if (r === null) return null;
    return { id: r.id, orgId: r.orgId, name: r.name, type: r.type, settings: r.settings, createdAt: r.createdAt, updatedAt: r.updatedAt };
  });

export const createContactPoint = createServerFn({ method: 'POST' })
  .inputValidator(createContactPointSchema)
  .handler(async ({ data }) => {
    const r = await env.API.createContactPoint('default', data);
    if (r === null) return null;
    return { id: r.id, name: r.name };
  });

export const updateContactPoint = createServerFn({ method: 'POST' })
  .inputValidator(updateContactPointInputSchema)
  .handler(async ({ data: { id, data } }) => {
    const r = await env.API.updateContactPoint('default', id, data);
    if (r === null) return null;
    return { id: r.id, name: r.name };
  });

export const deleteContactPoint = createServerFn({ method: 'POST' })
  .inputValidator(contactPointIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteContactPoint('default', id);
  });

export const listNotificationPolicies = createServerFn({ method: 'GET' }).handler(() => {
  const rows =  env.API.listNotificationPolicies('default');
  return rows.map(r => ({
    id: r.id, orgId: r.orgId, parentId: r.parentId, contactPointId: r.contactPointId,
    groupBy: r.groupBy, matchers: r.matchers, muteTimingIds: r.muteTimingIds,
    groupWaitS: r.groupWaitS, groupIntervalS: r.groupIntervalS, repeatIntervalS: r.repeatIntervalS,
    continueMatching: r.continueMatching, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }));
});

export const createNotificationPolicy = createServerFn({ method: 'POST' })
  .inputValidator(createNotificationPolicySchema)
  .handler(async ({ data }) => {
    const r = await env.API.createNotificationPolicy('default', data);
    if (r === null) return null;
    return { id: r.id };
  });

export const updateNotificationPolicy = createServerFn({ method: 'POST' })
  .inputValidator(updateNotificationPolicyInputSchema)
  .handler(async ({ data: { id, data } }) => {
    const r = await env.API.updateNotificationPolicy('default', id, data);
    if (r === null) return null;
    return { id: r.id };
  });

export const deleteNotificationPolicy = createServerFn({ method: 'POST' })
  .inputValidator(notificationPolicyIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteNotificationPolicy('default', id);
  });

export const listSilences = createServerFn({ method: 'GET' }).handler(() => {
  const rows =  env.API.listSilences('default');
  return rows.map(r => ({
    id: r.id, orgId: r.orgId, matchers: r.matchers, startsAt: r.startsAt,
    endsAt: r.endsAt, comment: r.comment, createdBy: r.createdBy, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }));
});

export const getSilence = createServerFn({ method: 'GET' })
  .inputValidator(silenceIdSchema)
  .handler(async ({ data: id }) => {
    const r = await env.API.getSilence('default', id);
    if (r === null) return null;
    return { id: r.id, orgId: r.orgId, matchers: r.matchers, startsAt: r.startsAt, endsAt: r.endsAt, comment: r.comment, createdBy: r.createdBy, createdAt: r.createdAt, updatedAt: r.updatedAt };
  });

export const createSilence = createServerFn({ method: 'POST' })
  .inputValidator(createSilenceSchema)
  .handler(async ({ data }) => {
    const r = await env.API.createSilence('default', data);
    if (r === null) return null;
    return { id: r.id };
  });

export const updateSilence = createServerFn({ method: 'POST' })
  .inputValidator(updateSilenceInputSchema)
  .handler(async ({ data: { id, data } }) => {
    const r = await env.API.updateSilence('default', id, data);
    if (r === null) return null;
    return { id: r.id };
  });

export const deleteSilence = createServerFn({ method: 'POST' })
  .inputValidator(silenceIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteSilence('default', id);
  });

export const listMuteTimings = createServerFn({ method: 'GET' }).handler(() => {
  const rows =  env.API.listMuteTimings('default');
  return rows.map(r => ({ id: r.id, orgId: r.orgId, name: r.name, intervals: r.intervals, createdAt: r.createdAt, updatedAt: r.updatedAt }));
});

export const getMuteTiming = createServerFn({ method: 'GET' })
  .inputValidator(muteTimingIdSchema)
  .handler(async ({ data: id }) => {
    const r = await env.API.getMuteTiming('default', id);
    if (r === null) return null;
    return { id: r.id, orgId: r.orgId, name: r.name, intervals: r.intervals, createdAt: r.createdAt, updatedAt: r.updatedAt };
  });

export const createMuteTiming = createServerFn({ method: 'POST' })
  .inputValidator(createMuteTimingSchema)
  .handler(async ({ data }) => {
    const r = await env.API.createMuteTiming('default', data);
    if (r === null) return null;
    return { id: r.id, name: r.name };
  });

export const updateMuteTiming = createServerFn({ method: 'POST' })
  .inputValidator(updateMuteTimingInputSchema)
  .handler(async ({ data: { id, data } }) => {
    const r = await env.API.updateMuteTiming('default', id, data);
    if (r === null) return null;
    return { id: r.id, name: r.name };
  });

export const deleteMuteTiming = createServerFn({ method: 'POST' })
  .inputValidator(muteTimingIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteMuteTiming('default', id);
  });

export const listAnnotations = createServerFn({ method: 'GET' })
  .inputValidator(z.optional(annotationListQuerySchema))
  .handler(async ({ data: opts }) => {
    const rows = await env.API.listAnnotations('default', opts);
    return rows.map(r => ({
      id: r.id, orgId: r.orgId, dashboardId: r.dashboardId, panelId: r.panelId,
      alertRuleId: r.alertRuleId, time: r.time, timeEnd: r.timeEnd, text: r.text,
      tags: r.tags, prevState: r.prevState, newState: r.newState, createdAt: r.createdAt,
    }));
  });

export const createAnnotation = createServerFn({ method: 'POST' })
  .inputValidator(createAnnotationSchema)
  .handler(async ({ data }) => {
    const r = await env.API.createAnnotation('default', data);
    if (r === null) return null;
    return { id: r.id };
  });

export const deleteAnnotation = createServerFn({ method: 'POST' })
  .inputValidator(annotationIdSchema)
  .handler(async ({ data: id }) => {
    await env.API.deleteAnnotation('default', id);
  });
