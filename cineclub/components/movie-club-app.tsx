"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Film,
  Search,
  ArrowUp,
  ArrowDown,
  Trash2,
  Ban,
  Check,
  Play,
  Star,
  Clapperboard,
  Users,
  Clock,
  Trophy,
  Sparkles,
  LogOut,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { ClubUser, Movie, WatchedMovie, TmdbSearchMovie } from "@/lib/types/club"
import {
  addToBacklogFromTmdb,
  completeWatchAction,
  removeFromBacklog as removeFromBacklogAction,
  reorderBacklog as reorderBacklogAction,
  setActivePickAction,
  toggleReady as toggleReadyAction,
  vetoMovieAction,
} from "@/app/actions/club"
import { createClient } from "@/lib/supabase/client"

type ShortlistEntry = Movie & { userId: string; userName: string }

interface MovieClubAppProps {
  currentUserId: string
  initialUsers: ClubUser[]
  initialActiveMovie: Movie | null
  initialWatchedMovies: WatchedMovie[]
}

export function MovieClubApp({
  currentUserId,
  initialUsers,
  initialActiveMovie,
  initialWatchedMovies,
}: MovieClubAppProps) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [activeMovie, setActiveMovie] = useState(initialActiveMovie)
  const [watchedMovies, setWatchedMovies] = useState(initialWatchedMovies)
  const [activeTab, setActiveTab] = useState("billboard")
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [remoteResults, setRemoteResults] = useState<TmdbSearchMovie[]>([])
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isRouletteRunning, setIsRouletteRunning] = useState(false)
  const [rouletteMovie, setRouletteMovie] = useState<ShortlistEntry | null>(null)
  const [showWinnerModal, setShowWinnerModal] = useState(false)
  const [pendingWinner, setPendingWinner] = useState<Movie | null>(null)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [ratingValue, setRatingValue] = useState(5)
  const [movieToRate, setMovieToRate] = useState<Movie | null>(null)
  const [vetoingMovieId, setVetoingMovieId] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    setUsers(initialUsers)
    setActiveMovie(initialActiveMovie)
    setWatchedMovies(initialWatchedMovies)
  }, [initialUsers, initialActiveMovie, initialWatchedMovies])

  const currentUser = users.find((u) => u.id === currentUserId)

  useEffect(() => {
    if (!searchQuery.trim()) {
      setRemoteResults([])
      setShowSearchResults(false)
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/movies/search?query=${encodeURIComponent(searchQuery.trim())}`,
          { credentials: "include" }
        )
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? "Search failed")
          setRemoteResults([])
        } else {
          setRemoteResults(data.results ?? [])
        }
      } catch {
        toast.error("Search failed")
        setRemoteResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 350)

    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current)
    }
  }, [searchQuery])

  const searchResultsAsMovies: Movie[] = remoteResults.map((r) => ({
    id: String(r.tmdb_id),
    title: r.title,
    year: r.year ?? 0,
    director: r.director,
    poster: r.poster_url || "/placeholder.svg",
    genre: r.genre,
  }))

  const filteredRemote = searchResultsAsMovies.filter(
    (movie) => !currentUser?.backlog.some((m) => m.title === movie.title && m.year === movie.year)
  )

  const getShortlist = useCallback(() => {
    return users.flatMap((user) =>
      user.backlog.slice(0, 3).map((movie) => ({
        ...movie,
        userId: user.id,
        userName: user.name,
      }))
    )
  }, [users])

  const allUsersReady = users.length > 0 && users.every((u) => u.isReady)

  async function addToBacklog(tmdb: TmdbSearchMovie) {
    const res = await addToBacklogFromTmdb(tmdb)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setSearchQuery("")
    setShowSearchResults(false)
    router.refresh()
    toast.success("Added to backlog")
  }

  async function removeFromBacklog(movieId: string) {
    const res = await removeFromBacklogAction(movieId)
    if (!res.ok) toast.error(res.error)
    else router.refresh()
  }

  async function moveInBacklog(movieId: string, direction: "up" | "down") {
    const res = await reorderBacklogAction(movieId, direction)
    if (!res.ok) toast.error(res.error)
    else router.refresh()
  }

  async function vetoMovie(movieId: string, userId: string) {
    if (!currentUser || currentUser.vetosRemaining <= 0) return
    setVetoingMovieId(movieId)
    const res = await vetoMovieAction(userId, movieId)
    setVetoingMovieId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    router.refresh()
  }

  async function toggleReady(userId: string) {
    if (userId !== currentUserId) return
    const res = await toggleReadyAction()
    if (!res.ok) toast.error(res.error)
    else router.refresh()
  }

  const drawMovie = async () => {
    const shortlist = getShortlist()
    if (shortlist.length === 0) return

    setIsRouletteRunning(true)
    const maxIterations = 20

    for (let i = 0; i < maxIterations; i++) {
      const randomMovie = shortlist[Math.floor(Math.random() * shortlist.length)]
      setRouletteMovie(randomMovie)
      await new Promise((r) => setTimeout(r, 100 + i * 20))
    }

    const winner = shortlist[Math.floor(Math.random() * shortlist.length)]
    setRouletteMovie(winner)

    const res = await setActivePickAction(winner.id)
    if (!res.ok) {
      toast.error(res.error)
      setIsRouletteRunning(false)
      setRouletteMovie(null)
      return
    }

    router.refresh()
    setTimeout(() => {
      setIsRouletteRunning(false)
      const m: Movie = {
        id: winner.id,
        title: winner.title,
        year: winner.year,
        director: winner.director,
        poster: winner.poster,
        genre: winner.genre,
      }
      setPendingWinner(m)
      setActiveMovie(m)
      setShowWinnerModal(true)
    }, 400)
  }

  const markAsWatched = () => {
    const m = activeMovie ?? pendingWinner
    if (!m) return
    setMovieToRate(m)
    setShowRatingModal(true)
    setShowWinnerModal(false)
  }

  const submitRating = async () => {
    if (!movieToRate) return
    const res = await completeWatchAction(movieToRate.id, ratingValue)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setPendingWinner(null)
    setActiveMovie(null)
    setShowRatingModal(false)
    setMovieToRate(null)
    setRatingValue(5)
    router.refresh()
    toast.success("Saved")
  }

  const getAverageRating = (ratings: Record<string, number>) => {
    const values = Object.values(ratings)
    if (values.length === 0) return "0"
    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
  }

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Profile not ready</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm space-y-4">
            <p>Your account has no profile row yet. Run the SQL scripts in Supabase and sign in again.</p>
            <Button variant="outline" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? <Loader2 className="animate-spin w-4 h-4" /> : "Sign out"}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Film className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold tracking-tight">Movie Club</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {currentUser.initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline text-sm font-medium">{currentUser.name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 bg-secondary/50">
            <TabsTrigger
              value="backlog"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Users className="w-4 h-4 mr-2" />
              My Backlog
            </TabsTrigger>
            <TabsTrigger
              value="billboard"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Clapperboard className="w-4 h-4 mr-2" />
              Billboard
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Clock className="w-4 h-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="backlog" className="space-y-6">
            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search for a movie..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowSearchResults(e.target.value.length > 0)
                }}
                onFocus={() => searchQuery.length > 0 && setShowSearchResults(true)}
                className="pl-10 bg-secondary/50 border-border h-12 text-lg"
              />
              {searchLoading && (
                <p className="text-xs text-muted-foreground mt-2 text-center">Searching…</p>
              )}

              {showSearchResults && filteredRemote.length > 0 && (
                <Card className="absolute top-full mt-2 w-full z-50 border-border bg-card">
                  <CardContent className="p-2">
                    {filteredRemote.map((movie, i) => (
                      <button
                        key={`${movie.id}-${i}`}
                        type="button"
                        onClick={() => {
                          const raw = remoteResults.find((r) => String(r.tmdb_id) === movie.id)
                          if (raw) void addToBacklog(raw)
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                      >
                        <img
                          src={movie.poster}
                          alt={movie.title}
                          className="w-12 h-16 object-cover rounded"
                        />
                        <div>
                          <p className="font-medium">{movie.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {movie.year} • {movie.director}
                          </p>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="max-w-2xl mx-auto space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="text-primary">#</span> Your Priority List
                <Badge variant="secondary" className="ml-2">
                  {currentUser.backlog.length} movies
                </Badge>
              </h2>

              {currentUser.backlog.length === 0 ? (
                <Card className="border-dashed border-border">
                  <CardContent className="py-12 text-center">
                    <Film className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Your backlog is empty. Search for movies to add!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {currentUser.backlog.map((movie, index) => (
                    <Card
                      key={movie.id}
                      className="border-border bg-card/50 hover:bg-card transition-colors"
                    >
                      <CardContent className="p-3 flex items-center gap-4">
                        <span className="text-2xl font-bold text-primary/50 w-8">{index + 1}</span>
                        <img
                          src={movie.poster}
                          alt={movie.title}
                          className="w-14 h-20 object-cover rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{movie.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {movie.year} • {movie.director}
                          </p>
                          <Badge variant="outline" className="mt-1 text-xs">
                            {movie.genre}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveInBacklog(movie.id, "up")}
                            disabled={index === 0}
                            className="h-8 w-8"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveInBacklog(movie.id, "down")}
                            disabled={index === currentUser.backlog.length - 1}
                            className="h-8 w-8"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFromBacklog(movie.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="billboard" className="space-y-8">
            {activeMovie && (
              <Card className="border-accent/50 bg-gradient-to-r from-accent/10 to-primary/10">
                <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-6">
                  <img
                    src={activeMovie.poster}
                    alt={activeMovie.title}
                    className="w-24 h-36 object-cover rounded-lg shadow-lg"
                  />
                  <div className="flex-1 text-center sm:text-left">
                    <Badge className="bg-accent text-accent-foreground mb-2">
                      <Play className="w-3 h-3 mr-1" /> Now Watching
                    </Badge>
                    <h2 className="text-2xl font-bold">{activeMovie.title}</h2>
                    <p className="text-muted-foreground">
                      {activeMovie.year} • {activeMovie.director}
                    </p>
                  </div>
                  <Button
                    onClick={markAsWatched}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Mark as Watched
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="border-border">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex flex-wrap justify-center sm:justify-start gap-4">
                    {users.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 bg-secondary/30 rounded-full pl-1 pr-4 py-1"
                      >
                        <Avatar className="w-8 h-8 ring-2 ring-offset-2 ring-offset-background ring-border">
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback>{user.initials}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{user.name}</span>
                        <Switch
                          checked={user.isReady}
                          onCheckedChange={() => toggleReady(user.id)}
                          disabled={user.id !== currentUserId}
                          className="data-[state=checked]:bg-accent"
                        />
                        {user.isReady && <Check className="w-4 h-4 text-accent" />}
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={() => void drawMovie()}
                    disabled={!allUsersReady || isRouletteRunning || activeMovie !== null}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
                    size="lg"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Draw Movie
                  </Button>
                </div>
              </CardContent>
            </Card>

            {isRouletteRunning && rouletteMovie && (
              <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center">
                <div className="text-center">
                  <div className="relative w-48 h-72 mx-auto mb-6 animate-pulse">
                    <img
                      src={rouletteMovie.poster}
                      alt={rouletteMovie.title}
                      className="w-full h-full object-cover rounded-xl shadow-2xl ring-4 ring-primary"
                    />
                  </div>
                  <h3 className="text-2xl font-bold animate-pulse">{rouletteMovie.title}</h3>
                  <p className="text-muted-foreground">Selecting…</p>
                </div>
              </div>
            )}

            <div className="space-y-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-accent" />
                The Shortlist
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {users.map((user) => (
                  <div key={user.id} className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-border">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback className="text-xs">{user.initials}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}&apos;s Picks</span>
                      {user.id !== currentUserId && (
                        <Badge variant="outline" className="ml-auto text-xs">
                          <Ban className="w-3 h-3 mr-1" />
                          {currentUser.vetosRemaining} vetos
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-3">
                      {user.backlog.slice(0, 3).map((movie, index) => (
                        <Card
                          key={movie.id}
                          className={cn(
                            "border-border overflow-hidden transition-all duration-300",
                            vetoingMovieId === movie.id && "opacity-0 translate-x-4"
                          )}
                        >
                          <div className="flex">
                            <div className="relative">
                              <img
                                src={movie.poster}
                                alt={movie.title}
                                className="w-20 h-28 object-cover"
                              />
                              <div className="absolute top-1 left-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground">
                                {index + 1}
                              </div>
                            </div>
                            <CardContent className="p-3 flex-1 flex flex-col">
                              <h4 className="font-semibold text-sm line-clamp-1">{movie.title}</h4>
                              <p className="text-xs text-muted-foreground">{movie.year}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {movie.director}
                              </p>
                              {user.id !== currentUserId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => vetoMovie(movie.id, user.id)}
                                  disabled={currentUser.vetosRemaining <= 0}
                                  className="mt-auto self-start text-xs h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Ban className="w-3 h-3 mr-1" />
                                  Seen it
                                </Button>
                              )}
                            </CardContent>
                          </div>
                        </Card>
                      ))}

                      {user.backlog.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No movies in backlog
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Trophy className="w-5 h-5 text-accent" />
              History Vault
            </h2>

            {watchedMovies.length === 0 ? (
              <Card className="border-dashed border-border">
                <CardContent className="py-12 text-center">
                  <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No movies watched yet. Draw a movie from the Billboard!
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {watchedMovies.map((movie) => (
                  <Card key={movie.id} className="border-border overflow-hidden">
                    <div className="relative">
                      <img
                        src={movie.poster}
                        alt={movie.title}
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute top-2 right-2 bg-accent text-accent-foreground rounded-full px-3 py-1 flex items-center gap-1 font-bold">
                        <Star className="w-4 h-4 fill-current" />
                        {getAverageRating(movie.ratings)}
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold">{movie.title}</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {movie.year} • {movie.director}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {users.map((user) => (
                          <div
                            key={user.id}
                            className="flex items-center gap-1 bg-secondary/50 rounded-full pl-0.5 pr-2 py-0.5"
                          >
                            <Avatar className="w-5 h-5">
                              <AvatarImage src={user.avatar} alt={user.name} />
                              <AvatarFallback className="text-[10px]">{user.initials}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium">
                              {movie.ratings[user.id] ?? "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog
        open={showWinnerModal}
        onOpenChange={(open) => {
          setShowWinnerModal(open)
          if (!open) setPendingWinner(null)
        }}
      >
        <DialogContent className="sm:max-w-md bg-card border-accent/50">
          <DialogHeader>
            <DialogTitle className="text-center">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-accent" />
              Tonight&apos;s Pick
            </DialogTitle>
            <DialogDescription className="sr-only">The movie selected for tonight</DialogDescription>
          </DialogHeader>
          {(pendingWinner || activeMovie) && (
            <div className="text-center space-y-4">
              {(() => {
                const m = pendingWinner ?? activeMovie!
                return (
                  <>
                    <div className="relative w-40 h-60 mx-auto">
                      <img
                        src={m.poster}
                        alt={m.title}
                        className="w-full h-full object-cover rounded-xl shadow-2xl ring-4 ring-accent"
                      />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold">{m.title}</h3>
                      <p className="text-muted-foreground">
                        {m.year} • {m.director}
                      </p>
                      <Badge className="mt-2">{m.genre}</Badge>
                    </div>
                    <Button
                      onClick={markAsWatched}
                      className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                      size="lg"
                    >
                      <Check className="w-5 h-5 mr-2" />
                      Mark as Watched
                    </Button>
                  </>
                )
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showRatingModal} onOpenChange={setShowRatingModal}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-center">Rate the Movie</DialogTitle>
            <DialogDescription className="text-center">
              How would you rate {movieToRate?.title}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex justify-center gap-1 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRatingValue(value)}
                  className={cn(
                    "w-8 h-8 rounded-full text-sm font-bold transition-all",
                    value <= ratingValue
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="text-center">
              <span className="text-4xl font-bold text-accent">{ratingValue}</span>
              <span className="text-muted-foreground">/10</span>
            </div>
            <Button
              onClick={() => void submitRating()}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              size="lg"
            >
              Submit Rating
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
