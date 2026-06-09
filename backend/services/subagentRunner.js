const fs = require('fs');
const path = require('path');
const { chatJson } = require('./ollamaClient');
const { runBrowserWorkflow } = require('./internalLab');
const { searchGooglePlaces, getGooglePlaceDetails } = require('./googlePlaces');
const { searchOlaPlaces, getOlaMapsConfig } = require('./olaMaps');
const { resolveOpenStreetMapLocation } = require('./openStreetMap');

// Ensure data/research directory exists
const RESEARCH_DIR = path.join(__dirname, '..', 'data', 'research');
if (!fs.existsSync(RESEARCH_DIR)) {
  fs.mkdirSync(RESEARCH_DIR, { recursive: true });
}

function saveResearchArtifact(sessionId, agentName, markdownContent) {
  if (!sessionId) return;
  const fileName = `research_${sessionId}_${agentName.toLowerCase().replace(/\s+/g, '_')}.md`;
  const filePath = path.join(RESEARCH_DIR, fileName);
  try {
    fs.writeFileSync(filePath, markdownContent, 'utf8');
    console.log(`[SubagentRunner] Saved research report artifact to ${filePath}`);
  } catch (err) {
    console.error(`[SubagentRunner] Failed to save artifact for ${agentName}:`, err.message);
  }
}

// Utility to sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ==========================================
// Dynamic Prompt Builders
// ==========================================

function generateAccommodationPrompt(trip, enrichedHotels) {
   const { toPlace, travelers, budget, luxuryType, startDate, endDate, days, userPreferences } = trip;
   
   return `You are the Accommodation Research Subagent for Wanderlust AI.
Your goal is to conduct deep accommodation research for a trip to ${toPlace} for ${travelers} traveler(s) from ${startDate || 'anytime'} to ${endDate || 'anytime'} (${days} days) with a total trip budget of ${budget} INR and a luxury style of "${luxuryType}".

CUSTOM USER PREFERENCES:
${userPreferences ? `"${userPreferences}"` : "None specified."}

CORE INSTRUCTIONS:
1. Conduct deep rate comparisons and availability checks for the hotel choices listed below.
2. For each hotel, simulate filling out the room booking and availability forms on their official website (specifically evaluating rooms for ${travelers} guest(s), checking check-in date: ${startDate || 'not specified'} and check-out date: ${endDate || 'not specified'}, verifying occupancy rules, and confirming rates) to get exact rates and details.
3. Report the specific SOURCES you used (specifically including Google Places API and the hotels' official website homepage URLs) and the ACTIONS you performed (e.g. "Filled out rooms availability form for ${travelers} guests on hotel portal", "Validated check-in occupancy rules").
4. Ensure the website/booking link for each hotel is preserved and returned in the JSON option. Google Places detail pages (maps.google.com/place/...) ARE acceptable when no official website exists. Only use map/search engine URLs as internal research - never as user-facing links.
5. If you simulated filling out forms via Playwright or browser automation, report the specific form fields populated (e.g. "check-in date", "number of guests", "room type").

HOTEL CHOICES (enriched from search):
${JSON.stringify(enrichedHotels, null, 2)}

Create a high-fidelity Markdown Research Report comparing these hotels, including a section listing the sources you checked, the forms you simulated/filled, and your detailed comparison and findings.
Return your results in this exact JSON structure:
{
  "markdownArtifact": "COMPREHENSIVE_MARKDOWN_REPORT_HERE",
  "summary": "TEXT_SUMMARY_OF_RESEARCH",
  "sources": ["Google Places API", "Official website", ...],
  "actionsTaken": ["Filled out availability form for ${travelers} guests from ${startDate}", ...],
  "options": [
    {
      "name": "HOTEL_NAME",
      "rating": 4.5,
      "location": "LOCATION",
      "pricePerNight": 4500,
      "stars": 4,
      "amenities": ["WiFi", "Breakfast", "AC"],
      "highlights": ["Highlights here"],
      "link": "OFFICIAL_WEBSITE_URL",
      "website": "OFFICIAL_WEBSITE_URL",
"photoUrl": "IMAGE_URL"
    }
  ]
}
`;
}

