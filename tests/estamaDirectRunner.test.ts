import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { validateActionsClaims, verifyActionsIdentity, ACTIONS_AUDIENCE, ACTIONS_WORKFLOW } from '../server/github-actions-identity.ts';
import { summarizeAutomation } from '../server/automation-runner-summary.ts';
const now=Math.floor(Date.now()/1000);
const claims={iss:'https://token.actions.githubusercontent.com',aud:ACTIONS_AUDIENCE,sub:'repo:nikotaku/newkyasukan:ref:refs/heads/main',repository:'nikotaku/newkyasukan',repository_id:'1056485219',repository_owner_id:'57981034',ref:'refs/heads/main',workflow_ref:ACTIONS_WORKFLOW,runner_environment:'github-hosted',event_name:'workflow_dispatch',run_id:'123',run_attempt:'1',repository_visibility:'public',exp:now+120,nbf:now-5,iat:now-5};
test('trust allows only the exact repository, owner, main workflow and bounded token lifetime',()=>{
 assert.equal(validateActionsClaims(claims).run_id,'123');
 for(const patch of [{repository_id:'1'},{repository_owner_id:'1'},{ref:'refs/pull/1/merge'},{event_name:'pull_request_target'},{workflow_ref:'other.yml'},{sub:'repo:attacker/repo:ref:refs/heads/main'},{aud:'other'},{exp:now-1},{nbf:now+120},{iat:now-1000},{run_id:'../other'},{runner_environment:'self-hosted'}]) assert.throws(()=>validateActionsClaims({...claims,...patch}));
});
test('cryptographic verification rejects forged signatures and alg=none',async()=>{
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({keys:[{...publicKey.export({format:'jwk'}),kid:'test'}]}));
 try {
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig=sign('RSA-SHA256',Buffer.from(`${header}.${payload}`),privateKey).toString('base64url');
  assert.equal((await verifyActionsIdentity(`${header}.${payload}.${sig}`)).run_id,'123');
  await assert.rejects(verifyActionsIdentity(`${header}.${payload}.${Buffer.alloc(256).toString('base64url')}`));
  await assert.rejects(verifyActionsIdentity(`${Buffer.from('{"alg":"none"}').toString('base64url')}.${payload}.`));
 } finally {globalThis.fetch=original;}
});
test('dashboard counts old pending jobs, uncertain results and monthly rates without reporting cancelled jobs as retries',()=>{
 const r=summarizeAutomation([
  {status:'cancelled',job_type:'estama_sync_shift',started_at:'2026-11-01'},
  {status:'queued',created_at:'2026-08-01'},
  {status:'completed',job_type:'estama_post_diary',started_at:'2026-11-11',finished_at:'2026-11-11',duration_ms:30000},
  {status:'review_required',job_type:'estama_post_diary',started_at:'2026-11-12',duration_ms:60000},
 ],[{started_at:'2026-11-11',duration_ms:61000}],new Date('2026-11-12T00:00:00Z'));
 assert.equal(r.queued,1);assert.equal(r.running,0);assert.equal(r.reviewRequired,1);assert.equal(r.diarySuccessRate,50);assert.equal(r.minutes,2);assert.equal(r.shiftSuccessRate,null);
});
