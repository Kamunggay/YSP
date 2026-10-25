import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildReview } from '../../p02-review/reconcile.mjs';

const plan = JSON.parse(await readFile(new URL('../../p02-review/v1/review.json', import.meta.url), 'utf8'));

test('TR-03: reconciliation rejects missing inventory operations and checklist positions', async () => {
  const missingOperation = structuredClone(plan);
  missingOperation.inventory.Session.pop();
  await assert.rejects(buildReview(missingOperation), /inventory/);
  const missingCriterion = structuredClone(plan);
  missingCriterion.checklist.pop();
  await assert.rejects(buildReview(missingCriterion), /18 parent checklist positions/);
});

test('TR-03/SEC-03: review links and owner-attested reviews cannot silently drift to another revision', async () => {
  const brokenPack = structuredClone(plan);
  brokenPack.packs.MFA = ['mfa-recovery/missing'];
  await assert.rejects(buildReview(brokenPack), /missing pack scenario/);
  const wrongRevision = structuredClone(plan);
  wrongRevision.peerReviews[0].contractSha256 = '0'.repeat(64);
  await assert.rejects(buildReview(wrongRevision), /peer review must identify this exact contract/);
  const review = await buildReview(plan);
  assert.equal(review.operations.length, 49);
  assert.deepEqual(review.operations.filter(row => row.availability === 'safely_unavailable').map(row => row.operationId).sort(),
    ['disableGlobalIdentity', 'lookupIdentityDisableById', 'lookupIdentityDisableByKey']);
  assert.ok(review.scenarios.every(row => row.attemptedRequestsAndExpectedResponses.length));
  const signedOut = review.scenarios.find(row => row.id === 'session/bootstrap-signed-out').responseBoundaries[0];
  assert.ok(signedOut.forbiddenData.fields.includes('chapter_choices'));
  assert.ok(signedOut.forbiddenData.fields.includes('provider_destinations'));
  assert.equal(signedOut.permittedNextSteps.consumerActions[0].action, 'sign_in');
  const policy = review.scenarios.find(row => row.id === 'policy/missing-policy');
  assert.ok(policy.responseBoundaries.some(row => row.permittedNextSteps.actionLists.some(list =>
    list.actions.includes('request_responsible_duty'))));
});
