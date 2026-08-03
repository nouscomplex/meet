-- ============================================================
-- COMPLETE SQL SCHEMA - School Hub Database
-- PostgreSQL for Supabase
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. CHANNELS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE channels IS 'Classroom channels/groups';

-- ============================================================
-- 2. MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE messages IS 'Chat messages with file attachments';
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- ============================================================
-- 3. STATUSES TABLE (WhatsApp-style updates)
-- ============================================================
CREATE TABLE IF NOT EXISTS statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE statuses IS 'Temporary status updates (WhatsApp-style)';

-- ============================================================
-- 4. ATTENDANCE TABLE (Invisible logger)
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT NOT NULL,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  join_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'Present'
);

COMMENT ON TABLE attendance IS 'Automatic attendance tracking';
CREATE INDEX IF NOT EXISTS idx_attendance_channel_id ON attendance(channel_id);
CREATE INDEX IF NOT EXISTS idx_attendance_join_time ON attendance(join_time DESC);

-- ============================================================
-- 5. MEMBERS TABLE (Channel assignments)
-- ============================================================
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE members IS 'Student-channel assignments';
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_unique ON members(channel_id, username);

-- ============================================================
-- 6. STORAGE BUCKET (Run in Storage section)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('files', 'files', true);

-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Public policies (for demo - secure in production)
CREATE POLICY "Public select channels" ON channels FOR SELECT USING (true);
CREATE POLICY "Public insert channels" ON channels FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update channels" ON channels FOR UPDATE USING (true);
CREATE POLICY "Public delete channels" ON channels FOR DELETE USING (true);

CREATE POLICY "Public select messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Public insert messages" ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update messages" ON messages FOR UPDATE USING (true);
CREATE POLICY "Public delete messages" ON messages FOR DELETE USING (true);

CREATE POLICY "Public select statuses" ON statuses FOR SELECT USING (true);
CREATE POLICY "Public insert statuses" ON statuses FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update statuses" ON statuses FOR UPDATE USING (true);
CREATE POLICY "Public delete statuses" ON statuses FOR DELETE USING (true);

CREATE POLICY "Public select attendance" ON attendance FOR SELECT USING (true);
CREATE POLICY "Public insert attendance" ON attendance FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update attendance" ON attendance FOR UPDATE USING (true);
CREATE POLICY "Public delete attendance" ON attendance FOR DELETE USING (true);

CREATE POLICY "Public select members" ON members FOR SELECT USING (true);
CREATE POLICY "Public insert members" ON members FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update members" ON members FOR UPDATE USING (true);
CREATE POLICY "Public delete members" ON members FOR DELETE USING (true);

-- ============================================================
-- 8. SAMPLE DATA
-- ============================================================
INSERT INTO channels (name) VALUES 
  ('Math 101'),
  ('Science'),
  ('History'),
  ('Art & Design'),
  ('Computer Science')
ON CONFLICT DO NOTHING;

INSERT INTO statuses (username, content) VALUES 
  ('admin', 'Welcome to School Hub! 🎓'),
  ('teacher001', 'Office hours today 3-5 PM')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. VIEW (Optional)
-- ============================================================
CREATE OR REPLACE VIEW channel_stats AS
SELECT 
  c.id,
  c.name,
  COUNT(DISTINCT m.username) AS message_count,
  COUNT(DISTINCT a.student_name) AS attendance_count
FROM channels c
LEFT JOIN messages m ON c.id = m.channel_id
LEFT JOIN attendance a ON c.id = a.channel_id
GROUP BY c.id, c.name;

COMMENT ON VIEW channel_stats IS 'Aggregated channel statistics';