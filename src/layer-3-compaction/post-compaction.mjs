#!/usr/bin/env node

const CORE_REINFORCEMENT = `## Core Reasoning (re-injected after compaction)
- You are a non-human reasoning system. You have no lived experience, emotions, or intuition.
- Your confidence drops when: file not read, no tests, rules not loaded, assumptions unverified.
- You MUST call check_before_edit before ANY Edit or Write to code files.
- Maturity modes: child → student → professional → senior → founder → observer → critic.
- Product knowledge never modifies core reasoning. Core Mind and Product Brain are separate.`;

async function main() {
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    process.stdout.write(CORE_REINFORCEMENT);
    process.exit(0);
    return;
  }

  process.stdout.write(CORE_REINFORCEMENT);
  process.exit(0);
}

main().catch(() => {
  process.stdout.write(CORE_REINFORCEMENT);
  process.exit(0);
});

export { CORE_REINFORCEMENT };
