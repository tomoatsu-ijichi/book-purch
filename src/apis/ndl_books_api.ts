import { requestUrl } from 'obsidian';
import { Book } from '@models/book.model';
import { BaseBooksApiImpl } from './base_api';

/**
 * NDL（国立国会図書館サーチ）SRU API プロバイダ
 *
 * - recordSchema=dcndl / recordPacking=xml で詳細な書誌データを取得する
 * - レスポンスは RDF/XML。DOMParser で解析し、共通の Book 型に正規化する
 * - 図書（materialType=Book）のみを候補とし、記事・論文は除外する
 *
 * NOTE: 既存の apiGet は JSON 専用なので使わず、requestUrl で text を取得する。
 */

// レスポンスで使う名前空間
const NS = {
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  dcndl: 'http://ndl.go.jp/dcndl/terms/',
  foaf: 'http://xmlns.com/foaf/0.1/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  srw: 'http://www.loc.gov/zing/srw/',
} as const;

const NDLTYPE_BOOK = 'http://ndl.go.jp/ndltype/Book';

export class NdlBooksApi implements BaseBooksApiImpl {
  private static readonly ENDPOINT = 'https://ndlsearch.ndl.go.jp/api/sru';

  constructor(private readonly maxResults: number = 20) {}

  async getByQuery(query: string): Promise<Book[]> {
    const trimmed = query?.trim();
    if (!trimmed) return [];

    // CQL: タイトル部分一致。" はクエリを壊すので除去しておく
    const cql = `title="${trimmed.replace(/"/g, '')}"`;
    const url =
      `${NdlBooksApi.ENDPOINT}?operation=searchRetrieve` +
      `&recordSchema=dcndl&recordPacking=xml` +
      `&maximumRecords=${this.maxResults}` +
      `&query=${encodeURIComponent(cql)}`;

    try {
      const res = await requestUrl({ url, method: 'GET' });
      if (res.status !== 200) return [];

      const xml = new DOMParser().parseFromString(res.text, 'application/xml');
      // パースエラー検出（DOMParser は失敗時に parsererror 要素を返す）
      if (xml.getElementsByTagName('parsererror').length > 0) return [];

      const records = Array.from(xml.getElementsByTagNameNS(NS.srw, 'recordData'));
      return records.map(record => this.parseRecord(record)).filter((book): book is Book => book !== null);
    } catch (error) {
      console.warn('[NDL] search failed:', error);
      throw error;
    }
  }

  /** 1件の recordData を Book に変換。図書でない or タイトル無しは null */
  private parseRecord(record: Element): Book | null {
    if (!this.isBook(record)) return null;

    const rawTitle = this.firstText(record, NS.dcterms, 'title');
    if (!rawTitle) return null;

    const { title, subtitle } = this.splitTitle(rawTitle);
    const authors = this.parseAuthors(record);
    const { isbn10, isbn13 } = this.parseIsbn(record);

    const book: Book = {
      title,
      subtitle,
      author: authors.join(', '),
      authors,
      publisher: this.parsePublisher(record),
      publishDate: this.parsePublishDate(record),
      totalPage: this.parsePages(record),
      categories: [],
      category: '',
      language: 'ja',
      description: '', // NDL は内容紹介をほぼ持たない
      link: '',
      isbn10,
      isbn13,
      isbn: isbn13 || isbn10 || '',
      // どのソース由来かを残す（book.model.ts に source?: 'ndl' | 'google' を追加する想定）
      source: 'ndl',
    } as Book;

    return book;
  }

  /** materialType に図書(Book)が含まれるか。記事・論文(Article)のみなら false */
  private isBook(record: Element): boolean {
    const types = Array.from(record.getElementsByTagNameNS(NS.dcndl, 'materialType'));
    if (types.length === 0) return false;
    return types.some(el => (el.getAttributeNS(NS.rdf, 'resource') ?? '').startsWith(NDLTYPE_BOOK));
  }

