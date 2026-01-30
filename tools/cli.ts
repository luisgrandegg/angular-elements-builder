#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { discoverElements, generateElements, loadConfig } from "./lib/generator.js";
import { GeneratorError } from "./lib/errors.js";

const argv = await yargs(hideBin(process.argv))
  .scriptName("ng-elements-gen")
  .option("config", {
    alias: "c",
    type: "string",
    describe: "Path to generator config",
  })
  .option("outDir", {
    alias: "o",
    type: "string",
    describe: "Output directory for generated artifacts",
  })
  .option("tsconfig", {
    alias: "t",
    type: "string",
    describe: "Path to tsconfig.json",
  })
  .help()
  .parse();

try {
  if (argv.config) {
    const config = await loadConfig(path.resolve(argv.config));
    await generateElements({
      ...config,
      outDir: argv.outDir ?? config.outDir,
      tsconfig: argv.tsconfig ?? config.tsconfig,
    });
  } else {
    const elements = await discoverElements({ tsconfig: argv.tsconfig });
    await generateElements({
      elements,
      outDir: argv.outDir,
      tsconfig: argv.tsconfig,
    });
  }
} catch (error) {
  if (error instanceof GeneratorError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
