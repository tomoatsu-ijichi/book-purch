import { App, SuggestModal } from 'obsidian';
import { Book } from '@models/book.model';

export class BookSuggestModal extends SuggestModal<Book> {
  constructor(
    app: App,
    private readonly suggestion: Book[],
    private onChoose: (error: Error | null, result?: Book) => void,
  ) {
    super(app);
  }

  getSuggestions(query: string): Book[] {
    return this.suggestion.filter(book => {
      const searchQuery = query?.toLowerCase();
      return (
        book.title?.toLowerCase().includes(searchQuery) ||
        book.author?.toLowerCase().includes(searchQuery) ||
        book.publisher?.toLowerCase().includes(searchQuery)
      );
    });
  }

  renderSuggestion(book: Book, el: HTMLElement) {
    el.addClass('book-suggestion-item');

    const textContainer = el.createEl('div', { cls: 'book-text-info' });
    textContainer.createEl('div', { text: book.title });

    const publisher = book.publisher ? `, ${book.publisher}` : '';
    const publishDate = book.publishDate ? `(${book.publishDate})` : '';
    const totalPage = book.totalPage ? `, p${book.totalPage}` : '';
    const subtitle = `${book.author}${publisher}${publishDate}${totalPage}`;
    textContainer.createEl('small', { text: subtitle });
  }

  onChooseSuggestion(book: Book) {
    this.onChoose(null, book);
  }
}
