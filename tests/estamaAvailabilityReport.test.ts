import assert from 'node:assert/strict';
import test from 'node:test';
import { availabilitySuccessPayload } from '../server/estama-availability-report.ts';
const result = {availabilityUrl:'',activeCount:0,availableNowCount:0,inactiveCount:0,manualPreservedCount:0,skippedCount:0,castNames:[],confirmation:'',validUntil:null,deferred:false,updated:true};
const time='2026-11-19T15:42:00Z';
test('successful refresh clears previous error when merged into configuration',()=>{
 const payload=availabilitySuccessPayload(result,time,time);
 assert.equal({...{error:'403 Forbidden'},...payload.configuration}.error,null);
});
test('deferred refresh preserves an unresolved error',()=>{
 const payload=availabilitySuccessPayload({...result,deferred:true,updated:false},time,time);
 assert.equal({...{error:'403 Forbidden'},...payload.configuration}.error,'403 Forbidden');
});
