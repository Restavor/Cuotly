import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        // La página del comensal (`/c/<token>`, Fase F): el enlace es su llave. Sin caché ni en el navegador ni en
        // intermediarios, sin pasar el enlace como referrer a nadie, sin indexar y sin poder meterse en un marco de otra
        // web (PRD de agents §6.9, decisión 154).
        source: "/c/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
