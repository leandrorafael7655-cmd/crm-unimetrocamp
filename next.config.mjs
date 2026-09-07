/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build estrito (Fase 6): erros de TypeScript e de ESLint quebram o build.
  // O legado components/crm-app.jsx fica fora do type-check (checkJs ausente)
  // e será tipado por extração à medida que encolher.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // geolocation=(self): habilita o botão "minha localização" no /mapa (Fase 4.4).
          // camera e microphone permanecem bloqueados.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ]
  },
}

export default nextConfig
