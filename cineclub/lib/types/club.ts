export interface Movie {
  id: string
  title: string
  year: number
  director: string
  poster: string
  genre: string
}

export interface ClubUser {
  id: string
  name: string
  avatar: string
  initials: string
  backlog: Movie[]
  vetosRemaining: number
  isReady: boolean
}

export interface WatchedMovie extends Movie {
  ratings: Record<string, number>
  watchedDate: string
}

export interface TmdbSearchMovie {
  tmdb_id: number
  title: string
  year: number | null
  director: string
  poster_url: string | null
  genre: string
  overview: string | null
}
