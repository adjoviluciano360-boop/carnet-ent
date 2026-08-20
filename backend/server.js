import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import schoolsRoutes from './routes/schools.js';
import classesRoutes from './routes/classes.js';
import scheduleRoutes from './routes/schedule.js';
import homeworkRoutes from './routes/homework.js';
import gradesRoutes from './routes/grades.js';
import announcementsRoutes from './routes/announcements.js';
import parentRoutes from './routes/parent.js';
import aiRoutes from './routes/ai.js';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/schools', schoolsRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/homework', homeworkRoutes);
app.use('/api/grades', gradesRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/ai', aiRoutes);

// Handler d'erreur générique
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ENT backend démarré sur le port ${PORT}`));
