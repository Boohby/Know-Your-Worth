-- Know Your Worth: progressive five-stage question system
-- Requires the existing core Know Your Worth schema and fm_is_super_admin().
-- Question answers and targets remain server-side; do not grant direct table access.

create table if not exists public.fm_question_stages (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.fm_daily_challenges(id) on delete cascade,
  category text not null check (category in ('Science','History','Geography','Technology','Culture')),
  stage_number smallint not null check (stage_number between 1 and 5),
  question_type text not null check (question_type in ('multiple_choice','open_answer','ranking','true_false','estimation')),
  difficulty text not null check (difficulty in ('Easy','Moderate','Hard','Very hard','Expert')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options)='array'),
  accepted_answers text[] not null default '{}',
  correct_option smallint,
  correct_boolean boolean,
  correct_order jsonb,
  numeric_target numeric,
  numeric_unit text,
  max_wp integer not null check (max_wp in (100,150,200,250,300)),
  explanation text not null,
  created_at timestamptz not null default now(),
  unique (challenge_id,category,stage_number),
  check (question_type<>'multiple_choice' or (jsonb_array_length(options)=4 and correct_option is not null and correct_option between 0 and 3)),
  check (question_type<>'true_false' or correct_boolean is not null),
  check (question_type<>'ranking' or (jsonb_typeof(correct_order)='array' and jsonb_array_length(options)=4)),
  check (question_type<>'estimation' or (numeric_target is not null and numeric_unit is not null))
);
create index if not exists fm_question_stages_challenge_category_idx on public.fm_question_stages(challenge_id,category,stage_number);
alter table public.fm_question_stages enable row level security;
revoke all on public.fm_question_stages from anon,authenticated;

create table if not exists public.fm_category_selections (
  challenge_id uuid not null references public.fm_daily_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check(category in ('Science','History','Geography','Technology','Culture')),
  selected_at timestamptz not null default now(),
  primary key(challenge_id,user_id,category)
);
create table if not exists public.fm_stage_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.fm_daily_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check(category in ('Science','History','Geography','Technology','Culture')),
  stage_number smallint not null check(stage_number between 1 and 5),
  answer jsonb not null,
  is_correct boolean not null,
  wp_awarded integer not null default 0 check(wp_awarded>=0),
  error_pct numeric,
  submitted_at timestamptz not null default now(),
  unique(challenge_id,user_id,category,stage_number)
);
alter table public.fm_category_selections enable row level security;
alter table public.fm_stage_attempts enable row level security;
revoke all on public.fm_category_selections,public.fm_stage_attempts from anon,authenticated;

