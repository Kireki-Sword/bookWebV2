const DB_KEY = 'inkwell_library';

const STATUS_LABELS = {
  reading: 'Reading',
  completed: 'Completed',
  plantoread: 'Plan to Read',
  dropped: 'Dropped'
};

const DB = {
  getLibrary() {
    try {
      return JSON.parse(localStorage.getItem(DB_KEY)) || {};
    } catch {
      return {};
    }
  },

  saveLibrary(library) {
    localStorage.setItem(DB_KEY, JSON.stringify(library));
  },

  getAll() {
    return Object.values(this.getLibrary());
  },

  getEntry(id) {
    return this.getLibrary()[id] || null;
  },

  addToLibrary(item, status) {
    const library = this.getLibrary();

    library[item.id] = {
      id: item.id,
      title: item.title || 'Untitled',
      authors: item.authors || '',
      type: item.type || 'Title',
      year: item.year || '',
      cover: item.cover || '',
      synopsis: item.synopsis || '',
      genres: item.genres || [],
      status,
      score: item.score || '',
      notes: item.notes || '',
      quotes: item.quotes || [],
      moments: item.moments || [],
      addedAt: item.addedAt || Date.now()
    };

    this.saveLibrary(library);
  },

  updateEntry(id, patch) {
    const library = this.getLibrary();

    if (!library[id]) return;

    library[id] = {
      ...library[id],
      ...patch
    };

    this.saveLibrary(library);
  },

  getByStatus(status) {
    return this.getAll().filter(item => item.status === status);
  }
};

let activeStatus = 'reading';
let librarySearchTerm = '';

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;

  if (page === 'home') initHomePage();
  if (page === 'detail') initDetailPage();
  if (page === 'notes') initNotesPage();
  if (page === 'quotes') initQuotesPage();
  if (page === 'moments') initMomentsPage();
});

/* GENERAL HELPERS */

function getParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

function navigate(page, params = {}) {
  const search = new URLSearchParams(params).toString();
  window.location.href = page + (search ? '?' + search : '');
}

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2300);
}

function makeId() {
  return 'custom_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

function currentItemId() {
  return getParams().id || '';
}

function goToDetailPage() {
  const id = currentItemId();
  if (id) navigate('detail.html', { id });
}

function itemMeta(item) {
  const parts = [];

  if (item.type) parts.push(item.type);
  if (item.year) parts.push(item.year);
  if (item.authors) parts.push(item.authors);

  return parts.join(' · ');
}

function imageOrPlaceholder(item, className = 'lib-cover') {
  if (item.cover) {
    return `
      <img
        class="${className}"
        src="${escapeHTML(item.cover)}"
        alt="${escapeHTML(item.title)}"
        onerror="this.replaceWith(createBookPlaceholder('${className}'))"
      >
    `;
  }

  return `<div class="${className}-placeholder"><i class="ti ti-book-2"></i></div>`;
}

function createBookPlaceholder(className) {
  const div = document.createElement('div');
  div.className = className + '-placeholder';
  div.innerHTML = '<i class="ti ti-book-2"></i>';
  return div;
}

/* HOME PAGE */

function initHomePage() {
  setupAddTitleForm();
  setupStatusTabs();
  setupLibrarySearch();
  renderLibrary();
}

function setupAddTitleForm() {
  const form = document.getElementById('add-title-form');
  if (!form) return;

  form.addEventListener('submit', event => {
    event.preventDefault();

    const title = document.getElementById('add-title').value.trim();
    const authors = document.getElementById('add-author').value.trim();
    const type = document.getElementById('add-type').value;
    const year = document.getElementById('add-year').value.trim();
    const cover = document.getElementById('add-cover').value.trim();
    const status = document.getElementById('add-status').value;

    if (!title) {
      showToast('Please add a title');
      return;
    }

    const item = {
      id: makeId(),
      title,
      authors,
      type,
      year,
      cover,
      synopsis: '',
      genres: []
    };

    DB.addToLibrary(item, status);

    form.reset();
    document.getElementById('add-type').value = 'Manga';
    document.getElementById('add-status').value = 'reading';

    activeStatus = status;
    updateStatusTabUI();
    renderLibrary();

    showToast('Added to your library');
  });
}

function setupStatusTabs() {
  const tabs = document.querySelectorAll('.status-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      activeStatus = tab.dataset.status;
      updateStatusTabUI();
      renderLibrary();
    });
  });
}

function updateStatusTabUI() {
  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.status === activeStatus);
  });
}

function setupLibrarySearch() {
  const input = document.getElementById('library-search');
  const results = document.getElementById('library-search-results');

  if (!input || !results) return;

  input.addEventListener('input', () => {
    librarySearchTerm = input.value.trim().toLowerCase();
    renderLibrary();
    renderSearchResults();
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.library-search-area')) {
      results.classList.remove('open');
    }
  });
}

