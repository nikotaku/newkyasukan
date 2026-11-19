-- Inventory preparation only: do not enable reservations or invent an address.
INSERT INTO public.rooms (name, store_id, is_active, internal_notes)
SELECT '朧月', s.id, false, '706号室。備品準備中。住所・入室案内は未登録。'
FROM public.stores s WHERE s.slug = 'tsuyaka'
AND NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.store_id = s.id AND r.name = '朧月');

INSERT INTO public.room_supplies
  (room_id, store_id, name, quantity, unit, category, notes, stock_level,
   quantity_confirmed, storage_location, storage_code)
SELECT target.id, target.store_id, source.name, 0, source.unit, source.category,
       source.notes, 'なし', true, source.storage_location, source.storage_code
FROM public.rooms target
JOIN public.stores s ON s.id = target.store_id AND s.slug = 'tsuyaka'
CROSS JOIN LATERAL (
  SELECT DISTINCT ON (i.name) i.* FROM public.room_supplies i
  JOIN public.rooms origin ON origin.id = i.room_id AND origin.store_id = target.store_id
  WHERE origin.name IN ('華月', '艶月')
  ORDER BY i.name, (origin.name = '華月') DESC, i.created_at, i.id
) source
WHERE target.name = '朧月'
AND NOT EXISTS (SELECT 1 FROM public.room_supplies existing WHERE existing.room_id = target.id AND existing.name = source.name);

-- The owner explicitly requested all Oborozuki supply quantities to be zero.
UPDATE public.room_supplies i SET quantity = 0, quantity_confirmed = true,
  stock_level = 'なし', updated_at = now()
FROM public.rooms r JOIN public.stores s ON s.id = r.store_id
WHERE i.room_id = r.id AND r.name = '朧月' AND s.slug = 'tsuyaka';

INSERT INTO public.facility_equipment (store_id, item_type, name, quantity, unit, custom_fields)
SELECT r.store_id, 'furniture', v.name, 0, v.unit, jsonb_build_object('__room_id',r.id::text)
FROM public.rooms r JOIN public.stores s ON s.id = r.store_id
CROSS JOIN (VALUES ('置き時計','個'), ('観葉植物','鉢'), ('乾燥機','台'), ('洗濯機','台')) v(name,unit)
WHERE r.name = '朧月' AND s.slug = 'tsuyaka'
AND NOT EXISTS (SELECT 1 FROM public.facility_equipment e
                WHERE e.store_id = r.store_id AND e.custom_fields->>'__room_id' = r.id::text AND e.item_type = 'furniture' AND e.name = v.name);
