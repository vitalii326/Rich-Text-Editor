import { CommonModule } from "@angular/common";
import {
  AfterContentChecked,
  AfterViewInit,
  Component,
  ElementRef,
  EmbeddedViewRef,
  EventEmitter,
  Input,
  Output,
  TemplateRef,
  Type,
  ViewChild,
  ViewContainerRef,
  ViewEncapsulation,
  reflectComponentType,
} from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { PickerComponent } from "@ctrl/ngx-emoji-mart";
import { BehaviorSubject, take } from "rxjs";

import * as ace from "ace-builds";
import "ace-builds/src-noconflict/ace";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/theme-crimson_editor";
import "ace-builds/src-noconflict/theme-monokai";
import {
  CdkSuggestionItem,
  CdkSuggestionSetting,
  CdkToolbarItemSetting,
  IIMageRes,
  IImgInfo,
  IUploadReq,
  ToolbarItem,
} from "../interfaces";
import { SafeDOMPipe } from "../pipes/safe-dom.pipe";
import {
  focusElementWithRange,
  focusElementWithRangeIfNotFocused,
  getRangeFromPosition,
  isRectEmpty,
  makeLiveHashtags,
  makeLiveImagetags,
} from "../utils/DOM";
import {
  HASHTAG,
  HASHTAG_TRIGGER,
  IMGTAG,
  TOOLBAR_ITEMS,
} from "../utils/config";
import { loadImage } from "../utils/image";
import { CircularProgressComponent } from "./circular-progressive/circular-progressive.component";
import { CdkSuggestionComponent } from "./suggestion/suggestion.component";

