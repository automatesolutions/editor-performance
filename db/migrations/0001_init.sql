-- Editor Performance Report — initial schema.
--
-- Money is stored as integer cents everywhere. ROAS is never stored
-- pre-rounded and re-aggregated: spec section 3 requires every ratio to be
-- SUM(revenue) / SUM(spend) over the ads in scope.

-- ---------------------------------------------------------------------------
-- Config (spec section 1: "targets and the spend floor live in this table,
-- not in code")
-- ---------------------------------------------------------------------------

create table if not exists accounts (
  id                    integer primary key,
  name                  text        not null,
  slug                  text        not null unique,

  -- NULL means "to confirm". There is deliberately NO DEFAULT: spec section 1
  -- says never fall back to a default, because a borrowed target produces
  -- checkmarks nobody agreed to. A NOT NULL DEFAULT here would let that bug in
  -- silently, so the nullability is doing real work.
  target_roas           numeric(6,3),

  spend_floor_cents     bigint      not null default 100000,   -- $1,000
  unassigned_alert_pct  numeric(5,2) not null default 20.00,   -- section 8: shout above 20%

  -- IANA zone, synced from Meta rather than hand-maintained: if someone
  -- changes it in Ads Manager, hand-kept boundaries would shift silently.
  timezone              text        not null,

  pipes_project         text        not null,
  display_order         integer     not null,
  is_active             boolean     not null default true,
  created_at            timestamptz not null default now()
);

-- One reporting account may span several Meta ad accounts (X-ALL MPC spans
-- two). Modelling this as rows rather than a special case is what makes
-- "sum across both before calculating any ratio" fall out of the data model.
create table if not exists meta_ad_accounts (
  meta_account_id text    primary key,
  account_id      integer not null references accounts(id) on delete cascade,
  -- Which ad account id the Ads Manager links point at.
  is_primary      boolean not null default false
);

create index if not exists meta_ad_accounts_account_idx on meta_ad_accounts (account_id);

create table if not exists editor_tokens (
  token     text    primary key,
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Raw facts, at ad level, one row per ad per day.
--
-- Daily grain (rather than storing per-window totals) is load-bearing: any
-- window can be recomputed without re-fetching, and the spec's "$600/week
-- accumulates past $1,000 and appears in its second week" behaviour needs no
-- state machine, because 30-day spend is re-summed from days on every run.
-- ---------------------------------------------------------------------------

create table if not exists meta_ad_daily (
  meta_account_id                 text   not null,
  meta_ad_id                      text   not null,
  -- Date in the AD ACCOUNT's reporting timezone, not UTC and not server time.
  date_local                      date   not null,
  ad_name                         text   not null,
  spend_cents                     bigint not null,
  purchase_conversion_value_cents bigint not null default 0,
  pulled_at                       timestamptz not null default now(),
  primary key (meta_account_id, meta_ad_id, date_local)
);

create index if not exists meta_ad_daily_window_idx
  on meta_ad_daily (meta_account_id, date_local);

-- First date an ad actually DELIVERED (spend > 0), which is not the same as
-- when it was created. Drives the new-vs-holdover split, so it is derived
-- from accumulated delivery history rather than from a created_time field.
create table if not exists meta_ad_first_delivery (
  meta_account_id     text not null,
  meta_ad_id          text not null,
  first_delivery_date date not null,
  primary key (meta_account_id, meta_ad_id)
);

create table if not exists pipes_ad_daily (
  pipes_project  text   not null,
  -- Exactly one join key is expected per row; both are nullable because which
  -- one Pipes provides is what the Phase 0 spike establishes.
  meta_ad_id     text,
  utm_content    text,
  date_local     date   not null,
  revenue_cents  bigint not null,
  orders         integer not null default 0,
  pulled_at      timestamptz not null default now(),
  join_key       text generated always as (coalesce(meta_ad_id, utm_content, '')) stored,
  primary key (pipes_project, join_key, date_local)
);

create index if not exists pipes_ad_daily_window_idx
  on pipes_ad_daily (pipes_project, date_local);

-- ---------------------------------------------------------------------------
-- Snapshots — what the page reads.
--
-- Each run inserts a NEW snapshot and writes all children against its id.
-- Readers only ever select a snapshot in a terminal status, so a run in
-- progress is invisible and the page never renders half-written data.
-- ---------------------------------------------------------------------------

create table if not exists report_snapshots (
  id           bigserial primary key,
  -- The Sunday both windows end on.
  report_date  date        not null,
  status       text        not null check (status in ('running','complete','partial','failed')),
  pulled_at    timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists report_snapshots_readable_idx
  on report_snapshots (report_date desc, id desc)
  where status in ('complete','partial');

create table if not exists snapshot_accounts (
  snapshot_id bigint  not null references report_snapshots(id) on delete cascade,
  account_id  integer not null references accounts(id),

  -- 'no_spend' and 'failed' are deliberately distinct. Spec section 2: an
  -- account with no spend still gets a report saying so, so that a MISSING
  -- report always means a broken pull.
  status        text not null check (status in ('ok','no_spend','failed')),
  error_message text,

  week_start   date, week_end   date,
  thirty_start date, thirty_end date,

  week_spend_cents            bigint,
  week_orders                 integer,
  week_pipes_revenue_cents    bigint,
  week_meta_value_cents       bigint,
  week_unassigned_spend_cents bigint,
  week_unassigned_ad_count    integer,

  -- Spec section 4: if this is not near zero, every ROAS shown is understated.
  unjoined_revenue_pct numeric(5,2),

  primary key (snapshot_id, account_id)
);

create table if not exists snapshot_editors (
  snapshot_id  bigint  not null references report_snapshots(id) on delete cascade,
  account_id   integer not null references accounts(id),
  editor_token text    not null,

  week_spend_cents         bigint,
  week_orders              integer,
  week_pipes_revenue_cents bigint,
  week_meta_value_cents    bigint,

  thirty_spend_cents         bigint not null,
  thirty_pipes_revenue_cents bigint not null,

  -- All three NULL together when the account has no target set. NULL means
  -- "no target", which the UI must render as no dot and no count at all —
  -- distinct from 0, which means the target IS set and nothing cleared it.
  beats_target          boolean,
  winning_ads_new       integer,
  winning_ads_holdover  integer,

  -- 6 weekly pooled Pipes ROAS values, oldest first.
  trend_roas numeric(8,3)[] not null default '{}',

  primary key (snapshot_id, account_id, editor_token)
);

create table if not exists snapshot_top_ads (
  snapshot_id  bigint  not null references report_snapshots(id) on delete cascade,
  account_id   integer not null references accounts(id),
  editor_token text    not null,
  rank         smallint not null check (rank between 1 and 3),

  meta_ad_id  text   not null,
  ad_name     text   not null,
  spend_cents bigint not null,
  pipes_roas  numeric(8,3) not null,
  is_new      boolean not null,

  primary key (snapshot_id, account_id, editor_token, rank)
);
