require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./models/database');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const coursesRoutes = require('./routes/courses');
const assignmentsRoutes = require('./routes/assignments');
const calendarRoutes = require('./routes/calendar');
const newsRoutes = require('./routes/news');
const adminRoutes = require('./routes/admin');
const { authenticateToken, authorizeRoles } = require('./middleware/auth');
const jwt = require('jsonwebtoken');
const { logAudit } = require('./utils/security');

const app = express();
const PORT = process.env.PORT || 3000;

function pageAuth(req, res, next) {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.redirect('/');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie('token');
    res.redirect('/');
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.redirect('/dashboard');
    next();
  };
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/courses', authenticateToken, coursesRoutes);
app.use('/api/assignments', authenticateToken, assignmentsRoutes);
app.use('/api/calendar', authenticateToken, calendarRoutes);
app.use('/api/news', authenticateToken, newsRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', pageAuth, (req, res) => {
  logAudit('view_dashboard', { userId: req.user?.id }, req.user?.id || null);
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/courses', pageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'courses.html'));
});

app.get('/assignments', pageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'assignments.html'));
});

app.get('/calendar', pageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calendar.html'));
});

app.get('/news', pageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'news.html'));
});

app.get('/admin', pageAuth, requireRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  logAudit('server_error', { message: err.message, path: req.originalUrl }, req.user?.id || null);
  res.status(err.statusCode || 500).json({ error: 'An unexpected error occurred.' });
});

app.listen(PORT, () => {
  console.log(`Academia server running on http://localhost:${PORT}`);
});
