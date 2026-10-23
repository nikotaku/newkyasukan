/** Run setupO2MailSync() once in the Gmail account receiving forwarded 02 mail. */
const O2_RELAY_ENDPOINT = 'https://imrxzkivwrkqbhqfbbes.supabase.co/functions/v1/o2-control';
const O2_RELAY_TOKEN = '__O2_RELAY_TOKEN__';
function setupO2MailSync() {
  if (!/^[a-f0-9]{64}$/.test(O2_RELAY_TOKEN)) throw new Error('ZR OSから設定用コードをコピーしてください');
  PropertiesService.getScriptProperties().setProperty('O2_RELAY_TOKEN', O2_RELAY_TOKEN);
  ScriptApp.getProjectTriggers().filter(function(t){ return t.getHandlerFunction()==='syncO2VerificationMail'; }).forEach(function(t){ ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncO2VerificationMail').timeBased().everyMinutes(1).create();
  syncO2VerificationMail();
}
function syncO2VerificationMail() {
  const lock=LockService.getScriptLock(); if(!lock.tryLock(500))return;
  try {
    const token=PropertiesService.getScriptProperties().getProperty('O2_RELAY_TOKEN');
    if(!token)throw new Error('setupO2MailSyncを先に実行してください');
    const cache=CacheService.getScriptCache();
    const messages=[];
    GmailApp.search('in:anywhere from:(m-sns.net) newer_than:1d -in:trash',0,30).forEach(function(thread){
      thread.getMessages().forEach(function(m){
        if(Date.now()-m.getDate().getTime()>10*60*1000 || cache.get('o2:'+m.getId()))return;
        if(!/認証|確認コード|verification/i.test(m.getSubject()))return;
        // Preserve the original recipient across Cloudflare Email Routing.
        const headers=['X-Original-To','Original-Recipient','X-Forwarded-To','Delivered-To','Envelope-To'].map(function(h){return m.getHeader(h)||'';});
        messages.push({id:m.getId(),from:m.getFrom(),to:m.getTo(),originalTo:headers.join(' '),subject:m.getSubject(),date:m.getDate().toISOString(),body:(m.getPlainBody()||'').slice(0,20000),authentication:m.getHeader('Authentication-Results')||''});
      });
    });
    // A heartbeat is sent even when there is no mail. No bodies/codes are written to logs.
    const response=UrlFetchApp.fetch(O2_RELAY_ENDPOINT,{method:'post',contentType:'application/json',headers:{'x-ingest-token':token},payload:JSON.stringify({action:'ingest',messages:messages.slice(0,30)}),muteHttpExceptions:true});
    if(response.getResponseCode()!==200)throw new Error('02メール連携の通信エラー: '+response.getResponseCode());
    // Only cache codes actually associated with a waiting job. Mail can arrive before the job is ready.
    const accepted=JSON.parse(response.getContentText()).acceptedMessageIds||[];
    accepted.forEach(function(id){cache.put('o2:'+id,'1',600);});
  } finally {lock.releaseLock();}
}
