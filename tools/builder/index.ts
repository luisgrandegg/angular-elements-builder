import { readdir, rename } from "node:fs/promises";
import path from "node:path";
import type { BuilderContext, BuilderOutput, Target } from "@angular-devkit/architect";
import { createBuilder } from "@angular-devkit/architect";
import { discoverElements, generateElements, loadConfig } from "../lib/generator.js";
import type { BuildTargetSpec, ElementOutput, GeneratorConfig } from "../lib/types.js";

const BROWSER_ENTRY_FILENAME = "elements.browser.entry.ts";
const MAIN_JS_PREFIX = "main";
const MAIN_JS_SUFFIX = ".js";

/** outputHashing values passed to the Angular application build target. */
type OutputHashingOption = "none" | "all" | "media" | "bundles";

interface ElementsBuilderOptions {
  config?: string;
  tsconfig?: string;
  outDir?: string;
  elementOutputs?: ElementOutput[];
  /** When set, emit only the registration entry and run this target with entry point overridden. */
  buildTarget?: string | BuildTargetSpec;
  /** Source maps for the build. Default false; override in buildTargetOptions if needed. */
  sourceMap?: boolean;
  /** Output filename hashing (inherit from target config when not set). */
  outputHashing?: OutputHashingOption;
  /** Rename the main bundle to this filename after the build (e.g. "elements.js"). */
  outputFileName?: string;
  /** Optional overrides for the build target. Applied after sourceMap/outputHashing. */
  buildTargetOptions?: Record<string, unknown>;
}

function parseBuildTarget(value: string | BuildTargetSpec): BuildTargetSpec {
  if (typeof value !== "string") {
    return value;
  }
  const parts = value.split(":");
  if (parts.length < 2) {
    throw new Error(
      `Invalid buildTarget "${value}"; expected "project:target" or "project:target:configuration".`,
    );
  }
  return {
    project: parts[0],
    target: parts[1],
    ...(parts.length > 2 && { configuration: parts.slice(2).join(":") }),
  };
}

