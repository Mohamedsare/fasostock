export type AiInsightItem = {
  id: string;
  insightType: string;
  payload: unknown;
  createdAt: string;
  expiresAt: string;
};

export type ForecastSnapshotItem = {
  id: string;
  productId: string | null;
  snapshotDate: string;
  payload: unknown;
  createdAt: string;
};

export type AiRequestItem = {
  id: string;
  type: string;
  inputSummary: string | null;
  outputSummary: string | null;
  tokensUsed: number | null;
  createdAt: string;
};

export type AiInsightsData = {
  insights: AiInsightItem[];
  forecasts: ForecastSnapshotItem[];
  requests: AiRequestItem[];
  totalTokens: number;
};

