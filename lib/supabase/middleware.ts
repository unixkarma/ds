// Supabase client for use inside Next.js middleware
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — IMPORTANT: do not remove this
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Paths that require no session (anyone can visit)
  const publicPaths = ['/login', '/register', '/forgot-password', '/auth/callback']
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p))

  // Paths where we should NOT auto-redirect logged-in users away.
  // /auth/update-password is reached after exchanging a reset token — the user
  // now has a session but still needs to complete the password-update flow.
  const guestOnlyPaths = ['/login', '/register', '/forgot-password']
  const isGuestOnlyPath = guestOnlyPaths.some((p) => pathname.startsWith(p))

  // If not authenticated and not on a public path → redirect to login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If authenticated and on a guest-only path → redirect to the right home
  if (user && isGuestOnlyPath) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const url = request.nextUrl.clone()
    url.pathname =
      profile?.role === 'student' || profile?.role === 'parent' ? '/student' : '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
