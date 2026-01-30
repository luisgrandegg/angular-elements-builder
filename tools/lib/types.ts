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

export interface GeneratorConfig {
  elements: ElementsConfig;
  tsconfig?: string;
  outDir?: string;
  rootDir?: string;
}

export interface NormalizedElementEntry {
  tag: string;
  component: string;
}

export interface ComponentRef {
  className: string;
  filePath?: string;
}
