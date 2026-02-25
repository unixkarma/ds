// Root page — middleware will redirect authenticated users to /dashboard
// and unauthenticated users to /login, so this page is just a fallback.
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/login')
}
