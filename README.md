# StudyKit

StudyKit is a React study assistant built for the Flam frontend internship assignment. Enter a topic or paste notes to generate flashcards and a short multiple-choice quiz. The set can contain one to eight flashcards and one to eight questions, depending on how many distinct ideas the material covers. You can reveal each card, check answers with explanations, and retry just the questions you missed.

## Setup

1. Install Node.js 22.12 or newer.
2. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
3. In this folder, copy `.env.example` to `.env` and fill in `GEMINI_API_KEY`. Keep that file out of version control.
4. Start the app.

```sh
npm install
npm start
```

5. Open [http://localhost:3000](http://localhost:3000). Select **Use example** or enter notes, then select **Generate study set**.

StudyKit sends the notes to Google's Gemini API. Use sample notes for the demo. You can change the generation model with `GEMINI_MODEL` and the reviewer with `GEMINI_REVIEW_MODEL` in `.env`. The server handles the API key. Gemini model availability and quotas depend on your Google project.

## How the pieces fit together

- **`src/main.jsx`** holds the React components. The notes form starts a request. Flashcards remember the current position and which side is visible. The quiz remembers your answers and uses them to build the next round.
- **`server/index.js`** receives the notes and calls Gemini 3.5 Flash-Lite with a JSON schema. It checks the structure, then asks Gemini 3.6 Flash to solve the quiz independently from the notes and choices without seeing the original key. The server matches the reviewed answer text to a choice and uses the new explanation for grading.
- **`shared/study-set.js`** defines what a usable response looks like. For example, every question needs four different options and a correct-answer index from 0 to 3. Both the server and React use the same validator.
- Starting a replacement request aborts the old browser request. React also checks which request is still current before updating the page. A failed request leaves the last successful study set available.

## What to demo

[Watch the interaction recording](StudyKit-demo-simulated.webm). It uses simulated Ollama responses to demonstrate flashcards, the quiz, missed-question review, and an invalid-JSON error. The current app uses Gemini.

1. Start on the empty screen and select **Use example**. Generate a study set and reveal a flashcard.
2. Open **Quiz**, intentionally miss a question, finish the round, and select **Retry missed questions**.
3. To see a failed request preserve an existing set, use the browser dev tools to simulate going offline, then generate again. Return the browser to online mode and select **Retry last request**.

## Checks

Run `npm test` to exercise the model response contract and proxy failure paths. The tests use a local stand-in for Gemini so they can reproduce failures on demand.

## Known limitations

- The review can catch an incorrect answer key. The Gemini reviewer can still make factual mistakes or pick a wrong answer.
- Study sets and quiz progress are kept in memory for the current page. Refreshing resets them.
- Slow Gemini requests can hit the 120-second server timeout. Try shorter notes or raise `MODEL_TIMEOUT_MS`. The browser request has its own 130-second limit.
- The server defaults to loopback for local use. It has no authentication or rate limiting for public deployment.

## AI usage and time

Codex helped implement the app, outline failure handling, write tests, and draft this README. The generation feature uses the Gemini API for generation and quiz review. The time below covers this assisted implementation. Record any additional time spent reviewing, changing, or preparing the submission.

Time spent on the assisted build and verification was about 10 minutes.
