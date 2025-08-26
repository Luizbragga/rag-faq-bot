export const isDemo = () => process.env.DEMO_MODE === "true";
export const demoTenant = () => process.env.DEFAULT_TENANT || "demo";
export const maxDocs = () => Number(process.env.MAX_DOCS_PER_TENANT || 5);
export const qaRateLimitPerMin = () =>
  Number(process.env.QA_RATE_LIMIT_PER_MIN || 30);
