-- 魚魚出去玩：資料庫初始化
-- 正式環境用法：Supabase 後台 → SQL Editor → 貼上整份 → Run（可重複執行）
-- 執行後再跑一次：insert into public.admins (email) values ('魚魚的email') on conflict do nothing;

-- ─────────────────────────────────────────────
-- 1. 管理員名單
-- ─────────────────────────────────────────────
create table if not exists public.admins (
  email text primary key check (email = lower(email))
);
alter table public.admins enable row level security;
-- 不建立任何 policy：訪客與一般登入者都讀不到、也改不了名單
revoke all on public.admins from anon, authenticated;

-- 目前登入者是否為管理員：
-- 必須同時符合「email 在名單內」與「email 已驗證」，避免有人搶先用魚魚的 email 註冊
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.admins a on a.email = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ─────────────────────────────────────────────
-- 2. 文章
-- ─────────────────────────────────────────────
-- 照片物件格式：{ "path": "...", "url": "...", "thumb": "...", "w": 2000, "h": 1333, "caption": "..." }
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  title         text not null default '' check (char_length(title) <= 120),
  excerpt       text not null default '' check (char_length(excerpt) <= 300),
  body          text not null default '' check (char_length(body) <= 50000),
  category      text not null default 'travel'
                check (category in ('food', 'travel', 'stay', 'life')),
  country_code  text check (country_code ~ '^[A-Z]{2}$'),
  city          text check (char_length(city) <= 60),
  place         text check (char_length(place) <= 120),
  visited_on    date,
  cover         jsonb check (cover is null or jsonb_typeof(cover) = 'object'),
  photos        jsonb not null default '[]' check (jsonb_typeof(photos) = 'array'),
  -- 選填資訊：restaurant / cost / itinerary / transport
  details       jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  published_at  timestamptz,
  featured      boolean not null default false,
  likes         integer not null default 0 check (likes >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 發布時一定要有標題和封面
  constraint posts_publishable check (
    status = 'draft' or (char_length(btrim(title)) > 0 and cover is not null)
  )
);

create index if not exists posts_public_idx on public.posts (status, published_at desc);
create index if not exists posts_category_idx on public.posts (category);
create index if not exists posts_country_idx on public.posts (country_code);

-- 自動維護 updated_at 與第一次發布時間；likes 只能透過 like_post() 變動
create or replace function public.posts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and current_setting('yuyu.liking', true) = 'on' then
    return new;                         -- like_post() 只動 likes
  end if;
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  if tg_op = 'UPDATE' then
    new.likes := old.likes;
  else
    new.likes := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_before_write on public.posts;
create trigger posts_before_write
  before insert or update on public.posts
  for each row execute function public.posts_before_write();

-- 同時只保留一篇精選
create or replace function public.posts_single_featured()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.posts set featured = false
   where featured and id <> new.id;
  return null;
end;
$$;

drop trigger if exists posts_single_featured on public.posts;
create trigger posts_single_featured
  after insert or update of featured on public.posts
  for each row when (new.featured)
  execute function public.posts_single_featured();

alter table public.posts enable row level security;

drop policy if exists "read published or admin" on public.posts;
create policy "read published or admin" on public.posts
  for select using (status = 'published' or public.is_admin());

drop policy if exists "admin insert" on public.posts;
create policy "admin insert" on public.posts
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admin update" on public.posts;
create policy "admin update" on public.posts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin delete" on public.posts;
create policy "admin delete" on public.posts
  for delete to authenticated using (public.is_admin());

revoke all on public.posts from anon, authenticated;
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

-- 訪客按「喜歡」：只能對已發布文章 +1 / -1，不能改其他欄位
create or replace function public.like_post(pid uuid, delta integer default 1)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare n integer;
begin
  if delta not in (1, -1) then
    raise exception 'delta must be 1 or -1';
  end if;
  perform set_config('yuyu.liking', 'on', true);
  update public.posts
     set likes = greatest(likes + delta, 0)
   where id = pid and status = 'published'
  returning likes into n;
  perform set_config('yuyu.liking', 'off', true);
  return n;
end;
$$;
revoke all on function public.like_post(uuid, integer) from public;
grant execute on function public.like_post(uuid, integer) to anon, authenticated;

-- ─────────────────────────────────────────────
-- 3. 個人資料與網站內容（只有一筆）
-- ─────────────────────────────────────────────
create table if not exists public.profile (
  id            smallint primary key default 1 check (id = 1),
  nickname      text not null default '魚魚' check (char_length(nickname) <= 20),
  full_name     text not null default '榆芳' check (char_length(full_name) <= 20),
  tagline       text not null default '吃美食、看風景，收集世界的溫柔。' check (char_length(tagline) <= 60),
  hero_note     text not null default '下一站，會是更遠的地方。' check (char_length(hero_note) <= 40),
  hero_image    jsonb,
  avatar        jsonb,
  intro         text not null default '大家好，我是魚魚！一個愛吃、愛玩、愛拍照的女生，夢想是環遊世界，用自己的雙腳走過每一個想去的地方。' check (char_length(intro) <= 300),
  bio           text not null default '' check (char_length(bio) <= 4000),
  philosophy    text not null default '' check (char_length(philosophy) <= 1000),
  favorites     jsonb not null default '[]' check (jsonb_typeof(favorites) = 'array'),
  socials       jsonb not null default '{}' check (jsonb_typeof(socials) = 'object'),
  -- 想去的地方：[{ "country_code": "IS", "city": "雷克雅維克", "note": "看極光" }]
  wishlist      jsonb not null default '[]' check (jsonb_typeof(wishlist) = 'array'),
  updated_at    timestamptz not null default now()
);
insert into public.profile (id) values (1) on conflict do nothing;

alter table public.profile enable row level security;

drop policy if exists "anyone reads profile" on public.profile;
create policy "anyone reads profile" on public.profile
  for select using (true);

drop policy if exists "admin updates profile" on public.profile;
create policy "admin updates profile" on public.profile
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.profile from anon, authenticated;
grant select on public.profile to anon, authenticated;
grant update on public.profile to authenticated;

-- ─────────────────────────────────────────────
-- 4. 照片儲存空間
-- ─────────────────────────────────────────────
-- 公開讀取（網站要顯示），單檔上限 10 MB，只接受圖片
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin reads photos" on storage.objects;
create policy "admin reads photos" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and public.is_admin());

drop policy if exists "admin uploads photos" on storage.objects;
create policy "admin uploads photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and public.is_admin());

drop policy if exists "admin updates photos" on storage.objects;
create policy "admin updates photos" on storage.objects
  for update to authenticated using (bucket_id = 'photos' and public.is_admin());

drop policy if exists "admin deletes photos" on storage.objects;
create policy "admin deletes photos" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and public.is_admin());
