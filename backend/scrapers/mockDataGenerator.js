/**
 * MOCK DATA GENERATOR - For testing without API credentials
 * 
 * Use this to test the entire agent flow
 * No API keys needed, just realistic test data
 * 
 * Later: Replace with real APIs when you have Amadeus credentials
 */

class MockTravelDataGenerator {
  // ============================================================
  // MOCK FLIGHT DATA
  // ============================================================
  static generateFlights(origin, destination, departureDate, groupSize) {
    const flightData = {
      'MAA-BLR': [
        { airline: 'IndiGo', code: '6E', duration: '1h 15m', stops: 0 },
        { airline: 'Air India', code: 'AI', duration: '1h 20m', stops: 0 },
        { airline: 'SpiceJet', code: 'SG', duration: '1h 30m', stops: 0 }
      ],
      'MAA-DEL': [
        { airline: 'IndiGo', code: '6E', duration: '2h 45m', stops: 0 },
        { airline: 'Air India', code: 'AI', duration: '2h 50m', stops: 0 }
      ],
      'BLR-MYS': [
        { airline: 'IndiGo', code: '6E', duration: '45m', stops: 0 }
      ]
    };

    const route = flightData[`${origin}-${destination}`] || [
      { airline: 'IndiGo', code: '6E', duration: '2h', stops: 1 }
    ];

    return route.map((flight, idx) => {
      const basePrice = 2500 + (idx * 500);
      const groupDiscount = this.calculateGroupDiscount(groupSize);
      const totalPrice = basePrice * groupSize;

      return {
        id: `flight-${idx}`,
        airline: flight.airline,
        code: flight.code,
        departure: `${departureDate}T${14 + idx}:00:00`,
        arrival: `${departureDate}T${16 + idx}:00:00`,
        duration: flight.duration,
        stops: flight.stops,
        basePrice: basePrice,
        totalPrice: totalPrice,
        priceAfterDiscount: totalPrice * (1 - groupDiscount / 100),
        pricePerPerson: (totalPrice * (1 - groupDiscount / 100)) / groupSize,
        groupSize: groupSize,
        groupDiscount: groupDiscount,
        seats: 45 + Math.random() * 40,
        baggage: '15kg',
        meals: true,
        amenities: ['WiFi', 'Seat Selection', 'Aisle Seat']
      };
    });
  }

  // ============================================================
  // MOCK HOTEL DATA
  // ============================================================
  static generateHotels(destination, checkIn, nights, groupSize) {
    const hotelData = {
      'BLR': [
        { name: '🏨 The Grand Bangalore', stars: 5, roomType: 'Deluxe' },
        { name: '🏨 Budget Plaza', stars: 3, roomType: 'Standard' },
        { name: '🏨 Comfort Inn', stars: 4, roomType: 'AC Room' }
      ],
      'DEL': [
        { name: '🏨 Taj Delhi', stars: 5, roomType: 'Suite' },
        { name: '🏨 New Delhi Hotel', stars: 3, roomType: 'Double' }
      ],
      'MYS': [
        { name: '🏨 Palace Hotel', stars: 4, roomType: 'Royal Room' },
        { name: '🏨 Budget Stay', stars: 2, roomType: 'Basic' }
      ]
    };

    const hotels = hotelData[destination] || [
      { name: '🏨 City Hotel', stars: 4, roomType: 'Standard' }
    ];

    const roomsNeeded = Math.ceil(groupSize / 2);

    return hotels.map((hotel, idx) => {
      const basePricePerRoom = 2000 + (hotel.stars * 1000) + (idx * 500);
      const totalPrice = basePricePerRoom * roomsNeeded * nights;
      const groupDiscount = this.calculateGroupDiscount(groupSize);

      return {
        id: `hotel-${idx}`,
        name: hotel.name,
        stars: hotel.stars,
        roomType: hotel.roomType,
        checkIn: checkIn,
        checkOut: this.addDays(checkIn, nights),
        nights: nights,
        roomsNeeded: roomsNeeded,
        groupSize: groupSize,
        basePricePerRoom: basePricePerRoom,
        totalPrice: totalPrice,
        priceAfterDiscount: totalPrice * (1 - groupDiscount / 100),
        pricePerPerson: (totalPrice * (1 - groupDiscount / 100)) / groupSize,
        groupDiscount: groupDiscount,
        amenities: ['WiFi', 'Breakfast', 'Parking', 'Pool'],
        cancellation: 'Free until 24hrs before',
        rating: hotel.stars
      };
    });
  }

