export type SignalKind = "input" | "output";

export interface SignalMember {
  name: string;
  kind: SignalKind;
  required: boolean;
  typeText: string;
  alias?: string;
}

export interface ComponentMetadata {
  tag: string;
  className: string;
  filePath: string;
  members: SignalMember[];
}

export type ElementsConfig = Record<string, string> | Array<{ tag: string; component: string }>;
export type ElementOutput = "browser" | "typescript";

/** Target to run for bundling (consumer's build) when buildTarget is used. */
export interface BuildTargetSpec {
  project: string;
  target: string;
  configuration?: string;
}

export interface GeneratorConfig {
  elements: ElementsConfig;
  tsconfig?: string;
  outDir?: string;
  rootDir?: string;
  /** Root directory for resolving node_modules when bundling (e.g. workspace root). */
  workspaceRoot?: string;
  elementOutputs?: ElementOutput[];
  /** When set, only the registration entry file is emitted for browser output; the consumer's build does the bundling. */
  buildTarget?: BuildTargetSpec;
  /**
   * When set with buildTarget, the browser entry file is emitted here instead of outDir.
   * Use a path under the project's source root (e.g. "src/generated") so the entry is part of the
   * TypeScript program; then the Angular build will discover and bundle component styles correctly.
   */
  browserEntryOutDir?: string;
}

export interface NormalizedElementEntry {
  tag: string;
  component: string;
}

export interface ComponentRef {
  className: string;
  filePath?: string;
}
