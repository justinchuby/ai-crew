export { KnowledgeStore } from './KnowledgeStore.js';
export { HybridSearchEngine, fuseResults, fitToBudget, estimateTokens } from './HybridSearchEngine.js';
export { TrainingCapture } from './TrainingCapture.js';
export type {
  KnowledgeEntry,
  KnowledgeCategory,
  KnowledgeMetadata,
  SearchOptions,
  ScoredKnowledgeEntry,
  HybridSearchOptions,
  FusedSearchResult,
  VectorSearchProvider,
  Correction,
  CorrectionEntry,
  Feedback,
  FeedbackEntry,
  TrainingRetrievalOptions,
  TrainingSummary,
  TagCount,
  AgentTrainingStats,
} from './types.js';
export { KNOWLEDGE_CATEGORIES } from './types.js';
