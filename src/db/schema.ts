import { pgTable, pgEnum, uuid, text, timestamp, real, boolean, json } from 'drizzle-orm/pg-core';

export const sourceTypeEnum = pgEnum('source_type', ['html', 'pdf']);
export const pipelineStatusEnum = pgEnum('pipeline_status', [
  'running',
  'completed',
  'failed',
  'awaiting_review',
]);
export const stageNameEnum = pgEnum('stage_name', [
  'ingest',
  'extract_topics',
  'drift_analysis',
  'repair_decision',
  'generate',
]);
export const stageStatusEnum = pgEnum('stage_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export const driftLevelEnum = pgEnum('drift_level', ['low', 'med', 'high']);
export const driftItemStatusEnum = pgEnum('drift_item_status', [
  'auto_applied',
  'pending_review',
  'approved',
  'rejected',
]);
export const proposedTopicStatusEnum = pgEnum('proposed_topic_status', [
  'pending_approval',
  'approved',
  'rejected',
]);
export const learningUnitStatusEnum = pgEnum('learning_unit_status', [
  'active',
  'pending_review',
  'archived',
]);

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: sourceTypeEnum('type').notNull(),
  url: text('url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sourceVersions = pgTable('source_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
  contentHash: text('content_hash').notNull(),
  normalizedContent: text('normalized_content').notNull(),
  storagePath: text('storage_path'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const topics = pgTable('topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const topicExtractions = pgTable('topic_extractions', {
  id: uuid('id').primaryKey().defaultRandom(),
  topicId: uuid('topic_id')
    .notNull()
    .references(() => topics.id),
  sourceVersionId: uuid('source_version_id')
    .notNull()
    .references(() => sourceVersions.id),
  extractedContent: text('extracted_content').notNull(),
  contentHash: text('content_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const proposedTopics = pgTable('proposed_topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceVersionId: uuid('source_version_id')
    .notNull()
    .references(() => sourceVersions.id),
  pipelineRunId: uuid('pipeline_run_id')
    .notNull()
    .references(() => pipelineRuns.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  extractedContent: text('extracted_content').notNull(),
  status: proposedTopicStatusEnum('status').notNull().default('pending_approval'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at'),
});

export const learningUnits = pgTable('learning_units', {
  id: uuid('id').primaryKey().defaultRandom(),
  topicId: uuid('topic_id')
    .notNull()
    .references(() => topics.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type McqQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  rationale: string;
};

export const learningUnitVersions = pgTable('learning_unit_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  learningUnitId: uuid('learning_unit_id')
    .notNull()
    .references(() => learningUnits.id),
  sourceVersionId: uuid('source_version_id')
    .notNull()
    .references(() => sourceVersions.id),
  lesson: text('lesson').notNull(),
  questions: json('questions').notNull().$type<McqQuestion[]>(),
  driftScore: real('drift_score'),
  status: learningUnitStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pipelineRuns = pgTable('pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
  sourceVersionId: uuid('source_version_id').references(() => sourceVersions.id),
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  status: pipelineStatusEnum('status').notNull().default('running'),
});

export const pipelineStages = pgTable('pipeline_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  pipelineRunId: uuid('pipeline_run_id')
    .notNull()
    .references(() => pipelineRuns.id),
  stage: stageNameEnum('stage').notNull(),
  status: stageStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  outputSummary: text('output_summary'),
  error: text('error'),
});

export const driftItems = pgTable('drift_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  pipelineRunId: uuid('pipeline_run_id')
    .notNull()
    .references(() => pipelineRuns.id),
  topicId: uuid('topic_id')
    .notNull()
    .references(() => topics.id),
  changeType: text('change_type').notNull(),
  driftScore: real('drift_score').notNull(),
  driftLevel: driftLevelEnum('drift_level').notNull(),
  reason: text('reason').notNull(),
  status: driftItemStatusEnum('status').notNull().default('auto_applied'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
