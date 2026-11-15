import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { isStudySet, MAX_NOTES_LENGTH } from '../shared/study-set.js';
import './styles.css';

const example = 'The water cycle describes how water moves around Earth. Heat from the Sun causes liquid water to evaporate into water vapor. As the vapor cools, it condenses into tiny droplets, forming clouds. When the droplets become heavy enough, they fall as precipitation, such as rain or snow. Water then collects in rivers, lakes, and oceans, or soaks into the ground.';

function useStudySet() {
  const [session, setSession] = useState(null);
  const [request, setRequest] = useState({ status: 'idle' });
  const current = useRef(null);

  useEffect(() => () => current.current?.abort(), []);

  async function generate(notes) {
    current.current?.abort();
    const controller = new AbortController();
    const deadline = AbortSignal.timeout(130_000);
    current.current = controller;
    setRequest({ status: 'loading', notes });

    try {
      const response = await fetch('/api/study-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
        signal: AbortSignal.any([controller.signal, deadline]),
      });
      const data = await response.json().catch((error) => {
        if (deadline.aborted || controller.signal.aborted) throw error;
        return null;
      });
      if (current.current !== controller) return;
      if (!response.ok) throw new Error(data?.error || 'The server could not create a study set. Try again.');
      if (!isStudySet(data)) throw new Error('The server returned an invalid study set. Try again.');

      setSession((previous) => ({ id: (previous?.id ?? 0) + 1, data }));
      setRequest({ status: 'idle' });
    } catch (error) {
      if (current.current !== controller) return;
      const message = deadline.aborted
        ? 'The request took too long. Try again.'
        : error instanceof TypeError
          ? 'Could not reach the StudyKit server. Check that it is running and try again.'
          : error.message;
      setRequest({ status: 'error', message, notes });
    } finally {
      if (current.current === controller) current.current = null;
    }
  }

  function cancel() {
    current.current?.abort();
    current.current = null;
    setRequest({ status: 'idle' });
  }

  return { session, request, generate, cancel };
}

function Flashcards({ cards }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index];

  function goTo(next) {
    setIndex(next);
    setFlipped(false);
  }

  return (
    <div className="practice">
      <div className="progress-label">Card {index + 1} of {cards.length}</div>
      <progress value={index + 1} max={cards.length} aria-label="Flashcard position" />
      <button type="button" className={flipped ? 'card is-flipped' : 'card'} onClick={() => setFlipped(!flipped)}>
        <span className="card-label">{flipped ? 'ANSWER' : 'PROMPT'}</span>
        <span className="card-text">{flipped ? card.back : card.front}</span>
        <span className="card-hint">{flipped ? '↺ Show prompt' : '↺ Reveal answer'}</span>
      </button>
      <div className="card-nav">
        <button className="secondary" disabled={index === 0} onClick={() => goTo(index - 1)}>← Previous</button>
        <button className="secondary" disabled={index === cards.length - 1} onClick={() => goTo(index + 1)}>Next →</button>
      </div>
    </div>
  );
}

