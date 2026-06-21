const JIKAN = 'https://api.jikan.moe/v4';
const GBOOKS = 'https://www.googleapis.com/books/v1';

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
    const oldEntry = library[item.id] || {};

    library[item.id] = {
      id: item.id,
      source: item.source || oldEntry.source || '',
      externalId: item.externalId || oldEntry.externalId || '',
      title: item.title || oldEntry.title || 'Untitled',
      authors: item.authors || oldEntry.authors || '',
      type: item.type || oldEntry.type || 'Book',
      year: item.year || oldEntry.year || '',
      cover: item.cover || oldEntry.cover || '',
      synopsis: item.synopsis || oldEntry.synopsis || '',
      genres: item.genres || oldEntry.genres || [],
      score: oldEntry.score || '',
      status,
      notes: oldEntry.notes || '',
      quotes: oldEntry.quotes || [],
      moments: oldEntry.moments || [],
      addedAt: oldEntry.addedAt || Date.now()
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

let searchPage = 1;
let activeLibraryStatus = 'reading';
let librarySearchTerm = '';
let currentDetailItem = null;

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;

  if (page === 'search') initSearchPage();
  if (page === 'library') initLibraryPage();
  if (page === 'detail') initDetailPage();
  if (page === 'notes') initNotesPage();
  if (page === 'quotes') initQuotesPage();
  if (page === 'moments') initMomentsPage();
});

/* GENERAL */

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

function stripHTML(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function fixImage(url = '') {
  return String(url || '').replace(/^http:\/\//, 'https://');
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

function debounce(fn, delay = 450) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function currentItemId() {
  return getParams().id || '';
}

function goToDetailPage() {
  const id = currentItemId();

  if (id) {
    navigate('detail.html', { id });
  }
}

function itemMeta(item) {
  const parts = [];

  if (item.type) parts.push(item.type);
  if (item.authors) parts.push(item.authors);
  if (item.year) parts.push(item.year);

  return parts.join(' · ');
}

/* NORMALIZERS */

function normalizeManga(manga) {
  return {
    id: 'manga_' + manga.mal_id,
    source: 'jikan',
    externalId: manga.mal_id,
    title: manga.title_english || manga.title || 'Untitled',
    authors: (manga.authors || []).map(author => author.name).join(', '),
    type: manga.type || 'Manga',
    year: manga.published?.prop?.from?.year || '',
    cover: fixImage(
      manga.images?.jpg?.large_image_url ||
      manga.images?.jpg?.image_url ||
      ''
    ),
    synopsis: manga.synopsis || '',
    genres: (manga.genres || []).map(genre => genre.name),
    databaseScore: manga.score || '',
    chapters: manga.chapters || '',
    volumes: manga.volumes || '',
    status: manga.status || ''
  };
}

function normalizeBook(book, forcedType = 'Book') {
  const info = book.volumeInfo || {};

  return {
    id: 'book_' + book.id,
    source: 'google',
    externalId: book.id,
    title: info.title || 'Untitled',
    authors: (info.authors || []).join(', '),
    type: forcedType,
    year: info.publishedDate ? String(info.publishedDate).slice(0, 4) : '',
    cover: fixImage(
      info.imageLinks?.thumbnail ||
      info.imageLinks?.smallThumbnail ||
      ''
    ),
    synopsis: stripHTML(info.description || ''),
    genres: info.categories || [],
    databaseScore: info.averageRating || '',
    pages: info.pageCount || '',
    status: info.publishedDate ? 'Published' : ''
  };
}

/* API */

const API = {
  async searchManga({ query, genre, author, sort, page, type }) {
    const params = new URLSearchParams();

    params.set('page', page);
    params.set('limit', '20');
    params.set('sfw', 'true');

    let searchText = query || '';

    if (author) {
      searchText += ' ' + author;
    }

    if (searchText.trim()) {
      params.set('q', searchText.trim());
    }

    const genreMap = {
      action: 1,
      adventure: 2,
      comedy: 4,
      drama: 8,
      fantasy: 10,
      horror: 14,
      mystery: 7,
      romance: 22,
      'sci-fi': 24,
      thriller: 41
    };

    if (genre && genreMap[genre]) {
      params.set('genres', genreMap[genre]);
    }

    if (type === 'lightnovels') {
      params.set('type', 'lightnovel');
    }

    if (sort === 'score') {
      params.set('order_by', 'score');
      params.set('sort', 'desc');
    } else if (sort === 'newest') {
      params.set('order_by', 'start_date');
      params.set('sort', 'desc');
    } else {
      params.set('order_by', 'popularity');
      params.set('sort', 'asc');
    }

    const response = await fetch(`${JIKAN}/manga?${params}`);

    if (!response.ok) {
      throw new Error('Manga search failed');
    }

    const data = await response.json();

    return {
      items: (data.data || []).map(normalizeManga),
      total: data.pagination?.items?.total || 0,
      pages: data.pagination?.last_visible_page || 1
    };
  },

  async searchBooks({ query, genre, author, sort, page, type }) {
    const startIndex = (page - 1) * 20;

    let q = query || 'popular books';

    if (genre) {
      q += ` subject:${genre}`;
    }

    if (author) {
      q += ` inauthor:${author}`;
    }

    if (type === 'comics') {
      q += ' subject:comics';
    }

    const params = new URLSearchParams();

    params.set('q', q);
    params.set('printType', 'books');
    params.set('maxResults', '20');
    params.set('startIndex', startIndex);
    params.set('orderBy', sort === 'newest' ? 'newest' : 'relevance');

    const response = await fetch(`${GBOOKS}/volumes?${params}`);

    if (!response.ok) {
      throw new Error('Books search failed');
    }

    const data = await response.json();

    return {
      items: (data.items || []).map(book => normalizeBook(book, type === 'comics' ? 'Comic' : 'Book')),
      total: data.totalItems || 0,
      pages: Math.max(1, Math.ceil((data.totalItems || 0) / 20))
    };
  },

  async getMangaDetail(id) {
    const response = await fetch(`${JIKAN}/manga/${id}/full`);

    if (!response.ok) {
      throw new Error('Manga detail failed');
    }

    const data = await response.json();

    return normalizeManga(data.data);
  },

  async getBookDetail(id) {
    const response = await fetch(`${GBOOKS}/volumes/${id}`);

    if (!response.ok) {
      throw new Error('Book detail failed');
    }

    const data = await response.json();

    return normalizeBook(data);
  }
};

/* SEARCH PAGE */

function initSearchPage() {
  const params = getParams();

  const searchInput = document.getElementById('database-search');
  const typeFilter = document.getElementById('type-filter');
  const genreFilter = document.getElementById('genre-filter');
  const authorFilter = document.getElementById('author-filter');
  const sortFilter = document.getElementById('sort-filter');
  const searchBtn = document.getElementById('search-btn');

  if (params.q && searchInput) {
    searchInput.value = params.q;
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      searchPage = 1;
      runDatabaseSearch();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        searchPage = 1;
        runDatabaseSearch();
      }
    });

    searchInput.addEventListener('input', debounce(() => {
      searchPage = 1;
      runDatabaseSearch();
    }, 650));
  }

  [typeFilter, genreFilter, authorFilter, sortFilter].forEach(input => {
    if (!input) return;

    input.addEventListener('change', () => {
      searchPage = 1;
      runDatabaseSearch();
    });
  });

  runDatabaseSearch();
}

