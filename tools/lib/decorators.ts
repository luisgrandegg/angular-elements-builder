/**
 * Marks an Angular component as a web component to be exported as an Angular Element.
 * Used at build time by the angular-elements-builder to discover components and generate
 * a browser bundle and type definitions.
 *
 * @param tag - The custom element tag name (e.g. "my-app-card"). Must be valid per
 *   Custom Element name rules (lowercase, contain a hyphen).
 * @returns A class decorator (no runtime behavior; discovery is done by the builder).
 */
export function RegisterWebComponent(_tag: string): ClassDecorator {
  return (target) => target;
}
