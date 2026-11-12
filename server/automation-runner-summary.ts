type Row = Record<string, any>;
export function summarizeAutomation(jobs: Row[], runs: Row[], now = new Date()) {
  const month = now.toISOString().slice(0,7);
  const monthly = jobs.filter(j => (j.started_at||'').startsWith(month));
  const rate = (type: string) => {
    const done=monthly.filter(j=>j.job_type===type && ['completed','failed','review_required'].includes(j.status));
    return done.length ? Math.round(100*done.filter(j=>j.status==='completed').length/done.length) : null;
  };
  const latest=(key:string,where=(j:Row)=>true)=>jobs.filter(where).map(j=>j[key]).filter(Boolean).sort().at(-1)||null;
  const minutes=runs.filter(r=>r.started_at.startsWith(month)).reduce((sum,r)=>sum+(r.duration_ms==null?0:Math.ceil(r.duration_ms/60000)),0);
  return { minutes, runs:runs.length, monthlyJobs:monthly.length, diarySuccessRate:rate('estama_post_diary'),shiftSuccessRate:rate('estama_sync_shift'),
    queued:jobs.filter(j=>j.status==='queued').length,running:jobs.filter(j=>j.status==='running').length,
    failed:jobs.filter(j=>j.status==='failed').length,reviewRequired:jobs.filter(j=>j.status==='review_required'||j.error_message?.startsWith('【要確認・再送停止】')).length,
    lastRun:latest('started_at'),lastSuccess:latest('finished_at',j=>j.status==='completed'),
    averageJobSeconds:monthly.filter(j=>j.duration_ms!=null).length ? Math.round(monthly.reduce((sum,j)=>sum+(j.duration_ms||0),0)/monthly.filter(j=>j.duration_ms!=null).length/1000):null };
}
