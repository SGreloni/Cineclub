"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Clapperboard, Mail, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { Alert, AlertDescription } from "@/components/ui/alert"

function siteUrl() {
  if (typeof window !== "undefined") return window.location.origin
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
}

function LoginForm() {
  const searchParams = useSearchParams()
  const err = searchParams.get("error")
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState<"google" | "email" | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const redirectTo = `${siteUrl()}/auth/callback`

  async function signInGoogle() {
    setLocalError(null)
    setLoading("google")
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    })
    setLoading(null)
    if (error) setLocalError(error.message)
  }

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!email.trim()) return
    setLoading("email")
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })
    setLoading(null)
    if (error) {
      setLocalError(error.message)
      return
    }
    setEmailSent(true)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Clapperboard className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">Movie Club</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(err === "config" || err === "auth") && (
            <Alert variant="destructive">
              <AlertDescription>
                {err === "config"
                  ? "Missing Supabase environment variables. Copy .env.example to .env.local and fill in your keys."
                  : "Could not sign you in. Try again."}
              </AlertDescription>
            </Alert>
          )}
          {localError && (
            <Alert variant="destructive">
              <AlertDescription>{localError}</AlertDescription>
            </Alert>
          )}
          {emailSent && (
            <Alert>
              <AlertDescription>
                Check your inbox for the magic link to finish signing in.
              </AlertDescription>
            </Alert>
          )}

          <Button
            type="button"
            onClick={signInGoogle}
            disabled={loading !== null}
            className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            size="lg"
          >
            {loading === "google" ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            Sign in with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <form onSubmit={signInEmail} className="flex gap-2">
            <Input
              type="email"
              placeholder="Enter your email"
              className="bg-input border-border"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading !== null || emailSent}
            />
            <Button
              type="submit"
              variant="outline"
              className="shrink-0"
              disabled={loading !== null || emailSent}
            >
              {loading === "email" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
            </Button>
          </form>
          <p className="text-xs text-center text-muted-foreground">
            We&apos;ll send you a magic link to sign in.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
