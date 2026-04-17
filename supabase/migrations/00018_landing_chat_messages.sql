-- Messages du chatbot de la landing page (pour analyse admin).

CREATE TABLE public.landing_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_landing_chat_messages_session ON public.landing_chat_messages(session_id);
CREATE INDEX idx_landing_chat_messages_created ON public.landing_chat_messages(created_at DESC);

COMMENT ON TABLE public.landing_chat_messages IS 'Messages du chatbot landing (anon insert, lecture super admin).';

ALTER TABLE public.landing_chat_messages ENABLE ROW LEVEL SECURITY;

-- Anon peut insérer (visiteurs landing).
CREATE POLICY "landing_chat_messages_insert_anon" ON public.landing_chat_messages
  FOR INSERT TO anon WITH CHECK (true);

-- Seul le super admin peut lire.
CREATE POLICY "landing_chat_messages_select_super_admin" ON public.landing_chat_messages
  FOR SELECT TO authenticated USING (is_super_admin());

GRANT INSERT ON public.landing_chat_messages TO anon;
GRANT SELECT ON public.landing_chat_messages TO authenticated;
