/* ========== ADMIN PAGE ========== */

if (checkAuth() && checkRole('admin')) {
  renderSidebar('admin');
  loadAdminStats();
  loadUsers();
  loadCompilation();
  loadNewsApproval();
  loadEventsApproval();
}

function showAdminTab(tab, clickedElement) {
  document.querySelectorAll('#admin-tabs .level-tab').forEach(t => t.classList.remove('active'));
  if (clickedElement) {
    clickedElement.classList.add('active');
  } else {
    const fallback = document.querySelector(`#admin-tabs .level-tab[data-tab="${tab}"]`);
    if (fallback) fallback.classList.add('active');
  }
  ['users','compilation','news-approval','events-approval'].forEach(t => {
    const el = document.getElementById(t + '-tab');
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
}

async function loadAdminStats() {
  const data = await apiGet('/api/admin/stats');
  if (!data) return;
  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-card"><div class="stat-icon blue"><i data-lucide="users"></i></div><div class="stat-info"><h3>${data.total_students}</h3><p>Students</p></div></div>
    <div class="stat-card"><div class="stat-icon green"><i data-lucide="briefcase"></i></div><div class="stat-info"><h3>${data.total_lecturers}</h3><p>Lecturers</p></div></div>
    <div class="stat-card"><div class="stat-icon orange"><i data-lucide="book-open"></i></div><div class="stat-info"><h3>${data.published_courses} / ${data.total_courses}</h3><p>Published / Total Courses</p></div></div>
    <div class="stat-card"><div class="stat-icon purple"><i data-lucide="bell"></i></div><div class="stat-info"><h3>${data.pending_news}</h3><p>Pending News</p></div></div>
    <div class="stat-card"><div class="stat-icon green"><i data-lucide="calendar"></i></div><div class="stat-info"><h3>${data.pending_events}</h3><p>Pending Events</p></div></div>
  `;
  lucide.createIcons();
}

async function loadUsers() {
  const users = await apiGet('/api/admin/users');
  if (!users) return;
  document.getElementById('users-body').innerHTML = users.map(u => `
    <tr>
      <td>${u.full_name}</td>
      <td>${u.email}</td>
      <td><span class="badge badge-${u.role==='admin'?'danger':u.role==='lecturer'?'success':'primary'}">${u.role}</span></td>
      <td>${schoolBadge(u.school)}</td>
      <td>${u.level || '-'}</td>
      <td>${u.matric_number || '-'}</td>
      <td>${u.role !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Delete</button>` : '<span style="color:var(--text-secondary);font-size:0.85rem">Protected</span>'}</td>
    </tr>
  `).join('');
}

async function loadCompilation() {
  const status = document.getElementById('comp-status-filter').value;
  const params = status ? `?status=${status}` : '';
  const courses = await apiGet('/api/admin/courses' + params);
  if (!courses) return;
  document.getElementById('compilation-body').innerHTML = courses.map(c => `
    <tr>
      <td><strong>${c.code}</strong></td>
      <td>${c.title}</td>
      <td><span class="badge badge-primary">${c.level}</span></td>
      <td>${c.semester === 'first' ? 'First' : 'Second'}</td>
      <td>${c.lecturer_name || 'TBA'}</td>
      <td>${schoolBadge(c.school)}</td>
      <td><span class="badge badge-${c.status==='published'?'success':'warning'}">${c.status}</span></td>
      <td>${c.enrolled_count || 0}</td>
      <td>
        ${c.status === 'draft'
          ? `<button class="btn btn-success btn-sm" onclick="publishCourse(${c.id})">Publish</button>`
          : `<button class="btn btn-warning btn-sm" onclick="unpublishCourse(${c.id})">Unpublish</button>`}
        <button class="btn btn-danger btn-sm" onclick="deleteCourse(${c.id})">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text-secondary)">No courses found</td></tr>';
}

async function loadNewsApproval() {
  const status = document.getElementById('news-status-filter').value;
  const params = status ? `?status=${status}` : '';
  const news = await apiGet('/api/admin/news' + params);
  if (!news) return;
  document.getElementById('news-approval-body').innerHTML = news.map(n => `
    <tr>
      <td><strong>${n.title}</strong></td>
      <td>${n.author}</td>
      <td><span class="badge badge-primary">${n.category || 'General'}</span></td>
      <td>${n.school || 'All'}</td>
      <td><span class="badge badge-${n.status==='approved'?'success':n.status==='rejected'?'danger':'warning'}">${n.status}</span></td>
      <td>${new Date(n.created_at).toLocaleDateString()}</td>
      <td>${n.status === 'pending'
        ? `<button class="btn btn-success btn-sm" onclick="approveNews(${n.id})">Approve</button>
           <button class="btn btn-danger btn-sm" onclick="rejectNews(${n.id})">Reject</button>`
        : `<span style="color:var(--text-secondary);font-size:0.85rem">${n.status === 'approved' ? 'Approved' : 'Rejected'}</span>`}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary)">No news found</td></tr>';
}

async function loadEventsApproval() {
  const status = document.getElementById('events-status-filter').value;
  const params = status ? `?status=${status}` : '';
  const events = await apiGet('/api/admin/events' + params);
  if (!events) return;
  document.getElementById('events-approval-body').innerHTML = events.map(e => `
    <tr>
      <td><strong>${e.title}</strong></td>
      <td>${e.created_by_name}</td>
      <td><span class="badge badge-primary">${e.event_type || 'event'}</span></td>
      <td>${new Date(e.event_date).toLocaleDateString()}</td>
      <td>${e.course_code || '-'}</td>
      <td>${e.school || 'All'}</td>
      <td><span class="badge badge-${e.status==='approved'?'success':e.status==='rejected'?'danger':'warning'}">${e.status}</span></td>
      <td>${e.status === 'pending'
        ? `<button class="btn btn-success btn-sm" onclick="approveEvent(${e.id})">Approve</button>
           <button class="btn btn-danger btn-sm" onclick="rejectEvent(${e.id})">Reject</button>`
        : `<span style="color:var(--text-secondary);font-size:0.85rem">${e.status === 'approved' ? 'Approved' : 'Rejected'}</span>`}</td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary)">No events found</td></tr>';
}

async function addUser(e) {
  e.preventDefault();
  const res = await apiPost('/api/admin/users', {
    full_name: document.getElementById('au-name').value,
    email: document.getElementById('au-email').value,
    password: document.getElementById('au-pass').value,
    role: document.getElementById('au-role').value,
    school: document.getElementById('au-school').value,
    department: document.getElementById('au-dept').value,
    matric_number: document.getElementById('au-matric').value,
  });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('User added!', 'success');
  hideModal('add-user-modal');
  loadUsers();
  loadAdminStats();
}

async function deleteUser(id) {
  if (!confirm('Delete this user?')) return;
  const res = await apiDelete(`/api/admin/users/${id}`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadUsers();
  loadAdminStats();
}

async function publishCourse(id) {
  const res = await apiPut(`/api/admin/courses/${id}/publish`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadCompilation();
  loadAdminStats();
}

async function unpublishCourse(id) {
  const res = await apiPut(`/api/admin/courses/${id}/unpublish`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadCompilation();
  loadAdminStats();
}

async function deleteCourse(id) {
  if (!confirm('Delete this course? This cannot be undone.')) return;
  const res = await apiDelete(`/api/admin/courses/${id}`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadCompilation();
  loadAdminStats();
}

async function approveNews(id) {
  const res = await apiPut(`/api/admin/news/${id}/approve`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadNewsApproval();
  loadAdminStats();
}

async function rejectNews(id) {
  if (!confirm('Reject this news submission?')) return;
  const res = await apiPut(`/api/admin/news/${id}/reject`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadNewsApproval();
  loadAdminStats();
}

async function approveEvent(id) {
  const res = await apiPut(`/api/admin/events/${id}/approve`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadEventsApproval();
  loadAdminStats();
}

async function rejectEvent(id) {
  if (!confirm('Reject this event submission?')) return;
  const res = await apiPut(`/api/admin/events/${id}/reject`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadEventsApproval();
  loadAdminStats();
}

function showModal(id) { document.getElementById(id).classList.add('active'); }
function hideModal(id) { document.getElementById(id).classList.remove('active'); }
