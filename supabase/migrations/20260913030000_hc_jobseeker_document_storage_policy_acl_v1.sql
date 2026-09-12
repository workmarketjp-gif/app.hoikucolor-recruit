-- Restore the authenticated execution privilege required by the private
-- Storage RLS predicate functions used by hc-application-documents.
--
-- The bucket itself remains private. These SECURITY DEFINER helpers only return
-- boolean authorization decisions derived from the current JWT + object path.
-- anon/public execution remains denied.

revoke all on function ho_private.color_application_document_object_can_read(text) from public, anon;
revoke all on function ho_private.color_application_document_object_can_write(text) from public, anon;

grant execute on function ho_private.color_application_document_object_can_read(text) to authenticated;
grant execute on function ho_private.color_application_document_object_can_write(text) to authenticated;
