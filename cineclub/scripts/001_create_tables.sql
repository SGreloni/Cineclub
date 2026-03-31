-- Movie Club Database Schema

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  vetos_remaining INTEGER DEFAULT 3,
  is_ready BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Movies table (shared movie database)
CREATE TABLE IF NOT EXISTS public.movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  director TEXT,
  poster_url TEXT,
  genre TEXT,
  overview TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movies_select_all" ON public.movies FOR SELECT USING (true);
CREATE POLICY "movies_insert_authenticated" ON public.movies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Backlog table (user's movie queue)
CREATE TABLE IF NOT EXISTS public.backlogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

ALTER TABLE public.backlogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backlogs_select_all" ON public.backlogs FOR SELECT USING (true);
CREATE POLICY "backlogs_insert_own" ON public.backlogs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "backlogs_update_own" ON public.backlogs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "backlogs_delete_own" ON public.backlogs FOR DELETE USING (auth.uid() = user_id);

-- Vetoes table (track which movies have been vetoed)
CREATE TABLE IF NOT EXISTS public.vetoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

ALTER TABLE public.vetoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vetoes_select_all" ON public.vetoes FOR SELECT USING (true);
CREATE POLICY "vetoes_insert_own" ON public.vetoes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Watch history table
CREATE TABLE IF NOT EXISTS public.watch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  watched_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watch_history_select_all" ON public.watch_history FOR SELECT USING (true);
CREATE POLICY "watch_history_insert_authenticated" ON public.watch_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Ratings table
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  watch_history_id UUID NOT NULL REFERENCES public.watch_history(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, watch_history_id)
);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings_select_all" ON public.ratings FOR SELECT USING (true);
CREATE POLICY "ratings_insert_own" ON public.ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ratings_update_own" ON public.ratings FOR UPDATE USING (auth.uid() = user_id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