async function runDatabaseSearch() {
  const grid = document.getElementById('search-results');
  const resultCount = document.getElementById('result-count');
  const pagination = document.getElementById('pagination');

  if (!grid) return;

  const query = document.getElementById('database-search').value.trim();
  const type = document.getElementById('type-filter').value;
  const genre = document.getElementById('genre-filter').value;
  const author = document.getElementById('author-filter').value.trim();
  const sort = document.getElementById('sort-filter').value;

  grid.innerHTML = renderSkeletonCards(12);
  pagination.innerHTML = '';
  resultCount.textContent = 'Searching...';

  try {
    let result;

    const searchData = {
      query,
      type,
      genre,
      author,
      sort,
      page: searchPage
    };

    if (type === 'books' || type === 'comics') {
      result = await API.searchBooks(searchData);
    } else if (type === 'manga' || type === 'lightnovels') {
      result = await API.searchManga(searchData);
    } else {
      const [manga, books] = await Promise.all([
        API.searchManga(searchData).catch(() => ({ items: [], total: 0, pages: 1 })),
        API.searchBooks(searchData).catch(() => ({ items: [], total: 0, pages: 1 }))
      ]);

      result = {
        items: [...manga.items.slice(0, 10), ...books.items.slice(0, 10)],
        total: manga.total + books.total,
        pages: Math.max(manga.pages, books.pages)
      };
    }

    if (!result.items.length) {
      resultCount.textContent = '';
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="ti ti-search-off"></i>
          <h3>No results found</h3>
          <p>Try a different title, author, type, or genre.</p>
        </div>
      `;
      return;
    }

    resultCount.textContent = `Showing ${result.items.length} result${result.items.length === 1 ? '' : 's'}`;

    grid.innerHTML = result.items.map(renderSearchCard).join('');

    renderPagination(pagination, searchPage, Math.min(result.pages, 20), page => {
      searchPage = page;
      runDatabaseSearch();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  } catch (error) {
    console.error(error);

    resultCount.textContent = '';

    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="ti ti-alert-circle"></i>
        <h3>Search failed</h3>
        <p>Please try again in a moment.</p>
      </div>
    `;
  }
}

function renderSearchCard(item) {
  const cover = item.cover
    ? `<img class="card-cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)}">`
    : `<div class="card-cover-placeholder"><i class="ti ti-book-2"></i></div>`;

  return `
    <a class="card" href="detail.html?id=${encodeURIComponent(item.id)}">
      ${cover}

      <div class="card-body">
        <div class="card-title">${escapeHTML(item.title)}</div>
        <div class="card-meta">${escapeHTML(item.authors || item.type || '')}</div>
        <div class="card-meta">${escapeHTML(item.type || '')}${item.year ? ` · ${escapeHTML(item.year)}` : ''}</div>
        ${item.databaseScore ? `<span class="card-score">★ ${Number(item.databaseScore).toFixed(1)}</span>` : ''}
      </div>
    </a>
  `;
}

function renderSkeletonCards(count) {
  return Array.from({ length: count }, () => `
    <div class="card">
      <div class="card-cover-placeholder"></div>
      <div class="card-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>
  `).join('');
}

function renderPagination(container, current, total, callback) {
  if (!container || total <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  let html = '';

  html += `
    <button class="page-btn" ${current <= 1 ? 'disabled' : ''} data-page="${current - 1}">
      ‹
    </button>
  `;

  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);

  for (let i = start; i <= end; i++) {
    html += `
      <button class="page-btn ${i === current ? 'active' : ''}" data-page="${i}">
        ${i}
      </button>
    `;
  }

  html += `
    <button class="page-btn" ${current >= total ? 'disabled' : ''} data-page="${current + 1}">
      ›
    </button>
  `;

  container.innerHTML = html;

  container.querySelectorAll('.page-btn').forEach(button => {
    button.addEventListener('click', () => {
      const page = Number(button.dataset.page);

      if (!page || page < 1 || page > total) return;

      callback(page);
    });
  });
}

/* LIBRARY PAGE */

function initLibraryPage() {
  const searchInput = document.getElementById('library-search');

  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeLibraryStatus = tab.dataset.status;

      document.querySelectorAll('.status-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.status === activeLibraryStatus);
      });

      renderLibrary();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      librarySearchTerm = searchInput.value.trim().toLowerCase();
      renderLibrary();
    });
  }

  renderLibrary();
}

