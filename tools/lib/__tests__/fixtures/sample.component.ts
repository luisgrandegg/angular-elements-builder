import { input, output } from "@angular/core";

export class SampleComponent {
  title = input<string>(undefined, { alias: "heading" });
  count = input.required<number>();
  active = input();
  updated = output<Date>();
  renamed = output<{ id: string }>({ alias: "renamed-event" });
}
