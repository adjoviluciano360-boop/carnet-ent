// ============================================================
// CONFIGURATION DE L'ÉTABLISSEMENT
// ============================================================

Views.renderConfiguration = async function(container) {
  const config = await Api.get('/config');
  
  container.innerHTML = `
    <div class="main-header">
      <h1 class="main-title">Configuration</h1>
    </div>
    <hr class="ruled" />
    <div class="card">
      <div class="card-title">Paramètres généraux</div>
      <form id="config-form">
        <label>
          Système de périodes
          <select id="systeme" name="systeme_periode">
            <option value="trimestre" ${config.systeme_periode === 'trimestre' ? 'selected' : ''}>Trimestres (T1, T2, T3)</option>
            <option value="semestre" ${config.systeme_periode === 'semestre' ? 'selected' : ''}>Semestres (S1, S2)</option>
          </select>
        </label>
        <label>
          Nombre de périodes
          <input type="number" id="nb_periodes" value="${config.nb_periodes}" min="2" max="4" />
        </label>
        <label>
          Année scolaire
          <input type="text" id="annee" value="${config.annee_scolaire || '2025-2026'}" placeholder="2025-2026" />
        </label>
        <button type="submit" class="btn-primary">Enregistrer</button>
      </form>
    </div>
  `;

  document.getElementById('config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      systeme_periode: document.getElementById('systeme').value,
      nb_periodes: Number(document.getElementById('nb_periodes').value),
      annee_scolaire: document.getElementById('anne').value
    };
    await Api.put('/config', data);
    alert('Configuration enregistrée !');
  });
};