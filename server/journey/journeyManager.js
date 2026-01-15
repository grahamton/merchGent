/**
 * JOURNEY MANAGER
 * Role: Manages the lifecycle of multi-step user journeys.
 * Refactored to use Persistence Adapter (Local/Cloud).
 */
import { v4 as uuidv4 } from 'uuid';
import { Persistence } from '../adapters/persistence.js';

export const journeyManager = {
  /**
   * Starts a new journey.
   * @param {string} startUrl - The initial URL
   */
  createJourney: async (startUrl) => {
    const journeyId = uuidv4();
    // Persistence layer handles storage (File or Firestore)
    const journey = await Persistence.createJourney(journeyId, startUrl);
    return journey;
  },

  /**
   * Adds a step to an existing journey.
   * @param {string} journeyId
   * @param {object} stepData - { url, pageData, screenshotPath, cookies }
   */
  addStep: async (journeyId, stepData) => {
    const { url, pageData, screenshotPath, cookies } = stepData;

    const newStep = {
      id: uuidv4(),
      sequence: 0, // Adapter/DB should assign sequence or we rely on array order.
                   // Ideally we'd get the current count, but for now we let Adapter handle ordering.
      timestamp: new Date().toISOString(),
      url,
      screenshotPath,
      dataSummary: {
        productCount: pageData.products?.length || 0,
        title: pageData.title,
        dataLayers: pageData.dataLayers,
        interactables: pageData.interactables,
        findings: pageData.findings
      },
      cookies // Pass cookies to adapter so it can update the Journey state
    };

    // Save to persistence
    // Note: The adapter is responsible for appending to the list or sub-collection
    try {
        await Persistence.addStep(journeyId, newStep);
    } catch (e) {
        console.error('[JourneyManager] Failed to persist step:', e);
        throw e;
    }

    return newStep;
  },

  /**
   * Retrieves the current state (cookies) to inject into the browser.
   */
  getJourneyState: async (journeyId) => {
    const journey = await Persistence.getJourney(journeyId);
    if (journey) {
      // Get the latest URL from the last step, or startUrl
      const lastStep = journey.steps && journey.steps.length > 0
        ? journey.steps[journey.steps.length - 1]
        : null;

      return {
        cookies: journey.cookies || [],
        lastUrl: lastStep ? lastStep.url : journey.startUrl
      };
    }
    return null;
  },

  getJourney: async (journeyId) => {
    return await Persistence.getJourney(journeyId);
  }
};
