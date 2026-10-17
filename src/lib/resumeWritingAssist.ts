import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Optional writing help for the résumé builder. The edge function drafts the text from
 * the candidate's own saved data; this module only returns the draft. Nothing is written
 * to the résumé until the candidate accepts it in the UI.
 */
export type WritingAssistField = 'work_summary' | 'self_pr' | 'strengths' | 'motivation';

export const WRITING_ASSIST_FUNCTION = 'hc-resume-writing-assist';

export class WritingAssistError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'WritingAssistError';
  }
}

export async function requestWritingDraft(field: WritingAssistField): Promise<string> {
  if (!supabase) throw new WritingAssistError('いまは下書き作成を利用できません。', 'UNAVAILABLE');
  const { data, error } = await supabase.functions.invoke<{ draft?: string }>(WRITING_ASSIST_FUNCTION, { body: { field } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null) as { code?: string; message?: string } | null;
      throw new WritingAssistError(body?.message || '下書きを作れませんでした。時間をおいてお試しください。', body?.code || 'ERROR');
    }
    throw new WritingAssistError('下書きを作れませんでした。通信状況を確認してください。', 'NETWORK');
  }
  const draft = data?.draft?.trim();
  if (!draft) throw new WritingAssistError('下書きを作れませんでした。時間をおいてお試しください。', 'EMPTY');
  return draft;
}