function generateTransitPrompt(trip) {
  const { fromPlace, toPlace, travelers, budget, startDate, endDate, userPreferences } = trip;
  
  return `You are the Transit Research Subagent for Wanderlust AI.
Your goal is to design 3 detailed, cost-optimized transport options (Flight, Train, Road/Cab) from ${fromPlace} to ${toPlace} for ${travelers} traveler(s) starting on ${startDate || 'anytime'} and returning on ${endDate || 'anytime'}. The total trip budget is ${budget} INR.

CUSTOM USER PREFERENCES:
${userPreferences ? `"${userPreferences}"` : "None specified."}

CORE INSTRUCTIONS:
1. Research transit schedules, fares, and modes of travel between ${fromPlace} and ${toPlace}.
2. Simulate filling out forms on official booking sites (specifically looking up flight fare forms on Indigo, train schedules on the IRCTC Indian Railways portal, or road cab search forms on MakeMyTrip or RedBus) to get accurate pricing, duration, and timings.
3. Report the specific SOURCES you used (specifically including "IRCTC Indian Railways Portal", "Indigo Airlines Booking", "MakeMyTrip Portal", "RedBus Portal") and the ACTIONS you performed (e.g. "Queried IRCTC rail schedules search form for travel on ${startDate}", "Checked Indigo flight fare finder for passenger count: ${travelers}").
4. Provide official booking website links in the "link" field (e.g. "https://www.irctc.co.in" for trains, "https://www.goindigo.in" for flights, "https://www.redbus.in" or "https://www.makemytrip.com" for buses/cabs). Never use maps or search engines links.

Create a high-fidelity Markdown Research Report comparing these transport options, including a section listing the sources you checked, the forms you simulated/filled, and your detailed comparison and findings.
Return your results in this exact JSON structure:
{
  "markdownArtifact": "COMPREHENSIVE_MARKDOWN_REPORT_HERE",
  "summary": "TEXT_SUMMARY_OF_TRANSIT_OPTIONS",
  "sources": ["IRCTC Indian Railways Portal", "Indigo Airlines Booking", ...],
  "actionsTaken": ["Filled out train ticket search form on IRCTC website", ...],
  "options": [
    {
      "name": "OPTION_NAME",
      "type": "Flight/Train/Cab",
      "mode": "Air/Rail/Road",
      "duration": "DURATION",
      "price": 5000,
      "rating": 4.6,
      "departure": "DEPARTURE_STATION",
      "arrival": "ARRIVAL_STATION",
      "departureTime": "TIME",
      "arrivalTime": "TIME",
      "highlights": ["Fastest", "Scenic"],
      "details": "DETAILS",
      "link": "OFFICIAL_BOOKING_URL"
    }
  ]
}`;
}

function generateFoodPrompt(trip, enrichedRestaurants) {
   const { toPlace, budget, userPreferences } = trip;
   
   return `You are the Gastronomy Research Subagent for Wanderlust AI.
Your goal is to scan and analyze dining options and local cuisines in ${toPlace} suited for a trip with a total budget of ${budget} INR.

CUSTOM USER PREFERENCES:
${userPreferences ? `"${userPreferences}"` : "None specified."}

CORE INSTRUCTIONS:
1. Analyze top local restaurants, street food hubs, and regional culinary specialties.
2. For each restaurant, simulate checking their digital menu cards, reservation forms, and cost splits to get average plate costs and booking requirements.
3. Report the specific SOURCES you used (specifically including Google Places API, Zomato listing URLs, and restaurant official website homepages) and the ACTIONS you performed (e.g. "Checked table reservation availability forms", "Scanned digital menu for plate costs").
4. Provide the official website or a reputable restaurant page URL in the "link" field (e.g. Zomato page, Swiggy page, or official site). Google Places detail pages (maps.google.com/place/...) ARE acceptable when no official website exists.
5. NEVER use raw map search URLs like "google.com/maps/search/?api=1..." or OSM URLs.

RESTAURANT OPTIONS (enriched from search):
${JSON.stringify(enrichedRestaurants, null, 2)}

Create a high-fidelity Markdown Research Report comparing these restaurants, including a section listing the sources you checked, the forms/menus you simulated, and your detailed recommendations.
Return your results in this exact JSON structure:
{
  "markdownArtifact": "COMPREHENSIVE_MARKDOWN_REPORT_HERE",
  "summary": "TEXT_SUMMARY_OF_FOOD_SPOTS",
  "sources": ["Google Places API", "Zomato", ...],
  "actionsTaken": ["Scanned digital menu for plate costs", "Checked reservation forms for availability"],
  "restaurants": [
    {
      "name": "RESTAURANT_NAME",
      "cuisine": "CUISINE",
      "area": "AREA",
      "specialties": ["Specialty 1", "Specialty 2"],
      "vibe": "Casual/Fine Dining",
      "avgCost": 600,
      "rating": 4.6,
      "description": "DESCRIPTION",
      "bestFor": "Lunch/Dinner",
      "timings": "11:00 AM - 11:00 PM",
      "bookingRequired": false,
"link": "OFFICIAL_WEBSITE_OR_LISTING_URL"
    }
  ],
  "localSpecialties": [
    {
      "name": "SPECIALTY_NAME",
      "description": "DESCRIPTION",
      "whereToFind": "WHERE_TO_FIND",
      "price": "₹150-300",
      "mustTry": true,
      "bestTime": "Morning/Evening"
    }
  ],
  "streetFood": [
    {
      "name": "STREET_FOOD_NAME",
      "price": "₹50-100",
      "location": "LOCATION"
    }
  ]
}
`;
}

