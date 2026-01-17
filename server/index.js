/**
 * CLIENT AGENT (API Orchestrator)
 * Role: Route requests to agent endpoints and enforce shared safeguards.
 * Forbidden: Crawling and merchandising analysis logic.
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { registerWebAgentRoutes } from './webAgent.js';
import { registerMerchAgentRoutes } from './merchAgent.js';
import { journeyManager } from './journey/journeyManager.js';

import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();
const localEnvPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());


registerWebAgentRoutes(app);
registerMerchAgentRoutes(app);

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: monospace; padding: 2rem; background: #111; color: #eee;">
        <h1>Agent Orchestrator (Backend)</h1>
        <p>Status: <strong>ONLINE</strong></p>
        <p>Port: <strong>${PORT}</strong></p>
        <hr/>
        <p>You are viewing the API server.</p>
        <p>To use the application, please visit the frontend: <a href="http://localhost:3001" style="color: #4ade80">http://localhost:3001</a></p>
      </body>
    </html>
  `);
});

// --- JOURNEY API ---

app.post('/api/journey/start', async (req, res) => {
  try {
    const { startUrl } = req.body;
    const journey = await journeyManager.createJourney(startUrl);
    res.json(journey);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/journey/step', async (req, res) => {
  try {
    const { journeyId, stepData } = req.body;
    if (!journeyId || typeof journeyId !== 'string' || !stepData) {
      return res.status(400).json({ error: 'Missing or invalid journeyId or stepData' });
    }
    const step = await journeyManager.addStep(journeyId, stepData);
    res.json(step);
  } catch (error) {
    console.error('Journey Step Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/journey/:id/state', async (req, res) => {
    try {
        const state = await journeyManager.getJourneyState(req.params.id);
        if (!state) return res.status(404).json({ error: 'Journey not found' });
        res.json(state);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT} (Agent Orchestrator)`);
});
