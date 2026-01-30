import type { ComponentMetadata, SignalMember } from "./types.js";

interface CustomElementsManifest {
  schemaVersion: string;
  readme: string;
  modules: Array<{
    kind: "javascript-module";
    path: string;
    declarations: Array<{
      kind: "class";
      name: string;
      tagName: string;
      customElement: true;
      members: Array<{
        kind: "field";
        name: string;
        type: { text: string };
      }>;
      events: Array<{
        name: string;
        type: { text: string };
      }>;
      attributes: Array<{
        name: string;
        type: { text: string };
      }>;
    }>;
  }>;
}

export function emitCustomElementsManifest(components: ComponentMetadata[]): CustomElementsManifest {
  return {
    schemaVersion: "1.0.0",
    readme: "",
    modules: components.map((component) => ({
      kind: "javascript-module" as const,
      path: component.filePath,
      declarations: [
        {
          kind: "class" as const,
          name: component.className,
          tagName: component.tag,
          customElement: true as const,
          members: component.members
            .filter((member) => member.kind === "input")
            .map((member) => ({
              kind: "field" as const,
              name: getMemberName(member),
              type: { text: member.typeText },
            })),
          events: component.members
            .filter((member) => member.kind === "output")
            .map((member) => ({
              name: getMemberName(member),
              type: { text: member.typeText },
            })),
          attributes: component.members
            .filter((member) => member.kind === "input")
            .map((member) => ({
              name: getMemberName(member),
              type: { text: member.typeText },
            })),
        },
      ],
    })),
  };
}

function getMemberName(member: SignalMember): string {
  return member.alias ?? member.name;
}
