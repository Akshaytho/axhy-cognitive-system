export function generateNextQuestion({ filePath, intent, riskLevel, fileWasRead, testsExist }) {
  const questions = [];

  if (riskLevel === 'high') {
    questions.push({
      current_uncertainty: 'This is a high-risk file. Changes here can break the entire system.',
      highest_risk_assumption: 'That the change is safe without understanding all downstream effects.',
      next_best_question: `What specific invariant or contract does ${filePath} enforce, and how does your change preserve it?`,
      how_to_answer: 'read_file',
      stop_condition: 'You can articulate the invariant and explain why your change preserves it.',
      requires_answer: true,
    });
  }

  if (!fileWasRead) {
    questions.push({
      current_uncertainty: 'File has not been read recently — current state unknown.',
      highest_risk_assumption: 'That the file still matches your mental model.',
      next_best_question: `What is the current content of ${filePath}?`,
      how_to_answer: 'read_file',
      stop_condition: 'File has been read and its current state is understood.',
      requires_answer: true,
    });
  }

  if (!testsExist) {
    questions.push({
      current_uncertainty: 'No tests found for this file.',
      highest_risk_assumption: 'That the change won\'t introduce regressions.',
      next_best_question: `Are there tests covering the behavior you\'re about to change in ${filePath}?`,
      how_to_answer: 'search_memory',
      stop_condition: 'Tests exist and cover the affected behavior, or you acknowledge the gap.',
      requires_answer: false,
    });
  }

  if (intent && /\b(delete|remove)\s+(file|table|column|database|db|record|row|model|endpoint|route|migration)\b/i.test(intent)) {
    questions.push({
      current_uncertainty: 'Destructive operation detected in intent.',
      highest_risk_assumption: 'That nothing depends on the thing being removed.',
      next_best_question: 'What depends on the code/data you\'re about to remove? Have you checked all callers/references?',
      how_to_answer: 'search_memory',
      stop_condition: 'All references have been checked and none will break.',
      requires_answer: true,
    });
  } else if (intent && /\b(drop\s+(?:table|column|index|constraint|database)|truncate\s+(?:table)?)\b/i.test(intent)) {
    questions.push({
      current_uncertainty: 'Destructive DB operation detected in intent.',
      highest_risk_assumption: 'That nothing depends on the thing being dropped.',
      next_best_question: 'What depends on the code/data you\'re about to remove? Have you checked all callers/references?',
      how_to_answer: 'search_memory',
      stop_condition: 'All references have been checked and none will break.',
      requires_answer: true,
    });
  }

  if (intent && /\b(migration|schema\s+change|alter\s+table|add\s+column|drop\s+column)\b/i.test(intent)) {
    questions.push({
      current_uncertainty: 'Database schema change detected.',
      highest_risk_assumption: 'That the migration is reversible and won\'t corrupt existing data.',
      next_best_question: 'Is this migration reversible? What happens to existing rows?',
      how_to_answer: 'read_file',
      stop_condition: 'Migration has been reviewed for data safety and reversibility.',
      requires_answer: true,
    });
  }

  if (questions.length === 0) {
    return null;
  }

  const primary = questions.find(q => q.requires_answer) || questions[0];

  return {
    primary,
    all: questions,
    requires_answer: primary.requires_answer,
  };
}

export function validateAnswer(answeredQuestion, evidence) {
  if (!answeredQuestion || typeof answeredQuestion !== 'string' || answeredQuestion.trim().length < 10) {
    return {
      valid: false,
      reason: 'Answer is too short or empty. Provide a substantive answer with evidence.',
    };
  }

  if (!evidence || !Array.isArray(evidence) || evidence.length === 0) {
    return {
      valid: false,
      reason: 'Evidence is required. Provide file paths, grep results, or test outputs that support your answer.',
    };
  }

  const hasSubstance = evidence.some(e => typeof e === 'string' && e.trim().length > 5);
  if (!hasSubstance) {
    return {
      valid: false,
      reason: 'Evidence items must be substantive (file paths, code references, test results).',
    };
  }

  return { valid: true };
}
