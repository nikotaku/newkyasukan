export interface PostingCompletion {
  cast_id: string;
  task_id: string;
  is_completed: boolean;
  completed_at: string | null;
}

export interface PostingCast { id: string; name: string }

// Match the portal's legacy name fallback only when explicit cast IDs are absent.
export function promotionParticipants(castIds: string[], label: string, casts: PostingCast[]) {
  const ids = [...new Set(castIds)];
  if (ids.length) return ids.map((id) => ({ id, name: casts.find((cast) => cast.id === id)?.name ?? "名前を取得できないセラピスト" }));
  const names = label.split(/\s*[&＆]\s*/);
  return casts.filter((cast) => cast.name === label || names.includes(cast.name));
}

export function postingCompletionKey(castId: string, taskId: string) {
  return `${castId}:${taskId}`;
}

export function postingCompletionIndex(rows: PostingCompletion[]) {
  return new Map(rows.filter((row) => row.is_completed).map((row) => [postingCompletionKey(row.cast_id, row.task_id), row]));
}

export function therapistPostingProgress(taskIds: string[], castIds: string[], index: Map<string, PostingCompletion>) {
  let completed = 0;
  const tasks = [...new Set(taskIds)];
  const casts = [...new Set(castIds)];
  for (const taskId of tasks) for (const castId of casts) {
    if (index.has(postingCompletionKey(castId, taskId))) completed++;
  }
  return { completed, total: tasks.length * casts.length };
}
