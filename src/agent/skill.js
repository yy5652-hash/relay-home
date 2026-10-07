// Loads an Agent Skill (agentskills.io layout: SKILL.md with YAML front matter) and turns it into agent instructions.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills');

export function loadSkill(name = 'relay-home-evening') {
  const text = readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`skills/${name}/SKILL.md has no front matter`);
  const meta = Object.fromEntries(match[1].split('\n').filter(line => /^[a-z-]+:\s*\S/.test(line)).map(line => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]));
  if (meta.name !== name) throw new Error(`Skill name "${meta.name}" does not match its folder "${name}"`);
  return { name: meta.name, description: meta.description, instructions: match[2].trim() };
}
