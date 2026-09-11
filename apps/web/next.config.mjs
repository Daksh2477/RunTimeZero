/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  env: { API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000' },
};
