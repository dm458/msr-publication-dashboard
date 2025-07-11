let currentPage = 1;
const publicationsPerPage = 10;
let allPublications = [];
let selectedFilters = new Set();
let lastRefreshDate = null;

function formatDate(date) {
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric'
    };
    return new Date(date).toLocaleDateString('en-US', options);
}

// TF-IDF related variables
let tfidf = null;
let tfidfMatrix = null;
let processedAbstracts = [];

function processText(text) {
    return text.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/) // Split into words
        .filter(word => word.length > 2) // Remove short words
        .join(' ');
}

function calculateTFIDF() {
    // Create processed abstracts array
    processedAbstracts = allPublications.map(pub => processText(pub.abstract));
    
    // Calculate term frequencies
    const wordCounts = new Map();
    const documentFrequencies = new Map();
    
    // Process each abstract
    processedAbstracts.forEach(abstract => {
        const words = new Set(abstract.split(' '));
        words.forEach(word => {
            documentFrequencies.set(word, (documentFrequencies.get(word) || 0) + 1);
        });
    });
    
    // Calculate IDF
    const numDocs = processedAbstracts.length;
    const idf = new Map();
    documentFrequencies.forEach((freq, word) => {
        idf.set(word, Math.log(numDocs / freq));
    });
    
    return { documentFrequencies, idf };
}

function calculateSimilarity(abstract1, abstract2) {
    const words1 = processText(abstract1).split(' ');
    const words2 = processText(abstract2).split(' ');
    
    // Create word frequency maps
    const freq1 = new Map();
    const freq2 = new Map();
    
    words1.forEach(word => freq1.set(word, (freq1.get(word) || 0) + 1));
    words2.forEach(word => freq2.set(word, (freq2.get(word) || 0) + 1));
    
    // Get all unique words
    const allWords = new Set([...words1, ...words2]);
    
    // Calculate vectors
    const vector1 = [];
    const vector2 = [];
    
    allWords.forEach(word => {
        vector1.push(freq1.get(word) || 0);
        vector2.push(freq2.get(word) || 0);
    });
    
    // Calculate cosine similarity
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    
    for(let i = 0; i < vector1.length; i++) {
        dotProduct += vector1[i] * vector2[i];
        mag1 += vector1[i] * vector1[i];
        mag2 += vector2[i] * vector2[i];
    }
    
    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);
    
    return dotProduct / (mag1 * mag2) || 0;
}

function getSimilarityClass(score) {
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
}

async function loadPublications() {
    try {
        console.log('Attempting to fetch publications...');
        const response = await fetch('./publications.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log('Got response, parsing JSON...');
        const data = await response.json();
        console.log('Parsed JSON:', data);
        if (!data.publications) {
            throw new Error('No publications found in JSON');
        }
        allPublications = data.publications;
        lastRefreshDate = data.lastUpdated || data.publications[0].dateScraped || new Date().toISOString();
        setupFilters();
        updatePagination();
        displayPublications();
    } catch (error) {
        console.error('Error loading publications:', error);
        document.getElementById('publications').innerHTML = 
            `<p class="error">Error loading publications: ${error.message}</p>`;
    }
}

function setupFilters() {
    const select = document.getElementById('researchAreasSelect');
    const areas = new Set();
    
    // Collect all unique research areas
    allPublications.forEach(pub => {
        pub.research_areas.forEach(area => areas.add(area));
    });

    // Sort areas alphabetically
    const sortedAreas = Array.from(areas).sort();
    
    // Create options for each area
    sortedAreas.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        select.appendChild(option);
    });
    
    // Add event listeners
    select.addEventListener('change', () => {
        selectedFilters = new Set(
            Array.from(select.selectedOptions).map(option => option.value)
        );
        currentPage = 1;
        updatePagination();
        displayPublications();
    });
    
    // Setup clear filters button
    document.getElementById('clearFilters').addEventListener('click', () => {
        // Clear research areas
        select.selectedIndex = -1;
        selectedFilters.clear();
        
        // Clear search inputs
        document.getElementById('titleSearch').value = '';
        document.getElementById('authorSearch').value = '';
        
        currentPage = 1;
        updatePagination();
        displayPublications();
    });

    // Setup search input handlers
    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    const handleSearch = debounce(() => {
        currentPage = 1;
        updatePagination();
        displayPublications();
    }, 300);

    document.getElementById('titleSearch').addEventListener('input', handleSearch);
    document.getElementById('authorSearch').addEventListener('input', handleSearch);
}

