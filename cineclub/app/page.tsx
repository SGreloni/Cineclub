import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { loadClubPageData } from "@/lib/club-data"
import { MovieClubApp } from "@/components/movie-club-app"

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  let { users, activeMovie, watchedMovies } = await loadClubPageData(supabase)

  if (!users.some((u) => u.id === user.id)) {
    const displayName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Friend"
    const avatarUrl =
      (user.user_metadata?.avatar_url as string | undefined) ??
      (user.user_metadata?.picture as string | undefined) ??
      null

    await supabase.from("profiles").upsert(
      {
        id: user.id,
        display_name: displayName,
        avatar_url: avatarUrl,
      },
      { onConflict: "id" }
    )

    const reloaded = await loadClubPageData(supabase)
    users = reloaded.users
    activeMovie = reloaded.activeMovie
    watchedMovies = reloaded.watchedMovies
  }

  return (
    <MovieClubApp
      currentUserId={user.id}
      initialUsers={users}
      initialActiveMovie={activeMovie}
      initialWatchedMovies={watchedMovies}
    />
  )
}
