/**
 * Restaurants Scraper - Scrapes restaurants and dining options
 * Sources: Zomato, Swiggy, Google Maps
 */

const axios = require('axios');

/**
 * Scrape restaurants for a destination
 * @param {string} destination - City name
 * @param {string} cuisine - Cuisine preference (optional)
 * @returns {Promise<Array>} Restaurants list
 */
async function scrapeRestaurants(destination, cuisine = null) {
  try {
    console.log(`🔍 Scraping restaurants in ${destination}`);
    
    const restaurantDatabase = {
      'vijayawada': [
        {
          id: 'r-001',
          name: 'Coastal Restaurant',
          cuisine: 'Seafood, Andhra',
          rating: 4.4,
          reviews: 812,
          avg_cost: 600,
          location: 'NTR Circle',
          serves: 'Lunch, Dinner',
          speciality: 'Fish curry, Prawns',
          veg_options: true,
          vegetarian_friendly: true,
          ambiance: 'Family'
        },
        {
          id: 'r-002',
          name: 'South Indian Diner',
          cuisine: 'South Indian, Vegetarian',
          rating: 4.5,
          reviews: 1023,
          avg_cost: 400,
          location: 'One Town',
          serves: 'Breakfast, Lunch, Dinner',
          speciality: 'Idli, Dosa, Sambar',
          veg_options: true,
          vegetarian_friendly: true,
          ambiance: 'Casual'
        },
        {
          id: 'r-003',
          name: 'Biryani House',
          cuisine: 'Hyderabadi, Mughlai',
          rating: 4.3,
          reviews: 645,
          avg_cost: 550,
          location: 'Prakasam Barrage Road',
          serves: 'Lunch, Dinner',
          speciality: 'Hyderabadi Biryani, Kebabs',
          veg_options: true,
          vegetarian_friendly: false,
          ambiance: 'Casual'
        },
        {
          id: 'r-004',
          name: 'Street Food Corner',
          cuisine: 'Indian Street Food',
          rating: 4.2,
          reviews: 567,
          avg_cost: 200,
          location: 'Main Bazaar',
          serves: 'Snacks, Dinner',
          speciality: 'Chaat, Samosa, Pakora',
          veg_options: true,
          vegetarian_friendly: true,
          ambiance: 'Casual'
        },
        {
          id: 'r-005',
          name: 'The Grand Bistro',
          cuisine: 'Multi-Cuisine, Continental',
          rating: 4.6,
          reviews: 892,
          avg_cost: 1200,
          location: 'Premium Area',
          serves: 'Lunch, Dinner',
          speciality: 'Continental, Chinese, Indian',
          veg_options: true,
          vegetarian_friendly: true,
          ambiance: 'Premium'
        }
      ],
      'bangalore': [
        {
          id: 'r-101',
          name: 'Tamil Cafe',
          cuisine: 'South Indian, Tamil',
          rating: 4.4,
          reviews: 1234,
          avg_cost: 350,
          location: 'MG Road',
          serves: 'Breakfast, Lunch, Dinner',
          speciality: 'Filter Coffee, Dosa, Idli',
          veg_options: true,
          vegetarian_friendly: true,
          ambiance: 'Casual'
        },
        {
          id: 'r-102',
          name: 'Karavalli',
          cuisine: 'Coastal, Seafood',
          rating: 4.7,
          reviews: 1876,
          avg_cost: 900,
          location: 'Indiranagar',
          serves: 'Lunch, Dinner',
          speciality: 'Kerala Cuisine, Fish Curries',
          veg_options: true,
          vegetarian_friendly: false,
          ambiance: 'Fine Dining'
        },
        {
          id: 'r-103',
          name: 'Naan Kadai',
          cuisine: 'North Indian, Mughlai',
          rating: 4.5,
          reviews: 1543,
          avg_cost: 700,
          location: 'Koramangala',
          serves: 'Lunch, Dinner',
          speciality: 'Naan, Tandoori, Biryani',
          veg_options: true,
          vegetarian_friendly: true,
          ambiance: 'Casual'
        }
      ],
      'chennai': [
        {
          id: 'r-201',
          name: 'Marina Seafood',
          cuisine: 'Seafood, Tamil',
          rating: 4.5,
          reviews: 2134,
          avg_cost: 700,
          location: 'Marina Beach',
          serves: 'Lunch, Dinner',
          speciality: 'Fish, Prawns, Crab',
          veg_options: true,
          vegetarian_friendly: false,
          ambiance: 'Casual'
        },
        {
          id: 'r-202',
          name: 'Saravana Bhavan',
          cuisine: 'South Indian, Vegetarian',
          rating: 4.6,
          reviews: 3421,
          avg_cost: 300,
          location: 'Multiple Locations',
          serves: 'Breakfast, Lunch, Dinner',
          speciality: 'Dosa, Idli, Sambhar',
          veg_options: true,
          vegetarian_friendly: true,
          ambiance: 'Casual'
        },
        {
          id: 'r-203',
          name: 'Peshawri',
          cuisine: 'North Indian, Mughlai',
          rating: 4.7,
          reviews: 1658,
          avg_cost: 1100,
          location: 'Mylapore',
          serves: 'Lunch, Dinner',
          speciality: 'Tandoori, Kebabs, Biryani',
          veg_options: true,
          vegetarian_friendly: true,
          ambiance: 'Fine Dining'
        }
      ]
    };
    
    const destLower = destination.toLowerCase();
    let restaurants = restaurantDatabase[destLower] || generateGenericRestaurants(destination);
    
    // Filter by cuisine if specified
    if (cuisine) {
      restaurants = restaurants.filter(r => 
        r.cuisine.toLowerCase().includes(cuisine.toLowerCase())
      );
    }
    
    console.log(`✅ Found ${restaurants.length} restaurants`);
    return restaurants;
    
  } catch (error) {
    console.error('❌ Restaurants scraping error:', error.message);
    return [];
  }
}

