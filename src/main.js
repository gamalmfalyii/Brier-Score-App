const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const https = require('https');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

const APP_TITLE = 'Brier Score Predictor';

function dataFilePath() {
  return path.join(app.getPath('userData'), 'predictions.json');
}

function nowIso() {
  return new Date().toISOString();
}

function samplePrediction(question, probability, outcome, category, notes) {
  return {
    id: crypto.randomUUID(),
    question,
    probability,
    outcome,
    category,
    notes,
    createdAt: nowIso(),
    resolvedAt: outcome === null ? '' : nowIso()
  };
}

function normalizePrediction(prediction) {
  const normalized = { ...prediction };
  const probability = Number(normalized.probability);
  if (Number.isFinite(probability) && probability > 0 && probability <= 1) {
    normalized.probability = Math.round(probability * 100);
  }
  return normalized;
}

function defaultData() {
  return {
    predictions: [
      samplePrediction('Will the project prototype be ready by Friday?', 72, 1, 'Work', 'Strong momentum, but one integration risk.'),
      samplePrediction('Will the vendor reply within 48 hours?', 35, 0, 'Operations', 'Past response times were slower than expected.'),
      samplePrediction('Will the model benchmark exceed 82% accuracy?', 58, null, 'Research', 'Awaiting final test set.'),
      samplePrediction('Will the budget stay under $2,000 this month?', 66, 1, 'Finance', 'Known expenses are already logged.'),
      samplePrediction('Will the candidate accept the offer?', 41, 0, 'Hiring', 'Competing offer seemed likely.')
    ]
  };
}

async function readData() {
  try {
    const raw = await fs.readFile(dataFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { predictions: Array.isArray(parsed.predictions) ? parsed.predictions.map(normalizePrediction) : [] };
  } catch (_error) {
    const seeded = defaultData();
    await writeData(seeded);
    return seeded;
  }
}

async function writeData(data) {
  await fs.mkdir(path.dirname(dataFilePath()), { recursive: true });
  await fs.writeFile(dataFilePath(), JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 660,
    title: APP_TITLE,
    backgroundColor: '#f7f7f4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function getText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Forecast Lab/0.1.0'
      }
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`News request failed with status ${response.statusCode}`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve(body);
      });
    });

    request.setTimeout(12000, () => {
      request.destroy(new Error('News request timed out'));
    });
    request.on('error', reject);
  });
}

async function getJson(url) {
  return JSON.parse(await getText(url));
}

function normalizeArticle(article) {
  return {
    title: article.title || 'Untitled article',
    url: article.url || '',
    domain: article.domain || '',
    sourceCountry: article.sourcecountry || '',
    date: article.seendate || article.seendatetime || '',
    snippet: article.socialimage ? 'Image available from source.' : '',
    language: article.language || ''
  };
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function tagValue(item, tag) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function parseGoogleNewsRss(xml) {
  const items = String(xml || '').match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, 12).map((item) => {
    const url = tagValue(item, 'link');
    let domain = tagValue(item, 'source') || '';
    try {
      if (!domain && url) domain = new URL(url).hostname.replace(/^www\./, '');
    } catch (_error) {
      domain = 'Google News';
    }

    return {
      title: tagValue(item, 'title') || 'Untitled article',
      url,
      domain,
      sourceCountry: '',
      date: tagValue(item, 'pubDate'),
      snippet: '',
      language: ''
    };
  });
}

async function searchGoogleNews(query, source) {
  const sourceFilter = String(source || 'all').toLowerCase();
  const sourceQuery = sourceFilter === 'all' ? query : `${query} site:${sourceFilter}`;
  const url = new URL('https://news.google.com/rss/search');
  url.searchParams.set('q', sourceQuery);
  url.searchParams.set('hl', 'en-US');
  url.searchParams.set('gl', 'US');
  url.searchParams.set('ceid', 'US:en');
  return parseGoogleNewsRss(await getText(url.toString()));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('data:load', readData);

ipcMain.handle('data:save', async (_event, data) => {
  return writeData(data);
});

ipcMain.handle('data:path', async () => dataFilePath());

ipcMain.handle('csv:export', async (_event, rows) => {
  const result = await dialog.showSaveDialog({
    title: 'Export predictions',
    defaultPath: path.join(app.getPath('documents'), 'brier-score-predictions.csv'),
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });

  if (result.canceled || !result.filePath) return '';
  await fs.writeFile(result.filePath, rows, 'utf8');
  await shell.showItemInFolder(result.filePath);
  return result.filePath;
});

ipcMain.handle('news:search', async (_event, { query, source }) => {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  try {
    const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    url.searchParams.set('query', cleanQuery);
    url.searchParams.set('mode', 'ArtList');
    url.searchParams.set('format', 'json');
    url.searchParams.set('maxrecords', '18');
    url.searchParams.set('sort', 'HybridRel');
    url.searchParams.set('timespan', '30d');

    const data = await getJson(url.toString());
    const sourceFilter = String(source || 'all').toLowerCase();
    const articles = Array.isArray(data.articles) ? data.articles.map(normalizeArticle) : [];

    if (sourceFilter === 'all') return articles.slice(0, 12);
    const filtered = articles.filter((article) => article.domain.toLowerCase().includes(sourceFilter)).slice(0, 12);
    if (filtered.length) return filtered;
  } catch (_error) {
    // Fall back to Google News RSS when the public news index is rate-limited.
  }

  return searchGoogleNews(cleanQuery, source);
});

ipcMain.handle('link:open', async (_event, url) => {
  const target = String(url || '');
  if (!/^https?:\/\//i.test(target)) return false;
  await shell.openExternal(target);
  return true;
});
