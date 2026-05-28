-- 公開ページの編集可能な文言（キー・バリュー）
create table if not exists public.site_content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

create policy "site_content public read"
on public.site_content for select
using (true);

create policy "site_content auth write"
on public.site_content for all
using (auth.uid() is not null)
with check (auth.uid() is not null);

-- 料金システムページの初期文言
insert into public.site_content (key, value) values
  ('system_title', '料金システム'),
  ('system_intro', ''),
  ('system_flow_title', 'ご利用方法'),
  ('system_flow_text', '「当店ご利用方法」
「ご予約方法」
お電話/WEBにてご予約をお取りになります。

「お部屋」
近郊ホテル/出張専門
お部屋のご用意/ご移動がない場合はご自宅にも出張が可能です。'),
  ('system_notice_title', '注意事項'),
  ('system_notice_text', '【ご利用規則】
仙台リラクゼーションサロン【全力エステ】（以下「当店」といいます。）を、ご利用いただく際には、本利用規約に同意されたものとみなします。
※コース内にシャワーのお時間は含まれますのでご了承ください。
※18歳未満の方、スカウト目的の方、同業者、暴力団関係者、泥酔者、薬物使用者、その他当店が相応しくないと判断した方の、お問い合わせ及びご利用は固くお断り致します。
※当店は、番号非通知及び公衆電話からの受付は致しかねます。
※当店は、リラクゼーションを目的とした施術を提供するプライベートサロンであり、医療行為、治療行為、風俗的なサービス等は一切行なっておりません。
※セラピストの引き抜き行為やスカウト行為が発覚した場合は、例外なく損害賠償請求、法的措置等も視野にいれた然るべき対応をとらせていただきます。
※セラピストとの個人的な連絡先交換や店外へのお誘いは堅くお断り致します。
※盗撮や盗聴等の行為があった際は、所轄警察署に被害届を提出し、法的手続きをとらせていただきます。

【対応言語について】
日本語のみ対応しております。')
on conflict (key) do nothing;
