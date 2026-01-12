/**
 * JOURNEY MANAGER
 * Role: Manages the lifecycle of multi-step user journeys.
 * Responsibilities:
 * - maintaining the "cookie jar" for active sessions
 * - persisting steps and screenshots to disk
 * - providing history for playback
 */
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DATA_DIR = path.join(process.cwd(), 'server', 'data', 'journeys');

// In-memory "Cookie Jar" for active journeys
// Key: journeyId, Value: { cookies: [], lastUrl: string, createdAt: number }
const activeJourneys = new Map();

// Ensure storage exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const journeyManager = {
  /**
   * Starts a new journey.
   * @param {string} startUrl - The initial URL (optional, can be set on first step)
   */
  createJourney: (startUrl) => {
    const journeyId = uuidv4();
    const journey = {
      id: journeyId,
      createdAt: new Date().toISOString(),
      startUrl,
      steps: [],
      cookies: [], // Initialize empty cookie jar
      status: 'active'
    };

    // Save initial state to disk
    saveJourneyToDisk(journey);

    // Keep in memory for quick state access
    activeJourneys.set(journeyId, {
      cookies: [],
      lastUrl: startUrl,
      createdAt: Date.now()
    });

    return journey;
  },

  /**
   * Adds a step to an existing journey.
   * @param {string} journeyId
   * @param {object} stepData - { url, pageData, screenshotPath, cookies }
   */
  addStep: (journeyId, stepData) => {
    const journey = loadJourneyFromDisk(journeyId);
    if (!journey) {
      throw new Error(`Journey ${journeyId} not found.`);
    }

    const { url, pageData, screenshotPath, cookies } = stepData;

    // Update In-Memory State (Cookie Jar)
    // We overwrite with the latest cookies from the browser
    if (cookies) {
      const activeState = activeJourneys.get(journeyId) || { createdAt: Date.now() };
      activeState.cookies = cookies;
      activeState.lastUrl = url;
      activeJourneys.set(journeyId, activeState);
    }

    const newStep = {
      id: uuidv4(),
      sequence: journey.steps.length + 1,
      timestamp: new Date().toISOString(),
      url,
      screenshotPath, // Relative or absolute path
      // We don't save full page tokens/HTML to keep file size manageable for now,
      // just the structured data we extracted.
      dataSummary: {
        productCount: pageData.products?.length || 0,
        title: pageData.title,
        dataLayers: pageData.dataLayers,
        interactables: pageData.interactables,
        findings: pageData.findings
      }
    };

    journey.steps.push(newStep);

    // Persist latest cookie state to the JSON file too, so we can resume later if server restarts
    journey.cookies = cookies || journey.cookies;
    journey.updatedAt = new Date().toISOString();

    saveJourneyToDisk(journey);
    return newStep;
  },

  /**
   * Retrieves the current state (cookies) to inject into the browser.
   */
  getJourneyState: (journeyId) => {
    // Try memory first
    if (activeJourneys.has(journeyId)) {
      return activeJourneys.get(journeyId);
    }

    // Fallback to disk
    const journey = loadJourneyFromDisk(journeyId);
    if (journey) {
      return {
        cookies: journey.cookies || [],
        lastUrl: journey.steps[journey.steps.length - 1]?.url || journey.startUrl
      };
    }

    return null;
  },

  getJourney: (journeyId) => {
    return loadJourneyFromDisk(journeyId);
  }
};

// --- Helpers ---

function getFilePath(journeyId) {
  return path.join(DATA_DIR, `${journeyId}.json`);
}

function saveJourneyToDisk(journey) {
  fs.writeFileSync(getFilePath(journey.id), JSON.stringify(journey, null, 2));
}

function loadJourneyFromDisk(journeyId) {
  const filePath = getFilePath(journeyId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Failed to load journey ${journeyId}:`, err);
    return null;
  }
}