function getFilteredPublications() {
    const titleSearch = document.getElementById('titleSearch').value.toLowerCase();
    const authorSearch = document.getElementById('authorSearch').value.toLowerCase();

    return allPublications.filter(pub => {
        // Check research areas filter
        const matchesAreas = selectedFilters.size === 0 || 
            pub.research_areas.some(area => selectedFilters.has(area));
        
        // Check title filter
        const matchesTitle = !titleSearch || 
            pub.title.toLowerCase().includes(titleSearch);
        
        // Check author filter
        const matchesAuthor = !authorSearch || 
            pub.authors.some(author => 
                author.toLowerCase().includes(authorSearch)
            );
        
        return matchesAreas && matchesTitle && matchesAuthor;
    });
}

function updatePagination() {
    const filteredPublications = getFilteredPublications();
    const totalPages = Math.ceil(filteredPublications.length / publicationsPerPage);
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

function displayPublications() {
    const container = document.getElementById('publications');
    container.innerHTML = '';
    
    const filteredPublications = getFilteredPublications();
    const startIndex = (currentPage - 1) * publicationsPerPage;
    const endIndex = startIndex + publicationsPerPage;
    const pagePublications = filteredPublications.slice(startIndex, endIndex);
    
    // Update results summary
    const resultsSummary = document.getElementById('resultsSummary');
    const totalResults = filteredPublications.length;
    const showingStart = totalResults === 0 ? 0 : startIndex + 1;
    const showingEnd = Math.min(endIndex, totalResults);
    resultsSummary.innerHTML = `Showing <strong>${showingStart}-${showingEnd}</strong> of <strong>${totalResults}</strong> publications${
        totalResults < allPublications.length ? ` (filtered from ${allPublications.length} total)` : ''
    } (Last updated ${formatDate(lastRefreshDate)})`;
    
    const compareText = document.getElementById('compareAbstract').value;
    
    pagePublications.forEach(pub => {
        const card = document.createElement('div');
        card.className = 'publication-card';
        
        // Add similarity score and explanation if it exists
        if (pub.similarityScore !== undefined) {
            const score = Math.round(pub.similarityScore * 100);
            const similarityClass = getSimilarityClass(pub.similarityScore);
            
            const scoreDiv = document.createElement('div');
            scoreDiv.className = `similarity-score ${similarityClass}`;
            scoreDiv.textContent = `${score}% similar`;
            card.appendChild(scoreDiv);
        }
        
        const title = document.createElement('h2');
        const titleLink = document.createElement('a');
        titleLink.href = pub.url;
        titleLink.target = '_blank';
        titleLink.textContent = pub.title;
        title.appendChild(titleLink);
        
        const authors = document.createElement('div');
        authors.className = 'authors';
        authors.textContent = pub.authors.join(', ');
        
        const areas = document.createElement('div');
        areas.className = 'research-areas';
        pub.research_areas.forEach(area => {
            const areaSpan = document.createElement('span');
            areaSpan.className = 'research-area';
            areaSpan.textContent = area;
            areas.appendChild(areaSpan);
        });
        
        const date = document.createElement('div');
        date.className = 'date';
        date.textContent = pub.publication_date;
        
        const valueSummary = document.createElement('div');
        valueSummary.className = 'value-summary';
        valueSummary.textContent = generateValueSummary(pub.abstract);

        const abstract = document.createElement('div');
        abstract.className = 'abstract';
        abstract.textContent = pub.abstract;
        
        card.appendChild(title);
        card.appendChild(authors);
        card.appendChild(areas);
        card.appendChild(date);
        card.appendChild(valueSummary);
        card.appendChild(abstract);
        
        container.appendChild(card);
    });
}

function goToNextPage() {
    const totalPages = Math.ceil(getFilteredPublications().length / publicationsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        displayPublications();
        updatePagination();
    }
}

function goToPrevPage() {
    if (currentPage > 1) {
        currentPage--;
        displayPublications();
        updatePagination();
    }
}

function clearComparison() {
    // Clear the textarea
    document.getElementById('compareAbstract').value = '';
    
    // Remove similarity scores from publications
    allPublications.forEach(pub => {
        delete pub.similarityScore;
    });
    
    // Reset to first page and update display
    currentPage = 1;
    updatePagination();
    displayPublications();
}

function generateValueSummary(abstract) {
    // Common research outcome patterns
    const patterns = {
        improves: /improv(e|es|ed|ing)|enhance[ds]?|better|faster|more efficient|boost(s|ed|ing)?/i,
        solves: /solv(e|es|ed|ing)|address(es|ed|ing)?|tackle[ds]?|fix(es|ed|ing)?/i,
        introduces: /introduce[ds]?|present[ds]?|propose[ds]?|new|novel/i,
        enables: /enable[ds]?|allow[ds]?|help[ds]?|support[ds]?|empower[ds]?/i,
        discovers: /discover(s|ed|y)|found|reveal(s|ed)|show(s|ed)|demonstrate[ds]?/i
    };

    // Extract key phrases that indicate impact
    const sentences = abstract.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    const firstSentence = sentences[0];
    const lastSentence = sentences[sentences.length - 1];

    // Try to identify the main value proposition
    let valueSummary = "";
    
    // Look for explicit value statements in the last sentence (often contains conclusions/impact)
    if (lastSentence && (
        lastSentence.match(patterns.improves) ||
        lastSentence.match(patterns.enables) ||
        lastSentence.match(/results show|demonstrate|prove/i))) {
        valueSummary = lastSentence;
    }
    // If no clear value in last sentence, check the first sentence (often contains purpose)
    else if (firstSentence && (
        firstSentence.match(patterns.solves) ||
        firstSentence.match(patterns.introduces) ||
        firstSentence.match(patterns.enables))) {
        valueSummary = firstSentence;
    }
    // If still no clear value statement, analyze the full abstract
    else {
        // Find any sentence that clearly states value
        for (let sentence of sentences) {
            if (sentence.match(/benefit|impact|advantage|improve|enable|help|better|advance/i)) {
                valueSummary = sentence;
                break;
            }
        }
    }

    // If we found nothing specific, use the first sentence as fallback
    if (!valueSummary) {
        valueSummary = firstSentence;
    }

    // Clean up and simplify the chosen sentence
    valueSummary = valueSummary
        .replace(/\([^)]*\)/g, '') // Remove parentheticals
        .replace(/\[[^\]]*\]/g, '') // Remove brackets
        .replace(/(?:i\.e\.|e\.g\.,?|etc\.|et al\.),?\s*/g, '') // Remove academic phrases
        .replace(/significantly|substantially|notably|remarkably/g, 'greatly') // Simplify emphasis words
        .replace(/\b(?:proposed|novel|new)\s+/g, '') // Remove common academic adjectives
        .replace(/\b(?:framework|methodology|approach|technique)\b/g, 'method') // Simplify technical terms
        .trim();

    // Add a prefix if it doesn't start with "This"
    if (!valueSummary.toLowerCase().startsWith('this')) {
        valueSummary = 'This research ' + valueSummary.toLowerCase();
    }

    return valueSummary;
}

document.addEventListener('DOMContentLoaded', () => {
    loadPublications();
    
    document.getElementById('compareButton').addEventListener('click', () => {
        const compareText = document.getElementById('compareAbstract').value;
        if (!compareText.trim()) {
            alert('Please enter an abstract to compare');
            return;
        }
        
        // Calculate similarity scores
        allPublications.forEach(pub => {
            pub.similarityScore = calculateSimilarity(compareText, pub.abstract);
        });
        
        // Sort publications by similarity score
        allPublications.sort((a, b) => b.similarityScore - a.similarityScore);
        
        // Reset to first page and update display
        currentPage = 1;
        updatePagination();
        displayPublications();
    });
    
    document.getElementById('clearCompareButton').addEventListener('click', clearComparison);
    
    document.getElementById('nextPage').addEventListener('click', goToNextPage);
    document.getElementById('prevPage').addEventListener('click', goToPrevPage);
});
