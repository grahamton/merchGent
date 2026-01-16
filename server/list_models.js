import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.error('No API key found');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

console.log('Fetching available models...\n');

try {
  const response = await ai.models.list();

  console.log('Raw response type:', typeof response);
  console.log('Is array?:', Array.isArray(response));

  // Handle different response formats
  let modelsList = [];
  if (Array.isArray(response)) {
    modelsList = response;
  } else if (response.models && Array.isArray(response.models)) {
    modelsList = response.models;
  } else {
    console.log('Response structure:', Object.keys(response));
    console.log('Full response:', JSON.stringify(response, null, 2));
    process.exit(0);
  }

  console.log(`\nFound ${modelsList.length} total models\n`);
  console.log('Models with generateContent support:\n');

  const generativeModels = modelsList.filter(model =>
    model.supportedGenerationMethods?.includes('generateContent')
  );

  generativeModels.forEach(model => {
    console.log(`Model: ${model.name}`);
    console.log(`  Display Name: ${model.displayName || 'N/A'}`);
    console.log(`  Description: ${model.description || 'N/A'}`);
    console.log(`  Input Token Limit: ${model.inputTokenLimit || 'N/A'}`);
    console.log(`  Output Token Limit: ${model.outputTokenLimit || 'N/A'}`);
    console.log(`  Supports: ${model.supportedGenerationMethods?.join(', ')}`);
    console.log('---\n');
  });

  console.log(`\nRecommendation: For multimodal analysis with screenshots, use the latest Flash or Pro model.`);
} catch (error) {
  console.error('Error listing models:', error.message);
  console.error('Full error:', error);
}
