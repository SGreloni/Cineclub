"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { TmdbSearchMovie } from "@/lib/types/club"

type ActionResult = { ok: true } | { ok: false; error: string }

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null as never, user: null }
  return { supabase, user }
}

export async function addToBacklogFromTmdb(m: TmdbSearchMovie): Promise<ActionResult> {
  const ctx = await requireUser()
  if (!ctx.user) return { ok: false, error: "Not signed in" }
  const { supabase, user } = ctx

  const { data: movieRow, error: mu } = await supabase
    .from("movies")
    .upsert(
      {
        tmdb_id: m.tmdb_id,
        title: m.title,
        year: m.year,
        director: m.director,
        poster_url: m.poster_url,
        genre: m.genre,
        overview: m.overview,
      },
      { onConflict: "tmdb_id" }
    )
    .select("id")
    .single()

  if (mu || !movieRow) {
    return { ok: false, error: mu?.message ?? "Could not save movie" }
  }

  const { data: top } = await supabase
    .from("backlogs")
    .select("priority")
    .eq("user_id", user.id)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPriority = (top?.priority ?? -1) + 1

  const { error: be } = await supabase.from("backlogs").insert({
    user_id: user.id,
    movie_id: movieRow.id,
    priority: nextPriority,
  })

  if (be) {
    if (be.code === "23505") {
      return { ok: false, error: "Already in your backlog" }
    }
    return { ok: false, error: be.message }
  }

  revalidatePath("/")
  return { ok: true }
}

export async function removeFromBacklog(movieId: string): Promise<ActionResult> {
  const ctx = await requireUser()
  if (!ctx.user) return { ok: false, error: "Not signed in" }
  const { supabase, user } = ctx

  const { error } = await supabase
    .from("backlogs")
    .delete()
    .eq("user_id", user.id)
    .eq("movie_id", movieId)

  if (error) return { ok: false, error: error.message }
  revalidatePath("/")
  return { ok: true }
}

export async function reorderBacklog(
  movieId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  const ctx = await requireUser()
  if (!ctx.user) return { ok: false, error: "Not signed in" }
  const { supabase, user } = ctx

  const { data: items, error: qe } = await supabase
    .from("backlogs")
    .select("movie_id, priority")
    .eq("user_id", user.id)
    .order("priority", { ascending: true })

  if (qe || !items?.length) return { ok: false, error: qe?.message ?? "Nothing to reorder" }

  const idx = items.findIndex((i) => i.movie_id === movieId)
  if (idx === -1) return { ok: false, error: "Movie not found" }
  const swapIdx = direction === "up" ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= items.length) return { ok: true }

  const a = items[idx]
  const b = items[swapIdx]
  const temp = -999999

  const { error: e1 } = await supabase
    .from("backlogs")
    .update({ priority: temp })
    .eq("user_id", user.id)
    .eq("movie_id", a.movie_id)
  if (e1) return { ok: false, error: e1.message }

  const { error: e2 } = await supabase
    .from("backlogs")
    .update({ priority: a.priority })
    .eq("user_id", user.id)
    .eq("movie_id", b.movie_id)
  if (e2) return { ok: false, error: e2.message }

  const { error: e3 } = await supabase
    .from("backlogs")
    .update({ priority: b.priority })
    .eq("user_id", user.id)
    .eq("movie_id", a.movie_id)
  if (e3) return { ok: false, error: e3.message }

  revalidatePath("/")
  return { ok: true }
}

export async function toggleReady(): Promise<ActionResult> {
  const ctx = await requireUser()
  if (!ctx.user) return { ok: false, error: "Not signed in" }
  const { supabase, user } = ctx

  const { data: row, error: re } = await supabase
    .from("profiles")
    .select("is_ready")
    .eq("id", user.id)
    .single()

  if (re || row == null) return { ok: false, error: re?.message ?? "Profile not found" }

  const { error } = await supabase
    .from("profiles")
    .update({ is_ready: !row.is_ready })
    .eq("id", user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath("/")
  return { ok: true }
}

export async function vetoMovieAction(
  victimUserId: string,
  movieId: string
): Promise<ActionResult> {
  const ctx = await requireUser()
  if (!ctx.user) return { ok: false, error: "Not signed in" }
  const { supabase } = ctx

  const { error } = await supabase.rpc("veto_movie", {
    p_victim_user_id: victimUserId,
    p_movie_id: movieId,
  })

  if (error) return { ok: false, error: error.message }
  revalidatePath("/")
  return { ok: true }
}

export async function setActivePickAction(movieId: string): Promise<ActionResult> {
  const ctx = await requireUser()
  if (!ctx.user) return { ok: false, error: "Not signed in" }
  const { supabase } = ctx

  const { error } = await supabase.rpc("set_active_pick", { p_movie_id: movieId })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/")
  return { ok: true }
}

export async function completeWatchAction(
  movieId: string,
  rating: number
): Promise<ActionResult> {
  const ctx = await requireUser()
  if (!ctx.user) return { ok: false, error: "Not signed in" }
  const { supabase } = ctx

  const { error } = await supabase.rpc("complete_watch", {
    p_movie_id: movieId,
    p_rating: rating,
  })

  if (error) return { ok: false, error: error.message }
  revalidatePath("/")
  return { ok: true }
}