  /**
   * 著者を取得。dcterms:creator > foaf:name を著者ごとに配列で拾う。
   * foaf:name は「姓, 名」表記で役割語を含まないため、これを正とする。
   * 取れない場合のみ dc:creator にフォールバックし、末尾の役割語を除去する。
   */
  private parseAuthors(record: Element): string[] {
    const creators = Array.from(record.getElementsByTagNameNS(NS.dcterms, 'creator'));
    const names: string[] = [];

    for (const creator of creators) {
      const nameEl = creator.getElementsByTagNameNS(NS.foaf, 'name')[0];
      const name = nameEl?.textContent?.trim();
      if (name) names.push(this.normalizeName(name));
    }

    if (names.length === 0) {
      // フォールバック: dc:creator（"新村剛史 監修" のような役割語つき）
      const dcCreators = Array.from(record.getElementsByTagNameNS(NS.dc, 'creator'));
      for (const el of dcCreators) {
        const raw = el.textContent?.trim();
        if (raw) names.push(this.stripRole(this.normalizeName(raw)));
      }
    }

    // 重複除去
    return Array.from(new Set(names.filter(Boolean)));
  }

  /** 「姓, 名」のカンマ区切りを詰める（新村, 剛史 -> 新村剛史） */
  private normalizeName(name: string): string {
    return name.replace(/\s*,\s*/g, '').trim();
  }

  /** 末尾の役割語を除去（著 / 編 / 監修 / 訳 / 編集 / 著編 など） */
  private stripRole(name: string): string {
    return name.replace(/\s*(著|編|編集|監修|訳|共著|著編|編著|画|作)+$/u, '').trim();
  }

  /** 出版社。dcterms:publisher > foaf:name の最初（発売元は後続なので無視） */
  private parsePublisher(record: Element): string {
    const publishers = Array.from(record.getElementsByTagNameNS(NS.dcterms, 'publisher'));
    for (const pub of publishers) {
      const name = pub.getElementsByTagNameNS(NS.foaf, 'name')[0]?.textContent?.trim();
      if (name) return name;
    }
    return '';
  }

  /**
   * 出版日を YYYY-MM に正規化。
   * dcterms:date は "2019.5" 形式（月ゼロ埋めなし）。これを優先し YYYY-MM へ。
   * 月が取れない / date が無い場合は dcterms:issued の YYYY にフォールバック。
   */
  private parsePublishDate(record: Element): string {
    const date = this.firstText(record, NS.dcterms, 'date');
    const ym = date.match(/^(\d{4})[.\-/](\d{1,2})/);
    if (ym) {
      return `${ym[1]}-${ym[2].padStart(2, '0')}`;
    }
    const yearOnly = date.match(/^(\d{4})/);
    if (yearOnly) return yearOnly[1];

    const issued = this.firstText(record, NS.dcterms, 'issued');
    const issuedYear = issued.match(/^(\d{4})/);
    return issuedYear ? issuedYear[1] : '';
  }

  /** ISBN を取得。ハイフン除去後、桁数で isbn10 / isbn13 に振り分ける */
  private parseIsbn(record: Element): { isbn10: string; isbn13: string } {
    const ids = Array.from(record.getElementsByTagNameNS(NS.dcterms, 'identifier'));
    let isbn10 = '';
    let isbn13 = '';

    for (const id of ids) {
      const datatype = id.getAttributeNS(NS.rdf, 'datatype') ?? '';
      if (!datatype.endsWith('ISBN')) continue;
      const value = (id.textContent ?? '').replace(/[\s-]/g, '');
      if (value.length === 13 && !isbn13) isbn13 = value;
      else if (value.length === 10 && !isbn10) isbn10 = value;
    }
    return { isbn10, isbn13 };
  }

  /** extent（"xii, 231p ; 24cm" 等）から本文ページ数を抽出 */
  private parsePages(record: Element): number | string {
    const extents = Array.from(record.getElementsByTagNameNS(NS.dcterms, 'extent'));
    for (const ext of extents) {
      const m = (ext.textContent ?? '').match(/(\d+)\s*p/);
      if (m) return Number.parseInt(m[1], 10);
    }
    return '';
  }

  /** 「本題 : 副題」を分割（前後スペース付きの " : " のみ区切りとみなす） */
  private splitTitle(raw: string): { title: string; subtitle: string } {
    const parts = raw.split(/\s+:\s+/);
    if (parts.length >= 2) {
      return { title: parts[0].trim(), subtitle: parts.slice(1).join(' : ').trim() };
    }
    return { title: raw.trim(), subtitle: '' };
  }

  /** 指定要素配下の、最初の非空テキストを返す */
  private firstText(scope: Element, ns: string, localName: string): string {
    const els = scope.getElementsByTagNameNS(ns, localName);
    for (let i = 0; i < els.length; i++) {
      const text = els[i].textContent?.trim();
      if (text) return text;
    }
    return '';
  }
}
