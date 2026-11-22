select cron.schedule('pr-news-expire', '* * * * *', $job$
  update public.hp_articles as article
  set is_published = false
  from public.pr_desk_history as history
  where article.id = history.article_id
    and article.store_id = history.store_id
    and history.kind in ('news', 'news_attendance', 'news_intro', 'news_coupon')
    and article.is_published
    and history.created_at <= now() - interval '24 hours';
$job$);
