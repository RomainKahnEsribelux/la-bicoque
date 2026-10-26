create function public.is_verified_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users
    where id = (select auth.uid())
      and email_confirmed_at is not null
  );
$$;

revoke all on function public.is_verified_user() from public, anon;
grant execute on function public.is_verified_user() to authenticated;

create table public.family_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(btrim(slug)) between 1 and 160),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  body text not null,
  published_at timestamptz,
  source_url text,
  category text
);

create index family_articles_published_idx
  on public.family_articles (published_at desc nulls last, title);

alter table public.family_articles enable row level security;
revoke all on public.family_articles from public, anon;
grant select, insert, update, delete on public.family_articles to authenticated;

create policy family_articles_read_verified
  on public.family_articles for select to authenticated
  using ((select public.is_verified_user()));

create policy family_articles_write_owner
  on public.family_articles for all to authenticated
  using ((select public.is_verified_user()) and (select public.is_site_owner()))
  with check ((select public.is_verified_user()) and (select public.is_site_owner()));

create table public.family_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  storage_path text not null unique check (char_length(btrim(storage_path)) between 1 and 1024),
  year integer check (year is null or year between 1 and 9999),
  source_url text,
  mime_type text check (mime_type is null or mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )),
  article_id uuid references public.family_articles (id) on delete set null
);

create index family_documents_year_idx
  on public.family_documents (year desc nulls last, title);
create index family_documents_article_idx
  on public.family_documents (article_id);

alter table public.family_documents enable row level security;
revoke all on public.family_documents from public, anon;
grant select, insert, update, delete on public.family_documents to authenticated;

create policy family_documents_read_verified
  on public.family_documents for select to authenticated
  using ((select public.is_verified_user()));

create policy family_documents_write_owner
  on public.family_documents for all to authenticated
  using ((select public.is_verified_user()) and (select public.is_site_owner()))
  with check ((select public.is_verified_user()) and (select public.is_site_owner()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-archives', 'family-archives', false, 52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy family_archives_read_verified
  on storage.objects for select to authenticated
  using (
    bucket_id = 'family-archives'
    and (select public.is_verified_user())
  );

create policy family_archives_insert_owner
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'family-archives'
    and (select public.is_verified_user())
    and (select public.is_site_owner())
  );

create policy family_archives_update_owner
  on storage.objects for update to authenticated
  using (
    bucket_id = 'family-archives'
    and (select public.is_verified_user())
    and (select public.is_site_owner())
  )
  with check (
    bucket_id = 'family-archives'
    and (select public.is_verified_user())
    and (select public.is_site_owner())
  );

create policy family_archives_delete_owner
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'family-archives'
    and (select public.is_verified_user())
    and (select public.is_site_owner())
  );