function getFilteredLibraryItems() {
  let items = DB.getByStatus(activeStatus);

  if (!librarySearchTerm) return items;

  return items.filter(item => {
    const haystack = [
      item.title,
      item.authors,
      item.type,
      item.year
    ].join(' ').toLowerCase();

    return haystack.includes(librarySearchTerm);
  });
}

function renderSearchResults() {
  const results = document.getElementById('library-search-results');
  if (!results) return;

  const term = librarySearchTerm;

  if (!term) {
    results.classList.remove('open');
    results.innerHTML = '';
    return;
  }

  const matches = DB.getAll()
    .filter(item => {
      const haystack = [
        item.title,
        item.authors,
        item.type,
        item.year
      ].join(' ').toLowerCase();

      return haystack.includes(term);
    })
    .slice(0, 6);

  if (!matches.length) {
    results.classList.add('open');
    results.innerHTML = `
      <div class="search-result-btn">
        <div>
          <div class="search-result-title">No saved titles found</div>
          <div class="search-result-meta">Try another name or add it first.</div>
        </div>
      </div>
    `;
    return;
  }

  results.classList.add('open');

  results.innerHTML = matches.map(item => `
    <button class="search-result-btn" type="button" onclick="navigate('detail.html', { id: '${item.id}' })">
      ${
        item.cover
          ? `<img class="search-result-cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)}">`
          : `<div class="search-result-cover" style="display:grid;place-items:center;"><i class="ti ti-book-2"></i></div>`
      }
      <div>
        <div class="search-result-title">${escapeHTML(item.title)}</div>
        <div class="search-result-meta">${escapeHTML(itemMeta(item))}</div>
      </div>
    </button>
  `).join('');
}

