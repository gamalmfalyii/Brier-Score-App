const state = {
  predictions: [],
  selectedId: '',
  activeView: 'dashboard',
  filter: 'all',
  search: '',
  newsResults: [],
  newsLoading: false,
  newsMessage: 'Search results appear here.',
  lastNewsSearchAt: 0,
  adjustment: null,
  analysisTimer: null
};

const els = {
  navButtons: document.querySelectorAll('.nav-button'),
  views: document.querySelectorAll('.view'),
  viewTitle: document.getElementById('viewTitle'),
  viewSubtitle: document.getElementById('viewSubtitle'),
  dataPath: document.getElementById('dataPath'),
  exportCsv: document.getElementById('exportCsv'),
  newPrediction: document.getElementById('newPrediction'),
  brierScore: document.getElementById('brierScore'),
  brierLabel: document.getElementById('brierLabel'),
  skillScore: document.getElementById('skillScore'),
  resolvedCount: document.getElementById('resolvedCount'),
  openCount: document.getElementById('openCount'),
  accuracyScore: document.getElementById('accuracyScore'),
  recentList: document.getElementById('recentList'),
  categoryScores: document.getElementById('categoryScores'),
  searchInput: document.getElementById('searchInput'),
  predictionList: document.getElementById('predictionList'),
  deletePrediction: document.getElementById('deletePrediction'),
  questionInput: document.getElementById('questionInput'),
  probabilityInput: document.getElementById('probabilityInput'),
  probabilityReadout: document.getElementById('probabilityReadout'),
  categoryInput: document.getElementById('categoryInput'),
  outcomeInput: document.getElementById('outcomeInput'),
  notesInput: document.getElementById('notesInput'),
  scorePreview: document.getElementById('scorePreview'),
  adjusterSuggestion: document.getElementById('adjusterSuggestion'),
  adjusterReason: document.getElementById('adjusterReason'),
  useQuestionSearch: document.getElementById('useQuestionSearch'),
  newsQueryInput: document.getElementById('newsQueryInput'),
  newsSourceInput: document.getElementById('newsSourceInput'),
  searchNews: document.getElementById('searchNews'),
  newsStatus: document.getElementById('newsStatus'),
  newsResults: document.getElementById('newsResults'),
  calibrationBuckets: document.getElementById('calibrationBuckets'),
  toast: document.getElementById('toast')
};

const viewCopy = {
  dashboard: ['Dashboard', 'Track probability forecasts, resolve outcomes, and learn whether your confidence is calibrated.'],
  predictions: ['Predictions', 'Log questions, confidence levels, outcomes, and notes.'],
  calibration: ['Calibration', 'Compare how often events happened against what you predicted.']
};

function id() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function probability(prediction) {
  return Number(prediction.probability || 0) / 100;
}

function isResolved(prediction) {
  return prediction.outcome === 0 || prediction.outcome === 1;
}

