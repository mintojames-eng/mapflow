/**
 * MapFlow — Focused Destination & Route Assistant
 * JavaScript: Search, Selection, Route Planning, Validation & Feedback
 *
 * This script implements the improved UX workflow:
 *   Search → Filter → Select Destination → Confirm → Get Directions → Plan Route → View Summary
 *
 * Events demonstrated:
 *   1. input  — live search filtering
 *   2. click  — select destination, get directions, change, reset, retry
 *   3. submit — route form validation
 *   4. change — travel mode update
 */

// ==================== STATE ====================

const state = {
    places: [],              // fetched from JSON
    filteredPlaces: [],      // current search results
    selectedPlace: null,     // chosen destination
    travelMode: null,        // 'walking' | 'driving' | 'cycling'
    routeReady: false,
    currentStep: 'search',   // 'search' | 'confirmed' | 'directions' | 'route'
};

// ==================== DOM REFERENCES ====================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    // Search
    searchInput: $('#search-input'),
    searchResults: $('#search-results'),
    loadingIndicator: $('#loading-indicator'),
    errorIndicator: $('#error-indicator'),
    retryBtn: $('#retry-btn'),
    emptyState: $('#empty-state'),

    // Confirmation
    confirmPanel: $('#confirm-panel'),
    confirmName: $('#confirm-name'),
    confirmAddress: $('#confirm-address'),
    confirmCategory: $('#confirm-category'),
    changeDstBtn: $('#change-destination-btn'),
    getDirBtn: $('#get-directions-btn'),

    // Route Form
    routePanel: $('#route-panel'),
    routeForm: $('#route-form'),
    fromInput: $('#from-input'),
    toInput: $('#to-input'),
    fromError: $('#from-error'),
    toError: $('#to-error'),
    modeError: $('#mode-error'),
    modeBtns: $$('.mode-btn'),
    planRouteBtn: $('#plan-route-btn'),

    // Route Summary
    summaryPanel: $('#summary-panel'),
    summaryDest: $('#summary-dest'),
    summaryFrom: $('#summary-from'),
    summaryMode: $('#summary-mode'),
    summaryDist: $('#summary-dist'),
    summaryTime: $('#summary-time'),
    startNavBtn: $('#start-nav-btn'),
    newSearchBtn: $('#new-search-btn'),

    // Steps
    stepDots: $$('.step-dot'),

    // Map
    mapContainer: $('#map'),

    // Toast
    toastContainer: $('#toast-container'),
};

// ==================== MAP ====================

let map, marker, routeLine;

function initMap() {
    // Center on Bengaluru
    map = L.map('map', {
        zoomControl: false,
    }).setView([12.9346, 77.6057], 13);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
    }).addTo(map);
}

function setMarker(lat, lng, name) {
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng])
        .addTo(map)
        .bindPopup(`<strong>${name}</strong>`)
        .openPopup();
    map.setView([lat, lng], 15, { animate: true });
}

function drawRoute(fromLat, fromLng, toLat, toLng) {
    if (routeLine) map.removeLayer(routeLine);

    // Simulated route path (curved via midpoint) — this is prototype/mock data
    const midLat = (fromLat + toLat) / 2 + 0.003;
    const midLng = (fromLng + toLng) / 2 - 0.002;
    routeLine = L.polyline(
        [[fromLat, fromLng], [midLat, midLng], [toLat, toLng]],
        { color: '#2563eb', weight: 4, dashArray: '8 6', opacity: 0.8 }
    ).addTo(map);

    // Add origin marker
    L.circleMarker([fromLat, fromLng], {
        radius: 7, color: '#059669', fillColor: '#059669', fillOpacity: 1,
    }).addTo(map).bindPopup('Starting Point');

    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
}

