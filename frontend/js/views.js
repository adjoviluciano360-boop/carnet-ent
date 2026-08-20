const Views = {};
const DAYS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// ============================================================
// DASHBOARD
// ============================================================
Views.renderDashboard = async function (container) {
  if (State.role === 'admin') return Views._dashboardAdmin(container);
  if (State.role === 'prof') return Views._dashboardProf(container);
  if (State.role === 'eleve') return Views._dashboardEleve(container);
  if (State.role === 'parent') return Views._dashboardParent(container);
};

Views._dashboardAdmin = async function (container) {
  const classes = await Api.get('/classes');
  const members = await Api.get('/schools/' + State.school.id + '/members');
  const byRole = { admin: 0, prof: 0, eleve: 0, parent: 0 };
  members.forEach((m) => byRole[m.role]++);

  container.innerHTML = `
    <div class="main-header"><h1 class="main-title">Tableau de bord</h1></div>
    <hr class="ruled" />
    <div class="grid grid-3">
      <div class="card"><div class="card-eyebrow">Classes</div><div class="score-big">${classes.length}</div></div>
      <div class="card"><div class="card-eyebrow">Élèves</div><div class="score-big">${byRole.eleve}</div></div>
      <div class="card"><div class="card-eyebrow">Professeurs</div><div class="score-big">${byRole.prof}</div></div>
    </div>
    <div class="grid grid-3" style="margin-top:20px;">
      <div class="card"><div class="card-eyebrow">Parents</div><div class="score-big">${byRole.parent}</div></div>
      <div class="card"><div class="card-eyebrow">École</div><div style="font-family:var(--font-display);font-size:1.3rem;">${esc(State.school.name)}</div></div>
      <div class="card"><div class="card-eyebrow">Année scolaire</div><div style="font-size:1.3rem;">${classes[0]?.school_year || '—'}</div></div>
    </div>
  `;
};

Views._dashboardProf = async function (container) {
  const myClasses = await Api.get('/classes/my/prof');
  container.innerHTML = `
    <div class="main-header"><h1 class="main-title">Bonjour ${esc(firstName())}</h1></div>
    <hr class="ruled" />
    <div class="card">
      <div class="card-title">Mes classes</div>
      ${myClasses.length === 0 ? '<div class="empty-state">Aucune classe assignée pour l\'instant.</div>' :
        myClasses.map((c) => `
          <div class="list-row">
            <span>${esc(c.classes.name)} — ${esc(c.subjects.name)}</span>
            <span class="pill pill-sage">${esc(c.classes.level || '')}</span>
          </div>`).join('')}
    </div>
  `;
};

Views._dashboardEleve = async function (container) {
  const homework = await Api.get(`/homework/student/${State.user.id}/upcoming`);
  const averages = await Api.get(`/grades/student/${State.user.id}/average`);
  container.innerHTML = `
    <div class="main-header"><h1 class="main-title">Bonjour ${esc(firstName())}</h1></div>
    <hr class="ruled" />
    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Devoirs à venir</div>
        ${homework.length === 0 ? '<div class="empty-state">Rien à faire pour l\'instant \u2014 profitez-en !</div>' :
          homework.slice(0, 6).map((h) => `
            <div class="list-row">
              <span>${esc(h.title)} <span class="pill pill-amber">${esc(h.subjects.name)}</span></span>
              <span>${fmtDate(h.due_date)}</span>
            </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title">Mes moyennes</div>
        ${averages.length === 0 ? '<div class="empty-state">Aucune note pour l\'instant.</div>' :
          averages.map((a) => `
            <div class="list-row">
              <span>${esc(a.subject_name)}</span>
              <span class="score-big" style="font-size:1rem;">${a.average ?? '—'}/20</span>
            </div>`).join('')}
      </div>
    </div>
  `;
};

Views._dashboardParent = async function (container) {
  const children = await Api.get('/parent/children');
  if (children.length === 0) {
    container.innerHTML = `<div class="main-header"><h1 class="main-title">Portail parent</h1></div><hr class="ruled"/>
      <div class="empty-state">Aucun enfant n'est encore lié à votre compte. Contactez l'administration de l'école.</div>`;
    return;
  }
  const overviews = await Promise.all(
    children.map((c) => Api.get(`/parent/children/${c.child_id}/overview`))
  );

  container.innerHTML = `
    <div class="main-header"><h1 class="main-title">Portail parent</h1></div>
    <hr class="ruled" />
    ${children.map((c, i) => {
      const o = overviews[i];
      return `
      <div class="card" style="margin-bottom:24px;">
        <div class="card-title">
          ${esc(c.profiles.full_name)}
          <span class="pill pill-sage">${esc(o.class?.name || 'Sans classe')}</span>
        </div>
        <div class="grid grid-2">
          <div>
            <div class="card-eyebrow">Notes récentes</div>
            ${o.recentGrades.length === 0 ? '<div class="empty-state">Aucune note.</div>' :
              o.recentGrades.slice(0, 5).map((g) => `
                <div class="list-row"><span>${esc(g.label)} — ${esc(g.subjects.name)}</span><span>${g.score}/${g.max_score}</span></div>
              `).join('')}
          </div>
          <div>
            <div class="card-eyebrow">Devoirs à venir</div>
            ${o.upcomingHomework.length === 0 ? '<div class="empty-state">Rien à venir.</div>' :
              o.upcomingHomework.slice(0, 5).map((h) => `
                <div class="list-row"><span>${esc(h.title)}</span><span>${fmtDate(h.due_date)}</span></div>
              `).join('')}
          </div>
        </div>
      </div>`;
    }).join('')}
  `;
};

