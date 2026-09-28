import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, join, relative, resolve } from 'node:path';

interface EvalCase {
  name: string;
  fixture: string;
  timeoutSeconds: number;
  steps: Array<{ name: string; prompt: string }>;
}

interface ReviewEvidence {
  step: string;
  status: string;
  text: string;
}

const root = resolve(import.meta.dir, '..');
const casesDir = join(import.meta.dir, 'cases');
const outputDir = join(root, '.tmp', 'evals');
const skill = join(root, 'packages/pi/skills/plan/SKILL.md');
const reviewer = join(root, 'packages/pi/agents/diffpi-plan-reviewer.md');

async function loadCase(name: string): Promise<EvalCase> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error(`Invalid eval name: ${name}`);
  let entry: EvalCase;
  try {
    entry = JSON.parse(await readFile(join(casesDir, `${name}.json`), 'utf8')) as EvalCase;
  } catch (error) {
    throw new Error(`Eval case ${name} is missing or invalid JSON.`, { cause: error });
  }
  if (
    entry.name !== name ||
    !/^[a-z0-9-]+$/.test(entry.fixture) ||
    !Number.isSafeInteger(entry.timeoutSeconds) ||
    entry.timeoutSeconds < 30 ||
    !Array.isArray(entry.steps) ||
    entry.steps.length !== 2 ||
    entry.steps[0]?.name !== 'new' ||
    entry.steps[1]?.name !== 'update' ||
    !entry.steps.every((step) => step.prompt.startsWith('/skill:plan '))
  ) {
    throw new Error(`Invalid eval case: ${name}`);
  }
  await stat(join(import.meta.dir, 'fixtures', entry.fixture, 'package.json'));
  await stat(join(casesDir, `${name}.yaml`));
  return entry;
}

function git(cwd: string, ...args: string[]): string {
  const call = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (call.status !== 0) throw new Error(`git ${args.join(' ')}: ${call.stderr}`);
  return call.stdout;
}

