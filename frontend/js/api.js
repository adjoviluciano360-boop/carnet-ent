const Api = {
  currentSchoolId: null,

  async _headers() {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (Api.currentSchoolId) headers['X-School-Id'] = Api.currentSchoolId;
    return headers;
  },

  async get(path) {
    const res = await fetch(`${API_BASE_URL}${path}`, { headers: await Api._headers() });
    if (!res.ok) throw await res.json().catch(() => ({ error: 'Erreur réseau' }));
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: await Api._headers(),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw await res.json().catch(() => ({ error: 'Erreur réseau' }));
    return res.json();
  },
  async put(path, body) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PUT',
      headers: await Api._headers(),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw await res.json().catch(() => ({ error: 'Erreur réseau' }));
    return res.json();
  },
  async del(path) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
      headers: await Api._headers()
    });
    if (!res.ok) throw await res.json().catch(() => ({ error: 'Erreur réseau' }));
    return true;
  }
};
