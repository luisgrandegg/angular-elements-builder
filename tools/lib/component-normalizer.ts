import { Project, SyntaxKind } from "ts-morph";

const JIT_DEFAULTS = [
  { name: "styles", initializer: "[]" },
  { name: "animations", initializer: "[]" },
  { name: "imports", initializer: "[]" },
  { name: "schemas", initializer: "[]" },
] as const;

/**
 * Ensures @Component decorators have JIT-safe defaults (styles, animations, imports, schemas)
 * so the JIT compiler never reads .length on undefined. Does not mutate existing properties.
 */
export function normalizeComponentSource(sourceText: string, filePath: string): string {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });

  for (const classDecl of sourceFile.getClasses()) {
    const decorator = classDecl.getDecorator("Component");
    if (!decorator) {
      continue;
    }

    const args = decorator.getArguments();
    if (args.length === 0) {
      continue;
    }

    const firstArg = args[0];
    if (firstArg.getKind() !== SyntaxKind.ObjectLiteralExpression) {
      continue;
    }

    const obj = firstArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

    for (const { name, initializer } of JIT_DEFAULTS) {
      const existing = obj.getProperty(name);
      if (!existing) {
        obj.addPropertyAssignment({ name, initializer });
      }
    }
  }

  return sourceFile.getFullText();
}
