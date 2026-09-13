import test from 'node:test';
import assert from 'node:assert/strict';
import { approvePond } from '../src/services/eligibility.ts';

// Invalid approval must be rejected before any reconciliation or database work.
test('a buyer cannot approve pond inventory', async () => {
  await assert.rejects(approvePond('unused', {sub:'buyer',username:'buyer',role:'buyer'}), {status:403});
});
test('credits require a real supplied disposition reference', async () => {
  await assert.rejects(approvePond('unused', {sub:'admin',username:'admin',role:'admin'}, {issueCredits:true,disposition:'biochar'}), {status:422});
});
test('feed cannot be approved as durable removal', async () => {
  await assert.rejects(approvePond('unused', {sub:'admin',username:'admin',role:'admin'}, {issueCredits:true,disposition:'sold_as_feed',dispositionEvidenceRef:'receipt'}), {status:422});
});
