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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT} (Agent Orchestrator)`);
});
