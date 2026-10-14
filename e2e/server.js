import sharp from 'sharp';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { JobStore } from '../src/jobs.js';

// Test-only fixture: no Azure requests or user photos. Never used by npm start.
const config = loadConfig({
  PORT: '4317', ENABLE_AZURE_INFERENCE: 'true',
  AZURE_SUNBURST_ENDPOINT: 'https://fixture.openai.azure.com',
  AZURE_SUNBURST_DEPLOYMENT: 'fixture', AZURE_SUNBURST_API_KEY: 'test-only',
  AZURE_MAI_ENDPOINT: 'https://fixture.services.ai.azure.com',
  AZURE_MAI_DEPLOYMENT: 'fixture', AZURE_MAI_API_KEY: 'test-only',
  AZURE_MAI_MODEL: 'MAI-Image-2.6'
});
const jobs = new JobStore({ provider: async model => {
  await new Promise(resolve => setTimeout(resolve, 250));
  const image = await sharp({ create: { width: 64, height: 96, channels: 3, background: model.id === 'mai' ? '#567abc' : '#bc7654' } }).png().toBuffer();
  return { image, requestId: 'synthetic-fixture-not-a-quality-test' };
} });
createServer(config, { jobs }).listen(config.port, config.host);