create or replace function public.fm_get_category_rotation(p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_date date; v_have text[]; v_missing text[];
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select challenge_date into v_date from public.fm_daily_challenges where id=p_challenge_id;
 select coalesce(array_agg(distinct s.category),'{}') into v_have
 from public.fm_category_selections s join public.fm_daily_challenges c on c.id=s.challenge_id
 where s.user_id=v_user and c.challenge_date<v_date
 and c.challenge_date in (select challenge_date from public.fm_daily_challenges where status='open' and challenge_date<v_date order by challenge_date desc limit 2);
 select array_agg(x) into v_missing from unnest(array['Science','History','Geography','Technology','Culture']) x where not (x=any(coalesce(v_have,'{}')));
 if coalesce(array_length(v_missing,1),0)>3 or coalesce(array_length(v_have,1),0)=0 then v_missing:='{}'; end if;
 return jsonb_build_object('played_recently',to_jsonb(coalesce(v_have,'{}')),'required_categories',to_jsonb(coalesce(v_missing,'{}')));
end $$;
grant execute on function public.fm_get_category_rotation(uuid) to authenticated;

create or replace function public.fm_get_my_category_selection(p_challenge_id uuid)
returns text[] language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_result text[];
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select coalesce(array_agg(category order by category),'{}') into v_result from public.fm_category_selections where challenge_id=p_challenge_id and user_id=v_user;
 return v_result;
end $$;
grant execute on function public.fm_get_my_category_selection(uuid) to authenticated;

create or replace function public.fm_select_daily_categories(p_challenge_id uuid,p_categories text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_date date; v_have text[]; v_missing text[];
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if coalesce(array_length(p_categories,1),0)<>3 or (select count(distinct x) from unnest(p_categories) x)<>3 then raise exception 'Select exactly three different categories'; end if;
 if exists(select 1 from unnest(p_categories) x where x not in ('Science','History','Geography','Technology','Culture')) then raise exception 'Invalid category'; end if;
 select challenge_date into v_date from public.fm_daily_challenges where id=p_challenge_id and (public.fm_is_super_admin() or (status='open' and now()>=starts_at and now()<ends_at));
 if not found then raise exception 'Market is closed'; end if;
 if not exists(select 1 from public.fm_portfolios where challenge_id=p_challenge_id and user_id=v_user) then raise exception 'Lock your portfolio first'; end if;
 if exists(select 1 from public.fm_category_selections where challenge_id=p_challenge_id and user_id=v_user) then raise exception 'Daily categories are already locked'; end if;
 select coalesce(array_agg(distinct s.category),'{}') into v_have from public.fm_category_selections s join public.fm_daily_challenges c on c.id=s.challenge_id
 where s.user_id=v_user and c.challenge_date<v_date and c.challenge_date in (select challenge_date from public.fm_daily_challenges where status='open' and challenge_date<v_date order by challenge_date desc limit 2);
 select array_agg(x) into v_missing from unnest(array['Science','History','Geography','Technology','Culture']) x where not (x=any(coalesce(v_have,'{}')));
 if coalesce(array_length(v_missing,1),0)>0 and coalesce(array_length(v_missing,1),0)<=3 and coalesce(array_length(v_have,1),0)>0 then
   if exists(select 1 from unnest(v_missing) x where not (x=any(p_categories))) then raise exception 'Three-day rotation requires you to include: %',array_to_string(v_missing,', '); end if;
 end if;
 insert into public.fm_category_selections(challenge_id,user_id,category) select p_challenge_id,v_user,x from unnest(p_categories) x;
 return jsonb_build_object('selected',to_jsonb(p_categories),'covered_categories',to_jsonb(array(select distinct x from unnest(coalesce(v_have,'{}')||p_categories) x)));
end $$;
grant execute on function public.fm_select_daily_categories(uuid,text[]) to authenticated;

create or replace function public.fm_get_category_stages(p_challenge_id uuid,p_category text)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if not exists(select 1 from public.fm_daily_challenges c where c.id=p_challenge_id and (public.fm_is_super_admin() or (c.status='open' and now()>=c.starts_at and now()<c.ends_at))) then raise exception 'Market is closed'; end if;
 if not exists(select 1 from public.fm_portfolios p where p.challenge_id=p_challenge_id and p.user_id=v_user) then raise exception 'Lock your portfolio first'; end if;
 if not public.fm_is_super_admin() and not exists(select 1 from public.fm_category_selections where challenge_id=p_challenge_id and user_id=v_user and category=p_category) then raise exception 'Category not selected'; end if;
 return query select jsonb_build_object('id',s.id,'category',s.category,'stage_number',s.stage_number,'question_type',s.question_type,'difficulty',s.difficulty,'prompt',s.prompt,'numeric_unit',s.numeric_unit,
 'options',case when s.question_type='ranking' then (select coalesce(jsonb_agg(e.value order by md5(v_user::text||s.id::text||e.value::text)),'[]'::jsonb) from jsonb_array_elements(s.options) e(value)) else s.options end,
 'max_wp',s.max_wp) from public.fm_question_stages s where s.challenge_id=p_challenge_id and s.category=p_category
 and (s.stage_number=1 or exists(select 1 from public.fm_stage_attempts a where a.challenge_id=s.challenge_id and a.user_id=v_user and a.category=s.category and a.stage_number=s.stage_number-1 and a.is_correct))
 order by s.stage_number;
end $$;
grant execute on function public.fm_get_category_stages(uuid,text) to authenticated;

create or replace function public.fm_get_my_stage_attempts(p_challenge_id uuid)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 return query select jsonb_build_object('category',a.category,'stage_number',a.stage_number,'answer',a.answer,'is_correct',a.is_correct,'wp_awarded',a.wp_awarded,'error_pct',a.error_pct,'submitted_at',a.submitted_at,'explanation',q.explanation,
 'estimate_rank',case when a.stage_number=5 then (select r.position from (select x.user_id,rank() over(order by x.error_pct asc) as position from public.fm_stage_attempts x where x.challenge_id=a.challenge_id and x.category=a.category and x.stage_number=5) r where r.user_id=a.user_id) else null end,
 'estimate_participants',case when a.stage_number=5 then (select count(*) from public.fm_stage_attempts x where x.challenge_id=a.challenge_id and x.category=a.category and x.stage_number=5) else null end)
 from public.fm_stage_attempts a join public.fm_question_stages q on q.challenge_id=a.challenge_id and q.category=a.category and q.stage_number=a.stage_number where a.challenge_id=p_challenge_id and a.user_id=v_user order by a.category,a.stage_number;
end $$;
grant execute on function public.fm_get_my_stage_attempts(uuid) to authenticated;

create or replace function public.fm_submit_question_stage(p_challenge_id uuid,p_stage_id uuid,p_answer jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); q public.fm_question_stages%rowtype; v_correct boolean:=false; v_award integer:=0; v_value numeric; v_error numeric; v_date date; v_text text;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select challenge_date into v_date from public.fm_daily_challenges where id=p_challenge_id and (public.fm_is_super_admin() or (status='open' and now()>=starts_at and now()<ends_at));
 if not found then raise exception 'Market is closed'; end if;
 select * into q from public.fm_question_stages where id=p_stage_id and challenge_id=p_challenge_id;
 if not found then raise exception 'Question not found'; end if;
 if not public.fm_is_super_admin() and not exists(select 1 from public.fm_category_selections where challenge_id=p_challenge_id and user_id=v_user and category=q.category) then raise exception 'Select this category first'; end if;
 if not exists(select 1 from public.fm_portfolios where challenge_id=p_challenge_id and user_id=v_user) then raise exception 'Lock your portfolio first'; end if;
 if exists(select 1 from public.fm_stage_attempts where challenge_id=p_challenge_id and user_id=v_user and category=q.category and stage_number=q.stage_number) then raise exception 'This stage has already been submitted'; end if;
 if q.stage_number>1 and not exists(select 1 from public.fm_stage_attempts where challenge_id=p_challenge_id and user_id=v_user and category=q.category and stage_number=q.stage_number-1 and is_correct) then raise exception 'Answer the previous stage correctly to unlock this one'; end if;
 if q.question_type='multiple_choice' then v_correct:=coalesce(p_answer->>'option','') ~ '^[0-3]$' and (p_answer->>'option')::int=q.correct_option;
 elsif q.question_type='open_answer' then v_text:=lower(regexp_replace(trim(coalesce(p_answer->>'text','')),'[[:space:]]+',' ','g')); v_correct:=exists(select 1 from unnest(q.accepted_answers) a where lower(regexp_replace(trim(a),'[[:space:]]+',' ','g'))=v_text);
 elsif q.question_type='ranking' then v_correct:=p_answer->'order'=q.correct_order;
 elsif q.question_type='true_false' then v_correct:=lower(coalesce(p_answer->>'value',''))=lower(q.correct_boolean::text);
 elsif q.question_type='estimation' then
   if coalesce(p_answer->>'value','') !~ '^-?[0-9]+([.][0-9]+)?$' then raise exception 'Enter a valid numerical estimate'; end if;
   v_value:=(p_answer->>'value')::numeric; if q.numeric_target=0 then v_error:=case when v_value=0 then 0 else 100 end; else v_error:=abs(v_value-q.numeric_target)/abs(q.numeric_target)*100; end if;
   v_correct:=true; v_award:=case when v_error<=1 then 300 when v_error<=3 then 275 when v_error<=5 then 250 when v_error<=10 then 200 when v_error<=20 then 150 when v_error<=35 then 75 else 0 end;
 else raise exception 'Unsupported question type'; end if;
 if q.question_type<>'estimation' and v_correct then v_award:=q.max_wp; end if;
 insert into public.fm_stage_attempts(challenge_id,user_id,category,stage_number,answer,is_correct,wp_awarded,error_pct) values(p_challenge_id,v_user,q.category,q.stage_number,p_answer,v_correct,v_award,v_error);
 insert into public.fm_player_daily_scores(challenge_id,user_id) values(p_challenge_id,v_user) on conflict(challenge_id,user_id) do nothing;
 update public.fm_player_daily_scores set answered_count=answered_count+1,correct_answers=correct_answers+(case when v_correct then 1 else 0 end),answer_wp=answer_wp+v_award,total_wp=total_wp+v_award where challenge_id=p_challenge_id and user_id=v_user;
 insert into public.fm_wallets(user_id,worth_points) values(v_user,0) on conflict(user_id) do nothing;
 update public.fm_wallets set worth_points=worth_points+v_award,updated_at=now() where user_id=v_user;
 if v_award>0 then insert into public.fm_wp_ledger(user_id,amount,reason,market_date,reference_id) values(v_user,v_award,'answer_reward',v_date,p_stage_id::text); end if;
 return jsonb_build_object('accepted',true,'correct',v_correct,'wp_awarded',v_award,'explanation',q.explanation,'error_pct',v_error,'stage_number',q.stage_number,'category',q.category,'unlocked_next',v_correct and q.stage_number<5);
end $$;
grant execute on function public.fm_submit_question_stage(uuid,uuid,jsonb) to authenticated;

-- Preserve the existing 10% category-share reward trigger for staged questions too.
create or replace function public.fm_award_category_shares_from_wp()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_category text; v_index numeric; v_price numeric; v_value numeric; v_units numeric; v_basis numeric; v_reference text;
begin
 if new.amount<=0 or new.reason not in ('answer_reward','prediction_payout') then return new; end if;
 if new.reason='answer_reward' then
   v_reference:=split_part(coalesce(new.reference_id,''),':',1); if v_reference='' then return new; end if;
   begin select q.category into v_category from public.fm_questions q where q.id=v_reference::uuid;
     if v_category is null then select s.category into v_category from public.fm_question_stages s where s.id=v_reference::uuid; end if;
   exception when invalid_text_representation then return new; end;
 else
   v_reference:=coalesce(new.reference_id,''); if v_reference='' then return new; end if;
   begin select b.category into v_category from public.fm_prediction_bets b where b.id=v_reference::uuid;
   exception when invalid_text_representation then return new; end;
 end if;
 if v_category not in ('Science','History','Geography','Technology','Culture') then return new; end if;
 select current_index into v_index from public.fm_market_indices where category=v_category;
 v_price:=greatest(coalesce(v_index,1000)/1000.0,0.1); v_value:=round(new.amount*0.10,6); v_units:=round(v_value/v_price,6); v_basis:=round(v_units*v_price,6);
 insert into public.fm_category_share_ledger(user_id,category,entry_type,share_units,price_wp,value_wp,source_ledger_id,reference_id) values(new.user_id,v_category,'earned',v_units,v_price,v_value,new.id,new.reference_id) on conflict(source_ledger_id) do nothing;
 if not found then return new; end if;
 insert into public.fm_category_share_balances(user_id,category,share_units,cost_basis_wp,updated_at) values(new.user_id,v_category,v_units,v_basis,now())
 on conflict(user_id,category) do update set share_units=public.fm_category_share_balances.share_units+excluded.share_units,cost_basis_wp=public.fm_category_share_balances.cost_basis_wp+excluded.cost_basis_wp,updated_at=now();
 return new;
end $$;