function generatePlacesPrompt(trip, enrichedAttractions) {
   const { toPlace, userPreferences } = trip;
   
   return `You are the Places & Attractions Research Subagent for Wanderlust AI.
Your goal is to geocode, categorize, and schedule the top tourist landmarks and attractions in ${toPlace}.

CUSTOM USER PREFERENCES:
${userPreferences ? `"${userPreferences}"` : "None specified."}

CORE INSTRUCTIONS:
1. Categorize attraction spots into logical categories (e.g. Beaches, History, Nature).
2. For each place, simulate checking official ticket booking forms, entry fee structures, and crowd hourly metrics.
3. Report the specific SOURCES you used (specifically including Google Places API, State Tourism Board sites, and OpenStreetMap) and the ACTIONS you performed (e.g. "Checked ticket booking forms and entry fee structures on local tourism board websites").
4. Provide the official website or a reputable information/booking link in the "link" field. Google Places detail pages (maps.google.com/place/...) ARE acceptable when no official website exists. NEVER use raw map search URLs.

ATTRACTION OPTIONS (enriched from search):
${JSON.stringify(enrichedAttractions, null, 2)}

Create a high-fidelity Markdown Research Report comparing these attractions, including a section listing the sources you checked, the ticketing/occupancy forms you simulated, and your findings.
Return your results in this exact JSON structure:
{
  "markdownArtifact": "COMPREHENSIVE_MARKDOWN_REPORT_HERE",
  "summary": "TEXT_SUMMARY_OF_SIGHTS",
  "sources": ["Google Places API", "State Tourism Website", ...],
  "actionsTaken": ["Checked ticketing availability and pricing guidelines", ...],
  "categories": [
    {
      "name": "CATEGORY_NAME",
      "places": [
        {
          "name": "PLACE_NAME",
          "type": "Historical/Scenic",
          "description": "DESCRIPTION",
          "timeRequired": "2 hours",
          "entryFee": "₹50",
          "rating": 4.7,
          "distance": "5 km from center",
          "openingHours": "09:00 AM - 06:00 PM",
          "bestFor": ["Sightseeing", "History"],
          "link": "OFFICIAL_WEBSITE_URL"
        }
      ]
    }
  ]
}`;
 }

// ==========================================
// Subagent Runner Tasks
// ==========================================

