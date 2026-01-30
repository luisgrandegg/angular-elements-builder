import { Project, SyntaxKind, type ClassDeclaration, type CallExpression } from "ts-morph";
import { GeneratorError } from "./errors.js";
import type { ComponentRef, SignalMember } from "./types.js";

export function parseComponentRef(component: string): ComponentRef {
  const [filePath, className] = component.split("#");

  if (!className && filePath) {
    return { className: filePath };
  }
  if (!filePath || !className) {
    throw new GeneratorError(`Component reference could not be parsed: ${component}`);
  }
  return { filePath, className };
}

export function resolveComponentClass(project: Project, ref: ComponentRef): ClassDeclaration {
  if (ref.filePath) {
    const sourceFile = project.addSourceFileAtPathIfExists(ref.filePath);
    if (!sourceFile) {
      throw new GeneratorError(`Component source file not found: ${ref.filePath}`);
    }
    const classDecl = sourceFile.getClass(ref.className);
    if (!classDecl) {
      throw new GeneratorError(`Component symbol cannot be resolved to class: ${ref.className}`);
    }
    return classDecl;
  }

  const matches = project
    .getSourceFiles()
    .flatMap((file) => file.getClasses().filter((klass) => klass.getName() === ref.className));

  if (matches.length !== 1) {
    throw new GeneratorError(`Component symbol cannot be resolved to class: ${ref.className}`);
  }

  return matches[0];
}

export function parseSignalMembers(classDecl: ClassDeclaration): SignalMember[] {
  return classDecl
    .getProperties()
    .map((property) => {
      const initializer = property.getInitializerIfKind(SyntaxKind.CallExpression);
      if (!initializer) {
        return null;
      }

      const callExpression = initializer as CallExpression;
      const expression = callExpression.getExpression();
      const typeText = getMemberTypeText(property, callExpression);
      const alias = getAliasFromArguments(callExpression);

      if (expression.getKind() === SyntaxKind.Identifier) {
        const identifier = expression.getText();
        if (identifier === "input") {
          const base: Partial<SignalMember> = {
            name: property.getName(),
            kind: "input",
            required: false,
            typeText,
          };

          if (alias) {
            base.alias = alias;
          }

          return base;
        }
        if (identifier === "output") {
          const base: Partial<SignalMember> = {
            name: property.getName(),
            kind: "output",
            required: false,
            typeText,
          };

          if (alias) {
            base.alias = alias;
          }

          return base;
        }
      }

      if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
        const propertyAccess = expression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        const leftText = propertyAccess.getExpression().getText();
        const rightText = propertyAccess.getName();
        if (leftText === "input" && rightText === "required") {
          const base: Partial<SignalMember> = {
            name: property.getName(),
            kind: "input",
            required: true,
            typeText,
          };

          if (alias) {
            base.alias = alias;
          }

          return base;
        }
      }

      return null;
    })
    .filter((member): member is SignalMember => member !== null);
}

function getMemberTypeText(
  property: { getType: () => any; getTypeNode: () => { getText: () => string } | undefined },
  callExpression: CallExpression,
): string {
  const typeArguments = callExpression.getTypeArguments();
  if (typeArguments.length > 0) {
    return typeArguments[0].getText();
  }

  const declaredTypeNode = property.getTypeNode();
  if (declaredTypeNode) {
    return declaredTypeNode.getText();
  }

  const type = property.getType();
  const typeText = type.getText();
  if (isSignalUnknownType(typeText)) {
    return "unknown";
  }
  if (typeText && typeText !== "any") {
    return typeText;
  }

  return "unknown";
}

function isSignalUnknownType(typeText: string): boolean {
  return (
    typeText.includes("InputSignal<unknown>") ||
    typeText.includes("OutputEmitterRef<unknown>")
  );
}

function getAliasFromArguments(callExpression: CallExpression): string | undefined {
  const args = callExpression.getArguments().slice(0, 2);
  for (const arg of args) {
    if (arg.getKind() !== SyntaxKind.ObjectLiteralExpression) {
      continue;
    }
    const aliasProperty = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperty("alias");
    if (!aliasProperty || !aliasProperty.isKind(SyntaxKind.PropertyAssignment)) {
      continue;
    }
    const initializer = aliasProperty.getInitializer();
    if (initializer && initializer.isKind(SyntaxKind.StringLiteral)) {
      return initializer.getLiteralText();
    }
  }
  return undefined;
}
