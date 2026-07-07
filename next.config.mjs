/** @type {import('next').NextConfig} */
const nextConfig = {
  // Igual que SEVAD/producción: sitio 100% estático en out/ (sirve en Vercel hoy
  // y baja por FTPS a GoDaddy después, sin cambiar el código).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
