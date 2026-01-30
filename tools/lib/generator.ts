import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import { GeneratorError } from "./errors.js";
import { parseComponentRef, parseSignalMembers, resolveComponentClass } from "./parser.js";
import {
  type ComponentMetadata,
  type GeneratorConfig,
  type NormalizedElementEntry,
} from "./types.js";
import { emitCustomElementsManifest } from "./manifest.js";
import { emitTypeDeclarations } from "./types-emitter.js";

export async function generateElements(config: GeneratorConfig): Promise<void> {
  const normalized = normalizeElementsConfig(config.elements);
  const project = await createProject(config);
  const components = normalized.map((entry) => extractComponentMetadata(project, entry));

  const outDir = config.outDir ?? "dist";
  await mkdir(outDir, { recursive: true });

  const manifest = emitCustomElementsManifest(components);
  await writeFile(path.join(outDir, "custom-elements.json"), JSON.stringify(manifest, null, 2));

  const typings = emitTypeDeclarations(components);
  await writeFile(path.join(outDir, "custom-elements.d.ts"), typings);
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
  const data = await import(pathToFileURL(filePath).href, { assert: { type: "json" } } as any);
  return data.default ?? data;
}
