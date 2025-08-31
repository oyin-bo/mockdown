// Minimal TypeScript ESM loader using esbuild
// Usage: node --test --loader ./ts-loader.js "parser/tests/**/*.test.ts"

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

// Simple in-memory cache to avoid recompiling the same file repeatedly
const cache = new Map();

/**
 * resolve hook: try Node's default resolution first, then fall back to
 * mapping .js -> .ts for imports that use .js specifiers.
 */
export async function resolve(specifier, context, defaultResolve) {
	try {
		return await defaultResolve(specifier, context, defaultResolve);
	} catch (err) {
		// If someone imported './foo.js' but the file on disk is './foo.ts', try that.
		try {
			if (typeof specifier === 'string' && specifier.endsWith('.js')) {
				const tsSpec = specifier.replace(/\.js$/, '.ts');
				return await defaultResolve(tsSpec, context, defaultResolve);
			}
			// Try adding .ts for bare relative imports like './foo'
			if (typeof specifier === 'string' && (specifier.startsWith('./') || specifier.startsWith('../'))) {
				return await defaultResolve(specifier + '.ts', context, defaultResolve);
			}
		} catch (__) {
			// ignore fallback failures and rethrow original
		}
		throw err;
	}
}

/**
 * load hook: when Node requests a .ts/.tsx file, transpile it with esbuild
 * and return the compiled JS source (with inline sourcemap).
 */
export async function load(url, context, defaultLoad) {
	if (url.endsWith('.ts') || url.endsWith('.tsx')) {
		if (cache.has(url)) return cache.get(url);

		const filename = fileURLToPath(url);
		const source = await readFile(filename, 'utf8');

		// Use esbuild to transpile TypeScript -> ESM JavaScript quickly.
		const result = await esbuild.transform(source, {
			loader: 'ts',
			format: 'esm',
			target: ['es2022'],
			sourcemap: 'inline'
		});

		const out = { format: 'module', source: result.code, shortCircuit: true };
		cache.set(url, out);
		return out;
	}

	// Delegate to Node's default loader for other file types
	return defaultLoad ? defaultLoad(url, context, defaultLoad) : null;
}