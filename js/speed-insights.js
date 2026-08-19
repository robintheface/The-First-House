// Vercel Speed Insights integration
// This script imports and initializes Vercel Speed Insights for tracking
// web vitals and performance metrics. It only tracks in production on Vercel.

import { injectSpeedInsights } from '../node_modules/@vercel/speed-insights/dist/index.mjs';

// Initialize Speed Insights
injectSpeedInsights();
