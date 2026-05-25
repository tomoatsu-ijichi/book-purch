import { Book } from '@models/book.model';
import { BookSearchPluginSettings } from '@settings/settings';
import { requestUrl } from 'obsidian';
import { GoogleBooksApi } from './google_books_api';
import { NdlBooksApi } from './ndl_books_api';
import { ApiChain } from './api_chain';

export interface BaseBooksApiImpl {
  getByQuery(query: string, options?: Record<string, string>): Promise<Book[]>;
}

export function factoryServiceProvider(settings: BookSearchPluginSettings): BaseBooksApiImpl {
  const ndl = new NdlBooksApi(60);
  const google = new GoogleBooksApi(
    settings.localePreference,
    false, // edgeCurl は使わない
    settings.apiKey,
  );
  // NDL を第一候補、空なら Google にフォールバック
  return new ApiChain(ndl, google);
}

export async function apiGet<T>(
  url: string,
  params: Record<string, string | number> = {},
  headers?: Record<string, string>,
): Promise<T> {
  const apiURL = new URL(url);
  appendQueryParams(apiURL, params);

  const res = await requestUrl({
    url: apiURL.href,
    method: 'GET',
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });

  return res.json as T;
}

function appendQueryParams(url: URL, params: Record<string, string | number>): void {
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value.toString());
  });
}
