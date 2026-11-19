-- NULL identifies older articles whose HP exposure was inferred from the text.
alter table public.hp_articles add column news_cast_ids uuid[];
alter table public.promotion_exposures add column news_article_id uuid;
-- Keep the publication history even after an article is hidden or deleted.
create unique index promotion_exposures_news_once
  on public.promotion_exposures (news_article_id, cast_id, channel_key);

create function public.record_news_cast_exposures() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(cardinality(new.news_cast_ids), 0) = 0 then return new; end if;
  if exists (
    select 1 from unnest(new.news_cast_ids) selected(id)
    where not exists (select from public.casts c where c.id = selected.id and c.store_id = new.store_id)
  ) then raise exception 'Selected therapist does not belong to the article store'; end if;

  insert into public.promotion_exposures
    (store_id, cast_id, news_article_id, channel_key, exposed_on, note, url)
  select new.store_id, selected.id, new.id, media.channel,
         (media.published_at at time zone 'Asia/Tokyo')::date, left(new.title, 500),
         case when length(media.url) <= 1000 then media.url end
    from unnest(new.news_cast_ids) selected(id)
    cross join (values
      ('hp_news', new.is_published, now(), null::text),
      ('estama_news', new.estama_status = 'posted', coalesce(new.estama_posted_at, now()), new.estama_news_url),
      ('o2_post', new.o2_status = 'posted', coalesce(new.o2_posted_at, now()), new.o2_post_url)
    ) media(channel, completed, published_at, url)
    where media.completed
    on conflict (news_article_id, cast_id, channel_key) do nothing;
  return new;
end
$$;
create trigger record_news_cast_exposures
after insert or update of is_published, estama_status, o2_status, news_cast_ids
on public.hp_articles for each row execute function public.record_news_cast_exposures();