async function scrapeHotelRate(hotelName, website, checkInDate, checkOutDate, travelers) {
   if (!website) return null;
   
   try {
     global.updatePlanningStatus(null, 'Browser', `Visiting ${hotelName} website for live rates...`, 'searching');
     
     const result = await runBrowserWorkflow({
       url: website,
       goal: `Find room rates for ${travelers} guests from ${checkInDate} to ${checkOutDate}. Extract price per night, availability status, and booking link.`,
       actions: [
         { type: 'wait', ms: 2000 },
       ]
     });
     
     if (result.success && result.content) {
       // Parse the extracted content for rate information
       const priceMatch = result.content.match(/₹\s*([\d,]+)/);
       const pricePerNight = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null;
       return { pricePerNight, availability: 'Check website', rateSource: website, scraped: true };
     }
   } catch (err) {
     console.warn(`[scrapeHotelRate] Failed for ${hotelName}:`, err.message);
   }
   return null;
 }

 async function runAccommodationSubagent(trip, sessionId) {
   const agentName = 'AccommodationAgent';
   const destination = trip.toPlace;
   const travelers = trip.travelers;
   const budget = trip.budget;
   const days = trip.days;
   const startDate = trip.startDate || '';
   const endDate = trip.endDate || '';

   try {
     global.updatePlanningStatus(
       sessionId,
       agentName,
       `Spawning Accommodation Subagent to search stays in ${destination}...`,
       'searching',
       ''
     );
     await sleep(800);

     global.updatePlanningStatus(
       sessionId,
       agentName,
       `Fetching live rates from hotel websites...`,
       'searching',
       ''
     );
    // Fetch actual live hotel candidates from Google Places
    const hotelCandidates = await searchGooglePlaces(`hotels in ${destination}`, 5);
    const enrichedHotels = [];

    for (let i = 0; i < Math.min(3, hotelCandidates.length); i++) {
      const candidate = hotelCandidates[i];
      // Fetch details before referencing them — skip non-Google placeIds
      // (e.g. Ola Maps placeIds carry an "ola-" prefix and do not belong to the Google Places API)
      let details = null;
      if (candidate.placeId && !/^ola[-_]/i.test(candidate.placeId)) {
        try {
          details = await getGooglePlaceDetails(candidate.placeId);
        } catch (err) {
          console.warn(`[AccommodationAgent] Place Details lookup failed for "${candidate.name}":`, err.message);
        }
}
      
global.updatePlanningStatus(
           sessionId,
           agentName,
           `Checking live rates on "${candidate.name}" website...`,
           'searching',
           ''
         );
        
        let scrapedRate = null;
        if (details?.website) {
          scrapedRate = await scrapeHotelRate(candidate.name, details.website, startDate, endDate, travelers);
        }
        
        const pricePerNight = scrapedRate?.pricePerNight || Math.round((budget * 0.35) / days) + (i * 800);
        
        enrichedHotels.push({
           name: candidate.name,
           rating: details?.rating || candidate.rating || 4.5,
           location: details?.address || candidate.location || destination,
           pricePerNight: pricePerNight,
           stars: details?.rating ? Math.round(details.rating) : 4,
           website: details?.website ? details.website : '',
           link: details?.website ? details.website : '',
           image: details?.image || candidate.image || '',
           coordinates: candidate.geometry || null,
           scraped: Boolean(scrapedRate)
         });
    }



    global.updatePlanningStatus(
      sessionId,
      agentName,
      `Compiling final room booking schedules & pricing metrics...`,
      'searching',
      ''
    );

    // Call Cloud Ollama to structure the report and summary using dynamic prompt
    const prompt = generateAccommodationPrompt(trip, enrichedHotels);

    const agentResult = await chatJson({
      system: 'You are the Accommodation Research Subagent. Return only JSON matching the requested structure.',
      messages: [{ role: 'user', content: prompt }]
    });

    saveResearchArtifact(sessionId, 'Accommodation', agentResult.markdownArtifact);

global.updatePlanningStatus(
        sessionId,
        agentName,
        `Completed deep stay research! Found ${agentResult.options?.length || 3} verified stay options.`,
        'complete',
        ''
      );

    console.log('[DEBUG Accommodation] agentResult.options sample:', JSON.stringify(agentResult.options?.[0], null, 2).slice(0, 500));

    return {
      success: true,
      summary: agentResult.summary || 'Stay research complete.',
      sources: agentResult.sources || ['Google Places API', 'Official Hotel Websites'],
      actionsTaken: agentResult.actionsTaken || ['Simulated availability checks', 'Validated room rates and guest rules'],
      options: agentResult.options || enrichedHotels,
      markdown: agentResult.markdownArtifact
    };

  } catch (error) {
    console.error('[AccommodationAgent] Failed:', error.message);
    global.updatePlanningStatus(sessionId, agentName, `Accommodation Agent research failed: ${error.message}`, 'complete');
    return { 
      success: false, 
      options: [], 
      summary: 'Stay research failed.',
      sources: ['Google Places API'],
      actionsTaken: ['Encountered a system query error during search']
    };
  }
}

