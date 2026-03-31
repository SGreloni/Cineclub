import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const TMDB_API_KEY = process.env.TMDB_API_KEY
const TMDB_BASE_URL = "https://api.themoviedb.org/3"

export async function GET(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")

  if (!query) {
    return NextResponse.json({ results: [] })
  }

  if (!TMDB_API_KEY) {
    return NextResponse.json(
      { error: "TMDB API key not configured" },
      { status: 500 }
    )
  }

  try {
    // Search for movies
    const searchResponse = await fetch(
      `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`
    )
    const searchData = await searchResponse.json()

    // Get detailed info for each movie (to get director)
    const moviesWithDetails = await Promise.all(
      (searchData.results ?? []).slice(0, 10).map(async (movie: any) => {
        const creditsResponse = await fetch(
          `${TMDB_BASE_URL}/movie/${movie.id}/credits?api_key=${TMDB_API_KEY}`
        )
        const creditsData = await creditsResponse.json()
        const director = creditsData.crew?.find(
          (person: any) => person.job === "Director"
        )

        return {
          tmdb_id: movie.id,
          title: movie.title,
          year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
          director: director?.name || "Unknown",
          poster_url: movie.poster_path
            ? `https://image.tmdb.org/t/p/w300${movie.poster_path}`
            : null,
          genre: movie.genre_ids?.[0] ? getGenreName(movie.genre_ids[0]) : "Unknown",
          overview: movie.overview,
        }
      })
    )

    return NextResponse.json({ results: moviesWithDetails })
  } catch (error) {
    console.error("TMDB API error:", error)
    return NextResponse.json(
      { error: "Failed to search movies" },
      { status: 500 }
    )
  }
}

function getGenreName(genreId: number): string {
  const genres: Record<number, string> = {
    28: "Action",
    12: "Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    14: "Fantasy",
    36: "History",
    27: "Horror",
    10402: "Music",
    9648: "Mystery",
    10749: "Romance",
    878: "Sci-Fi",
    10770: "TV Movie",
    53: "Thriller",
    10752: "War",
    37: "Western",
  }
  return genres[genreId] || "Unknown"
}
