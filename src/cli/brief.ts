import { mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CliError } from './exit';

export function runBrief(args: string[]): void {
  const [mode, name] = args;
  const session = process.env.DSH_SESSION_ID;
  if (!session || !/^[\w-]+$/.test(session) || !process.env.DSH_WEB_URL) throw new CliError('Run brief inside a DSH web session.');
  if (args.length !== 2 || !name || !['new', 'resume'].includes(mode ?? '') || !(/^[a-z0-9][a-z0-9-]{0,79}$/.test(name) || (mode === 'resume' && name === '@legacy'))) throw new CliError('Use brief new <slug> or brief resume <slug|@legacy>.');
  const url = new URL(process.env.DSH_WEB_URL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new CliError('Expected an HTTP(S) DSH web address without credentials.');
  url.search = ''; url.hash = '';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/design-studio/${session}/`;
  const base = resolve('.design');
  const root = name === '@legacy' ? base : join(base, 'briefs', name);
  if (mode === 'new') {
    mkdirSync(join(base, 'briefs'), { recursive: true });
    mkdirSync(root); // Exclusive: never turn a repeated name into a resume.
    mkdirSync(join(root, 'drafts'));
  } else if (!statSync(join(root, 'drafts')).isDirectory()) throw new CliError('No drafts directory for this brief.');
  const sessions = join(base, 'sessions');
  mkdirSync(sessions, { recursive: true });
  const temp = join(sessions, `${session}.${randomUUID()}.tmp`);
  writeFileSync(temp, name, { flag: 'wx' });
  renameSync(temp, join(sessions, session));
  console.log(JSON.stringify({ root, url: url.href }));
}
