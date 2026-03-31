-- One shared "tonight's pick" for the club (single-group app)
CREATE TABLE IF NOT EXISTS public.club_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active_movie_id UUID REFERENCES public.movies(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.club_state (id, active_movie_id) VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.club_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_state_select" ON public.club_state FOR SELECT USING (true);
CREATE POLICY "club_state_update" ON public.club_state FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- At most one history row per movie (ratings attach to that row)
ALTER TABLE public.watch_history DROP CONSTRAINT IF EXISTS watch_history_movie_id_key;
ALTER TABLE public.watch_history ADD CONSTRAINT watch_history_movie_id_key UNIQUE (movie_id);

-- Remove another member's pick (vetos); bypass backlog RLS
CREATE OR REPLACE FUNCTION public.veto_movie(p_victim_user_id uuid, p_movie_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_uid = p_victim_user_id THEN
    RAISE EXCEPTION 'Cannot veto your own list';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.backlogs WHERE user_id = p_victim_user_id AND movie_id = p_movie_id
  ) THEN
    RAISE EXCEPTION 'Movie not in that backlog';
  END IF;

  UPDATE public.profiles
  SET vetos_remaining = vetos_remaining - 1
  WHERE id = v_uid AND vetos_remaining > 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No vetos remaining';
  END IF;

  DELETE FROM public.backlogs
  WHERE user_id = p_victim_user_id AND movie_id = p_movie_id;

  INSERT INTO public.vetoes (user_id, movie_id)
  VALUES (v_uid, p_movie_id)
  ON CONFLICT (user_id, movie_id) DO NOTHING;
END;
$$;

-- Draw: set active movie and reset ready flags (requires everyone ready)
CREATE OR REPLACE FUNCTION public.set_active_pick(p_movie_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE is_ready = false) THEN
    RAISE EXCEPTION 'Not everyone is ready';
  END IF;

  INSERT INTO public.club_state (id, active_movie_id, updated_at)
  VALUES (1, p_movie_id, now())
  ON CONFLICT (id) DO UPDATE
  SET active_movie_id = EXCLUDED.active_movie_id, updated_at = EXCLUDED.updated_at;

  UPDATE public.profiles SET is_ready = false;
END;
$$;

-- Mark watched: history + rating + clear backlogs + clear active pick
CREATE OR REPLACE FUNCTION public.complete_watch(p_movie_id uuid, p_rating integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  wh_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_rating < 1 OR p_rating > 10 THEN
    RAISE EXCEPTION 'Invalid rating';
  END IF;

  SELECT id INTO wh_id FROM public.watch_history WHERE movie_id = p_movie_id LIMIT 1;

  IF wh_id IS NULL THEN
    INSERT INTO public.watch_history (movie_id) VALUES (p_movie_id) RETURNING id INTO wh_id;
  END IF;

  INSERT INTO public.ratings (user_id, watch_history_id, rating)
  VALUES (v_uid, wh_id, p_rating)
  ON CONFLICT (user_id, watch_history_id)
  DO UPDATE SET rating = EXCLUDED.rating;

  DELETE FROM public.backlogs WHERE movie_id = p_movie_id;

  UPDATE public.club_state
  SET active_movie_id = NULL, updated_at = now()
  WHERE id = 1 AND active_movie_id = p_movie_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.veto_movie(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_pick(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_watch(uuid, integer) TO authenticated;
