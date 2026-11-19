-- Keep bottles and refills separate so replacement stock is visible.
INSERT INTO public.room_supplies
  (room_id,store_id,name,quantity,unit,stock_level,quantity_confirmed,storage_location,storage_code)
SELECT r.id,r.store_id,v.name,0,v.unit,'普通',false,v.location,'K03'
FROM public.rooms r JOIN public.stores s ON s.id=r.store_id
CROSS JOIN (VALUES
  ('シャンプー本体','本','キッチン周り'),
  ('リンス本体','本','キッチン周り'),
  ('シャンプー詰め替え','袋','キッチン周り・シンク下'),
  ('リンス詰め替え','袋','キッチン周り・シンク下')
) v(name,unit,location)
WHERE s.slug='tsuyaka' AND r.name IN ('華月','艶月','朧月')
AND NOT EXISTS (SELECT 1 FROM public.room_supplies i WHERE i.room_id=r.id AND i.name=v.name);
