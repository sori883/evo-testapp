import { defineConfig } from 'tsup'

/**
 * Lambda ハンドラを単一ファイルにバンドルする。
 * - format: cjs … Lambda の handler 解決を単純化する（dist/handler.cjs の exports.handler）。
 * - external: aws-sdk v3 … Node.js 22 ランタイムに同梱されるため同梱しない（バンドル削減）。
 *   CDK は dist/ を `lambda.Code.fromAsset` で参照する。
 */
export default defineConfig({
  entry: { handler: 'src/handler.ts' },
  outDir: 'dist',
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  clean: true,
  minify: false,
  sourcemap: true,
  external: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
})
