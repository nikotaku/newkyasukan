-- HP > トップバナー管理では、所属店舗の stores.settings に
-- hero_banners / hero_video を保存する。ユーザーは自分の所属店舗だけを更新できる。
DROP POLICY IF EXISTS "stores_update_by_membership" ON public.stores;

CREATE POLICY "stores_update_by_membership"
ON public.stores
FOR UPDATE
TO authenticated
USING (id IN (SELECT public.current_store_ids()))
WITH CHECK (id IN (SELECT public.current_store_ids()));
