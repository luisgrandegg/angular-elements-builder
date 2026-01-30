import type { ComponentMetadata, SignalMember } from "./types.js";

export function emitTypeDeclarations(components: ComponentMetadata[]): string {
  const lines: string[] = [];

  lines.push("export {};");
  lines.push("");

  for (const component of components) {
    const elementName = toPascalCase(component.tag) + "Element";
    const propsName = toPascalCase(component.tag) + "Props";

    lines.push(`export interface ${elementName} extends HTMLElement {}`);
    lines.push(`export interface ${propsName} {`);

    for (const member of component.members) {
      if (member.kind === "input") {
        const propName = member.alias ?? member.name;
        const optionalFlag = member.required ? "" : "?";
        lines.push(`  ${propName}${optionalFlag}: ${member.typeText};`);
      }
    }

    for (const member of component.members) {
      if (member.kind === "output") {
        const eventName = member.alias ?? member.name;
        const handlerName = `on${toPascalCase(eventName)}`;
        lines.push(
          `  ${handlerName}?: (e: CustomEvent<${member.typeText}>) => void;`,
        );
      }
    }

    lines.push("}");
    lines.push("");
    lines.push("declare global {");
    lines.push("  interface HTMLElementTagNameMap {");
    lines.push(`    \"${component.tag}\": ${elementName};`);
    lines.push("  }");
    lines.push("");
    lines.push("  namespace JSX {");
    lines.push("    interface IntrinsicElements {");
    lines.push(`      \"${component.tag}\": ${propsName};`);
    lines.push("    }");
    lines.push("  }");
    lines.push("}");
    lines.push("");
  }

  return lines.join("\n");
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}
