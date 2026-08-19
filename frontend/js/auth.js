// Bascule entre les onglets Connexion / Inscription
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.getElementById('login-form').classList.toggle('hidden', target !== 'login');
    document.getElementById('signup-form').classList.toggle('hidden', target !== 'signup');
  });
});

// Si déjà connecté, redirige directement vers l'app
(async () => {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) window.location.href = 'app.html';
})();

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = "Identifiants incorrects. Vérifiez votre e-mail et mot de passe.";
    return;
  }
  window.location.href = 'app.html';
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const full_name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');
  errorEl.textContent = '';

  const { error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name } }
  });
  if (error) {
    errorEl.textContent = error.message;
    return;
  }
  window.location.href = 'app.html';
});
