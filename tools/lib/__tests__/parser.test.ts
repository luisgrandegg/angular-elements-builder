import { describe, expect, it } from "vitest";
import path from "node:path";
import { Project } from "ts-morph";
import { parseSignalMembers, resolveComponentClass } from "../parser.js";

const fixturePath = path.resolve(
  "tools/lib/__tests__/fixtures/sample.component.ts",
);

describe("parseSignalMembers", () => {
  it("extracts inputs and outputs with aliases and required flags", () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFileAtPath(fixturePath);

    const classDecl = resolveComponentClass(project, { className: "SampleComponent", filePath: fixturePath });
    const members = parseSignalMembers(classDecl);

    expect(members).toEqual([
      {
        name: "title",
        kind: "input",
        required: false,
        typeText: "string",
        alias: "heading",
      },
      {
        name: "count",
        kind: "input",
        required: true,
        typeText: "number",
      },
      {
        name: "active",
        kind: "input",
        required: false,
        typeText: "unknown",
      },
      {
        name: "updated",
        kind: "output",
        required: false,
        typeText: "Date",
      },
      {
        name: "renamed",
        kind: "output",
        required: false,
        typeText: "{ id: string }",
        alias: "renamed-event",
      },
    ]);
  });
});
