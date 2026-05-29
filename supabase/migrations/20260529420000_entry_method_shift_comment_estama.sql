-- ナレッジ用ファイルバケットのポリシーをアプリ全体方針（permissive）に統一
DROP POLICY IF EXISTS "knowledge-files auth upload" ON storage.objects;
DROP POLICY IF EXISTS "knowledge-files auth delete" ON storage.objects;
DROP POLICY IF EXISTS "knowledge-files public read" ON storage.objects;
CREATE POLICY "knowledge-files all" ON storage.objects
  FOR ALL USING (bucket_id = 'knowledge-files') WITH CHECK (bucket_id = 'knowledge-files');

-- ルームに入室方法用の写真カラムを追加
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS entry_photos text[] DEFAULT '{}';

-- 入室方法写真用ストレージバケット
INSERT INTO storage.buckets (id, name, public) VALUES ('entry-photos', 'entry-photos', true) ON CONFLICT DO NOTHING;
CREATE POLICY "entry-photos all" ON storage.objects
  FOR ALL USING (bucket_id = 'entry-photos') WITH CHECK (bucket_id = 'entry-photos');

-- シフト承認/却下時のコメント
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS approval_comment text;

-- シフトのエスたま登録ステータス
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS estama_registered boolean NOT NULL DEFAULT false;

-- セラピスト用シフト取得RPCに承認コメントを含める
DROP FUNCTION IF EXISTS public.get_therapist_shifts(text, integer, integer);
CREATE FUNCTION public.get_therapist_shifts(p_token text, p_year integer, p_month integer)
 RETURNS TABLE(id uuid, shift_date date, start_time time without time zone, end_time time without time zone, room text, notes text, approval_status text, approval_comment text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_cast_id uuid;
  v_start   date;
  v_end     date;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  SELECT c.id INTO v_cast_id
  FROM casts c WHERE c.access_token = p_token;

  IF v_cast_id IS NULL THEN
    RAISE EXCEPTION 'cast not found';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month')::date;

  RETURN QUERY
  SELECT s.id, s.shift_date, s.start_time, s.end_time, s.room, s.notes, s.approval_status, s.approval_comment
  FROM shifts s
  WHERE s.cast_id = v_cast_id
    AND s.shift_date >= v_start
    AND s.shift_date < v_end
  ORDER BY s.shift_date, s.start_time;
END
$$;
