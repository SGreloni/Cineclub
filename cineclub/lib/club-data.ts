import type { SupabaseClient } from "@supabase/supabase-js"
import type { ClubUser, Movie, WatchedMovie } from "@/lib/types/club"

const PLACEHOLDER_POSTER = "/placeholder.svg"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function toMovie(row: {
  id: string
  title: string
  year: number | null
  director: string | null
  poster_url: string | null
  genre: string | null
}): Movie {
  return {
    id: row.id,
    title: row.title,
    year: row.year ?? 0,
    director: row.director ?? "Unknown",
    poster: row.poster_url || PLACEHOLDER_POSTER,
    genre: row.genre ?? "Unknown",
  }
}

export async function loadClubPageData(supabase: SupabaseClient) {
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, vetos_remaining, is_ready")
    .order("display_name")

  if (pErr) throw new Error(pErr.message)

  const { data: backlogRows, error: bErr } = await supabase
    .from("backlogs")
    .select("user_id, priority, movie_id")
    .order("priority", { ascending: true })

  if (bErr) throw new Error(bErr.message)

  const movieIds = [...new Set((backlogRows ?? []).map((r) => r.movie_id))]
  let movieMap = new Map<string, Movie>()
  if (movieIds.length > 0) {
    const { data: movies, error: mErr } = await supabase
      .from("movies")
      .select("id, title, year, director, poster_url, genre")
      .in("id", movieIds)
    if (mErr) throw new Error(mErr.message)
    for (const m of movies ?? []) {
      movieMap.set(m.id, toMovie(m))
    }
  }

  const backlogByUser = new Map<string, Movie[]>()
  for (const p of profiles ?? []) {
    backlogByUser.set(p.id, [])
  }
  for (const row of backlogRows ?? []) {
    const m = movieMap.get(row.movie_id)
    if (!m) continue
    const list = backlogByUser.get(row.user_id) ?? []
    list.push(m)
    backlogByUser.set(row.user_id, list)
  }

  const users: ClubUser[] = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name,
    avatar: p.avatar_url || "",
    initials: initials(p.display_name),
    backlog: backlogByUser.get(p.id) ?? [],
    vetosRemaining: p.vetos_remaining ?? 0,
    isReady: p.is_ready ?? false,
  }))

  const { data: clubRow } = await supabase
    .from("club_state")
    .select("active_movie_id")
    .eq("id", 1)
    .maybeSingle()

  let activeMovie: Movie | null = null
  if (clubRow?.active_movie_id) {
    const { data: am } = await supabase
      .from("movies")
      .select("id, title, year, director, poster_url, genre")
      .eq("id", clubRow.active_movie_id)
      .maybeSingle()
    if (am) activeMovie = toMovie(am)
  }

  const { data: historyRows, error: hErr } = await supabase
    .from("watch_history")
    .select("id, watched_at, movie_id")
    .order("watched_at", { ascending: false })

  if (hErr) throw new Error(hErr.message)

  const histMovieIds = [...new Set((historyRows ?? []).map((r) => r.movie_id))]
  const histMovieMap = new Map<string, Movie>()
  if (histMovieIds.length > 0) {
    const { data: hm, error: hmErr } = await supabase
      .from("movies")
      .select("id, title, year, director, poster_url, genre")
      .in("id", histMovieIds)
    if (hmErr) throw new Error(hmErr.message)
    for (const m of hm ?? []) {
      histMovieMap.set(m.id, toMovie(m))
    }
  }

  const whIds = (historyRows ?? []).map((r) => r.id)
  const ratingsByWatch = new Map<string, Record<string, number>>()
  if (whIds.length > 0) {
    const { data: ratingRows, error: rErr } = await supabase
      .from("ratings")
      .select("user_id, watch_history_id, rating")
      .in("watch_history_id", whIds)
    if (rErr) throw new Error(rErr.message)
    for (const r of ratingRows ?? []) {
      const cur = ratingsByWatch.get(r.watch_history_id) ?? {}
      cur[r.user_id] = r.rating
      ratingsByWatch.set(r.watch_history_id, cur)
    }
  }

  const watchedMovies: WatchedMovie[] = (historyRows ?? [])
    .map((row) => {
      const movie = histMovieMap.get(row.movie_id)
      if (!movie) return null
      const ratings = ratingsByWatch.get(row.id) ?? {}
      return {
        ...movie,
        ratings,
        watchedDate: row.watched_at,
      }
    })
    .filter((x): x is WatchedMovie => x !== null)

  return { users, activeMovie, watchedMovies }
}
