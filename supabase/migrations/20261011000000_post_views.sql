-- 文章閱讀人數
-- 正式環境用法：Supabase 後台 → SQL Editor → 貼上整份 → Run（可重複執行，不會影響既有資料）

alter table public.posts
  add column if not exists views integer not null default 0 check (views >= 0);

-- 更新 trigger：views 與 likes 一樣，只能透過專用函式變動
-- （管理員編輯文章時不能改數字，新增文章一律從 0 開始）
create or replace function public.posts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and current_setting('yuyu.liking', true) = 'on' then
    return new;                         -- like_post() / view_post() 只動計數欄位
  end if;
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  if tg_op = 'UPDATE' then
    new.likes := old.likes;
    new.views := old.views;
  else
    new.likes := 0;
    new.views := 0;
  end if;
  return new;
end;
$$;

-- 訪客打開已發布文章時 +1，回傳最新人數；草稿與不存在的文章回傳 null
create or replace function public.view_post(pid uuid)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare n integer;
begin
  perform set_config('yuyu.liking', 'on', true);
  update public.posts
     set views = views + 1
   where id = pid and status = 'published'
  returning views into n;
  perform set_config('yuyu.liking', 'off', true);
  return n;
end;
$$;
revoke all on function public.view_post(uuid) from public;
grant execute on function public.view_post(uuid) to anon, authenticated;
