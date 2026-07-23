#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { loadConfig, ensureDefaultConfig } from './config/loader.js';
import { Orchestrator } from './pipeline/orchestrator.js';

interface GlobalOpts {
  config: string;
  profile?: string;
}

function loadConfigWithOverride(opts: GlobalOpts) {
  const config = loadConfig(opts.config);
  if (opts.profile === 'fiction' || opts.profile === 'nonfiction') {
    config.profile = opts.profile;
  }
  return config;
}

const program = new Command();
program
  .name('loop')
  .description('Loop: a long-form book translation pipeline')
  .version('1.0.0')
  .option('-c, --config <path>', 'Config file path', 'config.yaml')
  .option('--profile <type>', 'Translation profile: fiction | nonfiction');

function createProgress(labelPrefix = ''): (done: number, total: number, label: string) => void {
  return (done, total, label) => {
    if (total === 0) {
      process.stdout.write(`\r${labelPrefix}${label}`);
    } else {
      const pct = Math.round((done / total) * 100);
      process.stdout.write(`\r${labelPrefix}${label} [${done}/${total} ${pct}%]`);
    }
  };
}

program
  .command('prepare <input>')
  .description('Parse input and initialize translation state')
  .action(async (input: string) => {
    const opts = program.opts<GlobalOpts>();
    const config = loadConfigWithOverride(opts);
    const orch = new Orchestrator(config);
    const store = await orch.prepare(path.resolve(input), createProgress());
    console.log(`\n初始化完成：${store.runDir}`);
  });

program
  .command('translate <input>')
  .description('Translate the book')
  .option('--bilingual', 'Also produce bilingual output')
  .option('--no-mono', 'Skip monolingual output')
  .action(async (input: string, options: { bilingual?: boolean; mono?: boolean }) => {
    const opts = program.opts<GlobalOpts>();
    const config = loadConfigWithOverride(opts);
    if (options.bilingual !== undefined) config.output.bilingual = options.bilingual;
    if (options.mono === false) config.output.mono = false;
    const orch = new Orchestrator(config);
    const store = await orch.translate(path.resolve(input), createProgress());
    console.log('\n翻译完成，正在组装输出…');
    const files = orch.assemble(path.resolve(input));
    for (const f of files) console.log(`  ${f}`);
  });

program
  .command('review <input>')
  .description('Run final review on completed translation')
  .option('--force', 'Re-review already reviewed chapters')
  .option('--fix', 'Auto-fix severe issues')
  .action(async (input: string, options: { force?: boolean; fix?: boolean }) => {
    const opts = program.opts<GlobalOpts>();
    const config = loadConfigWithOverride(opts);
    const orch = new Orchestrator(config);
    await orch.review(path.resolve(input), {
      force: options.force,
      autofix: options.fix,
      progress: createProgress(),
    });
    console.log('\n审校完成。');
  });

program
  .command('assemble <input>')
  .description('Assemble output files from state')
  .option('-o, --out-dir <dir>', 'Output directory')
  .action(async (input: string, options: { outDir?: string }) => {
    const opts = program.opts<GlobalOpts>();
    const config = loadConfigWithOverride(opts);
    const orch = new Orchestrator(config);
    const files = orch.assemble(path.resolve(input), options.outDir ? path.resolve(options.outDir) : undefined);
    console.log('输出文件：');
    for (const f of files) console.log(`  ${f}`);
  });

program
  .command('status <input>')
  .description('Show translation status')
  .action((input: string) => {
    const opts = program.opts<GlobalOpts>();
    const config = loadConfigWithOverride(opts);
    const orch = new Orchestrator(config);
    orch.status(path.resolve(input));
  });

program
  .command('init')
  .description('Create default config.yaml')
  .action(() => {
    const opts = program.opts<GlobalOpts>();
    const created = ensureDefaultConfig(opts.config);
    console.log(created ? `已创建 ${opts.config}` : `${opts.config} 已存在`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
