import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  env: { API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000' },
};
