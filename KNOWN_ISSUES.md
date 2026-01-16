# Known Issues

**Last Updated**: 2026-01-16

## ✅ What Currently Works

- **Frontend UI**: Loads successfully on `http://localhost:3000` with correct brutalist styling
- **Backend Server**: Runs without errors on `http://localhost:3002`
- **API Configuration**: Gemini API key is correctly loaded from `.env.local`
- **End-to-End Flow**:
  - User input → Frontend → Backend → Web Agent scraping pipeline
  - Loading states display correctly
  - Error handling and error modals function properly
- **Web Agent**: Successfully initiates headless Chrome scraping with Puppeteer

## ⚠️ Current Blockers

### API Quota Exhaustion (Critical)

- **Status**: Gemini API quota exceeded (Paid Account)
- **API Key**: `[REDACTED]` (Verified paid tier)
- **Error**: `429 RESOURCE_EXHAUSTED` - Error message mentions "free_tier" but key is actually paid
- **Impact**: Cannot complete Merch Agent AI analysis until quota resets
- **Evidence**: See `audit_error_quota_exceeded_1768602294920.png`
- **Action Required**:
  - Verify quota usage at [Google AI Studio](https://aistudio.google.com/app/apikeys) or Google Cloud Console
  - Check if RPM (requests per minute) limit was hit vs daily quota
  - Paid accounts typically have much higher limits but still have rate limiting

## 🧪 What's Untested

- **Full Happy Path**: Complete audit from URL input → scraping → AI analysis → results display (blocked by quota)
- **Audit Matrix Output**: Trust/Guidance/Persuasion/Friction scores in production
- **Multimodal Analysis**: Screenshot-based visual analysis by Merch Agent
- **Journey Manager**: Multi-step walkthrough persistence
- **Hybrid Trap Detection**: Real-world B2B/B2C signal detection

## 📋 Recent Fixes

- **2026-01-16**: Removed `AGENT_RULES_MD` reference from `merchAgent.js` (was causing undefined error)
- **2026-01-15**: Refactored agent governance into `SYSTEM_PROMPT_V2.md`

## 🔄 Next Steps

1. Wait for API quota reset (24 hours) OR upgrade to paid tier
2. Complete end-to-end smoke test with quota available
3. Verify multimodal screenshot analysis
4. Document happy path walkthrough with screenshots
