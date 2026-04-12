import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import './styles/designSystem.css';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';

const DESTINATION_FACTS = {
  goa: [
    {
      title: 'Two-trip feel in one place',
      detail: 'Goa often works well as a split itinerary because beach time, food stops, and nightlife are all close enough for short hops.'
    },
    {
      title: 'Budget stays can still feel polished',
      detail: 'A lot of Goa plans stretch further by pairing one comfortable stay with more flexible transport and food choices.'
    },
    {
      title: 'Timing changes the vibe fast',
      detail: 'Midweek trips usually feel calmer than weekend-heavy plans, especially for beach routes and dinner reservations.'
    }
  ],
  jaipur: [
    {
      title: 'Heritage and pacing matter',
      detail: 'Jaipur plans usually work best when sightseeing is grouped geographically so the day does not feel like a transport marathon.'
    },
    {
      title: 'One slow evening helps',
      detail: 'Leaving room for a relaxed dinner or market walk gives the trip a better rhythm than packing every hour.'
    },
    {
      title: 'Photo stops are easy wins',
      detail: 'A good Jaipur itinerary often mixes a few headline monuments with one lighter local experience to keep energy up.'
    }
  ],
  manali: [
    {
      title: 'Mountain plans reward buffer time',
      detail: 'Manali itineraries benefit from a little slack because weather, road timing, and viewpoint stops can shift quickly.'
    },
    {
      title: 'Stay location changes the experience',
      detail: 'Picking a stay that matches your pace matters a lot here because the difference between a quiet and lively base is noticeable.'
    },
    {
      title: 'Comfort beats overpacking',
      detail: 'Warm layers and compact packing usually improve the trip more than trying to bring too many extras.'
    }
  ],
  kerala: [
    {
      title: 'The best plans stay slow',
      detail: 'Kerala trips feel better when they leave room for scenic transit and one or two genuinely relaxed days.'
    },
    {
      title: 'Different regions feel distinct',
      detail: 'Coastal, backwater, and hill-station stops can feel like separate mini-trips, which makes sequencing important.'
    },
    {
      title: 'Food is part of the itinerary',
      detail: 'A strong Kerala plan usually treats meals as an experience, not just a break between activities.'
    }
  ],
  singapore: [
    {
      title: 'Compact city planning pays off',
      detail: 'Singapore trips can cover a lot without long transfers, so the plan benefits from precise day-by-day grouping.'
    },
    {
      title: 'Transport is part of the efficiency',
      detail: 'Well-chosen metro or rail routing usually saves more time here than trying to improvise on the day.'
    },
    {
      title: 'Mix indoor and outdoor stops',
      detail: 'A balanced plan often alternates high-energy sightseeing with a calmer indoor stop to keep the pace pleasant.'
    }
  ],
  dubai: [
    {
      title: 'Heat-aware scheduling helps',
      detail: 'Dubai plans usually feel smoother when the most outdoor-heavy activities are placed earlier or later in the day.'
    },
    {
      title: 'Views change the whole budget feel',
      detail: 'Choosing one standout skyline or waterfront experience can make a trip feel premium without changing the entire budget.'
    },
    {
      title: 'Transit can be strategic',
      detail: 'A good route usually balances planned sightseeing with one or two efficient transport days to keep the trip from feeling rushed.'
    }
  ]
};

const DEFAULT_LOADING_FACTS = (tripMeta = {}) => {
  const destination = tripMeta?.toPlace || 'this destination';

  return [
    {
      title: `Getting a feel for ${destination}`,
      detail: `${destination} plans usually work best when the itinerary is built around a few anchor experiences, leaving enough room for relaxed exploration.`
    },
    {
      title: 'Pacing matters more than packing',
      detail: 'The strongest trip plans balance one marquee activity with slower time in between so the trip feels memorable instead of rushed.'
    },
    {
      title: 'The local rhythm shapes the day',
      detail: 'A good destination plan follows the place itself - transport, weather, food stops, and walking distance all influence how the day should flow.'
    }
  ];
};

const buildLoadingFacts = (tripMeta = {}) => {
  const destinationKey = String(tripMeta?.toPlace || '').trim().toLowerCase();
  const mappedFacts = DESTINATION_FACTS[destinationKey];

  if (mappedFacts && mappedFacts.length > 0) {
    return mappedFacts;
  }

  return DEFAULT_LOADING_FACTS(tripMeta);
};

