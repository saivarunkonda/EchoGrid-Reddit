import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isServer = process.argv.includes('--server');
const isClient = process.argv.includes('--client');

if (!isServer && !isClient) {
  console.error('Please specify --client or --server');
  process.exit(1);
}

const config = {
  entryPoints: isServer 
    ? [path.resolve(__dirname, 'src/server/index.ts')]
    : [path.resolve(__dirname, 'src/client/splash.ts'), path.resolve(__dirname, 'src/client/game.ts')],
  bundle: true,
  sourcemap: 'linked',
  target: 'es2023',
  // Emit ES modules so Node runs the output when package.json has "type": "module"
  format: 'esm',
  outdir: isServer ? path.resolve(__dirname, 'dist/server') : path.resolve(__dirname, 'public'),
  platform: isServer ? 'node' : 'browser',
  logLevel: 'warning',
  absWorkingDir: __dirname,
  external: isServer ? ['@devvit/web/server', '@hono/node-server'] : [],
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
  },
  tsconfig: path.resolve(__dirname, 'tsconfig.json'),
};

build(config).catch(() => process.exit(1));
