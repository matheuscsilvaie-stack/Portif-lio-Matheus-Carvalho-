-- Urbanix · esquema do banco no Supabase
-- Cole este arquivo inteiro em: Supabase → SQL Editor → New query → Run.
-- Pode ser executado mais de uma vez sem perder dados.

-- ============================================================
-- 1. Perfis (um por conta do Supabase Auth)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  usuario text not null,
  papel text not null default 'usuario' check (papel in ('admin', 'usuario')),
  criado_em timestamptz not null default now(),
  constraint usuario_formato check (usuario ~ '^[A-Za-z0-9_.]{3,32}$')
);
create unique index if not exists profiles_usuario_unico on public.profiles (lower(usuario));

-- Cria o perfil automaticamente quando alguém se cadastra.
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nome text := coalesce(nullif(new.raw_user_meta_data ->> 'usuario', ''), split_part(new.email, '@', 1));
begin
  nome := left(regexp_replace(nome, '[^A-Za-z0-9_.]', '', 'g'), 32);
  if length(nome) < 3 then nome := 'user' || substr(new.id::text, 1, 6); end if;
  if exists (select 1 from public.profiles where lower(usuario) = lower(nome)) then
    nome := left(nome, 25) || '_' || substr(new.id::text, 1, 6);
  end if;
  insert into public.profiles (id, usuario) values (new.id, nome);
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- Verifica se um nome de usuário está livre (usado na tela de cadastro).
create or replace function public.usuario_disponivel(nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(usuario) = lower(nome));
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and papel = 'admin');
$$;

-- ============================================================
-- 2. Relatos
-- ============================================================
create table if not exists public.occurrences (
  id bigint generated always as identity primary key,
  titulo text not null check (char_length(titulo) between 4 and 100),
  categoria text not null check (categoria in ('infraestrutura', 'acessibilidade', 'iluminacao', 'residuos', 'outros')),
  bairro text not null check (char_length(bairro) between 2 and 60),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  gravidade smallint not null check (gravidade between 1 and 5),
  latitude double precision not null check (latitude between -24.2 and -23.7),
  longitude double precision not null check (longitude between -46.6 and -46.0),
  confirmacoes integer not null default 0 check (confirmacoes >= 0),
  status text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'resolvido')),
  foto_path text,
  demo boolean not null default false,
  usuario_id uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists occurrences_criado_em on public.occurrences (criado_em desc);

-- Limite anti-spam: no máximo 10 relatos por conta a cada 24 horas.
create or replace function public.limitar_relatos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.occurrences
      where usuario_id = new.usuario_id and criado_em > now() - interval '24 hours') >= 10 then
    raise exception 'Limite de 10 relatos por dia atingido. Tente novamente amanhã.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists limite_relatos on public.occurrences;
create trigger limite_relatos before insert on public.occurrences
  for each row execute function public.limitar_relatos();

create or replace function public.marcar_atualizacao()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists atualizado_em on public.occurrences;
create trigger atualizado_em before update on public.occurrences
  for each row execute function public.marcar_atualizacao();

-- ============================================================
-- 3. Confirmações (uma por conta em cada relato)
-- ============================================================
create table if not exists public.confirmations (
  occurrence_id bigint not null references public.occurrences (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (occurrence_id, user_id)
);

create or replace function public.contar_confirmacoes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.occurrences
     set confirmacoes = (select count(*) from public.confirmations
                         where occurrence_id = coalesce(new.occurrence_id, old.occurrence_id))
   where id = coalesce(new.occurrence_id, old.occurrence_id);
  return null;
end $$;

drop trigger if exists recontar_confirmacoes on public.confirmations;
create trigger recontar_confirmacoes after insert or delete on public.confirmations
  for each row execute function public.contar_confirmacoes();

-- ============================================================
-- 4. Segurança (Row Level Security)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.occurrences enable row level security;
alter table public.confirmations enable row level security;

drop policy if exists "perfis visíveis" on public.profiles;
create policy "perfis visíveis" on public.profiles for select using (true);
-- Sem política de update: ninguém promove a si mesmo a admin pelo app.

drop policy if exists "relatos públicos" on public.occurrences;
create policy "relatos públicos" on public.occurrences for select using (true);

drop policy if exists "conta cria relato" on public.occurrences;
create policy "conta cria relato" on public.occurrences for insert to authenticated
  with check (usuario_id = auth.uid() and confirmacoes = 0 and status = 'aberto' and demo = false);

drop policy if exists "admin modera relato" on public.occurrences;
create policy "admin modera relato" on public.occurrences for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "autor ou admin exclui" on public.occurrences;
create policy "autor ou admin exclui" on public.occurrences for delete to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "vê as próprias confirmações" on public.confirmations;
create policy "vê as próprias confirmações" on public.confirmations for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "confirma relato de outra pessoa" on public.confirmations;
create policy "confirma relato de outra pessoa" on public.confirmations for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (select 1 from public.occurrences o where o.id = occurrence_id and o.usuario_id = auth.uid())
  );

-- ============================================================
-- 5. Fotos (Supabase Storage)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists "envia foto na própria pasta" on storage.objects;
create policy "envia foto na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "autor ou admin apaga foto" on storage.objects;
create policy "autor ou admin apaga foto" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ============================================================
-- 6. Atualização em tempo real do mapa
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'occurrences') then
    alter publication supabase_realtime add table public.occurrences;
  end if;
end $$;

-- ============================================================
-- 7. Amostra fictícia (opcional, aparece marcada como "Amostra fictícia")
--    Apague depois com: delete from public.occurrences where demo;
-- ============================================================
insert into public.occurrences (titulo, categoria, bairro, descricao, gravidade, latitude, longitude, demo, usuario_id, criado_em)
select * from (values
  ('Calçada danificada perto da praça', 'acessibilidade', 'Gonzaga', 'Trecho irregular dificulta a passagem de pedestres e cadeirantes.', 4, -23.9680, -46.3341, true, null::uuid, now() - interval '2 days'),
  ('Bueiro obstruído na Rua Amador Bueno', 'infraestrutura', 'Centro', 'A grelha parece estar coberta por folhas e resíduos.', 3, -23.9369, -46.3291, true, null::uuid, now() - interval '5 days'),
  ('Poste apagado na rua', 'iluminacao', 'Boqueirão', 'Ponto de iluminação sem funcionar à noite.', 3, -23.9654, -46.3212, true, null::uuid, now() - interval '8 days'),
  ('Descarte irregular de entulho', 'residuos', 'Embaré', 'Material descartado na calçada próximo à esquina.', 2, -23.9745, -46.3150, true, null::uuid, now() - interval '12 days'),
  ('Faixa de pedestres com pintura apagada', 'infraestrutura', 'Vila Nova', 'A sinalização está pouco visível para quem atravessa.', 2, -23.9370, -46.3176, true, null::uuid, now() - interval '19 days')
) as amostra
where not exists (select 1 from public.occurrences where demo);