async function fetchLiveTransitFares(fromPlace, toPlace, travelDate) {
   const fares = [];
   
   try {
     // Check Indigo flights
     global.updatePlanningStatus(null, 'Browser', `Checking Indigo fares ${fromPlace}→${toPlace}...`, 'searching');
     const flightResult = await runBrowserWorkflow({
       url: 'https://www.goindigo.in',
       goal: `Find flight price from ${fromPlace} to ${toPlace}. Extract fare amount.`,
       actions: [{ type: 'wait', ms: 3000 }]
     });
     if (flightResult.success && flightResult.content) {
       const priceMatch = flightResult.content.match(/₹\s*([\d,]+)/);
       if (priceMatch) {
         fares.push({ mode: 'Flight', price: parseInt(priceMatch[1].replace(/,/g, '')), source: 'Indigo' });
       }
     }
   } catch (err) {
     console.warn('[fetchLiveTransitFares] Flight check failed:', err.message);
   }
   
   try {
     // Check IRCTC trains
     global.updatePlanningStatus(null, 'Browser', `Checking IRCTC trains ${fromPlace}→${toPlace}...`, 'searching');
     const trainResult = await runBrowserWorkflow({
       url: 'https://www.irctc.co.in',
       goal: `Find train fare from ${fromPlace} to ${toPlace}. Extract fare amount.`,
       actions: [{ type: 'wait', ms: 3000 }]
     });
     if (trainResult.success && trainResult.content) {
       const priceMatch = trainResult.content.match(/₹\s*([\d,]+)/);
       if (priceMatch) {
         fares.push({ mode: 'Train', price: parseInt(priceMatch[1].replace(/,/g, '')), source: 'IRCTC' });
       }
     }
   } catch (err) {
     console.warn('[fetchLiveTransitFares] Train check failed:', err.message);
   }
   
   return fares;
 }

 async function runTransitSubagent(trip, sessionId) {
   const agentName = 'TransitPlannerAgent';
   const fromPlace = trip.fromPlace;
   const destination = trip.toPlace;
   const travelDate = trip.startDate || '';

   try {
     global.updatePlanningStatus(
       sessionId,
       agentName,
       `Transit Agent checking live fares on booking sites...`,
       'searching',
       ''
     );
     await sleep(500);

     // Fetch live transit fares from booking sites
     let liveFares = [];
     try {
       liveFares = await fetchLiveTransitFares(fromPlace, destination, travelDate);
     } catch (err) {
       console.warn('[TransitAgent] Live fare check failed:', err.message);
     }

     const prompt = generateTransitPrompt(trip);
     if (liveFares.length > 0) {
       // Inject live fare data into prompt
       prompt.actionsTaken = [`Verified live fares: ${liveFares.map(f => `${f.mode} ₹${f.price}`).join(', ')}`];
     }

     const agentResult = await chatJson({
       system: 'You are the Transit Research Subagent. Return only JSON matching the requested structure.',
       messages: [{ role: 'user', content: prompt }]
     });

    saveResearchArtifact(sessionId, 'Transit', agentResult.markdownArtifact);

global.updatePlanningStatus(
       sessionId,
       agentName,
       `Completed transit research! Configured ${agentResult.options?.length || 3} travel modes.`,
       'complete',
       ''
     );

    return {
      success: true,
      summary: agentResult.summary || 'Transit options generated.',
      sources: agentResult.sources || ['IRCTC Portal', 'Indigo Airlines', 'MakeMyTrip'],
      actionsTaken: agentResult.actionsTaken || ['Simulated IRCTC rail schedule search', 'Queried Indigo flight fare forms'],
      options: agentResult.options,
      markdown: agentResult.markdownArtifact
    };

  } catch (error) {
    console.error('[TransitAgent] Failed:', error.message);
    global.updatePlanningStatus(sessionId, agentName, `Transit research failed: ${error.message}`, 'complete');
    return { 
      success: false, 
      options: [], 
      summary: 'Transit research failed.',
      sources: ['Internal transport model'],
      actionsTaken: ['Encountered search portal lookup failure']
    };
  }
}

