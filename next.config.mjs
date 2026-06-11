/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Security headers applied to every response (defense in depth).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Force HTTPS for 2 years incl. subdomains (only honored over HTTPS).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Disallow embedding the app in frames (clickjacking protection).
          { key: "X-Frame-Options", value: "DENY" },
          // Don't let browsers MIME-sniff responses into a different type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak full URLs (incl. paths) to third parties via Referer.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Drop access to powerful browser features the app doesn't use.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
