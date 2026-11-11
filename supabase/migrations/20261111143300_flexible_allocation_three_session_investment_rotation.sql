-- Know Your Worth: flexible daily allocation with a three-market-session investment rotation.
-- Weekends and exchange holidays do not count as missed market sessions.
create or replace function public.fm_get_investment_rotation(p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_user uuid := auth.uid(); v_date date; v_recent_dates date[] := '{}'::date[]; v_cat text; v_last date; v_due boolean; v_items jsonb := '[]'::jsonb; v_required text[] := '{}'::text[];
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select c.challenge_date into v_date from public.fm_daily_challenges c where c.id=p_challenge_id;
 if v_date is null then raise exception 'Challenge not found'; end if;
 select coalesce(array_agg(x.challenge_date), '{}'::date[]) into v_recent_dates from (select c.challenge_date from public.fm_daily_challenges c where c.challenge_date<v_date order by c.challenge_date desc limit 2) x;
 foreach v_cat in array array['Science','History','Geography','Technology','Culture'] loop
  select max(c.challenge_date) into v_last from public.fm_portfolios p join public.fm_daily_challenges c on c.id=p.challenge_id where p.user_id=v_user and c.challenge_date<v_date and coalesce((p.allocations->>v_cat)::numeric,0)>0;
  v_due:=v_last is null or not (v_last=any(v_recent_dates));
  if v_due then v_required:=array_append(v_required,v_cat); end if;
  v_items:=v_items||jsonb_build_array(jsonb_build_object('category',v_cat,'last_invested_on',v_last,'due',v_due));
 end loop;
 return jsonb_build_object('challenge_date',v_date,'required_categories',to_jsonb(v_required),'categories',v_items,'recent_market_sessions',to_jsonb(v_recent_dates));
end; $function$;

create or replace function public.fm_lock_portfolio(p_challenge_id uuid,p_allocations jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_user uuid:=auth.uid(); v_date date; v_recent_dates date[]:='{}'::date[]; v_total integer:=0; v_cat text; v_amount integer; v_due text[]:='{}'::text[];
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select c.challenge_date into v_date from public.fm_daily_challenges c where c.id=p_challenge_id and (public.fm_is_super_admin() or (c.status='open' and now()>=c.starts_at and now()<c.ends_at));
 if v_date is null then raise exception 'Market is closed'; end if;
 if jsonb_typeof(p_allocations)<>'object' or (select count(*) from jsonb_object_keys(p_allocations))<>5 then raise exception 'Provide an allocation for all five categories'; end if;
 select coalesce(array_agg(x.challenge_date),'{}'::date[]) into v_recent_dates from (select c.challenge_date from public.fm_daily_challenges c where c.challenge_date<v_date order by c.challenge_date desc limit 2) x;
 foreach v_cat in array array['Science','History','Geography','Technology','Culture'] loop
  if not (p_allocations?v_cat) then raise exception 'Missing allocation for %',v_cat; end if;
  begin v_amount:=(p_allocations->>v_cat)::integer; exception when others then raise exception 'Allocations must be whole FM coins'; end;
  if v_amount<0 or v_amount>40 then raise exception 'Each category must receive 0–40 FM'; end if;
  v_total:=v_total+v_amount;
  if not exists(select 1 from public.fm_portfolios p join public.fm_daily_challenges c on c.id=p.challenge_id where p.user_id=v_user and c.challenge_date=any(v_recent_dates) and coalesce((p.allocations->>v_cat)::numeric,0)>0) and v_amount=0 then v_due:=array_append(v_due,v_cat); end if;
 end loop;
 if v_total<>100 then raise exception 'Allocations must total exactly 100 FM'; end if;
 if coalesce(array_length(v_due,1),0)>0 then raise exception 'Investment due today: allocate at least 1 FM to %',array_to_string(v_due,', '); end if;
 insert into public.fm_portfolios(challenge_id,user_id,allocations) values(p_challenge_id,v_user,p_allocations);
 return jsonb_build_object('locked',true,'total',v_total,'required_categories',to_jsonb(v_due));
exception when unique_violation then raise exception 'Your portfolio is already locked for this challenge';
end; $function$;
revoke all on function public.fm_get_investment_rotation(uuid) from public,anon;
grant execute on function public.fm_get_investment_rotation(uuid) to authenticated;
revoke all on function public.fm_lock_portfolio(uuid,jsonb) from public,anon;
grant execute on function public.fm_lock_portfolio(uuid,jsonb) to authenticated;
