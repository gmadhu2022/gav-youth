-- ============================================================
--  GAV YOUTH — Supabase schema
--  Paste this whole file into Supabase → SQL Editor → Run.
--  Safe to re-run (drops are guarded).
-- ============================================================

-- ---------- Tables ----------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  name           text,
  username       text unique,
  avatar_url     text,
  bio            text,
  status_message text default 'Hey there! I am on GAV YOUTH.',
  last_seen      timestamptz default now(),
  created_at     timestamptz default now()
);

create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id         uuid references public.profiles(id)      on delete cascade,
  last_read_at    timestamptz default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_id       uuid references public.profiles(id)      on delete cascade,
  content         text not null,
  read_at         timestamptz,
  created_at      timestamptz default now()
);

create index if not exists idx_messages_conv on public.messages(conversation_id, created_at);
create index if not exists idx_parts_user    on public.conversation_participants(user_id);

-- ---------- Membership helper (SECURITY DEFINER avoids RLS recursion) ----------
create or replace function public.is_participant(conv uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = conv and user_id = uid
  );
$$;

-- ---------- Row Level Security ----------
alter table public.profiles                  enable row level security;
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;

-- profiles: anyone signed in can browse; you edit only your own
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (auth.uid() = id);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (auth.uid() = id);

-- conversations: only members can read
drop policy if exists conv_select on public.conversations;
create policy conv_select on public.conversations for select to authenticated
  using (public.is_participant(id, auth.uid()));

-- participants: only members of that conversation can read the rows
drop policy if exists part_select on public.conversation_participants;
create policy part_select on public.conversation_participants for select to authenticated
  using (public.is_participant(conversation_id, auth.uid()));
drop policy if exists part_update on public.conversation_participants;
create policy part_update on public.conversation_participants for update to authenticated
  using (user_id = auth.uid());

-- messages: read/send only inside your conversations
drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages for select to authenticated
  using (public.is_participant(conversation_id, auth.uid()));
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_participant(conversation_id, auth.uid()));
drop policy if exists msg_update on public.messages;
create policy msg_update on public.messages for update to authenticated
  using (public.is_participant(conversation_id, auth.uid()));

-- ---------- Auto-create a profile on signup ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'username',
             split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 4))
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Find or create a 1:1 conversation ----------
create or replace function public.get_or_create_direct_conversation(other_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare conv uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if other_user = me then raise exception 'cannot chat with yourself'; end if;

  select c.id into conv
  from conversations c
  join conversation_participants p1 on p1.conversation_id = c.id and p1.user_id = me
  join conversation_participants p2 on p2.conversation_id = c.id and p2.user_id = other_user
  where (select count(*) from conversation_participants p where p.conversation_id = c.id) = 2
  limit 1;

  if conv is not null then return conv; end if;

  insert into conversations (created_by) values (me) returning id into conv;
  insert into conversation_participants (conversation_id, user_id)
  values (conv, me), (conv, other_user);
  return conv;
end; $$;

-- ---------- List my conversations (for the Chats screen) ----------
create or replace function public.get_my_conversations()
returns table (
  conversation_id uuid,
  other_id        uuid,
  other_name      text,
  other_username  text,
  other_avatar    text,
  last_message    text,
  last_sender_id  uuid,
  last_message_at timestamptz,
  unread_count    bigint
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select conversation_id, last_read_at
    from conversation_participants
    where user_id = auth.uid()
  )
  select
    c.id,
    op.id, op.name, op.username, op.avatar_url,
    lm.content, lm.sender_id, lm.created_at,
    (select count(*) from messages m2
       where m2.conversation_id = c.id
         and m2.sender_id <> auth.uid()
         and m2.created_at > mine.last_read_at)
  from mine
  join conversations c on c.id = mine.conversation_id
  join conversation_participants opart
       on opart.conversation_id = c.id and opart.user_id <> auth.uid()
  join profiles op on op.id = opart.user_id
  left join lateral (
    select content, sender_id, created_at
    from messages m
    where m.conversation_id = c.id
    order by created_at desc limit 1
  ) lm on true
  order by lm.created_at desc nulls last;
$$;

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversation_participants;
