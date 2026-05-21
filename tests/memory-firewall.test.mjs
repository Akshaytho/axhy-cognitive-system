import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Memory Firewall: Classifier', async () => {
  const { classifyKnowledge, validateCorePrinciplePromotion } = await import(
    join(__dirname, '..', 'src', 'memory-firewall', 'classifier.mjs')
  );

  describe('Classification', () => {
    it('should classify product-specific content as product_rule', () => {
      const result = classifyKnowledge('Workers must check in before starting a cleaning visit');
      assert.equal(result.category, 'product_rule');
    });

    it('should classify core reasoning content as core_principle', () => {
      const result = classifyKnowledge('Confidence drops when assumptions are unverified in core reasoning');
      assert.equal(result.category, 'core_principle');
      assert.equal(result.requires_founder_approval, true);
    });

    it('should classify external research as external_research', () => {
      const result = classifyKnowledge('According to a research paper, pgvector performs better with HNSW indexes');
      assert.equal(result.category, 'external_research');
      assert.ok(result.validation_path);
    });

    it('should classify ChatGPT/Gemini references as external_research', () => {
      const result = classifyKnowledge('ChatGPT suggested using a different embedding model for better recall');
      assert.equal(result.category, 'external_research');
    });

    it('should classify URLs as external_research', () => {
      const result = classifyKnowledge('See https://docs.example.com/api for the integration guide');
      assert.equal(result.category, 'external_research');
    });

    it('should classify temporary context correctly', () => {
      const result = classifyKnowledge('Right now we are debugging the login flow');
      assert.equal(result.category, 'temporary_context');
    });

    it('should classify WIP content as temporary', () => {
      const result = classifyKnowledge('This is a WIP implementation of the new handler');
      assert.equal(result.category, 'temporary_context');
    });

    it('should classify project status as project_memory', () => {
      const result = classifyKnowledge('Sprint 12 milestone was shipped and deployed successfully');
      assert.equal(result.category, 'project_memory');
    });

    it('should default ambiguous content to candidate_learning', () => {
      const result = classifyKnowledge('Caching headers should be set for all static assets');
      assert.equal(result.category, 'candidate_learning');
    });

    it('should reject empty content', () => {
      const result = classifyKnowledge('');
      assert.equal(result.category, 'rejected');
    });

    it('should reject null content', () => {
      const result = classifyKnowledge(null);
      assert.equal(result.category, 'rejected');
    });

    it('should classify mixed core+product as product_rule (product wins)', () => {
      const result = classifyKnowledge('Core reasoning about confidence applies when workers check in for visits');
      assert.equal(result.category, 'product_rule');
    });
  });

  describe('Core Principle Promotion Validation', () => {
    it('should allow promotion of pure core content', () => {
      const result = validateCorePrinciplePromotion('Confidence drops when assumptions are unverified');
      assert.equal(result.allowed, true);
      assert.equal(result.requires_founder_approval, true);
    });

    it('should block promotion of content with product terms', () => {
      const result = validateCorePrinciplePromotion('Workers must verify their attendance at each facility');
      assert.equal(result.allowed, false);
      assert.ok(result.contaminating_terms.length > 0);
      assert.ok(result.contaminating_terms.includes('workers'));
    });

    it('should detect multiple contaminating terms', () => {
      const result = validateCorePrinciplePromotion('Supervisors assign workers to cleaning visits at each facility');
      assert.equal(result.allowed, false);
      assert.ok(result.contaminating_terms.length >= 3);
    });
  });
});
