const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'academia.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'lecturer', 'admin')),
    school TEXT NOT NULL,
    department TEXT,
    level TEXT,
    matric_number TEXT,
    identity_code TEXT UNIQUE,
    mfa_enabled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS mfa_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    challenge_token TEXT UNIQUE NOT NULL,
    otp_code TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    level TEXT NOT NULL CHECK(level IN ('L100','L200','L300','L400')),
    school TEXT NOT NULL,
    department TEXT,
    semester TEXT NOT NULL CHECK(semester IN ('first', 'second')),
    academic_year TEXT DEFAULT '2025/2026',
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
    lecturer_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lecturer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    UNIQUE(student_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    file_type TEXT,
    uploaded_by INTEGER NOT NULL,
    level TEXT,
    semester TEXT,
    academic_year TEXT,
    category TEXT CHECK(category IN ('lecture_note','textbook','past_question','video','slide','other')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATETIME NOT NULL,
    total_marks INTEGER DEFAULT 100,
    attachment_path TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    file_path TEXT,
    notes TEXT,
    grade INTEGER,
    feedback TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    UNIQUE(assignment_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS midsem_exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    exam_date DATETIME NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    total_marks INTEGER DEFAULT 50,
    venue TEXT,
    instructions TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_date DATETIME NOT NULL,
    end_date DATETIME,
    event_type TEXT CHECK(event_type IN ('exam','assignment','lecture','deadline','event','holiday')),
    course_id INTEGER,
    school TEXT,
    created_by INTEGER NOT NULL,
    status TEXT DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT CHECK(category IN ('announcement','event','update','urgent')),
    school TEXT,
    image_path TEXT,
    published_by INTEGER NOT NULL,
    status TEXT DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected')),
    is_pinned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (published_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    ip_address TEXT,
    success INTEGER DEFAULT 0,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier, attempted_at);
`);

const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!existingAdmin) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO users (full_name, email, password, role, school, department) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('System Admin', 'admin@academia.edu', hashedPassword, 'admin', 'All', 'Administration');
  console.log('Default admin created: admin@academia.edu / admin123');
}

// Migration: add status/academic_year columns if missing
try { db.exec("ALTER TABLE courses ADD COLUMN status TEXT DEFAULT 'draft'"); } catch(e) {}
try { db.exec("ALTER TABLE courses ADD COLUMN academic_year TEXT DEFAULT '2025/2026'"); } catch(e) {}
try { db.exec("ALTER TABLE news ADD COLUMN status TEXT DEFAULT 'approved'"); } catch(e) {}
try { db.exec("ALTER TABLE calendar_events ADD COLUMN status TEXT DEFAULT 'approved'"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN identity_code TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("UPDATE users SET mfa_enabled = 0 WHERE mfa_enabled IS NULL OR mfa_enabled = 1"); } catch(e) {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_identity_code ON users(identity_code)"); } catch(e) {}
// Mark all existing courses as published so they remain visible
try { db.exec("UPDATE courses SET status = 'published' WHERE status IS NULL OR status = ''"); } catch(e) {}
// Mark all existing news/events as approved
try { db.exec("UPDATE news SET status = 'approved' WHERE status IS NULL OR status = ''"); } catch(e) {}
try { db.exec("UPDATE calendar_events SET status = 'approved' WHERE status IS NULL OR status = ''"); } catch(e) {}

// Seed identity codes for accounts that do not already have them
try {
  const usersWithoutCode = db.prepare('SELECT id, role, full_name FROM users WHERE identity_code IS NULL OR identity_code = ?').all('',);
  for (const user of usersWithoutCode) {
    const prefix = user.role === 'student' ? 'STU' : 'STA';
    const code = `${prefix}-${String(user.id).padStart(5, '0')}`;
    db.prepare('UPDATE users SET identity_code = ? WHERE id = ?').run(code, user.id);
  }
} catch(e) {}

module.exports = db;