async function snapshot(
  project: string,
  step: string,
  reviews: ReviewEvidence[],
  toolEvents: Array<{ step: string; tool: string }>,
): Promise<string> {
  const planRoot = join(project, '.diffpi', 'plan');
  const files: string[] = [];
  async function visit(dir: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(path);
    }
  }
  try {
    await visit(planRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const blocks = [
    `# ${step}: observed Pi plan output`,
    'Paths below are relative to the fixture project. The exact directory layout and filenames are evidence, not instructions.',
    `## Git changes\n\n\`\`\`text\n${git(project, 'status', '--short', '--untracked-files=all') || '(none)'}\`\`\``,
    `## Plan file inventory\n\n${files.map((file) => `- ${relative(project, file)}`).join('\n') || '(none)'}`,
  ];
  for (const file of files) {
    blocks.push(`## File: ${relative(project, file)}\n\n\`\`\`markdown\n${await readFile(file, 'utf8')}\n\`\`\``);
  }
  blocks.push(
    `## Ordered tool events\n\n${JSON.stringify(
      toolEvents.filter((item) => item.step === step),
      null,
      2,
    )}`,
  );
  blocks.push(
    `## Plan Reviewer runtime evidence\n\n${JSON.stringify(
      reviews.filter((item) => item.step === step),
      null,
      2,
    )}`,
  );
  return blocks.join('\n\n');
}

async function run(entry: EvalCase, dryRun: boolean): Promise<void> {
  const originalAgentDir = getAgentDir();
  const subagents = join(originalAgentDir, 'npm/node_modules/@tintinweb/pi-subagents/src/index.ts');
  const plugin = join(root, 'packages/pi/extensions/index.ts');
  for (const path of [subagents, plugin, skill, reviewer]) await stat(path);
  if (dryRun) {
    console.log(`${entry.name}: ready (${entry.steps.map((step) => step.name).join(' → ')}); no model calls`);
    return;
  }

  await mkdir(outputDir, { recursive: true });
  const runDir = await mkdtemp(join(outputDir, `${entry.name}-`));
  const project = join(runDir, 'project');
  const agentDir = join(runDir, 'agent');
  await cp(join(import.meta.dir, 'fixtures', entry.fixture), project, { recursive: true });
  git(project, 'init', '-q');
  git(project, 'add', '-A');
  git(project, '-c', 'user.name=Pi Eval', '-c', 'user.email=eval@example.invalid', 'commit', '-qm', 'fixture');
  await mkdir(join(agentDir, 'agents'), { recursive: true, mode: 0o700 });
  for (const name of (await readdir(join(root, 'packages/pi/agents'))).filter((file) => file.endsWith('.md'))) {
    await symlink(join(root, 'packages/pi/agents', name), join(agentDir, 'agents', name));
  }
  try {
    await copyFile(join(originalAgentDir, 'auth.json'), join(agentDir, 'auth.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await writeFile(
    join(agentDir, 'settings.json'),
    JSON.stringify({ packages: [], extensions: [plugin, subagents], skills: [skill], enableSkillCommands: true }),
  );
  await writeFile(join(agentDir, 'subagents.json'), JSON.stringify({ maxSubagentDepth: 3, strictAgentFiles: true }));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.PI_CODING_AGENT_SESSION_DIR = join(runDir, 'sessions');
  process.env.PI_OFFLINE = '1';
  const settingsManager = SettingsManager.inMemory({ enableSkillCommands: true, compaction: { enabled: false } });
  settingsManager.setProjectTrusted(false);
  const loader = new DefaultResourceLoader({
    cwd: project,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [plugin, subagents],
    additionalSkillPaths: [skill],
    skillsOverride: (loaded) => ({ ...loaded, skills: loaded.skills.filter((item) => item.filePath === skill) }),
    noContextFiles: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  const reviews: ReviewEvidence[] = [];
  const toolEvents: Array<{ step: string; tool: string }> = [];
  let currentStep = '';
  try {
    await loader.reload();
    if (!loader.getSkills().skills.some((item) => item.name === 'plan')) throw new Error('Plan skill not discovered.');
    const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json') });
    const model = modelRuntime.getModel('openai-codex', 'gpt-5.6-sol');
    if (!model) throw new Error('Required openai-codex/gpt-5.6-sol model unavailable.');
    const created = await createAgentSession({
      cwd: project,
      agentDir,
      model,
      thinkingLevel: 'high',
      modelRuntime,
      resourceLoader: loader,
      settingsManager,
      sessionManager: SessionManager.inMemory(project),
      tools: [
        'read',
        'grep',
        'find',
        'bash',
        'write',
        'edit',
        'Agent',
        'get_subagent_result',
        'steer_subagent',
        'diffpi_modes_set',
        'diffpi_modes_status',
        'plan_verify',
      ],
    });
    if (created.extensionsResult.errors.length)
      throw new Error(`Extension load errors: ${JSON.stringify(created.extensionsResult.errors)}`);
    session = created.session;
    session.subscribe((event) => {
      if (event.type !== 'tool_execution_end') return;
      toolEvents.push({ step: currentStep, tool: event.toolName });
      if (event.toolName !== 'Agent') return;
      const details = event.result.details as { subagentType?: string; status?: string } | undefined;
      if (details?.subagentType !== 'diffpi-plan-reviewer') return;
      const parts = event.result.content as Array<{ type: string; text?: string }>;
      reviews.push({
        step: currentStep,
        status: details.status ?? 'unknown',
        text: parts.flatMap((part) => (part.type === 'text' ? [part.text ?? ''] : [])).join('\n'),
      });
    });
    for (const step of entry.steps) {
      currentStep = step.name;
      console.log(`${entry.name}: ${step.name} started`);
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        void session?.abort();
      }, entry.timeoutSeconds * 1000);
      let accepted = false;
      try {
        await session.prompt(step.prompt, {
          preflightResult: (result) => {
            accepted = result;
          },
        });
      } finally {
        clearTimeout(timer);
        const artifact = join(runDir, `${step.name}.md`);
        const current = await snapshot(project, step.name, reviews, toolEvents);
        const baseline =
          step.name === 'update'
            ? `\n\n# Baseline before update (for ID/order comparison only)\n\n${await readFile(join(runDir, 'new.md'), 'utf8')}`
            : '';
        await writeFile(artifact, current + baseline);
        console.log(`${step.name} artifact: ${artifact}`);
      }
      if (expired)
        throw new Error(`${step.name}: exceeded ${entry.timeoutSeconds}s (artifacts preserved at ${runDir})`);
      if (!accepted) throw new Error(`${step.name}: Pi rejected the skill command (artifacts at ${runDir})`);
    }
    await writeFile(join(runDir, 'reviews.json'), JSON.stringify(reviews, null, 2));
  } catch (error) {
    await writeFile(join(runDir, 'generation-error.txt'), String(error));
    throw error;
  } finally {
    session?.dispose();
    await rm(agentDir, { recursive: true, force: true }); // Never retain copied credentials in artifacts.
    delete process.env.PI_CODING_AGENT_DIR;
    delete process.env.PI_CODING_AGENT_SESSION_DIR;
    delete process.env.PI_OFFLINE;
  }

  const resultPath = join(runDir, 'promptfoo.json');
  const judgeAgentDir = join(runDir, 'judge-agent');
  await mkdir(judgeAgentDir, { recursive: true, mode: 0o700 });
  let evaluation: ReturnType<typeof spawnSync>;
  try {
    await copyFile(join(originalAgentDir, 'auth.json'), join(judgeAgentDir, 'auth.json'));
    evaluation = spawnSync(
      join(root, 'node_modules/.bin/promptfoo'),
      ['eval', '-c', join(casesDir, `${entry.name}.yaml`), '-o', resultPath, '--no-cache', '--no-share'],
      {
        cwd: root,
        env: {
          ...process.env,
          PI_EVAL_NEW_ARTIFACT: join(runDir, 'new.md'),
          PI_EVAL_UPDATE_ARTIFACT: join(runDir, 'update.md'),
          PI_EVAL_JUDGE_AGENT_DIR: judgeAgentDir,
          PI_OFFLINE: '1',
        },
        encoding: 'utf8',
        timeout: 900_000,
        maxBuffer: 2_000_000,
      },
    );
  } finally {
    await rm(judgeAgentDir, { recursive: true, force: true }); // Never retain judge credentials in artifacts.
  }
  await writeFile(join(runDir, 'promptfoo.log'), [evaluation.stdout, evaluation.stderr].join('\n'));
  console.log(`Promptfoo exit=${evaluation.status}; results: ${resultPath}; log: ${join(runDir, 'promptfoo.log')}`);
  try {
    const result = JSON.parse(await readFile(resultPath, 'utf8')) as {
      results?: {
        results?: Array<{
          testCase?: { description?: string };
          gradingResult?: {
            pass?: boolean;
            score?: number;
            reason?: string;
            componentResults?: Array<{ reason?: string }>;
          };
        }>;
      };
    };
    const grades = (result.results?.results ?? []).map((item) => ({
      case: item.testCase?.description,
      pass: item.gradingResult?.pass,
      score: item.gradingResult?.score,
      reason: item.gradingResult?.componentResults?.[0]?.reason ?? item.gradingResult?.reason,
    }));
    await writeFile(join(runDir, 'verdicts.json'), JSON.stringify(grades, null, 2));
    for (const grade of grades) console.log(`${grade.case}: pass=${grade.pass} score=${grade.score}; ${grade.reason}`);
  } catch (error) {
    console.error(`No readable Promptfoo verdicts: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (evaluation.status !== 0) {
    process.exitCode = 1;
    if (evaluation.error) console.error(evaluation.error.message);
  }
}

const command = process.argv[2] ?? 'list';
if (command === 'list') {
  for (const file of (await readdir(casesDir)).filter((name) => name.endsWith('.json')).sort())
    console.log(basename(file, '.json'));
} else if (command === 'show') {
  try {
    const name = process.argv[3] ?? '';
    await loadCase(name);
    for (const path of [join(casesDir, `${name}.json`), join(casesDir, `${name}.yaml`)]) {
      console.log(`\n# ${relative(root, path)}\n${await readFile(path, 'utf8')}`);
    }
  } catch (error) {
    console.error(`FAIL show: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
} else {
  try {
    await run(await loadCase(command), process.argv.includes('--dry-run'));
  } catch (error) {
    console.error(`FAIL ${command}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
