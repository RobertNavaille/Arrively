-- Driver edits a stop's name and notes (Edit details, beside the address fix).
create or replace function public.update_stop_details(p_stop uuid, p_name text, p_notes text)
returns public.stops
language plpgsql security definer set search_path = public as $$
declare v public.stops; v_old jsonb;
begin
  v := public.assert_driver_of(p_stop);
  v_old := jsonb_build_object('name', v.customer_name, 'notes', v.notes);
  update public.stops set customer_name = coalesce(nullif(btrim(p_name), ''), customer_name),
    notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = v.id returning * into v;
  perform public.log_event(v.id, 'details_edited', jsonb_build_object('from', v_old,
    'to', jsonb_build_object('name', v.customer_name, 'notes', v.notes)));
  return v;
end $$;

revoke execute on function public.update_stop_details(uuid, text, text) from public, anon;
grant execute on function public.update_stop_details(uuid, text, text) to authenticated;
