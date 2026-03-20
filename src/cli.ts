#!/usr/bin/env node
import { DownloadWorker } from "./worker.js";
import { defaultProgressPrinter } from "./progress.js";

interface CliArgs {
  url: string;
  paths: string;
  outtmpl: string;
  all: boolean;
  headful: boolean;
  unlock: boolean;
  timeout: number;
  retries: number;
  outputFile: string;
  writeJson: boolean;
  noPretty: boolean;
  noPrintJson: boolean;
  quiet: boolean;
  stdin: boolean;
  help: boolean;
}

function usage(): void {
  console.log(`Usage: lazy-down [url] [options]\n
Options:
  -P, --paths <dir>          Output directory (default: assets/cache)
  -o, --outtmpl <template>   Output template (default: %(title)s.%(ext)s)
  --all                      Download all medias
  --headful                  Run browser with UI
  --no-unlock                Disable unlock
  --timeout <sec>            Timeout in seconds (default: 60)
  --retries <n>              Max retries (default: 3)
  --output-file <prefix>     JSON output file prefix (default: lazy-downloaded)
  --write-json               Write JSON payload to file
  --no-pretty                Disable pretty JSON output in file
  --no-print-json            Disable printing JSON payload
  --quiet                    Disable progress output
  --stdin                    Read URLs from stdin (one per line)
  -h, --help                 Show help
`);
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    url: "",
    paths: "assets/cache",
    outtmpl: "%(title)s.%(ext)s",
    all: false,
    headful: false,
    unlock: true,
    timeout: 60,
    retries: 3,
    outputFile: "lazy-downloaded",
    writeJson: false,
    noPretty: false,
    noPrintJson: false,
    quiet: false,
    stdin: false,
    help: false
  };

  const args = [...argv];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const need = (): string => {
      i += 1;
      if (i >= args.length) throw new Error(`Missing value for ${a}`);
      return args[i];
    };

    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "-P" || a === "--paths") out.paths = need();
    else if (a === "-o" || a === "--outtmpl") out.outtmpl = need();
    else if (a === "--all") out.all = true;
    else if (a === "--headful") out.headful = true;
    else if (a === "--no-unlock") out.unlock = false;
    else if (a === "--timeout") out.timeout = Number(need()) || out.timeout;
    else if (a === "--retries") out.retries = Number(need()) || out.retries;
    else if (a === "--output-file") out.outputFile = need();
    else if (a === "--write-json") out.writeJson = true;
    else if (a === "--no-pretty") out.noPretty = true;
    else if (a === "--no-print-json") out.noPrintJson = true;
    else if (a === "--quiet") out.quiet = true;
    else if (a === "--stdin") out.stdin = true;
    else if (!a.startsWith("-") && !out.url) out.url = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

async function readStdinLines(): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks)
    .toString("utf8")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function runOne(worker: DownloadWorker, u: string, args: CliArgs): Promise<number> {
  const r = await worker.download(u, args.paths, true);
  if (args.noPrintJson) {
    console.log(JSON.stringify({ paths: r.paths, timeMs: r.timeMs, jsonPath: r.jsonPath }));
  }
  return 0;
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e: any) {
    console.error(String(e?.message || e));
    usage();
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    usage();
    return;
  }

  const hooks = args.quiet ? [] : [defaultProgressPrinter()];
  const worker = new DownloadWorker({
    headful: args.headful,
    allMedias: args.all,
    unlock: args.unlock,
    timeoutSec: args.timeout,
    maxRetries: args.retries,
    outputFile: args.outputFile,
    writeJson: args.writeJson,
    jsonPretty: !args.noPretty,
    printJson: !args.noPrintJson,
    outtmpl: args.outtmpl,
    progressHooks: hooks
  });

  if (args.stdin) {
    const urls = await readStdinLines();
    let rc = 0;
    for (const u of urls) {
      try {
        await runOne(worker, u, args);
      } catch (e: any) {
        console.error(String(e?.message || e));
        rc = 2;
      }
    }
    process.exitCode = rc;
    return;
  }

  if (!args.url) {
    usage();
    process.exitCode = 1;
    return;
  }

  try {
    process.exitCode = await runOne(worker, args.url, args);
  } catch (e: any) {
    console.error(String(e?.message || e));
    process.exitCode = 2;
  }
}

main();
