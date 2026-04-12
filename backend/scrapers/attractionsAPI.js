/**
 * Attractions API - Uses Wikipedia API + OpenStreetMap Nominatim
 * Both are COMPLETELY FREE with no authentication needed
 */

const axios = require('axios');

/**
 * Get attractions from Wikipedia (free API)
 * @param {string} destination - City name
 * @returns {Promise<Array>} Attractions list
 */
async function getAttractionsFromWikipedia(destination) {
  try {
    console.log(`🔍 Fetching attractions from Wikipedia API for ${destination}`);
    
    // Search Wikipedia for the city
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${destination}&prop=extracts&explaintext=true&format=json`;
    
    const response = await axios.get(searchUrl);
    const pages = response.data.query.pages;
    const page = Object.values(pages)[0];
    
    if (!page || !page.extract) {
      console.warn(`⚠️ Wikipedia page not found for ${destination}`);
      return generateGenericAttractions(destination);
    }
    
    // Extract text about attractions from Wikipedia excerpt
    const text = page.extract;
    const attractions = [];
    
    // Parse common attraction keywords
    const keywords = [
      'temple', 'mosque', 'church', 'fort', 'palace', 'monument',
      'park', 'garden', 'museum', 'beach', 'lake', 'river',
      'waterfall', 'dam', 'cave', 'heritage site'
    ];
    
    keywords.forEach(keyword => {
      if (text.toLowerCase().includes(keyword)) {
        // Find sentences mentioning this keyword
        const sentences = text.split('.');
        const relevant = sentences.find(s => 
          s.toLowerCase().includes(keyword)
        );
        
        if (relevant && attractions.length < 5) {
          attractions.push({
            id: `a-wiki-${attractions.length + 1}`,
            name: keyword.charAt(0).toUpperCase() + keyword.slice(1) + ' in ' + destination,
            type: keyword.charAt(0).toUpperCase() + keyword.slice(1),
            description: relevant.trim().substring(0, 150) + '...',
            location: destination,
            rating: 4.3 + Math.random() * 0.4,
            reviews: Math.floor(Math.random() * 2000) + 100,
            entry_fee: 'Check locally',
            best_time: '09:00 AM - 05:00 PM',
            duration: '1-2 hours',
            distance_from_city: 'Varies',
            source: 'Wikipedia'
          });
        }
      }
    });
    
    console.log(`✅ Found ${attractions.length} attractions from Wikipedia`);
    return attractions.length > 0 ? attractions : generateGenericAttractions(destination);
    
  } catch (error) {
    console.error('❌ Wikipedia API error:', error.message);
    return generateGenericAttractions(destination);
  }
}

/**
 * Get nearby places from OpenStreetMap using Nominatim (FREE)
 * @param {string} destination - City name
 * @param {string} placeType - Type of place (restaurant, museum, park, etc.)
 * @returns {Promise<Array>} Places list
 */
async function getPlacesFromOpenStreetMap(destination, placeType = null) {
  try {
    console.log(`🔍 Fetching ${placeType || 'attractions'} from OpenStreetMap for ${destination}`);
    
    // Get coordinates for the destination
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${destination}&format=json&limit=1`;
    const geoResponse = await axios.get(geoUrl, {
      headers: { 'User-Agent': 'TravelPlannerAI' }
    });
    
    if (!geoResponse.data || geoResponse.data.length === 0) {
      return generateGenericAttractions(destination);
    }
    
    const { lat, lon } = geoResponse.data[0];
    
    // Use Overpass API to get nearby amenities
    const overpassQuery = `
      [bbox:${lat - 0.1},${lon - 0.1},${lat + 0.1},${lon + 0.1}];
      (
        node[tourism=attraction];
        node[tourism=museum];
        node[leisure=park];
        node[natural=water];
        way[tourism=attraction];
        way[tourism=museum];
        way[leisure=park];
      );
      out center;
    `;
    
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const overpassResponse = await axios.post(overpassUrl, overpassQuery, {
      headers: { 'Content-Type': 'text/plain' }
    });
    
    const elements = overpassResponse.data.elements || [];
    const attractions = elements.slice(0, 8).map((el, idx) => ({
      id: `a-osm-${idx + 1}`,
      name: el.tags?.name || el.tags?.tourism || 'Unnamed Attraction',
      type: el.tags?.tourism || el.tags?.leisure || 'Attraction',
      description: `Located in ${destination}`,
      location: destination,
      rating: 4.0 + Math.random() * 0.7,
      reviews: Math.floor(Math.random() * 500) + 50,
      entry_fee: 'Check locally',
      best_time: '09:00 AM - 05:00 PM',
      duration: '1-2 hours',
      distance_from_city: 'Varies',
      source: 'OpenStreetMap',
      coordinates: {
        lat: el.lat || el.center?.lat,
        lon: el.lon || el.center?.lon
      }
    }));
    
    console.log(`✅ Found ${attractions.length} places from OpenStreetMap`);
    return attractions.length > 0 ? attractions : generateGenericAttractions(destination);
    
  } catch (error) {
    console.error('❌ OpenStreetMap API error:', error.message);
    return generateGenericAttractions(destination);
  }
}

/**
 * Get attractions combining multiple sources
 */
async function getAttractions(destination) {
  try {
    // Try to get from multiple sources and combine
    const [wikipediaAttractions, osmPlaces] = await Promise.all([
      getAttractionsFromWikipedia(destination),
      getPlacesFromOpenStreetMap(destination)
    ]);
    
    // Combine and deduplicate
    const combined = [...wikipediaAttractions, ...osmPlaces];
    const unique = combined.filter((attraction, index, self) =>
      index === self.findIndex(a => 
        a.name.toLowerCase() === attraction.name.toLowerCase()
      )
    );
    
    return unique.sort((a, b) => b.rating - a.rating);
    
  } catch (error) {
    console.error('❌ Error getting attractions:', error.message);
    return generateGenericAttractions(destination);
  }
}

function generateGenericAttractions(destination) {
  return [
    {
      id: 'a-gen-001',
      name: `${destination} City Temple`,
      type: 'Religious Site',
      description: 'Historic temple in the city center',
      location: destination,
      rating: 4.3,
      reviews: 500,
      entry_fee: 'Free',
      best_time: '06:00 AM - 06:00 PM',
      duration: '1-2 hours',
      distance_from_city: '2 km',
      source: 'Generic'
    },
    {
      id: 'a-gen-002',
      name: `${destination} Park`,
      type: 'Park',
      description: 'Beautiful garden park for relaxation',
      location: destination,
      rating: 4.2,
      reviews: 300,
      entry_fee: '₹5-10',
      best_time: '06:00 AM - 06:00 PM',
      duration: '1-2 hours',
      distance_from_city: '2 km',
      source: 'Generic'
    }
  ];
}

module.exports = {
  getAttractionsFromWikipedia,
  getPlacesFromOpenStreetMap,
  getAttractions
};
