create extension if not exists pgcrypto;

create table if not exists public.site_comments (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  rating integer not null,
  comment_text text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint site_comments_rating_range check (rating between 1 and 5),
  constraint site_comments_status check (status in ('pending', 'approved', 'rejected')),
  constraint site_comments_display_name_length check (char_length(display_name) between 1 and 80),
  constraint site_comments_comment_text_length check (char_length(comment_text) between 3 and 1000)
);

create index if not exists site_comments_status_created_at_idx
on public.site_comments (status, created_at desc);

alter table public.site_comments enable row level security;
