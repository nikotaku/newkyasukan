-- 店舗公式SNSリンク（フロントの「店舗公式SNS」ブロック用、HPタブから編集）
insert into public.site_content (key, value) values
  ('store_sns_x', 'https://twitter.com/zenryoku_esthe'),
  ('store_sns_line', 'https://lin.ee/RdRhmXw'),
  ('store_sns_o2', 'https://m-sns.net/s/@zr_sendai2'),
  ('store_sns_instagram', ''),
  ('store_sns_bluesky', 'https://bsky.app/profile/zenryoku-esthe.bsky.social')
on conflict (key) do nothing;
