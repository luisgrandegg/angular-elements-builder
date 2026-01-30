import { Component, input, output } from "@angular/core";

@Component({
  selector: "app-sample",
  template: "<div></div>",
})
export class SampleComponent {
  title = input<string>(undefined, { alias: "heading" });
  count = input.required<number>();
  active = input();
  updated = output<Date>();
  renamed = output<{ id: string }>({ alias: "renamed-event" });
}
