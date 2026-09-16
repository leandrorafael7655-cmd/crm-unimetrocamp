-- Função destinada exclusivamente ao trigger de auditoria de ocorrências.
-- Impede invocação direta via RPC por anon/authenticated.
revoke all on function public.attendance_log_occurrence_change() from public, anon, authenticated;
