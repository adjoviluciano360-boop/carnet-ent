// Configuration dynamique selon l'établissement
const CONFIG = {
  SUPABASE_URL: "https://nnnpuraimgqfcwqsnemi.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_...",
  API_BASE_URL: "https://carnet-ent.onrender.com/api",
  
  // Paramètres par défaut (peuvent être modifiés par l'admin)
  DEFAULTS: {
    systeme_periode: 'trimestre', // ou 'semestre'
    nb_periodes: 3
  }
};