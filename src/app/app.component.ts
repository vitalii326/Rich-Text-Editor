import { Component } from '@angular/core'
import { DemoEditorComponent } from './demo-editor/demo-editor.component'

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  imports: [DemoEditorComponent],
  standalone: true,
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'RTE'
}
