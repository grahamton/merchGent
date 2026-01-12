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

dotenv.config();
const localEnvPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

registerWebAgentRoutes(app);
registerMerchAgentRoutes(app);

// --- JOURNEY API ---

app.post('/api/journey/start', (req, res) => {
  try {
    const { startUrl } = req.body;
    const journey = journeyManager.createJourney(startUrl);
    res.json(journey);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/journey/step', (req, res) => {
  try {
    const { journeyId, stepData } = req.body;
    if (!journeyId || !stepData) {
      return res.status(400).json({ error: 'Missing journeyId or stepData' });
    }
    const step = journeyManager.addStep(journeyId, stepData);
    res.json(step);
  } catch (error) {
    console.error('Journey Step Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/journey/:id/state', (req, res) => {
    const state = journeyManager.getJourneyState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Journey not found' });
    res.json(state);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT} (Agent Orchestrator)`);
});
