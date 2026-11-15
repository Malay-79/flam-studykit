import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';

const validSet = {
  title: 'Water cycle',
  cards: [
    { front: 'What is evaporation?', back: 'Liquid becomes vapor.' },
    { front: 'What is condensation?', back: 'Vapor becomes liquid.' },
    { front: 'What is precipitation?', back: 'Water falls from clouds.' },
  ],
  questions: [
    { prompt: 'Which process forms vapor?', options: ['Runoff', 'Evaporation', 'Rainfall', 'Freezing'], correctIndex: 1, explanation: 'Evaporation turns a liquid into vapor.' },
    { prompt: 'Which process forms droplets?', options: ['Condensation', 'Runoff', 'Melting', 'Freezing'], correctIndex: 0, explanation: 'Cooling vapor forms liquid droplets.' },
    { prompt: 'Which is an example of precipitation?', options: ['Fog', 'Dew', 'Rain', 'A river'], correctIndex: 2, explanation: 'Rain falls from clouds.' },
  ],
};

let proxy;
let baseUrl;
let lastModelRequest;
let lastReviewRequest;
let lastReviewRequestUrl;
const variableSets = {
  'one fact': { ...validSet, cards: validSet.cards.slice(0, 1), questions: validSet.questions.slice(0, 1) },
  'detailed notes': {
    ...validSet,
    questions: [...validSet.questions, ...validSet.questions.map((question) => ({
      ...question,
      prompt: `Review: ${question.prompt}`,
    }))],
  },
};
const ageNotes = 'Alvis is 23. Malay is one year younger than Alvis.';
const ageQuestion = {
  prompt: 'How old is Malay?',
  options: ['22', '23', '24', '25'],
  correctIndex: 1,
  explanation: 'Malay is one year younger than Alvis, who is 23.',
};
function sendCandidate(res, content) {
  const midpoint = Math.floor(content.length / 2);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    candidates: [{
      content: { parts: [
        { text: 'internal thought', thought: true },
        { text: content.slice(0, midpoint) },
        { text: content.slice(midpoint) },
      ] },
    }],
  }));
}

const gemini = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = JSON.parse(Buffer.concat(chunks).toString());
  const input = request.contents[0].parts[0].text;
  if (req.headers['x-goog-api-key'] !== 'test-key') {
    res.writeHead(403).end();
    return;
  }
  if (request.generationConfig.responseJsonSchema.properties.answers) {
    lastReviewRequest = JSON.parse(input);
    lastReviewRequestUrl = req.url;
    if (lastReviewRequest.notes === 'missing reviewer') {
      res.writeHead(404).end();
      return;
    }
    const draft = variableSets[lastReviewRequest.notes] ?? validSet;
    const answers = draft.questions.map(({ options, correctIndex, explanation }) => ({
      explanation, answer: options[correctIndex],
    }));
    if (lastReviewRequest.notes === ageNotes) {
      answers[0] = { explanation: '23 - 1 = 22.', answer: '22' };
    }
    if (lastReviewRequest.notes === 'unverifiable') answers[0].answer = '';
    if (lastReviewRequest.notes === 'short review') answers.pop();
    sendCandidate(res, JSON.stringify({ answers }));
    return;
  }

  lastModelRequest = { ...request, url: req.url };
  if (input === 'slow') return;
  if (input === 'quota') {
    res.writeHead(429).end();
    return;
  }
  if (input === 'blocked') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }));
    return;
  }
  if (input === 'service error' || input === 'missing model') {
    res.writeHead(input === 'missing model' ? 404 : 500).end();
    return;
  }

  const content = {
    [ageNotes]: JSON.stringify({ ...validSet, questions: [ageQuestion, ...validSet.questions.slice(1)] }),
    malformed: '{broken',
    empty: '   ',
    'wrong shape': '{"cards":[]}',
    'bad index': JSON.stringify({
      ...validSet,
      questions: validSet.questions.map((question) => ({ ...question, correctIndex: 4 })),
    }),
    'duplicate options': JSON.stringify({
      ...validSet,
      questions: validSet.questions.map((question) => ({ ...question, options: ['Rain', ' rain ', 'Snow', 'Fog'] })),
    }),
  }[input] ?? JSON.stringify(variableSets[input] ?? validSet);
  sendCandidate(res, content);
});

