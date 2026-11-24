-- EDIT THESE TWO VALUES before running in the Supabase SQL editor.
-- Create/invite the Auth account first; this script does not set or store passwords.
do $$
declare
 owner_email text := 'yipcolin23@gmail.com';
 business_name text := 'CME';
 owner_user uuid;
 new_business uuid;
begin
 if owner_email='CHANGE-ME@example.com' then raise exception 'Set owner_email before running this script'; end if;
 select id into owner_user from auth.users where lower(email)=lower(owner_email);
 if owner_user is null then raise exception 'Create or invite the Auth user first'; end if;
 if exists(select 1 from public.business_members where user_id=owner_user) then raise exception 'User already belongs to a business'; end if;
 insert into public.businesses(name) values(business_name) returning id into new_business;
 insert into public.business_members(business_id,user_id,role) values(new_business,owner_user,'owner');
end $$;