function renderLibrary() {
  const content = document.getElementById('library-content');
  if (!content) return;

  const items = getFilteredLibraryItems();

  if (!items.length) {
    content.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-books"></i>
        <h3>No titles here yet</h3>
        <p>Add a title above or search another status tab.</p>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="library-table-wrap">
      <table class="library-table">
        <thead>
          <tr>
            <th>Cover</th>
            <th>Title</th>
            <th>Notes</th>
            <th>Favourite Quotes</th>
            <th>Favourite Moment</th>
            <th>Score</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(renderLibraryRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderLibraryRow(item) {
  const quoteCount = item.quotes ? item.quotes.length : 0;
  const momentCount = item.moments ? item.moments.length : 0;
  const hasNotes = item.notes && item.notes.trim().length > 0;

  return `
    <tr>
      <td>
        ${
          item.cover
            ? `<img class="lib-cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)}">`
            : `<div class="lib-cover-placeholder"><i class="ti ti-book-2"></i></div>`
        }
      </td>

      <td>
        <div class="lib-title">${escapeHTML(item.title)}</div>
        <div class="lib-meta">${escapeHTML(itemMeta(item))}</div>
      </td>

      <td>
        <a class="lib-btn ${hasNotes ? 'has-content' : ''}" href="notes.html?id=${encodeURIComponent(item.id)}">
          <i class="ti ti-notes"></i>
          ${hasNotes ? 'Notes Saved' : 'Notes'}
        </a>
      </td>

      <td>
        <a class="lib-btn ${quoteCount ? 'has-content' : ''}" href="quotes.html?id=${encodeURIComponent(item.id)}">
          <i class="ti ti-quote"></i>
          Quotes${quoteCount ? ` ${quoteCount}` : ''}
        </a>
      </td>

      <td>
        <a class="lib-btn ${momentCount ? 'has-content' : ''}" href="moments.html?id=${encodeURIComponent(item.id)}">
          <i class="ti ti-photo"></i>
          Moments${momentCount ? ` ${momentCount}` : ''}
        </a>
      </td>

      <td>
        <select class="score-select" onchange="updateScore('${item.id}', this.value)">
          <option value="">—</option>
          ${Array.from({ length: 10 }, (_, i) => {
            const score = i + 1;
            return `<option value="${score}" ${Number(item.score) === score ? 'selected' : ''}>★ ${score}</option>`;
          }).join('')}
        </select>
      </td>

      <td>
        <a class="lib-btn" href="detail.html?id=${encodeURIComponent(item.id)}">
          <i class="ti ti-info-circle"></i>
          Details
        </a>
      </td>
    </tr>
  `;
}

function updateScore(id, value) {
  DB.updateEntry(id, {
    score: value ? Number(value) : ''
  });

  showToast(value ? `Score set to ${value}/10` : 'Score cleared');
}

/* DETAIL PAGE */

function initDetailPage() {
  const id = currentItemId();
  const item = DB.getEntry(id);
  const content = document.getElementById('detail-content');

  if (!content) return;

  if (!item) {
    content.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-alert-circle"></i>
        <h3>Title not found</h3>
        <p>This item is not saved in your library.</p>
        <a class="btn-primary" href="index.html#library">Back to Library</a>
      </div>
    `;
    return;
  }

  document.title = `${item.title} — Inkwell`;

  const quoteCount = item.quotes ? item.quotes.length : 0;
  const momentCount = item.moments ? item.moments.length : 0;

  content.innerHTML = `
    <section class="detail-hero">
      <div>
        ${
          item.cover
            ? `<img class="detail-cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)}">`
            : `<div class="detail-cover-placeholder"><i class="ti ti-book-2"></i></div>`
        }
      </div>

      <div>
        <div class="detail-tags">
          <span class="detail-tag">${escapeHTML(STATUS_LABELS[item.status] || item.status)}</span>
          <span class="detail-tag">${escapeHTML(item.type || 'Title')}</span>
        </div>

        <h1 class="detail-title">${escapeHTML(item.title)}</h1>
        <p class="detail-author">${escapeHTML(item.authors || 'Unknown creator')}</p>

        <div class="detail-stats">
          <div class="detail-stat">
            <div class="detail-stat-val">${item.year || '—'}</div>
            <div class="detail-stat-label">Year</div>
          </div>

          <div class="detail-stat">
            <div class="detail-stat-val">${item.score ? '★ ' + item.score : '—'}</div>
            <div class="detail-stat-label">Score</div>
          </div>

          <div class="detail-stat">
            <div class="detail-stat-val">${quoteCount}</div>
            <div class="detail-stat-label">Quotes</div>
          </div>

          <div class="detail-stat">
            <div class="detail-stat-val">${momentCount}</div>
            <div class="detail-stat-label">Moments</div>
          </div>
        </div>

        <label class="form-label" for="detail-status">Change status</label>
        <select class="status-select-detail" id="detail-status" onchange="changeDetailStatus('${item.id}', this.value)">
          <option value="reading" ${item.status === 'reading' ? 'selected' : ''}>Reading</option>
          <option value="completed" ${item.status === 'completed' ? 'selected' : ''}>Completed</option>
          <option value="plantoread" ${item.status === 'plantoread' ? 'selected' : ''}>Plan to Read</option>
          <option value="dropped" ${item.status === 'dropped' ? 'selected' : ''}>Dropped</option>
        </select>

        <div class="detail-actions">
          <a class="btn-primary" href="notes.html?id=${encodeURIComponent(item.id)}">
            <i class="ti ti-notes"></i>
            Notes
          </a>

          <a class="btn-ghost" href="quotes.html?id=${encodeURIComponent(item.id)}">
            <i class="ti ti-quote"></i>
            Favourite Quotes
          </a>

          <a class="btn-ghost" href="moments.html?id=${encodeURIComponent(item.id)}">
            <i class="ti ti-photo"></i>
            Favourite Moments
          </a>

          <a class="btn-ghost" href="index.html#library">
            <i class="ti ti-books"></i>
            Back to Library
          </a>
        </div>
      </div>
    </section>

    <section class="detail-section">
      <h2>Synopsis / Description</h2>
      <p>
        ${
          item.synopsis
            ? escapeHTML(item.synopsis)
            : 'No description saved yet. You can use the notes page to write your own thoughts about this title.'
        }
      </p>
    </section>
  `;
}

function changeDetailStatus(id, status) {
  DB.updateEntry(id, { status });
  showToast(`Moved to ${STATUS_LABELS[status]}`);
}

/* NOTES PAGE */

function initNotesPage() {
  const id = currentItemId();
  const item = DB.getEntry(id);

  if (!item) {
    renderMissingJournalPage('Notes');
    return;
  }

  document.title = `Notes for ${item.title} — Inkwell`;

  document.getElementById('notes-title').textContent = `Notes for ${item.title}`;
  document.getElementById('notes-meta').textContent = itemMeta(item);
  document.getElementById('notes-text').value = item.notes || '';
}

function saveNotesPage() {
  const id = currentItemId();
  const text = document.getElementById('notes-text').value.trim();

  DB.updateEntry(id, { notes: text });
  showToast('Notes saved');
}

/* QUOTES PAGE */

function initQuotesPage() {
  const id = currentItemId();
  const item = DB.getEntry(id);

  if (!item) {
    renderMissingJournalPage('Favourite Quotes');
    return;
  }

  document.title = `Quotes from ${item.title} — Inkwell`;

  document.getElementById('quotes-title').textContent = `Favourite Quotes from ${item.title}`;
  document.getElementById('quotes-meta').textContent = itemMeta(item);

  renderQuotesPageList();
}

function addQuotePage() {
  const id = currentItemId();
  const item = DB.getEntry(id);

  if (!item) return;

  const text = document.getElementById('quote-text').value.trim();
  const place = document.getElementById('quote-place').value.trim();

  if (!text) {
    showToast('Write a quote first');
    return;
  }

  const quotes = [
    ...(item.quotes || []),
    {
      text,
      place,
      createdAt: Date.now()
    }
  ];

  DB.updateEntry(id, { quotes });

  document.getElementById('quote-text').value = '';
  document.getElementById('quote-place').value = '';

  renderQuotesPageList();
  showToast('Quote saved');
}

function renderQuotesPageList() {
  const id = currentItemId();
  const item = DB.getEntry(id);
  const list = document.getElementById('quotes-list');

  if (!item || !list) return;

  const quotes = item.quotes || [];

  if (!quotes.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-quote"></i>
        <h3>No quotes yet</h3>
        <p>Add your first favourite quote above.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = quotes.map((quote, index) => `
    <article class="quote-card">
      <div class="card-top">
        <div>
          <p class="quote-text">“${escapeHTML(quote.text)}”</p>
          ${quote.place ? `<p class="quote-place">${escapeHTML(quote.place)}</p>` : ''}
        </div>

        <button class="delete-btn" type="button" onclick="deleteQuotePage(${index})">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </article>
  `).join('');
}

function deleteQuotePage(index) {
  const id = currentItemId();
  const item = DB.getEntry(id);

  if (!item) return;

  const quotes = [...(item.quotes || [])];
  quotes.splice(index, 1);

  DB.updateEntry(id, { quotes });
  renderQuotesPageList();
  showToast('Quote deleted');
}

/* MOMENTS PAGE */

function initMomentsPage() {
  const id = currentItemId();
  const item = DB.getEntry(id);

  if (!item) {
    renderMissingJournalPage('Favourite Moments');
    return;
  }

  document.title = `Moments from ${item.title} — Inkwell`;

  document.getElementById('moments-title').textContent = `Favourite Moments from ${item.title}`;
  document.getElementById('moments-meta').textContent = itemMeta(item);

  renderMomentsPageList();
}

async function addMomentPage() {
  const id = currentItemId();
  const item = DB.getEntry(id);

  if (!item) return;

  const title = document.getElementById('moment-title').value.trim();
  const desc = document.getElementById('moment-desc').value.trim();
  const imageUrl = document.getElementById('moment-image-url').value.trim();
  const imageFile = document.getElementById('moment-image-file').files[0];

  if (!title && !desc) {
    showToast('Add a title or description first');
    return;
  }

  let uploadedImage = '';

  if (imageFile) {
    uploadedImage = await readFileAsDataURL(imageFile);
  }

  const moments = [
    ...(item.moments || []),
    {
      title,
      desc,
      image: uploadedImage || imageUrl,
      createdAt: Date.now()
    }
  ];

  DB.updateEntry(id, { moments });

  document.getElementById('moment-title').value = '';
  document.getElementById('moment-desc').value = '';
  document.getElementById('moment-image-url').value = '';
  document.getElementById('moment-image-file').value = '';

  renderMomentsPageList();
  showToast('Moment saved');
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

function renderMomentsPageList() {
  const id = currentItemId();
  const item = DB.getEntry(id);
  const list = document.getElementById('moments-list');

  if (!item || !list) return;

  const moments = item.moments || [];

  if (!moments.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-photo"></i>
        <h3>No favourite moments yet</h3>
        <p>Add a scene, panel, image, or memory above.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = moments.map((moment, index) => `
    <article class="moment-card">
      ${moment.image ? `<img class="moment-img" src="${escapeHTML(moment.image)}" alt="${escapeHTML(moment.title || 'Favourite moment')}" onerror="this.style.display='none'">` : ''}

      <div class="card-top">
        <div>
          <h3 class="moment-title">${escapeHTML(moment.title || 'Untitled Moment')}</h3>
          ${moment.desc ? `<p class="moment-desc">${escapeHTML(moment.desc)}</p>` : ''}
        </div>

        <button class="delete-btn" type="button" onclick="deleteMomentPage(${index})">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </article>
  `).join('');
}

function deleteMomentPage(index) {
  const id = currentItemId();
  const item = DB.getEntry(id);

  if (!item) return;

  const moments = [...(item.moments || [])];
  moments.splice(index, 1);

  DB.updateEntry(id, { moments });
  renderMomentsPageList();
  showToast('Moment deleted');
}

/* MISSING PAGE */

function renderMissingJournalPage(title) {
  const main = document.querySelector('.page-main');

  if (!main) return;

  main.innerHTML = `
    <div class="empty-state">
      <i class="ti ti-alert-circle"></i>
      <h3>${escapeHTML(title)} not found</h3>
      <p>This item is not saved in your library.</p>
      <a class="btn-primary" href="index.html#library">Back to Library</a>
    </div>
  `;
}