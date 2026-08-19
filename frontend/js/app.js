const State = {
  user: null,
  memberships: [],   // [{ role, schools: {...} }]
  school: null,
  role: null,
  view: 'dashboard'
};

const NAV_BY_ROLE = {
  admin: [
    ['dashboard', 'Tableau de bord'],
    ['classes', 'Classes & matières'],
    ['schedule', 'Emploi du temps'],
    ['homework', 'Devoirs'],
    ['grades', 'Notes'],
    ['announcements', 'Annonces'],
    ['members', 'Membres de l\u2019école']
  ],
  prof: [
    ['dashboard', 'Tableau de bord'],
    ['schedule', 'Emploi du temps'],
    ['homework', 'Devoirs'],
    ['grades', 'Notes'],
    ['announcements', 'Annonces']
  ],
  eleve: [
    ['dashboard', 'Tableau de bord'],
    ['schedule', 'Emploi du temps'],
    ['homework', 'Devoirs'],
    ['grades', 'Mes notes'],
    ['announcements', 'Annonces']
  ],
  parent: [
    ['dashboard', 'Portail parent'],
    ['announcements', 'Annonces']
  ]
};

async function boot() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData.session) {
    window.location.href = 'index.html';
    return;
  }
  State.user = sessionData.session.user;

  const memberships = await Api.get('/schools/mine');
  State.memberships = memberships;

  if (memberships.length === 0) {
    renderNoSchool();
    return;
  }

  // Sélectionne la première école/rôle par défaut
  const first = memberships[0];
  setActiveSchool(first.schools.id, first.role);
}

function setActiveSchool(schoolId, role) {
  const m = State.memberships.find((x) => x.schools.id === schoolId && x.role === role);
  State.school = m.schools;
  State.role = role;
  Api.currentSchoolId = schoolId;

  document.getElementById('school-name').textContent = State.school.name;
  document.getElementById('user-name').textContent =
    State.user.user_metadata?.full_name || State.user.email;
  document.getElementById('user-role').textContent = roleLabel(role);

  renderNav();
  navigateTo('dashboard');
}

function roleLabel(role) {
  return { admin: 'Administration', prof: 'Professeur', eleve: 'Élève', parent: 'Parent' }[role] || role;
}

function renderNav() {
  const nav = document.getElementById('nav-group');
  const items = NAV_BY_ROLE[State.role] || [];
  nav.innerHTML = items
    .map(
      ([key, label]) =>
        `<div class="nav-item ${State.view === key ? 'active' : ''}" data-view="${key}">${label}</div>`
    )
    .join('');
  nav.querySelectorAll('.nav-item').forEach((el) => {
    el.addEventListener('click', () => navigateTo(el.dataset.view));
  });
}

function navigateTo(view) {
  State.view = view;
  renderNav();
  const container = document.getElementById('main-content');
  container.innerHTML = '<div class="empty-state">Chargement…</div>';

  const renderers = {
    dashboard: Views.renderDashboard,
    classes: Views.renderClasses,
    schedule: Views.renderSchedule,
    homework: Views.renderHomework,
    grades: Views.renderGrades,
    announcements: Views.renderAnnouncements,
    members: Views.renderMembers
  };
  const fn = renderers[view];
  if (fn) fn(container).catch((err) => {
    console.error(err);
    container.innerHTML = `<div class="empty-state">Une erreur est survenue : ${err.error || err.message || 'inconnue'}</div>`;
  });
}

function renderNoSchool() {
  document.getElementById('main-content').innerHTML = `
    <div class="empty-state">
      <p>Vous n'êtes rattaché à aucune école pour le moment.</p>
      <p>Demandez à l'administrateur de votre établissement de vous ajouter, ou créez votre propre école ci-dessous.</p>
      <button class="btn-primary" id="create-school-btn" style="margin-top:16px;">Créer une école</button>
    </div>`;
  document.getElementById('create-school-btn').addEventListener('click', async () => {
    const name = prompt('Nom de l\u2019école :');
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await Api.post('/schools', { name, slug, country: 'BJ' });
    boot();
  });
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
}
document.getElementById('modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') closeModal();
});

boot();
