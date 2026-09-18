import { build } from 'esbuild';
export async function buildWeb() {
  await build({ entryPoints: ['apps/web/live.ts'], bundle: true, minify: true, outfile: 'apps/web/dist/live.js', platform: 'browser', target: 'es2022', define: { 'process.env.NODE_ENV': '"production"' } });
}
if (process.argv[1]?.endsWith('build-web.ts')) await buildWeb();
