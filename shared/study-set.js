export const MAX_NOTES_LENGTH = 4000;
export const MAX_STUDY_ITEMS = 8;

const shortText = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const record = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const list = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });

export const studySetSchema = record({
  title: shortText(80),
  cards: list(record({
    front: shortText(200),
    back: shortText(450),
  }), 1, MAX_STUDY_ITEMS),
  questions: list(record({
    prompt: shortText(220),
    options: list(shortText(150), 4, 4),
    correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
    explanation: shortText(350),
  }), 1, MAX_STUDY_ITEMS),
});

export function matchesSchema(value, schema) {
  switch (schema.type) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).length === schema.required.length
        && schema.required.every((key) => Object.hasOwn(value, key)
          && matchesSchema(value[key], schema.properties[key]));
    case 'array':
      return Array.isArray(value) && value.length >= schema.minItems
        && value.length <= schema.maxItems
        && value.every((item) => matchesSchema(item, schema.items));
    case 'string':
      return typeof value === 'string' && value.trim().length >= schema.minLength
        && value.length <= schema.maxLength;
    case 'integer':
      return Number.isInteger(value) && value >= schema.minimum && value <= schema.maximum;
    default:
      return false;
  }
}

export function isStudySet(value) {
  return matchesSchema(value, studySetSchema)
    && value.questions.every(({ options }) =>
      new Set(options.map((option) => option.trim().toLowerCase())).size === options.length);
}

export function quizReviewSchema(questionCount) {
  return record({
    answers: list(record({
      explanation: shortText(350),
      answer: { type: 'string', minLength: 0, maxLength: 150 },
    }), questionCount, questionCount),
  });
}


