import path from "node:path";
import type { ComponentMetadata, ElementOutput } from "./types.js";

interface ElementsEmitterOptions {
  mode: ElementOutput;
  outDir: string;
  importExtension?: string;
  /** When true, use static imports so the bundler emits a single file (no lazy chunks). */
  inlineComponents?: boolean;
}

export function emitElementsRegistration(
  components: ComponentMetadata[],
  options: ElementsEmitterOptions,
): string {
  const { mode, outDir, importExtension, inlineComponents } = options;
  const lines: string[] = [];

  lines.push("import \"@angular/compiler\";");
  lines.push("import { createApplication } from \"@angular/platform-browser\";");
  lines.push("import { createCustomElement } from \"@angular/elements\";");
  lines.push("");

  if (inlineComponents) {
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      const importPath = toModuleSpecifier(component.filePath, outDir, importExtension);
      const varName = `Component${i}`;
      lines.push(`import * as ${varName}Module from "${importPath}";`);
      lines.push(`const ${varName} = (${varName}Module as Record<string, unknown>)["${component.className}"];`);
    }
    lines.push("");
    lines.push("const elementDefinitions = [");
    for (let i = 0; i < components.length; i++) {
      lines.push(
        `  { tag: "${components[i].tag}", component: Component${i} },`,
      );
    }
    lines.push("];");
    lines.push("");
    lines.push("export async function registerElements() {");
    lines.push("  const app = await createApplication();");
    lines.push("  for (const def of elementDefinitions) {");
    lines.push("    if (customElements.get(def.tag)) {");
    lines.push("      continue;");
    lines.push("    }");
    lines.push("    const element = createCustomElement(def.component as import(\"@angular/core\").Type<unknown>, { injector: app.injector });");
    lines.push("    customElements.define(def.tag, element);");
    lines.push("  }");
    lines.push("}");
  } else {
    const entries = components.map((component, index) => {
      const importPath = toModuleSpecifier(component.filePath, outDir, importExtension);
      const loaderName = `loadComponent${index}`;
      lines.push(`const ${loaderName} = () => import("${importPath}");`);
      return {
        tag: component.tag,
        className: component.className,
        loaderName,
      };
    });

    lines.push("");
    lines.push("const elementDefinitions = [");
    for (const entry of entries) {
      lines.push(
        `  { tag: "${entry.tag}", className: "${entry.className}", load: ${entry.loaderName} },`,
      );
    }
    lines.push("];");
    lines.push("");
    lines.push("export async function registerElements() {");
    lines.push("  const app = await createApplication();");
    lines.push("  for (const def of elementDefinitions) {");
    lines.push("    if (customElements.get(def.tag)) {");
    lines.push("      continue;");
    lines.push("    }");
    lines.push("    const module = await def.load();");
    lines.push("    const component = module[def.className] ?? module.default;");
    lines.push("    if (!component) {");
    lines.push(
      "      throw new Error(`RegisterWebComponent: ${def.className} not found in module for ${def.tag}`);",
    );
    lines.push("    }");
    lines.push("    const element = createCustomElement(component, { injector: app.injector });");
    lines.push("    customElements.define(def.tag, element);");
    lines.push("  }");
    lines.push("}");
  }

  if (mode === "browser") {
    lines.push("");
    lines.push("var ngElementsReady = registerElements().catch(function (err) {");
    lines.push("  if (typeof console !== \"undefined\" && console.error) console.error(\"[angular-elements-builder] Registration failed:\", err);");
    lines.push("  throw err;");
    lines.push("});");
    lines.push("if (typeof window !== \"undefined\") (window as unknown as Record<string, unknown>)[\"ngElementsReady\"] = ngElementsReady;");
  }

  return lines.join("\n");
}

function toModuleSpecifier(
  filePath: string,
  outDir: string,
  importExtension?: string,
): string {
  let relativePath = path.relative(outDir, filePath);
  relativePath = relativePath.split(path.sep).join("/");
  relativePath = relativePath.replace(/\.[^/.]+$/, "");
  if (importExtension) {
    relativePath = `${relativePath}.${importExtension.replace(/^\./, "")}`;
  }
  if (!relativePath.startsWith(".")) {
    return `./${relativePath}`;
  }
  return relativePath;
}
