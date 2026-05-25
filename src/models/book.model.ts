export interface FrontMatter {
  [key: string]: string | string[];
}

export interface Book {
  title: string;
  subtitle?: string;
  author: string;
  authors: string[];
  category?: string;
  categories?: string[];
  publisher?: string;
  publishDate?: string;
  totalPage?: number | string;
  coverUrl?: string;
  coverSmallUrl?: string;
  coverMediumUrl?: string;
  coverLargeUrl?: string;
  localCoverImage?: string;
  status?: string;
  startReadDate?: string;
  finishReadDate?: string;
  myRate?: number | string;
  bookNote?: string;
  isbn10?: string;
  isbn13?: string;
  isbn?: string;
  link?: string;
  description?: string;
  previewLink?: string;
  /** どの API ソースから取得したか */
  source?: 'ndl' | 'google';
}
