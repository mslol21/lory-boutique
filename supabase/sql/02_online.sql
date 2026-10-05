-- Complemento: executar após 01_initial.sql. Não cria produtos nem usuários.
BEGIN;
CREATE TABLE IF NOT EXISTS public.uploaded_images (
  id TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  content_base64 TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES public.users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id TEXT PRIMARY KEY,
  failures INTEGER NOT NULL CHECK(failures >= 0),
  expires_at BIGINT NOT NULL
);
ALTER TABLE public.uploaded_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.uploaded_images, public.login_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.uploaded_images, public.login_attempts TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
SELECT (SELECT count(*) FROM public.products) AS produtos,
       (SELECT count(*) FROM public.users WHERE role='admin' AND active=1) AS administradores;