function getFilteredLibrary() {
  let items = DB.getByStatus(activeLibraryStatus);

  if (!librarySearchTerm) return items;

  return items.filter(item => {
    const text = [
      item.title,
      item.authors,
      item.type,
      item.year
    ].join(' ').toLowerCase();

    return text.includes(librarySearchTerm);
  });
}

function renderLibrary() {
  const content = document.getElementById('library-content');

  if (!content) return;

  const items = getFilteredLibrary();

  if (!items.length) {
    content.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-books"></i>
        <h3>No titles here yet</h3>
        <p>Your library starts empty. Search the database and add your first title.</p>
        <a class="btn-primary" href="search.html">
          <i class="ti ti-search"></i>
          Search Titles
        </a>
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

  const cover = item.cover
    ? `<img class="lib-cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)}">`
    : `<div class="lib-cover-placeholder"><i class="ti ti-book-2"></i></div>`;

  return `
    <tr>
      <td>${cover}</td>

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
        <select class="score-select" onchange="updateScore('${escapeHTML(item.id)}', this.value)">
          <option value="">—</option>
          ${Array.from({ length: 10 }, (_, index) => {
            const score = index + 1;
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

async function initDetailPage() {
  const id = currentItemId();
  const content = document.getElementById('detail-content');

  if (!content) return;

  if (!id) {
    renderMissingDetail();
    return;
  }

  content.innerHTML = `
    <div class="empty-state">
      <i class="ti ti-loader-2"></i>
      <h3>Loading details...</h3>
      <p>Please wait.</p>
    </div>
  `;

  const saved = DB.getEntry(id);

  try {
    let item;

    if (saved) {
      item = saved;
    } else if (id.startsWith('manga_')) {
      item = await API.getMangaDetail(id.replace('manga_', ''));
    } else if (id.startsWith('book_')) {
      item = await API.getBookDetail(id.replace('book_', ''));
    } else {
      renderMissingDetail();
      return;
    }

    currentDetailItem = item;
    document.title = `${item.title} — Inkwell`;

    renderDetail(item, !!saved);

  } catch (error) {
    console.error(error);
    renderMissingDetail();
  }
}

function renderDetail(item, isSaved) {
  const content = document.getElementById('detail-content');

  if (!content) return;

  const cover = item.cover
    ? `<img class="detail-cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)}">`
    : `<div class="detail-cover-placeholder"><i class="ti ti-book-2"></i></div>`;

  const quoteCount = item.quotes ? item.quotes.length : 0;
  const momentCount = item.moments ? item.moments.length : 0;

  content.innerHTML = `
    <section class="detail-hero">
      <div>${cover}</div>

      <div>
        <div class="detail-tags">
          <span class="detail-tag">${escapeHTML(item.type || 'Book')}</span>
          ${isSaved ? `<span class="detail-tag">${escapeHTML(STATUS_LABELS[item.status] || item.status)}</span>` : ''}
          ${(item.genres || []).slice(0, 4).map(genre => `<span class="detail-tag">${escapeHTML(genre)}</span>`).join('')}
        </div>

        <h1 class="detail-title">${escapeHTML(item.title)}</h1>
        <p class="detail-author">${escapeHTML(item.authors || 'Unknown creator')}</p>

        <div class="detail-stats">
          <div class="detail-stat">
            <div class="detail-stat-val">${item.year || '—'}</div>
            <div class="detail-stat-label">Year</div>
          </div>

          <div class="detail-stat">
            <div class="detail-stat-val">${item.score ? '★ ' + item.score : item.databaseScore ? '★ ' + Number(item.databaseScore).toFixed(1) : '—'}</div>
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

        ${
          isSaved
            ? renderSavedDetailActions(item)
            : renderAddToLibraryActions()
        }
      </div>
    </section>

    <section class="detail-section">
      <h2>Synopsis / Description</h2>
      <p>${item.synopsis ? escapeHTML(item.synopsis) : 'No description available.'}</p>
    </section>
  `;
}

function renderAddToLibraryActions() {
  return `
    <div class="detail-section" style="margin-top: 1.5rem;">
      <h2>Add to Library</h2>
      <p style="margin-bottom: 1rem;">Choose where you want to save this title.</p>

      <div class="add-status-buttons">
        <button class="btn-primary" type="button" onclick="addCurrentDetailToLibrary('reading')">Reading</button>
        <button class="btn-ghost" type="button" onclick="addCurrentDetailToLibrary('completed')">Completed</button>
        <button class="btn-ghost" type="button" onclick="addCurrentDetailToLibrary('plantoread')">Plan to Read</button>
        <button class="btn-ghost" type="button" onclick="addCurrentDetailToLibrary('dropped')">Dropped</button>
      </div>
    </div>
  `;
}

function renderSavedDetailActions(item) {
  return `
    <label class="form-label" for="detail-status">Change status</label>

    <select class="status-select-detail" id="detail-status" onchange="changeDetailStatus('${escapeHTML(item.id)}', this.value)">
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

      <a class="btn-ghost" href="library.html">
        <i class="ti ti-books"></i>
        Back to Library
      </a>
    </div>
  `;
}

function addCurrentDetailToLibrary(status) {
  if (!currentDetailItem) return;

  DB.addToLibrary(currentDetailItem, status);
  showToast(`Added to ${STATUS_LABELS[status]}`);

  setTimeout(() => {
    navigate('library.html');
  }, 700);
}

function changeDetailStatus(id, status) {
  DB.updateEntry(id, { status });
  showToast(`Moved to ${STATUS_LABELS[status]}`);
}

function renderMissingDetail() {
  const content = document.getElementById('detail-content');

  if (!content) return;

  content.innerHTML = `
    <div class="empty-state">
      <i class="ti ti-alert-circle"></i>
      <h3>Title not found</h3>
      <p>Go back to Search or My Library and try again.</p>
      <a class="btn-primary" href="search.html">
        <i class="ti ti-search"></i>
        Search Titles
      </a>
    </div>
  `;
}

/* NOTES */

function initNotesPage() {
  const item = DB.getEntry(currentItemId());

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
  const textarea = document.getElementById('notes-text');

  DB.updateEntry(id, {
    notes: textarea.value.trim()
  });

  showToast('Notes saved');
}

/* QUOTES */

function initQuotesPage() {
  const item = DB.getEntry(currentItemId());

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
  const item = DB.getEntry(currentItemId());
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

/* MOMENTS */

function initMomentsPage() {
  const item = DB.getEntry(currentItemId());

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
  const item = DB.getEntry(currentItemId());
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

/* MISSING JOURNAL */

function renderMissingJournalPage(title) {
  const main = document.querySelector('.page-main');

  if (!main) return;

  main.innerHTML = `
    <div class="empty-state">
      <i class="ti ti-alert-circle"></i>
      <h3>${escapeHTML(title)} not found</h3>
      <p>This title is not saved in your library.</p>
      <a class="btn-primary" href="library.html">
        <i class="ti ti-books"></i>
        Back to Library
      </a>
    </div>
  `;
}