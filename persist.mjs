#!/usr/bin/env node
// terse persistence hook. Re-injects the skill core on every UserPromptSubmit.
// Portable: reads SKILL.md next to this file, so it works wherever the repo lives.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), "SKILL.md");

function buildPersistText(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  const nameMatch = /^name:\s*(.+)$/m.exec(text);
  const name = nameMatch ? nameMatch[1].trim() : "this skill";

  const section = (heading) => {
    const start = heading.exec(text);
    if (!start) return "";
    const rest = text.slice(start.index + start[0].length);
    const next = /^#{1,6}\s+/m.exec(rest);
    return (next ? rest.slice(0, next.index) : rest).trim();
  };

  const isFence = (line) => line.indexOf("```") === 0 || line.indexOf("~~~") === 0;

  // Reassemble bullets: a rule may wrap across several physical lines, and a
  // reminder truncated mid-sentence is worse than none. Fenced code between a
  // bullet and the next is skipped, not glued onto the rule. Headings are
  // matched case-insensitively so "## rules" is not silently missed.
  const rules = [];
  let inFence = false;
  for (const rawLine of section(/^#{1,6}\s+Rules\s*$/im).split("\n")) {
    const line = rawLine.trim();
    if (isFence(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (line.indexOf("- ") === 0) {
      rules.push(line.slice(2).trim());
    } else if (line.length > 0 && rules.length > 0) {
      rules[rules.length - 1] += " " + line;
    }
  }

  // The effect's first paragraph, joined across its wrapped lines.
  const effectLines = [];
  for (const rawLine of section(/^#{1,6}\s+Observable effect\b.*$/im).split("\n")) {
    const line = rawLine.trim();
    if (isFence(line)) break;
    if (line.length === 0) {
      if (effectLines.length > 0) break;
    } else {
      effectLines.push(line);
    }
  }
  const effect = effectLines.join(" ");

  const lines = ["<skill:" + name + ">", name + " is active this turn. Hold to it before you finish:"];
  if (rules.length > 0) {
    for (const r of rules) lines.push("- " + r);
  } else {
    lines.push("- Follow the skill you were given; do not drift back to default behaviour.");
  }
  if (effect) lines.push("Done means: " + effect);
  lines.push("</skill:" + name + ">");
  return lines.join("\n") + "\n";
}

try {
  process.stdout.write(buildPersistText(readFileSync(SKILL, "utf8")));
} catch {
  // A reminder must never block a prompt.
}
