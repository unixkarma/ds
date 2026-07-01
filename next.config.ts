import type { NextConfig } from "next";

// Security headers applied to every response. These harden the app against
// clickjacking, MIME sniffing, protocol downgrade, and referrer leakage.
//
// NOTE ON CSP: we intentionally set only the directives that cannot break
// Next.js hydration scripts or third-party SDKs (Stripe.js, Supabase). A full
// script-src/style-src CSP requires per-request nonces wired through middleware
// and must be tested against the live app before enabling — tracked as a
// follow-up. `frame-ancestors 'none'` supersedes X-Frame-Options in modern
// browsers; we send both for older-browser coverage.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
