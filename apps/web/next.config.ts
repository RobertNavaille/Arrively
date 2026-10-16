import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The route solver is shared with the server (supabase/functions/_shared).
  turbopack: { root: path.join(__dirname, '../..') },
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default config;
