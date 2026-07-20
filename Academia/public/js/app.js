const API_BASE = '';

const SCHOOL_LOGOS = {
  'University for Development Studies': '/images/schools/uds.png',
  'University of Education, Winneba': '/images/schools/uew.png',
  'Ghana Institute of Management and Public Administration': '/images/schools/gimpa.png',
  'University of Mines and Technology': '/images/schools/umat.png',
  'University of Health and Allied Sciences': '/images/schools/uhas.png',
  'University of Energy and Natural Resources': '/images/schools/uenr.png'
};

const SCHOOL_SHORT = {
  'University for Development Studies': 'UDS',
  'University of Education, Winneba': 'UEW',
  'Ghana Institute of Management and Public Administration': 'GIMPA',
  'University of Mines and Technology': 'UMaT',
  'University of Health and Allied Sciences': 'UHAS',
  'University of Energy and Natural Resources': 'UENR'
};

function getSchoolLogo(school) {
  return SCHOOL_LOGOS[school] || '';
}

function getSchoolShort(school) {
  return SCHOOL_SHORT[school] || school || '';
}

function schoolBadge(school) {
  if (!school) return '';
  const logo = getSchoolLogo(school);
  const short = getSchoolShort(school);
  if (logo) {
    return `<span class="school-badge"><img src="${logo}" alt="${short}" class="school-badge-logo"> ${short}</span>`;
  }
  return `<span class="school-badge">${school}</span>`;
}

function showPreloader() {
  if (document.getElementById('preloader')) return;
  const preloader = document.createElement('div');
  preloader.id = 'preloader';
  preloader.className = 'preloader';
  preloader.innerHTML = `
    <img src="/images/logos/logo1.png" alt="Academia" class="preloader-logo">
    <img src="/images/logos/logo2.png" alt="Academia" class="preloader-logo-text">
    <div class="preloader-spinner"></div>
  `;
  document.body.prepend(preloader);
}

function hidePreloader() {
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.classList.add('hidden');
    setTimeout(() => preloader.remove(), 400);
  }
}

showPreloader();
window.addEventListener('load', () => setTimeout(hidePreloader, 600));

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

function checkAuth() {
  if (!getToken()) { window.location.href = '/'; return false; }
  return true;
}

function checkRole(...roles) {
  const user = getUser();
  if (!user || !roles.includes(user.role)) {
    window.location.href = '/dashboard';
    return false;
  }
  return true;
}

function logout() {
  fetch('/api/auth/logout', { method: 'POST' });
  localStorage.clear();
  window.location.href = '/';
}

const schoolLogos = {
  'University for Development Studies': '/images/schools/uds.png',
  'University of Education, Winneba': '/images/schools/uew.png',
  'Ghana Institute of Management and Public Administration': '/images/schools/gimpa.png',
  'University of Mines and Technology': '/images/schools/umat.png',
  'University of Health and Allied Sciences': '/images/schools/uhas.png',
  'University of Energy and Natural Resources': '/images/schools/uner.png'
};

function getSchoolLogo(school) {
  return schoolLogos[school] || '';
}

async function apiGet(url) {
  const res = await fetch(API_BASE + url, {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (res.status === 401 || res.status === 403) { logout(); return null; }
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(API_BASE + url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function apiPostForm(url, formData) {
  const res = await fetch(API_BASE + url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + getToken() },
    body: formData
  });
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(API_BASE + url, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  return res.json();
}

async function apiPut(url, body) {
  const res = await fetch(API_BASE + url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

function showToast(message, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast ' + type;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function renderSidebar(activePage) {
  const user = getUser();
  if (!user) return;

  const initials = user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  let navItems = '';
  const studentNav = `
    <div class="nav-section">Main</div>
    <a href="/dashboard" class="nav-item ${activePage==='dashboard'?'active':''}"><i data-lucide="layout-dashboard"></i>Dashboard</a>
    <a href="/courses" class="nav-item ${activePage==='courses'?'active':''}"><i data-lucide="book-open"></i>My Courses</a>
    <a href="/assignments" class="nav-item ${activePage==='assignments'?'active':''}"><i data-lucide="file-text"></i>Assignments</a>
    <a href="/calendar" class="nav-item ${activePage==='calendar'?'active':''}"><i data-lucide="calendar"></i>Calendar</a>
    <a href="/news" class="nav-item ${activePage==='news'?'active':''}"><i data-lucide="megaphone"></i>News & Announcements</a>
    <div class="nav-section">Resources</div>
    <a href="/courses?view=browse" class="nav-item ${activePage==='browse'?'active':''}"><i data-lucide="folder-open"></i>Browse Materials</a>
  `;

  const lecturerNav = `
    <div class="nav-section">Main</div>
    <a href="/dashboard" class="nav-item ${activePage==='dashboard'?'active':''}"><i data-lucide="layout-dashboard"></i>Dashboard</a>
    <a href="/courses" class="nav-item ${activePage==='courses'?'active':''}"><i data-lucide="book-open"></i>My Courses</a>
    <a href="/assignments" class="nav-item ${activePage==='assignments'?'active':''}"><i data-lucide="file-text"></i>Assignments & Exams</a>
    <a href="/calendar" class="nav-item ${activePage==='calendar'?'active':''}"><i data-lucide="calendar"></i>Calendar</a>
    <a href="/news" class="nav-item ${activePage==='news'?'active':''}"><i data-lucide="megaphone"></i>News</a>
  `;

  const adminNav = `
    <div class="nav-section">Main</div>
    <a href="/dashboard" class="nav-item ${activePage==='dashboard'?'active':''}"><i data-lucide="layout-dashboard"></i>Dashboard</a>
    <a href="/admin" class="nav-item ${activePage==='admin'?'active':''}"><i data-lucide="settings"></i>Admin Panel</a>
    <a href="/courses" class="nav-item ${activePage==='courses'?'active':''}"><i data-lucide="book-open"></i>All Courses</a>
    <a href="/assignments" class="nav-item ${activePage==='assignments'?'active':''}"><i data-lucide="file-text"></i>Assignments</a>
    <a href="/calendar" class="nav-item ${activePage==='calendar'?'active':''}"><i data-lucide="calendar"></i>Calendar</a>
    <a href="/news" class="nav-item ${activePage==='news'?'active':''}"><i data-lucide="megaphone"></i>News</a>
  `;

  let nav = user.role === 'admin' ? adminNav : user.role === 'lecturer' ? lecturerNav : studentNav;
  const schoolLogo = SCHOOL_LOGOS[user.school] || '';

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-header">
      <div class="logo-wrap">
        <img src="/images/logos/logo1.png" alt="Academia" class="sidebar-logo" onerror="this.style.display='none'">
        <img src="/images/logos/logo2.png" alt="Academia" class="sidebar-brand-logo">
      </div>
      ${schoolLogo ? `<div class="sidebar-school"><img src="${schoolLogo}" alt="${user.school}" class="school-logo"></div>` : ''}
      <div class="subtitle">${user.school || 'System'}</div>
    </div>
    <div class="sidebar-nav">${nav}</div>
    <div class="sidebar-footer">
      <div class="user-info">
        <div class="user-avatar">${initials}</div>
        <div class="user-details">
          <div class="user-name">${user.full_name}</div>
          <div class="user-role">${user.role.charAt(0).toUpperCase() + user.role.slice(1)} ${user.level || ''}</div>
        </div>
      </div>
      <button class="btn btn-outline btn-sm" style="width:100%;margin-top:12px;font-size:0.8rem;" onclick="logout()">
        <i data-lucide="log-out" style="width:14px;height:14px"></i> Sign Out
      </button>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