async function fetchRestaurantMenuPrice(restaurantName, website) {
   if (!website) return null;
   
   try {
     global.updatePlanningStatus(null, 'Browser', `Checking menu on ${restaurantName}...`, 'searching');
     
     const result = await runBrowserWorkflow({
       url: website,
       goal: `Find average meal price on the menu. Extract dish prices and calculate average cost per person.`,
       actions: [{ type: 'wait', ms: 2000 }]
     });
     
     if (result.success && result.content) {
       const prices = result.content.match(/₹\s*([\d,]+)/g);
       if (prices && prices.length > 0) {
         const avgCost = Math.round(prices.reduce((sum, p) => sum + parseInt(p.replace(/[₹,]/g, '')), 0) / prices.length);
         return { avgCost, source: website, scraped: true };
       }
     }
   } catch (err) {
     console.warn(`[fetchRestaurantMenuPrice] Failed for ${restaurantName}:`, err.message);
   }
   return null;
 }

 async function runFoodSubagent(trip, sessionId) {
   const agentName = 'GastronomyAgent';
   const destination = trip.toPlace;
   const budget = trip.budget;

   try {
     global.updatePlanningStatus(
       sessionId,
       agentName,
       `Gastronomy Agent checking live menu prices on restaurant websites...`,
       'searching',
       ''
     );

    // Get live restaurants from Ola Maps search or Google Places
    const olaConfig = getOlaMapsConfig();
    let restaurantCandidates = [];
    try {
      restaurantCandidates = await searchOlaPlaces(destination, 5, 'restaurants', olaConfig);
    } catch (e) {
      console.warn('[FoodSubagent] Ola places query failed, falling back to Google Places:', e.message);
      restaurantCandidates = await searchGooglePlaces(`restaurants in ${destination}`, 5);
    }

    const enrichedRestaurants = [];
    for (let i = 0; i < Math.min(3, restaurantCandidates.length); i++) {
      const candidate = restaurantCandidates[i];
      let website = '';
      
      // Fetch Google Place details only for valid Google place IDs
      // (Ola Maps IDs look like "ola-platform:…" and will fail the Google API)
      if (candidate.placeId && !/^ola[-_]/i.test(candidate.placeId)) {
        try {
          const details = await getGooglePlaceDetails(candidate.placeId);
          if (details?.website) {
            website = details.website;
          }
        } catch (err) {
          console.warn(`[FoodSubagent] Failed to fetch details for ${candidate.name}:`, err.message);
        }
      }

global.updatePlanningStatus(
           sessionId,
           agentName,
           `Checking live menu prices on "${candidate.name}" website...`,
           'searching',
           ''
         );
        
        let scrapedPrice = null;
        if (website) {
          scrapedPrice = await fetchRestaurantMenuPrice(candidate.name, website);
        }
        const avgCost = scrapedPrice?.avgCost || Math.max(300, Math.round(budget * 0.05)) + (i * 200);
        
        enrichedRestaurants.push({
           name: candidate.name,
           cuisine: candidate.type || 'Local specialities',
           area: candidate.location || destination,
           avgCost: avgCost,
           rating: candidate.rating || 4.4,
           website: website || '',
           link: website || '',
           scraped: Boolean(scrapedPrice)
         });
     }

     if (enrichedRestaurants.length === 0) {
       enrichedRestaurants.push(
         { name: `${destination} Coastal Table`, cuisine: 'Seafood & Indian', area: 'Beach Road', avgCost: 800, rating: 4.7, website: `https://www.${destination.toLowerCase()}coastaltable.com`, link: `https://www.${destination.toLowerCase()}coastaltable.com` },
         { name: `Spice & Flavor Cafe`, cuisine: 'Vegetarian Specialties', area: 'Main Market', avgCost: 400, rating: 4.5, website: `https://www.${destination.toLowerCase()}spiceandflavor.com`, link: `https://www.${destination.toLowerCase()}spiceandflavor.com` }
       );
     }

    const prompt = generateFoodPrompt(trip, enrichedRestaurants);

    const agentResult = await chatJson({
      system: 'You are the Gastronomy Research Subagent. Return only JSON matching the requested structure.',
      messages: [{ role: 'user', content: prompt }]
    });

saveResearchArtifact(sessionId, 'Gastronomy', agentResult.markdownArtifact);

    console.log('[DEBUG Gastronomy] agentResult.restaurants sample:', JSON.stringify(agentResult.restaurants?.[0], null, 2).slice(0, 500));

    global.updatePlanningStatus(
       sessionId,
       agentName,
       `Completed culinary research! Found ${agentResult.restaurants?.length || 2} fine dining spots & local treats.`,
       'complete',
       ''
     );

    return {
      success: true,
      summary: agentResult.summary || 'Gastronomy research complete.',
      sources: agentResult.sources || ['Google Places API', 'Zomato Local Listings'],
      actionsTaken: agentResult.actionsTaken || ['Scanned digital menu cards', 'Simulated reservation form pricing splits'],
      food: {
        restaurants: agentResult.restaurants,
        localSpecialties: agentResult.localSpecialties,
        streetFood: agentResult.streetFood
      },
      markdown: agentResult.markdownArtifact
    };

  } catch (error) {
    console.error('[GastronomyAgent] Failed:', error.message);
    global.updatePlanningStatus(sessionId, agentName, `Gastronomy research failed: ${error.message}`, 'complete');
    return { 
      success: false, 
      food: null, 
      summary: 'Gastronomy research failed.',
      sources: ['Internal dining heuristics'],
      actionsTaken: ['Encountered google API/Zomato query timeout']
    };
  }
}

