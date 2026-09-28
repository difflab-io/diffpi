import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

interface PlanResult {
  output: string;
  artifactDir: string;
}

/** Promptfoo schedules independent cases; each Pi workflow runs in its own process and fixture. */
export default class PiPlanProvider {
  id(): string {
    return 'pi:plan-workflow';
  }

  async callApi(
    _prompt: string,
    context: { vars?: Record<string, unknown> },
  ): Promise<{
    output?: string;
    metadata?: { artifactDir: string };
    error?: string;
  }> {
    const name = context.vars?.case;
    if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
      return { error: 'The test case must specify a valid vars.case name.' };
    const worker = fileURLToPath(new URL('./pi-plan-worker.ts', import.meta.url));
    return new Promise((resolve) => {
      const child = spawn('bun', [worker, name], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', (error) => resolve({ error: `Could not launch Pi plan worker: ${error.message}` }));
      child.on('close', (code) => {
        if (code !== 0) {
          resolve({ error: `Pi plan worker exited ${code}: ${stderr.trim()}` });
          return;
        }
        try {
          const result = JSON.parse(stdout) as PlanResult;
          if (!result.output || !result.artifactDir) throw new Error('Missing output or artifact directory.');
          resolve({ output: result.output, metadata: { artifactDir: result.artifactDir } });
        } catch (error) {
          resolve({
            error: `Invalid Pi plan worker output: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      });
    });
  }
}