function firstName() {
  const n = State.user.user_metadata?.full_name || State.user.email;
  return n.split(' ')[0];
}

// ============================================================
// FILIÈRES, CLASSES (SALLES) & MATIÈRES (admin)
// ============================================================
Views.renderClasses = async function (container) {
  const [tracks, subjects] = await Promise.all([Api.get('/classes/tracks/all'), Api.get('/classes/subjects/all')]);

  container.innerHTML = `
    <div class="main-header">
      <h1 class="main-title">Filières, classes & matières</h1>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary" id="add-track-btn">+ Filière</button>
        <button class="btn-secondary" id="add-subject-btn">+ Matière</button>
        <button class="btn-primary" id="add-class-btn">+ Salle</button>
      </div>
    </div>
    <hr class="ruled" />
    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Filières & salles</div>
        <div id="tracks-holder"><div class="empty-state">Chargement…</div></div>
      </div>
      <div class="card">
        <div class="card-title">Matières (${subjects.length})</div>
        ${subjects.length === 0 ? '<div class="empty-state">Aucune matière. Créez-en une.</div>' :
          subjects.map((s) => `
            <div class="list-row">
              <span>${esc(s.name)}</span>
              <button class="link-btn" data-subject-weights="${s.id}" data-subject-name="${esc(s.name)}"
                data-iw="${s.interro_weight ?? ''}" data-dw="${s.devoir_weight ?? ''}">Coefficients</button>
            </div>`).join('')}
      </div>
    </div>
  `;

  await Views._loadTracks();

  document.querySelectorAll('[data-subject-weights]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openModal(`
        <h3>Coefficients — ${esc(btn.dataset.subjectName)}</h3>
        <p style="font-size:0.82rem;color:var(--ink-soft);">Laisser vide pour utiliser le réglage par défaut de l'école.</p>
        <label>Poids interro<input id="m-iw" type="number" step="0.5" value="${btn.dataset.iw}" placeholder="Ex : 1" /></label>
        <label>Poids devoir<input id="m-dw" type="number" step="0.5" value="${btn.dataset.dw}" placeholder="Ex : 2" /></label>
        <div class="modal-actions">
          <button class="link-btn" id="m-cancel">Annuler</button>
          <button class="btn-primary" id="m-save">Enregistrer</button>
        </div>`);
      document.getElementById('m-cancel').addEventListener('click', closeModal);
      document.getElementById('m-save').addEventListener('click', async () => {
        const iw = document.getElementById('m-iw').value;
        const dw = document.getElementById('m-dw').value;
        await Api.put(`/classes/subjects/${btn.dataset.subjectWeights}/weights`, {
          interro_weight: iw === '' ? null : Number(iw),
          devoir_weight: dw === '' ? null : Number(dw)
        });
        closeModal();
        navigateTo('classes');
      });
    });
  });

  document.getElementById('add-track-btn').addEventListener('click', () => {
    openModal(`
      <h3>Nouvelle filière</h3>
      <label>Nom<input id="m-name" placeholder="Ex : IMI" /></label>
      <div class="modal-actions">
        <button class="link-btn" id="m-cancel">Annuler</button>
        <button class="btn-primary" id="m-save">Créer</button>
      </div>`);
    document.getElementById('m-cancel').addEventListener('click', closeModal);
    document.getElementById('m-save').addEventListener('click', async () => {
      await Api.post('/classes/tracks', { name: document.getElementById('m-name').value });
      closeModal();
      navigateTo('classes');
    });
  });

  document.getElementById('add-class-btn').addEventListener('click', () => {
    openModal(`
      <h3>Nouvelle salle</h3>
      <label>Filière<select id="m-track">
        <option value="">— Aucune —</option>
        ${tracks.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
      </select></label>
      <label>Nom<input id="m-name" placeholder="Ex : Second IMI-1" /></label>
      <label>Niveau<input id="m-level" placeholder="Ex : Seconde" /></label>
      <label>Année scolaire<input id="m-year" placeholder="Ex : 2026-2027" value="2026-2027" /></label>
      <div class="modal-actions">
        <button class="link-btn" id="m-cancel">Annuler</button>
        <button class="btn-primary" id="m-save">Créer</button>
      </div>`);
    document.getElementById('m-cancel').addEventListener('click', closeModal);
    document.getElementById('m-save').addEventListener('click', async () => {
      await Api.post('/classes', {
        name: document.getElementById('m-name').value,
        level: document.getElementById('m-level').value,
        school_year: document.getElementById('m-year').value,
        track_id: document.getElementById('m-track').value || null
      });
      closeModal();
      navigateTo('classes');
    });
  });

  document.getElementById('add-subject-btn').addEventListener('click', () => {
    openModal(`
      <h3>Nouvelle matière</h3>
      <label>Nom<input id="m-name" placeholder="Ex : Mathématiques" /></label>
      <div class="modal-actions">
        <button class="link-btn" id="m-cancel">Annuler</button>
        <button class="btn-primary" id="m-save">Créer</button>
      </div>`);
    document.getElementById('m-cancel').addEventListener('click', closeModal);
    document.getElementById('m-save').addEventListener('click', async () => {
      await Api.post('/classes/subjects', { name: document.getElementById('m-name').value });
      closeModal();
      navigateTo('classes');
    });
  });
};

Views._loadTracks = async function () {
  const holder = document.getElementById('tracks-holder');
  const classes = await Api.get('/classes');
  const tracks = await Api.get('/classes/tracks/all');

  const byTrack = {};
  const noTrack = [];
  classes.forEach((c) => {
    if (c.track_id) {
      (byTrack[c.track_id] ??= []).push(c);
    } else noTrack.push(c);
  });

  if (tracks.length === 0 && classes.length === 0) {
    holder.innerHTML = '<div class="empty-state">Aucune filière ni salle. Commencez par créer une filière.</div>';
    return;
  }

  holder.innerHTML = `
    ${tracks.map((t) => `
      <div style="margin-bottom:14px;">
        <div class="card-eyebrow">${esc(t.name)}</div>
        ${(byTrack[t.id] || []).length === 0 ? '<div class="empty-state" style="padding:10px 0;">Aucune salle.</div>' :
          (byTrack[t.id] || []).map((c) => `
            <div class="list-row"><span>${esc(c.name)}</span><span class="pill pill-sage">${esc(c.level || '')}</span></div>
          `).join('')}
      </div>
    `).join('')}
    ${noTrack.length > 0 ? `
      <div>
        <div class="card-eyebrow">Sans filière</div>
        ${noTrack.map((c) => `<div class="list-row"><span>${esc(c.name)}</span></div>`).join('')}
      </div>` : ''}
  `;
};

// ============================================================
// EMPLOI DU TEMPS
// ============================================================
Views.renderSchedule = async function (container) {
  let classes = [];
  if (State.role === 'admin') classes = await Api.get('/classes');
  else if (State.role === 'eleve') classes = await Api.get('/classes/my/eleve').then((r) => r);
  // pour prof/parent on gère différemment plus bas

  const classOptions = classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  container.innerHTML = `
    <div class="main-header">
      <h1 class="main-title">Emploi du temps</h1>
      ${State.role === 'admin' ? '<button class="btn-primary" id="add-slot-btn">+ Créneau</button>' : ''}
    </div>
    <hr class="ruled" />
    ${classes.length > 1 ? `<label style="font-size:0.85rem;font-weight:600;">Classe
      <select id="class-select" style="margin-left:8px;padding:6px 10px;border-radius:8px;border:1px solid var(--paper-line);">${classOptions}</select>
    </label><div style="height:16px;"></div>` : ''}
    <div id="timetable-holder"></div>
  `;

  const classId = classes[0]?.id;
  if (classId) await Views._loadTimetable(classId);

  const select = document.getElementById('class-select');
  if (select) select.addEventListener('change', (e) => Views._loadTimetable(e.target.value));

  const addBtn = document.getElementById('add-slot-btn');
  if (addBtn) addBtn.addEventListener('click', async () => {
    const subjects = await Api.get('/classes/subjects/all');
    const teachers = await Api.get(`/schools/${State.school.id}/members?role=prof`);
    openModal(`
      <h3>Nouveau créneau</h3>
      <label>Classe<select id="m-class">${classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <label>Matière<select id="m-subject">${subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <label>Professeur<select id="m-teacher">${teachers.map((t) => `<option value="${t.profiles.id}">${esc(t.profiles.full_name)}</option>`).join('')}</select></label>
      <label>Jour<select id="m-day">
        <option value="1">Lundi</option><option value="2">Mardi</option><option value="3">Mercredi</option>
        <option value="4">Jeudi</option><option value="5">Vendredi</option><option value="6">Samedi</option>
      </select></label>
      <label>Heure de début<input id="m-start" type="time" value="08:00" /></label>
      <label>Heure de fin<input id="m-end" type="time" value="09:00" /></label>
      <label>Salle<input id="m-room" placeholder="Ex : Salle 12" /></label>
      <div class="modal-actions">
        <button class="link-btn" id="m-cancel">Annuler</button>
        <button class="btn-primary" id="m-save">Ajouter</button>
      </div>`);
    document.getElementById('m-cancel').addEventListener('click', closeModal);
    document.getElementById('m-save').addEventListener('click', async () => {
      const cid = document.getElementById('m-class').value;
      await Api.post('/schedule', {
        class_id: cid,
        subject_id: document.getElementById('m-subject').value,
        teacher_id: document.getElementById('m-teacher').value,
        day_of_week: Number(document.getElementById('m-day').value),
        start_time: document.getElementById('m-start').value,
        end_time: document.getElementById('m-end').value,
        room: document.getElementById('m-room').value
      });
      closeModal();
      Views._loadTimetable(cid);
    });
  });
};

Views._loadTimetable = async function (classId) {
  const holder = document.getElementById('timetable-holder');
  holder.innerHTML = '<div class="empty-state">Chargement…</div>';
  const slots = await Api.get(`/schedule/class/${classId}`);

  const byDay = {};
  for (let d = 1; d <= 6; d++) byDay[d] = [];
  slots.forEach((s) => byDay[s.day_of_week]?.push(s));

  holder.innerHTML = `
    <div class="timetable">
      <div class="timetable-head"></div>
      ${[1,2,3,4,5,6].map((d) => `<div class="timetable-head">${DAYS[d]}</div>`).join('')}
      <div class="timetable-cell"></div>
      ${[1,2,3,4,5,6].map((d) => `
        <div class="timetable-cell">
          ${byDay[d].map((s) => `
            <div class="timetable-slot" style="border-left-color:${esc(s.subjects?.color || '#C99A3E')};">
              <div class="sub">${esc(s.subjects?.name || '')}</div>
              <div class="meta">${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)} · ${esc(s.room || '')}</div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
    ${slots.length === 0 ? '<div class="empty-state">Aucun créneau programmé pour cette classe.</div>' : ''}
  `;
};

// ============================================================
// DEVOIRS
// ============================================================
Views.renderHomework = async function (container) {
  const canCreate = State.role === 'prof' || State.role === 'admin';
  let classes = [];
  if (State.role === 'prof') classes = (await Api.get('/classes/my/prof')).map((c) => c.classes);
  else if (State.role === 'admin') classes = await Api.get('/classes');
  else if (State.role === 'eleve') classes = await Api.get('/classes/my/eleve');

  container.innerHTML = `
    <div class="main-header">
      <h1 class="main-title">Devoirs</h1>
      ${canCreate ? '<button class="btn-primary" id="add-hw-btn">+ Devoir</button>' : ''}
    </div>
    <hr class="ruled" />
    <div id="hw-holder"><div class="empty-state">Chargement…</div></div>
  `;

  if (State.role === 'eleve') {
    const hw = await Api.get(`/homework/student/${State.user.id}/upcoming`);
    Views._renderHwList(hw, true);
  } else if (classes[0]) {
    const hw = await Api.get(`/homework/class/${classes[0].id}`);
    Views._renderHwList(hw, false);
  } else {
    document.getElementById('hw-holder').innerHTML = '<div class="empty-state">Aucune classe disponible.</div>';
  }

  const addBtn = document.getElementById('add-hw-btn');
  if (addBtn) addBtn.addEventListener('click', async () => {
    const subjects = await Api.get('/classes/subjects/all');
    openModal(`
      <h3>Nouveau devoir</h3>
      <label>Classe<select id="m-class">${classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <label>Matière<select id="m-subject">${subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <label>Titre<input id="m-title" placeholder="Ex : Exercices p.42" /></label>
      <label>Description<textarea id="m-desc" rows="3"></textarea></label>
      <label>Date limite<input id="m-due" type="date" /></label>
      <div class="modal-actions">
        <button class="link-btn" id="m-cancel">Annuler</button>
        <button class="btn-primary" id="m-save">Publier</button>
      </div>`);
    document.getElementById('m-cancel').addEventListener('click', closeModal);
    document.getElementById('m-save').addEventListener('click', async () => {
      const cid = document.getElementById('m-class').value;
      await Api.post('/homework', {
        class_id: cid,
        subject_id: document.getElementById('m-subject').value,
        title: document.getElementById('m-title').value,
        description: document.getElementById('m-desc').value,
        due_date: document.getElementById('m-due').value
      });
      closeModal();
      const hw = await Api.get(`/homework/class/${cid}`);
      Views._renderHwList(hw, false);
    });
  });
};

Views._renderHwList = function (hw, isStudentView) {
  const holder = document.getElementById('hw-holder');
  if (hw.length === 0) {
    holder.innerHTML = '<div class="empty-state">Aucun devoir pour l\'instant.</div>';
    return;
  }
  holder.innerHTML = hw.map((h) => `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-title">
        ${esc(h.title)}
        <span class="pill pill-amber">${esc(h.subjects?.name || '')}</span>
      </div>
      ${h.description ? `<p style="font-size:0.88rem;color:var(--ink-soft);">${esc(h.description)}</p>` : ''}
      <div class="list-row"><span>À rendre pour</span><span>${fmtDate(h.due_date)}</span></div>
    </div>
  `).join('');
};

// ============================================================
// NOTES
// ============================================================
Views.renderGrades = async function (container) {
  if (State.role === 'eleve') {
    const bulletin = await Api.get(`/grades/student/${State.user.id}/bulletin`);
    Views._renderBulletin(container, bulletin, 'Mon bulletin');
    return;
  }

  // prof / admin : saisie de notes + assistant IA + consultation bulletin par élève
  let classes = [];
  if (State.role === 'prof') classes = await Api.get('/classes/my/prof');
  else classes = (await Api.get('/classes')).map((c) => ({ classes: c, subjects: null }));

  container.innerHTML = `
    <div class="main-header">
      <h1 class="main-title">Notes</h1>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary" id="ai-grade-btn">💬 Assistant IA</button>
        <button class="btn-primary" id="add-grade-btn">+ Saisir une note</button>
      </div>
    </div>
    <hr class="ruled" />
    <div class="card">
      <div class="card-title">Voir le bulletin d'un élève</div>
      <label>Classe<select id="bulletin-class">${(State.role === 'admin' ? await Api.get('/classes') : classes.map((c) => c.classes)).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <div id="bulletin-students-holder" style="margin-top:10px;"></div>
    </div>
    <div id="bulletin-view-holder" style="margin-top:24px;"></div>
  `;

  const loadBulletinStudents = async (classId) => {
    const students = await Api.get(`/classes/${classId}/students`);
    document.getElementById('bulletin-students-holder').innerHTML = students.map((s) => `
      <span class="pill pill-sage" style="cursor:pointer;margin:2px;display:inline-block;" data-view-bulletin="${s.profiles.id}">${esc(s.profiles.full_name)}</span>
    `).join('') || '<div class="empty-state">Aucun élève dans cette classe.</div>';

    document.querySelectorAll('[data-view-bulletin]').forEach((el) => {
      el.addEventListener('click', async () => {
        const bulletin = await Api.get(`/grades/student/${el.dataset.viewBulletin}/bulletin`);
        Views._renderBulletin(document.getElementById('bulletin-view-holder'), bulletin, `Bulletin — ${el.textContent}`);
      });
    });
  };
  const classSelect = document.getElementById('bulletin-class');
  if (classSelect.value) await loadBulletinStudents(classSelect.value);
  classSelect.addEventListener('change', (e) => loadBulletinStudents(e.target.value));

  document.getElementById('ai-grade-btn').addEventListener('click', () => Views._openAiGradeAssistant());

  document.getElementById('add-grade-btn').addEventListener('click', async () => {
    const subjects = await Api.get('/classes/subjects/all');
    const allClasses = State.role === 'admin' ? await Api.get('/classes') : classes.map((c) => c.classes);

    openModal(`
      <h3>Nouvelle note</h3>
      <label>Classe<select id="m-class">${allClasses.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <label>Matière<select id="m-subject">${subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <label>Type<select id="m-type">
        <option value="devoir">Devoir</option>
        <option value="interro">Interrogation</option>
      </select></label>
      <label>Intitulé<input id="m-label" placeholder="Ex : Devoir 1" /></label>
      <div id="m-students-holder"><div class="empty-state">Sélectionnez une classe…</div></div>
      <label>Note sur<input id="m-max" type="number" value="20" /></label>
      <label>Coefficient<input id="m-coef" type="number" value="1" step="0.5" /></label>
      <div class="modal-actions">
        <button class="link-btn" id="m-cancel">Annuler</button>
        <button class="btn-primary" id="m-save">Enregistrer</button>
      </div>`);

    const loadStudents = async (classId) => {
      const students = await Api.get(`/classes/${classId}/students`);
      document.getElementById('m-students-holder').innerHTML = students.map((s) => `
        <label style="flex-direction:row;align-items:center;justify-content:space-between;">
          ${esc(s.profiles.full_name)}
          <input type="number" data-student="${s.profiles.id}" class="grade-input" style="width:70px;" placeholder="/20" />
        </label>
      `).join('') || '<div class="empty-state">Aucun élève dans cette classe.</div>';
    };
    await loadStudents(document.getElementById('m-class').value);
    document.getElementById('m-class').addEventListener('change', (e) => loadStudents(e.target.value));

    document.getElementById('m-cancel').addEventListener('click', closeModal);
    document.getElementById('m-save').addEventListener('click', async () => {
      const class_id = document.getElementById('m-class').value;
      const subject_id = document.getElementById('m-subject').value;
      const type = document.getElementById('m-type').value;
      const label = document.getElementById('m-label').value;
      const max_score = Number(document.getElementById('m-max').value);
      const coefficient = Number(document.getElementById('m-coef').value);
      const entries = Array.from(document.querySelectorAll('.grade-input'))
        .filter((i) => i.value !== '')
        .map((i) => ({ student_id: i.dataset.student, score: Number(i.value) }));

      if (entries.length === 0) { alert('Saisissez au moins une note.'); return; }

      await Api.post('/grades/bulk', {
        class_id, subject_id, type, label, max_score, coefficient,
        graded_at: new Date().toISOString().split('T')[0],
        entries
      });
      closeModal();
    });
  });
};

// Rendu d'un bulletin (élève, parent, ou vue prof/admin) — moyennes interro/devoir/générale par matière
Views._renderBulletin = function (container, bulletin, title) {
  container.innerHTML = `
    <div class="main-header"><h1 class="main-title">${esc(title)}</h1></div>
    <hr class="ruled" />
    ${bulletin.en_attente && bulletin.en_attente.length > 0 ? `
      <div class="card" style="margin-bottom:20px;border-left:3px solid var(--amber);">
        <div class="card-eyebrow">En attente de plus d'informations</div>
        ${bulletin.en_attente.map((e) => `<div style="font-size:0.88rem;">${esc(e.subject_name)} : il manque des ${esc(e.manque)} pour finaliser la moyenne.</div>`).join('')}
      </div>` : ''}
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Moyenne générale</div>
      <div class="score-big">${bulletin.moyenne_generale_bulletin ?? '—'} / 20</div>
    </div>
    <table class="data-table">
      <thead><tr><th>Matière</th><th>Moy. interro</th><th>Moy. devoir</th><th>Moy. générale</th></tr></thead>
      <tbody>
        ${bulletin.subjects.length === 0 ? `<tr><td colspan="4" class="empty-state">Aucune note pour l'instant.</td></tr>` :
          bulletin.subjects.map((s) => `
            <tr>
              <td>${esc(s.subject_name)}</td>
              <td>${s.moyenne_interro ?? '—'}</td>
              <td>${s.moyenne_devoir ?? '—'}</td>
              <td><strong>${s.moyenne_generale ?? '—'}</strong></td>
            </tr>`).join('')}
      </tbody>
    </table>
  `;
};

// Assistant IA de saisie de notes en langage naturel (chat)
Views._openAiGradeAssistant = function () {
  openModal(`
    <h3>Assistant IA — saisie de notes</h3>
    <p style="font-size:0.82rem;color:var(--ink-soft);">
      Décrivez une ou plusieurs notes en langage naturel. Si une information manque
      (élève, classe, matière, type, note), l'assistant vous la demandera avant de continuer.
    </p>
    <div id="ai-chat-log" style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
    <label>Message<textarea id="ai-chat-input" rows="2" placeholder="Ex : Kofi a eu 15/20 en interro de maths en Second IMI-1"></textarea></label>
    <div class="modal-actions">
      <button class="link-btn" id="m-cancel">Fermer</button>
      <button class="btn-primary" id="ai-chat-send">Envoyer</button>
    </div>`);
  document.getElementById('m-cancel').addEventListener('click', closeModal);

  const history = [];
  const log = document.getElementById('ai-chat-log');
  const appendBubble = (role, text) => {
    const bubble = document.createElement('div');
    bubble.style.cssText = `align-self:${role === 'user' ? 'flex-end' : 'flex-start'};background:${role === 'user' ? 'var(--ink)' : '#F4F1EA'};color:${role === 'user' ? 'var(--paper)' : 'var(--ink)'};padding:8px 12px;border-radius:10px;font-size:0.85rem;max-width:85%;white-space:pre-wrap;`;
    bubble.textContent = text;
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  };

  const send = async () => {
    const input = document.getElementById('ai-chat-input');
    const text = input.value.trim();
    if (!text) return;
    appendBubble('user', text);
    history.push({ role: 'user', content: text });
    input.value = '';
    appendBubble('assistant', '…');

    try {
      const res = await Api.post('/ai/grade-entry', { messages: history });
      log.lastChild.remove();
      appendBubble('assistant', res.reply);
      history.push({ role: 'assistant', content: res.reply });
    } catch (err) {
      log.lastChild.remove();
      appendBubble('assistant', "Erreur : " + (err.error || 'impossible de contacter l\'assistant.'));
    }
  };
  document.getElementById('ai-chat-send').addEventListener('click', send);
  document.getElementById('ai-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
};

// ============================================================
// ANNONCES
// ============================================================
Views.renderAnnouncements = async function (container) {
  const canCreate = State.role === 'admin' || State.role === 'prof';
  let classIds = [];
  if (State.role === 'eleve') classIds = (await Api.get('/classes/my/eleve')).map((c) => c.id);
  if (State.role === 'prof') classIds = (await Api.get('/classes/my/prof')).map((c) => c.classes.id);

  const feed = await Api.get(`/announcements/feed?class_ids=${classIds.join(',')}`);

  container.innerHTML = `
    <div class="main-header">
      <h1 class="main-title">Annonces</h1>
      ${canCreate ? '<button class="btn-primary" id="add-ann-btn">+ Annonce</button>' : ''}
    </div>
    <hr class="ruled" />
    <div id="ann-holder">
      ${feed.length === 0 ? '<div class="empty-state">Aucune annonce pour l\'instant.</div>' :
        feed.map((a) => `
          <div class="card" style="margin-bottom:14px;">
            <div class="card-title">
              ${esc(a.title)}
              <span class="pill ${a.class_id ? 'pill-amber' : 'pill-sage'}">${a.class_id ? esc(a.classes?.name || 'Classe') : 'Toute l\u2019école'}</span>
            </div>
            <p style="font-size:0.9rem;">${esc(a.body)}</p>
            <div class="card-eyebrow">${esc(a.profiles?.full_name || '')} · ${fmtDate(a.created_at)}</div>
          </div>
        `).join('')}
    </div>
  `;

  const addBtn = document.getElementById('add-ann-btn');
  if (addBtn) addBtn.addEventListener('click', async () => {
    let classOptions = '<option value="">Toute l\u2019école</option>';
    if (State.role === 'admin') {
      const classes = await Api.get('/classes');
      classOptions += classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    } else {
      const myClasses = await Api.get('/classes/my/prof');
      classOptions = myClasses.map((c) => `<option value="${c.classes.id}">${esc(c.classes.name)}</option>`).join('');
    }
    openModal(`
      <h3>Nouvelle annonce</h3>
      <label>Destinataire<select id="m-class">${classOptions}</select></label>
      <label>Titre<input id="m-title" /></label>
      <label>Message<textarea id="m-body" rows="4"></textarea></label>
      <div class="modal-actions">
        <button class="link-btn" id="m-cancel">Annuler</button>
        <button class="btn-primary" id="m-save">Publier</button>
      </div>`);
    document.getElementById('m-cancel').addEventListener('click', closeModal);
    document.getElementById('m-save').addEventListener('click', async () => {
      await Api.post('/announcements', {
        class_id: document.getElementById('m-class').value || null,
        title: document.getElementById('m-title').value,
        body: document.getElementById('m-body').value
      });
      closeModal();
      navigateTo('announcements');
    });
  });
};

// ============================================================
// MEMBRES (admin)
// ============================================================
Views.renderMembers = async function (container) {
  const members = await Api.get(`/schools/${State.school.id}/members`);
  const grouped = { admin: [], prof: [], eleve: [], parent: [] };
  members.forEach((m) => grouped[m.role]?.push(m));

  container.innerHTML = `
    <div class="main-header">
      <h1 class="main-title">Membres de l'école</h1>
      <button class="btn-primary" id="add-member-btn">+ Ajouter un membre</button>
    </div>
    <hr class="ruled" />
    <div class="grid grid-2">
      ${Object.entries(grouped).map(([role, list]) => `
        <div class="card">
          <div class="card-title">${roleLabel(role)}s (${list.length})</div>
          ${list.length === 0 ? '<div class="empty-state">Aucun.</div>' :
            list.map((m) => `
              <div class="list-row">
                <span>${esc(m.profiles.full_name)}</span>
                ${m.student_number ? `<span class="pill pill-amber">${esc(m.student_number)}</span>` : ''}
              </div>`).join('')}
        </div>
      `).join('')}
    </div>
    <p style="font-size:0.82rem;color:var(--ink-soft);margin-top:20px;">
      Pour ajouter un membre, la personne doit d'abord créer un compte (page de connexion), puis vous renseignez son identifiant utilisateur ici.
      Pour un élève, le matricule est généré automatiquement.
    </p>
  `;

  document.getElementById('add-member-btn').addEventListener('click', () => {
    openModal(`
      <h3>Ajouter un membre</h3>
      <label>ID utilisateur (UUID Supabase)<input id="m-uid" placeholder="Fourni par la personne après inscription" /></label>
      <label>Rôle<select id="m-role">
        <option value="eleve">Élève</option>
        <option value="prof">Professeur</option>
        <option value="parent">Parent</option>
        <option value="admin">Administrateur</option>
      </select></label>
      <p style="font-size:0.8rem;color:var(--ink-soft);">Pour un élève, le matricule sera généré automatiquement à l'ajout.</p>
      <div class="modal-actions">
        <button class="link-btn" id="m-cancel">Annuler</button>
        <button class="btn-primary" id="m-save">Ajouter</button>
      </div>`);
    document.getElementById('m-cancel').addEventListener('click', closeModal);
    document.getElementById('m-save').addEventListener('click', async () => {
      await Api.post(`/schools/${State.school.id}/members`, {
        user_id: document.getElementById('m-uid').value,
        role: document.getElementById('m-role').value
      });
      closeModal();
      navigateTo('members');
    });
  });
};