function LoadingScreen({ error, tripMeta = {} }) {
  const [factIndex, setFactIndex] = useState(0);
  const facts = buildLoadingFacts(tripMeta);
  const destinationName = tripMeta?.toPlace || 'your destination';
  const destinationKey = String(tripMeta?.toPlace || '').trim().toLowerCase();
  const hasCuratedFacts = Boolean(DESTINATION_FACTS[destinationKey]);

  useEffect(() => {
    if (error || facts.length <= 1) {
      return undefined;
    }

    setFactIndex(0);
    const timer = window.setInterval(() => {
      setFactIndex((previous) => (previous + 1) % facts.length);
    }, 8000);

    return () => window.clearInterval(timer);
  }, [error, facts.length]);

  if (error) {
    return (
      <div className="loading-screen error-screen">
        <div className="loading-content">
          <div className="error-icon">
            <AlertCircle size={64} color="#EF4444" />
          </div>
          <p className="loading-text error-text">{error}</p>
          <p className="loading-subtext">Please check your input and try again.</p>
        </div>
      </div>
    );
  }

  const currentFact = facts[factIndex] || facts[0];

  return (
    <div className="loading-screen">
      <div className="loading-content loading-content-travel">
        <div className="spinner-container">
          <Loader2 className="spinner" size={64} />
        </div>

        <div className="loading-fact-card" key={`${tripMeta?.toPlace || 'destination'}-${factIndex}`}>
          <div className="loading-fact-title">{currentFact?.title}</div>
          <div className="loading-fact-body">{currentFact?.detail}</div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [isPlanning, setIsPlanning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [tripData, setTripData] = useState(null);
  const [error, setError] = useState(null);

  const handlePlanUpdate = (updatedPlan) => {
    if (!updatedPlan) {
      return;
    }

    setTripData((previousTripData) => {
      if (!previousTripData) {
        return previousTripData;
      }

      const summary = updatedPlan.summary || {};
      const nextTripData = {
        ...previousTripData,
        plan: updatedPlan,
      };

      if (summary.fromPlace) {
        nextTripData.fromPlace = summary.fromPlace;
      }

      if (summary.toPlace) {
        nextTripData.toPlace = summary.toPlace;
      }

      if (summary.travelers) {
        nextTripData.travelers = String(summary.travelers);
      }

      if (summary.totalBudget) {
        const normalizedBudget = String(summary.totalBudget).replace(/[^0-9]/g, '');
        if (normalizedBudget) {
          nextTripData.budget = normalizedBudget;
        }
      }

      if (updatedPlan.travelWindow?.startDate) {
        nextTripData.startDate = updatedPlan.travelWindow.startDate;
      } else if (updatedPlan.departureDate) {
        nextTripData.startDate = updatedPlan.departureDate;
      }

      if (updatedPlan.travelWindow?.endDate) {
        nextTripData.endDate = updatedPlan.travelWindow.endDate;
      } else if (updatedPlan.endDate) {
        nextTripData.endDate = updatedPlan.endDate;
      }

      return nextTripData;
    });
  };

  const handlePlanTrip = async (formData) => {
    setIsPlanning(true);
    setError(null);
    setTripData(formData);

    try {
      // Calculate number of days from dates
      const startDate = new Date(formData.startDate);
      const endDate = new Date(formData.endDate);
      const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

      const response = await fetch('/api/travel/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPlace: formData.fromPlace,
          toPlace: formData.toPlace,
          budget: formData.budget,
          luxuryType: 'semi',
          days: days,
          startDate: formData.startDate,
          endDate: formData.endDate,
          travelers: formData.travelers,
          provider: 'auto'
        })
      });

      if (response.ok) {
        const result = await response.json();
        const sessionId = `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        setTripData({ ...formData, sessionId, plan: result.data });
        setHasResults(true);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate travel plan');
      }
    } catch (err) {
      console.error('Error calling travel plan API:', err);
      setError(err.message || 'An error occurred while generating your trip plan');
      setHasResults(false);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleBackToHome = () => {
    setHasResults(false);
    setTripData(null);
    setError(null);
  };

  return (
    <div className="app-container">
      {isPlanning && <LoadingScreen error={error} tripMeta={tripData} />}
      
      {!isPlanning && !hasResults && (
        <LandingPage onPlanTrip={handlePlanTrip} />
      )}
      
      {!isPlanning && hasResults && (
        <DashboardPage
          tripData={tripData}
          onBackToHome={handleBackToHome}
          onPlanAnother={handleBackToHome}
          onPlanUpdate={handlePlanUpdate}
        />
      )}
    </div>
  );
}

export default App;