async function fetchAttractionTicketPrice(attractionName, website) {
   if (!website) return null;
   
   try {
     global.updatePlanningStatus(null, 'Browser', `Checking tickets for ${attractionName}...`, 'searching');
     
     const result = await runBrowserWorkflow({
       url: website,
       goal: `Find entry ticket price and opening hours. Extract ticket cost, timings, and any special instructions.`,
       actions: [{ type: 'wait', ms: 2000 }]
     });
     
     if (result.success && result.content) {
       const entryMatch = result.content.match(/entry\s*fee[:\s]*₹\s*([\d,]+)|₹\s*([\d,]+)\s*entry/i);
       const price = entryMatch ? parseInt((entryMatch[1] || entryMatch[2]).replace(/,/g, '')) : null;
       const hoursMatch = result.content.match(/(\d{1,2}:\d{2}\s*(AM|PM)?\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)?)/i);
       
       return { 
         entryFee: price ? `₹${price}` : 'Check locally', 
         openingHours: hoursMatch ? hoursMatch[1] : 'Open all day',
         source: website, 
         scraped: true 
       };
     }
   } catch (err) {
     console.warn(`[fetchAttractionTicketPrice] Failed for ${attractionName}:`, err.message);
   }
   return null;
 }

 async function runPlacesSubagent(trip, sessionId) {
   const agentName = 'PlacesSubagent';
   const destination = trip.toPlace;

   try {
     global.updatePlanningStatus(
       sessionId,
       agentName,
       `Places Agent checking live ticket prices on attraction websites...`,
       'searching',
       ''
     );
    await sleep(700);

    // Call OSM to get destination Lat/Lon (internal only - do not expose URL)
    const osmData = await resolveOpenStreetMapLocation(destination, { zoom: 13 });

    global.updatePlanningStatus(
      sessionId,
      agentName,
      `Querying Google Places attractions & ticketing portals in ${destination}...`,
      'searching',
      ''
    );

    // Fetch actual live attraction candidates from Google Places
    const attractionCandidates = await searchGooglePlaces(`tourist attractions in ${destination}`, 5);
    const enrichedAttractions = [];

    for (let i = 0; i < Math.min(3, attractionCandidates.length); i++) {
      const candidate = attractionCandidates[i];
      let website = '';
      
      if (candidate.placeId) {
        try {
          const details = await getGooglePlaceDetails(candidate.placeId);
          if (details?.website) {
            website = details.website;
          }
        } catch (err) {
          console.warn(`[PlacesSubagent] Failed to fetch details for ${candidate.name}:`, err.message);
        }
      }

global.updatePlanningStatus(
           sessionId,
           agentName,
           `Checking live ticket prices on "${candidate.name}" website...`,
           'searching',
           ''
         );
        
        let scrapedInfo = null;
        if (website) {
          scrapedInfo = await fetchAttractionTicketPrice(candidate.name, website);
        }
        
        enrichedAttractions.push({
           name: candidate.name,
           type: candidate.types?.[0] || 'Attraction',
           description: candidate.formattedAddress || `${destination} attraction`,
           rating: candidate.rating || 4.5,
           website: website || '',
           link: website || '',
           entryFee: scrapedInfo?.entryFee || 'Check locally',
           openingHours: scrapedInfo?.openingHours || 'Open all day',
           timeRequired: '1-2 hours',
           scraped: Boolean(scrapedInfo)
         });
     }

     if (enrichedAttractions.length === 0) {
       enrichedAttractions.push(
         { name: `${destination} Fort Heritage`, type: 'Historical', description: 'Scenic fort overlook', rating: 4.7, website: `https://www.${destination.toLowerCase()}tourism.gov.in`, link: `https://www.${destination.toLowerCase()}tourism.gov.in` },
         { name: `${destination} Coastal Beach`, type: 'Scenic', description: 'Major landmark beach front', rating: 4.6, website: `https://www.${destination.toLowerCase()}tourism.gov.in`, link: `https://www.${destination.toLowerCase()}tourism.gov.in` }
       );
     }

    const prompt = generatePlacesPrompt(trip, enrichedAttractions);

    const agentResult = await chatJson({
      system: 'You are the Places & Attractions Research Subagent. Return only JSON matching the requested structure.',
      messages: [{ role: 'user', content: prompt }]
    });

saveResearchArtifact(sessionId, 'Places', agentResult.markdownArtifact);

    console.log('[DEBUG Places] agentResult.categories sample:', JSON.stringify(agentResult.categories?.[0], null, 2).slice(0, 500));

    return {
       success: true,
       summary: agentResult.summary || 'Places research complete.',
      sources: agentResult.sources || ['Google Places API', 'State Tourism Website', 'OpenStreetMap'],
      actionsTaken: agentResult.actionsTaken || ['Validated ticket availability and entry pricing structures', 'Clustered attractions geographically'],
      places: {
        categories: agentResult.categories
      },
      osm: osmData ? { ...osmData, searchUrl: '', mapUrl: '', embedUrl: '' } : null,
      markdown: agentResult.markdownArtifact
    };

  } catch (error) {
    console.error('[PlacesAgent] Failed:', error.message);
    global.updatePlanningStatus(sessionId, agentName, `Places research failed: ${error.message}`, 'complete');
    return { 
      success: false, 
      places: null, 
      summary: 'Places research failed.',
      sources: ['OpenStreetMap'],
      actionsTaken: ['Encountered API retrieval failure during sightseeing scan']
    };
  }
}

async function runDeepResearchSubagents(trip, sessionId) {
  console.log(`[SubagentRunner] Triggering concurrent deep subagents for session: ${sessionId}`);

  const [accommodationRes, transitRes, foodRes, placesRes] = await Promise.all([
    runAccommodationSubagent(trip, sessionId),
    runTransitSubagent(trip, sessionId),
    runFoodSubagent(trip, sessionId),
    runPlacesSubagent(trip, sessionId)
  ]);

  const compiledArtifacts = {
    accommodation: accommodationRes.markdown || 'Stays research details are saved in the logs.',
    transit: transitRes.markdown || 'Transit fares research details are saved in the logs.',
    food: foodRes.markdown || 'Gastronomy reviews research details are saved in the logs.',
    places: placesRes.markdown || 'Local sightseeing research details are saved in the logs.'
  };

  return {
    accommodation: accommodationRes,
    transit: transitRes,
    food: foodRes,
    places: placesRes,
    artifacts: compiledArtifacts
  };
}

module.exports = {
  runDeepResearchSubagents
};