function resetMap() {
    if (marker) { map.removeLayer(marker); marker = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    map.setView([12.9346, 77.6057], 13, { animate: true });
}

// ==================== TOAST ====================

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    // Trigger show
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-remove after 3.5s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

// ==================== STEP INDICATOR ====================

function updateSteps(stepIndex) {
    dom.stepDots.forEach((dot, i) => {
        dot.classList.remove('active', 'completed');
        if (i < stepIndex) dot.classList.add('completed');
        else if (i === stepIndex) dot.classList.add('active');
    });
}

// ==================== FETCH DATA ====================

async function fetchPlaces() {
    dom.loadingIndicator.classList.remove('hidden');
    dom.errorIndicator.classList.add('hidden');
    dom.searchResults.innerHTML = '';
    dom.emptyState.classList.add('hidden');

    try {
        const response = await fetch('places.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.places = await response.json();
        dom.loadingIndicator.classList.add('hidden');
        // Show all results initially
        filterAndRender('');
    } catch (err) {
        console.error('Fetch error:', err);
        dom.loadingIndicator.classList.add('hidden');
        dom.errorIndicator.classList.remove('hidden');
    }
}

// ==================== SEARCH & FILTER ====================

/**
 * EVENT 1 — INPUT EVENT
 * Purpose: Dynamically filter destinations as the user types,
 * reducing the effort of identifying the correct destination.
 */
function filterAndRender(query) {
    const q = query.trim().toLowerCase();

    if (q === '') {
        state.filteredPlaces = [...state.places];
    } else {
        state.filteredPlaces = state.places.filter((p) =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.address.toLowerCase().includes(q)
        );
    }

    renderResults(state.filteredPlaces, q);
}

function renderResults(places, query) {
    dom.searchResults.innerHTML = '';
    dom.emptyState.classList.add('hidden');

    if (places.length === 0) {
        dom.emptyState.classList.remove('hidden');
        return;
    }

    // Separate primary from related/other
    const primary = places.filter((p) => p.type === 'primary');
    const related = places.filter((p) => p.type === 'related');
    const other = places.filter((p) => p.type === 'other');

    // Smart sort: if query matches name more closely, move to top
    const sortByRelevance = (arr) => {
        if (!query) return arr;
        return [...arr].sort((a, b) => {
            const aIdx = a.name.toLowerCase().indexOf(query);
            const bIdx = b.name.toLowerCase().indexOf(query);
            return aIdx - bIdx;
        });
    };

    if (primary.length > 0) {
        const heading = document.createElement('p');
        heading.className = 'text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2 mt-1 px-1';
        heading.textContent = 'Best Match';
        dom.searchResults.appendChild(heading);
        sortByRelevance(primary).forEach((p) => dom.searchResults.appendChild(createResultCard(p, true)));
    }

    if (related.length > 0) {
        const heading = document.createElement('p');
        heading.className = 'text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 px-1';
        heading.textContent = 'Other Related Places';
        dom.searchResults.appendChild(heading);
        sortByRelevance(related).forEach((p) => dom.searchResults.appendChild(createResultCard(p, false)));
    }

    if (other.length > 0) {
        const heading = document.createElement('p');
        heading.className = 'text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4 px-1';
        heading.textContent = 'Nearby Landmarks';
        dom.searchResults.appendChild(heading);
        sortByRelevance(other).forEach((p) => dom.searchResults.appendChild(createResultCard(p, false)));
    }
}

function createResultCard(place, isPrimary) {
    const card = document.createElement('div');
    card.className = `result-card rounded-lg p-4 mb-2 cursor-pointer bg-white border ${isPrimary ? 'primary-result border-blue-200' : 'related-result border-gray-200'
        }`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Select ${place.name}`);

    card.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold ${isPrimary ? 'text-base text-gray-900' : 'text-sm text-gray-700'}">
          ${highlightMatch(place.name, dom.searchInput.value)}
        </h3>
        <p class="text-xs ${isPrimary ? 'text-blue-600' : 'text-gray-500'} mt-0.5">${place.category}</p>
        <p class="text-xs text-gray-500 mt-0.5">${place.address}</p>
        ${isPrimary ? `<p class="text-xs text-gray-400 mt-1">${place.description}</p>` : ''}
      </div>
      <button
        class="select-place-btn flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg
               ${isPrimary
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        } transition"
        data-id="${place.id}"
        aria-label="Select ${place.name} as destination"
      >
        Select
      </button>
    </div>
  `;

    // Clicking the whole card also selects
    card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('select-place-btn')) {
            selectDestination(place.id);
        }
    });

    // Keyboard support
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectDestination(place.id);
        }
    });

    return card;
}

