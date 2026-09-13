import { supabase } from './supabase';
import type { JobseekerDocumentType } from './documentVaultRepository';

export type ApplicationDocumentExpectation = {
  id: string;
  application_id: string;
  source_jobseeker_document_id_snapshot: string;
  document_type: JobseekerDocumentType;
  title: string;
  destination_file_path: string;
  captured_at: string;
};

const expectationColumns =
  'id,application_id,source_jobseeker_document_id_snapshot,document_type,title,destination_file_path,captured_at';

function db() {
  if (!supabase) throw new Error('Supabaseが設定されていません。');
  return supabase;
}

export async function listApplicationDocumentExpectations(
  applicationId: string,
): Promise<ApplicationDocumentExpectation[]> {
  const { data, error } = await db()
    .from('hc_application_document_expectations')
    .select(expectationColumns)
    .eq('application_id', applicationId)
    .order('captured_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ApplicationDocumentExpectation[];
}
