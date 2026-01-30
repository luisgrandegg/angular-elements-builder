export { discoverElements, generateElements, loadConfig } from "./lib/generator.js";
export { RegisterWebComponent } from "./lib/decorators.js";
export type { ElementOutput } from "./lib/types.js";
export { parseComponentRef, parseSignalMembers, resolveComponentClass } from "./lib/parser.js";
export { GeneratorError } from "./lib/errors.js";
export type { GeneratorConfig, SignalMember, ComponentMetadata } from "./lib/types.js";
