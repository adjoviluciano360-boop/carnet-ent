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
    if (error.message.includes('Email not confirmed')) {
      errorEl.textContent = "Votre e-mail n'est pas encore confirmé. Vérifiez votre boîte de réception (et vos spams) pour le lien de confirmation.";
    } else if (error.message.includes('Invalid login credentials')) {
      errorEl.textContent = "E-mail ou mot de passe incorrect.";
    } else {
      errorEl.textContent = error.message;
    }
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

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name } }
  });
  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  // Si Supabase exige une confirmation par e-mail, il n'y a pas de session immédiate
  if (!data.session) {
    document.getElementById('signup-form').innerHTML = `
      <div style="padding:16px;background:#F4F1EA;border-radius:10px;font-size:0.9rem;line-height:1.5;">
        <strong>Compte créé !</strong><br/>
        Un e-mail de confirmation a été envoyé à <strong>${email}</strong>.
        Cliquez sur le lien qu'il contient, puis revenez vous connecter ici.
        <br/><br/>Pensez à vérifier vos spams si vous ne le voyez pas sous 1 à 2 minutes.
      </div>`;
    return;
  }

  window.location.href = 'app.html';
});