function highlightMatch(text, query) {
    if (!query || !query.trim()) return text;
    const regex = new RegExp(`(${escapeRegex(query.trim())})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 rounded px-0.5">$1</mark>');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==================== DESTINATION SELECTION ====================

/**
 * EVENT 2 — CLICK EVENT
 * Purpose: Make destination selection and next-action explicit,
 * directly addressing the benchmark's lack of clear CTAs.
 */
function selectDestination(id) {
    const place = state.places.find((p) => p.id === id);
    if (!place) return;

    state.selectedPlace = place;
    state.currentStep = 'confirmed';

    // Update confirmation panel
    dom.confirmName.textContent = place.name;
    dom.confirmAddress.textContent = place.address;
    dom.confirmCategory.textContent = place.category;

    // Show confirm panel, hide search results
    dom.searchResults.classList.add('hidden');
    dom.emptyState.classList.add('hidden');
    dom.confirmPanel.classList.remove('hidden');
    dom.confirmPanel.classList.add('fade-in');

    // Hide route panels
    dom.routePanel.classList.add('hidden');
    dom.summaryPanel.classList.add('hidden');

    // Update map
    setMarker(place.lat, place.lng, place.name);

    // Update steps
    updateSteps(1);

    // Toast
    showToast(`✓ ${place.name} selected.`, 'success');
}

function changeDestination() {
    state.selectedPlace = null;
    state.travelMode = null;
    state.routeReady = false;
    state.currentStep = 'search';

    // Reset UI
    dom.confirmPanel.classList.add('hidden');
    dom.routePanel.classList.add('hidden');
    dom.summaryPanel.classList.add('hidden');
    dom.searchResults.classList.remove('hidden');

    // Clear mode buttons
    dom.modeBtns.forEach((b) => b.classList.remove('active'));

    // Clear validation errors
    clearErrors();

    // Reset map
    resetMap();

    // Re-render results
    filterAndRender(dom.searchInput.value);

    updateSteps(0);
    showToast('Destination selection cleared.', 'info');
}

function showRouteForm() {
    if (!state.selectedPlace) return;

    state.currentStep = 'directions';

    // Pre-fill "To"
    dom.toInput.value = state.selectedPlace.name;

    // Show route panel
    dom.routePanel.classList.remove('hidden');
    dom.routePanel.classList.add('fade-in');
    dom.summaryPanel.classList.add('hidden');

    // Hide confirm's "Get Directions" — keep confirmation visible
    updateSteps(2);
    showToast('Set your starting location and travel mode.', 'info');
}

// ==================== ROUTE FORM ====================

/**
 * EVENT 3 — SUBMIT EVENT
 * Purpose: Validate route inputs and provide inline error feedback,
 * preventing incomplete route requests.
 */
function handleRouteSubmit(e) {
    e.preventDefault();
    clearErrors();

    let valid = true;

    // Validate From
    if (!dom.fromInput.value.trim()) {
        showFieldError(dom.fromError, 'Please enter a starting location.');
        valid = false;
    }

    // Validate To
    if (!dom.toInput.value.trim()) {
        showFieldError(dom.toError, 'Please select a destination first.');
        valid = false;
    }

    // Validate Mode
    if (!state.travelMode) {
        showFieldError(dom.modeError, 'Please select a travel mode.');
        valid = false;
    }

    if (!valid) {
        showToast('⚠ Please fill in all required fields.', 'error');
        return;
    }

    // Generate route summary with mock data
    generateRoute();
}

function showFieldError(el, msg) {
    el.textContent = '⚠ ' + msg;
    el.classList.add('visible');
}

function clearErrors() {
    [dom.fromError, dom.toError, dom.modeError].forEach((el) => {
        el.textContent = '';
        el.classList.remove('visible');
    });
}

function generateRoute() {
    const place = state.selectedPlace;
    if (!place) return;

    const modeData = getModeData(place, state.travelMode);

    state.routeReady = true;
    state.currentStep = 'route';

    // Fill summary
    dom.summaryDest.textContent = place.name;
    dom.summaryFrom.textContent = dom.fromInput.value.trim();
    dom.summaryMode.textContent = capitalize(state.travelMode);
    dom.summaryDist.textContent = `${modeData.distance} km`;
    dom.summaryTime.textContent = `${modeData.time} min`;

    // Show summary
    dom.summaryPanel.classList.remove('hidden');
    dom.summaryPanel.classList.add('fade-in');

    // Draw route on map (mock: from a nearby point to destination)
    const fromLat = place.lat + 0.015;
    const fromLng = place.lng - 0.01;
    drawRoute(fromLat, fromLng, place.lat, place.lng);

    updateSteps(3);
    showToast('✓ Route prepared successfully.', 'success');
}

function getModeData(place, mode) {
    switch (mode) {
        case 'walking':
            return { distance: place.distance_walk, time: place.time_walk };
        case 'driving':
            return { distance: place.distance_drive, time: place.time_drive };
        case 'cycling':
            return { distance: place.distance_cycle, time: place.time_cycle };
        default:
            return { distance: place.distance_walk, time: place.time_walk };
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==================== TRAVEL MODE ====================

/**
 * EVENT 4 — CHANGE EVENT (via click on mode buttons)
 * Purpose: Update route estimates dynamically when the user
 * switches between Walking, Driving, and Cycling.
 */
function handleModeChange(mode) {
    state.travelMode = mode;

    // Update active button
    dom.modeBtns.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Clear mode error if present
    dom.modeError.textContent = '';
    dom.modeError.classList.remove('visible');

    // If route summary is visible, update it
    if (state.routeReady && state.selectedPlace) {
        const modeData = getModeData(state.selectedPlace, mode);
        dom.summaryMode.textContent = capitalize(mode);
        dom.summaryDist.textContent = `${modeData.distance} km`;
        dom.summaryTime.textContent = `${modeData.time} min`;
        showToast(`Updated to ${capitalize(mode)} mode.`, 'info');
    }
}

// ==================== FULL RESET ====================

function resetWorkflow() {
    state.selectedPlace = null;
    state.travelMode = null;
    state.routeReady = false;
    state.currentStep = 'search';

    // Clear input
    dom.searchInput.value = '';

    // Reset all panels
    dom.confirmPanel.classList.add('hidden');
    dom.routePanel.classList.add('hidden');
    dom.summaryPanel.classList.add('hidden');
    dom.searchResults.classList.remove('hidden');

    // Clear mode
    dom.modeBtns.forEach((b) => b.classList.remove('active'));

    // Clear form
    dom.fromInput.value = '';
    dom.toInput.value = '';
    clearErrors();

    // Reset map
    resetMap();

    // Re-render all places
    filterAndRender('');

    updateSteps(0);
    showToast('Workflow reset. Start a new search.', 'info');
}

// ==================== EVENT LISTENERS ====================

function bindEvents() {
    // EVENT 1: input — live search
    dom.searchInput.addEventListener('input', (e) => {
        filterAndRender(e.target.value);
    });

    // EVENT 2: click — select buttons (delegated)
    dom.searchResults.addEventListener('click', (e) => {
        const btn = e.target.closest('.select-place-btn');
        if (btn) {
            selectDestination(Number(btn.dataset.id));
        }
    });

    // Click — Change Destination
    dom.changeDstBtn.addEventListener('click', changeDestination);

    // Click — Get Directions
    dom.getDirBtn.addEventListener('click', showRouteForm);

    // Click — Retry fetch
    dom.retryBtn.addEventListener('click', fetchPlaces);

    // Click — Start Navigation (prototype acknowledgment)
    dom.startNavBtn.addEventListener('click', () => {
        showToast('Navigation started (prototype simulation).', 'success');
    });

    // Click — New Search
    dom.newSearchBtn.addEventListener('click', resetWorkflow);

    // EVENT 3: submit — route form
    dom.routeForm.addEventListener('submit', handleRouteSubmit);

    // EVENT 4: change — travel mode buttons
    dom.modeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            handleModeChange(btn.dataset.mode);
        });
    });
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    bindEvents();
    fetchPlaces();
    updateSteps(0);
});
