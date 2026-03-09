import { Response } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import MarkdownIt from 'markdown-it';

const readmePath = resolve(process.cwd(), 'README.md');
const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
});

export async function sendReadmeMarkdown(res: Response) {
	try {
		const markdown = await readFile(readmePath, 'utf-8');
		const renderedMarkdown = markdownRenderer.render(markdown);

		res.type('html').send(`<!doctype html>
<html lang="sv">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Weather API Docs</title>
		<style>
			body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; background: #0b1020; color: #e2e8f0; }
			.container { max-width: 980px; margin: 0 auto; padding: 32px 20px; }
			h1 { margin-top: 0; font-size: 1.8rem; }
			.markdown h1, .markdown h2, .markdown h3 { margin-top: 1.4em; }
			.markdown p, .markdown li { line-height: 1.6; }
			.markdown a { color: #93c5fd; }
			.markdown code { background: #111827; padding: 2px 6px; border-radius: 6px; }
			.markdown pre { white-space: pre-wrap; word-wrap: break-word; background: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 16px; line-height: 1.55; overflow-x: auto; }
			.markdown pre code { background: transparent; padding: 0; }
		</style>
	</head>
	<body>
		<main class="container">
			<article class="markdown">${renderedMarkdown}</article>
		</main>
	</body>
</html>`);
	} catch {
		res.status(500).json({ error: 'Could not read README.md' });
	}
}