@Component({
  selector: "recruitler-rte",
  templateUrl: "./rte.component.html",
  styleUrls: ["./rte.component.scss"],
  providers: [
    SafeDOMPipe,
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: CdkRichTextEditorComponent,
    },
  ],
  standalone: true,
  imports: [
    CdkSuggestionComponent,
    CircularProgressComponent,
    SafeDOMPipe,
    CommonModule,
    PickerComponent,
  ],
  encapsulation: ViewEncapsulation.None,
})
export class CdkRichTextEditorComponent
  implements ControlValueAccessor, AfterViewInit, AfterContentChecked
{
  @ViewChild("richText") richText!: ElementRef<HTMLElement>;
  @ViewChild("richText", { read: ViewContainerRef })
  richTextContainer!: ViewContainerRef;
  @ViewChild("quickToolbar") quickToolbarElement!: ElementRef<HTMLElement>;
  @ViewChild("suggestion") suggestion!: CdkSuggestionComponent;
  @ViewChild("defaultToolbar") defaultToolbar!: TemplateRef<any>;
  @ViewChild("fileInput", { static: false }) fileInput!: ElementRef;
  // INPUTS
  @Input("toolbarTemplate") toolbarTemplate!: TemplateRef<any>;
  @Input("cdkDefaultToolbarItems")
  defaultToolbarItems!: CdkToolbarItemSetting[];
  @Input("cdkSuggestions") suggestions: CdkSuggestionSetting[] = [];
  @Input("cdkSuggestionEnabled") suggestionEnabled: boolean = true;
  @Input("cdkContent") content: string = "";
  @Input("hashtagItemTemplate") hashtagItemTemplate!: TemplateRef<any>;
  @Input("hashtagTemplate") hashtagTemplate!: TemplateRef<any>;
  @Input() set hashtagResults(val: CdkSuggestionItem[]) {
    this._setHashtagResults(val);
  }
  @Input() set uploadImageResult(val: IIMageRes) {
    this._setImage(val);
  }
  @Input() disabled: boolean | string = false;
  @Input() placeholder: string = "";
  @Input() theme: "light-theme" | "dark-theme" = "light-theme";
  @Input() imgUrl!: string;
  @Input() imgAccountId?: string | null;
  @Input() variant?: string | null;
  // OUTPUTS
  @Output("uploadImageRequest") uploadImageRequest =
    new EventEmitter<IUploadReq>();
  @Output("cdkEditorSelectionChanged") selectionChanged =
    new EventEmitter<Selection>();
  @Output("hashtagRequest") hashtagRequest = new EventEmitter<string>();
  @Output() focus = new EventEmitter();
  @Output() blur = new EventEmitter();
  @Output("linkRequest") linkRequest = new EventEmitter<string[]>();
  @Output("count") count = new EventEmitter<number>();
  // vars
  touched = false;
  isSuggestionVisible: boolean = false;
  isUploading = false;
  toolbarItems: ToolbarItem[] = [];
  suggestionList$: BehaviorSubject<CdkSuggestionItem[]> = new BehaviorSubject<
    CdkSuggestionItem[]
  >([]);
  suggestionSelectionTemplate!: TemplateRef<any>;
  links: string[] = [];
  codeEditors: any = [];
  editorEdgeStatus: "top" | "in" | "bottom" | "empty" = "in"; // Code editor cursor stauts
  isVisibleEmojiModal: boolean = false;
  private savedSelection: Range | null = null;

  constructor(private domSantanizer: SafeDOMPipe) {
    this.toolbarItems = TOOLBAR_ITEMS.map((item) => ({
      action: item.action,
      icon: item.icon,
      active: false,
    })).filter((item) => item.action !== "component");
  }

  ngAfterViewInit() {
    this.richText.nativeElement.spellcheck = false;
    this.loadContent(this.content);
  }

  ngAfterContentChecked() {
    if (!this.toolbarTemplate) {
      this.toolbarTemplate = this.defaultToolbar;

      if (this.defaultToolbarItems) {
        this.toolbarItems = [];
        for (let item of this.defaultToolbarItems) {
          let itemConfig = TOOLBAR_ITEMS.filter(
            (config) => config.action == item.action
          );
          if (itemConfig.length == 1) {
            this.toolbarItems.push({
              action: item.action,
              icon: itemConfig[0].icon,
              active: false,
              payload: item?.payload,
            });
          }
        }
      }
    }
  }

  updateToolbar(): void {
    this.toolbarItems.forEach((item) => {
      item.active = this.isFormatActive(item.action);

      if (item.action == "image") item.active = false;
      if (item.action == "component") {
        if (item.payload) {
          const component: Type<Component> = item.payload;
          item.active = this.isComponentActive(component);
        }
      }
    });
  }

  toggleFormat(format: any): void {
    if (!this.isFormatActive(format)) {
      this.addFormat(format);
    } else {
      this.removeFormat(format);
    }

    this._contentChanged();
  }

  isFormatActive(format: any): boolean {
    const selection = document.getSelection();

    if (format == "heading1") {
      return this._isChildOfTag(selection?.anchorNode, "h1");
    }
    if (format == "heading2") {
      return this._isChildOfTag(selection?.anchorNode, "h2");
    }
    if (format == "heading3") {
      return this._isChildOfTag(selection?.anchorNode, "h3");
    }
    if (format == "heading4") {
      return this._isChildOfTag(selection?.anchorNode, "h4");
    }
    if (format == "heading5") {
      return this._isChildOfTag(selection?.anchorNode, "h5");
    }
    if (format == "quote") {
      return this._isChildOfTag(selection?.anchorNode, "blockquote");
    }
    if (format == "code") {
      return this._isInlineTag("code");
    }
    if (format == "link") {
      return this._isInlineTag("a");
    }
    if (format == "code") {
      return this._isInlineTag("code");
    }

    return document.queryCommandState(format);
  }

  addFormat(format: any, value?: string): void {
    switch (format) {
      case "heading1":
        document.execCommand("formatBlock", false, "h1");
        break;
      case "heading2":
        document.execCommand("formatBlock", false, "h2");
        break;
      case "heading3":
        document.execCommand("formatBlock", false, "h3");
        break;
      case "heading4":
        document.execCommand("formatBlock", false, "h4");
        break;
      case "heading5":
        document.execCommand("formatBlock", false, "h5");
        break;
      case "quote":
        document.execCommand("formatBlock", false, "blockquote");
        break;
      case "numbered-list":
        document.execCommand("insertUnorderedList");
        break;
      case "ordered-list":
        document.execCommand("insertOrderedList");
        break;
      case "link":
        const sText = window.document.getSelection()?.toString();
        document.execCommand("createLink", false, sText);
        this.linkOut();
        break;
      case "code":
        document.execCommand(
          "insertHTML",
          false,
          "<h1 id='codeTemp'>" + document.getSelection() + "</h1>"
        );
        const codeTag = document.getElementById("codeTemp");
        var newElement = document.createElement("code");
        if (codeTag) {
          newElement.innerHTML = codeTag.innerHTML;
          if (codeTag.parentNode)
            codeTag.parentNode.replaceChild(newElement, codeTag);
          this.formatCodeEditors();
        }

        break;
      default:
        document.execCommand(format);
        break;
    }
  }

  removeFormat(format: any): void {
    const selection = document.getSelection();

    switch (format) {
      case "heading1":
        selection?.anchorNode && this._untagParent(selection?.anchorNode, "h1");
        break;
      case "heading2":
        selection?.anchorNode && this._untagParent(selection?.anchorNode, "h2");
        break;
      case "heading3":
        selection?.anchorNode && this._untagParent(selection?.anchorNode, "h3");
        break;
      case "heading4":
        selection?.anchorNode && this._untagParent(selection?.anchorNode, "h4");
        break;
      case "heading5":
        selection?.anchorNode && this._untagParent(selection?.anchorNode, "h5");
        break;
      case "quote":
        selection?.anchorNode &&
          this._untagParent(selection?.anchorNode, "blockquote");
        break;
      case "code":
        this._removeInlineTag("code");
        break;
      case "bold":
      case "italic":
      case "underline":
        document.execCommand(format);
        break;
      default:
        document.execCommand("removeFormat", false);
        break;
    }
  }

  async insertImage(
    url: string
  ): Promise<{ id: string; elem?: HTMLImageElement }> {
    try {
      if (!url) {
        throw new Error("Invalid image resource data.");
      }

      // Check if the URL is valid (optional, depending on use case)
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to load image.");
      }

      let selection = window.getSelection();
      let id = "";
      let elem;
      if (selection && selection.rangeCount > 0) {
        elem = document.createElement("img");
        elem.id = `img-${Date.now()}`;
        elem.src = url;

        const range = selection.getRangeAt(0);
        range.insertNode(elem);

        this._contentChanged();
      }
      return { id, elem };
    } catch (error) {
      console.error("Error setting image:", error);
      this.isUploading = false;
      return { id: "", elem: undefined };
    }
  }

  toggleComponent(componentName: Type<Component>): void {
    if (!this.isComponentActive(componentName)) {
      this.insertComponent(componentName);
    } else {
      this.removeComponent(componentName);
    }
    this._contentChanged();
  }

  insertComponent(componentName: Type<Component>): void {
    const selection = window.getSelection();
    if (selection && selection.anchorNode) {
      const componentRef = this.richTextContainer.createComponent(
        componentName,
        {
          projectableNodes: [[selection.getRangeAt(0).extractContents()]],
        }
      );
      const range = selection.getRangeAt(0);
      range.insertNode(componentRef.location.nativeElement);
    }
  }

  removeComponent(componentName: Type<Component>): void {
    let selector = this._getSelectorName(componentName);
    let componentNode = selector
      ? this._findParentWithTag(this._getSelectedNode(), selector)
      : undefined;
    if (componentNode && componentNode instanceof HTMLElement) {
      let componentElement: HTMLElement = componentNode;
      const cdkContents = componentElement
        .querySelector("[cdkContent]")
        ?.cloneNode(true);
      if (cdkContents)
        componentElement.replaceWith(...Array.from(cdkContents.childNodes));
      else componentElement.remove();
    }
  }

  isComponentActive(componentName: Type<Component>): boolean {
    let selectorName = this._getSelectorName(componentName);
    return selectorName
      ? this._isChildOfTag(this._getSelectedNode(), selectorName)
      : false;
  }

  _handleCodeBlock = (event: InputEvent): boolean => {
    if (event.data != "`") {
      return false;
    }
    const selection = window.getSelection();
    if (!selection) {
      return false;
    }
    const endOffset = selection.getRangeAt(0).endOffset;
    const focusNode = selection.focusNode;
    if (focusNode && focusNode instanceof Text && focusNode.textContent) {
      let text = focusNode.textContent;
      let startIndex = 0;
      if (
        text.length > 2 &&
        endOffset > 2 &&
        text.substring(endOffset - 3, endOffset) == "```"
      ) {
        const range = selection.getRangeAt(0);
        range.setStart(focusNode, endOffset - 3);
        range.setEnd(focusNode, text.length);
        const codeFragment = document.createElement("code");
        const brFragment = document.createElement("br");
        const content = range.extractContents();
        const contentElement = document.createTextNode(
          text.substring(endOffset)
        );
        codeFragment.appendChild(contentElement);
        range.insertNode(brFragment);
        range.insertNode(codeFragment);
        range.collapse();
        this.formatCodeEditors();
        return true;
      }

      const lastPos = text.lastIndexOf("`", endOffset - 2);
      if (text.length > 2 && lastPos > -1 && lastPos < endOffset - 2) {
        const range = selection.getRangeAt(0);
        range.setStart(focusNode, lastPos);
        range.setEnd(focusNode, endOffset);
        const codeFragment = document.createElement("span");
        codeFragment.classList.add("code-inline");
        const content = range.extractContents();
        const contentElement = document.createTextNode(
          text.substring(lastPos + 1, endOffset - 1)
        );
        codeFragment.appendChild(contentElement);
        range.insertNode(codeFragment);
        range.collapse();
        return true;
      }
    }
    return false;
  };

  // Function to move the input cursor to a specified tag element.
  moveCursorToTag(tag: ChildNode | null) {
    let range = document.createRange();
    let selection = window.getSelection();

    if (tag && selection) {
      range.setStart(tag, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  disableCodeEditors = (status: boolean) => {
    this.codeEditors.forEach((editor: any) => {
      editor.setReadOnly(status);
    });
  };

  // Initializes and formats code editors within the rich text field.
  formatCodeEditors() {
    const codeElements = this.richText.nativeElement.querySelectorAll("code");

    codeElements.forEach((element, index) => {
      if (!element.id) {
        // Check if the code element is unformatted (no ID).
        const content = element.innerHTML;
        const editor = ace.edit(element);
        editor.setOptions({ maxLines: Infinity });
        editor.session.setMode("ace/mode/javascript");
        editor.setTheme(
          this.theme === "dark-theme"
            ? "ace/theme/monokai"
            : "ace/theme/crimson_editor"
        );

        // Updates a hidden input element with the editor's content on change.
        editor.session.on("change", () => {
          element.getElementsByTagName("input")[0].value = editor.getValue();
          this._contentChanged();
        });

        // Handles cursor movement and editor boundary interactions.
        editor.commands.on("afterExec", (e) =>
          this.handleCursorBoundaries(editor, e, element)
        );

        // Prepares a hidden input to store the code content.
        const hiddenInput = document.createElement("input");
        hiddenInput.type = "hidden";
        hiddenInput.value = content;
        element.appendChild(hiddenInput);

        // Registers the editor and assigns a unique ID.
        this.codeEditors.push(editor);
        element.id = `code_${this.codeEditors.length - 1}`;
      }
    });
  }

  // Handles cursor movement and interactions with the editor boundaries.
  handleCursorBoundaries(editor: any, eventData: any, codeTag: Element) {
    const cursorPosition = editor.getCursorPosition();
    const docLength = editor.getSession().getDocument().getLength();
    const editorBoundaries = { start: 0, end: docLength - 1 };

    // Moves the cursor to the next or previous tag based on command name and edge status.
    if (
      eventData.command.name === "golinedown" &&
      (this.editorEdgeStatus === "bottom" || this.editorEdgeStatus === "empty")
    ) {
      this.moveCursorToTag(codeTag.nextElementSibling);
    } else if (
      eventData.command.name === "golineup" &&
      (this.editorEdgeStatus === "top" || this.editorEdgeStatus === "empty")
    ) {
      this.moveCursorToTag(codeTag.previousElementSibling);
    }

    // Sets the editor edge status based on the cursor position.
    this.editorEdgeStatus = this.determineEditorEdgeStatus(
      cursorPosition,
      editorBoundaries
    );
  }

  // Determines the editor's edge status based on the current cursor position.
  determineEditorEdgeStatus(cursorPosition: any, boundaries: any) {
    if (
      cursorPosition.row === boundaries.end &&
      cursorPosition.row === boundaries.start
    ) {
      return "empty";
    } else if (cursorPosition.row === boundaries.end) {
      return "bottom";
    } else if (cursorPosition.row === boundaries.start) {
      return "top";
    } else {
      return "in";
    }
  }

  onHashgtagKeywords = (keywords: string) => {
    this.hashtagRequest.emit(keywords);
  };

  getSuggestionList = (tag: string) => {
    return new Promise<CdkSuggestionSetting>((resolve, reject) => {
      if (tag != HASHTAG_TRIGGER) {
        reject("");
        return;
      }

      this.hashtagRequest.emit("");

      setTimeout(() => {
        this.suggestionList$.pipe(take(1)).subscribe((hashtagList: any) => {
          if (hashtagList) {
            resolve({
              data: hashtagList,
              tag: HASHTAG,
              itemTemplate: this.hashtagItemTemplate,
              selectionTemplate: this.hashtagTemplate,
              trigger: HASHTAG_TRIGGER,
            });
          } else {
            reject("");
          }
        });
      }, 300);
    });
  };

  onSuggestionSelected = (event: any) => {
    if (this.suggestionEnabled) {
      this.suggestion.currentRange &&
        focusElementWithRangeIfNotFocused(
          this.richText.nativeElement,
          this.suggestion.currentRange
        );

      this._enterSuggestion(event.item, event.triggerIndex);
    }
  };

  clickToolbarItem(item: ToolbarItem): void {
    if (item.action == "component") {
      if (item.payload) {
        let component: Type<Component> = item.payload;
        this.toggleComponent(component);
        item.active = this.isComponentActive(component);
      }
    } else if (item.action == "image") {
      this.onUploadButtonClick();
    } else {
      this.toggleFormat(item.action);
      item.active = this.isFormatActive(item.action);
    }

    this.updateToolbar();
  }

  triggerToolbarAction(item: CdkToolbarItemSetting): void {
    if (item.action == "component") {
      if (item.payload) {
        let component: Type<Component> = item.payload;
        this.toggleComponent(component);
      }
    } else if (item.action == "image") {
      this.onUploadButtonClick();
    } else if (item.action == "emoji") {
      this.showEmoji();
    } else {
      this.toggleFormat(item.action);
    }

    this.updateToolbar();
  }

  getEditorContent = () => {
    let clonedTextNode = this.richText.nativeElement.cloneNode(
      true
    ) as HTMLElement;

    // Remove formatted code tags
    const codeTags = clonedTextNode.querySelectorAll("code");
    codeTags.forEach((codeTag) => {
      if (codeTag.hasAttribute("class")) {
        codeTag.removeAttribute("class");
      }
      if (codeTag.hasAttribute("style")) {
        codeTag.removeAttribute("style");
      }
      const inputElement = codeTag.querySelector("input");
      if (inputElement && inputElement?.value) {
        codeTag.innerHTML = inputElement.value;
      }
    });

    // Remove formatted hashtags
    const hashtags = clonedTextNode.querySelectorAll("span[hashtag_component]");
    hashtags.forEach((hashtag: any) => {
      if (hashtag.children.length == 2) {
        const textNode = document.createTextNode(hashtag.children[1].innerHTML);
        hashtag.replaceWith(textNode);
      }
    });

    // Convert Image to imageTag
    const images = clonedTextNode.querySelectorAll("img");
    images.forEach((image: any) => {
      const urlParts = image.src.split("/");
      const imgId = urlParts[urlParts.length - 2];
      const textNode = document.createTextNode(`${IMGTAG}${imgId}${IMGTAG}`);
      image.replaceWith(textNode);
    });

    const editorCode = clonedTextNode.innerHTML;
    clonedTextNode.remove();

    return editorCode;
  };

  loadContent = (content: string) => {
    this.richText.nativeElement.innerHTML = content;
    makeLiveHashtags(
      this.richText.nativeElement,
      HASHTAG,
      this.hashtagTemplate,
      this.richTextContainer
    );

    const imgInfo: IImgInfo = {
      domain: this.imgUrl,
      accountId: this.imgAccountId,
      variant: this.variant,
    };
    makeLiveImagetags(this.richText.nativeElement, imgInfo, IMGTAG);
    this._contentChanged();
  };

  private _setHashtagResults(items: CdkSuggestionItem[]): void {
    this.suggestionList$.next(items);
  }

  private _setImage(imageRes: IIMageRes): void {
    let { url, elem } = imageRes;
    elem.src = url;
    this.isUploading = false;
    this._contentChanged();
  }

  private _isInlineTag(tag: string): boolean {
    const selectedNode = this._getSelectedNode();
    if (selectedNode == null) return false;
    return this._isChildOfTag(selectedNode, tag);
  }

  private _removeInlineTag(tag: string): void {
    const selectedNode = this._getSelectedNode();
    selectedNode && this._untagParent(selectedNode, tag);
  }

  private _getSelectedNode(): Node | ChildNode | null {
    const selection = window.getSelection();
    if (!selection?.anchorNode) return null;
    const anchorNode = selection.anchorNode;
    let element: Node | ChildNode | null = anchorNode;

    if (anchorNode instanceof Text) {
      if ((anchorNode as Text).textContent?.length == selection.anchorOffset) {
        element = anchorNode.nextSibling;
      } else {
        element = anchorNode.parentNode;
      }
    } else {
      if (
        (anchorNode as HTMLElement).childNodes.length == selection.anchorOffset
      ) {
        element = anchorNode.nextSibling;
      } else {
      }
    }
    return element;
  }

  private _untagParent(node: ChildNode | Node | null, tag: string): void {
    let element = this._findParentWithTag(node, tag);
    if (element && element instanceof HTMLElement) {
      const htmlElement = element as HTMLElement;

      htmlElement.replaceWith(...Array.from(htmlElement.childNodes));
    }
  }

  private _isChildOfTag(node: any, tag: string): boolean {
    let parentElement: Node | ChildNode | null = node;

    while (parentElement && parentElement !== this.richText.nativeElement) {
      if (parentElement.nodeName.toLocaleLowerCase() === tag) return true;
      parentElement = parentElement.parentElement;
    }

    return false;
  }

  private _findParentWithTag(
    node: Node | ChildNode | null,
    tag: string
  ): Node | null {
    let parentElement = node;

    while (parentElement) {
      if (
        parentElement.nodeName.toLowerCase() === tag &&
        parentElement !== this.richText.nativeElement
      )
        return parentElement;
      parentElement = parentElement.parentElement;
    }

    return null;
  }

  private _getSelectorName(componentName: Type<Component>): string | undefined {
    const metadata = reflectComponentType(componentName);
    const selectorName = metadata?.selector; // my-component

    return selectorName;
  }

  private _enterSuggestion = (
    item: CdkSuggestionItem,
    triggerIndex: number
  ) => {
    const selection = window.getSelection();
    const startedNode = this.suggestion.startedNode;
    const startedOffset = this.suggestion.startedOffset;
    if (selection && startedNode) {
      const focusNode = selection.focusNode;

      if (focusNode && focusNode instanceof Text && focusNode == startedNode) {
        let text = focusNode.textContent;
        let startIndex = 0;

        if (text && (startIndex = startedOffset - 1) >= 0) {
          text = text.slice(0, startIndex) + text.slice(selection.focusOffset);
        }

        focusNode.textContent = text;
        const range = document.createRange();
        const documentFragment = document.createElement("span");
        documentFragment.setAttribute("hashtag_component", "" + HASHTAG);
        documentFragment.setAttribute("contenteditable", "false");

        const realHashtag = document.createElement("span");
        const viewRef: EmbeddedViewRef<Node> =
          this.hashtagTemplate.createEmbeddedView({
            value: { name: item.value.name },
          });
        this.richTextContainer.insert(viewRef);
        for (let node of viewRef.rootNodes) {
          realHashtag.appendChild(node);
        }

        const hiddenHashtag = document.createElement("span");
        hiddenHashtag.setAttribute("hashtag_code", HASHTAG);
        hiddenHashtag.style.display = "none";
        hiddenHashtag.innerHTML = `${HASHTAG}${JSON.stringify(
          item.value
        )}${HASHTAG}`;

        documentFragment.appendChild(realHashtag);
        documentFragment.appendChild(hiddenHashtag);

        range.selectNodeContents(focusNode);
        range.setStart(focusNode, startIndex);
        range.setEnd(focusNode, startIndex);

        selection.removeAllRanges();
        selection.addRange(range);

        range.insertNode(documentFragment);
        setTimeout(() => this._contentChanged(), 0);

        range.collapse();
      }
    }
    this.suggestion.show(false);
  };

  private _contentChanged = () => {
    if (!this.richText?.nativeElement) return;

    setTimeout(() => {
      const content = this.getEditorContent();

      if (content.startsWith("SafeValue must use")) {
        this.onChange(content.substring(39, content.length - 35));
      } else {
        this.onChange(content);
      }
    }, 100);

    this.catchLink();
    this.countOut();
  };

  // CONTROL VALUE ACCESSOR & INPUT METHODS
  writeValue(value: string): void {
    setTimeout(() => {
      this.loadContent(value);
      this.formatCodeEditors();
    }, 10);
    this.content = value;
  }

  onChange = (value: any) => {};

  onTouched = () => {};

  registerOnChange(onChange: any): void {
    this.onChange = onChange;
  }

  registerOnTouched(onTouched: any): void {
    this.onTouched = onTouched;
  }

  // not using?
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.disableCodeEditors(this.disabled);
  }

  markAsTouched() {
    if (!this.touched) {
      this.onTouched();
      this.touched = true;
    }
  }

  checkCodeTag = (currentNode: any) => {
    let parent = currentNode;
    while (parent !== this.richText.nativeElement) {
      if (parent.nodeName === "CODE") {
        return parseInt(parent.id.replace("code_", ""));
      }
      parent = parent.parentNode;
    }
    return -1;
  };

  // INPUT EVENT
  onKeyDown = (event: KeyboardEvent) => {
    if (this.disabled) {
      return;
    }
    if (event.ctrlKey && event.key === "z") {
      // empty?
    } else if (event.ctrlKey && event.key === "y") {
      // empty?
    }

    // Focuse code editor when input cursor is in the editor
    setTimeout(() => {
      const selection = window.getSelection();
      const currentNode = selection!.focusNode;
      const index = this.checkCodeTag(currentNode);
      if (index > -1) {
        this.codeEditors[index].focus();
      }
    }, 10);

    if (this.suggestionEnabled) {
      if (this.suggestion.onKeyDown(event)) {
        return;
      }
    }
  };

  onMouseDown = (event: MouseEvent) => {
    if (this.disabled) return;
    if (this.suggestionEnabled) this.suggestion.onMouseDown(event);
  };

  onMouseUp = (event: MouseEvent) => {
    if (this.disabled) return;
    setTimeout(() => {
      const currentSelection = window.getSelection();
      currentSelection && this.selectionChanged.emit(currentSelection);

      if (currentSelection && currentSelection?.toString() != "") {
        this.updateToolbar();
        let quickToolbar = this.quickToolbarElement.nativeElement;
        quickToolbar.classList.toggle("rte-show", true);
        const PADDING = 10;
        const range = currentSelection.getRangeAt(0);
        let selectedRect = range.getBoundingClientRect();
        const editorRect = this.richText.nativeElement.getBoundingClientRect();
        const toolbarRect =
          this.quickToolbarElement.nativeElement.getBoundingClientRect();
        if (isRectEmpty(selectedRect)) {
          selectedRect = range.getBoundingClientRect();
        }
        let newY =
          selectedRect.y -
          quickToolbar.getBoundingClientRect().height -
          PADDING;
        let newX =
          selectedRect.x + selectedRect.width / 2 - toolbarRect.width / 2;

        if (newX + toolbarRect.width > editorRect.right) {
          newX = editorRect.right - toolbarRect.width - PADDING;
        }

        const x = newX - this.richText.nativeElement.getBoundingClientRect().x;
        const y = newY - this.richText.nativeElement.getBoundingClientRect().y;

        quickToolbar.style.top = y + "px";
        quickToolbar.style.left = x + "px";
      } else {
        let quickToolbar = this.quickToolbarElement.nativeElement;
        quickToolbar.classList.toggle("rte-show", false);
      }
    }, 0);
  };

  onDrop = (event: DragEvent) => {
    if (!event.dataTransfer?.files[0]) return;

    let file = event.dataTransfer.files[0];
    let x = event.clientX;
    let y = event.clientY;
    if (file && file.type.startsWith("image/")) {
      event.preventDefault();
      event.stopPropagation();
      const range = getRangeFromPosition(x, y);
      this.handleFile(file, range);
    }
  };

  onDragOver = (event: Event) => {};

  onPaste = (event: ClipboardEvent) => {
    if (this.disabled) return;

    const fileList = event.clipboardData?.files;
    if (fileList && fileList.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      const pasteFile = (file: File) => {
        loadImage(file, async (dataURI: string) => {
          const { id, elem } = await this.insertImage(dataURI.toString());
          if (this.uploadImageRequest) {
            this.isUploading = true;
            this.uploadImageRequest.emit({ file, elem });
          }
          this._contentChanged();
        });
      };

      for (let i = 0; i < fileList.length; i++) {
        let file = fileList.item(i);
        file && pasteFile(file);
      }
      return;
    }
  };

  onFocusIn = () => {
    this.focus.emit();
  };
  onFocusOut() {
    this.blur.emit();
  }

  linkOut() {
    const linkTags = this.richText.nativeElement.querySelectorAll("a");
    this.links = [];
    linkTags.forEach((element) => {
      this.links.push(element.innerHTML);
    });

    this.linkRequest.emit(this.links);
  }

  urlify = (text: string | null) => {
    let urlRegex = /(https?:\/\/[^\s]+&nbsp;+)/g;
    if (text) text = this.convertToHtmlEntities(text);
    const replaceText = text?.replace(urlRegex, function (url) {
      url = url.slice(0, -6);
      return '<a href="' + url + '">' + url + "</a>&nbsp;";
    });

    return replaceText !== text && replaceText;
  };

  onValueChange = (event: Event) => {
    event = event as KeyboardEvent;
    if (this.suggestionEnabled) {
      this.suggestion.onValueChange(event);
    }

    this._handleCodeBlock(event as InputEvent);
    this._contentChanged();
  };

  countOut = () => {
    const content = (
      this.richText.nativeElement.innerText ||
      this.richText.nativeElement.textContent
    )?.trim();

    this.count.emit(content?.length);
  };

  insertAfter = (newNode: any, existingNode: any) => {
    existingNode.parentNode.insertBefore(newNode, existingNode.nextSibling);
  };

  htmlToElems = (html: any) => {
    let temp = document.createElement("template");
    temp.innerHTML = html;
    return temp.content.childNodes;
  };

  convertToHtmlEntities = (htmlString: string) => {
    let tempElement = document.createElement("div");
    tempElement.innerText = htmlString;
    return tempElement.innerHTML;
  };

  nodesReplaceContent = (nodes: any, replaceFunc: Function) => {
    const stack = [...nodes];
    const topParent = nodes[0]?.parentNode;

    while (stack.length > 0) {
      const currentNode = stack.pop() as ChildNode;
      const parent = currentNode?.parentNode;
      const nodeName = currentNode.nodeName;

      if (parent) {
        if (!(nodeName === "CODE" || nodeName === "A")) {
          if (currentNode.childNodes.length > 0 && parent === topParent) {
            // Push child nodes onto the stack
            stack.push(...Array.from(currentNode.childNodes));
          } else {
            const newContent = replaceFunc(currentNode.textContent);

            if (newContent) {
              // Check if the parent contains the current node before replacing
              if (parent.contains(currentNode)) {
                const newNodes: any = this.htmlToElems(newContent);
                const length = newNodes.length;
                for (let i = 0; i < length; i++) {
                  parent.insertBefore(newNodes[0], currentNode);
                }
                // remove the chosen element
                parent.removeChild(currentNode);
              }

              this.linkOut();
            }
          }
        }
      }
    }
  };

  catchLink = () => {
    let nodes = this.richText.nativeElement.childNodes;
    this.nodesReplaceContent(nodes, this.urlify);
  };

  onUploadButtonClick(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (file && file.type.startsWith("image/")) {
        this.handleFile(file);
      }
    }
  }

  private async handleFile(file: File, range?: Range | null) {
    loadImage(file, async (dataURI: string) => {
      setTimeout(async () => {
        let id: string;
        let elem: HTMLImageElement | undefined;

        if (range) {
          focusElementWithRange(this.richText.nativeElement, range);
        }

        ({ id, elem } = await this.insertImage(dataURI.toString()));
        this._contentChanged();

        if (this.uploadImageRequest) {
          this.uploadImageRequest.emit({ file, elem });
        }
      }, 10);
    });
  }

  addEmoji(event: any) {
    this.isVisibleEmojiModal = false;
    this.insertText(event.emoji.native);
  }

  private insertText(content: string) {
    if (this.savedSelection) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        selection.removeAllRanges();
        selection.addRange(this.savedSelection);

        const range = this.savedSelection;
        range.deleteContents();

        const textNode = document.createTextNode(content);
        range.insertNode(textNode);

        // Move the caret after the inserted content
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);

        this._contentChanged();
      }
    }
  }

  private saveSelection() {
    // Get the current selection
    const selection = window.getSelection();

    if (selection) {
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;

      // Check if the selection is within the richTextEditor
      const isSelectionInDiv =
        this.richText.nativeElement.contains(anchorNode) &&
        this.richText.nativeElement.contains(focusNode);

      if (isSelectionInDiv)
        this.savedSelection = selection.getRangeAt(0).cloneRange();
    }
  }

  showEmoji() {
    this.isVisibleEmojiModal = true;
    this.saveSelection();
  }
}
