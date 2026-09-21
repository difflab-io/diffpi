const HELP = 'Usage: /plan init|new|update|annotate|finalize|go|help. Run /plan help for exact grammar.';

type AuthorVerb = 'init' | 'new' | 'update' | 'annotate' | 'finalize' | 'help';
export type PlanCommandRequest =
  | { verb: AuthorVerb; plan?: string; branch?: string; background: boolean; instructions: string }
  | { verb: 'go'; plan: string; background: boolean; policy?: 'commit-per-phase' | 'no-commit'; instructions: '' };

export function parsePlanArgs(raw: string): PlanCommandRequest {
  const tokens = tokenizePlanArgs(raw);
  const verb = (tokens.shift() ?? 'help') as PlanCommandRequest['verb'];
  if (!['init', 'new', 'update', 'annotate', 'finalize', 'go', 'help'].includes(verb))
    throw new Error(`Unknown plan verb: ${verb}. ${HELP}`);
  let branch: string | undefined;
  let background = false;
  let policy: 'commit-per-phase' | 'no-commit' | undefined;
  const positional: string[] = [];
  while (tokens.length) {
    const token = tokens.shift()!;
    if (token === '--branch') {
      if (branch) throw new Error(`Duplicate --branch. ${HELP}`);
      branch = tokens.shift();
      if (!branch || branch.startsWith('--')) throw new Error(`--branch requires a value. ${HELP}`);
    } else if (token === '--bg') {
      if (background) throw new Error(`Duplicate --bg. ${HELP}`);
      background = true;
    } else if (token === '--commit' || token === '--no-commit') {
      const next = token === '--commit' ? 'commit-per-phase' : 'no-commit';
      if (policy) throw new Error(`Conflicting or duplicate commit policy. ${HELP}`);
      policy = next;
    } else if (token.startsWith('--')) throw new Error(`Unknown flag: ${token}. ${HELP}`);
    else positional.push(token);
  }
  if (verb === 'go') {
    if (branch) throw new Error(`go does not accept --branch. ${HELP}`);
    if (positional.length !== 1) throw new Error(`go requires exactly one plan slug. ${HELP}`);
    return { verb, plan: positional[0]!, background, policy, instructions: '' };
  }
  if (policy) throw new Error(`${verb} does not accept a commit policy. ${HELP}`);
  if (verb === 'help') {
    if (positional.length || branch || background) throw new Error(`help does not accept arguments. ${HELP}`);
    return { verb, background: false, instructions: '' };
  }
  if (verb === 'init') {
    if (background || positional.length !== 1)
      throw new Error(`init requires one slug and does not accept --bg. ${HELP}`);
    return { verb, plan: positional[0], branch, background: false, instructions: '' };
  }
  if (verb === 'annotate' || verb === 'finalize') {
    if (background || branch || positional.length > 1)
      throw new Error(`${verb} accepts only an optional plan slug. ${HELP}`);
    return { verb, plan: positional[0], background: false, instructions: '' };
  }
  const plan = positional.shift();
  if (verb === 'new' && !plan) throw new Error(`new requires a plan slug. ${HELP}`);
  return { verb, plan, branch, background, instructions: positional.join(' ') };
}

export function tokenizePlanArgs(raw: string): string[] {
  const tokens: string[] = [];
  let value = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  const push = () => {
    if (value) tokens.push(value);
    value = '';
  };
  for (const char of raw.trim()) {
    if (escaped) {
      value += char;
      escaped = false;
    } else if (char === '\\' && quote !== "'") escaped = true;
    else if (quote) {
      if (char === quote) quote = undefined;
      else value += char;
    } else if (char === '"' || char === "'") quote = char;
    else if (/\s/.test(char)) push();
    else value += char;
  }
  if (escaped || quote) throw new Error(`Unterminated quote or escape. ${HELP}`);
  push();
  return tokens;
}
