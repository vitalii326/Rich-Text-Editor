# Recruitler Rich Text Editor

A powerful, feature-rich Angular component for creating modern rich text editing experiences.

## Overview

This repository contains two main parts:
1. **Rich Text Editor (RTE) NPM Package**: A standalone Angular library for rich text editing (`@recruitler/rte`)
2. **Example Application**: A demo application showcasing the editor's capabilities and implementation examples

![Recruitler RTE Screenshot](./src/assets/rte-screenshot.png)

## Features

- **Modern Angular Integration**: Built for Angular 19+, with standalone components
- **Rich Formatting Options**: Bold, italic, underline, headings, lists, code blocks, and more
- **Hashtag Support**: Smart hashtag detection, autocompletion, and custom rendering
- **Image Upload**: Built-in image handling with upload progress indicators
- **Emoji Support**: Integrated emoji picker
- **Custom Components**: Ability to embed custom Angular components within the editor
- **Accessible**: Built with accessibility in mind
- **Customizable Toolbar**: Flexible toolbar configuration
- **Control Value Accessor**: Seamless integration with Angular forms
- **Suggestions/Mentions**: Smart suggestion system for hashtags and mentions

## Getting Started

### Installation

```bash
npm install @recruitler/rte --save
```

### Basic Implementation

```typescript
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CdkRichTextEditorComponent } from '@recruitler/rte';

@Component({
  selector: 'app-editor',
  template: `
    <recruitler-rte
      [formControl]="content"
      placeholder="Start typing..."
    ></recruitler-rte>
  `,
  imports: [ReactiveFormsModule, CdkRichTextEditorComponent],
})
export class EditorComponent {
  content = new FormControl('');
}
```

### Advanced Implementation

Check out the demo application in `src/app/demo-editor` for a comprehensive example of advanced features like:

- Custom hashtag handling
- Image upload integration
- Toolbar customization
- Custom component embedding

## Development

### Running the Demo App

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```
4. Navigate to `http://localhost:3333/`

### Building the Library

```bash
npm run build
```

### Publishing the Library

See `build&publish.txt` for detailed publishing instructions.

## Key Components

- `CdkRichTextEditorComponent`: The main editor component
- `CdkSuggestionComponent`: Manages suggestions/mentions dropdowns
- `CircularProgressComponent`: Loading indicator for image uploads

## Usage Notes

### Handling Hashtags

The RTE uses a special format for hashtags:
```
-##-{"id":"xxxx", "content":"existing"}-##-
```

For hashtags without database counterparts:
```
#nonexisting
```

### Angular '@' Symbol Handling

In Angular templates, the '@' character is used for control flow syntax. When displaying a literal '@' character in templates, use one of these methods:

1. Double curly braces with quotes: `{{ '@' }}`
2. HTML entity: `&#64;`

Example:
```html
<!-- Correct -->
<a href="/{{ '@' }}username">Profile</a>
<!-- or -->
<a href="/&#64;username">Profile</a>
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the terms found in the LICENSE file at the root of this repository.