  // ============================================================
  // MOCK BUS DATA (Currently from test - will be RedBus API)
  // ============================================================
  static generateBuses(origin, destination, departureDate, groupSize) {
    const busData = {
      'MAA-BLR': [
        { operator: '🚌 RedBus Premium', type: 'AC Sleeper', duration: '5h' },
        { operator: '🚌 GoIbibo Express', type: 'AC Semi-Sleeper', duration: '5h 30m' },
        { operator: '🚌 Yatra Travel', type: 'Non-AC', duration: '6h' }
      ],
      'MAA-VJA': [
        { operator: '🚌 RedBus', type: 'AC Sleeper', duration: '4h' },
        { operator: '🚌 Vijaya Travels', type: 'AC', duration: '4h 30m' }
      ],
      'BLR-MYS': [
        { operator: '🚌 SRS Travels', type: 'AC', duration: '2h 30m' }
      ]
    };

    const buses = busData[`${origin}-${destination}`] || [
      { operator: '🚌 Regional Transport', type: 'AC', duration: '4h' }
    ];

    return buses.map((bus, idx) => {
      const departureHour = 14 + idx;
      const basePrice = 350 + (idx * 100);
      const totalPrice = basePrice * groupSize;
      const groupDiscount = this.calculateGroupDiscount(groupSize);

      return {
        id: `bus-${idx}`,
        operator: bus.operator,
        type: bus.type,
        departure: `${departureDate.split('T')[0]}T${String(departureHour).padStart(2, '0')}:00:00`,
        duration: bus.duration,
        basePrice: basePrice,
        totalPrice: totalPrice,
        priceAfterDiscount: totalPrice * (1 - groupDiscount / 100),
        pricePerPerson: (totalPrice * (1 - groupDiscount / 100)) / groupSize,
        groupSize: groupSize,
        groupDiscount: groupDiscount,
        seatsAvailable: 42,
        seatsRequired: groupSize,
        canSitTogether: groupSize <= 4,
        amenities: ['WiFi', 'Charging', 'Washroom', 'Snacks'],
        rating: 4.2
      };
    });
  }

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================
  static calculateGroupDiscount(groupSize) {
    if (groupSize >= 11) return 15;
    if (groupSize >= 7) return 10;
    if (groupSize >= 5) return 5;
    return 0;
  }

  static addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  // ============================================================
  // GENERATE COMPLETE TRIP OPTIONS
  // ============================================================
  static generateCompleteTrips(origin, destination, departureDate, nights, groupSize) {
    const flights = this.generateFlights(origin, destination, departureDate, groupSize);
    const hotels = this.generateHotels(destination, departureDate, nights, groupSize);
    const buses = this.generateBuses(origin, destination, departureDate, groupSize);

    // Create combinations (top flight + top hotel + top bus)
    return {
      flights: flights.slice(0, 3),
      hotels: hotels.slice(0, 3),
      buses: buses.slice(0, 3),
      recommendations: [
        {
          name: 'Budget Trip',
          flight: flights[flights.length - 1], // Cheapest
          hotel: hotels[hotels.length - 1],
          bus: buses[buses.length - 1],
          totalCost: (flights[flights.length - 1].priceAfterDiscount + 
                     hotels[hotels.length - 1].priceAfterDiscount + 
                     buses[buses.length - 1].priceAfterDiscount),
          perPerson: ((flights[flights.length - 1].priceAfterDiscount + 
                      hotels[hotels.length - 1].priceAfterDiscount + 
                      buses[buses.length - 1].priceAfterDiscount) / groupSize).toFixed(0)
        },
        {
          name: 'Premium Trip',
          flight: flights[0], // Best flight
          hotel: hotels[0],   // Best hotel
          bus: buses[0],      // Best bus
          totalCost: (flights[0].priceAfterDiscount + 
                     hotels[0].priceAfterDiscount + 
                     buses[0].priceAfterDiscount),
          perPerson: ((flights[0].priceAfterDiscount + 
                      hotels[0].priceAfterDiscount + 
                      buses[0].priceAfterDiscount) / groupSize).toFixed(0)
        }
      ]
    };
  }
}

module.exports = MockTravelDataGenerator;

// ============================================================
// USAGE EXAMPLE
// ============================================================

/*
const MockData = require('./mockDataGenerator');

// Generate test data
const tripData = MockData.generateCompleteTrips(
  'MAA',           // origin
  'BLR',           // destination
  '2026-04-15',    // departure date
  3,               // nights
  6                // group size
);

console.log('Flights:', tripData.flights);
console.log('Hotels:', tripData.hotels);
console.log('Buses:', tripData.buses);
console.log('Recommendations:', tripData.recommendations);

// Access specific values
const budgetTrip = tripData.recommendations[0];
console.log(`Budget trip: ₹${budgetTrip.totalCost} total, ₹${budgetTrip.perPerson} per person`);
*/