before(async () => {
  gemini.listen(0, '127.0.0.1');
  await once(gemini, 'listening');
  proxy = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '0',
      GEMINI_API_BASE_URL: `http://127.0.0.1:${gemini.address().port}/v1beta/`,
      GEMINI_API_KEY: 'test-key',
      MODEL_TIMEOUT_MS: '500',
      GEMINI_MODEL: 'gemini-3.5-flash-lite',
      GEMINI_REVIEW_MODEL: 'gemini-3.6-flash',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const [line] = await Promise.race([
    once(proxy.stdout, 'data'),
    once(proxy, 'exit').then(([code]) => { throw new Error(`Server exited with code ${code}`); }),
  ]);
  const port = /port (\d+)/.exec(line.toString())?.[1];
  assert.ok(port);
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (proxy && proxy.exitCode === null && proxy.signalCode === null) {
    const exited = once(proxy, 'exit');
    proxy.kill();
    await exited;
  }
  gemini.closeAllConnections();
  await new Promise((resolve) => gemini.close(resolve));
});

function generate(notes) {
  return fetch(`${baseUrl}/api/study-set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
}

test('sends trimmed notes and the output schema to the model, then returns validated JSON', async () => {
  const response = await generate('  water cycle  ');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validSet);
  assert.deepEqual(lastModelRequest.contents[0], { role: 'user', parts: [{ text: 'water cycle' }] });
  const { responseMimeType, responseJsonSchema } = lastModelRequest.generationConfig;
  assert.equal(responseMimeType, 'application/json');
  assert.equal(responseJsonSchema.properties.questions.items.properties.correctIndex.maximum, 3);
  assert.deepEqual(responseJsonSchema.properties.title, { type: 'string' });
});

test('rejects blank and oversized input before calling the model', async () => {
  const previousRequest = lastModelRequest;
  assert.equal((await generate(' ')).status, 400);
  assert.equal((await generate('a'.repeat(4001))).status, 400);
  assert.equal(lastModelRequest, previousRequest);
});

test('reviews small and large quizzes without requiring the card count to match', async () => {
  for (const [notes, draft] of Object.entries(variableSets)) {
    const response = await generate(notes);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), draft);
    assert.equal(lastReviewRequest.quiz.length, draft.questions.length);
  }
});

test('re-solves the age question without the original answer key and fixes the graded choice', async () => {
  const response = await generate(ageNotes);
  assert.equal(response.status, 200);
  assert.deepEqual(lastReviewRequest.quiz[0], { prompt: ageQuestion.prompt, options: ageQuestion.options });
  assert.equal(lastModelRequest.url, '/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(lastReviewRequestUrl, '/v1beta/models/gemini-3.6-flash:generateContent');
  const { questions } = await response.json();
  assert.equal(questions[0].options[questions[0].correctIndex], '22');
  assert.equal(questions[0].explanation, '23 - 1 = 22.');
});

for (const [input, status, message] of [
  ['malformed', 502, /invalid JSON/],
  ['empty', 502, /empty or unreadable/],
  ['wrong shape', 502, /invalid study set/],
  ['bad index', 502, /invalid study set/],
  ['duplicate options', 502, /invalid study set/],
  ['service error', 502, /service returned an error/],
  ['missing model', 502, /gemini-3\.5-flash-lite is unavailable/],
  ['slow', 504, /took too long/],
  ['unverifiable', 502, /could not verify/],
  ['short review', 502, /could not verify/],
  ['missing reviewer', 502, /gemini-3\.6-flash is unavailable/],
  ['quota', 502, /rate or quota limit/],
  ['blocked', 502, /blocked this request/],
]) {
  test(`handles ${input}`, async () => {
    const response = await generate(input);
    assert.equal(response.status, status);
    assert.match((await response.json()).error, message);
  });
}
