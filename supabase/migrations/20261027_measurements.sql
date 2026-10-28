-- 可扩展的记录项目：血糖、体重、体温、血氧、家属/医生自己加的项目，以及"哪里不舒服"
-- 每量一次存一行，加新项目不需要改表。血压、睡眠、心情仍然存在 daily_checkins 里。
-- 在 Supabase 后台 SQL Editor 里运行一次。

create table if not exists public.measurements (
  measurement_id   text primary key,
  patient_id       text not null references public.patients (patient_id),
  record_date      date not null,
  item_key         text not null,          -- 例如 glucose、weight、custom-xxxx、symptoms
  item_label       text not null,          -- 记录时的项目名，例如 血糖
  value_num        numeric,                -- 数字类项目的读数
  value_text       text,                   -- 补充说明，例如 空腹；"不舒服"存症状
  unit             text,
  recorded_by_type text not null default 'self',
  created_at       timestamptz not null default now(),
  is_synthetic     boolean not null default true
);

create index if not exists measurements_patient_date on public.measurements (patient_id, record_date desc);

-- 课堂演示配置：和另外三张表一样，匿名可读写，只能放模拟资料
alter table public.measurements enable row level security;
create policy "classroom demo read" on public.measurements for select to anon using (true);
create policy "classroom demo insert" on public.measurements for insert to anon with check (true);
create policy "classroom demo update" on public.measurements for update to anon using (true) with check (true);
create policy "classroom demo delete" on public.measurements for delete to anon using (true);