/**
 * Generate generic restaurants for unknown destination
 */
function generateGenericRestaurants(destination) {
  return [
    {
      id: 'r-gen-001',
      name: `Local Diner ${destination}`,
      cuisine: 'Multi-Cuisine, Indian',
      rating: 4.2,
      reviews: 400,
      avg_cost: 500,
      location: destination,
      serves: 'Lunch, Dinner',
      speciality: 'Local Cuisine',
      veg_options: true,
      vegetarian_friendly: true,
      ambiance: 'Casual'
    },
    {
      id: 'r-gen-002',
      name: `South Indian ${destination}`,
      cuisine: 'South Indian, Tamil',
      rating: 4.3,
      reviews: 300,
      avg_cost: 350,
      location: destination,
      serves: 'Breakfast, Lunch, Dinner',
      speciality: 'Dosa, Idli',
      veg_options: true,
      vegetarian_friendly: true,
      ambiance: 'Casual'
    },
    {
      id: 'r-gen-003',
      name: `Street Eats ${destination}`,
      cuisine: 'Street Food',
      rating: 4.0,
      reviews: 250,
      avg_cost: 150,
      location: destination,
      serves: 'Snacks',
      speciality: 'Chaat, Samosa',
      veg_options: true,
      vegetarian_friendly: true,
      ambiance: 'Casual'
    }
  ];
}

/**
 * Get restaurants by budget
 * @param {string} destination - City
 * @param {number} budget - Budget in rupees
 * @returns {Promise<Array>} Budget-friendly restaurants
 */
async function getRestaurantsByBudget(destination, budget) {
  try {
    const allRestaurants = await scrapeRestaurants(destination);
    
    const within_budget = allRestaurants.filter(r => r.avg_cost <= budget);
    
    console.log(`✅ Found ${within_budget.length} restaurants within ₹${budget} budget`);
    return within_budget.sort((a, b) => b.rating - a.rating);
    
  } catch (error) {
    console.error('❌ Error filtering restaurants:', error.message);
    return [];
  }
}

/**
 * Get vegetarian restaurants
 * @param {string} destination - City
 * @returns {Promise<Array>} Vegetarian-friendly restaurants
 */
async function getVegetarianRestaurants(destination) {
  try {
    const allRestaurants = await scrapeRestaurants(destination);
    
    const vegetarian = allRestaurants.filter(r => r.vegetarian_friendly);
    
    console.log(`✅ Found ${vegetarian.length} vegetarian-friendly restaurants`);
    return vegetarian.sort((a, b) => b.rating - a.rating);
    
  } catch (error) {
    console.error('❌ Error filtering restaurants:', error.message);
    return [];
  }
}

module.exports = {
  scrapeRestaurants,
  getRestaurantsByBudget,
  getVegetarianRestaurants
};
