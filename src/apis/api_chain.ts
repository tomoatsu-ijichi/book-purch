import { Book } from '@models/book.model';
import { BaseBooksApiImpl } from './base_api';

/**
 * 複数のプロバイダを優先順位順に試すフォールバック制御。
 *
 * - コンストラクタに渡した順（= 優先順位）で getByQuery を呼ぶ
 * - 最初に「空でない結果」を返したプロバイダの結果を採用する
 * - あるプロバイダが例外を投げても握りつぶして次へフォールバックする
 *   （例: NDL が一時的に落ちていても Google で拾えるようにする）
 * - 全プロバイダが空 or 失敗した場合、捕捉した例外があればそれを投げ、
 *   なければ空配列を返す
 *
 * 自身も BaseBooksApiImpl を実装しているので、factory からは
 * 単一プロバイダと同じように扱える。
 */
export class ApiChain implements BaseBooksApiImpl {
  private readonly providers: BaseBooksApiImpl[];

  constructor(...providers: BaseBooksApiImpl[]) {
    this.providers = providers.filter(Boolean);
  }

  async getByQuery(query: string, options?: Record<string, string>): Promise<Book[]> {
    let lastError: unknown = null;

    for (const provider of this.providers) {
      try {
        const results = await provider.getByQuery(query, options);
        if (results && results.length > 0) {
          return results;
        }
      } catch (error) {
        console.warn('[ApiChain] provider failed, falling back to next:', error);
        lastError = error;
      }
    }

    if (lastError) throw lastError;
    return [];
  }
}
