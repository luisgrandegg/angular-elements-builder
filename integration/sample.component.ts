import { Component, input, output } from "@angular/core";
import { RegisterWebComponent } from "../lib/lib/decorators";
@RegisterWebComponent()
@Component({
  selector: "app-sample",
  template: "<div></div>",
})
export default class SampleComponent {
  title = input<string>(undefined, { alias: "heading" });
  count = input.required<number>();
  active = input();
  updated = output<Date>();
  renamed = output<{ id: string }>({ alias: "renamed-event" });
}
