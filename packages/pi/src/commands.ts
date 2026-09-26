// API -------------------------------------------------------------------------

export function tokenizeCommandArgs(raw: string): string[] {
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
  if (escaped || quote) throw new Error('Unterminated quote or escape.');
  push();
  return tokens;
}