function Quiz({ questions }) {
  const [round, setRound] = useState(questions);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState(false);
  const heading = useRef(null);
  const nextButton = useRef(null);
  const question = round[answers.length];

  function advance() {
    setAnswers([...answers, selected === question.correctIndex]);
    setSelected(null);
    setChecked(false);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function startRound(nextRound) {
    setRound(nextRound);
    setAnswers([]);
    setSelected(null);
    setChecked(false);
    requestAnimationFrame(() => heading.current?.focus());
  }

  if (!question) {
    const missed = round.filter((_, index) => !answers[index]);
    return (
      <div className="quiz-summary">
        <h3 ref={heading} tabIndex={-1}>Round complete</h3>
        <p className="score">{round.length - missed.length} <span>/ {round.length}</span></p>
        <p>{missed.length ? `${missed.length} to review` : 'You got every question right.'}</p>
        <div className="actions">
          {missed.length > 0 && <button className="primary" onClick={() => startRound(missed)}>Retry missed questions</button>}
          <button className="secondary" onClick={() => startRound(questions)}>Restart full quiz</button>
        </div>
      </div>
    );
  }

  return (
    <div className="practice">
      <div className="progress-label">Question {answers.length + 1} of {round.length}</div>
      <progress value={answers.length + 1} max={round.length} aria-label="Quiz position" />
      <h3 ref={heading} tabIndex={-1} id="quiz-question">{question.prompt}</h3>
      <div className="options" role="radiogroup" aria-labelledby="quiz-question">
        {question.options.map((option, index) => {
          const correct = checked && index === question.correctIndex;
          const incorrect = checked && selected === index && !correct;
          return (
            <label className={`option${correct ? ' correct' : ''}${incorrect ? ' incorrect' : ''}`} key={option}>
              <input type="radio" name="answer" checked={selected === index} disabled={checked} onChange={() => setSelected(index)} />
              <span>{option}{correct && <strong className="option-note">Correct answer</strong>}{incorrect && <strong className="option-note">Your answer</strong>}</span>
            </label>
          );
        })}
      </div>
      {checked && (
        <p className="feedback" role="status">
          <strong>{selected === question.correctIndex ? 'Correct. ' : 'Incorrect. '}</strong>{question.explanation}
        </p>
      )}
      <div className="actions">
        {checked
          ? <button key="advance" ref={nextButton} className="primary" onClick={advance}>{answers.length + 1 === round.length ? 'See results' : 'Next question →'}</button>
          : <button key="check" className="primary" disabled={selected === null} onClick={() => {
            setChecked(true);
            requestAnimationFrame(() => nextButton.current?.focus());
          }}>Check answer</button>}
      </div>
    </div>
  );
}

function Workspace({ studySet }) {
  const [mode, setMode] = useState('cards');

  if (!studySet) {
    return (
      <div className="empty">
        <div className="empty-mark" aria-hidden="true">✦</div>
        <h2>Your study set goes here</h2>
        <p>Add notes or a topic to create flashcards and a short quiz.</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="set-title">{studySet.title}</h2>
      <div className="switcher" role="group" aria-label="Practice mode">
        <button aria-pressed={mode === 'cards'} onClick={() => setMode('cards')}>Flashcards <span>{studySet.cards.length}</span></button>
        <button aria-pressed={mode === 'quiz'} onClick={() => setMode('quiz')}>Quiz <span>{studySet.questions.length}</span></button>
      </div>
      <div hidden={mode !== 'cards'}><Flashcards cards={studySet.cards} /></div>
      <div hidden={mode !== 'quiz'}><Quiz questions={studySet.questions} /></div>
    </>
  );
}

function App() {
  const [notes, setNotes] = useState('');
  const [inputError, setInputError] = useState('');
  const { session, request, generate, cancel } = useStudySet();
  const loading = request.status === 'loading';
  const notesField = useRef(null);

  function submit(event) {
    event.preventDefault();
    const input = notes.trim();
    if (!input) {
      setInputError('Enter a topic or paste some notes to get started.');
      notesField.current?.focus();
      return;
    }
    setInputError('');
    generate(input);
  }

  return (
    <>
      <header className="top"><div className="frame brand"><span aria-hidden="true">✦</span> StudyKit</div></header>
      <main className="frame">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <h1 id="page-title">Turn notes into <em>practice.</em></h1>
            <p>Build flashcards and a quiz from your notes, then revisit the questions you missed.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-card hero-card-back" />
            <div className="hero-card hero-card-front">
              <span>✦</span>
              <i />
              <i />
            </div>
          </div>
        </section>
        <div className="layout">
          <form className="panel compose" onSubmit={submit} noValidate>
            <div className="panel-heading">
              <h2><label htmlFor="notes">Study notes</label></h2>
              <button type="button" className="text-button" onClick={() => { setNotes(example); setInputError(''); notesField.current?.focus(); }}>Use example</button>
            </div>
            <textarea
              id="notes"
              ref={notesField}
              value={notes}
              maxLength={MAX_NOTES_LENGTH}
              aria-invalid={Boolean(inputError)}
              aria-describedby={inputError ? 'input-error' : undefined}
              placeholder="Paste your notes or type a topic, like how photosynthesis works."
              onChange={(event) => { setNotes(event.target.value); setInputError(''); }}
            />
            <div className="counter">{notes.length.toLocaleString()} / {MAX_NOTES_LENGTH.toLocaleString()}</div>
            {inputError && <p id="input-error" className="error" role="alert">{inputError}</p>}
            <button className="primary submit" disabled={loading && notes.trim() === request.notes}>
              {loading ? 'Generate from edited notes' : 'Generate study set'} <span aria-hidden="true">→</span>
            </button>
            {loading && (
              <div className="request-state">
                <p role="status"><span className="spinner" aria-hidden="true" /> Creating your study set…</p>
                <button type="button" className="text-button" onClick={cancel}>Cancel</button>
              </div>
            )}
            {request.status === 'error' && (
              <div className="request-state">
                <p className="error" role="alert">{request.message}</p>
                <button type="button" className="text-button" onClick={() => generate(request.notes)}>Retry last request</button>
              </div>
            )}
          </form>
          <section className="panel workspace" aria-label="Study workspace">
            <Workspace key={session?.id ?? 0} studySet={session?.data} />
          </section>
        </div>
        <p className="sr-only" role="status">{session ? `Study set ready: ${session.data.title}` : ''}</p>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
