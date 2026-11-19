-- Add inventory and storage metadata without changing existing quantities or notes.
ALTER TABLE public.room_supplies
  ADD COLUMN IF NOT EXISTS stock_level text CHECK (stock_level IN ('多い', '普通', '少ない', 'なし')),
  ADD COLUMN IF NOT EXISTS quantity_confirmed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS storage_location text,
  ADD COLUMN IF NOT EXISTS storage_code text;

-- Seed only the named Enka rooms. Existing inventory entries are preserved.
INSERT INTO public.room_supplies
  (room_id,store_id,name,quantity,unit,stock_level,quantity_confirmed,storage_location,storage_code,notes)
SELECT r.id,r.store_id,v.name,0,v.unit,'普通',false,v.location,v.code,v.notes
FROM public.rooms r
JOIN public.stores s ON s.id=r.store_id
CROSS JOIN (VALUES
  ('ゴミ袋（緑）','枚','キッチン周り・シンク下','K01',NULL::text),
  ('ゴミ袋（赤）','枚','キッチン周り・シンク下','K01',NULL),
  ('ゴミ袋（黒）','枚','キッチン周り・シンク下','K01',NULL),
  ('キッチンペーパー','個','キッチン周り・シンク下','K02',NULL),
  ('ティッシュ','箱','キッチン周り・シンク下','K02',NULL),
  ('ボディソープ詰め替え','袋','キッチン周り・シンク下','K03',NULL),
  ('ハンドソープ詰め替え','袋','キッチン周り・シンク下','K03',NULL),
  ('ジェルゴール（品名確認待ち）','個','キッチン周り・シンク下','K03','音声での品名。正式名称は未確認'),
  ('フローリングペーパー','枚','キッチン周り・シンク下','K04',NULL),
  ('コロコロ','個','キッチン周り・シンク下','K04',NULL),
  ('紙パンツ','枚','キッチン周り・シンク下','K03',NULL),
  ('スポンジ','個','キッチン周り・シンク下','K04',NULL),
  ('極液','本','キッチン周り・シンク下','K05',NULL),
  ('マウスウォッシュ','本','キッチン周り・シンク下','K03',NULL),
  ('水','本','キッチン周り','K06',NULL),
  ('キッチン用ネット','枚','キッチン周り・シンク下','K04',NULL),
  ('トイレクイックル','枚','トイレ','T01',NULL),
  ('カビキラー','本','キッチン周り・シンク下','K04',NULL),
  ('スクラビングバブル','個','キッチン周り・シンク下','K04',NULL)
) AS v(name,unit,location,code,notes)
WHERE s.slug='tsuyaka' AND r.name IN ('華月','艶月','朧月')
AND NOT EXISTS (SELECT 1 FROM public.room_supplies existing WHERE existing.room_id=r.id AND existing.name=v.name);
