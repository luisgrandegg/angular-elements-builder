import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Project, SyntaxKind, type Decorator } from "ts-morph";
import { GeneratorError } from "./errors.js";
import { parseComponentRef, parseSignalMembers, resolveComponentClass } from "./parser.js";
import {
  type ComponentMetadata,
  type GeneratorConfig,
  type NormalizedElementEntry,
} from "./types.js";
import { emitCustomElementsManifest } from "./manifest.js";
import { emitElementsRegistration } from "./elements-emitter.js";
import { emitTypeDeclarations } from "./types-emitter.js";

export async function generateElements(config: GeneratorConfig): Promise<void> {
  const normalized = normalizeElementsConfig(config.elements);
  const project = await createProject(config);
  const components = normalized.map((entry) => extractComponentMetadata(project, entry));

  const outDir = path.resolve(config.outDir ?? "dist");
  await mkdir(outDir, { recursive: true });

  const manifest = emitCustomElementsManifest(components);
  await writeFile(path.join(outDir, "custom-elements.json"), JSON.stringify(manifest, null, 2));

  const typings = emitTypeDeclarations(components);
  await writeFile(path.join(outDir, "elements.d.ts"), typings);

  const elementOutputs = config.elementOutputs ?? ["browser"];
  const useBuildTarget = Boolean(config.buildTarget);
  for (const output of elementOutputs) {
    if (output === "browser") {
      if (!useBuildTarget) {
        throw new GeneratorError(
          "Browser output requires buildTarget so the Angular build produces the bundle. Add buildTarget to your generate-elements options.",
        );
      }
      await emitBrowserEntryOnly(components, outDir, config);
    } else if (output === "typescript") {
      const tsCode = emitElementsRegistration(components, { mode: "typescript", outDir });
      await writeFile(path.join(outDir, "elements.ts"), tsCode);
    } else {
      throw new GeneratorError(`Unsupported element output type: ${output}`);
    }
  }
}

export async function discoverElements(
  config: Pick<GeneratorConfig, "tsconfig">,
): Promise<NormalizedElementEntry[]> {
  const project = await createProject({ elements: [], ...config });
  return discoverElementsFromProject(project);
}

export async function loadConfig(configPath: string): Promise<GeneratorConfig> {
  const absolutePath = path.resolve(configPath);
  const extension = path.extname(absolutePath);
  try {
    if (extension === ".json") {
      const contents = await importJson(absolutePath);
      return contents;
    }
    const imported = await import(pathToFileURL(absolutePath).href);
    return imported.default ?? imported;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GeneratorError(`Registry could not be parsed: ${message}`);
  }
}

function normalizeElementsConfig(elements: GeneratorConfig["elements"]): NormalizedElementEntry[] {
  if (Array.isArray(elements)) {
    const seen = new Set<string>();
    return elements.map((entry) => {
      if (seen.has(entry.tag)) {
        throw new GeneratorError(`Tag is duplicated: ${entry.tag}`);
      }
      seen.add(entry.tag);
      return entry;
    });
  }

  const entries = Object.entries(elements ?? {});
  return entries.map(([tag, component]) => ({ tag, component }));
}

function discoverElementsFromProject(project: Project): NormalizedElementEntry[] {
  const entries: NormalizedElementEntry[] = [];
  const seen = new Set<string>();

  for (const sourceFile of project.getSourceFiles()) {
    for (const classDecl of sourceFile.getClasses()) {
      const registerDecorator = classDecl.getDecorator("RegisterWebComponent");
      if (!registerDecorator) {
        continue;
      }

      const className = classDecl.getName();
      if (!className) {
        throw new GeneratorError(
          `RegisterWebComponent is applied to an unnamed class in ${sourceFile.getFilePath()}`,
        );
      }

      const tag = getTagFromRegisterDecorator(registerDecorator);
      if (!tag) {
        throw new GeneratorError(
          `RegisterWebComponent must provide a tag for ${className} in ${sourceFile.getFilePath()}`,
        );
      }
      if (seen.has(tag)) {
        throw new GeneratorError(`Tag is duplicated: ${tag}`);
      }
      seen.add(tag);

      entries.push({
        tag,
        component: `${sourceFile.getFilePath()}#${className}`,
      });
    }
  }

  return entries;
}

function getTagFromRegisterDecorator(decorator: Decorator): string | undefined {
  const args = decorator.getArguments();
  if (args.length === 0) {
    return undefined;
  }

  const first = args[0];
  if (
    first.isKind(SyntaxKind.StringLiteral) ||
    first.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  ) {
    return first.getLiteralText();
  }

  return undefined;
}

async function createProject(config: GeneratorConfig): Promise<Project> {
  const tsconfigPath = await resolveTsconfigPath(config);
  if (tsconfigPath) {
    return new Project({ tsConfigFilePath: tsconfigPath });
  }
  return new Project({ skipAddingFilesFromTsConfig: true });
}

async function resolveTsconfigPath(config: GeneratorConfig): Promise<string | undefined> {
  if (config.tsconfig) {
    return path.resolve(config.tsconfig);
  }
  const defaultPath = path.resolve("tsconfig.json");
  try {
    await access(defaultPath);
    return defaultPath;
  } catch {
    return undefined;
  }
}

function extractComponentMetadata(project: Project, entry: NormalizedElementEntry): ComponentMetadata {
  const componentRef = parseComponentRef(entry.component);
  const classDecl = resolveComponentClass(project, componentRef);
  const sourceFile = classDecl.getSourceFile();
  const members = parseSignalMembers(classDecl);

  return {
    tag: entry.tag,
    className: classDecl.getName() ?? componentRef.className,
    filePath: sourceFile.getFilePath(),
    members,
  };
}

async function importJson(filePath: string): Promise<GeneratorConfig> {
  const data = await import(pathToFileURL(filePath).href, { with: { type: "json" } }, );
  return data.default ?? data;
}

/** Emit only the browser entry .ts file (no esbuild). Used when buildTarget is set. */
async function emitBrowserEntryOnly(
  components: ComponentMetadata[],
  outDir: string,
  config: GeneratorConfig,
): Promise<void> {
  // When browserEntryOutDir is set, emit under the project source root so the entry is part of the
  // TypeScript program and the Angular build discovers component styles from the entry's dependency tree.
  const entryDir =
    config.browserEntryOutDir != null
      ? path.isAbsolute(config.browserEntryOutDir)
        ? config.browserEntryOutDir
        : path.resolve(config.workspaceRoot ?? process.cwd(), config.browserEntryOutDir)
      : outDir;
  await mkdir(entryDir, { recursive: true });
  const entryPath = path.join(entryDir, "elements.browser.entry.ts");
  // Omit import extension so the Angular/TS build accepts the entry (TS5097: no .ts in imports).
  const entryCode = emitElementsRegistration(components, {
    mode: "browser",
    outDir: entryDir,
    inlineComponents: true,
  });
  await writeFile(entryPath, entryCode);
}
