-- ============================================================
--  GAV YOUTH — Migration 02: media messages (images, files, voice)
--  Run AFTER schema.sql, in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

-- ---------- messages: carry attachments ----------
alter table public.messages
  add column if not exists type            text not null default 'text',   -- text | image | file | audio
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_mime text,
  add column if not exists duration_ms     integer;

-- media messages may have no text body
alter table public.messages alter column content drop not null;

-- ---------- private storage bucket for attachments ----------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Files are stored under  {conversation_id}/{uuid}-{filename}
-- so the first path segment is the conversation id. Access is granted
-- only to participants of that conversation, reusing is_participant().
drop policy if exists att_read on storage.objects;
create policy att_read on storage.objects for select to authenticated
using (
  bucket_id = 'attachments'
  and public.is_participant( ((storage.foldername(name))[1])::uuid, auth.uid() )
);

drop policy if exists att_upload on storage.objects;
create policy att_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and public.is_participant( ((storage.foldername(name))[1])::uuid, auth.uid() )
);

drop policy if exists att_delete on storage.objects;
create policy att_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'attachments'
  and owner = auth.uid()
);
