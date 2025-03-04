import { CommonModule } from "@angular/common";
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  TemplateRef,
  ViewChild,
} from "@angular/core";

import {
  CdkSuggestionItem,
  CdkSuggestionSelect,
  CdkSuggestionSetting,
} from "../../interfaces";
import { isRectEmpty } from "../../utils/DOM";

@Component({
  selector: "rte-suggestion",
  templateUrl: "./suggestion.component.html",
  styleUrls: ["./suggestion.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class CdkSuggestionComponent {
  @ViewChild("container") container!: ElementRef<HTMLElement>;
  @Input("getSuggestionList") getSuggestionList?: (
    tag: string
  ) => Promise<CdkSuggestionSetting>;
  @Output("hashtagKeywords") hashtagKeywords = new EventEmitter<string>();
  @Output("cdkSuggestionSelected") select =
    new EventEmitter<CdkSuggestionSelect>();
  itemTemplate!: TemplateRef<any>;
  suggestions: CdkSuggestionItem[] = [];
  filteredSuggestions: CdkSuggestionItem[] = [];
  triggerIndex: number = 0;
  selectedIndex: number = -1;
  isVisible: boolean = false;
  startedNode!: Node | undefined;
  startedOffset!: number;
  currentRange!: Range | undefined;
  query = "";

  @Input() recentSuggestions: CdkSuggestionItem[] = [];
  @Input() popularSuggestions: CdkSuggestionItem[] = [];

  trackItem = (index: number, item: CdkSuggestionItem): string => {
    return item.key;
  };

  filter!: (query: string, item: CdkSuggestionItem) => boolean;

  defaultFilter = (query: string, item: CdkSuggestionItem) => {
    const search = item.search || item.key;
    return search.toLowerCase().indexOf(query.toLowerCase()) != -1;
  };

  filterItems = (query: string) => {
    this.filteredSuggestions = this.suggestions.filter((item) =>
      this.filter(query, item)
    );
  };

  show = (visible: boolean) => {
    console.log("show() called with:", visible);
    this.isVisible = visible;

    if (!visible) {
      this.container.nativeElement.classList.toggle("rte-show", false);
      this.query = "";
      this.startedNode = undefined;
      this.startedOffset = -1;
      this.currentRange = undefined;
      this.selectedIndex = -1;
      return;
    }

    // Set up the position of the suggestion panel
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        // Always update the start node when showing to capture the correct position
        this.startedNode = selection.getRangeAt(0).endContainer;
        this.startedOffset = selection.getRangeAt(0).endOffset;
        this.currentRange = selection.getRangeAt(0);

        // Get positioning information
        let rect = selection.getRangeAt(0).getBoundingClientRect();
        if (isRectEmpty(rect)) {
          rect = (selection.getRangeAt(0).startContainer as Element).getBoundingClientRect();
        }

        const editorRect = this.container.nativeElement.parentElement?.getBoundingClientRect();
        if (editorRect) {
          // Position the suggestion panel correctly
          this.container.nativeElement.style.top = "" + (rect.bottom - editorRect.top) + "px";
          this.container.nativeElement.style.left = "" + (rect.right - editorRect.x) + "px";
          this.container.nativeElement.classList.toggle("rte-show", true);
        }
      }
    }, 0); // Use setTimeout to ensure DOM is updated
  };


  onKeyDown = (event: KeyboardEvent): boolean => {
    console.log("Key pressed:", event.key);

    if (event.key === "#") {
      console.log("Hashtag detected on first press");

      // Initialize hashtag suggestions on first keystroke
      if (this.getSuggestionList) {
        this.getSuggestionList("#")
          .then((suggestion) => {
            this.setTrigger(suggestion);
            this.show(true);
            this.hashtagKeywords.emit(""); // Request initial hashtag suggestions
          })
          .catch((reason) => {
            console.error("Error fetching suggestions:", reason);
          });
      } else {
        this.show(true);
      }

      return true;
    }

    if (event.key == "Escape") {
      this.show(false);
      return true;
    }

    if (event.key == "ArrowDown") {
      if (this.isVisible) {
        if (this._moveSelected(1)) event.preventDefault();
        return true;
      }
    }

    if (event.key == "ArrowUp") {
      if (this.isVisible) {
        if (this._moveSelected(-1)) event.preventDefault();
        return true;
      }
    }

    if (event.key == "Enter") {
      if (this.isVisible) {
        this._enterSuggestion(event);
        return true;
      }
    }

    if (event.key == "ArrowLeft" || event.key == "ArrowRight") {
      if (this.isVisible) setTimeout(() => this._updateQuery(), 0);
    }

    return false;
  };

  onClick(event: MouseEvent, clickedItem: CdkSuggestionItem): void {
    if (!this.isVisible) return;

    this.selectedIndex = this.filteredSuggestions.findIndex(
      (item) => item.key == clickedItem.key
    );

    this._enterSuggestion(event);
  }

  onMouseDown(event: MouseEvent): void {
    if (!this.isVisible) return;
    const rect = this.container.nativeElement.getBoundingClientRect();

    if (
      !(
        event.x >= rect.left &&
        event.x <= rect.right &&
        event.y >= rect.top &&
        event.y <= rect.bottom
      )
    ) {
      this.show(false);
    }
  }

  setTrigger = (suggestion: CdkSuggestionSetting) => {
    this.itemTemplate = suggestion.itemTemplate;
    this.filter = suggestion.queryFilter ?? this.defaultFilter;
    this.suggestions = suggestion.data;
    this.filterItems("");
    this.selectedIndex = 0;
  };

  onValueChange = (event: Event): boolean => {
    let ev = event as InputEvent;
    const inputData = ev.data ?? ""; // Ensure inputData is always a string

    if (inputData && this.getSuggestionList) {
      this.getSuggestionList(inputData)
        .then((suggestion) => {
          this.setTrigger(suggestion);
          this.show(true); // Ensure it appears immediately
        })
        .catch((reason: any) => {
          console.error("Error fetching suggestions:", reason);
        });
    }

    if (this.isVisible) {
      this._updateQuery();
      return true;
    }

    return false;
  };


  onItemHover = (index: number): void => {
    this.selectedIndex = index;
  };

  private _moveSelected = (step: number): boolean => {
    let currentIndex = this.selectedIndex;
    let newIndex = currentIndex == -1 ? 0 : currentIndex + step;

    if (this.filteredSuggestions.length == 0) {
      this.selectedIndex = -1;
      return false;
    }

    newIndex =
      (newIndex + this.filteredSuggestions.length) %
      this.filteredSuggestions.length;
    this.selectedIndex = newIndex;
    const selectedChild = this.container.nativeElement.childNodes[newIndex];

    if (selectedChild && selectedChild instanceof HTMLElement) {
      let itemRect = selectedChild.getBoundingClientRect();
      let containerRect = this.container.nativeElement.getBoundingClientRect();

      if (itemRect.top < containerRect.top) {
        this.container.nativeElement.scrollBy(
          0,
          itemRect.top - containerRect.top
        );
      } else if (itemRect.bottom > containerRect.bottom) {
        this.container.nativeElement.scrollBy(
          0,
          itemRect.bottom - containerRect.bottom
        );
      }
      return true;
    } else {
      return false;
    }
  };

  private _enterSuggestion = (event: Event) => {
    if (
      this.selectedIndex >= 0 &&
      this.selectedIndex < this.filteredSuggestions.length
    ) {
      event.preventDefault();
      this.select.emit({
        event: event,
        item: this.filteredSuggestions[this.selectedIndex],
        triggerIndex: this.triggerIndex,
      });
    }
  };

  private _updateQuery = () => {
    const selection = window.getSelection();
    if (selection && this.startedNode && selection.rangeCount > 0) {
      this.currentRange = selection.getRangeAt(0);

      if (
        selection.focusNode &&
        this.startedNode &&
        selection.focusNode == this.startedNode
      ) {
        if (selection.focusOffset >= this.startedOffset) {
          const text = (selection.focusNode as Text).textContent;
          if (text) {
            this.query = text.slice(this.startedOffset, selection.focusOffset);
            this.filterItems(this.query);
            this.hashtagKeywords.emit(this.query);
            this.filteredSuggestions;
            this.selectedIndex = 0;
            return;
          }
        }
      }
    }

    if (this.isVisible) {
      this.show(false);
    }
  };
}