function brier(prediction) {
  return Math.pow(probability(prediction) - prediction.outcome, 2);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function fmtScore(value) {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

function fmtPct(value) {
  return `${Math.round(value * 100)}%`;
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function selectedPrediction() {
  return state.predictions.find((prediction) => prediction.id === state.selectedId) || state.predictions[0] || null;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('visible'), 2200);
}

async function save() {
  await window.brierApp.saveData({ predictions: state.predictions });
}

function setView(view) {
  state.activeView = view;
  els.navButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  els.views.forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  els.viewTitle.textContent = viewCopy[view][0];
  els.viewSubtitle.textContent = viewCopy[view][1];
  render();
}

function newPrediction() {
  const prediction = {
    id: id(),
    question: 'New prediction',
    probability: 60,
    outcome: null,
    category: 'General',
    notes: '',
    createdAt: new Date().toISOString(),
    resolvedAt: ''
  };

  state.predictions.unshift(prediction);
  state.selectedId = prediction.id;
  setView('predictions');
  render();
  save();
  els.questionInput.focus();
  els.questionInput.select();
}

function updateSelected(patch) {
  const prediction = selectedPrediction();
  if (!prediction) return;
  Object.assign(prediction, patch);
  if (Object.prototype.hasOwnProperty.call(patch, 'outcome')) {
    prediction.resolvedAt = isResolved(prediction) ? new Date().toISOString() : '';
  }
  render();
  save();
}

function simpleHash(value) {
  let hash = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return String(hash);
}

function clampProbability(value) {
  return Math.max(1, Math.min(99, Number(value) || 50));
}

function probabilityToOdds(value) {
  const probabilityValue = clampProbability(value) / 100;
  return probabilityValue / (1 - probabilityValue);
}

function oddsToProbability(odds) {
  return clampProbability(Math.round((odds / (1 + odds)) * 100));
}

function sourceProfile(domain) {
  const host = String(domain || '').toLowerCase().replace(/^www\./, '');
  const tiers = [
    { pattern: /(^|\.)reuters\.com$/, tier: 'Tier 1', reliability: 1.25, label: 'high-reliability wire' },
    { pattern: /(^|\.)apnews\.com$/, tier: 'Tier 1', reliability: 1.25, label: 'high-reliability wire' },
    { pattern: /(^|\.)bloomberg\.com$/, tier: 'Tier 1', reliability: 1.18, label: 'high-reliability financial outlet' },
    { pattern: /(^|\.)wsj\.com$/, tier: 'Tier 1', reliability: 1.16, label: 'high-reliability outlet' },
    { pattern: /(^|\.)ft\.com$/, tier: 'Tier 1', reliability: 1.16, label: 'high-reliability outlet' },
    { pattern: /(^|\.)bbc\./, tier: 'Tier 2', reliability: 1.08, label: 'major public broadcaster' },
    { pattern: /(^|\.)npr\.org$/, tier: 'Tier 2', reliability: 1.05, label: 'major public broadcaster' },
    { pattern: /(^|\.)nytimes\.com$/, tier: 'Tier 2', reliability: 1.06, label: 'major newspaper' },
    { pattern: /(^|\.)washingtonpost\.com$/, tier: 'Tier 2', reliability: 1.06, label: 'major newspaper' },
    { pattern: /(^|\.)theguardian\.com$/, tier: 'Tier 2', reliability: 1.03, label: 'major newspaper' },
    { pattern: /(^|\.)cnbc\.com$/, tier: 'Tier 3', reliability: 0.98, label: 'market news outlet' },
    { pattern: /(^|\.)cnn\.com$/, tier: 'Tier 3', reliability: 0.96, label: 'large general outlet' },
    { pattern: /(^|\.)foxnews\.com$/, tier: 'Tier 3', reliability: 0.96, label: 'large general outlet' },
    { pattern: /(^|\.)politico\.com$/, tier: 'Tier 3', reliability: 1.0, label: 'specialist politics outlet' },
    { pattern: /(^|\.)techcrunch\.com$/, tier: 'Tier 3', reliability: 0.94, label: 'specialist tech outlet' },
    { pattern: /(^|\.)theverge\.com$/, tier: 'Tier 3', reliability: 0.94, label: 'specialist tech outlet' }
  ];
  return tiers.find((entry) => entry.pattern.test(host)) || {
    tier: 'Unranked',
    reliability: 0.82,
    label: 'unranked source'
  };
}

function recencyWeight(dateValue) {
  if (!dateValue) return 0.92;
  let parsed;
  if (/^\d{8}/.test(String(dateValue))) {
    const text = String(dateValue);
    parsed = new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00`);
  } else {
    parsed = new Date(dateValue);
  }
  if (Number.isNaN(parsed.getTime())) return 0.92;
  const ageDays = Math.max(0, (Date.now() - parsed.getTime()) / 86400000);
  if (ageDays <= 2) return 1.12;
  if (ageDays <= 7) return 1.0;
  if (ageDays <= 21) return 0.88;
  return 0.72;
}

function evidenceWeight(article) {
  const profile = sourceProfile(article?.domain);
  const recency = recencyWeight(article?.date);
  const weight = Math.max(0.5, Math.min(1.45, profile.reliability * recency));
  return {
    ...profile,
    recency,
    weight
  };
}

function evidenceLabel(article) {
  const weight = evidenceWeight(article);
  return `${weight.tier} / ${(weight.weight * 100).toFixed(0)}% evidence weight`;
}

function evidenceNote(article, label) {
  const source = article.domain || 'news source';
  const date = article.date ? article.date.slice(0, 8) : 'recent';
  const weight = evidenceWeight(article);
  return `[${new Date().toLocaleDateString()}] ${label} [source=${source}; tier=${weight.tier}; weight=${weight.weight.toFixed(2)}; recency=${weight.recency.toFixed(2)}]: ${article.title} (${source}, ${date}) ${article.url}`;
}

function addEvidence(article, label) {
  const prediction = selectedPrediction();
  if (!prediction) return;
  const currentNotes = prediction.notes ? `${prediction.notes.trim()}\n` : '';
  updateSelected({
    notes: `${currentNotes}${evidenceNote(article, label)}`
  });
  showToast('Evidence added; probability will update automatically');
  scheduleInfoAnalysis();
}

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => {
    const matches = text.match(pattern);
    return count + (matches ? matches.length : 0);
  }, 0);
}

function patternHits(text, definitions) {
  return definitions.flatMap((definition) => {
    const count = countMatches(text, definition.patterns);
    if (!count) return [];
    return [{
      label: definition.label,
      count,
      logLikelihood: definition.logLikelihood
    }];
  });
}

function evidenceDeltaText(prediction) {
  const notes = prediction?.notes || '';
  const priorSnapshot = prediction?.autoAdjustment?.notesSnapshot || '';
  if (priorSnapshot && notes.startsWith(priorSnapshot)) {
    return notes.slice(priorSnapshot.length).trim();
  }
  return notes.trim();
}

function analyzePredictionInfo(prediction, options = {}) {
  if (!prediction) return null;
  const evidenceText = options.evidenceText ?? `${prediction.question || ''}\n${prediction.notes || ''}`;
  const text = evidenceText.toLowerCase();
  const current = clampProbability(options.priorProbability ?? prediction.probability ?? 50);
  const reasons = [];

  const supportDefinitions = [
    { label: 'explicit supporting evidence', logLikelihood: Math.log(1.9), patterns: [/\bsupporting evidence\b/g, /\bsupports\b/g] },
    { label: 'confirmed or approved', logLikelihood: Math.log(1.7), patterns: [/\bconfirmed\b/g, /\bapproved\b/g, /\bsecured\b/g] },
    { label: 'completed or launched', logLikelihood: Math.log(1.55), patterns: [/\bcompleted\b/g, /\blaunched\b/g, /\bon track\b/g, /\bahead of schedule\b/g] },
    { label: 'positive momentum', logLikelihood: Math.log(1.3), patterns: [/\blikely\b/g, /\bupgraded\b/g, /\bincreased\b/g, /\bpositive\b/g, /\bstrong demand\b/g, /\bbeat expectations\b/g, /\bexceeded\b/g] }
  ];
  const challengeDefinitions = [
    { label: 'explicit challenging evidence', logLikelihood: Math.log(0.53), patterns: [/\bchallenging evidence\b/g, /\bchallenges\b/g] },
    { label: 'blocked, denied, or failed', logLikelihood: Math.log(0.55), patterns: [/\bdenied\b/g, /\bfailed\b/g, /\bblocked\b/g, /\bcancelled\b/g, /\bcanceled\b/g] },
    { label: 'delayed or missed', logLikelihood: Math.log(0.65), patterns: [/\bdelayed\b/g, /\bpostponed\b/g, /\bmissed\b/g] },
    { label: 'negative risk signal', logLikelihood: Math.log(0.78), patterns: [/\bunlikely\b/g, /\bweak\b/g, /\bdeclined\b/g, /\blowered\b/g, /\bdowngraded\b/g, /\brisk\b/g, /\bshortage\b/g, /\blawsuit\b/g, /\bnegative\b/g] }
  ];

  const hits = [
    ...patternHits(text, supportDefinitions),
    ...patternHits(text, challengeDefinitions)
  ];
  const evidenceLines = evidenceText.split(/\r?\n/).filter((line) => /\bevidence\b/i.test(line)).length;
  const sourceLinks = countMatches(evidenceText, [/https?:\/\/\S+/g]);
  const sourceWeights = [...evidenceText.matchAll(/weight=([0-9.]+)/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  const evidenceWeightMultiplier = sourceWeights.length
    ? Math.max(0.5, Math.min(1.45, average(sourceWeights)))
    : 0.9;
  const hasMarkedSupport = /\bsupporting evidence\b/i.test(evidenceText);
  const hasMarkedChallenge = /\bchallenging evidence\b/i.test(evidenceText);
  const explicitProbability = text.match(/\b([1-9][0-9]?|100)\s?%/g)
    ?.map((value) => Number(value.replace(/\D/g, '')))
    .filter((value) => value >= 1 && value <= 99)
    .at(-1);

  let logLikelihood = hits.reduce((sum, hit) => {
    const cappedCount = Math.min(hit.count, 3);
    return sum + (hit.logLikelihood * cappedCount);
  }, 0);
  if (hasMarkedSupport) logLikelihood += Math.log(1.35);
  if (hasMarkedChallenge) logLikelihood += Math.log(0.74);
  logLikelihood *= evidenceWeightMultiplier;

  const explicitProbabilityWeight = explicitProbability === undefined ? 0 : 0.45;
  if (explicitProbability !== undefined) {
    const currentLogOdds = Math.log(probabilityToOdds(current));
    const explicitLogOdds = Math.log(probabilityToOdds(explicitProbability));
    logLikelihood += (explicitLogOdds - currentLogOdds) * explicitProbabilityWeight;
    reasons.push(`soft ${explicitProbability}% probability reference`);
  }

  logLikelihood = Math.max(Math.log(0.18), Math.min(Math.log(5.5), logLikelihood));
  const likelihoodRatio = Math.exp(logLikelihood);
  const suggested = oddsToProbability(probabilityToOdds(current) * likelihoodRatio);

  hits.forEach((hit) => {
    reasons.push(`${hit.count} ${hit.label}${hit.count === 1 ? '' : 's'}`);
  });
  reasons.push(`${Math.round(evidenceWeightMultiplier * 100)}% source weight`);
  if (sourceLinks) reasons.push(`${sourceLinks} linked source${sourceLinks === 1 ? '' : 's'}`);
  if (!reasons.length) reasons.push('no Bayesian evidence weight found yet');

  const evidenceStrength = Math.abs(Math.log(likelihoodRatio));
  const confidence = Math.min(95, 30 + evidenceStrength * 28 + Math.min(sourceLinks, 4) * 6 + Math.min(evidenceLines, 4) * 4);
  const direction = suggested > current ? 'up' : suggested < current ? 'down' : 'flat';

  return {
    current,
    suggested,
    delta: suggested - current,
    direction,
    confidence,
    likelihoodRatio,
    reasons
  };
}

function analyzeCurrentInfo() {
  const prediction = selectedPrediction();
  state.adjustment = analyzePredictionInfo(prediction);
  renderAutoAdjuster();
}

function scheduleInfoAnalysis() {
  clearTimeout(state.analysisTimer);
  state.analysisTimer = setTimeout(autoAdjustCurrentInfo, 650);
}

function autoAdjustmentKey(prediction) {
  return simpleHash(`${prediction?.question || ''}\n${prediction?.notes || ''}`);
}

function autoAdjustCurrentInfo() {
  const prediction = selectedPrediction();
  if (!prediction || isResolved(prediction)) {
    analyzeCurrentInfo();
    return;
  }

  const key = autoAdjustmentKey(prediction);
  if (!prediction.notes?.trim() || prediction.autoAdjustment?.key === key) {
    analyzeCurrentInfo();
    return;
  }

  const newEvidence = evidenceDeltaText(prediction);
  const adjustment = analyzePredictionInfo(prediction, {
    evidenceText: newEvidence,
    priorProbability: prediction.probability
  });
  state.adjustment = adjustment;
  if (!adjustment || adjustment.delta === 0) {
    updateSelected({
      autoAdjustment: {
        key,
        previousProbability: prediction.probability,
        appliedProbability: prediction.probability,
        reasons: adjustment?.reasons || ['no change'],
        confidence: adjustment?.confidence || 0,
        likelihoodRatio: adjustment?.likelihoodRatio || 1,
        notesSnapshot: prediction.notes || '',
        adjustedAt: new Date().toISOString()
      }
    });
    return;
  }

  updateSelected({
    probability: adjustment.suggested,
    autoAdjustment: {
      key,
      previousProbability: adjustment.current,
      appliedProbability: adjustment.suggested,
      reasons: adjustment.reasons,
      confidence: adjustment.confidence,
      likelihoodRatio: adjustment.likelihoodRatio,
      notesSnapshot: prediction.notes || '',
      adjustedAt: new Date().toISOString()
    }
  });
  showToast(`Auto-adjusted to ${adjustment.suggested}%`);
}

function filteredPredictions() {
  const term = state.search.trim().toLowerCase();
  return state.predictions.filter((prediction) => {
    const matchesFilter =
      state.filter === 'all' ||
      (state.filter === 'open' && !isResolved(prediction)) ||
      (state.filter === 'resolved' && isResolved(prediction));
    const haystack = `${prediction.question} ${prediction.category} ${prediction.notes}`.toLowerCase();
    return matchesFilter && (!term || haystack.includes(term));
  });
}

function renderMetrics() {
  const resolved = state.predictions.filter(isResolved);
  const open = state.predictions.length - resolved.length;
  const score = average(resolved.map(brier));
  const skill = resolved.length ? (0.25 - score) / 0.25 : 0;
  const accuracy = resolved.length
    ? resolved.filter((prediction) => (prediction.probability >= 50 ? 1 : 0) === prediction.outcome).length / resolved.length
    : 0;

  els.brierScore.textContent = fmtScore(score);
  els.brierLabel.textContent = resolved.length ? scoreLabel(score) : 'Resolve predictions to score';
  els.skillScore.textContent = fmtPct(skill);
  els.resolvedCount.textContent = String(resolved.length);
  els.openCount.textContent = `${open} open`;
  els.accuracyScore.textContent = fmtPct(accuracy);
}

function scoreLabel(score) {
  if (score <= 0.08) return 'Excellent calibration';
  if (score <= 0.16) return 'Strong forecasting';
  if (score <= 0.25) return 'Better than half-confidence';
  return 'Needs recalibration';
}

function predictionRow(prediction, compact = false) {
  const button = document.createElement('button');
  button.className = `list-item ${prediction.id === state.selectedId ? 'active' : ''}`;
  button.type = 'button';
  button.addEventListener('click', () => {
    state.selectedId = prediction.id;
    setView('predictions');
  });

  const resolved = isResolved(prediction);
  const status = resolved ? (prediction.outcome ? 'Happened' : 'Missed') : 'Open';
  const scoreText = resolved ? `Brier ${fmtScore(brier(prediction))}` : 'Awaiting outcome';
  const statusClass = resolved ? (prediction.outcome ? 'status-good' : 'status-miss') : 'status-open';

  button.innerHTML = `
    <div>
      <strong>${escapeHtml(prediction.question || 'Untitled prediction')}</strong>
      <span>${escapeHtml(prediction.category || 'General')} / ${prediction.probability}% / ${scoreText}</span>
    </div>
    <em class="status-pill ${statusClass}">${status}</em>
  `;
  return button;
}

function renderLists() {
  els.recentList.innerHTML = '';
  state.predictions.slice(0, 6).forEach((prediction) => els.recentList.appendChild(predictionRow(prediction, true)));
  if (!state.predictions.length) els.recentList.innerHTML = '<p class="empty">No predictions yet.</p>';

  els.predictionList.innerHTML = '';
  const predictions = filteredPredictions();
  predictions.forEach((prediction) => els.predictionList.appendChild(predictionRow(prediction)));
  if (!predictions.length) els.predictionList.innerHTML = '<p class="empty">No matching predictions.</p>';
}

function renderCategoryScores() {
  const groups = new Map();
  state.predictions.filter(isResolved).forEach((prediction) => {
    const key = prediction.category || 'General';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(prediction);
  });

  els.categoryScores.innerHTML = '';
  if (!groups.size) {
    els.categoryScores.innerHTML = '<p class="empty">Resolve predictions to compare categories.</p>';
    return;
  }

  [...groups.entries()]
    .map(([category, predictions]) => ({ category, predictions, score: average(predictions.map(brier)) }))
    .sort((a, b) => a.score - b.score)
    .forEach((group) => {
      const row = document.createElement('div');
      row.className = 'score-row';
      const width = Math.max(4, Math.round((1 - Math.min(group.score, 0.5) / 0.5) * 100));
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(group.category)}</strong>
          <span>${group.predictions.length} resolved</span>
          <i><u style="width:${width}%"></u></i>
        </div>
        <b>${fmtScore(group.score)}</b>
      `;
      els.categoryScores.appendChild(row);
    });
}

function renderDetails() {
  const prediction = selectedPrediction();
  const hasPrediction = Boolean(prediction);
  [els.questionInput, els.probabilityInput, els.categoryInput, els.outcomeInput, els.notesInput, els.deletePrediction].forEach((el) => {
    el.disabled = !hasPrediction;
  });
  [els.useQuestionSearch, els.newsQueryInput, els.newsSourceInput, els.searchNews].forEach((el) => {
    el.disabled = !hasPrediction;
  });

  if (!prediction) {
    els.questionInput.value = '';
    els.probabilityInput.value = 60;
    els.categoryInput.value = '';
    els.outcomeInput.value = '';
    els.notesInput.value = '';
    els.probabilityReadout.textContent = '60%';
    els.scorePreview.innerHTML = '<span>Select or create a prediction.</span>';
    state.adjustment = null;
    els.newsQueryInput.value = '';
    els.newsResults.innerHTML = '';
    state.newsMessage = 'Select or create a prediction to search evidence.';
    return;
  }

  els.questionInput.value = prediction.question || '';
  els.probabilityInput.value = prediction.probability || 60;
  els.categoryInput.value = prediction.category || '';
  els.outcomeInput.value = isResolved(prediction) ? String(prediction.outcome) : '';
  els.notesInput.value = prediction.notes || '';
  els.probabilityReadout.textContent = `${prediction.probability || 60}%`;

  if (isResolved(prediction)) {
    els.scorePreview.innerHTML = `
      <strong>Brier contribution: ${fmtScore(brier(prediction))}</strong>
      <span>${prediction.probability}% forecast, outcome ${prediction.outcome ? 'happened' : 'did not happen'}.</span>
    `;
  } else {
    els.scorePreview.innerHTML = '<strong>Open prediction</strong><span>Set the outcome when the event resolves.</span>';
  }

  if (!els.newsQueryInput.value.trim() || els.newsQueryInput.dataset.predictionId !== prediction.id) {
    els.newsQueryInput.value = prediction.question || '';
    els.newsQueryInput.dataset.predictionId = prediction.id;
  }
}

function renderAutoAdjuster() {
  const prediction = selectedPrediction();
  const adjustment = analyzePredictionInfo(prediction, {
    evidenceText: evidenceDeltaText(prediction),
    priorProbability: prediction?.probability
  });
  state.adjustment = adjustment;

  if (!prediction || !adjustment) {
    els.adjusterSuggestion.textContent = 'Select or create a prediction.';
    els.adjusterReason.textContent = 'The adjuster looks for supporting and challenging signals in your entered information.';
    return;
  }

  if (prediction.autoAdjustment?.key === autoAdjustmentKey(prediction)) {
    const previous = prediction.autoAdjustment.previousProbability;
    const applied = prediction.autoAdjustment.appliedProbability;
    const sign = applied > previous ? '+' : '';
    els.adjusterSuggestion.textContent = applied === previous
      ? `auto-held at ${applied}%`
      : `auto-updated to ${applied}% (${sign}${applied - previous} pts)`;
    els.adjusterReason.textContent = `LR ${Number(prediction.autoAdjustment.likelihoodRatio || 1).toFixed(2)} / ${Math.round(prediction.autoAdjustment.confidence)}% confidence / ${prediction.autoAdjustment.reasons.join('; ')}`;
    return;
  }

  const sign = adjustment.delta > 0 ? '+' : '';
  const direction = adjustment.direction === 'up' ? 'raise' : adjustment.direction === 'down' ? 'lower' : 'hold';
  els.adjusterSuggestion.textContent = `will ${direction} to ${adjustment.suggested}% (${sign}${adjustment.delta} pts)`;
  els.adjusterReason.textContent = `LR ${adjustment.likelihoodRatio.toFixed(2)} / ${Math.round(adjustment.confidence)}% confidence / ${adjustment.reasons.join('; ')}`;
}

function renderNewsResults() {
  els.searchNews.disabled = state.newsLoading;
  els.newsResults.innerHTML = '';

  if (state.newsLoading) {
    els.newsStatus.textContent = 'Searching recent news...';
    return;
  }

  if (!state.newsResults.length) {
    els.newsStatus.textContent = state.newsMessage;
    return;
  }

  els.newsStatus.textContent = `${state.newsResults.length} recent result${state.newsResults.length === 1 ? '' : 's'}`;
  state.newsResults.forEach((article, index) => {
    const card = document.createElement('article');
    card.className = 'news-card';
    const date = article.date ? article.date.slice(0, 8) : 'Recent';
    const weight = evidenceWeight(article);
    card.innerHTML = `
      <div>
        <span>${escapeHtml(article.domain || 'Unknown source')} / ${escapeHtml(date)}</span>
        <strong>${escapeHtml(article.title)}</strong>
        <small>${escapeHtml(weight.label)} / ${escapeHtml(evidenceLabel(article))}</small>
      </div>
      <div class="news-actions">
        <button class="secondary small" data-news-open="${index}">Open</button>
        <button class="secondary small" data-news-note="${index}">Add note</button>
        <button class="secondary small" data-news-plus="${index}">Mark supports</button>
        <button class="secondary small" data-news-minus="${index}">Mark challenges</button>
      </div>
    `;
    els.newsResults.appendChild(card);
  });
}

function renderCalibration() {
  const buckets = [
    [0, 19], [20, 39], [40, 59], [60, 79], [80, 100]
  ];
  const resolved = state.predictions.filter(isResolved);
  els.calibrationBuckets.innerHTML = '';

  buckets.forEach(([min, max]) => {
    const predictions = resolved.filter((prediction) => prediction.probability >= min && prediction.probability <= max);
    const observed = average(predictions.map((prediction) => prediction.outcome));
    const meanForecast = average(predictions.map(probability));
    const bucketScore = average(predictions.map(brier));
    const card = document.createElement('article');
    card.className = 'bucket-card';
    card.innerHTML = `
      <div class="bucket-head">
        <strong>${min}-${max}%</strong>
        <span>${predictions.length} resolved</span>
      </div>
      <div class="bucket-bars">
        <div><span>Forecast</span><b style="width:${Math.round(meanForecast * 100)}%"></b><em>${fmtPct(meanForecast)}</em></div>
        <div><span>Observed</span><b style="width:${Math.round(observed * 100)}%"></b><em>${fmtPct(observed)}</em></div>
      </div>
      <small>Brier ${fmtScore(bucketScore)}</small>
    `;
    els.calibrationBuckets.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function render() {
  renderMetrics();
  renderLists();
  renderCategoryScores();
  renderDetails();
  renderAutoAdjuster();
  renderCalibration();
  renderNewsResults();
}

function csvText() {
  const header = ['question', 'probability', 'outcome', 'brier_score', 'category', 'notes', 'created_at', 'resolved_at'];
  const rows = state.predictions.map((prediction) => [
    prediction.question,
    prediction.probability,
    isResolved(prediction) ? prediction.outcome : '',
    isResolved(prediction) ? fmtScore(brier(prediction)) : '',
    prediction.category,
    prediction.notes,
    prediction.createdAt,
    prediction.resolvedAt
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}

function browserPreviewData() {
  const createdAt = new Date().toISOString();
  return {
    predictions: [
      {
        id: 'preview-1',
        question: 'Will the prototype ship before Friday?',
        probability: 72,
        outcome: 1,
        category: 'Product',
        notes: 'Core flows are done; export polish remains.',
        createdAt,
        resolvedAt: createdAt
      },
      {
        id: 'preview-2',
        question: 'Will the vendor respond within 48 hours?',
        probability: 35,
        outcome: 0,
        category: 'Operations',
        notes: 'Past response times were slow.',
        createdAt,
        resolvedAt: createdAt
      },
      {
        id: 'preview-3',
        question: 'Will the benchmark clear 82% accuracy?',
        probability: 58,
        outcome: null,
        category: 'Research',
        notes: 'Waiting on final test set.',
        createdAt,
        resolvedAt: ''
      }
    ]
  };
}

async function init() {
  if (!window.brierApp) {
    window.brierApp = {
      loadData: async () => browserPreviewData(),
      saveData: async (data) => data,
      dataPath: async () => 'Browser preview',
      exportCsv: async () => '',
      searchNews: async () => [
        {
          title: 'Preview article about product shipping signals',
          url: 'https://example.com/product-shipping',
          domain: 'example.com',
          date: '20260612'
        },
        {
          title: 'Preview analysis: benchmark results and model quality',
          url: 'https://example.com/benchmark-results',
          domain: 'example.com',
          date: '20260611'
        }
      ],
      openLink: async () => true
    };
  }

  const data = await window.brierApp.loadData();
  state.predictions = data.predictions || [];
  state.selectedId = state.predictions[0]?.id || '';
  els.dataPath.textContent = await window.brierApp.dataPath();
  bindEvents();
  render();
}

function bindEvents() {
  els.navButtons.forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('[data-jump]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.jump)));
  els.newPrediction.addEventListener('click', newPrediction);

  els.exportCsv.addEventListener('click', async () => {
    const filePath = await window.brierApp.exportCsv(csvText());
    if (filePath) showToast('CSV exported');
  });

  document.querySelectorAll('.filter').forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll('.filter').forEach((item) => item.classList.toggle('active', item === button));
      renderLists();
    });
  });

  els.searchInput.addEventListener('input', () => {
    state.search = els.searchInput.value;
    renderLists();
  });

  els.questionInput.addEventListener('input', () => {
    updateSelected({ question: els.questionInput.value });
    scheduleInfoAnalysis();
  });
  els.probabilityInput.addEventListener('input', () => updateSelected({
    probability: Number(els.probabilityInput.value),
    autoAdjustment: null
  }));
  els.categoryInput.addEventListener('input', () => updateSelected({ category: els.categoryInput.value }));
  els.notesInput.addEventListener('input', () => {
    updateSelected({ notes: els.notesInput.value });
    scheduleInfoAnalysis();
  });
  els.outcomeInput.addEventListener('change', () => {
    const value = els.outcomeInput.value;
    updateSelected({ outcome: value === '' ? null : Number(value) });
  });

  els.useQuestionSearch.addEventListener('click', () => {
    const prediction = selectedPrediction();
    if (!prediction) return;
    els.newsQueryInput.value = prediction.question || '';
    els.newsQueryInput.focus();
  });

  els.searchNews.addEventListener('click', searchNews);
  els.newsQueryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchNews();
  });

  els.newsResults.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const index = Number(button.dataset.newsOpen ?? button.dataset.newsNote ?? button.dataset.newsPlus ?? button.dataset.newsMinus);
    const article = state.newsResults[index];
    if (!article) return;

    if (button.dataset.newsOpen !== undefined) {
      await window.brierApp.openLink(article.url);
    } else if (button.dataset.newsNote !== undefined) {
      addEvidence(article, 'Evidence');
    } else if (button.dataset.newsPlus !== undefined) {
      addEvidence(article, 'Supporting evidence');
    } else if (button.dataset.newsMinus !== undefined) {
      addEvidence(article, 'Challenging evidence');
    }
  });

  els.deletePrediction.addEventListener('click', async () => {
    const prediction = selectedPrediction();
    if (!prediction) return;
    state.predictions = state.predictions.filter((item) => item.id !== prediction.id);
    state.selectedId = state.predictions[0]?.id || '';
    await save();
    render();
    showToast('Prediction deleted');
  });
}

async function searchNews() {
  const query = els.newsQueryInput.value.trim();
  if (!query) {
    showToast('Enter a search query first');
    return;
  }

  const now = Date.now();
  if (now - state.lastNewsSearchAt < 5000) {
    showToast('Give the news feed a few seconds between searches');
    return;
  }

  state.lastNewsSearchAt = now;
  state.newsLoading = true;
  state.newsResults = [];
  state.newsMessage = 'Searching recent news...';
  renderNewsResults();

  try {
    state.newsResults = await window.brierApp.searchNews({
      query,
      source: els.newsSourceInput.value
    });
    state.newsMessage = state.newsResults.length ? '' : 'No matching recent articles found.';
  } catch (error) {
    state.newsMessage = 'News search failed. Check your connection or try a broader query.';
  } finally {
    state.newsLoading = false;
    renderNewsResults();
  }
}

init();