async function runBuilder(
  options: ElementsBuilderOptions,
  context: BuilderContext,
): Promise<BuilderOutput> {
  try {
    const buildTargetSpec = options.buildTarget ? parseBuildTarget(options.buildTarget) : undefined;
    const configPath = options.config ? resolveFromWorkspace(context, options.config) : undefined;
    const elementOutputs = configPath
      ? (options.elementOutputs ?? (await loadConfig(configPath)).elementOutputs ?? ["browser"])
      : (options.elementOutputs ?? ["browser"]);
    const wantsBrowserOutput = elementOutputs?.includes("browser") ?? true;
    if (wantsBrowserOutput && !buildTargetSpec) {
      throw new Error(
        'generate-elements: browser output requires buildTarget so the Angular build produces the bundle. Add buildTarget (e.g. "myApp:build") to your generate-elements options.',
      );
    }
    const shouldRunBuildTarget = Boolean(buildTargetSpec) && wantsBrowserOutput;

    let resolvedOutDir: string | undefined;

    // When using buildTarget, emit the browser entry under the project source root so it is part
    // of the TypeScript program; then the Angular build discovers and bundles component styles.
    let browserEntryOutDir: string | undefined;
    if (shouldRunBuildTarget && buildTargetSpec) {
      const metadata = await context.getProjectMetadata(buildTargetSpec.project);
      const sourceRoot = (metadata?.["sourceRoot"] as string) ?? "src";
      browserEntryOutDir = path.join(sourceRoot, "generated");
    }

    if (options.config) {
      const configPath = resolveFromWorkspace(context, options.config);
      const config = await loadConfig(configPath);
      resolvedOutDir = resolveOutDir(options, context, config);
      if (shouldRunBuildTarget && !resolvedOutDir) {
        throw new Error(
          "outDir is required when buildTarget is set. Configure it in angular.json under the generate-elements target options.",
        );
      }
      await generateElements({
        ...config,
        outDir: resolvedOutDir,
        tsconfig: resolveTsconfig(options, context, config),
        workspaceRoot: context.workspaceRoot,
        elementOutputs: options.elementOutputs ?? config.elementOutputs,
        buildTarget: buildTargetSpec,
        browserEntryOutDir,
      });
    } else {
      const tsconfig = resolveTsconfig(options, context);
      const elements = await discoverElements({ tsconfig });
      resolvedOutDir = resolveOutDir(options, context);
      if (shouldRunBuildTarget && !resolvedOutDir) {
        throw new Error(
          "outDir is required when buildTarget is set. Configure it in angular.json under the generate-elements target options.",
        );
      }
      await generateElements({
        elements,
        outDir: resolvedOutDir,
        tsconfig,
        workspaceRoot: context.workspaceRoot,
        elementOutputs: options.elementOutputs,
        buildTarget: buildTargetSpec,
        browserEntryOutDir,
      });
    }

    if (shouldRunBuildTarget && resolvedOutDir) {
      // Entry is under source root (e.g. src/generated/elements.browser.entry.ts) when browserEntryOutDir is set.
      const entryDir = browserEntryOutDir
        ? path.join(context.workspaceRoot, browserEntryOutDir)
        : resolvedOutDir;
      const entryPath = path.join(entryDir, BROWSER_ENTRY_FILENAME);
      const browserEntryRelative = path.relative(context.workspaceRoot, entryPath);
      const outputPathRelative = path.relative(context.workspaceRoot, resolvedOutDir);
      const target: Target = {
        project: buildTargetSpec!.project,
        target: buildTargetSpec!.target,
        ...(buildTargetSpec!.configuration && { configuration: buildTargetSpec!.configuration }),
      };
      const baseOverrides: Record<string, unknown> = {
        sourceMap: options.sourceMap ?? false,
      };
      if (options.outputHashing !== undefined) {
        baseOverrides.outputHashing = options.outputHashing;
      }
      const targetOverrides = {
        ...baseOverrides,
        ...(options.buildTargetOptions ?? {}),
        browser: browserEntryRelative,
        outputPath: { base: outputPathRelative, browser: "" },
        deleteOutputPath: false,
      };
      const run = await context.scheduleTarget(target, targetOverrides);
      const output = await run.result;
      if (!output.success || !resolvedOutDir) {
        return output;
      }
      if (options.outputFileName) {
        await renameMainBundle(resolvedOutDir, options.outputFileName, context);
      } else {
        context.logger.info(
          "Browser bundle emitted by Angular (main-*.js). Load with <script type=\"module\" src=\"main-*.js\">.",
        );
      }
      return output;
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.logger.error(message);
    return { success: false, error: message };
  }
}

/**
 * Renames the main browser bundle (main.js or main-*.js) to the given filename.
 * Also renames the corresponding .map file when present.
 */
async function renameMainBundle(
  outDir: string,
  outputFileName: string,
  context: BuilderContext,
): Promise<void> {
  const normalizedName = outputFileName.toLowerCase().endsWith(".js")
    ? outputFileName
    : `${outputFileName}.js`;
  const files = await readdir(outDir);
  const mainJs = files.find(
    (f) => f.startsWith(MAIN_JS_PREFIX) && f.endsWith(MAIN_JS_SUFFIX),
  );
  if (!mainJs) {
    context.logger.warn(`No main bundle (main.js or main-*.js) found in ${outDir}; skipping rename.`);
    return;
  }
  const mainPath = path.join(outDir, mainJs);
  const destPath = path.join(outDir, normalizedName);
  await rename(mainPath, destPath);
  const mapName = `${mainJs}.map`;
  if (files.includes(mapName)) {
    const mapPath = path.join(outDir, mapName);
    const destMapPath = path.join(outDir, `${normalizedName}.map`);
    await rename(mapPath, destMapPath);
  }
  context.logger.info(
    `Renamed main bundle to ${normalizedName}. Load with <script type="module" src="${normalizedName}">.`,
  );
}

function resolveFromWorkspace(context: BuilderContext, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(context.workspaceRoot, filePath);
}

function resolveOutDir(
  options: ElementsBuilderOptions,
  context: BuilderContext,
  config?: GeneratorConfig,
): string | undefined {
  const outDir = options.outDir ?? config?.outDir;
  if (!outDir) {
    return undefined;
  }
  return resolveFromWorkspace(context, outDir);
}

function resolveTsconfig(
  options: ElementsBuilderOptions,
  context: BuilderContext,
  config?: GeneratorConfig,
): string | undefined {
  const tsconfig = options.tsconfig ?? config?.tsconfig;
  if (!tsconfig) {
    return undefined;
  }
  return resolveFromWorkspace(context, tsconfig);
}

export default createBuilder(runBuilder);
